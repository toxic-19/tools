import { useState, useCallback, useEffect, useRef } from 'react';
import { query, getChatHistory, saveChatMessages, Citation, QueryResponse } from '../api';
import { RAGStep, RAGStepStatus } from '../components/RAGSteps';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  searchCount?: number;
  rerankCount?: number;
  error?: string;
  ragSteps?: RAGStep[];
  stepsCollapsed?: boolean;
}

/** 从 API timing 数据构建 RAG 步骤 */
function buildStepsFromResponse(resp: QueryResponse): RAGStep[] {
  const t = resp.timing ?? {};
  const fmt = (ms?: number) => (ms != null ? `${ms}ms` : '');

  return [
    {
      id: 'embed',
      title: 'Query Embedding',
      detail: fmt(t.embed),
      status: 'done',
    },
    {
      id: 'retrieve',
      title: `Milvus 向量检索 (Top-${resp.search_count})`,
      detail: `召回 ${resp.search_count} 条结果${t.retrieve ? ' · ' + fmt(t.retrieve) : ''}`,
      status: 'done',
    },
    {
      id: 'rerank',
      title: `Rerank 重排序 (保留 Top-${resp.rerank_count})`,
      detail: `精选 ${resp.rerank_count} 条${t.rerank ? ' · ' + fmt(t.rerank) : ''}`,
      status: 'done',
    },
    {
      id: 'llm',
      title: 'LLM 生成答案',
      detail: fmt(t.llm) || (t.total ? `总计 ${fmt(t.total)}` : ''),
      status: 'done',
    },
  ];
}

/** 等待中的步骤（真实进度未知，只显示 running 态） */
function buildWaitingSteps(): RAGStep[] {
  return [
    { id: 'embed', title: 'Query Embedding...', detail: '将问题转为向量', status: 'running' },
    { id: 'retrieve', title: 'Milvus 向量检索...', detail: '', status: 'pending' },
    { id: 'rerank', title: 'Rerank 重排序...', detail: '', status: 'pending' },
    { id: 'llm', title: 'LLM 生成答案...', detail: '', status: 'pending' },
  ];
}

/** 从历史消息恢复步骤 */
function buildHistorySteps(m: { search_count?: number | null; rerank_count?: number | null }): RAGStep[] {
  return [
    { id: 'embed', title: 'Query Embedding', detail: '', status: 'done' },
    { id: 'retrieve', title: `Milvus 向量检索 (Top-${m.search_count ?? '?'})`, detail: `召回 ${m.search_count ?? '?'} 条结果`, status: 'done' },
    { id: 'rerank', title: `Rerank 重排序 (保留 Top-${m.rerank_count ?? '?'})`, detail: `精选 ${m.rerank_count ?? '?'} 条`, status: 'done' },
    { id: 'llm', title: 'LLM 生成答案', detail: '历史消息', status: 'done' },
  ];
}

export function useChat(conversationId: number | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const prevConvIdRef = useRef<number | null>(null);

  // ---- 切换会话或首次加载时，加载历史记录 ----
  useEffect(() => {
    if (conversationId === null) {
      setMessages([]);
      setHistoryLoaded(true);
      return;
    }

    // 会话切换时清空旧消息
    if (prevConvIdRef.current !== conversationId) {
      setMessages([]);
      setHistoryLoaded(false);
    }
    prevConvIdRef.current = conversationId;

    let cancelled = false;
    const convId = conversationId;
    (async () => {
      try {
        const data = await getChatHistory(convId);
        if (cancelled) return;
        const restored: Message[] = data.messages.map((m, i) => ({
          id: `history-${m.id ?? i}`,
          role: m.role,
          content: m.content,
          citations: m.citations ?? undefined,
          searchCount: m.search_count ?? undefined,
          rerankCount: m.rerank_count ?? undefined,
          ragSteps: m.role === 'assistant' && m.content
            ? buildHistorySteps(m)
            : undefined,
          stepsCollapsed: m.role === 'assistant',  // 历史消息默认折叠
        }));
        setMessages(restored);
      } catch (err) {
        console.warn('加载聊天记录失败:', err);
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId]);

  // ---- 发送消息 ----
  const sendMessage = useCallback(async (question: string) => {
    if (conversationId === null) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      ragSteps: buildWaitingSteps(),
      stepsCollapsed: false,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setLoading(true);
    setStreamingId(assistantId);

    const currentConvId = conversationId;

    try {
      const response = await query({ question });

      const finalSteps = buildStepsFromResponse(response);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: response.answer,
                citations: response.citations,
                searchCount: response.search_count,
                rerankCount: response.rerank_count,
                ragSteps: finalSteps,
                stepsCollapsed: true,  // 回答完成后默认折叠
              }
            : msg
        )
      );

      // 保存到后端（绑定当前会话）
      saveChatMessages(currentConvId, [
        { role: 'user', content: question },
        {
          role: 'assistant',
          content: response.answer,
          citations: response.citations,
          search_count: response.search_count,
          rerank_count: response.rerank_count,
        },
      ]).catch((err) => console.warn('保存聊天记录失败:', err));

    } catch (err) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                error: err instanceof Error ? err.message : 'Request failed',
                ragSteps: buildWaitingSteps().map((s) => ({ ...s, status: 'done' as RAGStepStatus })),
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
      setStreamingId(null);
    }
  }, [conversationId]);

  const clearMessages = useCallback(async () => {
    setMessages([]);
    // 不再调用清空 API，因为删除会话时会级联删除消息
  }, []);

  return { messages, loading, streamingId, sendMessage, clearMessages, historyLoaded };
}
