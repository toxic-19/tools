import React, { useState, useEffect, useMemo } from 'react';
import { useMetrics, MetricsWindow } from '../hooks/useMetrics';
import { runBenchmark, BenchmarkResult, clearMetrics } from '../api';
import { RefreshIcon, ZapIcon, DatabaseIcon, PlayIcon, TrashIcon } from './Icons';

const STAGES: { key: 'embed' | 'retrieve' | 'rerank' | 'llm'; label: string; color: string; bg: string }[] = [
  { key: 'embed', label: 'Query Embedding', color: 'var(--sem-embed)', bg: 'var(--sem-embed-bg)' },
  { key: 'retrieve', label: 'Milvus 检索', color: 'var(--sem-retrieval)', bg: 'var(--sem-retrieval-bg)' },
  { key: 'rerank', label: 'Cross-Encoder Rerank', color: 'var(--sem-rerank)', bg: 'var(--sem-rerank-bg)' },
  { key: 'llm', label: 'LLM 生成', color: 'var(--sem-llm)', bg: 'var(--sem-llm-bg)' },
];

const WINDOW_OPTIONS: { value: MetricsWindow; label: string }[] = [
  { value: '1h', label: '近 1 小时' },
  { value: '24h', label: '近 24 小时' },
  { value: '7d', label: '近 7 天' },
  { value: 'all', label: '全部' },
];

