// API Types
export interface QueryRequest {
  question: string;
  top_k?: number;
  rerank_top_n?: number;
}

export interface Citation {
  filename: string;
  source: string;
  page_number: number | null;
  chunk_index: number;
  text: string;
  score: number;
  rerank_score: number | null;
}

export interface QueryResponse {
  question: string;
  answer: string;
  citations: Citation[];
  search_count: number;
  rerank_count: number;
  timing?: {
    embed?: number;
    retrieve?: number;
    rerank?: number;
    llm?: number;
    total?: number;
  };
}

export interface IngestResponse {
  filename: string;
  file_type: string;
  chunks: number;
  inserted: number;
  status: string;
}

export interface StatsResponse {
  collection: string;
  row_count: number;
  dimension: number;
  fields: string[];
}

export interface Record {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  chunks: number;
  status: string;
  message: string;
  created_at: string;
}

export interface RecordsResponse {
  records: Record[];
  total: number;
  limit: number;
  offset: number;
}

// ---- 会话类型 ----

export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message_at?: string | null;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
}

// ---- 聊天类型 ----

export interface ChatMessageItem {
  id?: number;
  conversation_id?: number;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[] | null;
  search_count?: number | null;
  rerank_count?: number | null;
  created_at?: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessageItem[];
  total: number;
}

// API Functions
const API_BASE = '/api';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function query(request: QueryRequest): Promise<QueryResponse> {
  const response = await fetch(`${API_BASE}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<QueryResponse>(response);
}

export async function ingestFiles(files: File[]): Promise<{ results: IngestResponse[], errors: string[] }> {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  const response = await fetch(`${API_BASE}/ingest/files`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<{ results: IngestResponse[], errors: string[] }>(response);
}

export async function ingestDefault(): Promise<{ chunks: number }> {
  const response = await fetch(`${API_BASE}/ingest/default`, {
    method: 'POST',
  });
  return handleResponse(response);
}

export async function getStats(): Promise<StatsResponse> {
  const response = await fetch(`${API_BASE}/stats`);
  return handleResponse<StatsResponse>(response);
}

export async function getRecords(limit = 100, offset = 0): Promise<RecordsResponse> {
  const response = await fetch(`${API_BASE}/records?limit=${limit}&offset=${offset}`);
  return handleResponse<RecordsResponse>(response);
}

export async function reset(): Promise<void> {
  const response = await fetch(`${API_BASE}/reset`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Reset failed');
  }
}

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/health`);
  return handleResponse(response);
}

// ---- 会话管理 ----

export async function createConversation(title?: string): Promise<{ conversation: Conversation }> {
  const response = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title ?? '新对话' }),
  });
  return handleResponse(response);
}

export async function getConversations(): Promise<ConversationListResponse> {
  const response = await fetch(`${API_BASE}/conversations`);
  return handleResponse<ConversationListResponse>(response);
}

export async function getConversation(id: number): Promise<{ conversation: Conversation }> {
  const response = await fetch(`${API_BASE}/conversations/${id}`);
  return handleResponse(response);
}

export async function renameConversation(id: number, title: string): Promise<void> {
  const response = await fetch(`${API_BASE}/conversations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error('Rename failed');
  }
}

export async function deleteConversation(id: number): Promise<{ messages_deleted: number }> {
  const response = await fetch(`${API_BASE}/conversations/${id}`, {
    method: 'DELETE',
  });
  return handleResponse(response);
}

// ---- 聊天记录持久化（按会话） ----

export async function getChatHistory(conversationId: number, limit = 200): Promise<ChatHistoryResponse> {
  const response = await fetch(`${API_BASE}/chat/history?conversation_id=${conversationId}&limit=${limit}`);
  return handleResponse<ChatHistoryResponse>(response);
}

export async function saveChatMessages(
  conversationId: number,
  messages: ChatMessageItem[]
): Promise<{ ids: number[] }> {
  const response = await fetch(`${API_BASE}/chat/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, messages }),
  });
  return handleResponse(response);
}

export async function clearChatHistory(conversationId?: number): Promise<void> {
  const url = conversationId != null
    ? `${API_BASE}/chat/history?conversation_id=${conversationId}`
    : `${API_BASE}/chat/history`;
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error('Clear chat history failed');
  }
}

// ---- 性能指标 ----

export interface MetricStage {
  avg: number;
  p50: number;
  p95: number;
}

export interface MetricsSummary {
  window: string;
  samples: number;
  ok_count: number;
  error_count: number;
  success_rate: number;
  embed: MetricStage;
  retrieve: MetricStage;
  rerank: MetricStage;
  llm: MetricStage;
  total: MetricStage;
  search_count_avg: number;
  search_requested_avg: number;
  rerank_count_avg: number;
}

