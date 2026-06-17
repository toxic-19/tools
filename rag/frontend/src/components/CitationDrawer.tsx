import React, { useEffect, useRef } from 'react';
import { Citation } from '../api';

interface CitationDrawerProps {
  open: boolean;
  citations: Citation[];
  activeIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const CitationDrawer: React.FC<CitationDrawerProps> = ({
  open,
  citations,
  activeIndex,
  onClose,
  onNavigate,
}) => {
  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const listRef = useRef<HTMLDivElement>(null);

  // 切换 activeIndex 时自动滚动到对应位置
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-citation-index="${activeIndex}"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeIndex]);

  if (!open || citations.length === 0) return null;

  const current = citations[activeIndex];

  return (
    <div
      className="flex flex-col flex-shrink-0 overflow-hidden animate-slide-in"
      style={{
        width: '400px',
        backgroundColor: 'var(--card)',
        borderLeftColor: 'var(--border)',
        borderLeftWidth: '1px',
        borderLeftStyle: 'solid',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottomColor: 'var(--border)', borderBottomWidth: '1px', borderBottomStyle: 'solid' }}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--primary)' }}>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
            搜索结果
            <span className="ml-1.5 text-[12px] font-normal" style={{ color: 'var(--text-muted)' }}>
              {citations.length}
            </span>
          </h2>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--gray-100)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          title="关闭 (ESC)"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* List */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {citations.map((citation, index) => {
          const isActive = index === activeIndex;
          return (
            <div
              key={index}
              data-citation-index={index}
              onClick={() => onNavigate(index)}
              className="px-4 py-3 cursor-pointer transition-colors"
              style={{
                backgroundColor: isActive ? 'var(--primary-bg)' : 'transparent',
                borderLeftWidth: isActive ? '3px' : '0',
                borderLeftStyle: 'solid',
                borderLeftColor: 'var(--primary)',
                borderBottomColor: 'var(--border)',
                borderBottomWidth: '1px',
                borderBottomStyle: 'solid',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'var(--gray-50)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    backgroundColor: isActive ? 'var(--primary)' : 'var(--gray-100)',
                    color: isActive ? 'var(--primary-text)' : 'var(--text-secondary)',
                  }}
                >
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <h3
                    className="text-[13px] font-semibold leading-snug line-clamp-2"
                    style={{ color: 'var(--text)' }}
                  >
                    {citation.filename}
                    {citation.page_number && (
                      <span className="text-[10px] ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>
                        · 第{citation.page_number}页
                      </span>
                    )}
                  </h3>
                  <p
                    className="text-[12px] mt-1 leading-relaxed line-clamp-3"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {citation.text.substring(0, 150)}
                    {citation.text.length > 150 && '...'}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: 'var(--sem-retrieval-bg)',
                        color: 'var(--sem-retrieval)',
                      }}
                    >
                      {(citation.rerank_score ?? citation.score).toFixed(3)}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      chunk #{citation.chunk_index}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with current detail */}
      {current && (
        <div
          className="p-3 flex-shrink-0"
          style={{ borderTopColor: 'var(--border)', borderTopWidth: '1px', borderTopStyle: 'solid' }}
        >
          <div
            className="rounded-lg p-3 text-[12px] leading-relaxed max-h-28 overflow-y-auto mb-2"
            style={{
              backgroundColor: 'var(--gray-50)',
              color: 'var(--text-secondary)',
              borderColor: 'var(--border)',
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            {current.text}
          </div>
          <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span>{activeIndex + 1} / {citations.length}</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => activeIndex > 0 && onNavigate(activeIndex - 1)}
                disabled={activeIndex === 0}
                className="px-2.5 py-1 rounded transition-colors"
                style={{
                  backgroundColor: activeIndex === 0 ? 'transparent' : 'var(--gray-100)',
                  color: activeIndex === 0 ? 'var(--text-muted)' : 'var(--text)',
                  cursor: activeIndex === 0 ? 'not-allowed' : 'pointer',
                  opacity: activeIndex === 0 ? 0.5 : 1,
                }}
              >
                ← 上一条
              </button>
              <button
                onClick={() => activeIndex < citations.length - 1 && onNavigate(activeIndex + 1)}
                disabled={activeIndex === citations.length - 1}
                className="px-2.5 py-1 rounded transition-colors"
                style={{
                  backgroundColor: activeIndex === citations.length - 1 ? 'transparent' : 'var(--gray-100)',
                  color: activeIndex === citations.length - 1 ? 'var(--text-muted)' : 'var(--text)',
                  cursor: activeIndex === citations.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: activeIndex === citations.length - 1 ? 0.5 : 1,
                }}
              >
                下一条 →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CitationDrawer;
