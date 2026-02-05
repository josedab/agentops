/**
 * W3C Trace Context Propagator
 *
 * Handles extraction and injection of trace context following the
 * W3C Trace Context specification (https://www.w3.org/TR/trace-context/).
 */

import type { OTelTraceContext, ContextCarrier } from "./types.js";

// W3C Trace Context header names
const TRACEPARENT_HEADER = "traceparent";
const TRACESTATE_HEADER = "tracestate";

// Trace context version
const VERSION = "00";

// Trace flags
export const TRACE_FLAGS = {
  SAMPLED: 0x01,
} as const;

/**
 * Generate a random trace ID (16 bytes = 32 hex chars)
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a random span ID (8 bytes = 16 hex chars)
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate trace ID format (32 hex characters, not all zeros)
 */
export function isValidTraceId(traceId: string): boolean {
  if (!/^[0-9a-f]{32}$/i.test(traceId)) {
    return false;
  }
  // Must not be all zeros
  return traceId !== "00000000000000000000000000000000";
}

/**
 * Validate span ID format (16 hex characters, not all zeros)
 */
export function isValidSpanId(spanId: string): boolean {
  if (!/^[0-9a-f]{16}$/i.test(spanId)) {
    return false;
  }
  // Must not be all zeros
  return spanId !== "0000000000000000";
}

/**
 * Parse a traceparent header value into a trace context
 *
 * Format: {version}-{trace-id}-{parent-id}-{trace-flags}
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */
export function parseTraceparent(header: string): OTelTraceContext | null {
  const trimmed = header.trim();
  const parts = trimmed.split("-");

  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, flags] = parts;

  // We only support version 00
  if (version !== VERSION) {
    // Future versions should be forward-compatible, but we'll be strict for now
    if (!/^[0-9a-f]{2}$/i.test(version)) {
      return null;
    }
  }

  // Validate trace-id (32 hex chars)
  if (!isValidTraceId(traceId)) {
    return null;
  }

  // Validate parent-id/span-id (16 hex chars)
  if (!isValidSpanId(spanId)) {
    return null;
  }

  // Validate trace-flags (2 hex chars)
  if (!/^[0-9a-f]{2}$/i.test(flags)) {
    return null;
  }

  const traceFlags = parseInt(flags, 16);

  return {
    traceId: traceId.toLowerCase(),
    spanId: spanId.toLowerCase(),
    traceFlags,
    sampled: (traceFlags & TRACE_FLAGS.SAMPLED) !== 0,
  };
}

/**
 * Format a trace context into a traceparent header value
 */
