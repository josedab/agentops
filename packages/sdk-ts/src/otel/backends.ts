/**
 * Backend Adapter Presets & Resource Auto-Detection
 *
 * Provides pre-configured settings for popular observability backends,
 * automatic runtime resource detection, and a lightweight metrics collector
 * for SDK-level telemetry.
 *
 * @packageDocumentation
 */

import type { OTelExporterConfig, SpanAttributes } from "./types.js";

// ============================================================================
// Backend Adapter Types
// ============================================================================

/**
 * Configuration returned by a backend adapter.
 * This is a partial OTelExporterConfig that can be spread into the exporter config.
 */
export type BackendAdapterConfig = Partial<OTelExporterConfig>;

/**
 * Common interface for all backend adapters
 */
export interface BackendAdapter {
  /** Human-readable name of the backend */
  readonly name: string;

  /**
   * Generate exporter configuration for this backend.
   * The returned partial can be spread into an OTelExporterConfig.
   */
  getConfig(): BackendAdapterConfig;
}

// ============================================================================
// Backend Adapter Presets
// ============================================================================

/**
 * Datadog adapter options
 */
export interface DatadogAdapterOptions {
  /** Datadog API key */
  apiKey: string;

  /** Datadog site (e.g., "datadoghq.com", "datadoghq.eu", "us5.datadoghq.com") */
  site?: string;

  /** Service name override */
  serviceName?: string;

  /** Service version override */
  serviceVersion?: string;

  /** Additional resource tags (key:value format for Datadog) */
  tags?: Record<string, string>;
}

/**
 * Pre-configured adapter for Datadog OTLP ingestion.
 *
 * @example
 * ```typescript
 * const adapter = new DatadogAdapter({ apiKey: process.env.DD_API_KEY! });
 * const exporter = new OTelExporter({
 *   enabled: true,
 *   ...adapter.getConfig(),
 * });
 * ```
 */
export class DatadogAdapter implements BackendAdapter {
  readonly name = "Datadog";
  private readonly options: DatadogAdapterOptions;

  constructor(options: DatadogAdapterOptions) {
    this.options = options;
  }

  getConfig(): BackendAdapterConfig {
    const site = this.options.site ?? "datadoghq.com";
    const resourceAttributes: SpanAttributes = {};

    if (this.options.tags) {
      for (const [key, value] of Object.entries(this.options.tags)) {
        resourceAttributes[`dd.tag.${key}`] = value;
      }
    }

    return {
      endpoint: `https://trace.agent.${site}/api/v0.2/traces`,
      protocol: "http/json",
      headers: {
        "DD-API-KEY": this.options.apiKey,
        "Content-Type": "application/json",
      },
      serviceName: this.options.serviceName,
      serviceVersion: this.options.serviceVersion,
      resourceAttributes,
    };
  }
}

/**
 * Grafana Tempo adapter options
 */
export interface GrafanaTempoAdapterOptions {
  /** Grafana Cloud or self-hosted Tempo endpoint */
  endpoint: string;

  /** Basic auth username (Grafana Cloud instance ID) */
  username?: string;

  /** Basic auth password / API token */
  token?: string;

  /** Service name override */
  serviceName?: string;

  /** Service version override */
  serviceVersion?: string;
}

/**
 * Pre-configured adapter for Grafana Tempo.
 *
 * @example
 * ```typescript
 * const adapter = new GrafanaTempoAdapter({
 *   endpoint: "https://tempo-us-central1.grafana.net",
 *   username: process.env.GRAFANA_INSTANCE_ID!,
 *   token: process.env.GRAFANA_API_TOKEN!,
 * });
 * const exporter = new OTelExporter({
 *   enabled: true,
 *   ...adapter.getConfig(),
 * });
 * ```
 */
export class GrafanaTempoAdapter implements BackendAdapter {
  readonly name = "Grafana Tempo";
  private readonly options: GrafanaTempoAdapterOptions;

