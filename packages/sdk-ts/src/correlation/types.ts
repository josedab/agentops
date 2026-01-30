/**
 * AgentOps SDK - Multi-Agent Correlation Types
 *
 * Type definitions for distributed agent tracing.
 */

// ============================================================================
// Trace Context Types
// ============================================================================

export interface TraceContext {
  /** Unique trace ID spanning all agents in a request */
  traceId: string;

  /** Span ID for this specific agent/operation */
  spanId: string;

  /** Parent span ID (if this is a child span) */
  parentSpanId?: string;

  /** Sampling decision for this trace */
  sampled: boolean;

  /** Trace flags (for future extensibility) */
  flags?: number;

  /** Baggage items (key-value pairs propagated across agents) */
  baggage?: Record<string, string>;
}

export interface SpanInfo {
  /** Span ID */
  spanId: string;

  /** Parent span ID */
  parentSpanId?: string;

  /** Trace ID this span belongs to */
  traceId: string;

  /** Name/operation of this span */
  name: string;

  /** Agent that created this span */
  agentId: string;

  /** Start timestamp (ms) */
  startTime: number;

  /** End timestamp (ms) */
  endTime?: number;

  /** Duration in ms */
  durationMs?: number;

  /** Status of the span */
  status: "ok" | "error" | "in_progress";

  /** Error message if status is error */
  errorMessage?: string;

  /** Tags/attributes for this span */
  attributes?: Record<string, unknown>;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentInfo {
  /** Unique identifier for this agent */
  agentId: string;

  /** Human-readable name */
  name: string;

  /** Agent type/category */
  type?: string;

  /** Version of the agent */
  version?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Correlation Configuration
// ============================================================================

export interface CorrelationConfig {
  /** Enable multi-agent correlation */
  enabled: boolean;

  /** Agent info for this instance */
  agent?: AgentInfo;

  /** Sampling rate for traces (0-1) */
  samplingRate?: number;

  /** Whether to propagate baggage items */
  propagateBaggage?: boolean;

  /** Maximum baggage items to propagate */
  maxBaggageItems?: number;

  /** Headers to use for context propagation */
  propagationHeaders?: {
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
    sampled?: string;
    baggage?: string;
  };
}

export interface ResolvedCorrelationConfig {
  enabled: boolean;
  agent: AgentInfo;
  samplingRate: number;
  propagateBaggage: boolean;
  maxBaggageItems: number;
  propagationHeaders: {
    traceId: string;
    spanId: string;
    parentSpanId: string;
    sampled: string;
    baggage: string;
  };
}

// ============================================================================
// Correlation Events
// ============================================================================

export interface SpanStartEvent {
  eventId: string;
  sessionId: string;
  type: "span_start";
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  agentId: string;
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface SpanEndEvent {
  eventId: string;
  sessionId: string;
  type: "span_end";
  traceId: string;
  spanId: string;
  status: "ok" | "error";
  errorMessage?: string;
  timestamp: number;
  durationMs: number;
}

export interface AgentCallEvent {
  eventId: string;
  sessionId: string;
  type: "agent_call";
  traceId: string;
  spanId: string;
  sourceAgentId: string;
  targetAgentId: string;
  callType: "sync" | "async";
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Trace Statistics
// ============================================================================

export interface TraceStats {
  /** Total number of spans in trace */
  spanCount: number;

  /** Number of unique agents involved */
  agentCount: number;

  /** Total duration of the trace */
  totalDurationMs: number;

  /** Critical path duration */
  criticalPathMs: number;

  /** Number of errors in trace */
  errorCount: number;

  /** Agent-level statistics */
  agentStats: Record<
    string,
    {
      spanCount: number;
      totalDurationMs: number;
      errorCount: number;
    }
  >;
}
