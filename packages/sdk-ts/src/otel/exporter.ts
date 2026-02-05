/**
 * OTLP Exporter
 *
 * Exports AgentOps events as OpenTelemetry spans via OTLP HTTP/JSON protocol.
 */

import type { AgentEvent } from "../types.js";
import type {
  OTelExporterConfig,
  ResolvedOTelExporterConfig,
  OTelSpan,
  OTelSpanKind,
  OTelSpanStatus,
  SpanAttributes,
  OTLPExportTraceRequest,
  OTLPResourceSpans,
  OTLPSpan,
  OTLPKeyValue,
  OTLPAnyValue,
  OTelExportResult,
  OTelExportStats,
} from "./types.js";
import { GEN_AI_ATTRIBUTES, type GenAISystem } from "./types.js";
import { calculateCost } from "../pricing.js";

const SDK_NAME = "@agentops/sdk";
const SDK_VERSION = "0.1.0";

// Default OTLP endpoint for traces
const DEFAULT_OTLP_ENDPOINT = "http://localhost:4318/v1/traces";

// Span kind numeric values for OTLP protocol
const SPAN_KIND_MAP: Record<OTelSpanKind, number> = {
  INTERNAL: 1,
  SERVER: 2,
  CLIENT: 3,
  PRODUCER: 4,
  CONSUMER: 5,
};

// Status code numeric values for OTLP protocol
const STATUS_CODE_MAP: Record<OTelSpanStatus, number> = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
};

/**
 * Resolves configuration with defaults
 */
function resolveConfig(config: OTelExporterConfig): ResolvedOTelExporterConfig {
  return {
    enabled: config.enabled,
    endpoint: config.endpoint ?? DEFAULT_OTLP_ENDPOINT,
    protocol: config.protocol ?? "http/json",
    compression: config.compression ?? "none",
    headers: config.headers ?? {},
    timeout: config.timeout ?? 30000,
    maxBatchSize: config.maxBatchSize ?? 512,
    exportInterval: config.exportInterval ?? 5000,
    maxRetries: config.maxRetries ?? 3,
    resourceAttributes: config.resourceAttributes ?? {},
    serviceName: config.serviceName ?? "agentops-sdk",
    serviceVersion: config.serviceVersion ?? SDK_VERSION,
    includeSessionContext: config.includeSessionContext ?? true,
    includeCostAttributes: config.includeCostAttributes ?? true,
    includeContentAttributes: config.includeContentAttributes ?? false,
    debug: config.debug ?? false,
  };
}

/**
 * Generate a random trace ID (16 bytes as 32 hex chars)
 */
function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a random span ID (8 bytes as 16 hex chars)
 */
function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert milliseconds to nanoseconds as string (OTLP uses uint64 as string)
 */
/**
 * Convert nanoseconds (as number) to string for OTLP protocol
 * Handles potential floating point values by rounding to integer
 * OTLP uses uint64 represented as string for timestamps
 */
function nanoToString(ns: number): string {
  return BigInt(Math.round(ns)).toString();
}

/**
 * Convert hex string to base64 (for OTLP protocol)
 */
function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  // Use btoa for browser compatibility, Buffer.from for Node.js
  if (typeof btoa === "function") {
    return btoa(String.fromCharCode(...bytes));
  }
  return Buffer.from(bytes).toString("base64");
}

/**
 * Detect the Gen AI system from model name
 */
function detectGenAISystem(model?: string): GenAISystem {
  if (!model) return "other";

  const lowerModel = model.toLowerCase();

  if (
    lowerModel.includes("gpt") ||
    lowerModel.includes("o1") ||
    lowerModel.includes("o3")
  ) {
    return "openai";
  }
  if (lowerModel.includes("claude")) {
    return "anthropic";
  }
  if (lowerModel.includes("gemini")) {
    return "google_ai";
  }
  if (lowerModel.includes("cohere") || lowerModel.includes("command")) {
    return "cohere";
  }
  if (lowerModel.includes("mistral") || lowerModel.includes("mixtral")) {
    return "mistral";
  }
  if (lowerModel.includes("copilot")) {
    return "github_copilot";
  }
  if (lowerModel.includes("bedrock") || lowerModel.includes("titan")) {
    return "amazon_bedrock";
  }

  return "other";
}

