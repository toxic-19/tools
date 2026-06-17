import React from 'react';

interface HeaderBrandProps {
  onRefresh: () => void;
  onReset: () => void;
}

const HeaderBrand: React.FC<HeaderBrandProps> = ({ onRefresh, onReset }) => {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b"
         style={{ backgroundColor: 'var(--card)', borderBottomColor: 'var(--border)' }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-base"
           style={{ backgroundColor: 'var(--primary)' }}>
        R
      </div>
      <div>
        <h1 className="font-bold text-base" style={{ color: 'var(--text)' }}>RAG 知识库</h1>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>检索增强生成问答平台</p>
      </div>
      <div className="ml-auto flex gap-2">
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 border"
          style={{
            color: 'var(--primary)',
            borderColor: 'var(--primary-border)',
            backgroundColor: 'transparent',
          }}
        >
          刷新
        </button>
        <button
          onClick={onReset}
          className="px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 border"
          style={{
            color: '#fff',
            backgroundColor: 'var(--danger)',
            borderColor: 'var(--danger)',
          }}
        >
          清空
        </button>
      </div>
    </div>
  );
};

export default HeaderBrand;
