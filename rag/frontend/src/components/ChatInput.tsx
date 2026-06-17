import React, { useState, useRef, KeyboardEvent } from 'react';
import { SendIcon } from './Icons';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSend, disabled }) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (value.trim() && !disabled) {
      onSend(value.trim());
      setValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

  return (
    <div className="p-4 border-t flex-shrink-0" style={{ backgroundColor: 'var(--card)', borderTopColor: 'var(--border)' }}>
      <div
        className="flex items-end gap-2.5 rounded-2xl px-4 py-1.5 transition-all duration-200"
        style={{
          backgroundColor: 'var(--gray-50)',
          borderWidth: '1.5px',
          borderStyle: 'solid',
          borderColor: 'var(--border)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="输入问题，基于知识库获取答案…"
          rows={1}
          className="flex-1 bg-transparent resize-none text-[14px] leading-relaxed max-h-[120px] outline-none py-2"
          style={{ color: 'var(--text)' }}
          disabled={disabled}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200"
          style={{
            backgroundColor: disabled ? 'var(--gray-200)' : 'var(--primary)',
            color: disabled ? 'var(--gray-400)' : 'var(--primary-text)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <SendIcon className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