/**
 * Convert a value to OTLP AnyValue format
 */
function toOTLPValue(value: unknown): OTLPAnyValue {
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { boolValue: value };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { intValue: value };
    }
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toOTLPValue),
      },
    };
  }
  if (value !== null && typeof value === "object") {
    return {
      kvlistValue: {
        values: Object.entries(value).map(([k, v]) => ({
          key: k,
          value: toOTLPValue(v),
        })),
      },
    };
  }
  return { stringValue: String(value) };
}

/**
 * Convert span attributes to OTLP KeyValue array
 */
function attributesToOTLP(attributes: SpanAttributes): OTLPKeyValue[] {
  return Object.entries(attributes)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({
      key,
      value: toOTLPValue(value),
    }));
}

/**
 * OTLP Exporter for AgentOps events
 */
export class OTelExporter {
  private readonly config: ResolvedOTelExporterConfig;
  private readonly pendingSpans: OTelSpan[] = [];
  private exportTimer: ReturnType<typeof setInterval> | null = null;
  private stats: OTelExportStats = {
    totalSpansExported: 0,
    totalSpansRejected: 0,
    totalExports: 0,
    failedExports: 0,
    averageExportDurationMs: 0,
  };

  // Track trace IDs for sessions to maintain correlation
  private readonly sessionTraceIds: Map<string, string> = new Map();
  // Track parent spans for event correlation
  private readonly eventSpanIds: Map<string, string> = new Map();

  constructor(config: OTelExporterConfig) {
    this.config = resolveConfig(config);

    if (this.config.enabled && this.config.exportInterval > 0) {
      this.startExportTimer();
    }

    if (this.config.debug) {
      console.log("[OTelExporter] Initialized", {
        endpoint: this.config.endpoint,
        protocol: this.config.protocol,
      });
    }
  }

  /**
   * Check if exporter is enabled
   */
  get isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get export statistics
   */
  getStats(): OTelExportStats {
    return { ...this.stats };
  }

  /**
   * Get or create a trace ID for a session
   */
  getTraceIdForSession(sessionId: string): string {
    let traceId = this.sessionTraceIds.get(sessionId);
    if (!traceId) {
      traceId = generateTraceId();
      this.sessionTraceIds.set(sessionId, traceId);
    }
    return traceId;
  }

  /**
   * Convert an AgentOps event to an OTel span
   */
  eventToSpan(event: AgentEvent): OTelSpan {
    const traceId = this.getTraceIdForSession(event.sessionId);
    const spanId = generateSpanId();
    const parentSpanId = event.parentEventId
      ? this.eventSpanIds.get(event.parentEventId)
      : undefined;

    // Store this span ID for future child events
    this.eventSpanIds.set(event.eventId, spanId);

    const attributes: SpanAttributes = {};
    let spanName: string = event.type;
    let kind: OTelSpanKind = "INTERNAL";
    let status: OTelSpanStatus = "OK";
    let statusMessage: string | undefined;
    let endTimeMs = event.timestamp;

    // Add session context if configured
    if (this.config.includeSessionContext) {
      attributes[GEN_AI_ATTRIBUTES.AGENTOPS_SESSION_ID] = event.sessionId;
      attributes[GEN_AI_ATTRIBUTES.AGENTOPS_EVENT_TYPE] = event.type;

      if ("userId" in event && event.userId) {
        attributes[GEN_AI_ATTRIBUTES.AGENTOPS_USER_ID] = event.userId;
      }
      if ("featureId" in event && event.featureId) {
        attributes[GEN_AI_ATTRIBUTES.AGENTOPS_FEATURE_ID] = event.featureId;
      }
    }

    // Add tags and metadata
    if (event.tags && event.tags.length > 0) {
      attributes["agentops.tags"] = event.tags;
    }
    if (event.metadata) {
      for (const [key, value] of Object.entries(event.metadata)) {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          attributes[`agentops.metadata.${key}`] = value;
        }
      }
    }

