/**
 * OpenTelemetry Bridge
 *
 * Provides bidirectional integration between AgentOps and OpenTelemetry:
 * - Accepts incoming OTel traces and converts them to AgentOps events
 * - Exports AgentOps events as OTel spans
 * - Correlates traces across systems
 * - Propagates context across service boundaries
 */

import type { AgentEvent, SessionMetadata, TokenUsage } from "../types.js";
import type {
  OTelBridgeConfig,
  ResolvedOTelBridgeConfig,
  OTelTraceContext,
  OTelSpan,
  SpanAttributes,
  ContextCarrier,
  OTelExportResult,
  ResolvedOTelExporterConfig,
} from "./types.js";
import { GEN_AI_ATTRIBUTES, MapContextCarrier } from "./types.js";
import { OTelExporter } from "./exporter.js";
import { CompositePropagator } from "./propagator.js";
import { generateEventId, generateSessionId } from "../utils.js";

// Default exporter config
const DEFAULT_EXPORTER_CONFIG: ResolvedOTelExporterConfig = {
  enabled: false,
  endpoint: "http://localhost:4318/v1/traces",
  protocol: "http/json",
  compression: "none",
  headers: {},
  timeout: 30000,
  maxBatchSize: 512,
  exportInterval: 5000,
  maxRetries: 3,
  resourceAttributes: {},
  serviceName: "agentops-sdk",
  serviceVersion: "0.1.0",
  includeSessionContext: true,
  includeCostAttributes: true,
  includeContentAttributes: false,
  debug: false,
};

/**
 * Resolve bridge configuration with defaults
 */
function resolveConfig(config: OTelBridgeConfig): ResolvedOTelBridgeConfig {
  return {
    enabled: config.enabled,
    acceptIncoming: config.acceptIncoming ?? true,
    exportOutgoing: config.exportOutgoing ?? true,
    correlateTraces: config.correlateTraces ?? true,
    propagationHeaders: {
      traceparent: config.propagationHeaders?.traceparent ?? "traceparent",
      tracestate: config.propagationHeaders?.tracestate ?? "tracestate",
    },
    samplingRate: config.samplingRate ?? 1.0,
    exporter: config.exporter
      ? {
          ...DEFAULT_EXPORTER_CONFIG,
          ...config.exporter,
          enabled: config.exporter.enabled,
        }
      : DEFAULT_EXPORTER_CONFIG,
    debug: config.debug ?? false,
  };
}

/**
 * Context for an active trace
 */
interface ActiveTraceContext {
  traceContext: OTelTraceContext;
  sessionId: string;
  baggage: Record<string, string>;
  startTime: number;
  spans: Map<string, SpanInfo>;
}

/**
 * Information about an active span
 */
interface SpanInfo {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  attributes: SpanAttributes;
  events: AgentEvent[];
}

/**
 * OpenTelemetry Bridge for AgentOps
 */
export class OTelBridge {
  private readonly config: ResolvedOTelBridgeConfig;
  private readonly propagator: CompositePropagator;
  private readonly exporter: OTelExporter | null;

  // Active trace contexts indexed by trace ID
  private readonly activeTraces: Map<string, ActiveTraceContext> = new Map();

  // Map session IDs to trace IDs for correlation
  private readonly sessionToTrace: Map<string, string> = new Map();

  // Callback for emitting converted events
  private eventCallback: ((event: AgentEvent) => void) | null = null;

  constructor(config: OTelBridgeConfig) {
    this.config = resolveConfig(config);

    this.propagator = new CompositePropagator({
      traceparentHeader: this.config.propagationHeaders.traceparent,
      tracestateHeader: this.config.propagationHeaders.tracestate,
    });

    // Initialize exporter if configured
    if (this.config.exportOutgoing && this.config.exporter.enabled) {
      this.exporter = new OTelExporter(this.config.exporter);
    } else {
      this.exporter = null;
    }

    if (this.config.debug) {
      console.log("[OTelBridge] Initialized", {
        acceptIncoming: this.config.acceptIncoming,
        exportOutgoing: this.config.exportOutgoing,
        correlateTraces: this.config.correlateTraces,
        samplingRate: this.config.samplingRate,
      });
    }
  }

