import { useState, useCallback, useEffect } from 'react';
import {
  Conversation,
  getConversations,
  createConversation,
  renameConversation as renameConvApi,
  deleteConversation as deleteConvApi,
} from '../api';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  // ---- 加载会话列表 ----
  const loadConversations = useCallback(async () => {
    try {
      const data = await getConversations();
      setConversations(data.conversations);

      // 如果当前没有选中的会话，自动选择最新的
      if (data.conversations.length > 0 && activeId === null) {
        setActiveId(data.conversations[0].id);
      }
    } catch (err) {
      console.warn('加载会话列表失败:', err);
    }
  }, [activeId]);

  // 首次加载
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getConversations();
        if (cancelled) return;
        setConversations(data.conversations);
        if (data.conversations.length > 0) {
          setActiveId(data.conversations[0].id);
        }
      } catch (err) {
        console.warn('加载会话列表失败:', err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- 新建会话 ----
  const createNew = useCallback(async (title?: string): Promise<number | null> => {
    try {
      const data = await createConversation(title);
      const newConv = data.conversation;
      setConversations((prev) => [newConv, ...prev]);
      setActiveId(newConv.id);
      return newConv.id;
    } catch (err) {
      console.warn('创建会话失败:', err);
      return null;
    }
  }, []);

  // ---- 切换会话 ----
  const switchTo = useCallback((id: number) => {
    setActiveId(id);
  }, []);

  // ---- 重命名会话 ----
  const rename = useCallback(async (id: number, title: string) => {
    try {
      await renameConvApi(id, title);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      );
    } catch (err) {
      console.warn('重命名会话失败:', err);
    }
  }, []);

  // ---- 删除会话 ----
  const remove = useCallback(async (id: number) => {
    try {
      await deleteConvApi(id);
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        // 如果删除的是当前会话，切换到第一个或 null
        if (activeId === id) {
          setActiveId(next.length > 0 ? next[0].id : null);
        }
        return next;
      });
    } catch (err) {
      console.warn('删除会话失败:', err);
    }
  }, [activeId]);

  // ---- 更新会话列表中的某项（如发送消息后刷新 updated_at） ----
  const refreshOne = useCallback(async (_id?: number) => {
    try {
      const data = await getConversations();
      setConversations(data.conversations);
    } catch (err) {
      // 静默失败
    }
  }, []);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  return {
    conversations,
    activeId,
    activeConversation,
    loaded,
    loadConversations,
    createNew,
    switchTo,
    rename,
    remove,
    refreshOne,
  };
}
