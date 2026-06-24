import React, { useState, useRef, useEffect } from 'react';
import {
  ChatIcon,
  FileIcon,
  SettingsIcon,
  ActivityIcon,
  BrainIcon,
  PlusIcon,
  EditIcon,
  XIcon,
  TrashIcon,
  CheckIcon,
} from './Icons';
import { Conversation } from '../api';

interface SidebarProps {
  activePanel: string;
  onPanelChange: (panel: string) => void;
  stats: { chunks: number; dimension: number };
  // 会话管理
  conversations: Conversation[];
  activeConversationId: number | null;
  onNewConversation: () => void;
  onSwitchConversation: (id: number) => void;
  onRenameConversation: (id: number, title: string) => void;
  onDeleteConversation: (id: number) => void;
}

const NAV_SECTIONS = [
  {
    label: '功能',
    items: [
      { id: 'chat', label: '智能问答', icon: ChatIcon },
      { id: 'upload', label: '文档管理', icon: FileIcon },
      { id: 'agent', label: '智能体平台', icon: BrainIcon },
    ],
  },
  {
    label: '监控',
    items: [{ id: 'metrics', label: '性能监控', icon: ActivityIcon }],
  },
  {
    label: '管理',
    items: [{ id: 'settings', label: '系统配置', icon: SettingsIcon }],
  },
];

const Sidebar: React.FC<SidebarProps> = ({
  activePanel,
  onPanelChange,
  stats,
  conversations,
  activeConversationId,
  onNewConversation,
  onSwitchConversation,
  onRenameConversation,
  onDeleteConversation,
}) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 开始编辑
  const startEdit = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  // 确认编辑
  const confirmEdit = () => {
    if (editingId !== null && editTitle.trim()) {
      onRenameConversation(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  // 聚焦编辑输入框
  useEffect(() => {
    if (editingId !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  return (
    <div
      className="w-[var(--sidebar-w)] flex flex-col duration-200"
      style={{
        backgroundColor: 'var(--card-style-bg, var(--card))',
        borderRightColor: 'var(--card-style-border, var(--border))',
        borderRightWidth: '1px',
        borderRightStyle: 'solid',
        backdropFilter: 'var(--card-style-blur, none)',
        WebkitBackdropFilter: 'var(--card-style-blur, none)',
      }}
    >
      {/* Header */}
      <div
        className="p-5"
        style={{
          borderBottomColor: 'var(--border)',
          borderBottomWidth: '1px',
          borderBottomStyle: 'solid',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-base"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            R
          </div>
          <div>
            <div className="font-bold text-[15px]" style={{ color: 'var(--text)' }}>
              RAG 知识库
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              检索增强生成问答平台
            </div>
          </div>
        </div>
      </div>

      {/* 对话列表区域 */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center justify-between px-2 mb-2">
          <span
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            对话记录
          </span>
          <button
            onClick={onNewConversation}
            className="w-5 h-5 rounded flex items-center justify-center transition-opacity duration-150 hover:opacity-70"
            style={{ color: 'var(--primary)' }}
            title="新建对话"
          >
            <PlusIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-0.5 max-h-[280px] overflow-y-auto">
          {conversations.length === 0 && (
            <div
              className="text-[12px] text-center py-3 px-2"
              style={{ color: 'var(--text-muted)' }}
            >
              暂无对话，点击上方 + 新建
            </div>
          )}
          {conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = conv.id === editingId;

            return (
              <div
                key={conv.id}
                className="group relative flex items-center rounded-lg cursor-pointer transition-colors duration-150"
                style={{
                  backgroundColor: isActive ? 'var(--gray-100)' : 'transparent',
                  padding: '6px 8px',
                }}
                onClick={() => {
                  if (!isEditing) {
                    onSwitchConversation(conv.id);
                    onPanelChange('chat');
                  }
                }}
              >
                {isEditing ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <input
                      ref={inputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="flex-1 min-w-0 text-[12.5px] px-1.5 py-0.5 rounded outline-none"
                      style={{
                        backgroundColor: 'var(--card)',
                        color: 'var(--text)',
                        border: '1px solid var(--primary)',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmEdit();
                      }}
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ color: 'var(--primary)' }}
                    >
                      <CheckIcon className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelEdit();
                      }}
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[12.5px] font-medium truncate"
                        style={{
                          color: isActive ? 'var(--text)' : 'var(--text-secondary)',
                        }}
                      >
                        {conv.title}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {conv.message_count ? `${conv.message_count} 条消息` : '空对话'}
                      </div>
                    </div>
                    {/* 操作按钮 — 通过 CSS group-hover 显示，无需 state */}
                    <div
                      className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(conv);
                        }}
                        className="w-5 h-5 rounded flex items-center justify-center transition-opacity duration-150 hover:opacity-70"
                        style={{ color: 'var(--text-muted)' }}
                        title="重命名"
                      >
                        <EditIcon className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            window.confirm(
                              `确定删除对话「${conv.title}」及其所有消息？`
                            )
                          ) {
                            onDeleteConversation(conv.id);
                          }
                        }}
                        className="w-5 h-5 rounded flex items-center justify-center transition-opacity duration-150 hover:opacity-70"
                        style={{ color: 'var(--danger, #e74c3c)' }}
                        title="删除对话"
                      >
                        <TrashIcon className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 分隔线 */}
      <div
        className="mx-3 my-1"
        style={{
          borderTopColor: 'var(--border)',
          borderTopWidth: '1px',
          borderTopStyle: 'solid',
        }}
      />

      {/* Navigation */}
      <div className="flex-1 p-3 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div
              className="text-[10px] font-semibold uppercase tracking-wide px-3 py-3"
              style={{ color: 'var(--text-muted)' }}
            >
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activePanel === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onPanelChange(item.id)}
                  className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-colors duration-200 text-[13.5px] font-medium"
                  style={{
                    color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                  }}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  <span
                    className="transition-colors duration-200"
                    style={{
                      textDecoration: isActive ? 'underline' : 'none',
                      textUnderlineOffset: '4px',
                      textDecorationColor: 'var(--primary)',
                      textDecorationThickness: '2px',
                    }}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Stats */}
      <div
        className="p-3"
        style={{
          borderTopColor: 'var(--border)',
          borderTopWidth: '1px',
          borderTopStyle: 'solid',
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <div
            className="text-center p-3 rounded-lg"
            style={{
              backgroundColor: 'var(--gray-50)',
              borderColor: 'var(--border)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: 'var(--card-style-radius-sm, 8px)',
            }}
          >
            <div className="text-xl font-bold" style={{ color: 'var(--primary)' }}>
              {stats.chunks}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              文档片段
            </div>
          </div>
          <div
            className="text-center p-3 rounded-lg"
            style={{
              backgroundColor: 'var(--gray-50)',
              borderColor: 'var(--border)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: 'var(--card-style-radius-sm, 8px)',
            }}
          >
            <div className="text-xl font-bold" style={{ color: 'var(--primary)' }}>
              {stats.dimension}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              向量维度
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
