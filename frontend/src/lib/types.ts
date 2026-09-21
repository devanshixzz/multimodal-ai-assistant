export type MediaType =
  | "image"
  | "video"
  | "audio"
  | "document";

export type MessageRole =
  | "user"
  | "assistant"
  | "system";

export interface MediaItem {
  id: string;
  original_name: string;
  filename?: string;
  mime_type: string;
  media_type: MediaType;
  size: number;
  path?: string;
  status: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  media_refs: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  context_summary?: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface UploadResponse {
  success: boolean;
  media?: MediaItem;
  error?: {
    message: string;
    details?: string;
  };
}

export interface ChatResponse {
  success: boolean;
  conversationId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  error?: {
    message: string;
    details?: string;
  };
}

export interface StreamingTokenEvent {
  text: string;
}

export interface StreamingStartEvent {
  conversationId: string;
}

export interface StreamingDoneEvent {
  message: ChatMessage;
}

export interface StreamingErrorEvent {
  message: string;
}