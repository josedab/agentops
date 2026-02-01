/**
 * Streaming Trace Module
 *
 * Exports for real-time WebSocket-based event streaming.
 */

export { StreamingClient } from "./client.js";
export { StreamingTransport } from "./transport.js";

export type {
  // Protocol types
  StreamingMessageType,
  StreamingMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  EventMessage,
  EventBatchMessage,
  HeartbeatMessage,
  AckMessage,
  ErrorMessage,
  ConnectedMessage,
  TokenChunkMessage,
  StreamingServerMessage,
  StreamingClientMessage,

  // Event types
  StreamingEventType,
  StreamingEvent,
  StreamingEventData,

  // Filters
  StreamingFilters,

  // Error codes
  StreamingErrorCode,

  // Connection
  ConnectionState,
  ConnectionInfo,

  // Configuration
  StreamingConfig,
  ResolvedStreamingConfig,

  // Handlers
  StreamingEventHandler,
  StreamingErrorHandler,
  ConnectionStateHandler,
  TokenChunkHandler,
  StreamingHandlers,

  // Subscription
  Subscription,
} from "./types.js";

export { StreamingError } from "./types.js";
