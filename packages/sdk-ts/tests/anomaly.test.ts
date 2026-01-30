import { describe, it, expect, beforeEach } from "vitest";
import {
  AnomalyDetector,
  type AnomalyDetectionConfig,
  type MetricSnapshot,
} from "../src/anomaly";

describe("AnomalyDetector", () => {
  let detector: AnomalyDetector;
  const mockConfig: AnomalyDetectionConfig = {
    enabled: true,
    sensitivity: 0.5,
    minDataPoints: 10,
    baselineWindowMinutes: 60,
    metrics: [
      { name: "latency", method: "zscore", threshold: 2.0, direction: "above" },
      {
        name: "errorRate",
        method: "threshold",
        fixedThreshold: 0.1,
        direction: "above",
      },
    ],
  };

  beforeEach(() => {
    detector = new AnomalyDetector(mockConfig);
  });

  describe("initialization", () => {
    it("should create detector with config", () => {
      expect(detector).toBeInstanceOf(AnomalyDetector);
    });

    it("should report enabled status", () => {
      expect(detector.isEnabled).toBe(true);
    });

    it("should be disabled by default", () => {
      const disabledDetector = new AnomalyDetector({});
      expect(disabledDetector.isEnabled).toBe(false);
    });
  });

  describe("metric recording", () => {
    it("should record metric snapshots", () => {
      const snapshot: MetricSnapshot = {
        timestamp: Date.now(),
        latency: 100,
        errorRate: 0.01,
      };

      const anomalies = detector.recordMetrics(snapshot);
      expect(Array.isArray(anomalies)).toBe(true);
    });

    it("should track multiple snapshots", () => {
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        detector.recordMetrics({
          timestamp: now + i * 1000,
          latency: 100 + Math.random() * 10,
          errorRate: 0.01,
        });
      }

      const timeSeries = detector.getMetricTimeSeries("latency");
      expect(timeSeries).toBeDefined();
      expect(timeSeries?.dataPoints.length).toBe(20);
    });

    it("should return empty array when disabled", () => {
      const disabledDetector = new AnomalyDetector({ enabled: false });
      const anomalies = disabledDetector.recordMetrics({
        timestamp: Date.now(),
        latency: 1000,
      });

      expect(anomalies).toEqual([]);
    });
  });

  describe("anomaly detection", () => {
    it("should detect anomaly for outlier value", () => {
      const now = Date.now();

      // Build baseline with consistent values
      for (let i = 0; i < 50; i++) {
        detector.recordMetrics({
          timestamp: now + i * 1000,
          latency: 100 + (Math.random() - 0.5) * 5,
          errorRate: 0.01,
        });
      }

      // Add an extreme outlier
      const anomalies = detector.recordMetrics({
        timestamp: now + 51000,
        latency: 500,
        errorRate: 0.01,
      });

      // Should detect anomaly
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].metric).toBe("latency");
    });

    it("should respect minimum data points requirement", () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        detector.recordMetrics({
          timestamp: now + i * 1000,
          latency: 100,
          errorRate: 0.01,
        });
      }

      // Even an extreme value shouldn't trigger anomaly
      const anomalies = detector.recordMetrics({
        timestamp: now + 6000,
        latency: 10000,
        errorRate: 0.01,
      });

      expect(anomalies.length).toBe(0);
    });

    it("should detect threshold-based anomalies", () => {
      const now = Date.now();

      // Build baseline
      for (let i = 0; i < 50; i++) {
        detector.recordMetrics({
          timestamp: now + i * 1000,
          latency: 100,
          errorRate: 0.01,
        });
      }

      // Error rate above threshold (0.1)
      const anomalies = detector.recordMetrics({
        timestamp: now + 51000,
        latency: 100,
        errorRate: 0.5,
      });

      // Should detect error rate anomaly
      const errorAnomaly = anomalies.find((a) => a.metric === "errorRate");
      expect(errorAnomaly).toBeDefined();
    });
  });

  describe("time series data", () => {
    it("should get metric time series", () => {
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        detector.recordMetrics({
          timestamp: now + i * 1000,
          latency: 100 + i,
          errorRate: 0.01,
        });
      }

      const timeSeries = detector.getMetricTimeSeries("latency");
      expect(timeSeries).toBeDefined();
      expect(timeSeries?.metric).toBe("latency");
      expect(timeSeries?.stats).toBeDefined();
    });

    it("should return null for unknown metric", () => {
      const timeSeries = detector.getMetricTimeSeries("unknown_metric");
      expect(timeSeries).toBeNull();
    });
  });

  describe("active anomalies", () => {
    it("should get active anomalies", () => {
      const activeAnomalies = detector.getActiveAnomalies();
      expect(Array.isArray(activeAnomalies)).toBe(true);
    });

    it("should get anomaly history", () => {
      const history = detector.getHistory(10);
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe("custom metrics", () => {
    it("should track custom metrics", () => {
      const now = Date.now();
      detector.recordMetrics({
        timestamp: now,
        latency: 100,
        errorRate: 0.01,
        custom: {
          queueDepth: 50,
          requestsPerSecond: 100,
        },
      });

      const queueSeries = detector.getMetricTimeSeries("custom.queueDepth");
      expect(queueSeries).toBeDefined();
    });
  });
});
