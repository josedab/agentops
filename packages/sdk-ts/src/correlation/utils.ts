/**
 * AgentOps SDK - Correlation Utilities
 */

import { nanoid } from "nanoid";

/**
 * Generate a unique trace ID (32-char hex string)
 */
export function generateTraceId(): string {
  return `tr_${nanoid(28)}`;
}

/**
 * Generate a unique span ID (16-char hex string)
 */
export function generateSpanId(): string {
  return `sp_${nanoid(16)}`;
}

/**
 * Validate a trace ID format
 */
export function isValidTraceId(traceId: string): boolean {
  return (
    typeof traceId === "string" &&
    traceId.startsWith("tr_") &&
    traceId.length === 31
  );
}

/**
 * Validate a span ID format
 */
export function isValidSpanId(spanId: string): boolean {
  return (
    typeof spanId === "string" &&
    spanId.startsWith("sp_") &&
    spanId.length === 19
  );
}
