/**
 * AgentOps SDK - Main Client
 *
 * The primary interface for instrumenting AI agent applications.
 */

import type {
  AgentOpsConfig,
  ResolvedConfig,
  AgentEvent,
  SessionMetadata,
  FlushResult,
} from "./types.js";
import { EventBuffer } from "./buffer.js";
import { HttpTransport } from "./transport.js";
import { TrackedSession, SessionContext } from "./session.js";
import {
  generateSessionId,
  generateEventId,
  now,
  serializeError,
  extractTokenUsage,
  extractModel,
} from "./utils.js";
import { ConfigurationError } from "@agentops/shared";
import { ContentExtractorChain } from "./extractors.js";

const DEFAULT_CONFIG: Omit<ResolvedConfig, "apiKey"> = {
  endpoint: "https://ingest.agentops.dev",
  flushInterval: 1000,
  maxBatchSize: 100,
  maxRetries: 3,
  disabled: false,
  debug: false,
  defaultTags: [],
  defaultMetadata: {},
};

/**
 * AgentOps client for AI observability
 *
 * @example
 * ```typescript
 * import { AgentOps } from '@agentops/sdk';
 *
 * const agentops = new AgentOps({ apiKey: process.env.AGENTOPS_API_KEY });
 *
 * // Wrap any LLM client for automatic instrumentation
 * const client = agentops.wrap(yourLLMClient);
 *
 * // Or use manual tracking
 * const session = agentops.startSession({ userId: 'user123' });
 * session.trackPrompt('Hello!');
 * session.trackResponse('Hi there!', { model: 'gpt-5', durationMs: 500 });
 * session.end();
 *
 * // Shutdown gracefully
 * await agentops.shutdown();
 * ```
 */
export class AgentOps {
  private readonly config: ResolvedConfig;
  private readonly buffer: EventBuffer;
  private readonly transport: HttpTransport;
  private readonly sessions: Map<string, SessionContext> = new Map();
  private readonly contentExtractor: ContentExtractorChain;
  private shutdownHandler: (() => void) | null = null;

  constructor(config: AgentOpsConfig) {
    const apiKey = config.apiKey || process.env.AGENTOPS_API_KEY;
    if (!apiKey) {
      throw new ConfigurationError(
        "AgentOps API key is required. Provide apiKey in config or set AGENTOPS_API_KEY environment variable.",
        { missingField: "apiKey" },
      );
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      apiKey,
      defaultTags: config.defaultTags ?? [],
      defaultMetadata: config.defaultMetadata ?? {},
    };

    this.transport = new HttpTransport({
      endpoint: this.config.endpoint,
      apiKey: this.config.apiKey,
      maxRetries: this.config.maxRetries,
    });

    this.buffer = new EventBuffer({
      maxSize: this.config.maxBatchSize,
      flushInterval: this.config.flushInterval,
      debug: this.config.debug,
      onFlush: (events) => this.transport.send(events),
    });

    // Initialize content extractor chain
    this.contentExtractor = new ContentExtractorChain();

    if (this.config.debug) {
      console.log("[AgentOps] Initialized", {
        endpoint: this.config.endpoint,
        flushInterval: this.config.flushInterval,
      });
    }

    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();
  }

  /**
   * Check if tracking is enabled
   */
  get isEnabled(): boolean {
    return !this.config.disabled;
  }

