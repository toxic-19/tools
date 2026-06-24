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

export interface AgentState {
  turns: AgentTurn[];
  currentTurnId: string | null;
}

const INITIAL: AgentState = {
  turns: [],
  currentTurnId: null,
};

const STORAGE_KEY = 'rag.agent.chat.turns.v1';

function loadInitialState(): AgentState {
  if (typeof window === 'undefined') return INITIAL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    const turns = JSON.parse(raw) as AgentTurn[];
    if (!Array.isArray(turns)) return INITIAL;
    return {
      turns: turns.map((turn) => ({ ...turn, loading: false })),
      currentTurnId: null,
    };
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.turns));
  }, [state.turns]);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    window.localStorage.removeItem(STORAGE_KEY);
    setState(INITIAL);
  }, []);

  /** 更新某一轮对话的局部字段 */
  const patchTurn = (id: string, patch: Partial<AgentTurn>) => {
    setState((s) => ({
      ...s,
      turns: s.turns.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  };

  const send = useCallback(async (instruction: string) => {
    if (!instruction.trim()) return;
    if (abortRef.current) abortRef.current.abort();

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

    setState((s) => ({
      turns: [...s.turns, newTurn],
      currentTurnId: turnId,
    }));

    const handle = agentChatStream(
      instruction,
      undefined,
      undefined,
      {
        onEvent: (ev) => {
          setState((s) => {
            const turns = s.turns.map((t) => {
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
            return { ...s, turns };
          });
        },
        onError: (err) => {
          patchTurn(turnId, { loading: false, error: err.message });
        },
        onDone: () => {
          patchTurn(turnId, { loading: false });
        },
      }
    );
    abortRef.current = handle;
  }, []);

  const sendSync = useCallback(async (instruction: string) => {
    if (!instruction.trim()) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;

    const turnId = nextTurnId();
    setState((s) => ({
      turns: [
        ...s.turns,
        { id: turnId, instruction, trace: [], answer: null, error: null, toolCallsCount: 0, totalElapsedMs: 0, loading: true },
      ],
      currentTurnId: turnId,
    }));

    try {
      const res = await agentChat(instruction);
      patchTurn(turnId, {
        loading: false,
        trace: res.trace,
        answer: res.answer,
        error: res.error ?? null,
        toolCallsCount: res.tool_calls_count,
        totalElapsedMs: res.total_elapsed_ms,
      });
    } catch (e) {
      patchTurn(turnId, {
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  return { state, send, sendSync, reset };
}