export function formatTraceparent(context: OTelTraceContext): string {
  const flags = context.traceFlags.toString(16).padStart(2, "0");
  return `${VERSION}-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Parse a tracestate header value
 *
 * Format: key1=value1,key2=value2
 */
export function parseTracestate(header: string): string {
  // Just pass through - tracestate is vendor-specific
  return header.trim();
}

/**
 * W3C Trace Context Propagator
 */
export class W3CTraceContextPropagator {
  private readonly traceparentHeader: string;
  private readonly tracestateHeader: string;

  constructor(options?: {
    traceparentHeader?: string;
    tracestateHeader?: string;
  }) {
    this.traceparentHeader = options?.traceparentHeader ?? TRACEPARENT_HEADER;
    this.tracestateHeader = options?.tracestateHeader ?? TRACESTATE_HEADER;
  }

  /**
   * Extract trace context from a carrier (e.g., HTTP headers)
   */
  extract(carrier: ContextCarrier): OTelTraceContext | null {
    const traceparent = carrier.get(this.traceparentHeader);
    if (!traceparent) {
      return null;
    }

    const context = parseTraceparent(traceparent);
    if (!context) {
      return null;
    }

    // Extract tracestate if present
    const tracestate = carrier.get(this.tracestateHeader);
    if (tracestate) {
      context.traceState = parseTracestate(tracestate);
    }

    return context;
  }

  /**
   * Inject trace context into a carrier (e.g., HTTP headers)
   */
  inject(context: OTelTraceContext, carrier: ContextCarrier): void {
    carrier.set(this.traceparentHeader, formatTraceparent(context));

    if (context.traceState) {
      carrier.set(this.tracestateHeader, context.traceState);
    }
  }

  /**
   * Create a child context from a parent context
   */
  createChildContext(parent: OTelTraceContext): OTelTraceContext {
    return {
      traceId: parent.traceId,
      spanId: generateSpanId(),
      parentSpanId: parent.spanId,
      traceFlags: parent.traceFlags,
      sampled: parent.sampled,
      traceState: parent.traceState,
    };
  }

  /**
   * Create a new root context
   */
  createRootContext(sampled: boolean = true): OTelTraceContext {
    return {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      traceFlags: sampled ? TRACE_FLAGS.SAMPLED : 0,
      sampled,
    };
  }
}

/**
 * Baggage propagation support
 *
 * W3C Baggage: https://www.w3.org/TR/baggage/
 */
const BAGGAGE_HEADER = "baggage";

/**
 * Parse baggage header into key-value pairs
 *
 * Format: key1=value1,key2=value2;metadata
 */
export function parseBaggage(header: string): Record<string, string> {
  const baggage: Record<string, string> = {};

  const items = header.split(",");
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;

    // Split on first '=' only
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    // Remove any metadata (after ';')
    let value = trimmed.substring(eqIndex + 1);
    const semicolonIndex = value.indexOf(";");
    if (semicolonIndex !== -1) {
      value = value.substring(0, semicolonIndex);
    }
    value = value.trim();

    // URL decode the value
    try {
      baggage[key] = decodeURIComponent(value);
    } catch {
      baggage[key] = value;
    }
  }

  return baggage;
}

/**
 * Format baggage into a header value
 */
export function formatBaggage(baggage: Record<string, string>): string {
  return Object.entries(baggage)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join(",");
}

/**
 * W3C Baggage Propagator
 */
export class W3CBaggagePropagator {
  private readonly baggageHeader: string;
  private readonly maxItems: number;
  private readonly maxSize: number;

  constructor(options?: {
    baggageHeader?: string;
    maxItems?: number;
    maxSize?: number;
  }) {
    this.baggageHeader = options?.baggageHeader ?? BAGGAGE_HEADER;
    this.maxItems = options?.maxItems ?? 180; // W3C recommendation
    this.maxSize = options?.maxSize ?? 8192; // 8KB limit
  }

  /**
   * Extract baggage from a carrier
   */
  extract(carrier: ContextCarrier): Record<string, string> {
    const header = carrier.get(this.baggageHeader);
    if (!header) {
      return {};
    }
    return parseBaggage(header);
  }

  /**
   * Inject baggage into a carrier
   */
  inject(baggage: Record<string, string>, carrier: ContextCarrier): void {
    const entries = Object.entries(baggage).slice(0, this.maxItems);
    if (entries.length === 0) {
      return;
    }

    let header = formatBaggage(Object.fromEntries(entries));

    // Truncate if exceeds max size
    if (header.length > this.maxSize) {
      // Remove items until under limit
      while (header.length > this.maxSize && entries.length > 0) {
        entries.pop();
        header = formatBaggage(Object.fromEntries(entries));
      }
    }

    if (header) {
      carrier.set(this.baggageHeader, header);
    }
  }
}

/**
 * Combined propagator for both trace context and baggage
 */
export class CompositePropagator {
  private readonly traceContextPropagator: W3CTraceContextPropagator;
  private readonly baggagePropagator: W3CBaggagePropagator;

  constructor(options?: {
    traceparentHeader?: string;
    tracestateHeader?: string;
    baggageHeader?: string;
    maxBaggageItems?: number;
  }) {
    this.traceContextPropagator = new W3CTraceContextPropagator({
      traceparentHeader: options?.traceparentHeader,
      tracestateHeader: options?.tracestateHeader,
    });
    this.baggagePropagator = new W3CBaggagePropagator({
      baggageHeader: options?.baggageHeader,
      maxItems: options?.maxBaggageItems,
    });
  }

  /**
   * Extract both trace context and baggage
   */
  extract(carrier: ContextCarrier): {
    context: OTelTraceContext | null;
    baggage: Record<string, string>;
  } {
    return {
      context: this.traceContextPropagator.extract(carrier),
      baggage: this.baggagePropagator.extract(carrier),
    };
  }

  /**
   * Inject both trace context and baggage
   */
  inject(
    context: OTelTraceContext,
    baggage: Record<string, string>,
    carrier: ContextCarrier,
  ): void {
    this.traceContextPropagator.inject(context, carrier);
    this.baggagePropagator.inject(baggage, carrier);
  }

  /**
   * Create a child context
   */
  createChildContext(parent: OTelTraceContext): OTelTraceContext {
    return this.traceContextPropagator.createChildContext(parent);
  }

  /**
   * Create a new root context
   */
  createRootContext(sampled?: boolean): OTelTraceContext {
    return this.traceContextPropagator.createRootContext(sampled);
  }
}
