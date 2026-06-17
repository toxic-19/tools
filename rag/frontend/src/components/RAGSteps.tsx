import React, { useState, useEffect } from 'react';

export type RAGStepStatus = 'pending' | 'running' | 'done';

export interface RAGStep {
  id: string;
  title: string;
  detail: string;
  status: RAGStepStatus;
}

interface RAGStepsProps {
  steps: RAGStep[];
  defaultCollapsed?: boolean;
}

const StepIcon: React.FC<{ status: RAGStepStatus; index: number }> = ({ status, index }) => {
  if (status === 'done') {
    return (
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'var(--sem-retrieval)' }}
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (status === 'running') {
    return (
      <div
        className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
        style={{
          borderColor: 'var(--primary)',
          borderWidth: '2px',
          borderStyle: 'solid',
          borderTopColor: 'transparent',
          animation: 'spin 1s linear infinite',
        }}
      />
    );
  }
  return (
    <div
      className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold"
      style={{
        borderColor: 'var(--border)',
        borderWidth: '1.5px',
        borderStyle: 'solid',
        color: 'var(--text-muted)',
        backgroundColor: 'var(--card)',
      }}
    >
      {index + 1}
    </div>
  );
};

/** 格式化耗时（ms → 可读字符串） */
function fmtMs(ms?: number): string {
  if (ms == null) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const RAGSteps: React.FC<RAGStepsProps> = ({ steps, defaultCollapsed = false }) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // 当 defaultCollapsed 变化时（loading → done），同步更新内部折叠状态
  useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  // 统计：总耗时（从最后一个有 detail 的 step 提取）
  const allDone = steps.every((s) => s.status === 'done');
  const isLoading = !allDone;

  // 找到当前正在执行的步骤（running 或最后一个 done 的下一步）
  const runningStep = steps.find((s) => s.status === 'running');
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const currentLabel = runningStep
    ? runningStep.title
    : doneCount < steps.length
      ? steps[doneCount]?.title ?? '准备中...'
      : '准备中...';

  // 从步骤 detail 中提取耗时数字用于折叠摘要
  const totalTime = steps.reduce((sum, s) => {
    const match = s.detail.match(/([\d.]+)ms/);
    return match ? sum + parseFloat(match[1]) : sum;
  }, 0);

  // ---- Loading 态：简洁单行，动态显示当前步骤名 ----
  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg my-2"
        style={{
          backgroundColor: 'var(--gray-50)',
          borderColor: 'var(--border)',
          borderWidth: '1px',
          borderStyle: 'solid',
        }}
      >
        <div
          className="w-4 h-4 rounded-full flex-shrink-0"
          style={{
            borderColor: 'var(--primary)',
            borderWidth: '2px',
            borderStyle: 'solid',
            borderTopColor: 'transparent',
            animation: 'spin 1s linear infinite',
          }}
        />
        <span
          className="text-[12.5px] font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          {currentLabel}
        </span>
        <span
          className="text-[11px] ml-auto flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
        >
          {doneCount}/{steps.length}
        </span>
      </div>
    );
  }

  // ---- 完成态：可折叠的步骤面板 ----
  return (
    <div
      className="rounded-lg my-2 font-mono text-[12.5px] overflow-hidden"
      style={{
        backgroundColor: 'var(--gray-50)',
        borderColor: 'var(--border)',
        borderWidth: '1px',
        borderStyle: 'solid',
      }}
    >
      {/* 折叠摘要行 — 始终显示，点击切换展开 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors duration-150 hover:opacity-80"
        style={{ backgroundColor: 'transparent' }}
      >
        {/* 完成图标 */}
        <svg
          className="w-4 h-4 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--sem-retrieval)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>

        <span
          className="text-[12px] font-semibold flex-1 text-left"
          style={{ color: 'var(--text-secondary)' }}
        >
          RAG 流程完成{totalTime > 0 ? ' · ' + fmtMs(totalTime) : ''}
        </span>

        {/* 折叠箭头 */}
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200"
          style={{
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            color: 'var(--text-muted)',
          }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* 展开的步骤详情 */}
      {!collapsed && (
        <div className="px-3 pb-2 border-t" style={{ borderColor: 'var(--border)' }}>
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex items-start gap-2.5 py-1.5"
              style={{
                color: 'var(--text)',
                transition: 'all 0.2s ease',
              }}
            >
              <StepIcon status={step.status} index={index} />
              <div className="flex-1 min-w-0 leading-relaxed">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: 'var(--card)',
                      color: 'var(--sem-retrieval)',
                      borderColor: 'var(--border)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                    }}
                  >
                    RAG-{index + 1}
                  </span>
                  <span className="font-semibold">{step.title}</span>
                </div>
                {step.detail && (
                  <div
                    className="text-[11.5px] mt-0.5 ml-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RAGSteps;