// ---- 子组件：阶段柱状图（嵌入/检索/Rerank/LLM） ----
const StageBars: React.FC<{ summary: ReturnType<typeof useMetrics>['summary'] }> = ({ summary }) => {
  if (!summary) return null;
  // 找各阶段 P95 的最大值,做归一化尺度
  const maxP95 = Math.max(...STAGES.map((s) => summary[s.key].p95), 1);

  return (
    <div className="space-y-3">
      {STAGES.map((s) => {
        const data = summary[s.key];
        const avgPct = Math.min(100, (data.avg / maxP95) * 100);
        const p50Pct = Math.min(100, (data.p50 / maxP95) * 100);
        const p95Pct = Math.min(100, (data.p95 / maxP95) * 100);
        return (
          <div key={s.key}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>
                  {s.label}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                <span>P50 <span style={{ color: 'var(--text-secondary)' }}>{data.p50}ms</span></span>
                <span>Avg <span style={{ color: 'var(--text-secondary)' }}>{data.avg}ms</span></span>
                <span>P95 <span style={{ color: s.color, fontWeight: 600 }}>{data.p95}ms</span></span>
              </div>
            </div>
            <div
              className="relative h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: s.bg }}
            >
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  width: `${p95Pct}%`,
                  backgroundColor: s.color,
                  opacity: 0.25,
                }}
              />
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  width: `${avgPct}%`,
                  backgroundColor: s.color,
                  opacity: 0.55,
                }}
              />
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  width: `${p50Pct}%`,
                  backgroundColor: s.color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---- 子组件：时序图（折线 + 柱状）----
const TimeSeries: React.FC<{ series: ReturnType<typeof useMetrics>['series'] }> = ({ series }) => {
  if (!series || series.length === 0) {
    return (
      <div
        className="h-32 flex items-center justify-center text-[12px]"
        style={{ color: 'var(--text-muted)' }}
      >
        暂无时序数据（进行一些查询后会自动出现）
      </div>
    );
  }

  // SVG 折线
  const W = 600, H = 140, P = 24;
  const max = Math.max(...series.map((p) => p.total), 1);
  const xs = (i: number) => P + (i * (W - P * 2)) / Math.max(1, series.length - 1);
  const ys = (v: number) => H - P - (v / max) * (H - P * 2);
  const path = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.total).toFixed(1)}`).join(' ');
  const area = `${path} L ${xs(series.length - 1).toFixed(1)} ${(H - P).toFixed(1)} L ${xs(0).toFixed(1)} ${(H - P).toFixed(1)} Z`;

  // 桶标签(每个第 N 个展示一次,避免拥挤)
  const labelStep = Math.max(1, Math.ceil(series.length / 6));
  const buckets = series.map((p, i) => ({ ...p, idx: i, showLabel: i % labelStep === 0 || i === series.length - 1 }));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[140px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="tsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 网格线 */}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={P} x2={W - P}
            y1={P + g * (H - P * 2)} y2={P + g * (H - P * 2)}
            stroke="var(--border)" strokeWidth="1" strokeDasharray="2 3"
          />
        ))}
        <path d={area} fill="url(#tsFill)" />
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2" />
        {series.map((p, i) => (
          <circle
            key={i}
            cx={xs(i)} cy={ys(p.total)}
            r="2.5" fill="var(--primary)"
          />
        ))}
      </svg>
      <div className="flex items-center justify-between text-[10px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
        {buckets.map((b) => (
          <span key={b.idx} style={{ visibility: b.showLabel ? 'visible' : 'hidden' }}>
            {b.bucket.slice(11, 16)} <span style={{ color: 'var(--text-secondary)' }}>n={b.samples}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

// ---- 子组件：主动压测面板 ----
const BenchmarkPanel: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [question, setQuestion] = useState('什么是 RAG?');
  const [count, setCount] = useState(10);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BenchmarkResult | null>(null);

  const run = async () => {
    setRunning(true);
    setProgress(0);
    setResult(null);
    try {
      const r = await runBenchmark(question, count, (done) => setProgress(done));
      setResult(r);
      onDone();
    } catch (e) {
      // 异常时仍展示
      setResult({
        count, ok_count: 0, error_count: count, qps: 0, p50: 0, p95: 0, avg: 0, min: 0, max: 0, duration_ms: 0,
        samples: [],
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-[11px] block mb-1" style={{ color: 'var(--text-muted)' }}>测试问题</label>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={running}
            className="w-full px-3 py-2 rounded-lg text-[12.5px] outline-none transition-colors"
            style={{
              backgroundColor: 'var(--gray-50)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
            placeholder="输入测试 query"
          />
        </div>
        <div className="w-20">
          <label className="text-[11px] block mb-1" style={{ color: 'var(--text-muted)' }}>次数 N</label>
          <input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
            disabled={running}
            className="w-full px-3 py-2 rounded-lg text-[12.5px] outline-none text-center font-mono"
            style={{
              backgroundColor: 'var(--gray-50)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          />
        </div>
        <button
          onClick={run}
          disabled={running || !question.trim()}
          className="px-4 h-[36px] rounded-lg text-[12.5px] font-semibold flex items-center gap-1.5 transition-all"
          style={{
            backgroundColor: running ? 'var(--gray-200)' : 'var(--primary)',
            color: 'var(--primary-text)',
            cursor: running ? 'not-allowed' : 'pointer',
            opacity: running ? 0.6 : 1,
          }}
        >
          <PlayIcon className="w-3.5 h-3.5" />
          {running ? `跑 ${progress}/${count}` : '跑压测'}
        </button>
      </div>

      {/* 进度条 */}
      {running && (
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--gray-100)' }}
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${(progress / count) * 100}%`,
              backgroundColor: 'var(--primary)',
            }}
          />
        </div>
      )}

      {result && (
        <div
          className="rounded-lg p-3 text-[12px] font-mono"
          style={{
            backgroundColor: 'var(--gray-50)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
            <span>QPS <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{result.qps.toFixed(2)}</span></span>
            <span>Avg <span style={{ color: 'var(--text)' }}>{result.avg}ms</span></span>
            <span>P50 <span style={{ color: 'var(--text)' }}>{result.p50}ms</span></span>
            <span>P95 <span style={{ color: 'var(--text)' }}>{result.p95}ms</span></span>
            <span>Min <span style={{ color: 'var(--text-muted)' }}>{result.min}ms</span></span>
            <span>Max <span style={{ color: 'var(--text-muted)' }}>{result.max}ms</span></span>
            <span>成功 <span style={{ color: 'var(--success)' }}>{result.ok_count}</span> / 失败 <span style={{ color: result.error_count > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{result.error_count}</span></span>
            <span>总耗时 <span style={{ color: 'var(--text)' }}>{(result.duration_ms / 1000).toFixed(1)}s</span></span>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- 子组件：系统参数 ----
const SystemConfigCard: React.FC<{ config: ReturnType<typeof useMetrics>['config'] }> = ({ config }) => {
  if (!config) return null;
  return (
    <div className="space-y-2 text-[12.5px]">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <DatabaseIcon className="w-3.5 h-3.5" style={{ color: 'var(--sem-retrieval)' }} />
          <span style={{ color: 'var(--text-muted)' }}>Milvus</span>
          <span className="font-mono" style={{ color: 'var(--text)' }}>{config.milvus.host}</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--text-muted)' }}>Collection</span>
          <span className="font-mono" style={{ color: 'var(--text)' }}>{config.milvus.collection}</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--text-muted)' }}>索引</span>
          <span
            className="font-mono px-1.5 py-0.5 rounded text-[11px]"
            style={{ backgroundColor: 'var(--sem-retrieval-bg)', color: 'var(--sem-retrieval)' }}
          >
            {config.milvus.index_type} · {config.milvus.metric_type} · nlist={config.milvus.nlist}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--text-muted)' }}>检索</span>
          <span className="font-mono" style={{ color: 'var(--text)' }}>
            Top-{config.retrieval.search_top_k} → Rerank Top-{config.retrieval.rerank_top_n}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--text-muted)' }}>Embedding</span>
          <span className="font-mono truncate" title={config.models.embedding} style={{ color: 'var(--sem-embed)' }}>
            {config.models.embedding}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--text-muted)' }}>Reranker</span>
          <span className="font-mono truncate" title={config.models.reranker} style={{ color: 'var(--sem-rerank)' }}>
            {config.models.reranker}
          </span>
        </div>
        <div className="flex items-center gap-2 col-span-2">
          <span style={{ color: 'var(--text-muted)' }}>LLM</span>
          <span className="font-mono truncate" title={config.models.llm} style={{ color: 'var(--sem-llm)' }}>
            {config.models.llm}
          </span>
        </div>
      </div>
    </div>
  );
};

// ---- 主组件 ----
const MetricsPanel: React.FC = () => {
  const { summary, recent, series, config, loading, error, window, setWindow, refresh } = useMetrics();

  useEffect(() => {
    refresh(window);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window]);

  const successRate = useMemo(() => (summary ? Math.round(summary.success_rate * 100) : 0), [summary]);

  const handleClear = async () => {
    if (!globalThis.confirm('确认清空所有性能埋点数据？此操作不可恢复。')) return;
    try {
      const res = await clearMetrics();
      globalThis.alert(`已清空 ${res.deleted} 条性能埋点`);
      await refresh(window);
    } catch (e) {
      // 把完整错误打到控制台 + alert,避免「按了没反应」的错觉
      console.error('[Metrics] clear failed:', e);
      globalThis.alert(
        '清空失败: ' + (e instanceof Error ? e.message : '未知错误') +
        '\n\n如果是 404,大概率是后端没重启 —— 之前的接口/路由改动需要重启 uvicorn 才生效。'
      );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 chat-scroll">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* 顶部:标题 + 时间窗 + 操作 */}
        <div className="flex items-center gap-3">
          <h2 className="text-[16px] font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <ZapIcon className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            性能监控
          </h2>
          <div className="flex-1" />
          <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ backgroundColor: 'var(--gray-100)' }}>
            {WINDOW_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setWindow(o.value)}
                className="px-3 py-1 rounded-md text-[11.5px] font-medium transition-colors"
                style={{
                  backgroundColor: window === o.value ? 'var(--card)' : 'transparent',
                  color: window === o.value ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: window === o.value ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => refresh(window)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            title="刷新"
          >
            <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleClear}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="清空埋点"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div
            className="rounded-lg px-4 py-3 text-[12.5px]"
            style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}

        {/* 顶部 4 个核心指标卡 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: '采样数', value: summary?.samples ?? 0,
              sub: summary ? `${summary.ok_count} 成功 / ${summary.error_count} 失败` : '—',
              color: 'var(--primary)',
            },
            {
              label: '端到端 P50', value: summary ? `${summary.total.p50}ms` : '—',
              sub: summary ? `Avg ${summary.total.avg}ms` : '—',
              color: 'var(--sem-retrieval)',
            },
            {
              label: '端到端 P95', value: summary ? `${summary.total.p95}ms` : '—',
              sub: summary ? `Max ${summary.total.p95 * 1.3 | 0}ms` : '—',
              color: 'var(--sem-rerank)',
            },
            {
              label: '成功率', value: summary ? `${successRate}%` : '—',
              sub: summary && summary.samples === 0 ? '暂无数据' : '近窗口',
              color: successRate >= 99 ? 'var(--success)' : successRate >= 95 ? 'var(--warning)' : 'var(--danger)',
            },
          ].map((card) => (
            <div
              key={card.label}
              className="p-4"
              style={{
                backgroundColor: 'var(--card-style-bg, var(--card))',
                border: '1px solid var(--card-style-border, var(--border))',
                borderRadius: 'var(--card-style-radius, 12px)',
                boxShadow: 'var(--card-style-shadow, none)',
                backdropFilter: 'var(--card-style-blur, none)',
                WebkitBackdropFilter: 'var(--card-style-blur, none)',
              }}
            >
              <div className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
              <div className="text-[24px] font-bold leading-tight" style={{ color: card.color }}>{card.value}</div>
              <div className="text-[10.5px] mt-1" style={{ color: 'var(--text-muted)' }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* 阶段延迟 + 时序 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className="p-5"
            style={{
              backgroundColor: 'var(--card-style-bg, var(--card))',
              border: '1px solid var(--card-style-border, var(--border))',
              borderRadius: 'var(--card-style-radius, 12px)',
              boxShadow: 'var(--card-style-shadow, none)',
              backdropFilter: 'var(--card-style-blur, none)',
              WebkitBackdropFilter: 'var(--card-style-blur, none)',
            }}
          >
            <h3 className="text-[13px] font-semibold mb-3" style={{ color: 'var(--text)' }}>
              阶段延迟分布
            </h3>
            {summary && summary.samples > 0 ? (
              <StageBars summary={summary} />
            ) : (
              <div className="text-[12px] py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                {summary?.samples === 0 ? '当前窗口暂无查询样本' : '加载中...'}
              </div>
            )}
          </div>

          <div
            className="p-5"
            style={{
              backgroundColor: 'var(--card-style-bg, var(--card))',
              border: '1px solid var(--card-style-border, var(--border))',
              borderRadius: 'var(--card-style-radius, 12px)',
              boxShadow: 'var(--card-style-shadow, none)',
              backdropFilter: 'var(--card-style-blur, none)',
              WebkitBackdropFilter: 'var(--card-style-blur, none)',
            }}
          >
            <h3 className="text-[13px] font-semibold mb-3" style={{ color: 'var(--text)' }}>
              端到端耗时趋势
            </h3>
            <TimeSeries series={series} />
          </div>
        </div>

        {/* 主动压测 + 系统参数 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className="p-5"
            style={{
              backgroundColor: 'var(--card-style-bg, var(--card))',
              border: '1px solid var(--card-style-border, var(--border))',
              borderRadius: 'var(--card-style-radius, 12px)',
              boxShadow: 'var(--card-style-shadow, none)',
              backdropFilter: 'var(--card-style-blur, none)',
              WebkitBackdropFilter: 'var(--card-style-blur, none)',
            }}
          >
            <h3 className="text-[13px] font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <PlayIcon className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
              主动压测
            </h3>
            <BenchmarkPanel onDone={() => refresh(window)} />
          </div>

          <div
            className="p-5"
            style={{
              backgroundColor: 'var(--card-style-bg, var(--card))',
              border: '1px solid var(--card-style-border, var(--border))',
              borderRadius: 'var(--card-style-radius, 12px)',
              boxShadow: 'var(--card-style-shadow, none)',
              backdropFilter: 'var(--card-style-blur, none)',
              WebkitBackdropFilter: 'var(--card-style-blur, none)',
            }}
          >
            <h3 className="text-[13px] font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <DatabaseIcon className="w-3.5 h-3.5" style={{ color: 'var(--sem-retrieval)' }} />
              系统参数
            </h3>
            <SystemConfigCard config={config} />
          </div>
        </div>

        {/* 最近埋点表 */}
        <div
          className="p-5"
          style={{
            backgroundColor: 'var(--card-style-bg, var(--card))',
            border: '1px solid var(--card-style-border, var(--border))',
            borderRadius: 'var(--card-style-radius, 12px)',
            boxShadow: 'var(--card-style-shadow, none)',
            backdropFilter: 'var(--card-style-blur, none)',
            WebkitBackdropFilter: 'var(--card-style-blur, none)',
          }}
        >
          <h3 className="text-[13px] font-semibold mb-3" style={{ color: 'var(--text)' }}>
            最近 50 条查询
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="text-left font-medium py-1.5 pr-3">时间</th>
                  <th className="text-right font-medium py-1.5 pr-3">Embed</th>
                  <th className="text-right font-medium py-1.5 pr-3">检索</th>
                  <th className="text-right font-medium py-1.5 pr-3">Rerank</th>
                  <th className="text-right font-medium py-1.5 pr-3">LLM</th>
                  <th className="text-right font-medium py-1.5 pr-3">总</th>
                  <th className="text-right font-medium py-1.5 pr-3">召回/精选</th>
                  <th className="text-left font-medium py-1.5">状态</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
                      暂无埋点数据
                    </td>
                  </tr>
                ) : recent.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <td className="py-1.5 pr-3 font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {r.created_at?.slice(11, 19) ?? '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono" style={{ color: 'var(--sem-embed)' }}>{r.embed_ms}ms</td>
                    <td className="py-1.5 pr-3 text-right font-mono" style={{ color: 'var(--sem-retrieval)' }}>{r.retrieve_ms}ms</td>
                    <td className="py-1.5 pr-3 text-right font-mono" style={{ color: 'var(--sem-rerank)' }}>{r.rerank_ms}ms</td>
                    <td className="py-1.5 pr-3 text-right font-mono" style={{ color: 'var(--sem-llm)' }}>{r.llm_ms}ms</td>
                    <td className="py-1.5 pr-3 text-right font-mono font-semibold" style={{ color: 'var(--text)' }}>{r.total_ms}ms</td>
                    <td className="py-1.5 pr-3 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {r.search_count} / {r.rerank_count}
                    </td>
                    <td className="py-1.5">
                      {r.status === 'ok' ? (
                        <span
                          className="text-[10.5px] px-1.5 py-0.5 rounded font-semibold"
                          style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)' }}
                        >
                          OK
                        </span>
                      ) : (
                        <span
                          className="text-[10.5px] px-1.5 py-0.5 rounded font-semibold"
                          style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }}
                          title={r.error ?? ''}
                        >
                          ERR
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsPanel;
