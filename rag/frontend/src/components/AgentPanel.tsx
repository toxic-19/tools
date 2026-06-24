import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AgentHealth,
  AgentTool,
  TraceEventDTO,
  getAgentHealth,
  getAgentTools,
} from '../api/agent';
import { useAgentChat, AgentTurn } from '../hooks/useAgentChat';
import {
  BrainIcon,
  SendIcon,
  RefreshIcon,
  ToolIcon,
  ClockIcon,
  ChevronRightIcon,
  SatelliteIcon,
  EyeIcon,
  TerminalIcon,
  TargetIcon,
  XIcon,
  ZapIcon,
} from './Icons';

/* ================================================================
   Constants
   ================================================================ */

const EXAMPLES = [
  '查 P003 患者用药,看一下华法林的禁忌症',
  '查一下 P001 患者在用二甲双胍,这个药的禁忌人群是什么?同时给出知识库一共有多少条文档。',
  '查 P001 患者的用药清单,统计知识库条数,并用沙箱计算每 100 条知识库内容对应的在用药物数。',
  '查 P003 患者华法林用药,再用沙箱按年龄、慢性肾病、既往消化道出血和 INR=3.4 计算抗凝出血风险评分。',
];

interface PhaseMeta {
  label: string;
  bg: string;
  fg: string;
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
}

const PHASE_META: Record<string, PhaseMeta> = {
  perceive: { label: '感知', bg: 'rgba(99,102,241,0.08)', fg: '#6366f1', icon: SatelliteIcon },
  think:    { label: '思考', bg: 'rgba(245,158,11,0.08)', fg: '#d97706', icon: BrainIcon },
  act:      { label: '行动', bg: 'rgba(16,185,129,0.08)', fg: '#059669', icon: ZapIcon },
  observe:  { label: '观察', bg: 'rgba(107,114,128,0.08)', fg: '#4b5563', icon: EyeIcon },
  final:    { label: '汇总', bg: 'rgba(99,102,241,0.10)', fg: '#6366f1', icon: TargetIcon },
  error:    { label: '错误', bg: 'rgba(239,68,68,0.08)', fg: '#dc2626', icon: TerminalIcon },
};

const KIND_LABEL: Record<string, string> = {
  mcp: 'MCP 工具',
  mock_microservice: 'Mock 微服务',
  sandbox: '安全沙箱',
};

const KIND_COLOR: Record<string, { bg: string; fg: string }> = {
  mcp:                { bg: 'rgba(99,102,241,0.10)', fg: '#6366f1' },
  mock_microservice:  { bg: 'rgba(16,185,129,0.10)', fg: '#059669' },
  sandbox:            { bg: 'rgba(245,158,11,0.10)', fg: '#d97706' },
};