  /**
   * Wrap an LLM client for automatic instrumentation.
   *
   * Supports:
   * - GitHub Copilot SDK
   * - OpenAI SDK
   * - Anthropic SDK
   * - Any client with similar patterns
   *
   * @example
   * ```typescript
   * const client = agentops.wrap(new CopilotClient());
   * // All calls are now automatically tracked
   * ```
   */
  wrap<T extends object>(client: T, metadata?: SessionMetadata): T {
    if (this.config.disabled) {
      return client;
    }

    return new Proxy(client, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);

        // Wrap known session creation methods
        if (typeof value === "function") {
          const methodName = String(prop);

          // GitHub Copilot SDK
          if (methodName === "createSession") {
            return this.wrapCreateSession(value.bind(target), metadata);
          }

          // OpenAI chat completions
          if (methodName === "chat" || methodName === "completions") {
            return this.wrapOpenAI(value.bind(target), target, metadata);
          }

          // Anthropic messages
          if (methodName === "messages") {
            return this.wrapAnthropic(value.bind(target), target, metadata);
          }
        }

        return value;
      },
    });
  }

  /**
   * Start a new tracked session for manual instrumentation.
   *
   * @example
   * ```typescript
   * const session = agentops.startSession({
   *   userId: 'user123',
   *   featureId: 'chat-agent',
   *   tags: ['production'],
   * });
   *
   * // Track events...
   * session.trackPrompt('Hello!');
   *
   * // End when done
   * session.end();
   * ```
   */
  startSession(metadata?: SessionMetadata): TrackedSession {
    const sessionId = generateSessionId();
    const mergedMetadata: SessionMetadata = {
      ...metadata,
      tags: [...this.config.defaultTags, ...(metadata?.tags ?? [])],
      metadata: { ...this.config.defaultMetadata, ...metadata?.metadata },
    };

    const context = new SessionContext(sessionId, mergedMetadata);
    this.sessions.set(sessionId, context);

    // Track session start
    this.track({
      eventId: generateEventId(),
      sessionId,
      type: "session_start",
      userId: mergedMetadata.userId,
      featureId: mergedMetadata.featureId,
      timestamp: now(),
      tags: mergedMetadata.tags,
      metadata: mergedMetadata.metadata,
    });

    if (this.config.debug) {
      console.log("[AgentOps] Session started:", sessionId);
    }

    return new TrackedSession(sessionId, (e) => this.track(e), mergedMetadata);
  }

  /**
   * Track a custom event outside of a session.
   */
  trackEvent(event: Omit<AgentEvent, "eventId" | "timestamp">): void {
    this.track({
      ...event,
      eventId: generateEventId(),
      timestamp: now(),
      tags: [...this.config.defaultTags, ...(event.tags ?? [])],
      metadata: { ...this.config.defaultMetadata, ...event.metadata },
    } as AgentEvent);
  }

  /**
   * Manually flush all buffered events.
   */
  async flush(): Promise<FlushResult> {
    return this.buffer.flush();
  }

  /**
   * Shutdown the client gracefully.
   * Flushes remaining events and cleans up resources.
   */
  async shutdown(): Promise<void> {
    if (this.config.debug) {
      console.log("[AgentOps] Shutting down...");
    }

    // Remove shutdown handlers to prevent memory leaks
    this.removeShutdownHandlers();

    await this.buffer.shutdown();
    this.sessions.clear();

    if (this.config.debug) {
      console.log("[AgentOps] Shutdown complete");
    }
  }

  // =========================================================================
  // Internal Methods
  // =========================================================================

  private track(event: AgentEvent): void {
    if (this.config.disabled) return;
    this.buffer.add(event);
  }

  private wrapCreateSession(
    original: Function,
    metadata?: SessionMetadata,
  ): Function {
    return async (config: unknown) => {
      const sessionId = generateSessionId();
      const mergedMetadata: SessionMetadata = {
        ...metadata,
        tags: [...this.config.defaultTags, ...(metadata?.tags ?? [])],
        metadata: {
          ...this.config.defaultMetadata,
          ...metadata?.metadata,
          config,
        },
      };

      const context = new SessionContext(sessionId, mergedMetadata);
      this.sessions.set(sessionId, context);

      this.track({
        eventId: generateEventId(),
        sessionId,
        type: "session_start",
        userId: mergedMetadata.userId,
        featureId: mergedMetadata.featureId,
        timestamp: now(),
        tags: mergedMetadata.tags,
        metadata: mergedMetadata.metadata,
      });

      if (this.config.debug) {
        console.log("[AgentOps] Copilot session started:", sessionId);
      }

      const session = await original(config);
      return this.wrapCopilotSession(session, context);
    };
  }

  private wrapCopilotSession(
    session: unknown,
    context: SessionContext,
  ): unknown {
    if (!session || typeof session !== "object") {
      return session;
    }

    return new Proxy(session as object, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);

        if (typeof value !== "function") {
          return value;
        }

        const methodName = String(prop);

        if (methodName === "sendAndWait" || methodName === "send") {
          return this.wrapSendMethod(value.bind(target), context, methodName);
        }

        return value;
      },
    });
  }

  private wrapSendMethod(
    original: Function,
    context: SessionContext,
    _methodName: string,
  ): Function {
    return async (message: unknown) => {
      const promptEventId = generateEventId();
      const startTime = now();

      // Track prompt
      this.track({
        eventId: promptEventId,
        sessionId: context.sessionId,
        type: "prompt",
        role: "user",
        content: message as string,
        timestamp: startTime,
      });

      try {
        const response = await original(message);
        const durationMs = now() - startTime;

        // Extract response data
        const tokens = extractTokenUsage(response);
        const model = extractModel(response) ?? "unknown";

        // Track response
        this.track({
          eventId: generateEventId(),
          sessionId: context.sessionId,
          parentEventId: promptEventId,
          type: "response",
          content: this.extractContent(response),
          model,
          durationMs,
          tokens,
          timestamp: now(),
        });

        // Track tool calls if present
        this.trackToolCalls(response, context, promptEventId);

        return response;
      } catch (error) {
        const durationMs = now() - startTime;
        const serialized = serializeError(error);

        this.track({
          eventId: generateEventId(),
          sessionId: context.sessionId,
          parentEventId: promptEventId,
          type: "error",
          errorType: serialized.type,
          errorMessage: serialized.message,
          stackTrace: serialized.stack,
          durationMs,
          timestamp: now(),
        });

        throw error;
      }
    };
  }

  private wrapOpenAI(
    _original: Function,
    target: object,
    metadata?: SessionMetadata,
  ): unknown {
    const self = this;

    return new Proxy(target, {
      get(t, prop, receiver) {
        const value = Reflect.get(t, prop, receiver);

        if (prop === "completions" && typeof value === "object") {
          return new Proxy(value as object, {
            get(completionsTarget, completionsProp, completionsReceiver) {
              const completionsValue = Reflect.get(
                completionsTarget,
                completionsProp,
                completionsReceiver,
              );

              if (
                completionsProp === "create" &&
                typeof completionsValue === "function"
              ) {
                return self.wrapOpenAICreate(
                  completionsValue.bind(completionsTarget),
                  metadata,
                );
              }

              return completionsValue;
            },
          });
        }

        return value;
      },
    });
  }

  private wrapOpenAICreate(
    original: Function,
    metadata?: SessionMetadata,
  ): Function {
    return async (params: Record<string, unknown>) => {
      const session = this.startSession(metadata);
      const startTime = now();

      // Track prompts
      const messages = params.messages as Array<{
        role: string;
        content: string;
      }>;
      if (messages) {
        for (const msg of messages) {
          session.trackPrompt(msg.content, {
            role: msg.role as "user" | "system" | "assistant",
            model: params.model as string,
          });
        }
      }

      try {
        const response = await original(params);
        const durationMs = now() - startTime;
        const tokens = extractTokenUsage(response);

        // Track response
        const content = response.choices?.[0]?.message?.content ?? "";
        session.trackResponse(content, {
          model: response.model ?? (params.model as string),
          durationMs,
          tokens,
          finishReason: response.choices?.[0]?.finish_reason,
        });

        session.end();
        return response;
      } catch (error) {
        session.trackError(error, { durationMs: now() - startTime });
        session.end({ status: "error" });
        throw error;
      }
    };
  }

  private wrapAnthropic(
    _original: Function,
    target: object,
    metadata?: SessionMetadata,
  ): unknown {
    const self = this;

    return new Proxy(target, {
      get(t, prop, receiver) {
        const value = Reflect.get(t, prop, receiver);

        if (prop === "create" && typeof value === "function") {
          return self.wrapAnthropicCreate(value.bind(t), metadata);
        }

        return value;
      },
    });
  }

  private wrapAnthropicCreate(
    original: Function,
    metadata?: SessionMetadata,
  ): Function {
    return async (params: Record<string, unknown>) => {
      const session = this.startSession(metadata);
      const startTime = now();

      // Track system prompt
      if (params.system) {
        session.trackPrompt(params.system as string, {
          role: "system",
          model: params.model as string,
        });
      }

      // Track messages
      const messages = params.messages as Array<{
        role: string;
        content: string;
      }>;
      if (messages) {
        for (const msg of messages) {
          session.trackPrompt(msg.content, {
            role: msg.role as "user" | "assistant",
            model: params.model as string,
          });
        }
      }

      try {
        const response = await original(params);
        const durationMs = now() - startTime;

        // Extract Anthropic-specific token usage
        const tokens = {
          promptTokens: response.usage?.input_tokens ?? 0,
          completionTokens: response.usage?.output_tokens ?? 0,
          totalTokens:
            (response.usage?.input_tokens ?? 0) +
            (response.usage?.output_tokens ?? 0),
        };

        // Track response
        const content = response.content?.[0]?.text ?? "";
        session.trackResponse(content, {
          model: response.model ?? (params.model as string),
          durationMs,
          tokens,
          finishReason: response.stop_reason,
        });

        session.end();
        return response;
      } catch (error) {
        session.trackError(error, { durationMs: now() - startTime });
        session.end({ status: "error" });
        throw error;
      }
    };
  }

  private trackToolCalls(
    response: unknown,
    context: SessionContext,
    parentEventId: string,
  ): void {
    if (!response || typeof response !== "object") return;

    const resp = response as Record<string, unknown>;

    // Check for tool_calls in response
    const toolCalls = resp.toolCalls ?? resp.tool_calls;
    if (!Array.isArray(toolCalls)) return;

    for (const toolCall of toolCalls) {
      const tc = toolCall as Record<string, unknown>;
      const tcFunc = tc.function as Record<string, unknown> | undefined;
      this.track({
        eventId: generateEventId(),
        sessionId: context.sessionId,
        parentEventId,
        type: "tool_call",
        toolName: String(tc.name ?? tcFunc?.name ?? "unknown"),
        toolInput: tc.input ?? tc.arguments ?? tcFunc?.arguments,
        timestamp: now(),
      });
    }
  }

  private extractContent(response: unknown): string {
    return this.contentExtractor.extract(response);
  }

  private setupShutdownHandlers(): void {
    // Only set up handlers in Node.js environment
    if (typeof process !== "undefined" && process.on) {
      const handler = () => {
        void this.shutdown();
      };

      this.shutdownHandler = handler;

      process.on("beforeExit", handler);
      process.on("SIGINT", handler);
      process.on("SIGTERM", handler);
    }
  }

  private removeShutdownHandlers(): void {
    if (
      typeof process !== "undefined" &&
      process.removeListener &&
      this.shutdownHandler
    ) {
      process.removeListener("beforeExit", this.shutdownHandler);
      process.removeListener("SIGINT", this.shutdownHandler);
      process.removeListener("SIGTERM", this.shutdownHandler);
      this.shutdownHandler = null;
    }
  }
}
