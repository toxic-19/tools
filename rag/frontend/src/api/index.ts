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
