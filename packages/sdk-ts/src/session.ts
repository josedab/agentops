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
} from "./types.js";
import { generateEventId, now, serializeError } from "./utils.js";
import { calculateCost } from "./pricing.js";

export type TrackFunction = (event: AgentEvent) => void;

/**
 * Estimate cost using the canonical pricing from @agentops/shared
 */
function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  return calculateCost(model, promptTokens, completionTokens);
}

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
    totalCost: 0,
    durationMs: 0,
    toolCalls: 0,
    errors: 0,
    models: [],
    tools: [],
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

    if (event.type === "response" && "tokens" in event && event.tokens) {
      this.stats.promptTokens += event.tokens.promptTokens;
      this.stats.completionTokens += event.tokens.completionTokens;
      this.stats.totalTokens += event.tokens.totalTokens;

      // Track model and estimate cost
      if ("model" in event && event.model) {
        if (!this.stats.models.includes(event.model)) {
          this.stats.models.push(event.model);
        }
        const cost = estimateCost(
          event.model,
          event.tokens.promptTokens,
          event.tokens.completionTokens,
        );
        this.stats.totalCost += cost;
        this.stats.estimatedCost += cost;
      }
    }

    if (event.type === "tool_call") {
      this.stats.toolCalls++;
      if ("toolName" in event && event.toolName) {
        if (!this.stats.tools.includes(event.toolName)) {
          this.stats.tools.push(event.toolName);
        }
      }
    }

    if (event.type === "error") {
      this.stats.errors++;
    }
  }

  /**
   * Get current session statistics
   */
  getStats(): SessionStats {
    return {
      ...this.stats,
      models: [...this.stats.models],
      tools: [...this.stats.tools],
    };
  }
}

/**
 * Tracked session for manual instrumentation
 */
export class TrackedSession {
  private readonly context: SessionContext;
  private readonly track: TrackFunction;
  private ended = false;
  private _status: "active" | "completed" | "error" = "active";
  private _endedAt?: number;

