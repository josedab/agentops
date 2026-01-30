/**
 * AgentOps SDK - Anomaly Detector
 *
 * ML-powered detection of unusual patterns in AI metrics.
 */

import type {
  Anomaly,
  AnomalyType,
  AnomalySeverity,
  AnomalyDetectionConfig,
  AnomalyMetricConfig,
  MetricSnapshot,
  MetricTimeSeries,
  CustomDetectionRule,
} from "./types.js";
import { generateEventId, now } from "../utils.js";

const DEFAULT_CONFIG: Required<
  Omit<AnomalyDetectionConfig, "onAnomaly" | "customRules">
> & {
  customRules: CustomDetectionRule[];
} = {
  enabled: false,
  sensitivity: 0.5,
  minDataPoints: 30,
  baselineWindowMinutes: 60,
  metrics: [
    { name: "costPerHour", method: "zscore", threshold: 3, direction: "above" },
    {
      name: "latencyP95",
      method: "zscore",
      threshold: 2.5,
      direction: "above",
    },
    {
      name: "errorRate",
      method: "threshold",
      fixedThreshold: 0.05,
      direction: "above",
    },
    {
      name: "qualityScore",
      method: "zscore",
      threshold: 2,
      direction: "below",
    },
  ],
  customRules: [],
};

interface MetricBuffer {
  values: number[];
  timestamps: number[];
  maxSize: number;
}

export class AnomalyDetector {
  private readonly config: typeof DEFAULT_CONFIG & {
    onAnomaly?: (anomaly: Anomaly) => void;
  };
  private metricBuffers: Map<string, MetricBuffer> = new Map();
  private activeAnomalies: Map<string, Anomaly> = new Map();
  private anomalyHistory: Anomaly[] = [];

  constructor(config?: AnomalyDetectionConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      metrics: config?.metrics ?? DEFAULT_CONFIG.metrics,
      customRules: config?.customRules ?? [],
    };
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Record a metric snapshot for analysis
   */
  recordMetrics(snapshot: MetricSnapshot): Anomaly[] {
    if (!this.config.enabled) return [];

    const detectedAnomalies: Anomaly[] = [];

    // Update buffers with new metrics
    for (const [key, value] of Object.entries(snapshot)) {
      if (typeof value === "number" && key !== "timestamp") {
        this.addToBuffer(key, value, snapshot.timestamp);
      }
    }

    // Handle custom metrics
    if (snapshot.custom) {
      for (const [key, value] of Object.entries(snapshot.custom)) {
        this.addToBuffer(`custom.${key}`, value, snapshot.timestamp);
      }
    }

    // Check configured metrics
    for (const metricConfig of this.config.metrics) {
      const buffer = this.metricBuffers.get(metricConfig.name);
      if (!buffer || buffer.values.length < this.config.minDataPoints) {
        continue;
      }

      const value = snapshot[metricConfig.name as keyof MetricSnapshot];
      if (typeof value !== "number") continue;

      const anomaly = this.detectAnomaly(
        metricConfig,
        value,
        buffer,
        snapshot.timestamp,
      );
      if (anomaly) {
        detectedAnomalies.push(anomaly);
      }
    }

    // Check custom rules
    for (const rule of this.config.customRules) {
      if (rule.condition(snapshot)) {
        const anomaly = this.createCustomAnomaly(rule, snapshot);
        detectedAnomalies.push(anomaly);
      }
    }

    // Process detected anomalies
    for (const anomaly of detectedAnomalies) {
      this.processAnomaly(anomaly);
    }

    return detectedAnomalies;
  }

  /**
   * Get currently active anomalies
   */
  getActiveAnomalies(): Anomaly[] {
    return Array.from(this.activeAnomalies.values());
  }