interface ToolParameterRow {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

function getToolParameterRows(parameters: AgentTool['parameters']): ToolParameterRow[] {
  if (!parameters || typeof parameters !== 'object') return [];

  const properties =
    parameters.properties && typeof parameters.properties === 'object'
      ? parameters.properties
      : parameters;
  const required = Array.isArray(parameters.required) ? new Set(parameters.required) : new Set<string>();

  return Object.entries(properties)
    .filter(([key]) => key !== 'properties' && key !== 'required' && key !== 'type')
    .map(([name, schema]: [string, any]) => ({
      name,
      type: typeof schema?.type === 'string' ? schema.type : 'any',
      required: required.has(name) || schema?.required === true,
      description: typeof schema?.description === 'string' ? schema.description : '无说明',
    }));
}

/* ================================================================
   ToolsDialog — 弹出式工具清单
   ================================================================ */

interface ToolsDialogProps {
  open: boolean;
  tools: AgentTool[];
  onClose: () => void;
}

const ToolsDialog: React.FC<ToolsDialogProps> = ({ open, tools, onClose }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="可用工具"
        className="w-[min(760px,calc(100vw-32px))] max-h-[78vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--card)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--primary-bg)', color: 'var(--primary)' }}
            >
              <ToolIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
                可用工具
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                共 {tools.length} 个工具已注册
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {tools.length === 0 && (
            <div className="text-center py-8">
              <div
                className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                style={{ backgroundColor: 'var(--gray-100)', color: 'var(--text-muted)' }}
              >
                <ToolIcon className="w-6 h-6" />
              </div>
              <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                暂未连接，等待 MCP Server 启动...
              </div>
            </div>
          )}
          {tools.map((t) => {
            const kc = KIND_COLOR[t.kind] || { bg: 'var(--gray-100)', fg: 'var(--text-secondary)' };
            const parameterRows = getToolParameterRows(t.parameters);
            return (
              <div
                key={t.name}
                className="rounded-xl p-4 transition-colors"
                style={{
                  backgroundColor: 'var(--gray-50)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <code
                      className="text-[13px] font-bold truncate"
                      style={{ color: 'var(--text)', fontFamily: 'monospace' }}
                    >
                      {t.name}
                    </code>
                  </div>
                  <span
                    className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: kc.bg, color: kc.fg }}
                  >
                    {KIND_LABEL[t.kind] || t.kind}
                  </span>
                </div>
                <div className="text-[12.5px] leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>
                  {t.description}
                </div>
                {parameterRows.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      参数
                    </div>
                    <div className="space-y-1.5">
                      {parameterRows.map((param) => (
                        <div
                          key={param.name}
                          className="grid grid-cols-[minmax(96px,150px)_64px_52px_1fr] gap-2 rounded-lg px-2.5 py-2 text-[11.5px]"
                          style={{
                            backgroundColor: 'var(--card)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <code className="font-semibold truncate" style={{ color: 'var(--text)', fontFamily: 'monospace' }}>
                            {param.name}
                          </code>
                          <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
                            {param.type}
                          </span>
                          <span style={{ color: param.required ? '#dc2626' : 'var(--text-muted)' }}>
                            {param.required ? '必填' : '可选'}
                          </span>
                          <span className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {param.description}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                  后端: {t.backend}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ================================================================
   AgentTraceSteps — 单个气泡内的步骤时间线
   ================================================================ */

interface AgentTraceStepsProps {
  trace: TraceEventDTO[];
}

const AgentTraceSteps: React.FC<AgentTraceStepsProps> = ({ trace }) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (trace.length === 0) return null;

  return (
    <div className="space-y-1">
      {trace.map((ev, idx) => {
        const meta = PHASE_META[ev.phase] || PHASE_META.observe;
        const StepIcon = meta.icon;
        const isExpanded = expandedSteps.has(idx);
        const hasDetail =
          (ev.phase === 'perceive' && ev.content) ||
          (ev.phase === 'think' && ev.content) ||
          (ev.phase === 'act' && ev.tool_result) ||
          (ev.phase === 'error' && ev.content);

        return (
          <div key={idx} className="rounded-lg overflow-hidden" style={{ backgroundColor: meta.bg }}>
            {/* Step header — always visible */}
            <button
              onClick={() => hasDetail && toggleStep(idx)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
              style={{ cursor: hasDetail ? 'pointer' : 'default' }}
            >
              <div
                className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                style={{ color: meta.fg }}
              >
                <StepIcon className="w-3.5 h-3.5" />
              </div>
              <span className="text-[11.5px] font-semibold flex-shrink-0" style={{ color: meta.fg }}>
                {meta.label} · Step {ev.step + 1}
              </span>
              {ev.tool_name && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                  style={{
                    backgroundColor: 'var(--card)',
                    color: meta.fg,
                    border: `1px solid ${meta.fg}22`,
                  }}
                >
                  {ev.tool_name}
                </span>
              )}
              {ev.message && !hasDetail && (
                <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                  {ev.message}
                </span>
              )}
              <div className="flex-1" />
              <span className="text-[10px] flex-shrink-0 flex items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
                <ClockIcon className="w-3 h-3" />
                {ev.elapsed_ms.toFixed(0)}ms
              </span>
              {hasDetail && (
                <ChevronRightIcon
                  className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200"
                  style={{
                    color: 'var(--text-muted)',
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}
                />
              )}
            </button>

            {/* Step detail — expandable */}
            {isExpanded && hasDetail && (
              <div className="px-3 pb-2.5">
                {ev.message && (
                  <div className="text-[11px] mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    {ev.message}
                  </div>
                )}

                {ev.phase === 'perceive' && ev.content && (
                  <div
                    className="text-[11px] p-2.5 rounded-lg"
                    style={{
                      backgroundColor: 'var(--card)',
                      color: 'var(--text-secondary)',
                      maxHeight: '160px',
                      overflow: 'auto',
                    }}
                  >
                    <div className="font-semibold mb-1 text-[10.5px]" style={{ color: 'var(--text)' }}>
                      RAG 召回上下文
                    </div>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: '10.5px' }}>
                      {(ev.content as any).rag_context_text || '(空)'}
                    </pre>
                  </div>
                )}

                {ev.phase === 'think' && ev.content && (
                  <div
                    className="text-[11px] p-2.5 rounded-lg"
                    style={{ backgroundColor: 'var(--card)', color: 'var(--text-secondary)' }}
                  >
                    {(ev.content as any).content && (
                      <div className="mb-1.5 italic" style={{ color: 'var(--text-muted)' }}>
                        {(ev.content as any).content}
                      </div>
                    )}
                    {ev.tool_name && (
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>调用参数: </span>
                        <code
                          style={{
                            color: meta.fg,
                            fontFamily: 'monospace',
                            fontSize: '10.5px',
                          }}
                        >
                          {JSON.stringify(ev.tool_args || {})}
                        </code>
                      </div>
                    )}
                  </div>
                )}

                {ev.phase === 'act' && ev.tool_result && (
                  <div
                    className="text-[11px] p-2.5 rounded-lg"
                    style={{
                      backgroundColor: 'var(--card)',
                      color: 'var(--text-secondary)',
                      maxHeight: '160px',
                      overflow: 'auto',
                    }}
                  >
                    <div className="font-semibold mb-1 text-[10.5px]" style={{ color: 'var(--text)' }}>
                      返回值
                    </div>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        fontFamily: 'monospace',
                        fontSize: '10.5px',
                      }}
                    >
                      {JSON.stringify((ev.tool_result as any).value, null, 2)}
                    </pre>
                  </div>
                )}

                {ev.phase === 'error' && ev.content && (
                  <div
                    className="text-[11px] p-2.5 rounded-lg"
                    style={{ backgroundColor: 'rgba(239,68,68,0.06)', color: '#dc2626' }}
                  >
                    {(ev.content as any).error}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ================================================================
   AgentBubble — 单轮对话气泡
   ================================================================ */

interface AgentBubbleProps {
  turn: AgentTurn;
}

const AgentBubble: React.FC<AgentBubbleProps> = ({ turn }) => {
  const nonFinalTrace = turn.trace.filter((ev) => ev.phase !== 'final');

  return (
    <div className="space-y-4 message-enter">
      {/* User message — right aligned */}
      <div className="flex gap-3 flex-row-reverse">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-bold flex-shrink-0"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          U
        </div>
        <div className="flex justify-end" style={{ maxWidth: '75%' }}>
          <div
            className="px-4 py-2.5 text-[13.5px] leading-relaxed break-words"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-text)',
              borderRadius: 'var(--card-style-radius, 12px) var(--card-style-radius, 12px) 4px var(--card-style-radius, 12px)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            {turn.instruction}
          </div>
        </div>
      </div>

      {/* Agent response — left aligned, all steps in one bubble */}
      <div className="flex gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: 'var(--gray-100)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          <BrainIcon className="w-4 h-4" />
        </div>

        <div style={{ maxWidth: '85%', minWidth: 0, flex: 1 }}>
          <div
            className="overflow-hidden"
            style={{
              backgroundColor: 'var(--card-style-bg, var(--card))',
              border: '1px solid var(--card-style-border, var(--border))',
              borderRadius: 'var(--card-style-radius, 12px) var(--card-style-radius, 12px) var(--card-style-radius, 12px) 4px',
              boxShadow: 'var(--card-style-shadow, none)',
              backdropFilter: 'var(--card-style-blur, none)',
              WebkitBackdropFilter: 'var(--card-style-blur, none)',
            }}
          >
            {/* Trace steps */}
            {nonFinalTrace.length > 0 && (
              <div className="p-3">
                <AgentTraceSteps trace={nonFinalTrace} />
              </div>
            )}

            {/* Loading indicator */}
            {turn.loading && (
              <div className="px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--primary)', animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--primary)', animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--primary)', animationDelay: '300ms' }} />
                </div>
                <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  Agent 处理中...
                </span>
              </div>
            )}

            {/* Error */}
            {turn.error && (
              <div
                className="mx-3 mb-3 px-3 py-2 rounded-lg text-[12.5px]"
                style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#dc2626' }}
              >
                {turn.error}
              </div>
            )}

            {/* Final answer — markdown rendered */}
            {turn.answer && (
              <div
                className="px-4 py-3.5"
                style={{ borderTop: nonFinalTrace.length > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <div className="markdown-body text-[13.5px] leading-relaxed" style={{ color: 'var(--text)' }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                      h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-[14px] font-bold mt-2 mb-1">{children}</h3>,
                      ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      blockquote: ({ children }) => (
                        <blockquote
                          className="pl-3 my-2 italic"
                          style={{ borderLeft: '3px solid var(--primary-border)', borderLeftColor: 'var(--primary-border)' }}
                        >
                          {children}
                        </blockquote>
                      ),
                      code: ({ inline, children }: any) =>
                        inline ? (
                          <code
                            className="px-1.5 py-0.5 rounded text-[12px] font-mono"
                            style={{ backgroundColor: 'var(--gray-100)', color: 'var(--text)' }}
                          >
                            {children}
                          </code>
                        ) : (
                          <code
                            className="block p-3 rounded-lg text-[12px] font-mono overflow-x-auto my-2 whitespace-pre-wrap"
                            style={{ backgroundColor: 'var(--gray-100)', color: 'var(--text)' }}
                          >
                            {children}
                          </code>
                        ),
                      strong: ({ children }) => (
                        <strong className="font-semibold" style={{ color: 'var(--text)' }}>
                          {children}
                        </strong>
                      ),
                      table: ({ children }) => (
                        <table className="border-collapse my-2 text-[12px] w-full" style={{ borderColor: 'var(--border)' }}>
                          {children}
                        </table>
                      ),
                      th: ({ children }) => (
                        <th
                          className="border px-3 py-1.5 font-semibold text-left"
                          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--gray-50)' }}
                        >
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="border px-3 py-1.5" style={{ borderColor: 'var(--border)' }}>
                          {children}
                        </td>
                      ),
                    }}
                  >
                    {turn.answer}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {/* Footer metadata */}
          {turn.toolCallsCount > 0 && !turn.loading && (
            <div className="mt-1.5 px-1 flex items-center gap-3 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1">
                <ToolIcon className="w-3 h-3" />
                已调用 {turn.toolCallsCount} 个工具
              </span>
              <span className="flex items-center gap-1">
                <ClockIcon className="w-3 h-3" />
                {turn.totalElapsedMs.toFixed(0)}ms
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ================================================================
   AgentPanel — Main
   ================================================================ */

const AgentPanel: React.FC = () => {
  const { state, send, reset } = useAgentChat();
  const [input, setInput] = useState('');
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [toolsDialogOpen, setToolsDialogOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refresh();
  }, []);

  // Auto-scroll to bottom when new turns arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.turns.length, state.turns[state.turns.length - 1]?.trace.length]);

  const refresh = async () => {
    try {
      const [h, t] = await Promise.all([getAgentHealth(), getAgentTools()]);
      setHealth(h);
      setTools(t.tools);
    } catch (e) {
      console.warn('agent init failed', e);
    }
  };

  const onSend = () => {
    if (!input.trim()) return;
    const hasLoading = state.turns.some((t) => t.loading);
    if (hasLoading) return;
    send(input.trim());
    setInput('');
  };

  const onExample = (text: string) => {
    const hasLoading = state.turns.some((t) => t.loading);
    if (hasLoading) return;
    send(text);
  };

  const mcpOk = health?.mcp_server?.ok;
  const maxSteps = health?.agent?.max_steps ?? 8;
  const hasTurns = state.turns.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top status bar */}
      <div
        className="px-4 py-2 flex items-center gap-3 text-[12px] flex-shrink-0"
        style={{
          backgroundColor: 'var(--card)',
          borderBottomColor: 'var(--border)',
          borderBottomWidth: '1px',
          borderBottomStyle: 'solid',
        }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: mcpOk ? '#10b981' : '#ef4444' }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>
            MCP: {mcpOk ? '已连接' : '未连接'}
          </span>
        </div>
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <span>最大步数: {maxSteps}</span>
        </div>
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <span>工具数: {tools.length}</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setToolsDialogOpen(true)}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors"
          style={{
            backgroundColor: 'var(--gray-100)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <ToolIcon className="w-3 h-3" />
          查看工具
        </button>
        <button
          onClick={refresh}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-muted)', cursor: 'pointer' }}
          title="刷新状态"
        >
          <RefreshIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 chat-scroll">
        {/* Empty state */}
        {!hasTurns && (
          <div className="text-center py-12">
            <div className="mb-4 flex justify-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: '#6366f1' }}
              >
                <BrainIcon className="w-9 h-9" />
              </div>
            </div>
            <div className="text-[15px] font-semibold mb-2" style={{ color: 'var(--text)' }}>
              AI 智能体能力支撑平台
            </div>
            <div className="text-[12.5px] mb-6" style={{ color: 'var(--text-muted)' }}>
              感知-思考-行动循环，自主调度 RAG-MCP + 微服务 + 安全沙箱
            </div>
            <div className="flex flex-col gap-2 max-w-md mx-auto">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => onExample(ex)}
                  className="text-left px-3 py-2.5 rounded-lg text-[12.5px] transition-all hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--card)',
                    borderColor: 'var(--border)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversation turns */}
        <div className="space-y-6">
          {state.turns.map((turn) => (
            <AgentBubble key={turn.id} turn={turn} />
          ))}
        </div>
      </div>

      {/* Input area */}
      <div
        className="px-4 py-3 flex-shrink-0"
        style={{
          backgroundColor: 'var(--card)',
          borderTopColor: 'var(--border)',
          borderTopWidth: '1px',
          borderTopStyle: 'solid',
        }}
      >
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="输入指令，例如：查 P001 患者的用药禁忌，并统计知识库条数"
            rows={2}
            disabled={state.turns.some((t) => t.loading)}
            className="flex-1 px-3 py-2 rounded-lg text-[13px] outline-none resize-none transition-colors"
            style={{
              backgroundColor: 'var(--gray-50)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={onSend}
              disabled={state.turns.some((t) => t.loading) || !input.trim()}
              className="px-3 h-full rounded-lg flex items-center justify-center gap-1.5 text-[12.5px] font-semibold transition-opacity"
              style={{
                backgroundColor: 'var(--primary)',
                color: 'var(--primary-text)',
                opacity: state.turns.some((t) => t.loading) || !input.trim() ? 0.4 : 1,
                cursor: 'pointer',
              }}
            >
              <SendIcon className="w-4 h-4" />
              发送
            </button>
            {hasTurns && (
              <button
                onClick={reset}
                className="px-3 py-1 rounded-lg text-[11px] transition-colors"
                style={{
                  backgroundColor: 'var(--gray-100)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                清空
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tools dialog */}
      <ToolsDialog open={toolsDialogOpen} tools={tools} onClose={() => setToolsDialogOpen(false)} />
    </div>
  );
};

export default AgentPanel;