  /**
   * Check if the bridge is enabled
   */
  get isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Set the callback for emitting converted events
   */
  setEventCallback(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  // ===========================================================================
  // Context Propagation
  // ===========================================================================

  /**
   * Extract trace context from a carrier (e.g., incoming HTTP headers)
   */
  extractContext(carrier: ContextCarrier): OTelTraceContext | null {
    if (!this.config.enabled || !this.config.acceptIncoming) {
      return null;
    }

    const { context } = this.propagator.extract(carrier);

    if (context && this.config.debug) {
      console.log("[OTelBridge] Extracted context:", {
        traceId: context.traceId,
        spanId: context.spanId,
        sampled: context.sampled,
      });
    }

    return context;
  }

  /**
   * Extract context from HTTP headers object
   */
  extractFromHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): OTelTraceContext | null {
    const carrier = new MapContextCarrier();
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        carrier.set(key, Array.isArray(value) ? value[0] : value);
      }
    }
    return this.extractContext(carrier);
  }

  /**
   * Inject trace context into a carrier (e.g., outgoing HTTP headers)
   */
  injectContext(
    context: OTelTraceContext,
    carrier: ContextCarrier,
    baggage?: Record<string, string>,
  ): void {
    if (!this.config.enabled) {
      return;
    }

    this.propagator.inject(context, baggage ?? {}, carrier);

    if (this.config.debug) {
      console.log("[OTelBridge] Injected context:", {
        traceId: context.traceId,
        spanId: context.spanId,
      });
    }
  }

  /**
   * Inject context into HTTP headers object
   */
  injectIntoHeaders(
    context: OTelTraceContext,
    headers: Record<string, string>,
    baggage?: Record<string, string>,
  ): Record<string, string> {
    const carrier = new MapContextCarrier(headers);
    this.injectContext(context, carrier, baggage);
    return carrier.toObject();
  }

  /**
   * Create a new trace context for a session
   */
  createTraceContext(sessionId?: string): OTelTraceContext {
    // Apply sampling decision
    const sampled = Math.random() < this.config.samplingRate;
    const context = this.propagator.createRootContext(sampled);

    if (sessionId) {
      this.sessionToTrace.set(sessionId, context.traceId);
    }

    return context;
  }

  /**
   * Create a child context from a parent
   */
  createChildContext(parent: OTelTraceContext): OTelTraceContext {
    return this.propagator.createChildContext(parent);
  }

  /**
   * Get the trace context for a session
   */
  getTraceContextForSession(sessionId: string): OTelTraceContext | null {
    const traceId = this.sessionToTrace.get(sessionId);
    if (!traceId) {
      return null;
    }

    const activeTrace = this.activeTraces.get(traceId);
    if (!activeTrace) {
      return null;
    }

    return activeTrace.traceContext;
  }

  // ===========================================================================
  // Incoming OTel Span Handling
  // ===========================================================================

  /**
   * Start accepting an incoming OTel trace
   *
   * Call this when receiving a request with trace context to begin
   * correlating subsequent AgentOps events with the incoming trace.
   */
  startIncomingTrace(
    context: OTelTraceContext,
    metadata?: SessionMetadata,
  ): { sessionId: string; traceContext: OTelTraceContext } {
    if (!this.config.enabled || !this.config.acceptIncoming) {
      throw new Error(
        "OTel bridge is not configured to accept incoming traces",
      );
    }

    const sessionId = generateSessionId();
    const childContext = this.createChildContext(context);

    // Store the active trace
    const activeTrace: ActiveTraceContext = {
      traceContext: childContext,
      sessionId,
      baggage: {},
      startTime: Date.now(),
      spans: new Map(),
    };

    this.activeTraces.set(context.traceId, activeTrace);
    this.sessionToTrace.set(sessionId, context.traceId);

    if (this.config.debug) {
      console.log("[OTelBridge] Started incoming trace:", {
        traceId: context.traceId,
        sessionId,
      });
    }

    // Emit session start event if callback is set
    if (this.eventCallback) {
      const event: AgentEvent = {
        eventId: generateEventId(),
        sessionId,
        type: "session_start",
        timestamp: Date.now(),
        userId: metadata?.userId,
        featureId: metadata?.featureId,
        tags: metadata?.tags,
        metadata: {
          ...metadata?.metadata,
          otel_trace_id: context.traceId,
          otel_parent_span_id: context.spanId,
        },
      };
      this.eventCallback(event);
    }

    return { sessionId, traceContext: childContext };
  }

  /**
   * End an incoming trace and clean up
   */
  endIncomingTrace(traceId: string): void {
    const activeTrace = this.activeTraces.get(traceId);
    if (!activeTrace) {
      return;
    }

    // Emit session end event if callback is set
    if (this.eventCallback) {
      const event: AgentEvent = {
        eventId: generateEventId(),
        sessionId: activeTrace.sessionId,
        type: "session_end",
        status: "completed",
        timestamp: Date.now(),
      };
      this.eventCallback(event);
    }

    // Clean up
    this.activeTraces.delete(traceId);
    this.sessionToTrace.delete(activeTrace.sessionId);

    if (this.config.debug) {
      console.log("[OTelBridge] Ended incoming trace:", {
        traceId,
        sessionId: activeTrace.sessionId,
      });
    }
  }

  /**
   * Convert an OTel span to AgentOps event(s)
   */
  spanToEvents(span: OTelSpan, sessionId?: string): AgentEvent[] {
    const events: AgentEvent[] = [];

    // Determine session ID
    const resolvedSessionId =
      sessionId ??
      (span.attributes[GEN_AI_ATTRIBUTES.AGENTOPS_SESSION_ID] as string) ??
      generateSessionId();

    // Base event properties
    const baseEvent = {
      sessionId: resolvedSessionId,
      timestamp: Math.floor(span.startTimeUnixNano / 1_000_000),
      parentEventId: span.parentSpanId,
      metadata: {
        otel_trace_id: span.traceId,
        otel_span_id: span.spanId,
      },
    };

    // Determine event type from span attributes or name
    const operationName = span.attributes[
      GEN_AI_ATTRIBUTES.OPERATION_NAME
    ] as string;
    const eventType = span.attributes[
      GEN_AI_ATTRIBUTES.AGENTOPS_EVENT_TYPE
    ] as string;

    // Check for error status first - errors take precedence
    if (span.status.code === "ERROR") {
      events.push({
        ...baseEvent,
        eventId: generateEventId(),
        type: "error",
        errorType: (span.attributes["exception.type"] as string) ?? "Error",
        errorMessage:
          span.status.message ??
          (span.attributes["exception.message"] as string) ??
          "Unknown error",
        stackTrace: span.attributes["exception.stacktrace"] as string,
        durationMs: Math.floor(
          (span.endTimeUnixNano - span.startTimeUnixNano) / 1_000_000,
        ),
      });
    } else if (eventType === "prompt" || span.name.includes("prompt")) {
      events.push({
        ...baseEvent,
        eventId: generateEventId(),
        type: "prompt",
        role:
          (span.attributes["gen_ai.prompt.role"] as
            | "user"
            | "system"
            | "assistant") ?? "user",
        content: (span.attributes[GEN_AI_ATTRIBUTES.PROMPT] as string) ?? "",
        model: span.attributes[GEN_AI_ATTRIBUTES.REQUEST_MODEL] as string,
      });
    } else if (
      eventType === "response" ||
      operationName === "chat" ||
      span.name.includes("chat")
    ) {
      const tokens: TokenUsage | undefined =
        span.attributes[GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS] !== undefined
          ? {
              promptTokens: span.attributes[
                GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS
              ] as number,
              completionTokens: span.attributes[
                GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS
              ] as number,
              totalTokens: span.attributes[
                GEN_AI_ATTRIBUTES.USAGE_TOTAL_TOKENS
              ] as number,
            }
          : undefined;

      events.push({
        ...baseEvent,
        eventId: generateEventId(),
        type: "response",
        content:
          (span.attributes[GEN_AI_ATTRIBUTES.COMPLETION] as string) ?? "",
        model:
          (span.attributes[GEN_AI_ATTRIBUTES.RESPONSE_MODEL] as string) ??
          "unknown",
        durationMs: Math.floor(
          (span.endTimeUnixNano - span.startTimeUnixNano) / 1_000_000,
        ),
        tokens,
        finishReason: (
          span.attributes[GEN_AI_ATTRIBUTES.RESPONSE_FINISH_REASONS] as string[]
        )?.[0],
      });
    } else if (operationName === "tool_call" || span.name.includes("tool")) {
      const toolName =
        (span.attributes[GEN_AI_ATTRIBUTES.TOOL_NAME] as string) ?? "unknown";

      events.push({
        ...baseEvent,
        eventId: generateEventId(),
        type: "tool_call",
        toolName,
        toolInput: span.attributes[GEN_AI_ATTRIBUTES.TOOL_ARGUMENTS],
      });

      // If span has result, also emit tool_result
      // Note: Error status was already handled above, so here it's always success
      if (span.attributes[GEN_AI_ATTRIBUTES.TOOL_RESULT] !== undefined) {
        events.push({
          ...baseEvent,
          eventId: generateEventId(),
          type: "tool_result",
          toolName,
          toolOutput: span.attributes[GEN_AI_ATTRIBUTES.TOOL_RESULT],
          status: "success",
          durationMs: Math.floor(
            (span.endTimeUnixNano - span.startTimeUnixNano) / 1_000_000,
          ),
          timestamp: Math.floor(span.endTimeUnixNano / 1_000_000),
        });
      }
    } else {
      // Generic custom event
      events.push({
        ...baseEvent,
        eventId: generateEventId(),
        type: "custom",
        name: span.name,
        data: span.attributes,
      });
    }

    return events;
  }

  /**
   * Process an incoming OTel span and emit corresponding AgentOps events
   */
  processIncomingSpan(span: OTelSpan): void {
    if (!this.config.enabled || !this.config.acceptIncoming) {
      return;
    }

    // Find associated session
    const activeTrace = this.activeTraces.get(span.traceId);
    const sessionId = activeTrace?.sessionId;

    const events = this.spanToEvents(span, sessionId);

    if (this.eventCallback) {
      for (const event of events) {
        this.eventCallback(event);
      }
    }

    if (this.config.debug) {
      console.log("[OTelBridge] Processed incoming span:", {
        spanName: span.name,
        eventsEmitted: events.length,
      });
    }
  }

  // ===========================================================================
  // Outgoing Event Export
  // ===========================================================================

  /**
   * Export an AgentOps event as an OTel span
   */
  exportEvent(event: AgentEvent): void {
    if (!this.config.enabled || !this.config.exportOutgoing || !this.exporter) {
      return;
    }

    this.exporter.addEvent(event);
  }

  /**
   * Export multiple events
   */
  exportEvents(events: AgentEvent[]): void {
    if (!this.config.enabled || !this.config.exportOutgoing || !this.exporter) {
      return;
    }

    this.exporter.addEvents(events);
  }

  /**
   * Flush pending exports
   */
  async flush(): Promise<OTelExportResult | null> {
    if (!this.exporter) {
      return null;
    }

    return this.exporter.flush();
  }

  // ===========================================================================
  // Session Correlation
  // ===========================================================================

  /**
   * Correlate an AgentOps session with an OTel trace
   */
  correlateSession(sessionId: string, traceContext: OTelTraceContext): void {
    if (!this.config.enabled || !this.config.correlateTraces) {
      return;
    }

    this.sessionToTrace.set(sessionId, traceContext.traceId);

    // Update active trace if exists
    const activeTrace = this.activeTraces.get(traceContext.traceId);
    if (activeTrace) {
      activeTrace.sessionId = sessionId;
    }

    if (this.config.debug) {
      console.log("[OTelBridge] Correlated session:", {
        sessionId,
        traceId: traceContext.traceId,
      });
    }
  }

  /**
   * Get trace ID for a session
   */
  getTraceIdForSession(sessionId: string): string | null {
    return this.sessionToTrace.get(sessionId) ?? null;
  }

  /**
   * Get session ID for a trace
   */
  getSessionIdForTrace(traceId: string): string | null {
    const activeTrace = this.activeTraces.get(traceId);
    return activeTrace?.sessionId ?? null;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Clean up resources for a session
   */
  cleanupSession(sessionId: string): void {
    const traceId = this.sessionToTrace.get(sessionId);
    if (traceId) {
      this.activeTraces.delete(traceId);
    }
    this.sessionToTrace.delete(sessionId);

    if (this.exporter) {
      this.exporter.cleanupSession(sessionId);
    }
  }

  /**
   * Shutdown the bridge
   */
  async shutdown(): Promise<void> {
    if (this.exporter) {
      await this.exporter.shutdown();
    }

    this.activeTraces.clear();
    this.sessionToTrace.clear();

    if (this.config.debug) {
      console.log("[OTelBridge] Shutdown complete");
    }
  }

  /**
   * Get bridge statistics
   */
  getStats(): {
    activeTraces: number;
    correlatedSessions: number;
    exportStats: ReturnType<OTelExporter["getStats"]> | null;
  } {
    return {
      activeTraces: this.activeTraces.size,
      correlatedSessions: this.sessionToTrace.size,
      exportStats: this.exporter?.getStats() ?? null,
    };
  }
}