export interface MetricsRecentItem {
  id: number;
  question_len: number;
  search_count: number;
  rerank_count: number;
  embed_ms: number;
  retrieve_ms: number;
  rerank_ms: number;
  llm_ms: number;
  total_ms: number;
  status: string;
  error: string | null;
  created_at: string;
}

export interface MetricsTimeseriesPoint {
  bucket: string;
  samples: number;
  embed: number;
  retrieve: number;
  rerank: number;
  llm: number;
  total: number;
}

export interface MetricsConfig {
  milvus: {
    host: string;
    collection: string;
    row_count: number;
    dimension: number;
    index_type: string;
    metric_type: string;
    nlist: number;
    nprobe: number;
  };
  retrieval: {
    search_top_k: number;
    rerank_top_n: number;
  };
  models: {
    embedding: string;
    reranker: string;
    llm: string;
  };
}

export interface DeviceInfo {
  embedding: {
    model: string;
    mode: string | null;
    device: string | null;
    api_base: string | null;
  };
  reranker: {
    model: string;
    mode: string;
    device: string | null;
    backend: string;
    openvino_device: string | null;
  };
  llm: {
    model: string;
    api_base: string;
  };
  cuda: {
    available: boolean;
    device_count: number;
  };
  warmup: {
    started: boolean;
  };
}

export async function getMetricsSummary(window: 'all' | '1h' | '24h' | '7d' = '1h'): Promise<MetricsSummary> {
  const response = await fetch(`${API_BASE}/metrics/summary?window=${window}`);
  return handleResponse<MetricsSummary>(response);
}

export async function getMetricsRecent(limit = 50): Promise<{ items: MetricsRecentItem[]; total: number }> {
  const response = await fetch(`${API_BASE}/metrics/recent?limit=${limit}`);
  return handleResponse(response);
}

export async function getMetricsTimeseries(
  window: '1h' | '24h' | '7d' = '1h',
  bucket_minutes = 5
): Promise<{ window: string; bucket_minutes: number; series: MetricsTimeseriesPoint[] }> {
  const response = await fetch(`${API_BASE}/metrics/timeseries?window=${window}&bucket_minutes=${bucket_minutes}`);
  return handleResponse(response);
}

export async function getMetricsConfig(): Promise<MetricsConfig> {
  const response = await fetch(`${API_BASE}/metrics/config`);
  return handleResponse<MetricsConfig>(response);
}

export async function clearMetrics(): Promise<{ status: string; deleted: number }> {
  const response = await fetch(`${API_BASE}/metrics/clear`, { method: 'POST' });
  return handleResponse(response);
}

export interface BenchmarkSample {
  ok: boolean;
  total_ms: number;
  error?: string;
}

export interface BenchmarkResult {
  count: number;
  ok_count: number;
  error_count: number;
  qps: number;
  p50: number;
  p95: number;
  avg: number;
  min: number;
  max: number;
  duration_ms: number;
  samples: BenchmarkSample[];
}

/**
 * 主动跑 N 次 query 做压测,前端串行 fetch。
 */
export async function runBenchmark(
  question: string,
  count: number,
  onProgress?: (done: number, total: number) => void
): Promise<BenchmarkResult> {
  const samples: BenchmarkSample[] = [];
  const start = performance.now();

  for (let i = 0; i < count; i++) {
    const t0 = performance.now();
    try {
      // 直接发 fetch,不用 api/query —— 避免被上层 handleResponse 包装,允许失败计入 error 计数
      const r = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const dt = performance.now() - t0;
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: `HTTP ${r.status}` }));
        samples.push({ ok: false, total_ms: dt, error: err.detail || `HTTP ${r.status}` });
      } else {
        samples.push({ ok: true, total_ms: dt });
      }
    } catch (e) {
      samples.push({ ok: false, total_ms: performance.now() - t0, error: String(e) });
    }
    onProgress?.(i + 1, count);
  }

  const duration = performance.now() - start;
  const okSamples = samples.filter((s) => s.ok);
  const sorted = okSamples.map((s) => s.total_ms).sort((a, b) => a - b);

  const pct = (p: number) => {
    if (!sorted.length) return 0;
    const k = Math.max(0, Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1))));
    return Math.round(sorted[k]);
  };

  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count,
    ok_count: okSamples.length,
    error_count: samples.length - okSamples.length,
    qps: samples.length / (duration / 1000),
    p50: pct(50),
    p95: pct(95),
    avg: sorted.length ? Math.round(sum / sorted.length) : 0,
    min: sorted.length ? Math.round(sorted[0]) : 0,
    max: sorted.length ? Math.round(sorted[sorted.length - 1]) : 0,
    duration_ms: Math.round(duration),
    samples,
  };
}
