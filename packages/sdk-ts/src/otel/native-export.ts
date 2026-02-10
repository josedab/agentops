/**
 * OTel Native Export
 *
 * Enhanced exporter that wraps OTelExporter with one-line backend setup,
 * retry with exponential backoff, health checks, Grafana dashboard
 * generation, and detailed export metrics tracking.
 *
 * @packageDocumentation
 */

import type { AgentEvent } from "../types.js";
import type {
  OTelExporterConfig,
  OTelExportResult,
  OTelExportStats,
} from "./types.js";
import { OTelExporter } from "./exporter.js";

// ============================================================================
// Types
// ============================================================================

/** Supported observability backends */
export type BackendName =
  | "datadog"
  | "grafana"
  | "jaeger"
  | "honeycomb"
  | "newrelic"
  | "splunk";

/** Options passed to `configureForBackend` */
export interface BackendOptions {
  /** API key / token for the backend */
  apiKey?: string;
  /** Custom endpoint override */
  endpoint?: string;
  /** Region (used by New Relic, Datadog, Splunk) */
  region?: string;
  /** Honeycomb dataset */
  dataset?: string;
  /** Grafana Cloud instance ID (used as basic-auth username) */
  instanceId?: string;
  /** Service name override */
  serviceName?: string;
}

/** Policy for `exportWithRetry` */
export interface RetryPolicy {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before the first retry (default: 1000) */
  initialDelayMs?: number;
  /** Multiplier applied to the delay after each retry (default: 2) */
  backoffMultiplier?: number;
  /** Maximum delay cap in ms (default: 30000) */
  maxDelayMs?: number;
}

/** Resolved retry policy with defaults applied */
interface ResolvedRetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

/** Health-check result returned by `checkConnection` */
export interface HealthCheckResult {
  /** Whether the endpoint responded successfully */
  reachable: boolean;
  /** HTTP status code (if available) */
  statusCode?: number;
  /** Round-trip latency in ms */
  latencyMs: number;
  /** Error message on failure */
  error?: string;
}

/** Detailed export-health metrics returned by `getExportMetrics` */
export interface ExportMetrics {
  /** Total events submitted for export */
  totalEventsSubmitted: number;
  /** Successful export attempts */
  successfulExports: number;
  /** Failed export attempts */
  failedExports: number;
  /** Total retries across all export calls */
  totalRetries: number;
  /** Success rate (0–1) */
  successRate: number;
  /** Average export latency in ms */
  averageLatencyMs: number;
  /** Last export timestamp (epoch ms) */
  lastExportTimestamp?: number;
  /** Last error message */
  lastError?: string;
  /** Underlying OTelExporter stats */
  exporterStats: OTelExportStats;
}

// ============================================================================
// Backend presets
// ============================================================================

interface BackendPreset {
  endpoint: string;
  headers: Record<string, string>;
  compression?: "gzip" | "none";
}

