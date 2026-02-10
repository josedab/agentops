/**
 * OTel Native Export Tests
 *
 * Tests for OTelNativeExporter: backend presets, retry logic,
 * Grafana dashboard generation, health checks, and export metrics.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";
import { OTelNativeExporter } from "../src/otel/native-export";
import type { AgentEvent } from "../src/types";
import type { BackendName } from "../src/otel/native-export";

// ============================================================================
// Global fetch mock
// ============================================================================

const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeAll(() => {
  globalThis.fetch = mockFetch;
});

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    }),
  );
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

// ============================================================================
// Helpers
// ============================================================================

function makeEvent(overrides?: Partial<AgentEvent>): AgentEvent {
  return {
    eventId: "evt-1",
    sessionId: "sess-1",
    type: "prompt",
    role: "user",
    content: "Hello",
    timestamp: Date.now(),
    ...overrides,
  } as AgentEvent;
}

// ============================================================================
// Backend Configuration Presets
// ============================================================================

describe("OTelNativeExporter", () => {
  describe("configureForBackend", () => {
    it("should configure Datadog with correct endpoint and headers", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      exporter.configureForBackend("datadog", { apiKey: "dd-key-123" });

      // Verify by attempting an export – the fetch call reveals the configured endpoint & headers
      exporter.exportWithRetry([makeEvent()], { maxRetries: 0 });

      // Wait for the promise to flush
      return vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toContain("datadoghq.com");
        expect(init.headers["DD-API-KEY"]).toBe("dd-key-123");
      });
    });

    it("should configure Grafana with Bearer token", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      exporter.configureForBackend("grafana", { apiKey: "glc_token" });

      exporter.exportWithRetry([makeEvent()], { maxRetries: 0 });

      return vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toContain("/v1/traces");
        expect(init.headers["Authorization"]).toContain("Bearer");
      });
    });

    it("should configure Grafana with Basic auth when instanceId provided", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      exporter.configureForBackend("grafana", {
        apiKey: "glc_token",
        instanceId: "12345",
      });

      exporter.exportWithRetry([makeEvent()], { maxRetries: 0 });

      return vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const [, init] = mockFetch.mock.calls[0];
        expect(init.headers["Authorization"]).toContain("Basic");
      });
    });

    it("should configure Jaeger with default localhost endpoint", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      exporter.configureForBackend("jaeger");

      exporter.exportWithRetry([makeEvent()], { maxRetries: 0 });

      return vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const [url] = mockFetch.mock.calls[0];
        expect(url).toBe("http://localhost:4318/v1/traces");
      });
    });

    it("should configure Honeycomb with team header and dataset", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      exporter.configureForBackend("honeycomb", {
        apiKey: "hc-key",
        dataset: "agentops",
      });

      exporter.exportWithRetry([makeEvent()], { maxRetries: 0 });

      return vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toContain("api.honeycomb.io");
        expect(init.headers["x-honeycomb-team"]).toBe("hc-key");
        expect(init.headers["x-honeycomb-dataset"]).toBe("agentops");
      });
    });

    it("should configure New Relic with US endpoint by default", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      exporter.configureForBackend("newrelic", { apiKey: "nr-key" });

      exporter.exportWithRetry([makeEvent()], { maxRetries: 0 });

      return vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toContain("otlp.nr-data.net");
        expect(init.headers["api-key"]).toBe("nr-key");
      });
    });

    it("should configure New Relic EU region", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      exporter.configureForBackend("newrelic", {
        apiKey: "nr-key",
        region: "eu",
      });

      exporter.exportWithRetry([makeEvent()], { maxRetries: 0 });

      return vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain("eu01.nr-data.net");
      });
    });

    it("should configure Splunk with correct header", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      exporter.configureForBackend("splunk", { apiKey: "splunk-token" });

      exporter.exportWithRetry([makeEvent()], { maxRetries: 0 });

      return vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toContain("v2/trace/otlp");
        expect(init.headers["X-SF-Token"]).toBe("splunk-token");
      });
    });

    it("should allow custom endpoint override for any backend", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      exporter.configureForBackend("datadog", {
        apiKey: "dd-key",
        endpoint: "https://custom.dd.endpoint/traces",
      });

      exporter.exportWithRetry([makeEvent()], { maxRetries: 0 });

      return vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const [url] = mockFetch.mock.calls[0];
        expect(url).toBe("https://custom.dd.endpoint/traces");
      });
    });
  });

  // ============================================================================
  // Retry Logic
  // ============================================================================

  describe("exportWithRetry", () => {
    it("should succeed on first attempt without retries", async () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      const result = await exporter.exportWithRetry([makeEvent()], {
        maxRetries: 0,
      });

      expect(result.success).toBe(true);
      expect(result.spanCount).toBe(1);
    });

    it("should retry on failure then succeed", async () => {
      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockImplementationOnce(() =>
          Promise.resolve({ ok: true, text: () => Promise.resolve("") }),
        );

      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      const result = await exporter.exportWithRetry([makeEvent()], {
        maxRetries: 2,
        initialDelayMs: 10,
        backoffMultiplier: 2,
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should exhaust retries and return failure", async () => {
      mockFetch.mockRejectedValue(new Error("Persistent failure"));

      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      const result = await exporter.exportWithRetry([makeEvent()], {
        maxRetries: 2,
        initialDelayMs: 10,
      });

      expect(result.success).toBe(false);
      // 1 initial + 2 retries = 3
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should track retry count in metrics", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("fail"))
        .mockImplementationOnce(() =>
          Promise.resolve({ ok: true, text: () => Promise.resolve("") }),
        );

      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      await exporter.exportWithRetry([makeEvent()], {
        maxRetries: 3,
        initialDelayMs: 10,
      });

      const metrics = exporter.getExportMetrics();
      expect(metrics.totalRetries).toBe(1);
      expect(metrics.successfulExports).toBe(1);
    });

    it("should respect maxDelayMs cap", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail"))
        .mockImplementationOnce(() =>
          Promise.resolve({ ok: true, text: () => Promise.resolve("") }),
        );

      const start = Date.now();
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      await exporter.exportWithRetry([makeEvent()], {
        maxRetries: 3,
        initialDelayMs: 10,
        backoffMultiplier: 100,
        maxDelayMs: 50,
      });
      const elapsed = Date.now() - start;

      // delay should be capped at 50ms per retry, so total ~60ms not hundreds
      expect(elapsed).toBeLessThan(500);
    });
  });

  // ============================================================================
  // Grafana Dashboard Template
  // ============================================================================

  describe("createGrafanaDashboard", () => {
    it("should return a valid dashboard JSON structure", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      const dashboard = exporter.createGrafanaDashboard();

      expect(dashboard.title).toBe("AgentOps Observability");
      expect(dashboard.uid).toBe("agentops-otel-dashboard");
      expect(dashboard.schemaVersion).toBe(39);
      expect(Array.isArray(dashboard.panels)).toBe(true);
    });

    it("should contain five required panels", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      const dashboard = exporter.createGrafanaDashboard();
      const panels = dashboard.panels as Array<{ title: string; type: string }>;

      expect(panels).toHaveLength(5);

      const titles = panels.map((p) => p.title);
      expect(titles).toContain("Sessions Over Time");
      expect(titles).toContain("Cost by Model");
      expect(titles).toContain("Error Rates");
      expect(titles).toContain("Token Usage");
      expect(titles).toContain("Latency Distribution");
    });

    it("should have correct panel types", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      const dashboard = exporter.createGrafanaDashboard();
      const panels = dashboard.panels as Array<{ title: string; type: string }>;

      const byTitle = Object.fromEntries(panels.map((p) => [p.title, p.type]));
      expect(byTitle["Sessions Over Time"]).toBe("timeseries");
      expect(byTitle["Cost by Model"]).toBe("barchart");
      expect(byTitle["Latency Distribution"]).toBe("histogram");
    });

    it("should include time and refresh settings", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      const dashboard = exporter.createGrafanaDashboard();

      expect(dashboard.time).toBeDefined();
      expect(dashboard.refresh).toBe("30s");
    });
  });

  // ============================================================================
  // Health Check
  // ============================================================================

  describe("checkConnection", () => {
    it("should return reachable when endpoint responds OK", async () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        endpoint: "http://localhost:4318/v1/traces",
        exportInterval: 0,
      });

      const result = await exporter.checkConnection();

      expect(result.reachable).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it("should return not reachable on HTTP error", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve("Unauthorized"),
        }),
      );

      const exporter = new OTelNativeExporter({
        enabled: true,
        endpoint: "http://localhost:4318/v1/traces",
        exportInterval: 0,
      });

      const result = await exporter.checkConnection();

      expect(result.reachable).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe("HTTP 401");
    });

    it("should return not reachable on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const exporter = new OTelNativeExporter({
        enabled: true,
        endpoint: "http://localhost:4318/v1/traces",
        exportInterval: 0,
      });

      const result = await exporter.checkConnection();

      expect(result.reachable).toBe(false);
      expect(result.error).toBe("Connection refused");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should send configured headers in health check", async () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        endpoint: "http://localhost:4318/v1/traces",
        headers: { "X-Custom": "value" },
        exportInterval: 0,
      });

      await exporter.checkConnection();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers["X-Custom"]).toBe("value");
    });
  });

  // ============================================================================
  // Export Metrics Tracking
  // ============================================================================

  describe("getExportMetrics", () => {
    it("should start with zeroed metrics", () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      const metrics = exporter.getExportMetrics();

      expect(metrics.totalEventsSubmitted).toBe(0);
      expect(metrics.successfulExports).toBe(0);
      expect(metrics.failedExports).toBe(0);
      expect(metrics.totalRetries).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.averageLatencyMs).toBe(0);
    });

    it("should track successful exports", async () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });

      await exporter.exportWithRetry([makeEvent()], { maxRetries: 0 });
      await exporter.exportWithRetry([makeEvent(), makeEvent()], {
        maxRetries: 0,
      });

      const metrics = exporter.getExportMetrics();
      expect(metrics.totalEventsSubmitted).toBe(3);
      expect(metrics.successfulExports).toBe(2);
      expect(metrics.successRate).toBe(1);
      expect(metrics.averageLatencyMs).toBeGreaterThanOrEqual(0);
      expect(metrics.lastExportTimestamp).toBeDefined();
    });

    it("should track failed exports", async () => {
      mockFetch.mockRejectedValue(new Error("fail"));

      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      await exporter.exportWithRetry([makeEvent()], {
        maxRetries: 0,
        initialDelayMs: 10,
      });

      const metrics = exporter.getExportMetrics();
      expect(metrics.failedExports).toBe(1);
      expect(metrics.successRate).toBe(0);
      expect(metrics.lastError).toBe("fail");
    });

    it("should include underlying exporter stats", async () => {
      const exporter = new OTelNativeExporter({
        enabled: true,
        exportInterval: 0,
      });
      const metrics = exporter.getExportMetrics();

      expect(metrics.exporterStats).toBeDefined();
      expect(typeof metrics.exporterStats.totalSpansExported).toBe("number");
    });
  });
});
