/**
 * AgentOps SDK - Trace Context Propagation
 *
 * Handles propagation of trace context across agent boundaries.
 */

import type { TraceContext, ResolvedCorrelationConfig } from "./types.js";
import { generateTraceId, generateSpanId } from "./utils.js";

// W3C Trace Context header names (defaults)
const DEFAULT_HEADERS = {
  traceId: "x-agentops-trace-id",
  spanId: "x-agentops-span-id",
  parentSpanId: "x-agentops-parent-span-id",
  sampled: "x-agentops-sampled",
  baggage: "x-agentops-baggage",
};

export class ContextPropagator {
  private readonly config: ResolvedCorrelationConfig;
  private readonly headers: typeof DEFAULT_HEADERS;

  constructor(config: ResolvedCorrelationConfig) {
    this.config = config;
    this.headers = {
      ...DEFAULT_HEADERS,
      ...config.propagationHeaders,
    };
  }

  /**
   * Create a new root trace context
   */
  createRootContext(): TraceContext {
    const sampled = Math.random() < this.config.samplingRate;

    return {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      sampled,
      baggage: {},
    };
  }

  /**
   * Create a child context from a parent
   */
  createChildContext(parent: TraceContext): TraceContext {
    return {
      traceId: parent.traceId,
      spanId: generateSpanId(),
      parentSpanId: parent.spanId,
      sampled: parent.sampled,
      baggage: { ...parent.baggage },
    };
  }

  /**
   * Inject trace context into headers for outgoing requests
   */
  inject(
    context: TraceContext,
    headers: Record<string, string>,
  ): Record<string, string> {
    const result = { ...headers };

    result[this.headers.traceId] = context.traceId;
    result[this.headers.spanId] = context.spanId;
    result[this.headers.sampled] = context.sampled ? "1" : "0";

    if (context.parentSpanId) {
      result[this.headers.parentSpanId] = context.parentSpanId;
    }

    if (this.config.propagateBaggage && context.baggage) {
      const baggageEntries = Object.entries(context.baggage)
        .slice(0, this.config.maxBaggageItems)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join(",");

      if (baggageEntries) {
        result[this.headers.baggage] = baggageEntries;
      }
    }

    return result;
  }

  /**
   * Extract trace context from incoming request headers
   */
  extract(headers: Record<string, string | undefined>): TraceContext | null {
    const traceId =
      headers[this.headers.traceId] ||
      headers[this.headers.traceId.toLowerCase()];
    const spanId =
      headers[this.headers.spanId] ||
      headers[this.headers.spanId.toLowerCase()];

    if (!traceId) {
      return null;
    }

    const parentSpanId =
      headers[this.headers.parentSpanId] ||
      headers[this.headers.parentSpanId.toLowerCase()];
    const sampledHeader =
      headers[this.headers.sampled] ||
      headers[this.headers.sampled.toLowerCase()];
    const baggageHeader =
      headers[this.headers.baggage] ||
      headers[this.headers.baggage.toLowerCase()];

    const sampled = sampledHeader !== "0";
    const baggage = this.parseBaggage(baggageHeader);

    return {
      traceId,
      spanId: spanId || generateSpanId(),
      parentSpanId,
      sampled,
      baggage,
    };
  }

  /**
   * Add a baggage item to the context
   */
  addBaggage(context: TraceContext, key: string, value: string): TraceContext {
    const currentCount = Object.keys(context.baggage || {}).length;

    if (currentCount >= this.config.maxBaggageItems) {
      console.warn(
        `[AgentOps] Maximum baggage items (${this.config.maxBaggageItems}) reached`,
      );
      return context;
    }

    return {
      ...context,
      baggage: {
        ...context.baggage,
        [key]: value,
      },
    };
  }

  /**
   * Get a baggage item from the context
   */
  getBaggage(context: TraceContext, key: string): string | undefined {
    return context.baggage?.[key];
  }

  private parseBaggage(
    baggageHeader: string | undefined,
  ): Record<string, string> {
    if (!baggageHeader) {
      return {};
    }

    const result: Record<string, string> = {};
    const entries = baggageHeader.split(",");

    for (const entry of entries.slice(0, this.config.maxBaggageItems)) {
      const [key, value] = entry.split("=");
      if (key && value) {
        try {
          result[decodeURIComponent(key.trim())] = decodeURIComponent(
            value.trim(),
          );
        } catch {
          // Skip invalid entries
        }
      }
    }

    return result;
  }
}
