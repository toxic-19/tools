import React from 'react';

interface SettingsPanelProps {
  stats: { chunks: number; dimension: number; collection: string };
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ stats }) => {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-xl mx-auto space-y-4">
        {/* Connection Info */}
        <div
          className="p-5 transition-all duration-200"
          style={{
            backgroundColor: 'var(--card-style-bg, var(--card))',
            borderColor: 'var(--card-style-border, var(--border))',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: 'var(--card-style-radius, 12px)',
            boxShadow: 'var(--card-style-shadow, none)',
            backdropFilter: 'var(--card-style-blur, none)',
            WebkitBackdropFilter: 'var(--card-style-blur, none)',
          }}
        >
          <h3 className="text-[13px] font-semibold pb-3 mb-3" style={{ color: 'var(--text)', borderBottomColor: 'var(--border)', borderBottomWidth: '1px', borderBottomStyle: 'solid' }}>
            连接信息
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <span className="text-[13px] w-[120px] flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>Milvus 地址</span>
              <span className="text-[12px] font-mono px-3 py-1 rounded-md" style={{ backgroundColor: 'var(--gray-50)', color: 'var(--text)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
                localhost:19530
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[13px] w-[120px] flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>Collection</span>
              <span className="text-[12px] font-mono px-3 py-1 rounded-md" style={{ backgroundColor: 'var(--gray-50)', color: 'var(--text)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
                {stats.collection}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[13px] w-[120px] flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>连接状态</span>
              <span className="text-[12px] font-mono px-3 py-1 rounded-md" style={{ backgroundColor: 'var(--gray-50)', color: 'var(--success)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
                已连接
              </span>
            </div>
          </div>
        </div>

        {/* Model Config */}
        <div
          className="p-5 rounded-xl"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}
        >
          <h3 className="text-[13px] font-semibold pb-3 mb-3" style={{ color: 'var(--text)', borderBottomColor: 'var(--border)', borderBottomWidth: '1px', borderBottomStyle: 'solid' }}>
            模型配置
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <span className="text-[13px] w-[120px] flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>Embedding</span>
              <span className="text-[12px] font-mono px-3 py-1 rounded-md" style={{ backgroundColor: 'var(--gray-50)', color: 'var(--text)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
                nomic-embed-text (dim={stats.dimension})
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[13px] w-[120px] flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>LLM</span>
              <span className="text-[12px] font-mono px-3 py-1 rounded-md" style={{ backgroundColor: 'var(--gray-50)', color: 'var(--text)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
                已配置
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[13px] w-[120px] flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>Rerank</span>
              <span className="text-[12px] font-mono px-3 py-1 rounded-md" style={{ backgroundColor: 'var(--gray-50)', color: 'var(--text)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
                bge-reranker-large
              </span>
            </div>
          </div>
        </div>

        {/* Search Params */}
        <div
          className="p-5 rounded-xl"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}
        >
          <h3 className="text-[13px] font-semibold pb-3 mb-3" style={{ color: 'var(--text)', borderBottomColor: 'var(--border)', borderBottomWidth: '1px', borderBottomStyle: 'solid' }}>
            检索参数
          </h3>
          <div className="space-y-2">
            {[
              { label: 'Chunk Size', value: '500 字符' },
              { label: 'Chunk Overlap', value: '100 字符' },
              { label: '检索 Top-K', value: '20' },
              { label: 'Rerank Top-N', value: '5' },
            ].map((param) => (
              <div key={param.label} className="flex items-center gap-4">
                <span className="text-[13px] w-[120px] flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{param.label}</span>
                <span className="text-[12px] font-mono px-3 py-1 rounded-md" style={{ backgroundColor: 'var(--gray-50)', color: 'var(--text)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
                  {param.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RAG Flow */}
        <div
          className="p-5 rounded-xl"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}
        >
          <h3 className="text-[13px] font-semibold pb-3 mb-3" style={{ color: 'var(--text)', borderBottomColor: 'var(--border)', borderBottomWidth: '1px', borderBottomStyle: 'solid' }}>
            RAG 流程
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: 'Query Embedding', bg: 'var(--sem-embed-bg)', color: 'var(--sem-embed)' },
              { label: 'Milvus 检索 Top-20', bg: 'var(--sem-retrieval-bg)', color: 'var(--sem-retrieval)' },
              { label: 'Cross-Encoder Rerank', bg: 'var(--sem-rerank-bg)', color: 'var(--sem-rerank)' },
              { label: 'Top-5 Context', bg: 'var(--sem-retrieval-bg)', color: 'var(--sem-retrieval)' },
              { label: 'LLM 生成答案', bg: 'var(--sem-llm-bg)', color: 'var(--sem-llm)' },
              { label: '答案 + 引用溯源', bg: 'var(--primary-bg)', color: 'var(--primary)' },
            ].map((step, index) => (
              <React.Fragment key={step.label}>
                {index > 0 && <span className="text-[14px]" style={{ color: 'var(--text-muted)' }}>→</span>}
                <span
                  className="px-3.5 py-1.5 rounded-md text-[12px] font-semibold"
                  style={{ backgroundColor: step.bg, color: step.color }}
                >
                  {step.label}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