  constructor(options: GrafanaTempoAdapterOptions) {
    this.options = options;
  }

  getConfig(): BackendAdapterConfig {
    const endpoint = this.options.endpoint.replace(/\/+$/, "");
    const headers: Record<string, string> = {};

    if (this.options.username && this.options.token) {
      const credentials = btoa(
        `${this.options.username}:${this.options.token}`,
      );
      headers["Authorization"] = `Basic ${credentials}`;
    } else if (this.options.token) {
      headers["Authorization"] = `Bearer ${this.options.token}`;
    }

    return {
      endpoint: `${endpoint}/v1/traces`,
      protocol: "http/json",
      headers,
      serviceName: this.options.serviceName,
      serviceVersion: this.options.serviceVersion,
    };
  }
}

/**
 * Jaeger adapter options
 */
export interface JaegerAdapterOptions {
  /** Jaeger OTLP endpoint (default: http://localhost:4318) */
  endpoint?: string;

  /** Optional bearer token for authentication */
  token?: string;

  /** Service name override */
  serviceName?: string;

  /** Service version override */
  serviceVersion?: string;
}

/**
 * Pre-configured adapter for Jaeger OTLP endpoint.
 *
 * @example
 * ```typescript
 * const adapter = new JaegerAdapter({
 *   endpoint: "http://jaeger-collector:4318",
 * });
 * const exporter = new OTelExporter({
 *   enabled: true,
 *   ...adapter.getConfig(),
 * });
 * ```
 */
export class JaegerAdapter implements BackendAdapter {
  readonly name = "Jaeger";
  private readonly options: JaegerAdapterOptions;

  constructor(options: JaegerAdapterOptions = {}) {
    this.options = options;
  }

  getConfig(): BackendAdapterConfig {
    const endpoint = (this.options.endpoint ?? "http://localhost:4318").replace(
      /\/+$/,
      "",
    );
    const headers: Record<string, string> = {};

    if (this.options.token) {
      headers["Authorization"] = `Bearer ${this.options.token}`;
    }

    return {
      endpoint: `${endpoint}/v1/traces`,
      protocol: "http/json",
      headers,
      serviceName: this.options.serviceName,
      serviceVersion: this.options.serviceVersion,
    };
  }
}

/**
 * Honeycomb adapter options
 */
export interface HoneycombAdapterOptions {
  /** Honeycomb API key */
  apiKey: string;

  /** Honeycomb dataset name (classic keys only; ignored for environment-aware keys) */
  dataset?: string;

  /** Honeycomb API endpoint (default: https://api.honeycomb.io) */
  endpoint?: string;

  /** Service name override */
  serviceName?: string;

  /** Service version override */
  serviceVersion?: string;
}

/**
 * Pre-configured adapter for Honeycomb.
 *
 * @example
 * ```typescript
 * const adapter = new HoneycombAdapter({
 *   apiKey: process.env.HONEYCOMB_API_KEY!,
 *   dataset: "agentops-traces",
 * });
 * const exporter = new OTelExporter({
 *   enabled: true,
 *   ...adapter.getConfig(),
 * });
 * ```
 */
export class HoneycombAdapter implements BackendAdapter {
  readonly name = "Honeycomb";
  private readonly options: HoneycombAdapterOptions;

  constructor(options: HoneycombAdapterOptions) {
    this.options = options;
  }

  getConfig(): BackendAdapterConfig {
    const endpoint = (
      this.options.endpoint ?? "https://api.honeycomb.io"
    ).replace(/\/+$/, "");
    const headers: Record<string, string> = {
      "x-honeycomb-team": this.options.apiKey,
    };

    if (this.options.dataset) {
      headers["x-honeycomb-dataset"] = this.options.dataset;
    }

    return {
      endpoint: `${endpoint}/v1/traces`,
      protocol: "http/json",
      headers,
      serviceName: this.options.serviceName,
      serviceVersion: this.options.serviceVersion,
    };
  }
}

