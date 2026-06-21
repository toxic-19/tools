import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Citation } from '../api';
import RAGSteps, { RAGStep } from './RAGSteps';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  error?: string;
  ragSteps?: RAGStep[];
  stepsCollapsed?: boolean;
  onCitationClick?: (index: number) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  role,
  content,
  citations = [],
  error,
  ragSteps,
  stepsCollapsed,
  onCitationClick,
}) => {
  const isUser = role === 'user';
  const isEmpty = !content && !error;

  const renderContent = (text: string) => {
    if (isUser) {
      return <div className="whitespace-pre-wrap break-words">{text}</div>;
    }
    return (
      <div className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => {
              const processChildren = (kids: React.ReactNode): React.ReactNode => {
                if (typeof kids === 'string') {
                  const parts: React.ReactNode[] = [];
                  const regex = /\[(\d+)\]/g;
                  let lastIndex = 0;
                  let match;
                  while ((match = regex.exec(kids)) !== null) {
                    if (match.index > lastIndex) {
                      parts.push(kids.substring(lastIndex, match.index));
                    }
                    const idx = parseInt(match[1], 10) - 1;
                    parts.push(
                      <sup
                        key={`ref-${match.index}`}
                        className="cursor-pointer mx-0.5 px-1 rounded text-[11px] font-bold transition-colors"
                        style={{
                          color: 'var(--primary)',
                          backgroundColor: 'var(--primary-bg)',
                        }}
                        onClick={() => onCitationClick?.(idx)}
                        title={`查看引用 [${idx + 1}]`}
                      >
                        {match[1]}
                      </sup>
                    );
                    lastIndex = regex.lastIndex;
                  }
                  if (lastIndex < kids.length) {
                    parts.push(kids.substring(lastIndex));
                  }
                  return parts.length > 0 ? parts : kids;
                }
                return kids;
              };
              return <p className="mb-2 last:mb-0 leading-relaxed">{processChildren(children)}</p>;
            },
            h1: ({ children }) => <h1 className="text-xl font-bold mt-3 mb-2">{children}</h1>,
            h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-bold mt-2 mb-1">{children}</h3>,
            h4: ({ children }) => <h4 className="text-[15px] font-semibold mt-2 mb-1">{children}</h4>,
            ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote
                className="border-l-4 pl-3 my-2 italic"
                style={{ borderLeftColor: 'var(--primary-border)', borderLeftWidth: '4px' }}
              >
                {children}
              </blockquote>
            ),
            code: ({ inline, children }: any) =>
              inline ? (
                <code
                  className="px-1.5 py-0.5 rounded text-[13px] font-mono"
                  style={{ backgroundColor: 'var(--gray-100)', color: 'var(--text)' }}
                >
                  {children}
                </code>
              ) : (
                <code
                  className="block p-3 rounded-lg text-[13px] font-mono overflow-x-auto my-2 whitespace-pre-wrap"
                  style={{ backgroundColor: 'var(--gray-100)', color: 'var(--text)' }}
                >
                  {children}
                </code>
              ),
            a: ({ children, href }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors"
                style={{ color: 'var(--primary)' }}
              >
                {children}
              </a>
            ),
            strong: ({ children }) => <strong className="font-semibold" style={{ color: 'var(--text)' }}>{children}</strong>,
            em: ({ children }) => <em className="italic">{children}</em>,
            hr: () => <hr className="my-3" style={{ borderColor: 'var(--border)' }} />,
            table: ({ children }) => (
              <table className="border-collapse my-2 text-[13px] w-full" style={{ borderColor: 'var(--border)' }}>
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
          {text}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <div
      className={`flex gap-3 mb-4 message-enter ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-bold flex-shrink-0"
        style={{
          backgroundColor: isUser ? 'var(--primary)' : 'var(--gray-100)',
          color: isUser ? 'var(--primary-text)' : 'var(--text-secondary)',
          border: isUser ? 'none' : '1px solid var(--border)',
        }}
      >
        {isUser ? 'U' : 'AI'}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
        {/* Main bubble — RAG Steps and content share the same container for consistent width */}
        {(!isUser && ragSteps && ragSteps.length > 0) || !isEmpty ? (
          <div
            className={`inline-block max-w-full px-4 py-2.5 text-[14px] leading-relaxed break-words transition-all duration-200 ${
              isUser ? 'rounded-tr-md' : 'rounded-tl-md'
            }`}
            style={{
              backgroundColor: isUser ? 'var(--primary)' : 'var(--card-style-bg, var(--card))',
              color: isUser ? 'var(--primary-text)' : 'var(--text)',
              border: isUser ? 'none' : '1px solid var(--card-style-border, var(--border))',
              borderRadius: isUser
                ? `var(--card-style-radius, 12px) var(--card-style-radius, 12px) 4px var(--card-style-radius, 12px)`
                : `var(--card-style-radius, 12px) var(--card-style-radius, 12px) var(--card-style-radius, 12px) 4px`,
              boxShadow: isUser ? '0 1px 2px rgba(0,0,0,0.05)' : 'var(--card-style-shadow, none)',
              backdropFilter: 'var(--card-style-blur, none)',
              WebkitBackdropFilter: 'var(--card-style-blur, none)',
              opacity: isUser ? 1 : 'var(--card-style-opacity, 1)',
            }}
          >
            {/* RAG Steps — inside bubble for consistent width */}
            {!isUser && ragSteps && ragSteps.length > 0 && (
              <div className="mb-1">
                <RAGSteps steps={ragSteps} defaultCollapsed={stepsCollapsed} />
              </div>
            )}

            {/* Message content */}
            {!isEmpty && (
              <>
                {error ? (
                  <span style={{ color: 'var(--danger)' }}>请求失败: {error}</span>
                ) : (
                  renderContent(content)
                )}
              </>
            )}
          </div>
        ) : null}

        {/* Citation chips (click to open right drawer) */}
        {!isUser && citations.length > 0 && !isEmpty && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <button
              onClick={() => onCitationClick?.(0)}
              className="flex items-center gap-1 text-[11px] font-semibold transition-colors"
              style={{ color: 'var(--primary)' }}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              引用来源
            </button>
            {citations.slice(0, 8).map((_, index) => (
              <button
                key={index}
                onClick={() => onCitationClick?.(index)}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors hover:opacity-80"
                style={{
                  color: 'var(--primary)',
                  backgroundColor: 'var(--primary-bg)',
                }}
                title={`查看引用 [${index + 1}]`}
              >
                [{index + 1}]
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
