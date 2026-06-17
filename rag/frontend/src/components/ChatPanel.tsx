import React, { useRef, useEffect } from 'react';
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

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, loading, onSend, onCitationClick }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
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