/**
 * New Relic adapter options
 */
export interface NewRelicAdapterOptions {
  /** New Relic Ingest API key (INGEST - LICENSE type) */
  apiKey: string;

  /** New Relic region: "us" or "eu" (default: "us") */
  region?: "us" | "eu";

  /** Service name override */
  serviceName?: string;

  /** Service version override */
  serviceVersion?: string;
}

/**
 * New Relic OTLP endpoint map by region
 */
const NEW_RELIC_ENDPOINTS = {
  us: "https://otlp.nr-data.net",
  eu: "https://otlp.eu01.nr-data.net",
} as const;

/**
 * Pre-configured adapter for New Relic OTLP ingestion.
 *
 * @example
 * ```typescript
 * const adapter = new NewRelicAdapter({
 *   apiKey: process.env.NEW_RELIC_API_KEY!,
 *   region: "us",
 * });
 * const exporter = new OTelExporter({
 *   enabled: true,
 *   ...adapter.getConfig(),
 * });
 * ```
 */
export class NewRelicAdapter implements BackendAdapter {
  readonly name = "New Relic";
  private readonly options: NewRelicAdapterOptions;

  constructor(options: NewRelicAdapterOptions) {
    this.options = options;
  }

  getConfig(): BackendAdapterConfig {
    const region = this.options.region ?? "us";
    const endpoint = NEW_RELIC_ENDPOINTS[region];

    return {
      endpoint: `${endpoint}/v1/traces`,
      protocol: "http/json",
      headers: {
        "api-key": this.options.apiKey,
      },
      compression: "gzip",
      serviceName: this.options.serviceName,
      serviceVersion: this.options.serviceVersion,
    };
  }
}

// ============================================================================
// Resource Auto-Detection
// ============================================================================

/**
 * OTel resource semantic convention attribute keys used by auto-detection
 */
const RESOURCE_ATTRIBUTES = {
  // Service
  SERVICE_NAME: "service.name",
  SERVICE_VERSION: "service.version",
  SERVICE_INSTANCE_ID: "service.instance.id",

  // Telemetry SDK
  TELEMETRY_SDK_NAME: "telemetry.sdk.name",
  TELEMETRY_SDK_LANGUAGE: "telemetry.sdk.language",
  TELEMETRY_SDK_VERSION: "telemetry.sdk.version",

  // Process
  PROCESS_PID: "process.pid",
  PROCESS_RUNTIME_NAME: "process.runtime.name",
  PROCESS_RUNTIME_VERSION: "process.runtime.version",
  PROCESS_RUNTIME_DESCRIPTION: "process.runtime.description",
  PROCESS_COMMAND: "process.command",
  PROCESS_COMMAND_ARGS: "process.command_args",

  // Host / OS
  HOST_NAME: "host.name",
  HOST_ARCH: "host.arch",
  OS_TYPE: "os.type",
  OS_VERSION: "os.version",

  // Cloud
  CLOUD_PROVIDER: "cloud.provider",
  CLOUD_REGION: "cloud.region",
  CLOUD_AVAILABILITY_ZONE: "cloud.availability_zone",
  CLOUD_ACCOUNT_ID: "cloud.account.id",

  // Container
  CONTAINER_ID: "container.id",
  CONTAINER_NAME: "container.name",
  CONTAINER_IMAGE_NAME: "container.image.name",
  CONTAINER_IMAGE_TAG: "container.image.tag",

  // Kubernetes
  K8S_NAMESPACE: "k8s.namespace.name",
  K8S_POD_NAME: "k8s.pod.name",
  K8S_DEPLOYMENT_NAME: "k8s.deployment.name",
} as const;

/**
 * Safely read an environment variable.
 * Returns undefined when running in a browser or when the variable is not set.
 */
function getEnv(name: string): string | undefined {
  try {
    if (typeof process !== "undefined" && process.env) {
      return process.env[name];
    }
  } catch {
    // Swallow - may throw in restricted environments
  }
  return undefined;
}

