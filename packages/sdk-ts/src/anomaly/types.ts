/**
 * AgentOps SDK - Anomaly Detection Types
 *
 * Type definitions for ML-powered anomaly detection.
 */

// ============================================================================
// Anomaly Types
// ============================================================================

export type AnomalyType =
  | "cost_spike"
  | "latency_anomaly"
  | "error_rate_spike"
  | "quality_degradation"
  | "token_usage_spike"
  | "hallucination_cluster"
  | "tool_failure_pattern"
  | "custom";

export type AnomalySeverity = "info" | "warning" | "critical";

export interface Anomaly {
  /** Unique identifier */
  id: string;

  /** Type of anomaly detected */
  type: AnomalyType;

  /** Severity level */
  severity: AnomalySeverity;

  /** Human-readable title */
  title: string;

  /** Detailed description */
  description: string;

  /** The metric that triggered the anomaly */
  metric: string;

  /** Expected value (baseline) */
  expectedValue: number;

  /** Actual observed value */
  actualValue: number;

  /** Deviation from expected (as percentage or z-score) */
  deviation: number;

  /** Confidence in the anomaly detection (0-1) */
  confidence: number;

  /** Timestamp when detected */
  detectedAt: number;

  /** Start of the anomalous period */
  startTime: number;

  /** End of the anomalous period (if resolved) */
  endTime?: number;

  /** Whether the anomaly is still active */
  isActive: boolean;

  /** Affected entities (sessions, features, users) */
  affectedEntities?: {
    sessionIds?: string[];
    featureIds?: string[];
    userIds?: string[];
    models?: string[];
  };

  /** Suggested actions to investigate/resolve */
  suggestions?: string[];

  /** Related anomalies (for clustering) */
  relatedAnomalyIds?: string[];

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Detection Configuration
// ============================================================================

export interface AnomalyDetectionConfig {
  /** Enable anomaly detection */
  enabled: boolean;

  /** Detection sensitivity (0-1, higher = more sensitive) */
  sensitivity?: number;

  /** Minimum data points before detection starts */
  minDataPoints?: number;

  /** Window size for baseline calculation (in minutes) */
  baselineWindowMinutes?: number;

  /** Metrics to monitor */
  metrics?: AnomalyMetricConfig[];

  /** Alert callback */
  onAnomaly?: (anomaly: Anomaly) => void;

  /** Custom detection rules */
  customRules?: CustomDetectionRule[];
}

export interface AnomalyMetricConfig {
  /** Metric name */
  name: string;

  /** Detection method */
  method: "zscore" | "mad" | "percentile" | "threshold";

  /** Threshold for zscore/mad (default: 3) */
  threshold?: number;

  /** Percentile for percentile method (default: 99) */
  percentile?: number;

  /** Fixed threshold value for threshold method */
  fixedThreshold?: number;

  /** Direction of anomaly detection */
  direction: "above" | "below" | "both";

  /** Minimum severity level to report */
  minSeverity?: AnomalySeverity;
}

export interface CustomDetectionRule {
  /** Rule identifier */
  id: string;

  /** Rule name */
  name: string;

  /** Condition function */
  condition: (metrics: MetricSnapshot) => boolean;

  /** Severity if condition is met */
  severity: AnomalySeverity;

  /** Description generator */
  describe: (metrics: MetricSnapshot) => string;
}

// ============================================================================
// Metric Types
// ============================================================================

export interface MetricSnapshot {
  timestamp: number;

  // Cost metrics
  costPerHour?: number;
  costPerSession?: number;

  // Latency metrics
  latencyP50?: number;
  latencyP95?: number;
  latencyP99?: number;

  // Error metrics
  errorRate?: number;
  errorCount?: number;

  // Quality metrics
  qualityScore?: number;
  qualityScoreStdDev?: number;

  // Token metrics
  tokensPerSession?: number;
  tokensPerHour?: number;

  // Volume metrics
  sessionsPerHour?: number;
  requestsPerMinute?: number;

  // Custom metrics
  custom?: Record<string, number>;
}

export interface MetricTimeSeries {
  metric: string;
  dataPoints: Array<{
    timestamp: number;
    value: number;
  }>;
  stats: {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    median: number;
    p95: number;
    p99: number;
  };
}

// ============================================================================
// Alert Types
// ============================================================================

export interface AnomalyAlert {
  /** Alert identifier */
  id: string;

  /** Associated anomaly */
  anomaly: Anomaly;

  /** Alert status */
  status: "triggered" | "acknowledged" | "resolved" | "suppressed";

  /** When the alert was triggered */
  triggeredAt: number;

  /** When the alert was acknowledged */
  acknowledgedAt?: number;

  /** Who acknowledged the alert */
  acknowledgedBy?: string;

  /** When the alert was resolved */
  resolvedAt?: number;

  /** Resolution notes */
  resolutionNotes?: string;
}

// ============================================================================
// Statistics
// ============================================================================

export interface AnomalyStats {
  /** Total anomalies detected */
  totalDetected: number;

  /** Anomalies by type */
  byType: Record<AnomalyType, number>;

  /** Anomalies by severity */
  bySeverity: Record<AnomalySeverity, number>;

  /** Currently active anomalies */
  activeCount: number;

  /** Average time to resolve (ms) */
  avgResolutionTimeMs: number;

  /** Detection rate (anomalies per hour) */
  detectionRatePerHour: number;
}
