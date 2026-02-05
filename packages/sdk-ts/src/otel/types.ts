/**
 * OpenTelemetry Integration Types
 *
 * Type definitions following OpenTelemetry semantic conventions for Generative AI.
 * Based on emerging gen_ai.* semantic conventions from the OpenTelemetry community.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */

// ============================================================================
// OpenTelemetry Core Types
// ============================================================================

/**
 * W3C Trace Context format for distributed tracing
 */
export interface OTelTraceContext {
  /** 16-byte hex-encoded trace ID */
  traceId: string;

  /** 8-byte hex-encoded span ID */
  spanId: string;

  /** 8-byte hex-encoded parent span ID (if exists) */
  parentSpanId?: string;

  /** Trace flags (sampled = 0x01) */
  traceFlags: number;

  /** Whether this trace is sampled (derived from traceFlags) */
  sampled: boolean;

  /** Optional trace state for vendor-specific data */
  traceState?: string;

  /** Baggage items (key-value pairs propagated across agents) */
  baggage?: Record<string, string>;
}

/**
 * Span status following OTel conventions
 */
export type OTelSpanStatus = "UNSET" | "OK" | "ERROR";

/**
 * Span kind following OTel conventions
 */
export type OTelSpanKind =
  | "INTERNAL"
  | "SERVER"
  | "CLIENT"
  | "PRODUCER"
  | "CONSUMER";

// ============================================================================
// Gen AI Semantic Conventions
// ============================================================================

/**
 * Standard attribute names for Generative AI operations
 * Following the OpenTelemetry Gen AI semantic conventions
 */
export const GEN_AI_ATTRIBUTES = {
  // System attributes
  SYSTEM: "gen_ai.system",
  REQUEST_MODEL: "gen_ai.request.model",
  RESPONSE_MODEL: "gen_ai.response.model",
  OPERATION_NAME: "gen_ai.operation.name",

  // Token usage
  USAGE_INPUT_TOKENS: "gen_ai.usage.input_tokens",
  USAGE_OUTPUT_TOKENS: "gen_ai.usage.output_tokens",
  USAGE_TOTAL_TOKENS: "gen_ai.usage.total_tokens",

  // Request parameters
  REQUEST_MAX_TOKENS: "gen_ai.request.max_tokens",
  REQUEST_TEMPERATURE: "gen_ai.request.temperature",
  REQUEST_TOP_P: "gen_ai.request.top_p",
  REQUEST_TOP_K: "gen_ai.request.top_k",
  REQUEST_STOP_SEQUENCES: "gen_ai.request.stop_sequences",
  REQUEST_FREQUENCY_PENALTY: "gen_ai.request.frequency_penalty",
  REQUEST_PRESENCE_PENALTY: "gen_ai.request.presence_penalty",

  // Response attributes
  RESPONSE_FINISH_REASONS: "gen_ai.response.finish_reasons",
  RESPONSE_ID: "gen_ai.response.id",

  // Prompt and completion content
  PROMPT: "gen_ai.prompt",
  COMPLETION: "gen_ai.completion",

  // Tool calling
  TOOL_NAME: "gen_ai.tool.name",
  TOOL_CALL_ID: "gen_ai.tool.call_id",
  TOOL_ARGUMENTS: "gen_ai.tool.arguments",
  TOOL_RESULT: "gen_ai.tool.result",

  // Cost tracking (AgentOps extension)
  COST_INPUT: "gen_ai.cost.input",
  COST_OUTPUT: "gen_ai.cost.output",
  COST_TOTAL: "gen_ai.cost.total",
  COST_CURRENCY: "gen_ai.cost.currency",

  // AgentOps-specific extensions
  AGENTOPS_SESSION_ID: "agentops.session.id",
  AGENTOPS_USER_ID: "agentops.user.id",
  AGENTOPS_FEATURE_ID: "agentops.feature.id",
  AGENTOPS_EVENT_TYPE: "agentops.event.type",
} as const;

/**
 * Known Gen AI system identifiers
 */
export type GenAISystem =
  | "openai"
  | "anthropic"
  | "google_ai"
  | "azure_openai"
  | "cohere"
  | "mistral"
  | "github_copilot"
  | "amazon_bedrock"
  | "other";

/**
 * Gen AI operation names
 */
export type GenAIOperationName =
  | "chat"
  | "completion"
  | "embedding"
  | "image_generation"
  | "text_to_speech"
  | "speech_to_text"
  | "tool_call"
  | "tool_result";

// ============================================================================
// OTel Span Types
// ============================================================================

/**
 * Span attributes as key-value pairs
 */
export type SpanAttributes = Record<
  string,
  string | number | boolean | string[] | number[] | boolean[] | undefined
>;

/**
 * Span event (for logging within a span)
 */
export interface OTelSpanEvent {
  /** Event name */
  name: string;

  /** Timestamp in nanoseconds */
  timeUnixNano: number;

  /** Event attributes */
  attributes?: SpanAttributes;

  /** Number of dropped attributes */
  droppedAttributesCount?: number;
}

/**
 * Span link (for connecting related traces)
 */