    // Handle specific event types
    switch (event.type) {
      case "session_start":
        spanName = "session.start";
        kind = "SERVER";
        break;

      case "session_end":
        spanName = "session.end";
        kind = "SERVER";
        if (event.status === "error") {
          status = "ERROR";
          statusMessage = event.errorMessage;
        }
        break;

      case "prompt":
        spanName = "gen_ai.prompt";
        kind = "CLIENT";
        attributes[GEN_AI_ATTRIBUTES.OPERATION_NAME] = "chat";

        if (event.model) {
          attributes[GEN_AI_ATTRIBUTES.REQUEST_MODEL] = event.model;
          attributes[GEN_AI_ATTRIBUTES.SYSTEM] = detectGenAISystem(event.model);
        }
        if (event.role) {
          attributes["gen_ai.prompt.role"] = event.role;
        }
        if (this.config.includeContentAttributes && event.content) {
          attributes[GEN_AI_ATTRIBUTES.PROMPT] =
            typeof event.content === "string"
              ? event.content
              : JSON.stringify(event.content);
        }
        break;

      case "response":
        spanName = `gen_ai.${event.model || "llm"}.chat`;
        kind = "CLIENT";
        attributes[GEN_AI_ATTRIBUTES.OPERATION_NAME] = "chat";

        if (event.model) {
          attributes[GEN_AI_ATTRIBUTES.RESPONSE_MODEL] = event.model;
          attributes[GEN_AI_ATTRIBUTES.SYSTEM] = detectGenAISystem(event.model);
        }
        if (event.tokens) {
          attributes[GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS] =
            event.tokens.promptTokens;
          attributes[GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS] =
            event.tokens.completionTokens;
          attributes[GEN_AI_ATTRIBUTES.USAGE_TOTAL_TOKENS] =
            event.tokens.totalTokens;

          // Calculate and add cost if configured
          if (this.config.includeCostAttributes && event.model) {
            const cost = calculateCost(
              event.model,
              event.tokens.promptTokens,
              event.tokens.completionTokens,
            );
            if (cost > 0) {
              attributes[GEN_AI_ATTRIBUTES.COST_TOTAL] = cost;
              attributes[GEN_AI_ATTRIBUTES.COST_CURRENCY] = "USD";
            }
          }
        }
        if (event.finishReason) {
          attributes[GEN_AI_ATTRIBUTES.RESPONSE_FINISH_REASONS] = [
            event.finishReason,
          ];
        }
        if (event.durationMs) {
          endTimeMs = event.timestamp + event.durationMs;
        }
        if (this.config.includeContentAttributes && event.content) {
          attributes[GEN_AI_ATTRIBUTES.COMPLETION] =
            typeof event.content === "string"
              ? event.content
              : JSON.stringify(event.content);
        }
        break;

      case "tool_call":
        spanName = `gen_ai.tool.${event.toolName}`;
        kind = "CLIENT";
        attributes[GEN_AI_ATTRIBUTES.OPERATION_NAME] = "tool_call";
        attributes[GEN_AI_ATTRIBUTES.TOOL_NAME] = event.toolName;

        if (event.mcpServer) {
          attributes["gen_ai.tool.server"] = event.mcpServer;
        }
        if (
          this.config.includeContentAttributes &&
          event.toolInput !== undefined
        ) {
          attributes[GEN_AI_ATTRIBUTES.TOOL_ARGUMENTS] =
            typeof event.toolInput === "string"
              ? event.toolInput
              : JSON.stringify(event.toolInput);
        }
        break;

      case "tool_result":
        spanName = `gen_ai.tool.${event.toolName}.result`;
        kind = "CLIENT";
        attributes[GEN_AI_ATTRIBUTES.OPERATION_NAME] = "tool_result";
        attributes[GEN_AI_ATTRIBUTES.TOOL_NAME] = event.toolName;

        if (event.status === "error") {
          status = "ERROR";
          statusMessage = event.errorMessage;
        }
        if (event.durationMs) {
          endTimeMs = event.timestamp + event.durationMs;
        }
        if (
          this.config.includeContentAttributes &&
          event.toolOutput !== undefined
        ) {
          attributes[GEN_AI_ATTRIBUTES.TOOL_RESULT] =
            typeof event.toolOutput === "string"
              ? event.toolOutput
              : JSON.stringify(event.toolOutput);
        }
        break;

      case "error":
        spanName = `error.${event.errorType}`;
        kind = "INTERNAL";
        status = "ERROR";
        statusMessage = event.errorMessage;

        attributes["exception.type"] = event.errorType;
        attributes["exception.message"] = event.errorMessage;
        if (event.stackTrace) {
          attributes["exception.stacktrace"] = event.stackTrace;
        }
        if (event.durationMs) {
          endTimeMs = event.timestamp + event.durationMs;
        }
        break;

      case "custom":
        spanName = `custom.${event.name}`;
        kind = "INTERNAL";
        if (event.data && typeof event.data === "object") {
          for (const [key, value] of Object.entries(
            event.data as Record<string, unknown>,
          )) {
            if (
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean"
            ) {
              attributes[`custom.${key}`] = value;
            }
          }
        }
        break;
    }

