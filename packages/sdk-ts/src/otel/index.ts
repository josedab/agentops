/**
 * OpenTelemetry Integration Module
 *
 * Provides bidirectional integration between AgentOps and OpenTelemetry:
 * - Export AgentOps events as OTel spans via OTLP
 * - Accept incoming OTel traces and convert to AgentOps events
 * - W3C Trace Context propagation
 * - Semantic conventions for Generative AI
 *
 * @packageDocumentation
 */

// Core Bridge
export { OTelBridge, createOTelMiddleware } from "./bridge.js";

// OTLP Exporter
export { OTelExporter } from "./exporter.js";

// Context Propagation
export {
  W3CTraceContextPropagator,
  W3CBaggagePropagator,
  CompositePropagator,
  generateTraceId,
  generateSpanId,
  isValidTraceId,
  isValidSpanId,
  parseTraceparent,
  formatTraceparent,
  parseBaggage,
  formatBaggage,
  TRACE_FLAGS,
} from "./propagator.js";

// Semantic Conventions
export { GEN_AI_ATTRIBUTES, MapContextCarrier } from "./types.js";

// Backend Adapters & Resource Detection
export {
  DatadogAdapter,
  GrafanaTempoAdapter,
  JaegerAdapter,
  HoneycombAdapter,
  NewRelicAdapter,
  detectResource,
  OTelMetricsCollector,
} from "./backends.js";

export type {
  BackendAdapter,
  BackendAdapterConfig,
  DatadogAdapterOptions,
  GrafanaTempoAdapterOptions,
  JaegerAdapterOptions,
  HoneycombAdapterOptions,
  NewRelicAdapterOptions,
  MetricDataPoint,
  HistogramBucket,
  MetricsSnapshot,
} from "./backends.js";

// Types
export type {
  // Trace Context
  OTelTraceContext,
  OTelSpanStatus,
  OTelSpanKind,

  // Span Types
  OTelSpan,
  OTelSpanEvent,
  OTelSpanLink,
  SpanAttributes,
  SpanBuilder,

  // Semantic Conventions
  GenAISystem,
  GenAIOperationName,

  // OTLP Protocol
  OTLPExportTraceRequest,
  OTLPExportResponse,
  OTLPResourceSpans,
  OTLPScopeSpans,
  OTLPSpan,
  OTLPSpanEvent,
  OTLPSpanLink,
  OTLPStatus,
  OTLPResource,
  OTLPInstrumentationScope,
  OTLPKeyValue,
  OTLPAnyValue,
  OTLPProtocol,
  OTLPCompression,
  OTLPHeaders,

  // Configuration
  OTelExporterConfig,
  ResolvedOTelExporterConfig,
  OTelBridgeConfig,
  ResolvedOTelBridgeConfig,

  // Results and Stats
  OTelExportResult,
  OTelExportStats,

  // Context Carrier
  ContextCarrier,
} from "./types.js";
