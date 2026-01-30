/**
 * AgentOps SDK - Trace Manager
 *
 * Manages distributed traces across multi-agent systems.
 */

import type {
  TraceContext,
  SpanInfo,
  AgentInfo,
  CorrelationConfig,
  ResolvedCorrelationConfig,
  TraceStats,
} from "./types.js";
import { ContextPropagator } from "./propagator.js";
import { now, generateEventId } from "../utils.js";

const DEFAULT_CORRELATION_CONFIG: ResolvedCorrelationConfig = {
  enabled: false,
  agent: {
    agentId: `agent_${Date.now()}`,
    name: "default-agent",
  },
  samplingRate: 1.0,
  propagateBaggage: true,
  maxBaggageItems: 64,
  propagationHeaders: {
    traceId: "x-agentops-trace-id",
    spanId: "x-agentops-span-id",
    parentSpanId: "x-agentops-parent-span-id",
    sampled: "x-agentops-sampled",
    baggage: "x-agentops-baggage",
  },
};

export class TraceManager {
  private readonly config: ResolvedCorrelationConfig;
  private readonly propagator: ContextPropagator;
  private activeSpans: Map<string, SpanInfo> = new Map();
  private completedSpans: Map<string, SpanInfo[]> = new Map();
  private currentContext: TraceContext | null = null;

  constructor(config?: CorrelationConfig) {
    this.config = {
      ...DEFAULT_CORRELATION_CONFIG,
      ...config,
      agent: config?.agent ?? DEFAULT_CORRELATION_CONFIG.agent,
      propagationHeaders: {
        ...DEFAULT_CORRELATION_CONFIG.propagationHeaders,
        ...config?.propagationHeaders,
      },
    };
    this.propagator = new ContextPropagator(this.config);
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  get agent(): AgentInfo {
    return this.config.agent;
  }

  /**
   * Start a new trace (root span)
   */
  startTrace(name: string, attributes?: Record<string, unknown>): SpanInfo {
    const context = this.propagator.createRootContext();
    this.currentContext = context;

    return this.startSpanWithContext(context, name, attributes);
  }

  /**
   * Continue a trace from an incoming context
   */
  continueTrace(
    incomingContext: TraceContext,
    name: string,
    attributes?: Record<string, unknown>,
  ): SpanInfo {
    const childContext = this.propagator.createChildContext(incomingContext);
    this.currentContext = childContext;

    return this.startSpanWithContext(childContext, name, attributes);
  }

  /**
   * Start a new span within the current trace
   */
  startSpan(name: string, attributes?: Record<string, unknown>): SpanInfo {
    if (!this.currentContext) {
      return this.startTrace(name, attributes);
    }

    const childContext = this.propagator.createChildContext(
      this.currentContext,
    );
    return this.startSpanWithContext(childContext, name, attributes);
  }

  /**
   * End a span
   */
  endSpan(
    spanId: string,
    status: "ok" | "error" = "ok",
    errorMessage?: string,
  ): SpanInfo | null {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      return null;
    }

    span.endTime = now();
    span.durationMs = span.endTime - span.startTime;
    span.status = status;
    if (errorMessage) {
      span.errorMessage = errorMessage;
    }

    this.activeSpans.delete(spanId);

    // Store in completed spans by trace
    const traceSpans = this.completedSpans.get(span.traceId) || [];
    traceSpans.push(span);
    this.completedSpans.set(span.traceId, traceSpans);

    return span;
  }

  /**
   * Get current trace context for propagation
   */
  getCurrentContext(): TraceContext | null {
    return this.currentContext;
  }

  /**
   * Set current context (e.g., from extracted headers)
   */
  setCurrentContext(context: TraceContext): void {
    this.currentContext = context;
  }

  /**
   * Inject trace context into headers for outgoing requests
   */
  injectContext(headers: Record<string, string> = {}): Record<string, string> {
    if (!this.currentContext) {
      return headers;
    }
    return this.propagator.inject(this.currentContext, headers);
  }

  /**
   * Extract trace context from incoming headers
   */
  extractContext(
    headers: Record<string, string | undefined>,
  ): TraceContext | null {
    return this.propagator.extract(headers);
  }

