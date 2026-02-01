/**
 * Streaming Trace Types
 *
 * Type definitions for real-time WebSocket-based event streaming.
 */

// ============================================================================
// Streaming Protocol Types
// ============================================================================

export type StreamingMessageType =
  | "subscribe"
  | "unsubscribe"
  | "event"
  | "event_batch"
  | "heartbeat"
  | "ack"
  | "error"
  | "connected"
  | "session_start"
  | "session_end"
  | "token_chunk";

export interface StreamingMessage {
  type: StreamingMessageType;
  timestamp: number;
  messageId: string;
}

export interface SubscribeMessage extends StreamingMessage {
  type: "subscribe";
  sessionId?: string;
  userId?: string;
  featureId?: string;
  filters?: StreamingFilters;
}

export interface UnsubscribeMessage extends StreamingMessage {
  type: "unsubscribe";
  subscriptionId: string;
}

export interface EventMessage extends StreamingMessage {
  type: "event";
  sessionId: string;
  event: StreamingEvent;
}

export interface EventBatchMessage extends StreamingMessage {
  type: "event_batch";
  events: EventMessage[];
}

export interface HeartbeatMessage extends StreamingMessage {
  type: "heartbeat";
}

export interface AckMessage extends StreamingMessage {
  type: "ack";
  originalMessageId: string;
  subscriptionId?: string;
}

export interface ErrorMessage extends StreamingMessage {
  type: "error";
  code: StreamingErrorCode;
  message: string;
  originalMessageId?: string;
}

export interface ConnectedMessage extends StreamingMessage {
  type: "connected";
  connectionId: string;
  serverVersion: string;
}

export interface TokenChunkMessage extends StreamingMessage {
  type: "token_chunk";
  sessionId: string;
  eventId: string;
  chunk: string;
  index: number;
  isComplete: boolean;
}

export type StreamingServerMessage =
  | EventMessage
  | EventBatchMessage
  | HeartbeatMessage
  | AckMessage
  | ErrorMessage
  | ConnectedMessage
  | TokenChunkMessage;

export type StreamingClientMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | HeartbeatMessage;

// ============================================================================
// Streaming Event Types
// ============================================================================

export type StreamingEventType =
  | "session_start"
  | "session_end"
  | "prompt"
  | "response"
  | "response_chunk"
  | "tool_call"
  | "tool_result"
  | "error"
  | "custom"
  | "thinking"
  | "decision";

export interface StreamingEvent {
  eventId: string;
  sessionId: string;
  parentEventId?: string;
  type: StreamingEventType;
  timestamp: number;
  data: StreamingEventData;
}

export interface StreamingEventData {
  // Common fields
  content?: string;
  model?: string;
  durationMs?: number;

  // Session fields
  userId?: string;
  featureId?: string;
  status?: "active" | "completed" | "error";

  // Token fields
  tokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  // Cost fields
  cost?: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
  };

  // Tool fields
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  toolStatus?: "pending" | "success" | "error";

  // Error fields
  errorType?: string;
  errorMessage?: string;
  stackTrace?: string;

  // Streaming-specific fields
  isStreaming?: boolean;
  streamProgress?: number;
  chunkIndex?: number;

  // Decision tree fields
  decisionPath?: string[];
  confidence?: number;

  // Arbitrary metadata
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Streaming Filters
// ============================================================================

export interface StreamingFilters {
  eventTypes?: StreamingEventType[];
  minCost?: number;
  maxCost?: number;
  models?: string[];
  tools?: string[];
  tags?: string[];
  includeChunks?: boolean;
}

// ============================================================================
// Error Codes
// ============================================================================

export type StreamingErrorCode =
  | "INVALID_MESSAGE"
  | "UNAUTHORIZED"
  | "SESSION_NOT_FOUND"
  | "SUBSCRIPTION_LIMIT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "CONNECTION_CLOSED";

// ============================================================================
// Connection State
// ============================================================================

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface ConnectionInfo {
  state: ConnectionState;
  connectionId?: string;
  connectedAt?: number;
  lastHeartbeat?: number;
  reconnectAttempts: number;
  subscriptions: Set<string>;
}

// ============================================================================
// Streaming Configuration
// ============================================================================

export interface StreamingConfig {
  /** WebSocket endpoint URL */
  endpoint: string;

  /** API key for authentication */
  apiKey: string;

  /** Enable automatic reconnection (default: true) */
  autoReconnect?: boolean;

  /** Maximum reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;

  /** Base delay between reconnection attempts in ms (default: 1000) */
  reconnectBaseDelay?: number;

  /** Maximum delay between reconnection attempts in ms (default: 30000) */
  reconnectMaxDelay?: number;

  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;

  /** Connection timeout in ms (default: 10000) */
  connectionTimeout?: number;

  /** Enable debug logging */
  debug?: boolean;

  /** Buffer size for offline events (default: 1000) */
  offlineBufferSize?: number;
}

export interface ResolvedStreamingConfig extends Required<
  Omit<StreamingConfig, "debug">
> {
  debug: boolean;
}

// ============================================================================
// Event Handlers
// ============================================================================

export type StreamingEventHandler = (event: StreamingEvent) => void;
export type StreamingErrorHandler = (error: StreamingError) => void;
export type ConnectionStateHandler = (
  state: ConnectionState,
  info: ConnectionInfo,
) => void;
export type TokenChunkHandler = (chunk: TokenChunkMessage) => void;

export interface StreamingHandlers {
  onEvent?: StreamingEventHandler;
  onError?: StreamingErrorHandler;
  onConnectionChange?: ConnectionStateHandler;
  onTokenChunk?: TokenChunkHandler;
  onSessionStart?: (sessionId: string, event: StreamingEvent) => void;
  onSessionEnd?: (sessionId: string, event: StreamingEvent) => void;
}

// ============================================================================
// Streaming Error
// ============================================================================

export class StreamingError extends Error {
  constructor(
    public readonly code: StreamingErrorCode,
    message: string,
    public readonly originalMessageId?: string,
  ) {
    super(message);
    this.name = "StreamingError";
  }
}

// ============================================================================
// Subscription
// ============================================================================

export interface Subscription {
  id: string;
  sessionId?: string;
  userId?: string;
  featureId?: string;
  filters?: StreamingFilters;
  createdAt: number;
  handlers: StreamingHandlers;
}