function getBackendPreset(
  backend: BackendName,
  options: BackendOptions,
): BackendPreset {
  switch (backend) {
    case "datadog": {
      const site = options.region ?? "datadoghq.com";
      return {
        endpoint:
          options.endpoint ?? `https://trace.agent.${site}/api/v0.2/traces`,
        headers: {
          "DD-API-KEY": options.apiKey ?? "",
          "Content-Type": "application/json",
        },
      };
    }
    case "grafana": {
      const base = (
        options.endpoint ?? "https://tempo-us-central1.grafana.net"
      ).replace(/\/+$/, "");
      const headers: Record<string, string> = {};
      if (options.instanceId && options.apiKey) {
        headers["Authorization"] =
          `Basic ${btoa(`${options.instanceId}:${options.apiKey}`)}`;
      } else if (options.apiKey) {
        headers["Authorization"] = `Bearer ${options.apiKey}`;
      }
      return {
        endpoint: `${base}/v1/traces`,
        headers,
      };
    }
    case "jaeger": {
      const base = (options.endpoint ?? "http://localhost:4318").replace(
        /\/+$/,
        "",
      );
      const headers: Record<string, string> = {};
      if (options.apiKey) {
        headers["Authorization"] = `Bearer ${options.apiKey}`;
      }
      return {
        endpoint: `${base}/v1/traces`,
        headers,
      };
    }
    case "honeycomb": {
      const base = (options.endpoint ?? "https://api.honeycomb.io").replace(
        /\/+$/,
        "",
      );
      const headers: Record<string, string> = {
        "x-honeycomb-team": options.apiKey ?? "",
      };
      if (options.dataset) {
        headers["x-honeycomb-dataset"] = options.dataset;
      }
      return {
        endpoint: `${base}/v1/traces`,
        headers,
      };
    }
    case "newrelic": {
      const region = options.region ?? "us";
      const base =
        options.endpoint ??
        (region === "eu"
          ? "https://otlp.eu01.nr-data.net"
          : "https://otlp.nr-data.net");
      return {
        endpoint: `${base}/v1/traces`,
        headers: { "api-key": options.apiKey ?? "" },
        compression: "gzip",
      };
    }
    case "splunk": {
      const base = (options.endpoint ?? "https://ingest.signalfx.com").replace(
        /\/+$/,
        "",
      );
      return {
        endpoint: `${base}/v2/trace/otlp`,
        headers: { "X-SF-Token": options.apiKey ?? "" },
      };
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function resolveRetryPolicy(policy?: RetryPolicy): ResolvedRetryPolicy {
  return {
    maxRetries: policy?.maxRetries ?? 3,
    initialDelayMs: policy?.initialDelayMs ?? 1000,
    backoffMultiplier: policy?.backoffMultiplier ?? 2,
    maxDelayMs: policy?.maxDelayMs ?? 30_000,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// OTelNativeExporter
// ============================================================================

/**
 * Enhanced OTel exporter with one-line backend configuration,
 * retry with exponential backoff, health checks, Grafana dashboard
 * generation, and export metrics tracking.
 */
export class OTelNativeExporter {
  private exporter: OTelExporter;
  private config: OTelExporterConfig;

  // Metrics tracking
  private totalEventsSubmitted = 0;
  private successfulExports = 0;
  private failedExportCount = 0;
  private totalRetries = 0;
  private exportLatencies: number[] = [];
  private lastExportTs?: number;
  private lastErrorMsg?: string;

  constructor(config: OTelExporterConfig) {
    this.config = { ...config };
    this.exporter = new OTelExporter(this.config);
  }

  /**
   * One-line setup for a popular observability backend.
   * Replaces the internal exporter with one configured for the given backend.
   */
  configureForBackend(
    backend: BackendName,
    options: BackendOptions = {},
  ): void {
    const preset = getBackendPreset(backend, options);
    this.config = {
      ...this.config,
      endpoint: preset.endpoint,
      headers: { ...this.config.headers, ...preset.headers },
      ...(preset.compression ? { compression: preset.compression } : {}),
      ...(options.serviceName ? { serviceName: options.serviceName } : {}),
    };
    this.exporter = new OTelExporter(this.config);
  }

  /**
   * Export events with configurable exponential-backoff retry.
   */
  async exportWithRetry(
    events: AgentEvent[],
    retryPolicy?: RetryPolicy,
  ): Promise<OTelExportResult> {
    const policy = resolveRetryPolicy(retryPolicy);
    this.totalEventsSubmitted += events.length;

    let lastResult: OTelExportResult | undefined;
    let delay = policy.initialDelayMs;

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      if (attempt > 0) {
        this.totalRetries++;
        await sleep(delay);
        delay = Math.min(delay * policy.backoffMultiplier, policy.maxDelayMs);
      }

      // Create a fresh exporter for each attempt so the queue is clean
      const attemptExporter = new OTelExporter({
        ...this.config,
        exportInterval: 0,
      });
      attemptExporter.addEvents(events);

      const start = Date.now();
      lastResult = await attemptExporter.flush();
      const latency = Date.now() - start;

      this.exportLatencies.push(latency);
      this.lastExportTs = Date.now();

      if (lastResult.success) {
        this.successfulExports++;
        return lastResult;
      }

      this.lastErrorMsg = lastResult.error?.message;
    }

    this.failedExportCount++;
    return lastResult!;
  }

  /**
   * Verify that the configured OTLP endpoint is reachable.
   */
  async checkConnection(): Promise<HealthCheckResult> {
    const endpoint = this.config.endpoint ?? "http://localhost:4318/v1/traces";
    const start = Date.now();

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        body: JSON.stringify({ resourceSpans: [] }),
      });

      return {
        reachable: response.ok,
        statusCode: response.status,
        latencyMs: Date.now() - start,
        ...(!response.ok ? { error: `HTTP ${response.status}` } : {}),
      };
    } catch (err) {
      return {
        reachable: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Returns detailed export-health metrics.
   */
  getExportMetrics(): ExportMetrics {
    const totalAttempts = this.successfulExports + this.failedExportCount;
    const avgLatency =
      this.exportLatencies.length > 0
        ? this.exportLatencies.reduce((a, b) => a + b, 0) /
          this.exportLatencies.length
        : 0;

    return {
      totalEventsSubmitted: this.totalEventsSubmitted,
      successfulExports: this.successfulExports,
      failedExports: this.failedExportCount,
      totalRetries: this.totalRetries,
      successRate:
        totalAttempts > 0 ? this.successfulExports / totalAttempts : 0,
      averageLatencyMs: avgLatency,
      lastExportTimestamp: this.lastExportTs,
      lastError: this.lastErrorMsg,
      exporterStats: this.exporter.getStats(),
    };
  }

  /**
   * Generate a Grafana dashboard JSON template for AgentOps metrics.
   * Panels: sessions over time, cost by model, error rates,
   * token usage, latency distribution.
   */
  createGrafanaDashboard(): Record<string, unknown> {
    const panels = [
      {
        id: 1,
        title: "Sessions Over Time",
        type: "timeseries",
        datasource: "Tempo",
        targets: [
          {
            refId: "A",
            expr: 'count_over_time({service_name="agentops-sdk"} | json | name="session.start" [1h])',
          },
        ],
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
      },
      {
        id: 2,
        title: "Cost by Model",
        type: "barchart",
        datasource: "Tempo",
        targets: [
          {
            refId: "A",
            expr: 'sum by (gen_ai_request_model) (rate({service_name="agentops-sdk"} | json | unwrap gen_ai_cost_total [1h]))',
          },
        ],
        gridPos: { x: 12, y: 0, w: 12, h: 8 },
      },
      {
        id: 3,
        title: "Error Rates",
        type: "timeseries",
        datasource: "Tempo",
        targets: [
          {
            refId: "A",
            expr: 'sum(rate({service_name="agentops-sdk"} | json | status_code="2" [5m]))',
          },
        ],
        gridPos: { x: 0, y: 8, w: 12, h: 8 },
      },
      {
        id: 4,
        title: "Token Usage",
        type: "timeseries",
        datasource: "Tempo",
        targets: [
          {
            refId: "A",
            expr: 'sum(rate({service_name="agentops-sdk"} | json | unwrap gen_ai_usage_total_tokens [5m]))',
          },
        ],
        gridPos: { x: 12, y: 8, w: 12, h: 8 },
      },
      {
        id: 5,
        title: "Latency Distribution",
        type: "histogram",
        datasource: "Tempo",
        targets: [
          {
            refId: "A",
            expr: 'duration | service_name="agentops-sdk"',
          },
        ],
        gridPos: { x: 0, y: 16, w: 24, h: 8 },
      },
    ];

    return {
      title: "AgentOps Observability",
      uid: "agentops-otel-dashboard",
      schemaVersion: 39,
      version: 1,
      timezone: "browser",
      editable: true,
      time: { from: "now-6h", to: "now" },
      refresh: "30s",
      panels,
    };
  }

  /** Proxy: get underlying exporter stats. */
  getStats(): OTelExportStats {
    return this.exporter.getStats();
  }

  /** Proxy: shut down the underlying exporter. */
  async shutdown(): Promise<void> {
    await this.exporter.shutdown();
  }
}