/**
 * Detect the cloud provider from well-known environment variables.
 */
function detectCloudProvider(): {
  provider?: string;
  region?: string;
  zone?: string;
  accountId?: string;
} {
  // AWS
  const awsRegion = getEnv("AWS_REGION") ?? getEnv("AWS_DEFAULT_REGION");
  if (awsRegion) {
    return {
      provider: "aws",
      region: awsRegion,
      zone: getEnv("AWS_AVAILABILITY_ZONE"),
      accountId: getEnv("AWS_ACCOUNT_ID"),
    };
  }

  // GCP
  const gcpProject =
    getEnv("GCLOUD_PROJECT") ??
    getEnv("GCP_PROJECT") ??
    getEnv("GOOGLE_CLOUD_PROJECT");
  if (gcpProject) {
    return {
      provider: "gcp",
      region: getEnv("GOOGLE_CLOUD_REGION"),
      zone: getEnv("GOOGLE_CLOUD_ZONE"),
      accountId: gcpProject,
    };
  }

  // Azure
  const azureSubscription = getEnv("AZURE_SUBSCRIPTION_ID");
  if (azureSubscription) {
    return {
      provider: "azure",
      region: getEnv("AZURE_REGION"),
      accountId: azureSubscription,
    };
  }

  return {};
}

/**
 * Detect container information from environment variables.
 */
function detectContainerInfo(): {
  id?: string;
  name?: string;
  imageName?: string;
  imageTag?: string;
} {
  return {
    id: getEnv("CONTAINER_ID") ?? getEnv("HOSTNAME"),
    name: getEnv("CONTAINER_NAME"),
    imageName: getEnv("CONTAINER_IMAGE"),
    imageTag: getEnv("CONTAINER_IMAGE_TAG"),
  };
}

/**
 * Detect Kubernetes information from environment variables.
 */
function detectK8sInfo(): {
  namespace?: string;
  podName?: string;
  deploymentName?: string;
} {
  return {
    namespace: getEnv("K8S_NAMESPACE") ?? getEnv("KUBERNETES_NAMESPACE"),
    podName: getEnv("K8S_POD_NAME") ?? getEnv("HOSTNAME"),
    deploymentName: getEnv("K8S_DEPLOYMENT_NAME"),
  };
}

/**
 * Detect the service name from environment variables or package.json hints.
 * Priority: OTEL_SERVICE_NAME > npm_package_name > fallback
 */
function detectServiceName(): string {
  return (
    getEnv("OTEL_SERVICE_NAME") ?? getEnv("npm_package_name") ?? "agentops-sdk"
  );
}

/**
 * Detect the service version from environment variables.
 */
function detectServiceVersion(): string | undefined {
  return getEnv("OTEL_SERVICE_VERSION") ?? getEnv("npm_package_version");
}

/**
 * Auto-detect runtime environment and populate resource attributes
 * following OTel resource semantic conventions.
 *
 * Detects: Node.js version, OS info, process details, cloud provider
 * (from env vars), container info (from env vars), and service name
 * (from env vars / package.json).
 *
 * @returns SpanAttributes compatible with OTel resource semantic conventions
 *
 * @example
 * ```typescript
 * const resource = detectResource();
 * const exporter = new OTelExporter({
 *   enabled: true,
 *   resourceAttributes: resource,
 * });
 * ```
 */
