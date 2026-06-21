import React, { useRef, useEffect, useLayoutEffect } from 'react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import Welcome from './Welcome';
import { Message } from '../hooks/useChat';

interface ChatPanelProps {
  messages: Message[];
  loading: boolean;
  onSend: (message: string) => void;
  onCitationClick: (citations: import('../api').Citation[], index: number) => void;
}

// 玻璃风格下，smooth 滚动 + backdrop-filter 重绘会导致肉眼可见的"闪烁/卡顿"。
// 关键修复：瞬间跳到底部（auto），并在用户主动向上滚时停止自动滚动。
const SCROLL_BOTTOM_THRESHOLD = 80; // 距底部 < 80px 视为"在底部"

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, loading, onSend, onCitationClick }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // 仅在消息数量变化时滚；步骤推进等"内容更新"不触发滚动。
  const lastMessageCountRef = useRef(0);
  const stickToBottomRef = useRef(true);

  const getIsAtBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
  };

  // useLayoutEffect 同步执行，避免一帧的"未滚到底"闪烁
  useLayoutEffect(() => {
    if (messages.length === lastMessageCountRef.current) return;
    lastMessageCountRef.current = messages.length;
    if (stickToBottomRef.current) {
      // 用 instant 跳转，不用 smooth —— smooth + backdrop-filter = 闪烁
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [messages.length]);

  // 监听用户手动滚动：向上滚则解除"粘住底部"
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottomRef.current = getIsAtBottom();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-4 chat-scroll">
        {messages.length === 0 ? (
          <Welcome onExampleClick={onSend} />
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              content={message.content}
              citations={message.citations}
              error={message.error}
              ragSteps={message.ragSteps}
              stepsCollapsed={message.stepsCollapsed}
              onCitationClick={(index) => message.citations && onCitationClick(message.citations, index)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={onSend} disabled={loading} />
    </div>
  );
};

export default ChatPanel;