/**
 * Create a middleware-style function for automatic context propagation
 * in HTTP request handlers
 */
export function createOTelMiddleware(bridge: OTelBridge) {
  return {
    /**
     * Extract trace context from incoming request
     */
    extractFromRequest(
      headers: Record<string, string | string[] | undefined>,
    ): OTelTraceContext | null {
      return bridge.extractFromHeaders(headers);
    },

    /**
     * Start a trace from incoming request context
     */
    startTrace(
      headers: Record<string, string | string[] | undefined>,
      metadata?: SessionMetadata,
    ): { sessionId: string; traceContext: OTelTraceContext } | null {
      const incomingContext = bridge.extractFromHeaders(headers);
      if (incomingContext) {
        return bridge.startIncomingTrace(incomingContext, metadata);
      }
      return null;
    },

    /**
     * Inject trace context into outgoing request headers
     */
    injectIntoRequest(
      sessionId: string,
      headers: Record<string, string>,
    ): Record<string, string> {
      const context = bridge.getTraceContextForSession(sessionId);
      if (context) {
        return bridge.injectIntoHeaders(context, headers);
      }
      return headers;
    },

    /**
     * End the trace for a session
     */
    endTrace(sessionId: string): void {
      const traceId = bridge.getTraceIdForSession(sessionId);
      if (traceId) {
        bridge.endIncomingTrace(traceId);
      }
    },
  };
}
