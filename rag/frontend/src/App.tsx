import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import HeaderBrand from './components/HeaderBrand';
import ChatPanel from './components/ChatPanel';
import UploadPanel from './components/UploadPanel';
import SettingsPanel from './components/SettingsPanel';
import MetricsPanel from './components/MetricsPanel';
import SwitcherPopup from './components/SwitcherPopup';
import CitationDrawer from './components/CitationDrawer';
import Toast, { useToast } from './components/Toast';
import { useTheme } from './hooks/useTheme';
import { useChat } from './hooks/useChat';
import { useStats } from './hooks/useStats';
import { useRecords } from './hooks/useRecords';
import { useConversations } from './hooks/useConversations';
import { reset, Citation } from './api';
import { SunIcon } from './components/Icons';

type Panel = 'chat' | 'upload' | 'settings' | 'metrics';

const App: React.FC = () => {
  const [activePanel, setActivePanel] = useState<Panel>('chat');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCitations, setDrawerCitations] = useState<Citation[]>([]);
  const [drawerActiveIndex, setDrawerActiveIndex] = useState(0);

  const { theme, layout, style, setTheme, setLayout, setStyle } = useTheme();
  const {
    conversations,
    activeId,
    createNew,
    switchTo,
    rename,
    remove,
    refreshOne,
  } = useConversations();
  const { messages, loading, sendMessage, clearMessages } = useChat(activeId);
  const { stats, loadStats } = useStats();
  const { records, loadRecords } = useRecords();
  const { toasts, showToast } = useToast();

  useEffect(() => {
    if (activePanel === 'upload') {
      loadRecords();
    }
  }, [activePanel, loadRecords]);

  // 发送消息后刷新会话列表（更新 updated_at 和 message_count）
  const handleSend = useCallback(
    async (msg: string) => {
      await sendMessage(msg);
      if (activeId !== null) {
        refreshOne(activeId);
      }
    },
    [sendMessage, activeId, refreshOne]
  );

  // 新建对话
  const handleNewConversation = useCallback(async () => {
    await createNew();
    setActivePanel('chat');
  }, [createNew]);

  // 删除对话
  const handleDeleteConversation = useCallback(
    async (id: number) => {
      await remove(id);
    },
    [remove]
  );

  const handleReset = useCallback(async () => {
    if (!window.confirm('确定要清空知识库吗？此操作不可恢复（将删除所有对话和消息）。'))
      return;
    try {
      await reset();
      showToast('知识库已清空', 'success');
      loadStats();
      clearMessages();
      // 重新加载以刷新会话列表
      window.location.reload();
    } catch (err) {
      showToast(
        `清空失败: ${err instanceof Error ? err.message : '未知错误'}`,
        'error'
      );
    }
  }, [loadStats, showToast, clearMessages]);

  const handleCitationClick = useCallback(
    (citations: Citation[], index: number) => {
      setDrawerCitations(citations);
      setDrawerActiveIndex(index);
      setDrawerOpen(true);
    },
    []
  );

  const panelTitles: Record<Panel, string> = {
    chat: '智能问答',
    upload: '文档管理',
    settings: '系统配置',
    metrics: '性能监控',
  };

  const statsData = {
    chunks: typeof stats?.row_count === 'number' ? stats.row_count : 0,
    dimension: typeof stats?.dimension === 'number' ? stats.dimension : 0,
    collection: stats?.collection ?? 'rag_demo',
  };

  return (
    <div className="h-full flex">
      {/* Sidebar (Layout: Sidebar only) */}
      {layout === 'sidebar' && (
        <Sidebar
          activePanel={activePanel}
          onPanelChange={(panel) => setActivePanel(panel as Panel)}
          stats={{ chunks: statsData.chunks, dimension: statsData.dimension }}
          conversations={conversations}
          activeConversationId={activeId}
          onNewConversation={handleNewConversation}
          onSwitchConversation={switchTo}
          onRenameConversation={rename}
          onDeleteConversation={handleDeleteConversation}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {layout !== 'sidebar' && (
          <HeaderBrand onRefresh={loadStats} onReset={handleReset} />
        )}

        {/* Topbar */}
        <div
          className="h-12 flex items-center px-4 gap-3 flex-shrink-0"
          style={{
            backgroundColor: 'var(--card)',
            borderBottomColor: 'var(--border)',
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
          }}
        >
          <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
            {panelTitles[activePanel]}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setSwitcherOpen(!switcherOpen)}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
            style={{
              backgroundColor: 'var(--card)',
              borderColor: 'var(--border)',
              borderWidth: '1px',
              borderStyle: 'solid',
              color: 'var(--text-secondary)',
            }}
            title="主题/布局/风格"
          >
            <SunIcon className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Panels */}
        {activePanel === 'chat' && (
          <div className="flex-1 flex overflow-hidden">
            <ChatPanel
              messages={messages}
              loading={loading}
              onSend={handleSend}
              onCitationClick={handleCitationClick}
            />
            <CitationDrawer
              open={drawerOpen}
              citations={drawerCitations}
              activeIndex={drawerActiveIndex}
              onClose={() => setDrawerOpen(false)}
              onNavigate={setDrawerActiveIndex}
            />
          </div>
        )}
        {activePanel === 'upload' && (
          <UploadPanel
            records={records}
            onRefresh={loadRecords}
            onToast={showToast}
          />
        )}
        {activePanel === 'settings' && <SettingsPanel stats={statsData} />}
        {activePanel === 'metrics' && <MetricsPanel />}
      </div>

      {/* Switcher Popup */}
      {switcherOpen && (
        <SwitcherPopup
          theme={theme}
          layout={layout}
          style={style}
          onThemeChange={setTheme}
          onLayoutChange={setLayout}
          onStyleChange={setStyle}
          onClose={() => setSwitcherOpen(false)}
        />
      )}

      {/* Toasts */}
      <Toast toasts={toasts} />
    </div>
  );
};

export default App;
