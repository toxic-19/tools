import React from 'react';
import { BrainIcon } from './Icons';

interface WelcomeProps {
  onExampleClick: (question: string) => void;
}

const examples = [
  '什么是RAG检索增强生成？',
  'Rerank重排序的作用是什么？',
  '有哪些常用的Embedding模型？',
  '向量数据库怎么选？',
];

const Welcome: React.FC<WelcomeProps> = ({ onExampleClick }) => {
  return (
    <div className="text-center py-16 px-5 animate-fade-in">
      <div
        className="w-16 h-16 rounded-[20px] flex items-center justify-center mx-auto mb-5"
        style={{ backgroundColor: 'var(--primary-bg)' }}
      >
        <BrainIcon className="w-8 h-8" style={{ color: 'var(--primary)' }} />
      </div>
      <h2 className="text-[22px] font-bold mb-2" style={{ color: 'var(--text)' }}>
        RAG 知识库问答
      </h2>
      <p className="text-[14px] max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
        基于向量检索 + Rerank 重排序的智能问答系统
      </p>
      <div className="flex flex-wrap justify-center gap-2.5 mt-7">
        {examples.map((example) => (
          <button
            key={example}
            onClick={() => onExampleClick(example)}
            className="px-4 py-2 rounded-full text-[13px] transition-all duration-200"
            style={{
              backgroundColor: 'var(--card)',
              color: 'var(--text-secondary)',
              borderColor: 'var(--border)',
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            {example.replace('？', '')}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Welcome;