  constructor(
    sessionId: string,
    track: TrackFunction,
    metadata?: SessionMetadata,
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
   * Get user ID
   */
  get userId(): string | undefined {
    return this.context.metadata.userId;
  }

  /**
   * Get feature ID
   */
  get featureId(): string | undefined {
    return this.context.metadata.featureId;
  }

  /**
   * Get session tags
   */
  get tags(): string[] | undefined {
    return this.context.metadata.tags;
  }

  /**
   * Get session metadata
   */
  get metadata(): Record<string, unknown> | undefined {
    return this.context.metadata.metadata;
  }

  /**
   * Get session status
   */
  get status(): "active" | "completed" | "error" {
    return this._status;
  }

  /**
   * Get ended at timestamp
   */
  get endedAt(): number | undefined {
    return this._endedAt;
  }

  /**
   * Get session statistics
   */
  get stats(): SessionStats {
    return this.context.getStats();
  }

  /**
   * Track a prompt/message sent to the model.
   *
   * @param content - The prompt content (string or array of message parts)
   * @param options - Optional configuration
   * @param options.role - Message role: 'user', 'system', or 'assistant' (default: 'user')
   * @param options.model - Model name (e.g., 'gpt-4', 'claude-3')
   * @param options.parentEventId - Link to parent event for hierarchical tracing
   * @param options.tags - Custom tags for filtering
   * @param options.metadata - Additional metadata
   * @returns The generated event ID for correlation
   *
   * @example
   * ```typescript
   * const promptId = session.trackPrompt('What is the weather?', {
   *   role: 'user',
   *   model: 'gpt-4',
   *   tags: ['weather-query']
   * });
   * ```
   */
  trackPrompt(
    content: string | unknown[],
    options?: {
      role?: "user" | "system" | "assistant";
      model?: string;
      parentEventId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): string {
    this.ensureNotEnded();

    const eventId = generateEventId();
    const event: PromptEvent = {
      eventId,
      sessionId: this.context.sessionId,
      parentEventId: options?.parentEventId,
      type: "prompt",
      role: options?.role ?? "user",
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
   * Track a response from the model.
   *
   * @param content - The response content (string or array of message parts)
   * @param options - Response configuration
   * @param options.model - Model name that generated the response (required)
   * @param options.durationMs - Response generation time in milliseconds
   * @param options.tokens - Token usage breakdown
   * @param options.finishReason - Reason the model stopped (e.g., 'stop', 'length')
   * @param options.parentEventId - Link to parent prompt event
   * @param options.tags - Custom tags for filtering
   * @param options.metadata - Additional metadata
   * @returns The generated event ID for correlation
   *
   * @example
   * ```typescript
   * const responseId = session.trackResponse('The weather is sunny!', {
   *   model: 'gpt-4',
   *   durationMs: 523,
   *   tokens: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
   *   parentEventId: promptId
   * });
   * ```
   */
  trackResponse(
    content: string | unknown[],
    options: {
      model: string;
      durationMs?: number;
      tokens?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
      finishReason?: string;
      parentEventId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): string {
    this.ensureNotEnded();

    const eventId = generateEventId();
    const event: ResponseEvent = {
      eventId,
      sessionId: this.context.sessionId,
      parentEventId: options.parentEventId,
      type: "response",
      content,
      model: options.model,
      durationMs: options.durationMs ?? 0,
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
   * Track a tool call made by the model.
   *
   * @param toolName - Name of the tool being invoked
   * @param toolInput - Input parameters passed to the tool
   * @param options - Optional configuration
   * @param options.mcpServer - MCP server handling the tool (if applicable)
   * @param options.parentEventId - Link to parent event for hierarchical tracing
   * @param options.tags - Custom tags for filtering
   * @param options.metadata - Additional metadata
   * @returns The generated event ID (use as parentEventId for trackToolResult)
   *
   * @example
   * ```typescript
   * const toolCallId = session.trackToolCall('get_weather', { city: 'Seattle' }, {
   *   mcpServer: 'weather-service'
   * });
   *
   * // Later, track the result
   * session.trackToolResult('get_weather', { temp: 72, condition: 'sunny' }, {
   *   status: 'success',
   *   durationMs: 150,
   *   parentEventId: toolCallId
   * });
   * ```
   */
  trackToolCall(
    toolName: string,
    toolInput: unknown,
    options?: {
      mcpServer?: string;
      parentEventId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): string {
    this.ensureNotEnded();

    const eventId = generateEventId();
    const event: ToolCallEvent = {
      eventId,
      sessionId: this.context.sessionId,
      parentEventId: options?.parentEventId,
      type: "tool_call",
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
   * Track a tool execution result.
   *
   * @param toolName - Name of the tool that was executed
   * @param toolOutput - Output/result from the tool execution
   * @param options - Result configuration
   * @param options.status - Execution status: 'success' or 'error'
   * @param options.durationMs - Tool execution time in milliseconds
   * @param options.errorMessage - Error message if status is 'error'
   * @param options.parentEventId - Link to the corresponding trackToolCall event
   * @param options.tags - Custom tags for filtering
   * @param options.metadata - Additional metadata
   * @returns The generated event ID for correlation
   *
   * @example
   * ```typescript
   * session.trackToolResult('search_docs', ['result1', 'result2'], {
   *   status: 'success',
   *   durationMs: 234,
   *   parentEventId: toolCallId
   * });
   * ```
   */
  trackToolResult(
    toolName: string,
    toolOutput: unknown,
    options: {
      status: "success" | "error";
      durationMs: number;
      errorMessage?: string;
      parentEventId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): string {
    this.ensureNotEnded();

    const eventId = generateEventId();
    const event: ToolResultEvent = {
      eventId,
      sessionId: this.context.sessionId,
      parentEventId: options.parentEventId,
      type: "tool_result",
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
   * Track an error that occurred during the session.
   *
   * @param error - The error object, string, or any throwable
   * @param options - Optional configuration
   * @param options.durationMs - Time elapsed when error occurred
   * @param options.parentEventId - Link to parent event for context
   * @param options.tags - Custom tags for filtering
   * @param options.metadata - Additional metadata
   * @returns The generated event ID for correlation
   *
   * @example
   * ```typescript
   * try {
   *   await riskyOperation();
   * } catch (error) {
   *   session.trackError(error, {
   *     parentEventId: responseId,
   *     tags: ['critical'],
   *     metadata: { retryCount: 3 }
   *   });
   * }
   * ```
   */
  trackError(
    error: unknown,
    options?: {
      durationMs?: number;
      parentEventId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): string {
    this.ensureNotEnded();

    const serialized = serializeError(error);
    const eventId = generateEventId();
    const event: ErrorEvent = {
      eventId,
      sessionId: this.context.sessionId,
      parentEventId: options?.parentEventId,
      type: "error",
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
   * Track a custom event for application-specific telemetry.
   *
   * @param name - Custom event name (e.g., 'user_feedback', 'feature_used')
   * @param data - Event payload (any serializable data)
   * @param options - Optional configuration
   * @param options.parentEventId - Link to parent event for context
   * @param options.tags - Custom tags for filtering
   * @param options.metadata - Additional metadata
   * @returns The generated event ID for correlation
   *
   * @example
   * ```typescript
   * // Track user feedback
   * session.trackCustom('user_feedback', {
   *   rating: 5,
   *   comment: 'Great response!'
   * }, { tags: ['feedback', 'positive'] });
   *
   * // Track feature usage
   * session.trackCustom('feature_used', {
   *   feature: 'code_completion',
   *   accepted: true
   * });
   * ```
   */
  trackCustom(
    name: string,
    data?: unknown,
    options?: {
      parentEventId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): string {
    this.ensureNotEnded();

    const eventId = generateEventId();
    const event: CustomEvent = {
      eventId,
      sessionId: this.context.sessionId,
      parentEventId: options?.parentEventId,
      type: "custom",
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
   * End the session and mark it as complete.
   *
   * Once ended, no more events can be tracked. The session's final stats
   * are recorded and the session_end event is emitted.
   *
   * @param options - Optional end configuration
   * @param options.status - Final status: 'completed' or 'error' (default: 'completed')
   * @param options.errorMessage - Error message if ending with error status
   *
   * @example
   * ```typescript
   * // Normal completion
   * session.end();
   *
   * // End with error
   * session.end({
   *   status: 'error',
   *   errorMessage: 'User cancelled operation'
   * });
   *
   * // Check status after ending
   * console.log(session.status); // 'completed' or 'error'
   * console.log(session.stats);  // Final session statistics
   * ```
   */
  end(options?: {
    status?: "completed" | "error";
    errorMessage?: string;
  }): void {
    if (this.ended) return;

    this.ended = true;
    this._status = options?.status ?? "completed";
    this._endedAt = now();

    this.track({
      eventId: generateEventId(),
      sessionId: this.context.sessionId,
      type: "session_end",
      status: options?.status ?? "completed",
      errorMessage: options?.errorMessage,
      timestamp: this._endedAt,
    });
  }

  private trackEvent(event: AgentEvent): void {
    this.context.updateStats(event);
    this.track(event);
  }

  private ensureNotEnded(): void {
    if (this.ended) {
      throw new Error("Session has ended. Cannot track new events.");
    }
  }
}

// Export Session as an alias for TrackedSession for backward compatibility
export { TrackedSession as Session };