  /**
   * Add baggage to current context
   */
  addBaggage(key: string, value: string): void {
    if (this.currentContext) {
      this.currentContext = this.propagator.addBaggage(
        this.currentContext,
        key,
        value,
      );
    }
  }

  /**
   * Get baggage from current context
   */
  getBaggage(key: string): string | undefined {
    if (!this.currentContext) {
      return undefined;
    }
    return this.propagator.getBaggage(this.currentContext, key);
  }

  /**
   * Record an agent-to-agent call
   */
  recordAgentCall(
    _targetAgentId: string,
    _callType: "sync" | "async" = "sync",
  ): {
    eventId: string;
    headers: Record<string, string>;
  } {
    const eventId = generateEventId();
    const headers = this.injectContext();

    return { eventId, headers };
  }

  /**
   * Get statistics for a trace
   */
  getTraceStats(traceId: string): TraceStats | null {
    const spans = this.completedSpans.get(traceId);
    if (!spans || spans.length === 0) {
      return null;
    }

    const agentStats: TraceStats["agentStats"] = {};
    let totalDurationMs = 0;
    let errorCount = 0;
    const agents = new Set<string>();

    for (const span of spans) {
      agents.add(span.agentId);

      if (!agentStats[span.agentId]) {
        agentStats[span.agentId] = {
          spanCount: 0,
          totalDurationMs: 0,
          errorCount: 0,
        };
      }

      agentStats[span.agentId].spanCount++;
      agentStats[span.agentId].totalDurationMs += span.durationMs || 0;

      if (span.status === "error") {
        agentStats[span.agentId].errorCount++;
        errorCount++;
      }

      totalDurationMs = Math.max(
        totalDurationMs,
        (span.endTime || 0) - spans[0].startTime,
      );
    }

    // Calculate critical path (simplified: longest path from root to leaf)
    const criticalPathMs = this.calculateCriticalPath(spans);

    return {
      spanCount: spans.length,
      agentCount: agents.size,
      totalDurationMs,
      criticalPathMs,
      errorCount,
      agentStats,
    };
  }

  /**
   * Get all spans for a trace
   */
  getTraceSpans(traceId: string): SpanInfo[] {
    return this.completedSpans.get(traceId) || [];
  }

  /**
   * Clear completed spans for a trace
   */
  clearTrace(traceId: string): void {
    this.completedSpans.delete(traceId);
  }

  private startSpanWithContext(
    context: TraceContext,
    name: string,
    attributes?: Record<string, unknown>,
  ): SpanInfo {
    const span: SpanInfo = {
      spanId: context.spanId,
      parentSpanId: context.parentSpanId,
      traceId: context.traceId,
      name,
      agentId: this.config.agent.agentId,
      startTime: now(),
      status: "in_progress",
      attributes,
    };

    this.activeSpans.set(span.spanId, span);
    this.currentContext = context;

    return span;
  }

  private calculateCriticalPath(spans: SpanInfo[]): number {
    if (spans.length === 0) return 0;

    // Build span tree
    const spanMap = new Map<string, SpanInfo>();
    const children = new Map<string, SpanInfo[]>();
    let rootSpan: SpanInfo | null = null;

    for (const span of spans) {
      spanMap.set(span.spanId, span);
      if (!span.parentSpanId) {
        rootSpan = span;
      } else {
        const siblings = children.get(span.parentSpanId) || [];
        siblings.push(span);
        children.set(span.parentSpanId, siblings);
      }
    }

    if (!rootSpan) {
      return spans.reduce((max, s) => Math.max(max, s.durationMs || 0), 0);
    }

    // DFS to find longest path
    const findLongestPath = (span: SpanInfo): number => {
      const childSpans = children.get(span.spanId) || [];
      if (childSpans.length === 0) {
        return span.durationMs || 0;
      }

      const maxChildPath = Math.max(
        ...childSpans.map((c) => findLongestPath(c)),
      );
      return (span.durationMs || 0) + maxChildPath;
    };

    return findLongestPath(rootSpan);
  }
}