    return {
      traceId,
      spanId,
      parentSpanId,
      name: spanName,
      kind,
      startTimeUnixNano: event.timestamp * 1_000_000,
      endTimeUnixNano: endTimeMs * 1_000_000,
      attributes,
      status: {
        code: status,
        message: statusMessage,
      },
    };
  }

  /**
   * Add an event to the export queue
   */
  addEvent(event: AgentEvent): void {
    if (!this.config.enabled) return;

    const span = this.eventToSpan(event);
    this.pendingSpans.push(span);

    if (this.config.debug) {
      console.log("[OTelExporter] Added span:", span.name);
    }

    // Flush if we've reached the batch size
    if (this.pendingSpans.length >= this.config.maxBatchSize) {
      void this.flush();
    }
  }

  /**
   * Add multiple events to the export queue
   */
  addEvents(events: AgentEvent[]): void {
    for (const event of events) {
      this.addEvent(event);
    }
  }

  /**
   * Flush pending spans to the OTLP endpoint
   */
  async flush(): Promise<OTelExportResult> {
    if (this.pendingSpans.length === 0) {
      return {
        success: true,
        spanCount: 0,
        durationMs: 0,
      };
    }

    const spansToExport = [...this.pendingSpans];
    this.pendingSpans.length = 0;

    const startTime = Date.now();

    try {
      const request = this.buildExportRequest(spansToExport);
      const response = await this.sendRequest(request);

      const durationMs = Date.now() - startTime;
      const rejectedCount = response.partialSuccess?.rejectedSpans ?? 0;
      const exportedCount = spansToExport.length - rejectedCount;

      this.stats.totalSpansExported += exportedCount;
      this.stats.totalSpansRejected += rejectedCount;
      this.stats.totalExports++;
      this.stats.lastExportTimestamp = Date.now();
      this.updateAverageDuration(durationMs);

      if (this.config.debug) {
        console.log("[OTelExporter] Export complete:", {
          exported: exportedCount,
          rejected: rejectedCount,
          durationMs,
        });
      }

      return {
        success: true,
        spanCount: exportedCount,
        rejectedSpanCount: rejectedCount > 0 ? rejectedCount : undefined,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this.stats.failedExports++;
      this.stats.lastError =
        error instanceof Error ? error.message : String(error);

      if (this.config.debug) {
        console.error("[OTelExporter] Export failed:", error);
      }

      // Re-add spans to queue for retry (up to max batch size)
      const requeue = spansToExport.slice(
        0,
        this.config.maxBatchSize - this.pendingSpans.length,
      );
      this.pendingSpans.unshift(...requeue);

      return {
        success: false,
        spanCount: 0,
        error: error instanceof Error ? error : new Error(String(error)),
        durationMs,
      };
    }
  }

  /**
   * Build the OTLP export request
   */
  private buildExportRequest(spans: OTelSpan[]): OTLPExportTraceRequest {
    const otlpSpans: OTLPSpan[] = spans.map((span) => ({
      traceId: hexToBase64(span.traceId),
      spanId: hexToBase64(span.spanId),
      parentSpanId: span.parentSpanId
        ? hexToBase64(span.parentSpanId)
        : undefined,
      traceState: span.traceState,
      name: span.name,
      kind: SPAN_KIND_MAP[span.kind],
      startTimeUnixNano: nanoToString(span.startTimeUnixNano),
      endTimeUnixNano: nanoToString(span.endTimeUnixNano),
      attributes: attributesToOTLP(span.attributes),
      droppedAttributesCount: span.droppedAttributesCount,
      events: span.events?.map((e) => ({
        timeUnixNano: nanoToString(e.timeUnixNano),
        name: e.name,
        attributes: e.attributes ? attributesToOTLP(e.attributes) : undefined,
        droppedAttributesCount: e.droppedAttributesCount,
      })),
      droppedEventsCount: span.droppedEventsCount,
      links: span.links?.map((l) => ({
        traceId: hexToBase64(l.traceId),
        spanId: hexToBase64(l.spanId),
        traceState: l.traceState,
        attributes: l.attributes ? attributesToOTLP(l.attributes) : undefined,
        droppedAttributesCount: l.droppedAttributesCount,
      })),
      droppedLinksCount: span.droppedLinksCount,
      status: {
        code: STATUS_CODE_MAP[span.status.code],
        message: span.status.message,
      },
    }));

    // Build resource attributes
    const resourceAttributes: SpanAttributes = {
      "service.name": this.config.serviceName,
      "service.version": this.config.serviceVersion,
      "telemetry.sdk.name": SDK_NAME,
      "telemetry.sdk.language": "javascript",
      "telemetry.sdk.version": SDK_VERSION,
      ...this.config.resourceAttributes,
    };

    const resourceSpans: OTLPResourceSpans = {
      resource: {
        attributes: attributesToOTLP(resourceAttributes),
      },
      scopeSpans: [
        {
          scope: {
            name: SDK_NAME,
            version: SDK_VERSION,
          },
          spans: otlpSpans,
        },
      ],
    };

    return {
      resourceSpans: [resourceSpans],
    };
  }

  /**
   * Send the export request to the OTLP endpoint
   */
  private async sendRequest(
    request: OTLPExportTraceRequest,
  ): Promise<{ partialSuccess?: { rejectedSpans?: number } }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...this.config.headers,
      };

      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `OTLP export failed: HTTP ${response.status} - ${body}`,
        );
      }

      // OTLP returns empty body on success, or partial success info
      const text = await response.text();
      if (text) {
        try {
          return JSON.parse(text);
        } catch {
          // Ignore parse errors for empty responses
        }
      }

      return {};
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Start the periodic export timer
   */
  private startExportTimer(): void {
    if (this.exportTimer) return;

    this.exportTimer = setInterval(() => {
      void this.flush();
    }, this.config.exportInterval);

    // Ensure timer doesn't prevent process exit
    if (typeof this.exportTimer === "object" && "unref" in this.exportTimer) {
      this.exportTimer.unref();
    }
  }

  /**
   * Stop the periodic export timer
   */
  private stopExportTimer(): void {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = null;
    }
  }

  /**
   * Update the rolling average export duration
   */
  private updateAverageDuration(durationMs: number): void {
    const count = this.stats.totalExports;
    this.stats.averageExportDurationMs =
      (this.stats.averageExportDurationMs * (count - 1) + durationMs) / count;
  }

  /**
   * Clean up session tracking data
   */
  cleanupSession(sessionId: string): void {
    this.sessionTraceIds.delete(sessionId);
    // Note: We don't clean up eventSpanIds aggressively as events might still reference them
  }

  /**
   * Shutdown the exporter
   */
  async shutdown(): Promise<void> {
    this.stopExportTimer();
    await this.flush();
    this.sessionTraceIds.clear();
    this.eventSpanIds.clear();

    if (this.config.debug) {
      console.log("[OTelExporter] Shutdown complete", this.getStats());
    }
  }
}
