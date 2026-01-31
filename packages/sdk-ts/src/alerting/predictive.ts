/**
 * AgentOps SDK - Predictive Alerting
 *
 * ML-based forecasting of cost overruns, quality degradation,
 * and capacity issues before they happen.
 */

import { now, generateEventId } from "../utils.js";

// ============================================================================
// Types
// ============================================================================

export interface PredictiveAlertingConfig {
  /** Enable predictive alerting */
  enabled: boolean;
  /** Minimum data points for prediction */
  minDataPoints?: number;
  /** Forecast horizon (ms) */
  forecastHorizon?: number;
  /** Confidence threshold for alerts (0-1) */
  confidenceThreshold?: number;
  /** Alert cooldown period (ms) */
  alertCooldown?: number;
  /** Enable auto-remediation suggestions */
  enableRemediation?: boolean;
  /** Callback when prediction is made */
  onPrediction?: (prediction: Prediction) => void;
  /** Callback when alert is triggered */
  onAlert?: (alert: PredictiveAlert) => void;
}

export interface MetricDataPoint {
  timestamp: number;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface MetricSeries {
  id: string;
  name: string;
  type: MetricType;
  unit: string;
  dataPoints: MetricDataPoint[];
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

export type MetricType =
  | "cost"
  | "latency"
  | "error_rate"
  | "token_usage"
  | "quality_score"
  | "throughput"
  | "custom";

export interface Prediction {
  id: string;
  metricId: string;
  metricName: string;
  /** Predicted values */
  forecast: ForecastPoint[];
  /** Confidence interval */
  confidenceInterval: {
    lower: number[];
    upper: number[];
  };
  /** Model confidence (0-1) */
  confidence: number;
  /** Trend direction */
  trend: "increasing" | "stable" | "decreasing";
  /** Seasonality detected */
  seasonality?: SeasonalPattern;
  /** Anomaly probability */
  anomalyProbability: number;
  /** Predicted threshold breach */
  predictedBreach?: {
    type: "warning" | "critical";
    estimatedTime: number;
    probability: number;
  };
  /** Generated at */
  generatedAt: number;
}

export interface ForecastPoint {
  timestamp: number;
  value: number;
  confidence: number;
}

export interface SeasonalPattern {
  type: "hourly" | "daily" | "weekly" | "monthly";
  strength: number;
  peakTimes: number[];
  troughTimes: number[];
}

export interface PredictiveAlert {
  id: string;
  type: AlertType;
  severity: "info" | "warning" | "critical";
  predictionId: string;
  metricId: string;
  metricName: string;
  message: string;
  description: string;
  impact: {
    type: "cost" | "performance" | "quality" | "availability";
    severity: "low" | "medium" | "high";
    estimatedValue?: number;
    estimatedTime: number;
  };
  remediation?: AlertRemediation;
  status: "active" | "acknowledged" | "resolved" | "dismissed";
  createdAt: number;
  acknowledgedAt?: number;
  resolvedAt?: number;
}

export type AlertType =
  | "cost_overrun"
  | "latency_spike"
  | "error_rate_increase"
  | "quality_degradation"
  | "capacity_limit"
  | "budget_exhaust"
  | "anomaly_detected";

export interface AlertRemediation {
  type: "automatic" | "manual";
  actions: RemediationAction[];
  estimatedImpact: string;
  risk: "low" | "medium" | "high";
}

export interface RemediationAction {
  id: string;
  action: string;
  description: string;
  automated: boolean;
  command?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  metricId: string;
  condition: AlertCondition;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
  cooldownMs: number;
  lastTriggered?: number;
}

export interface AlertCondition {
  type: "threshold" | "trend" | "anomaly" | "forecast";
  operator: "gt" | "lt" | "gte" | "lte" | "eq";
  value: number;
  duration?: number;
  confidence?: number;
}

// ============================================================================
// Predictive Alerting Engine
// ============================================================================

export class PredictiveAlertingEngine {
  private readonly config: Required<
    Omit<PredictiveAlertingConfig, "onPrediction" | "onAlert">
  > & {
    onPrediction?: (prediction: Prediction) => void;
    onAlert?: (alert: PredictiveAlert) => void;
  };

  private metrics: Map<string, MetricSeries> = new Map();
  private predictions: Map<string, Prediction> = new Map();
  private alerts: Map<string, PredictiveAlert> = new Map();
  private rules: Map<string, AlertRule> = new Map();

  constructor(config: PredictiveAlertingConfig) {
    this.config = {
      enabled: config.enabled,
      minDataPoints: config.minDataPoints ?? 10,
      forecastHorizon: config.forecastHorizon ?? 24 * 60 * 60 * 1000,
      confidenceThreshold: config.confidenceThreshold ?? 0.7,
      alertCooldown: config.alertCooldown ?? 60 * 60 * 1000,
      enableRemediation: config.enableRemediation ?? true,
      onPrediction: config.onPrediction,
      onAlert: config.onAlert,
    };
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  // =========================================================================
  // Metric Management
  // =========================================================================

  registerMetric(metric: Omit<MetricSeries, "dataPoints">): MetricSeries {
    const series: MetricSeries = { ...metric, dataPoints: [] };
    this.metrics.set(series.id, series);
    return series;
  }

  addDataPoint(
    metricId: string,
    value: number,
    metadata?: Record<string, unknown>,
  ): void {
    const metric = this.metrics.get(metricId);
    if (!metric) throw new Error(`Metric ${metricId} not found`);

    metric.dataPoints.push({ timestamp: now(), value, metadata });

    if (metric.dataPoints.length >= this.config.minDataPoints) {
      this.runPrediction(metricId);
    }
  }

  addDataPoints(metricId: string, points: MetricDataPoint[]): void {
    const metric = this.metrics.get(metricId);
    if (!metric) throw new Error(`Metric ${metricId} not found`);

    metric.dataPoints.push(...points);

    if (metric.dataPoints.length >= this.config.minDataPoints) {
      this.runPrediction(metricId);
    }
  }

  getMetric(id: string): MetricSeries | undefined {
    return this.metrics.get(id);
  }

  listMetrics(): MetricSeries[] {
    return Array.from(this.metrics.values());
  }

  // =========================================================================
  // Prediction Engine
  // =========================================================================

  runPrediction(metricId: string): Prediction | null {
    if (!this.config.enabled) return null;

    const metric = this.metrics.get(metricId);
    if (!metric || metric.dataPoints.length < this.config.minDataPoints)
      return null;

    const forecast = this.calculateForecast(metric);
    const trend = this.detectTrend(metric.dataPoints);
    const seasonality = this.detectSeasonality(metric.dataPoints);
    const anomalyProb = this.calculateAnomalyProbability(metric.dataPoints);
    const { lower, upper } = this.calculateConfidenceInterval(
      forecast,
      metric.dataPoints,
    );
    const predictedBreach = this.predictThresholdBreach(
      forecast,
      metric.thresholds,
    );

    const prediction: Prediction = {
      id: generateEventId(),
      metricId,
      metricName: metric.name,
      forecast,
      confidenceInterval: { lower, upper },
      confidence: this.calculatePredictionConfidence(
        metric.dataPoints,
        forecast,
      ),
      trend,
      seasonality,
      anomalyProbability: anomalyProb,
      predictedBreach,
      generatedAt: now(),
    };

    this.predictions.set(prediction.id, prediction);

    if (this.config.onPrediction) {
      this.config.onPrediction(prediction);
    }

    this.evaluateAlertRules(prediction, metric);

    return prediction;
  }

  getPrediction(id: string): Prediction | undefined {
    return this.predictions.get(id);
  }

  getLatestPrediction(metricId: string): Prediction | undefined {
    const predictions = Array.from(this.predictions.values())
      .filter((p) => p.metricId === metricId)
      .sort((a, b) => b.generatedAt - a.generatedAt);
    return predictions[0];
  }

  // =========================================================================
  // Alert Management
  // =========================================================================

  createRule(rule: Omit<AlertRule, "id">): AlertRule {
    const alertRule: AlertRule = { ...rule, id: generateEventId() };
    this.rules.set(alertRule.id, alertRule);
    return alertRule;
  }

  updateRule(id: string, updates: Partial<AlertRule>): AlertRule | null {
    const rule = this.rules.get(id);
    if (!rule) return null;
    Object.assign(rule, updates);
    return rule;
  }

  deleteRule(id: string): boolean {
    return this.rules.delete(id);
  }

  getRule(id: string): AlertRule | undefined {
    return this.rules.get(id);
  }

  listRules(metricId?: string): AlertRule[] {
    const rules = Array.from(this.rules.values());
    if (metricId) return rules.filter((r) => r.metricId === metricId);
    return rules;
  }

  getAlert(id: string): PredictiveAlert | undefined {
    return this.alerts.get(id);
  }

  listAlerts(filter?: {
    status?: PredictiveAlert["status"];
    severity?: PredictiveAlert["severity"];
    metricId?: string;
    limit?: number;
  }): PredictiveAlert[] {
    let alerts = Array.from(this.alerts.values());

    if (filter) {
      if (filter.status)
        alerts = alerts.filter((a) => a.status === filter.status);
      if (filter.severity)
        alerts = alerts.filter((a) => a.severity === filter.severity);
      if (filter.metricId)
        alerts = alerts.filter((a) => a.metricId === filter.metricId);
    }

    alerts.sort((a, b) => b.createdAt - a.createdAt);
    if (filter?.limit) alerts = alerts.slice(0, filter.limit);

    return alerts;
  }

  acknowledgeAlert(id: string): PredictiveAlert | null {
    const alert = this.alerts.get(id);
    if (!alert) return null;
    alert.status = "acknowledged";
    alert.acknowledgedAt = now();
    return alert;
  }

  resolveAlert(id: string): PredictiveAlert | null {
    const alert = this.alerts.get(id);
    if (!alert) return null;
    alert.status = "resolved";
    alert.resolvedAt = now();
    return alert;
  }

  dismissAlert(id: string): PredictiveAlert | null {
    const alert = this.alerts.get(id);
    if (!alert) return null;
    alert.status = "dismissed";
    return alert;
  }

  // =========================================================================
  // Forecasting Methods
  // =========================================================================

  private calculateForecast(metric: MetricSeries): ForecastPoint[] {
    const data = metric.dataPoints.map((p) => p.value);
    const timestamps = metric.dataPoints.map((p) => p.timestamp);

    if (data.length < 2) return [];

    const avgInterval =
      (timestamps[timestamps.length - 1] - timestamps[0]) /
      (timestamps.length - 1);
    const alpha = 0.3;
    const beta = 0.1;
    const gamma = 0.1;

    let level = data[0];
    let trend = data.length > 1 ? data[1] - data[0] : 0;

    for (let i = 1; i < data.length; i++) {
      const prevLevel = level;
      level = alpha * data[i] + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }

    const forecastPoints: ForecastPoint[] = [];
    const numForecasts = Math.ceil(this.config.forecastHorizon / avgInterval);
    const lastTimestamp = timestamps[timestamps.length - 1];

    for (let i = 1; i <= Math.min(numForecasts, 48); i++) {
      const forecastValue = level + trend * i;
      const adjustedValue =
        forecastValue * (1 + gamma * Math.sin((i * Math.PI) / 12));

      forecastPoints.push({
        timestamp: lastTimestamp + avgInterval * i,
        value: Math.max(0, adjustedValue),
        confidence: Math.max(0.5, 1 - i * 0.02),
      });
    }

    return forecastPoints;
  }

  private detectTrend(
    dataPoints: MetricDataPoint[],
  ): "increasing" | "stable" | "decreasing" {
    if (dataPoints.length < 3) return "stable";

    const values = dataPoints.map((p) => p.value);
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) ** 2;
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const normalizedSlope = slope / (yMean || 1);

    if (normalizedSlope > 0.1) return "increasing";
    if (normalizedSlope < -0.1) return "decreasing";
    return "stable";
  }

  private detectSeasonality(
    dataPoints: MetricDataPoint[],
  ): SeasonalPattern | undefined {
    if (dataPoints.length < 48) return undefined;

    const values = dataPoints.map((p) => p.value);
    const timestamps = dataPoints.map((p) => p.timestamp);
    const hourMs = 60 * 60 * 1000;

    let dailyCorrelation = 0;
    let count = 0;
    for (let i = 0; i < values.length - 24; i++) {
      const lag = Math.round((timestamps[i + 24] - timestamps[i]) / hourMs);
      if (Math.abs(lag - 24) < 2) {
        dailyCorrelation +=
          Math.abs(values[i] - values[i + 24]) < values[i] * 0.3 ? 1 : 0;
        count++;
      }
    }

    if (count > 0 && dailyCorrelation / count > 0.6) {
      const hourlyAvg = new Array(24).fill(0);
      const hourlyCount = new Array(24).fill(0);

      for (let i = 0; i < dataPoints.length; i++) {
        const hour = new Date(dataPoints[i].timestamp).getHours();
        hourlyAvg[hour] += dataPoints[i].value;
        hourlyCount[hour]++;
      }

      for (let i = 0; i < 24; i++) {
        hourlyAvg[i] = hourlyCount[i] > 0 ? hourlyAvg[i] / hourlyCount[i] : 0;
      }

      const maxHour = hourlyAvg.indexOf(Math.max(...hourlyAvg));
      const minHour = hourlyAvg.indexOf(Math.min(...hourlyAvg));

      return {
        type: "daily",
        strength: dailyCorrelation / count,
        peakTimes: [maxHour],
        troughTimes: [minHour],
      };
    }

    return undefined;
  }

  private calculateAnomalyProbability(dataPoints: MetricDataPoint[]): number {
    if (dataPoints.length < 5) return 0;

    const values = dataPoints.map((p) => p.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length,
    );

    const recentPoints = values.slice(-5);
    let anomalyScore = 0;

    for (const value of recentPoints) {
      const zScore = std > 0 ? Math.abs(value - mean) / std : 0;
      if (zScore > 2) anomalyScore += 0.2;
      if (zScore > 3) anomalyScore += 0.3;
    }

    return Math.min(1, anomalyScore);
  }

  private calculateConfidenceInterval(
    forecast: ForecastPoint[],
    historicalData: MetricDataPoint[],
  ): { lower: number[]; upper: number[] } {
    const values = historicalData.map((p) => p.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length,
    );

    const lower: number[] = [];
    const upper: number[] = [];

    for (let i = 0; i < forecast.length; i++) {
      const widthFactor = 1 + i * 0.1;
      lower.push(Math.max(0, forecast[i].value - 1.96 * std * widthFactor));
      upper.push(forecast[i].value + 1.96 * std * widthFactor);
    }

    return { lower, upper };
  }

  private calculatePredictionConfidence(
    historicalData: MetricDataPoint[],
    forecast: ForecastPoint[],
  ): number {
    if (historicalData.length < 10) return 0.5;

    const dataConfidence = Math.min(1, historicalData.length / 100);
    const values = historicalData.map((p) => p.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const cv =
      mean > 0
        ? Math.sqrt(
            values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length,
          ) / mean
        : 1;
    const volatilityPenalty = Math.max(0, 1 - cv);
    const avgForecastConfidence =
      forecast.length > 0
        ? forecast.reduce((sum, f) => sum + f.confidence, 0) / forecast.length
        : 0.5;

    return (
      dataConfidence * 0.3 +
      volatilityPenalty * 0.3 +
      avgForecastConfidence * 0.4
    );
  }

  private predictThresholdBreach(
    forecast: ForecastPoint[],
    thresholds?: { warning?: number; critical?: number },
  ): Prediction["predictedBreach"] | undefined {
    if (!thresholds || forecast.length === 0) return undefined;

    if (thresholds.critical !== undefined) {
      for (let i = 0; i < forecast.length; i++) {
        if (forecast[i].value >= thresholds.critical) {
          return {
            type: "critical",
            estimatedTime: forecast[i].timestamp,
            probability: forecast[i].confidence,
          };
        }
      }
    }

    if (thresholds.warning !== undefined) {
      for (let i = 0; i < forecast.length; i++) {
        if (forecast[i].value >= thresholds.warning) {
          return {
            type: "warning",
            estimatedTime: forecast[i].timestamp,
            probability: forecast[i].confidence,
          };
        }
      }
    }

    return undefined;
  }

  private evaluateAlertRules(
    prediction: Prediction,
    metric: MetricSeries,
  ): void {
    const rules = this.listRules(metric.id).filter((r) => r.enabled);

    for (const rule of rules) {
      if (rule.lastTriggered && now() - rule.lastTriggered < rule.cooldownMs)
        continue;

      const shouldAlert = this.evaluateCondition(
        rule.condition,
        prediction,
        metric,
      );

      if (shouldAlert) {
        this.createAlert(rule, prediction, metric);
        rule.lastTriggered = now();
      }
    }

    if (
      prediction.predictedBreach &&
      prediction.predictedBreach.probability >= this.config.confidenceThreshold
    ) {
      this.createBreachAlert(prediction, metric);
    }

    if (prediction.anomalyProbability >= this.config.confidenceThreshold) {
      this.createAnomalyAlert(prediction, metric);
    }
  }

  private evaluateCondition(
    condition: AlertCondition,
    prediction: Prediction,
    metric: MetricSeries,
  ): boolean {
    const latestValue =
      metric.dataPoints.length > 0
        ? metric.dataPoints[metric.dataPoints.length - 1].value
        : 0;

    const forecastValue =
      prediction.forecast.length > 0
        ? prediction.forecast[0].value
        : latestValue;

    const value = condition.type === "forecast" ? forecastValue : latestValue;

    switch (condition.operator) {
      case "gt":
        return value > condition.value;
      case "gte":
        return value >= condition.value;
      case "lt":
        return value < condition.value;
      case "lte":
        return value <= condition.value;
      case "eq":
        return Math.abs(value - condition.value) < 0.001;
      default:
        return false;
    }
  }

  private createAlert(
    rule: AlertRule,
    prediction: Prediction,
    metric: MetricSeries,
  ): void {
    const alert: PredictiveAlert = {
      id: generateEventId(),
      type: this.determineAlertType(metric.type),
      severity: rule.severity,
      predictionId: prediction.id,
      metricId: metric.id,
      metricName: metric.name,
      message: `Alert: ${rule.name} triggered for ${metric.name}`,
      description: `The metric ${metric.name} has triggered rule "${rule.name}"`,
      impact: {
        type: this.getImpactType(metric.type),
        severity:
          rule.severity === "critical"
            ? "high"
            : rule.severity === "warning"
              ? "medium"
              : "low",
        estimatedTime: prediction.forecast[0]?.timestamp ?? now(),
      },
      remediation: this.config.enableRemediation
        ? this.generateRemediation(metric.type, prediction)
        : undefined,
      status: "active",
      createdAt: now(),
    };

    this.alerts.set(alert.id, alert);
    if (this.config.onAlert) this.config.onAlert(alert);
  }

  private createBreachAlert(
    prediction: Prediction,
    metric: MetricSeries,
  ): void {
    const breach = prediction.predictedBreach!;

    const alert: PredictiveAlert = {
      id: generateEventId(),
      type: this.determineAlertType(metric.type),
      severity: breach.type,
      predictionId: prediction.id,
      metricId: metric.id,
      metricName: metric.name,
      message: `Predicted ${breach.type} threshold breach for ${metric.name}`,
      description: `${metric.name} is predicted to breach ${breach.type} threshold`,
      impact: {
        type: this.getImpactType(metric.type),
        severity: breach.type === "critical" ? "high" : "medium",
        estimatedTime: breach.estimatedTime,
      },
      remediation: this.config.enableRemediation
        ? this.generateRemediation(metric.type, prediction)
        : undefined,
      status: "active",
      createdAt: now(),
    };

    this.alerts.set(alert.id, alert);
    if (this.config.onAlert) this.config.onAlert(alert);
  }

  private createAnomalyAlert(
    prediction: Prediction,
    metric: MetricSeries,
  ): void {
    const alert: PredictiveAlert = {
      id: generateEventId(),
      type: "anomaly_detected",
      severity: prediction.anomalyProbability > 0.8 ? "warning" : "info",
      predictionId: prediction.id,
      metricId: metric.id,
      metricName: metric.name,
      message: `Anomaly detected in ${metric.name}`,
      description: `Unusual pattern detected with ${Math.round(prediction.anomalyProbability * 100)}% probability`,
      impact: {
        type: this.getImpactType(metric.type),
        severity: "medium",
        estimatedTime: now(),
      },
      status: "active",
      createdAt: now(),
    };

    this.alerts.set(alert.id, alert);
    if (this.config.onAlert) this.config.onAlert(alert);
  }

  private determineAlertType(metricType: MetricType): AlertType {
    switch (metricType) {
      case "cost":
        return "cost_overrun";
      case "latency":
        return "latency_spike";
      case "error_rate":
        return "error_rate_increase";
      case "quality_score":
        return "quality_degradation";
      case "throughput":
        return "capacity_limit";
      default:
        return "anomaly_detected";
    }
  }

  private getImpactType(
    metricType: MetricType,
  ): PredictiveAlert["impact"]["type"] {
    switch (metricType) {
      case "cost":
        return "cost";
      case "latency":
      case "throughput":
        return "performance";
      case "quality_score":
        return "quality";
      default:
        return "availability";
    }
  }

  private generateRemediation(
    metricType: MetricType,
    prediction: Prediction,
  ): AlertRemediation {
    const actions: RemediationAction[] = [];

    switch (metricType) {
      case "cost":
        actions.push({
          id: generateEventId(),
          action: "Switch to cost-efficient model",
          description: "Consider using gpt-3.5-turbo for simpler queries",
          automated: false,
        });
        break;
      case "latency":
        actions.push({
          id: generateEventId(),
          action: "Enable streaming",
          description: "Use streaming responses for better latency",
          automated: true,
        });
        break;
      case "error_rate":
        actions.push({
          id: generateEventId(),
          action: "Implement retry logic",
          description: "Add exponential backoff retry",
          automated: true,
        });
        break;
      default:
        actions.push({
          id: generateEventId(),
          action: "Investigate metric",
          description: "Manual investigation recommended",
          automated: false,
        });
    }

    return {
      type: actions.some((a) => a.automated) ? "automatic" : "manual",
      actions,
      estimatedImpact: `Expected ${prediction.trend === "increasing" ? "improvement" : "stabilization"}`,
      risk: "low",
    };
  }
}