export function detectResource(): SpanAttributes {
  const attributes: SpanAttributes = {};

  // Service info
  attributes[RESOURCE_ATTRIBUTES.SERVICE_NAME] = detectServiceName();
  const serviceVersion = detectServiceVersion();
  if (serviceVersion) {
    attributes[RESOURCE_ATTRIBUTES.SERVICE_VERSION] = serviceVersion;
  }

  // SDK info
  attributes[RESOURCE_ATTRIBUTES.TELEMETRY_SDK_NAME] = "@agentops/sdk";
  attributes[RESOURCE_ATTRIBUTES.TELEMETRY_SDK_LANGUAGE] = "javascript";
  attributes[RESOURCE_ATTRIBUTES.TELEMETRY_SDK_VERSION] = "0.1.0";

  // Process / runtime info (Node.js-specific)
  try {
    if (typeof process !== "undefined") {
      if (process.pid) {
        attributes[RESOURCE_ATTRIBUTES.PROCESS_PID] = process.pid;
      }
      if (process.version) {
        attributes[RESOURCE_ATTRIBUTES.PROCESS_RUNTIME_NAME] = "node";
        attributes[RESOURCE_ATTRIBUTES.PROCESS_RUNTIME_VERSION] =
          process.version;
        attributes[RESOURCE_ATTRIBUTES.PROCESS_RUNTIME_DESCRIPTION] =
          `Node.js ${process.version}`;
      }
      if (process.argv && process.argv.length > 0) {
        attributes[RESOURCE_ATTRIBUTES.PROCESS_COMMAND] = process.argv[0];
      }
    }
  } catch {
    // Swallow errors in restricted environments
  }

  // Host / OS info
  try {
    if (typeof process !== "undefined") {
      attributes[RESOURCE_ATTRIBUTES.HOST_ARCH] = process.arch;
      attributes[RESOURCE_ATTRIBUTES.OS_TYPE] = process.platform;

      const hostname = getEnv("HOSTNAME") ?? getEnv("COMPUTERNAME");
      if (hostname) {
        attributes[RESOURCE_ATTRIBUTES.HOST_NAME] = hostname;
      }
    }
  } catch {
    // Swallow errors in restricted environments
  }

  // Cloud provider detection
  const cloud = detectCloudProvider();
  if (cloud.provider) {
    attributes[RESOURCE_ATTRIBUTES.CLOUD_PROVIDER] = cloud.provider;
    if (cloud.region) {
      attributes[RESOURCE_ATTRIBUTES.CLOUD_REGION] = cloud.region;
    }
    if (cloud.zone) {
      attributes[RESOURCE_ATTRIBUTES.CLOUD_AVAILABILITY_ZONE] = cloud.zone;
    }
    if (cloud.accountId) {
      attributes[RESOURCE_ATTRIBUTES.CLOUD_ACCOUNT_ID] = cloud.accountId;
    }
  }

  // Container detection (only when container env vars are present)
  const container = detectContainerInfo();
  if (container.id) {
    attributes[RESOURCE_ATTRIBUTES.CONTAINER_ID] = container.id;
  }
  if (container.name) {
    attributes[RESOURCE_ATTRIBUTES.CONTAINER_NAME] = container.name;
  }
  if (container.imageName) {
    attributes[RESOURCE_ATTRIBUTES.CONTAINER_IMAGE_NAME] = container.imageName;
  }
  if (container.imageTag) {
    attributes[RESOURCE_ATTRIBUTES.CONTAINER_IMAGE_TAG] = container.imageTag;
  }

  // Kubernetes detection
  const k8sNamespace =
    getEnv("K8S_NAMESPACE") ?? getEnv("KUBERNETES_NAMESPACE");
  if (k8sNamespace) {
    const k8s = detectK8sInfo();
    attributes[RESOURCE_ATTRIBUTES.K8S_NAMESPACE] = k8s.namespace!;
    if (k8s.podName) {
      attributes[RESOURCE_ATTRIBUTES.K8S_POD_NAME] = k8s.podName;
    }
    if (k8s.deploymentName) {
      attributes[RESOURCE_ATTRIBUTES.K8S_DEPLOYMENT_NAME] = k8s.deploymentName;
    }
  }

  return attributes;
}

// ============================================================================
// Metrics Collector
// ============================================================================

/**
 * A single metric data point compatible with OTel metric semantics
 */
export interface MetricDataPoint {
  /** Metric name */
  name: string;