export interface OTelSpanLink {
  /** Trace ID of the linked span */
  traceId: string;

  /** Span ID of the linked span */
  spanId: string;

  /** Trace state */
  traceState?: string;

  /** Link attributes */
  attributes?: SpanAttributes;

  /** Number of dropped attributes */
  droppedAttributesCount?: number;
}

/**
 * Complete span representation following OTLP protocol
 */
export interface OTelSpan {
  /** 16-byte hex trace ID */
  traceId: string;

  /** 8-byte hex span ID */
  spanId: string;

  /** Trace state string */
  traceState?: string;

  /** Parent span ID (if any) */
  parentSpanId?: string;

  /** Span name/operation */
  name: string;

  /** Span kind */
  kind: OTelSpanKind;

  /** Start time in nanoseconds since epoch */
  startTimeUnixNano: number;

  /** End time in nanoseconds since epoch */
  endTimeUnixNano: number;

  /** Span attributes */
  attributes: SpanAttributes;

  /** Number of dropped attributes */
  droppedAttributesCount?: number;

  /** Span events */
  events?: OTelSpanEvent[];

  /** Number of dropped events */
  droppedEventsCount?: number;

  /** Span links */
  links?: OTelSpanLink[];

  /** Number of dropped links */
  droppedLinksCount?: number;

  /** Span status */
  status: {
    code: OTelSpanStatus;
    message?: string;
  };
}

// ============================================================================
// OTLP Protocol Types (for HTTP/JSON export)
// ============================================================================

/**
 * Key-value pair for OTLP protocol
 */
export interface OTLPKeyValue {
  key: string;
  value: OTLPAnyValue;
}

/**
 * Any value type for OTLP protocol
 */
export interface OTLPAnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: number;
  doubleValue?: number;
  arrayValue?: { values: OTLPAnyValue[] };
  kvlistValue?: { values: OTLPKeyValue[] };
  bytesValue?: string; // base64 encoded
}

/**
 * OTLP span representation
 */
export interface OTLPSpan {
  traceId: string; // base64 encoded
  spanId: string; // base64 encoded
  traceState?: string;
  parentSpanId?: string; // base64 encoded
  name: string;
  kind: number; // SpanKind enum value
  startTimeUnixNano: string; // uint64 as string
  endTimeUnixNano: string; // uint64 as string
  attributes?: OTLPKeyValue[];
  droppedAttributesCount?: number;
  events?: OTLPSpanEvent[];
  droppedEventsCount?: number;
  links?: OTLPSpanLink[];
  droppedLinksCount?: number;
  status?: OTLPStatus;
}

/**
 * OTLP span event
 */
export interface OTLPSpanEvent {
  timeUnixNano: string;
  name: string;
  attributes?: OTLPKeyValue[];
  droppedAttributesCount?: number;
}

/**
 * OTLP span link
 */
export interface OTLPSpanLink {
  traceId: string;
  spanId: string;
  traceState?: string;
  attributes?: OTLPKeyValue[];
  droppedAttributesCount?: number;
}

/**
 * OTLP status
 */
export interface OTLPStatus {
  code: number; // StatusCode enum
  message?: string;
}

/**
 * OTLP Resource
 */
export interface OTLPResource {
  attributes?: OTLPKeyValue[];
  droppedAttributesCount?: number;
}

/**
 * OTLP Instrumentation Scope
 */
export interface OTLPInstrumentationScope {
  name: string;
  version?: string;
  attributes?: OTLPKeyValue[];
  droppedAttributesCount?: number;
}

/**
 * OTLP Scope Spans (spans grouped by instrumentation scope)
 */
export interface OTLPScopeSpans {
  scope?: OTLPInstrumentationScope;
  spans: OTLPSpan[];
  schemaUrl?: string;
}

/**
 * OTLP Resource Spans (spans grouped by resource)
 */
export interface OTLPResourceSpans {
  resource?: OTLPResource;
  scopeSpans: OTLPScopeSpans[];
  schemaUrl?: string;
}

/**
 * OTLP Export Request for traces
 */
export interface OTLPExportTraceRequest {
  resourceSpans: OTLPResourceSpans[];
}

/**
 * OTLP Export Response
 */
