// Agent 平台相关 API
// 端口:Agent Hub 默认 :8100,通过环境变量配置

export interface AgentTool {
  name: string;
  kind: 'mcp' | 'mock_microservice' | 'sandbox';
  backend: string;
  description: string;
  parameters: Record<string, any>;
}

export interface AgentToolsResponse {
  tools: AgentTool[];
  total: number;
}

export interface TraceEventDTO {
  phase: 'perceive' | 'think' | 'act' | 'observe' | 'final' | 'error';
  step: number;
  content?: Record<string, any> | null;
  tool_name?: string | null;
  tool_args?: Record<string, any> | null;
  tool_result?: Record<string, any> | null;
  elapsed_ms: number;
  message?: string | null;
  ts: number;
}

export interface AgentChatResponse {
  answer: string;
  tool_calls_count: number;
  total_elapsed_ms: number;
  trace: TraceEventDTO[];
  error?: string | null;
}

export interface AgentHealth {
  status: string;
  agent?: {
    max_steps: number;
    rag_topk: number;
  };
  mcp_server?: {
    ok: boolean;
    url?: string;
    tools_count?: number;
    tool_names?: string[];
    error?: string;
  };
  mock_microservice_enabled?: boolean;
  sandbox?: {
    ok: boolean;
    timeout_ms: number;
  };
  error?: string;
}

const API_BASE = '/api/agent';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function getAgentHealth(): Promise<AgentHealth> {
  return handleResponse<AgentHealth>(
    await fetch(`${API_BASE}/health`)
  );
}

export async function getAgentTools(): Promise<AgentToolsResponse> {
  return handleResponse<AgentToolsResponse>(
    await fetch(`${API_BASE}/tools`)
  );
}

export async function agentChat(
  instruction: string,
  max_steps?: number,
  rag_topk?: number
): Promise<AgentChatResponse> {
  return handleResponse<AgentChatResponse>(
    await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        max_steps,
        rag_topk,
      }),
    })
  );
}

export interface StreamCallbacks {
  onEvent: (ev: TraceEventDTO) => void;
  onError?: (err: Error) => void;
  onDone?: () => void;
}

/**
 * 通过 fetch + ReadableStream 走 POST 路径的 SSE 流(浏览器 EventSource 只支持 GET)。
 * fetch 收到响应后,逐行解析 `data: <json>` 字段。
 */
export function agentChatStream(
  instruction: string,
  max_steps: number | undefined,
  rag_topk: number | undefined,
  callbacks: StreamCallbacks
): { abort: () => void } {
  const controller = new AbortController();
  let aborted = false;

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ instruction, max_steps, rag_topk }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (!aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // 按 \n\n 切分 SSE 消息
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') {
              callbacks.onDone?.();
              return;
            }
            try {
              const ev = JSON.parse(data) as TraceEventDTO;
              callbacks.onEvent(ev);
            } catch (e) {
              console.warn('SSE parse error:', e, data);
            }
          }
        }
      }
      callbacks.onDone?.();
    } catch (e) {
      if (aborted) return;
      callbacks.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  })();

  return {
    abort: () => {
      aborted = true;
      controller.abort();
    },
  };
}