  /** Metric description */
  description: string;

  /** Metric unit */
  unit: string;

  /** Current value */
  value: number;

  /** Metric type */
  type: "counter" | "gauge" | "histogram";

  /** Timestamp of last update (ms since epoch) */
  timestamp: number;
}

/**
 * Latency histogram bucket
 */
export interface HistogramBucket {
  /** Upper bound of the bucket (inclusive), Infinity for the last bucket */
  le: number;

  /** Count of observations in this bucket */
  count: number;
}

/**
 * Structured metrics snapshot from the collector
 */
export interface MetricsSnapshot {
  /** Total events recorded across all types */
  totalEvents: number;

  /** Events broken down by type */
  eventsByType: Record<string, number>;

  /** Number of flush operations performed */
  flushCount: number;

  /** Number of errors recorded */
  errorCount: number;

  /** Error rate (errors / total events), 0 when no events */
  errorRate: number;

  /** Latency histogram with standard OTel-compatible bucket boundaries */
  latencyHistogram: {
    /** Histogram buckets */
    buckets: HistogramBucket[];

    /** Sum of all observed durations in ms */
    sum: number;

    /** Count of observations with a duration */
    count: number;

    /** Minimum observed duration in ms */
    min: number;

    /** Maximum observed duration in ms */
    max: number;
  };

  /** Timestamp of the snapshot (ms since epoch) */
  timestamp: number;

  /** All metrics as OTel-compatible data points */
  dataPoints: MetricDataPoint[];
}

/**
 * Default histogram bucket boundaries (in milliseconds).
 * Following OTel SDK default boundaries for HTTP-style latency.
 */
const DEFAULT_HISTOGRAM_BOUNDARIES = [
  5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000,
] as const;

/**
 * Lightweight metrics collector for SDK-level telemetry.
 *
 * Collects counters for events by type, flush operations, errors,
 * and a latency histogram for event processing durations.
 * Exposes metrics as OTel-compatible data points via `getMetrics()`.
 *
 * @example
 * ```typescript
 * const metrics = new OTelMetricsCollector();
 *
 * // Record events as they occur
 * metrics.recordEvent("response", 150);
 * metrics.recordEvent("tool_call", 45);
 * metrics.recordEvent("error");
 * metrics.recordFlush();
 *
 * // Retrieve current metrics
 * const snapshot = metrics.getMetrics();
 * console.log(snapshot.totalEvents); // 3
 * console.log(snapshot.errorRate);   // 0.333...
 * ```
 */
export class OTelMetricsCollector {
  private totalEvents: number = 0;
  private eventsByType: Record<string, number> = {};
  private flushCount: number = 0;
  private errorCount: number = 0;

  // Latency histogram state
  private readonly bucketBoundaries: readonly number[];
  private bucketCounts: number[];
  private latencySum: number = 0;
  private latencyCount: number = 0;
  private latencyMin: number = Infinity;
  private latencyMax: number = -Infinity;

  constructor(histogramBoundaries?: number[]) {
    this.bucketBoundaries = histogramBoundaries ?? DEFAULT_HISTOGRAM_BOUNDARIES;
    // +1 for the +Infinity bucket
    this.bucketCounts = new Array(this.bucketBoundaries.length + 1).fill(0);
  }

  /**
   * Record an event occurrence.
   *
   * @param type - The event type (e.g., "response", "tool_call", "error")
   * @param durationMs - Optional processing duration in milliseconds
   */
  recordEvent(type: string, durationMs?: number): void {
    this.totalEvents++;
    this.eventsByType[type] = (this.eventsByType[type] ?? 0) + 1;

    if (type === "error") {
      this.errorCount++;
    }

    if (durationMs !== undefined && durationMs >= 0) {
      this.recordLatency(durationMs);
    }
  }

  /**
   * Record a flush operation.
   */
  recordFlush(): void {
    this.flushCount++;
  }

  /**
   * Record an error occurrence (independent of event recording).
   */
  recordError(): void {
    this.errorCount++;
  }

