/**
 * AgentOps SDK - Core Types
 * 
 * Type definitions for events, sessions, and configuration.
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface AgentOpsConfig {
  /** API key for authentication (required) */
  apiKey: string;
  
  /** Ingestion endpoint URL (default: https://ingest.agentops.dev) */
  endpoint?: string;
  
  /** Milliseconds between automatic flushes (default: 1000) */
  flushInterval?: number;
  
  /** Maximum events per batch (default: 100) */
  maxBatchSize?: number;
  
  /** Maximum retries for failed requests (default: 3) */
  maxRetries?: number;
  
  /** Disable all tracking (useful for testing) */
  disabled?: boolean;
  
  /** Enable debug logging */
  debug?: boolean;
  
  /** Default tags applied to all events */
  defaultTags?: string[];
  
  /** Default metadata applied to all events */
  defaultMetadata?: Record<string, unknown>;
}

export interface ResolvedConfig extends Required<Omit<AgentOpsConfig, 'defaultTags' | 'defaultMetadata'>> {
  defaultTags: string[];
  defaultMetadata: Record<string, unknown>;
}

// ============================================================================
// Event Types
// ============================================================================

export type EventType = 
  | 'session_start'
  | 'session_end'
  | 'prompt'
  | 'response'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'custom';

export interface BaseEvent {
  /** Unique event identifier */
  eventId: string;
  
  /** Parent session identifier */
  sessionId: string;
  
  /** Optional parent event (for nesting) */
  parentEventId?: string;
  
  /** Event type classification */
  type: EventType;
  
  /** Unix timestamp in milliseconds */
  timestamp: number;
  
  /** Custom tags for filtering */
  tags?: string[];
  
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

export interface SessionStartEvent extends BaseEvent {
  type: 'session_start';
  userId?: string;
  featureId?: string;
}

export interface SessionEndEvent extends BaseEvent {
  type: 'session_end';
  status: 'completed' | 'error';
  errorMessage?: string;
}

export interface PromptEvent extends BaseEvent {
  type: 'prompt';
  role: 'user' | 'system' | 'assistant';
  content: string | unknown[];
  model?: string;
}

export interface ResponseEvent extends BaseEvent {
  type: 'response';
  content: string | unknown[];
  model: string;
  durationMs: number;
  tokens?: TokenUsage;
  finishReason?: string;
}

export interface ToolCallEvent extends BaseEvent {
  type: 'tool_call';
  toolName: string;
  toolInput: unknown;
  mcpServer?: string;
}

export interface ToolResultEvent extends BaseEvent {
  type: 'tool_result';
  toolName: string;
  toolOutput: unknown;
  status: 'success' | 'error';
  durationMs: number;
  errorMessage?: string;
}

export interface ErrorEvent extends BaseEvent {
  type: 'error';
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  durationMs?: number;
}

export interface CustomEvent extends BaseEvent {
  type: 'custom';
  name: string;
  data?: unknown;
}

export type AgentEvent = 
  | SessionStartEvent
  | SessionEndEvent
  | PromptEvent
  | ResponseEvent
  | ToolCallEvent
  | ToolResultEvent
  | ErrorEvent
  | CustomEvent;

// ============================================================================
// Token & Cost Types
// ============================================================================

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostInfo {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionMetadata {
  /** User identifier for attribution */
  userId?: string;
  
  /** Feature identifier for cost attribution */
  featureId?: string;
  
  /** Tags for filtering and grouping */
  tags?: string[];
  
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

export interface SessionStats {
  eventCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  durationMs: number;
  toolCalls: number;
  errors: number;
}

// ============================================================================
// API Types
// ============================================================================

export interface BatchPayload {
  events: AgentEvent[];
  sdkVersion: string;
  timestamp: number;
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  eventCount?: number;
}

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
}

// ============================================================================
// Transport Types
// ============================================================================

export interface TransportConfig {
  endpoint: string;
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
}

export interface FlushResult {
  success: boolean;
  eventCount: number;
  error?: Error;
}
