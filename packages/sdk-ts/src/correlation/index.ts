/**
 * AgentOps SDK - Correlation Module
 *
 * Exports for multi-agent correlation functionality.
 */

export { TraceManager } from "./manager.js";
export { ContextPropagator } from "./propagator.js";
export {
  generateTraceId,
  generateSpanId,
  isValidTraceId,
  isValidSpanId,
} from "./utils.js";

export type {
  TraceContext,
  SpanInfo,
  AgentInfo,
  CorrelationConfig,
  ResolvedCorrelationConfig,
  SpanStartEvent,
  SpanEndEvent,
  AgentCallEvent,
  TraceStats,
} from "./types.js";