  /**
   * Get a snapshot of all collected metrics.
   *
   * @returns A structured MetricsSnapshot with counters, histogram, and OTel data points
   */
  getMetrics(): MetricsSnapshot {
    const now = Date.now();
    const errorRate =
      this.totalEvents > 0 ? this.errorCount / this.totalEvents : 0;

    // Build histogram buckets
    const buckets: HistogramBucket[] = this.bucketBoundaries.map((le, i) => ({
      le,
      count: this.bucketCounts[i],
    }));
    // Add the +Infinity bucket
    buckets.push({
      le: Infinity,
      count: this.bucketCounts[this.bucketBoundaries.length],
    });

    // Build OTel-compatible data points
    const dataPoints: MetricDataPoint[] = [
      {
        name: "agentops.sdk.events.total",
        description: "Total number of events recorded",
        unit: "{event}",
        value: this.totalEvents,
        type: "counter",
        timestamp: now,
      },
      {
        name: "agentops.sdk.flushes.total",
        description: "Total number of flush operations",
        unit: "{flush}",
        value: this.flushCount,
        type: "counter",
        timestamp: now,
      },
      {
        name: "agentops.sdk.errors.total",
        description: "Total number of errors recorded",
        unit: "{error}",
        value: this.errorCount,
        type: "counter",
        timestamp: now,
      },
      {
        name: "agentops.sdk.error_rate",
        description: "Ratio of errors to total events",
        unit: "1",
        value: errorRate,
        type: "gauge",
        timestamp: now,
      },
    ];

    // Add per-type counters
    for (const [type, count] of Object.entries(this.eventsByType)) {
      dataPoints.push({
        name: `agentops.sdk.events.by_type.${type}`,
        description: `Number of ${type} events recorded`,
        unit: "{event}",
        value: count,
        type: "counter",
        timestamp: now,
      });
    }

    // Add latency histogram summary data points
    if (this.latencyCount > 0) {
      dataPoints.push({
        name: "agentops.sdk.event_duration",
        description: "Duration of event processing",
        unit: "ms",
        value: this.latencySum / this.latencyCount,
        type: "histogram",
        timestamp: now,
      });
    }

    return {
      totalEvents: this.totalEvents,
      eventsByType: { ...this.eventsByType },
      flushCount: this.flushCount,
      errorCount: this.errorCount,
      errorRate,
      latencyHistogram: {
        buckets,
        sum: this.latencySum,
        count: this.latencyCount,
        min: this.latencyCount > 0 ? this.latencyMin : 0,
        max: this.latencyCount > 0 ? this.latencyMax : 0,
      },
      timestamp: now,
      dataPoints,
    };
  }

  /**
   * Reset all collected metrics to their initial state.
   */
  reset(): void {
    this.totalEvents = 0;
    this.eventsByType = {};
    this.flushCount = 0;
    this.errorCount = 0;
    this.bucketCounts = new Array(this.bucketBoundaries.length + 1).fill(0);
    this.latencySum = 0;
    this.latencyCount = 0;
    this.latencyMin = Infinity;
    this.latencyMax = -Infinity;
  }

  /**
   * Record a latency observation into the histogram.
   */
  private recordLatency(durationMs: number): void {
    this.latencySum += durationMs;
    this.latencyCount++;

    if (durationMs < this.latencyMin) {
      this.latencyMin = durationMs;
    }
    if (durationMs > this.latencyMax) {
      this.latencyMax = durationMs;
    }

    // Find the correct bucket
    let placed = false;
    for (let i = 0; i < this.bucketBoundaries.length; i++) {
      if (durationMs <= this.bucketBoundaries[i]) {
        this.bucketCounts[i]++;
        placed = true;
        break;
      }
    }
    // Falls into the +Infinity bucket
    if (!placed) {
      this.bucketCounts[this.bucketBoundaries.length]++;
    }
  }
}
