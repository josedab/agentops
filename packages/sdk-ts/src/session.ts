/**
 * AgentOps SDK - Session Tracking
 * 
 * Provides session context and manual tracking API.
 */

import type { 
  SessionMetadata, 
  SessionStats,
  AgentEvent,
  PromptEvent,
  ResponseEvent,
  ToolCallEvent,
  ToolResultEvent,
  ErrorEvent,
  CustomEvent,
} from './types.js';
import { generateEventId, now, serializeError } from './utils.js';

export type TrackFunction = (event: AgentEvent) => void;

/**
 * Session context for tracking related events
 */
export class SessionContext {
  public readonly sessionId: string;
  public readonly metadata: SessionMetadata;
  public readonly startedAt: number;
  
  private stats: SessionStats = {
    eventCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
    durationMs: 0,
    toolCalls: 0,
    errors: 0,
  };

  constructor(sessionId: string, metadata?: SessionMetadata) {
    this.sessionId = sessionId;
    this.metadata = metadata ?? {};
    this.startedAt = now();
  }

  /**
   * Update session stats
   */
  updateStats(event: AgentEvent): void {
    this.stats.eventCount++;
    this.stats.durationMs = now() - this.startedAt;

    if (event.type === 'response' && 'tokens' in event && event.tokens) {
      this.stats.promptTokens += event.tokens.promptTokens;
      this.stats.completionTokens += event.tokens.completionTokens;
      this.stats.totalTokens += event.tokens.totalTokens;
    }

    if (event.type === 'tool_call') {
      this.stats.toolCalls++;
    }

    if (event.type === 'error') {
      this.stats.errors++;
    }
  }

  /**
   * Get current session statistics
   */
  getStats(): SessionStats {
    return { ...this.stats };
  }
}

/**
 * Tracked session for manual instrumentation
 */
export class TrackedSession {
  private readonly context: SessionContext;
  private readonly track: TrackFunction;
  private ended = false;

  constructor(
    sessionId: string, 
    track: TrackFunction, 
    metadata?: SessionMetadata
  ) {
    this.context = new SessionContext(sessionId, metadata);
    this.track = track;
  }

  /**
   * Get session ID
   */
  get sessionId(): string {
    return this.context.sessionId;
  }

  /**
   * Get session statistics
   */
  get stats(): SessionStats {
    return this.context.getStats();
  }

  /**
   * Track a prompt/message sent to the model
   */
  trackPrompt(
    content: string | unknown[],
    options?: {
      role?: 'user' | 'system' | 'assistant';
      model?: string;
      parentEventId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): string {
    this.ensureNotEnded();
    
    const eventId = generateEventId();
    const event: PromptEvent = {
      eventId,
      sessionId: this.context.sessionId,
      parentEventId: options?.parentEventId,
      type: 'prompt',
      role: options?.role ?? 'user',
      content,
      model: options?.model,
      timestamp: now(),
      tags: options?.tags,
      metadata: options?.metadata,
    };

    this.trackEvent(event);
    return eventId;
  }

  /**
   * Track a response from the model
   */
  trackResponse(
    content: string | unknown[],
    options: {
      model: string;
      durationMs: number;
      tokens?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
      finishReason?: string;
      parentEventId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): string {
    this.ensureNotEnded();
    
    const eventId = generateEventId();
    const event: ResponseEvent = {
      eventId,
      sessionId: this.context.sessionId,
      parentEventId: options.parentEventId,
      type: 'response',
      content,
      model: options.model,
      durationMs: options.durationMs,
      tokens: options.tokens,
      finishReason: options.finishReason,
      timestamp: now(),
      tags: options.tags,
      metadata: options.metadata,
    };

    this.trackEvent(event);
    return eventId;
  }

  /**
   * Track a tool call
   */
  trackToolCall(
    toolName: string,
    toolInput: unknown,
    options?: {
      mcpServer?: string;
      parentEventId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): string {
    this.ensureNotEnded();
    
    const eventId = generateEventId();
    const event: ToolCallEvent = {
      eventId,
      sessionId: this.context.sessionId,
      parentEventId: options?.parentEventId,
      type: 'tool_call',
      toolName,
      toolInput,
      mcpServer: options?.mcpServer,
      timestamp: now(),
      tags: options?.tags,
      metadata: options?.metadata,
    };

    this.trackEvent(event);
    return eventId;
  }

  /**
   * Track a tool result
   */
  trackToolResult(
    toolName: string,
    toolOutput: unknown,
    options: {
      status: 'success' | 'error';
      durationMs: number;
      errorMessage?: string;
      parentEventId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): string {
    this.ensureNotEnded();
    
    const eventId = generateEventId();
    const event: ToolResultEvent = {
      eventId,
      sessionId: this.context.sessionId,
      parentEventId: options.parentEventId,
      type: 'tool_result',
      toolName,
      toolOutput,
      status: options.status,
      durationMs: options.durationMs,
      errorMessage: options.errorMessage,
      timestamp: now(),
      tags: options.tags,
      metadata: options.metadata,
    };

    this.trackEvent(event);
    return eventId;
  }

  /**
   * Track an error
   */
  trackError(
    error: unknown,
    options?: {
      durationMs?: number;
      parentEventId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): string {
    this.ensureNotEnded();
    
    const serialized = serializeError(error);
    const eventId = generateEventId();
    const event: ErrorEvent = {
      eventId,
      sessionId: this.context.sessionId,
      parentEventId: options?.parentEventId,
      type: 'error',
      errorType: serialized.type,
      errorMessage: serialized.message,
      stackTrace: serialized.stack,
      durationMs: options?.durationMs,
      timestamp: now(),
      tags: options?.tags,
      metadata: options?.metadata,
    };

    this.trackEvent(event);
    return eventId;
  }

  /**
   * Track a custom event
   */
  trackCustom(
    name: string,
    data?: unknown,
    options?: {
      parentEventId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): string {
    this.ensureNotEnded();
    
    const eventId = generateEventId();
    const event: CustomEvent = {
      eventId,
      sessionId: this.context.sessionId,
      parentEventId: options?.parentEventId,
      type: 'custom',
      name,
      data,
      timestamp: now(),
      tags: options?.tags,
      metadata: options?.metadata,
    };

    this.trackEvent(event);
    return eventId;
  }

  /**
   * End the session
   */
  end(options?: { 
    status?: 'completed' | 'error';
    errorMessage?: string;
  }): void {
    if (this.ended) return;
    
    this.ended = true;
    
    this.track({
      eventId: generateEventId(),
      sessionId: this.context.sessionId,
      type: 'session_end',
      status: options?.status ?? 'completed',
      errorMessage: options?.errorMessage,
      timestamp: now(),
    });
  }

  private trackEvent(event: AgentEvent): void {
    this.context.updateStats(event);
    this.track(event);
  }

  private ensureNotEnded(): void {
    if (this.ended) {
      throw new Error('Session has ended. Cannot track new events.');
    }
  }
}