export interface OTLPExportResponse {
  /** Partial success information */
  partialSuccess?: {
    /** Number of rejected spans */
    rejectedSpans?: number;
    /** Error message for partial rejection */
    errorMessage?: string;
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * OTLP Export protocol
 */
export type OTLPProtocol = "http/json" | "http/protobuf" | "grpc";

/**
 * OTLP Compression type
 */
export type OTLPCompression = "none" | "gzip";

/**
 * Headers for OTLP export
 */
export type OTLPHeaders = Record<string, string>;

/**
 * Configuration for the OpenTelemetry exporter
 */
export interface OTelExporterConfig {
  /** Enable OTel export (default: false) */
  enabled: boolean;

  /** OTLP endpoint URL (default: http://localhost:4318/v1/traces) */
  endpoint?: string;

  /** Export protocol (default: http/json) */
  protocol?: OTLPProtocol;

  /** Compression (default: none) */
  compression?: OTLPCompression;

  /** Additional headers to send with requests */
  headers?: OTLPHeaders;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Maximum batch size (default: 512) */
  maxBatchSize?: number;

  /** Export interval in milliseconds (default: 5000) */
  exportInterval?: number;

  /** Maximum retries for failed exports (default: 3) */
  maxRetries?: number;

  /** Resource attributes to include */
  resourceAttributes?: SpanAttributes;

  /** Service name (default: agentops-sdk) */
  serviceName?: string;

  /** Service version */
  serviceVersion?: string;

  /** Include AgentOps session context in spans */
  includeSessionContext?: boolean;

  /** Include cost information in spans */
  includeCostAttributes?: boolean;

  /** Include prompt/completion content in spans (may contain sensitive data) */
  includeContentAttributes?: boolean;

  /** Debug logging */
  debug?: boolean;
}

/**
 * Resolved configuration with defaults applied
 */
export interface ResolvedOTelExporterConfig {
  enabled: boolean;
  endpoint: string;
  protocol: OTLPProtocol;
  compression: OTLPCompression;
  headers: OTLPHeaders;
  timeout: number;
  maxBatchSize: number;
  exportInterval: number;
  maxRetries: number;
  resourceAttributes: SpanAttributes;
  serviceName: string;
  serviceVersion: string;
  includeSessionContext: boolean;
  includeCostAttributes: boolean;
  includeContentAttributes: boolean;
  debug: boolean;
}

// ============================================================================
// Bridge Types (for bidirectional integration)
// ============================================================================

/**
 * Configuration for the OTel Bridge
 */
export interface OTelBridgeConfig {
  /** Enable the bridge (default: false) */
  enabled: boolean;

  /** Accept incoming OTel traces (default: true) */
  acceptIncoming?: boolean;

  /** Export AgentOps events as OTel spans (default: true) */
  exportOutgoing?: boolean;

  /** Correlate OTel traces with AgentOps sessions */
  correlateTraces?: boolean;

  /** W3C Trace Context header names */
  propagationHeaders?: {
    traceparent?: string;
    tracestate?: string;
  };

  /** Sampling rate for exported spans (0-1, default: 1.0) */
  samplingRate?: number;

  /** Exporter configuration */
  exporter?: OTelExporterConfig;

  /** Debug logging */
  debug?: boolean;
}

/**
 * Resolved bridge configuration
 */
export interface ResolvedOTelBridgeConfig {
  enabled: boolean;
  acceptIncoming: boolean;
  exportOutgoing: boolean;
  correlateTraces: boolean;
  propagationHeaders: {
    traceparent: string;
    tracestate: string;
  };
  samplingRate: number;
  exporter: ResolvedOTelExporterConfig;
  debug: boolean;
}

// ============================================================================
// Export Result Types
// ============================================================================

/**
 * Result of an OTLP export operation
 */
export interface OTelExportResult {
  /** Whether the export succeeded */
  success: boolean;

  /** Number of spans exported */
  spanCount: number;

  /** Number of spans rejected (partial success) */
  rejectedSpanCount?: number;

  /** Error if export failed */
  error?: Error;

  /** Export duration in milliseconds */
  durationMs: number;
}

/**
 * Statistics for OTel export operations
 */
export interface OTelExportStats {
  /** Total spans exported */
  totalSpansExported: number;

  /** Total spans rejected */
  totalSpansRejected: number;

  /** Total export attempts */
  totalExports: number;

  /** Failed export attempts */
  failedExports: number;

  /** Average export duration */
  averageExportDurationMs: number;

  /** Last export timestamp */
  lastExportTimestamp?: number;

  /** Last error message */
  lastError?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Span builder for creating OTel spans
 */
export interface SpanBuilder {
  setName(name: string): SpanBuilder;
  setKind(kind: OTelSpanKind): SpanBuilder;
  setAttribute(key: string, value: SpanAttributes[string]): SpanBuilder;
  setAttributes(attributes: SpanAttributes): SpanBuilder;
  addEvent(event: OTelSpanEvent): SpanBuilder;
  addLink(link: OTelSpanLink): SpanBuilder;
  setStatus(code: OTelSpanStatus, message?: string): SpanBuilder;
  setParent(context: OTelTraceContext): SpanBuilder;
  build(): OTelSpan;
}

/**
 * Context carrier for propagation (typically HTTP headers)
 */
export interface ContextCarrier {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  keys(): string[];
}

/**
 * Map-based context carrier implementation
 */
export class MapContextCarrier implements ContextCarrier {
  private readonly map: Map<string, string>;

  constructor(initial?: Record<string, string>) {
    this.map = new Map(
      initial
        ? Object.entries(initial).map(([k, v]) => [k.toLowerCase(), v])
        : [],
    );
  }

  get(key: string): string | undefined {
    return this.map.get(key.toLowerCase());
  }

  set(key: string, value: string): void {
    this.map.set(key.toLowerCase(), value);
  }

  keys(): string[] {
    return Array.from(this.map.keys());
  }

  toObject(): Record<string, string> {
    return Object.fromEntries(this.map);
  }
}
