import { useCallback, useEffect, useRef, useState } from 'react';
import { TraceEventDTO, agentChat, agentChatStream } from '../api/agent';

export interface AgentTurn {
  id: string;
  instruction: string;
  trace: TraceEventDTO[];
  answer: string | null;
  error: string | null;
  toolCallsCount: number;
  totalElapsedMs: number;
  loading: boolean;
}

export interface AgentConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: AgentTurn[];
}

export interface AgentState {
  conversations: AgentConversation[];
  activeConversationId: string | null;
  turns: AgentTurn[];
  currentTurnId: string | null;
}

const INITIAL: AgentState = {
  conversations: [],
  activeConversationId: null,
  turns: [],
  currentTurnId: null,
};

const STORAGE_KEY = 'rag.agent.chat.conversations.v2';
const LEGACY_TURNS_STORAGE_KEY = 'rag.agent.chat.turns.v1';

function nextConversationId(): string {
  return `agent-conv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function titleFromInstruction(instruction: string): string {
  const title = instruction.trim().replace(/\s+/g, ' ');
  return title.length > 22 ? `${title.slice(0, 22)}...` : title || '新对话';
}

function makeConversation(title = '新对话'): AgentConversation {
  const now = Date.now();
  return {
    id: nextConversationId(),
    title,
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
}

function normalizeConversation(conversation: AgentConversation): AgentConversation {
  return {
    ...conversation,
    turns: Array.isArray(conversation.turns)
      ? conversation.turns.map((turn) => ({ ...turn, loading: false }))
      : [],
  };
}

function withActiveTurns(state: Omit<AgentState, 'turns'>): AgentState {
  const active = state.conversations.find((conversation) => conversation.id === state.activeConversationId);
  return {
    ...state,
    turns: active?.turns ?? [],
  };
}

function loadInitialState(): AgentState {
  if (typeof window === 'undefined') return INITIAL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as {
        conversations?: AgentConversation[];
        activeConversationId?: string | null;
      };
      const conversations = Array.isArray(stored.conversations)
        ? stored.conversations.map(normalizeConversation)
        : [];
      const activeConversationId =
        stored.activeConversationId && conversations.some((conversation) => conversation.id === stored.activeConversationId)
          ? stored.activeConversationId
          : conversations[0]?.id ?? null;
      return withActiveTurns({ conversations, activeConversationId, currentTurnId: null });
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_TURNS_STORAGE_KEY);
    if (!legacyRaw) return INITIAL;
    const turns = JSON.parse(legacyRaw) as AgentTurn[];
    if (!Array.isArray(turns) || turns.length === 0) return INITIAL;
    const migrated = makeConversation('历史对话');
    migrated.turns = turns.map((turn) => ({ ...turn, loading: false }));
    migrated.updatedAt = Date.now();
    window.localStorage.removeItem(LEGACY_TURNS_STORAGE_KEY);
    return withActiveTurns({
      conversations: [migrated],
      activeConversationId: migrated.id,
      currentTurnId: null,
    });
  } catch {
    return INITIAL;
  }
}

let _turnCounter = 0;
function nextTurnId(): string {
  return `turn-${++_turnCounter}-${Date.now()}`;
}

export function useAgentChat() {
  const [state, setState] = useState<AgentState>(loadInitialState);
  const abortRef = useRef<{ abort: () => void } | null>(null);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
      })
    );
  }, [state.conversations, state.activeConversationId]);

  const abortCurrent = () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
  };

  const reset = useCallback(() => {
    abortCurrent();
    setState((s) =>
      withActiveTurns({
        conversations: s.conversations.map((conversation) =>
          conversation.id === s.activeConversationId
            ? { ...conversation, turns: [], updatedAt: Date.now() }
            : conversation
        ),
        activeConversationId: s.activeConversationId,
        currentTurnId: null,
      })
    );
  }, []);

  /** 更新某一轮对话的局部字段 */
  const patchTurn = (conversationId: string, id: string, patch: Partial<AgentTurn>) => {
    setState((s) => ({
      ...withActiveTurns({
        conversations: s.conversations.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                updatedAt: Date.now(),
                turns: conversation.turns.map((t) => (t.id === id ? { ...t, ...patch } : t)),
              }
            : conversation
        ),
        activeConversationId: s.activeConversationId,
        currentTurnId: s.currentTurnId,
      }),
    }));
  };

  const createConversation = useCallback(() => {
    abortCurrent();
    const conversation = makeConversation();
    setState((s) =>
      withActiveTurns({
        conversations: [conversation, ...s.conversations],
        activeConversationId: conversation.id,
        currentTurnId: null,
      })
    );
  }, []);

  const switchConversation = useCallback((conversationId: string) => {
    abortCurrent();
    setState((s) =>
      withActiveTurns({
        conversations: s.conversations,
        activeConversationId: conversationId,
        currentTurnId: null,
      })
    );
  }, []);

  const deleteConversation = useCallback((conversationId: string) => {
    abortCurrent();
    setState((s) => {
      const conversations = s.conversations.filter((conversation) => conversation.id !== conversationId);
      const activeConversationId =
        s.activeConversationId === conversationId ? conversations[0]?.id ?? null : s.activeConversationId;
      return withActiveTurns({ conversations, activeConversationId, currentTurnId: null });
    });
  }, []);

  const send = useCallback(async (instruction: string) => {
    if (!instruction.trim()) return;
    abortCurrent();

    const now = Date.now();
    const turnId = nextTurnId();
    const newTurn: AgentTurn = {
      id: turnId,
      instruction,
      trace: [],
      answer: null,
      error: null,
      toolCallsCount: 0,
      totalElapsedMs: 0,
      loading: true,
    };
    let targetConversationId = state.activeConversationId;
    if (!targetConversationId) {
      const conversation = makeConversation(titleFromInstruction(instruction));
      targetConversationId = conversation.id;
      setState((s) =>
        withActiveTurns({
          conversations: [{ ...conversation, turns: [newTurn], updatedAt: now }, ...s.conversations],
          activeConversationId: conversation.id,
          currentTurnId: turnId,
        })
      );
    } else {
      const conversationId = targetConversationId;
      setState((s) =>
        withActiveTurns({
          conversations: s.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  title: conversation.turns.length === 0 ? titleFromInstruction(instruction) : conversation.title,
                  updatedAt: now,
                  turns: [...conversation.turns, newTurn],
                }
              : conversation
          ),
          activeConversationId: conversationId,
          currentTurnId: turnId,
        })
      );
    }

    const conversationId = targetConversationId;

    const handle = agentChatStream(
      instruction,
      undefined,
      undefined,
      {
        onEvent: (ev) => {
          setState((s) => {
            const conversations = s.conversations.map((conversation) => {
              if (conversation.id !== conversationId) return conversation;
              const turns = conversation.turns.map((t) => {
                if (t.id !== turnId) return t;
                const newTrace = [...t.trace, ev];
                let toolCalls = t.toolCallsCount;
                let answer = t.answer;
                let totalMs = t.totalElapsedMs;
                if (ev.phase === 'act') toolCalls += 1;
                if (ev.phase === 'final') {
                  answer = (ev.content as any)?.answer ?? answer;
                  totalMs = ev.elapsed_ms || totalMs;
                }
                return { ...t, trace: newTrace, toolCallsCount: toolCalls, answer, totalElapsedMs: totalMs };
              });
              return { ...conversation, turns, updatedAt: Date.now() };
            });
            return withActiveTurns({
              conversations,
              activeConversationId: s.activeConversationId,
              currentTurnId: s.currentTurnId,
            });
          });
        },
        onError: (err) => {
          patchTurn(conversationId, turnId, { loading: false, error: err.message });
        },
        onDone: () => {
          patchTurn(conversationId, turnId, { loading: false });
        },
      }
    );
    abortRef.current = handle;
  }, [state.activeConversationId]);

  const sendSync = useCallback(async (instruction: string) => {
    if (!instruction.trim()) return;
    abortCurrent();

    const now = Date.now();
    const turnId = nextTurnId();
    const newTurn = { id: turnId, instruction, trace: [], answer: null, error: null, toolCallsCount: 0, totalElapsedMs: 0, loading: true };
    let conversationId = state.activeConversationId;
    if (!conversationId) {
      const conversation = makeConversation(titleFromInstruction(instruction));
      conversationId = conversation.id;
      setState((s) =>
        withActiveTurns({
          conversations: [{ ...conversation, turns: [newTurn], updatedAt: now }, ...s.conversations],
          activeConversationId: conversation.id,
          currentTurnId: turnId,
        })
      );
    } else {
      const targetConversationId = conversationId;
      setState((s) =>
        withActiveTurns({
          conversations: s.conversations.map((conversation) =>
            conversation.id === targetConversationId
              ? {
                  ...conversation,
                  title: conversation.turns.length === 0 ? titleFromInstruction(instruction) : conversation.title,
                  updatedAt: now,
                  turns: [...conversation.turns, newTurn],
                }
              : conversation
          ),
          activeConversationId: targetConversationId,
          currentTurnId: turnId,
        })
      );
    }

    try {
      const res = await agentChat(instruction);
      patchTurn(conversationId, turnId, {
        loading: false,
        trace: res.trace,
        answer: res.answer,
        error: res.error ?? null,
        toolCallsCount: res.tool_calls_count,
        totalElapsedMs: res.total_elapsed_ms,
      });
    } catch (e) {
      patchTurn(conversationId, turnId, {
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [state.activeConversationId]);

  return { state, send, sendSync, reset, createConversation, switchConversation, deleteConversation };
}