  /**
   * Get anomaly history
   */
  getHistory(limit?: number): Anomaly[] {
    const history = [...this.anomalyHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Resolve an anomaly
   */
  resolveAnomaly(anomalyId: string): boolean {
    const anomaly = this.activeAnomalies.get(anomalyId);
    if (!anomaly) return false;

    anomaly.isActive = false;
    anomaly.endTime = now();
    this.activeAnomalies.delete(anomalyId);

    return true;
  }

  /**
   * Get time series data for a metric
   */
  getMetricTimeSeries(metric: string): MetricTimeSeries | null {
    const buffer = this.metricBuffers.get(metric);
    if (!buffer || buffer.values.length === 0) return null;

    const dataPoints = buffer.values.map((value, i) => ({
      timestamp: buffer.timestamps[i],
      value,
    }));

    const stats = this.calculateStats(buffer.values);

    return {
      metric,
      dataPoints,
      stats,
    };
  }

  /**
   * Add a custom detection rule
   */
  addCustomRule(rule: CustomDetectionRule): void {
    this.config.customRules.push(rule);
  }

  /**
   * Remove a custom detection rule
   */
  removeCustomRule(ruleId: string): boolean {
    const index = this.config.customRules.findIndex((r) => r.id === ruleId);
    if (index === -1) return false;
    this.config.customRules.splice(index, 1);
    return true;
  }

  private addToBuffer(metric: string, value: number, timestamp: number): void {
    let buffer = this.metricBuffers.get(metric);

    if (!buffer) {
      buffer = {
        values: [],
        timestamps: [],
        maxSize: this.config.baselineWindowMinutes * 60, // Assume 1 sample/second
      };
      this.metricBuffers.set(metric, buffer);
    }

    buffer.values.push(value);
    buffer.timestamps.push(timestamp);

    // Trim old data
    const cutoff = timestamp - this.config.baselineWindowMinutes * 60 * 1000;
    while (buffer.timestamps.length > 0 && buffer.timestamps[0] < cutoff) {
      buffer.values.shift();
      buffer.timestamps.shift();
    }
  }

  private detectAnomaly(
    config: AnomalyMetricConfig,
    value: number,
    buffer: MetricBuffer,
    timestamp: number,
  ): Anomaly | null {
    const stats = this.calculateStats(buffer.values);
    let isAnomaly = false;
    let deviation = 0;
    let expectedValue = stats.mean;

    switch (config.method) {
      case "zscore": {
        const zscore =
          stats.stdDev > 0 ? (value - stats.mean) / stats.stdDev : 0;
        deviation = Math.abs(zscore);
        const threshold =
          (config.threshold ?? 3) * (1 - this.config.sensitivity * 0.5);

        if (config.direction === "above" && zscore > threshold) {
          isAnomaly = true;
        } else if (config.direction === "below" && zscore < -threshold) {
          isAnomaly = true;
        } else if (
          config.direction === "both" &&
          Math.abs(zscore) > threshold
        ) {
          isAnomaly = true;
        }
        break;
      }

      case "mad": {
        const mad = this.calculateMAD(buffer.values, stats.median);
        const modifiedZscore =
          mad > 0 ? (0.6745 * (value - stats.median)) / mad : 0;
        deviation = Math.abs(modifiedZscore);
        expectedValue = stats.median;
        const threshold =
          (config.threshold ?? 3.5) * (1 - this.config.sensitivity * 0.5);

        if (config.direction === "above" && modifiedZscore > threshold) {
          isAnomaly = true;
        } else if (
          config.direction === "below" &&
          modifiedZscore < -threshold
        ) {
          isAnomaly = true;
        } else if (
          config.direction === "both" &&
          Math.abs(modifiedZscore) > threshold
        ) {
          isAnomaly = true;
        }
        break;
      }

      case "percentile": {
        const percentile = config.percentile ?? 99;
        const threshold = this.calculatePercentile(buffer.values, percentile);
        expectedValue = threshold;
        deviation =
          value > threshold ? ((value - threshold) / threshold) * 100 : 0;

        if (config.direction === "above" && value > threshold) {
          isAnomaly = true;
        } else if (
          config.direction === "below" &&
          value < this.calculatePercentile(buffer.values, 100 - percentile)
        ) {
          isAnomaly = true;
        }
        break;
      }

      case "threshold": {
        const fixedThreshold = config.fixedThreshold ?? 0;
        expectedValue = fixedThreshold;
        deviation =
          fixedThreshold > 0
            ? (Math.abs(value - fixedThreshold) / fixedThreshold) * 100
            : 0;

        if (config.direction === "above" && value > fixedThreshold) {
          isAnomaly = true;
        } else if (config.direction === "below" && value < fixedThreshold) {
          isAnomaly = true;
        }
        break;
      }
    }

    if (!isAnomaly) return null;

    const type = this.metricToAnomalyType(config.name);
    const severity = this.calculateSeverity(deviation, config);
    const confidence = this.calculateConfidence(
      buffer.values.length,
      deviation,
    );

    return {
      id: generateEventId(),
      type,
      severity,
      title: `${type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Detected`,
      description: `${config.name} is ${value.toFixed(2)} (expected: ${expectedValue.toFixed(2)}, deviation: ${deviation.toFixed(1)}σ)`,
      metric: config.name,
      expectedValue,
      actualValue: value,
      deviation,
      confidence,
      detectedAt: timestamp,
      startTime: timestamp,
      isActive: true,
      suggestions: this.generateSuggestions(type, config.name),
    };
  }

  private createCustomAnomaly(
    rule: CustomDetectionRule,
    snapshot: MetricSnapshot,
  ): Anomaly {
    return {
      id: generateEventId(),
      type: "custom",
      severity: rule.severity,
      title: rule.name,
      description: rule.describe(snapshot),
      metric: "custom",
      expectedValue: 0,
      actualValue: 0,
      deviation: 0,
      confidence: 1,
      detectedAt: snapshot.timestamp,
      startTime: snapshot.timestamp,
      isActive: true,
      metadata: { ruleId: rule.id },
    };
  }

  private processAnomaly(anomaly: Anomaly): void {
    // Check for existing similar anomaly
    const existingKey = `${anomaly.type}:${anomaly.metric}`;
    const existing = this.activeAnomalies.get(existingKey);

    if (existing) {
      // Update existing anomaly
      existing.actualValue = anomaly.actualValue;
      existing.deviation = Math.max(existing.deviation, anomaly.deviation);
      if (
        anomaly.severity === "critical" ||
        (anomaly.severity === "warning" && existing.severity === "info")
      ) {
        existing.severity = anomaly.severity;
      }
    } else {
      // New anomaly
      this.activeAnomalies.set(existingKey, anomaly);
      this.anomalyHistory.push(anomaly);

      if (this.config.onAnomaly) {
        this.config.onAnomaly(anomaly);
      }
    }
  }

  private calculateStats(values: number[]): {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    median: number;
    p95: number;
    p99: number;
  } {
    if (values.length === 0) {
      return { mean: 0, stdDev: 0, min: 0, max: 0, median: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

    return {
      mean,
      stdDev: Math.sqrt(variance),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: this.calculatePercentile(sorted, 50),
      p95: this.calculatePercentile(sorted, 95),
      p99: this.calculatePercentile(sorted, 99),
    };
  }

  private calculatePercentile(
    sortedValues: number[],
    percentile: number,
  ): number {
    if (sortedValues.length === 0) return 0;
    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedValues[lower];
    return (
      sortedValues[lower] +
      (sortedValues[upper] - sortedValues[lower]) * (index - lower)
    );
  }

  private calculateMAD(values: number[], median: number): number {
    const deviations = values.map((v) => Math.abs(v - median));
    return this.calculatePercentile(
      [...deviations].sort((a, b) => a - b),
      50,
    );
  }

  private metricToAnomalyType(metric: string): AnomalyType {
    if (metric.includes("cost")) return "cost_spike";
    if (metric.includes("latency")) return "latency_anomaly";
    if (metric.includes("error")) return "error_rate_spike";
    if (metric.includes("quality")) return "quality_degradation";
    if (metric.includes("token")) return "token_usage_spike";
    return "custom";
  }

  private calculateSeverity(
    deviation: number,
    _config: AnomalyMetricConfig,
  ): AnomalySeverity {
    const adjustedDeviation = deviation * (1 + this.config.sensitivity * 0.5);

    if (adjustedDeviation > 5) return "critical";
    if (adjustedDeviation > 3) return "warning";
    return "info";
  }

  private calculateConfidence(sampleSize: number, deviation: number): number {
    // Higher confidence with more samples and larger deviations
    const sampleFactor = Math.min(sampleSize / 100, 1);
    const deviationFactor = Math.min(deviation / 5, 1);
    return Math.min(0.5 + sampleFactor * 0.3 + deviationFactor * 0.2, 1);
  }

  private generateSuggestions(type: AnomalyType, _metric: string): string[] {
    const suggestions: Record<AnomalyType, string[]> = {
      cost_spike: [
        "Check for increased traffic or usage",
        "Review recent prompt changes for token efficiency",
        "Investigate if a specific feature/user is responsible",
      ],
      latency_anomaly: [
        "Check LLM provider status page",
        "Review if prompts have increased in size",
        "Check for network issues or rate limiting",
      ],
      error_rate_spike: [
        "Review error logs for common patterns",
        "Check API key validity and rate limits",
        "Investigate if specific tools are failing",
      ],
      quality_degradation: [
        "Review recent prompt changes",
        "Check if model has been updated",
        "Analyze low-scoring responses for patterns",
      ],
      token_usage_spike: [
        "Review prompt templates for efficiency",
        "Check for repeated or redundant context",
        "Investigate if specific features are affected",
      ],
      hallucination_cluster: [
        "Review context and grounding data",
        "Consider adding fact-checking tools",
        "Analyze affected prompts for patterns",
      ],
      tool_failure_pattern: [
        "Check tool service availability",
        "Review tool input patterns for errors",
        "Consider adding retry logic or fallbacks",
      ],
      custom: [
        "Review custom rule configuration",
        "Investigate the specific metric pattern",
      ],
    };

    return suggestions[type] || suggestions.custom;
  }
}
