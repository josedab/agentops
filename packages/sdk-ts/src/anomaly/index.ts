/**
 * AgentOps SDK - Anomaly Detection Module
 *
 * Exports for ML-powered anomaly detection.
 */

export { AnomalyDetector } from "./detector.js";

export type {
  AnomalyType,
  AnomalySeverity,
  Anomaly,
  AnomalyDetectionConfig,
  AnomalyMetricConfig,
  CustomDetectionRule,
  MetricSnapshot,
  MetricTimeSeries,
  AnomalyAlert,
  AnomalyStats,
} from "./types.js";
