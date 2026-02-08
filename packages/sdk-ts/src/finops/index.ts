/**
 * AgentOps SDK - Cost Intelligence & FinOps Module
 *
 * Advanced cost intelligence engine with trend analysis, forecasting,
 * anomaly detection, model comparison, and financial operations reporting.
 */

import { nanoid } from "nanoid";

import type {
  CostDataPoint,
  CostTrend,
  CostForecast,
  ModelComparison,
  CachingOpportunity,
  TokenOptimization,
  CostAllocationReport,
  BudgetAlert,
  CostAnomaly,
  FinOpsConfig,
  FinOpsDashboard,
  CostSummary,
} from "./types.js";

// Re-export all types
export type {
  CostDataPoint,
  CostTrend,
  CostForecast,
  ModelComparison,
  CachingOpportunity,
  TokenOptimization,
  CostAllocationReport,
  BudgetAlert as FinOpsBudgetAlert,
  CostAnomaly,
  FinOpsConfig,
  FinOpsDashboard,
  CostSummary as FinOpsCostSummary,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

const DEFAULT_ANOMALY_THRESHOLD = 2;
const DEFAULT_BUDGET_ALERT_THRESHOLDS = [50, 75, 90, 100];
const DEFAULT_FORECAST_HORIZON = 30;

// ============================================================================
// CostIntelligenceEngine
// ============================================================================

/**
 * Advanced cost intelligence engine that provides trend analysis, forecasting,
 * anomaly detection, model comparison, and optimization suggestions.
 *
 * @example
 * ```typescript
 * const engine = new CostIntelligenceEngine({ trackingEnabled: true });
 *
 * engine.recordCost({
 *   timestamp: Date.now(),
 *   model: 'gpt-4',
 *   tokens: { input: 500, output: 200 },
 *   cost: 0.025,
 *   feature: 'chat',
 *   userId: 'user-1',
 * });
 *
 * const dashboard = engine.getDashboard();
 * const anomalies = engine.detectAnomalies();
 * const forecast = engine.forecastMonthEnd();
 * ```
 */
export class CostIntelligenceEngine {
  private readonly config: Required<FinOpsConfig>;
  private readonly dataPoints: CostDataPoint[] = [];

  constructor(config: FinOpsConfig) {
    this.config = {
      trackingEnabled: config.trackingEnabled,
      forecastHorizon: config.forecastHorizon ?? DEFAULT_FORECAST_HORIZON,
      anomalyThreshold: config.anomalyThreshold ?? DEFAULT_ANOMALY_THRESHOLD,
      budgetAlertThresholds:
        config.budgetAlertThresholds ?? DEFAULT_BUDGET_ALERT_THRESHOLDS,
    };
  }

  // ==========================================================================
  // Recording
  // ==========================================================================

  /**
   * Record a single cost data point.
   */
  recordCost(dataPoint: CostDataPoint): void {
    if (!this.config.trackingEnabled) return;
    this.dataPoints.push({ ...dataPoint });
  }

  /**
   * Record multiple cost data points.
   */
  recordBatch(dataPoints: CostDataPoint[]): void {
    if (!this.config.trackingEnabled) return;
    for (const dp of dataPoints) {
      this.dataPoints.push({ ...dp });
    }
  }

  // ==========================================================================
  // Trends
  // ==========================================================================

  /**
   * Compute a cost trend for a given period, optionally filtered by model/feature.
   */
  getTrend(
    period: CostTrend["period"],
    model?: string,
    feature?: string,
  ): CostTrend {
    const filtered = this.dataPoints.filter((dp) => {
      if (model && dp.model !== model) return false;
      if (feature && dp.feature !== feature) return false;
      return true;
    });

    const bucketMs = this.periodToMs(period);
    const buckets = new Map<number, { cost: number; tokens: number }>();

    for (const dp of filtered) {
      const bucketKey = Math.floor(dp.timestamp / bucketMs) * bucketMs;
      const existing = buckets.get(bucketKey);
      if (existing) {
        existing.cost += dp.cost;
        existing.tokens += dp.tokens.input + dp.tokens.output;
      } else {
        buckets.set(bucketKey, {
          cost: dp.cost,
          tokens: dp.tokens.input + dp.tokens.output,
        });
      }
    }

    const dataPoints = Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([timestamp, data]) => ({
        timestamp,
        cost: data.cost,
        tokens: data.tokens,
      }));

    const costPoints = dataPoints.map((dp, i) => ({ x: i, y: dp.cost }));
    const regression = this.linearRegression(costPoints);

    const projection =
      costPoints.length > 0
        ? regression.slope * costPoints.length + regression.intercept
        : 0;

    return {
      period,
      dataPoints,
      slope: regression.slope,
      projection: Math.max(0, projection),
    };
  }

  /**
   * Get trends for all models in the given period.
   */
  getTrends(period: CostTrend["period"]): CostTrend[] {
    const models = new Set(this.dataPoints.map((dp) => dp.model));
    return Array.from(models).map((model) => this.getTrend(period, model));
  }

  // ==========================================================================
  // Forecasting
  // ==========================================================================

  /**
   * Forecast costs for the next N days, optionally filtered by model.
   * Uses linear regression combined with seasonality detection.
   */
  forecast(days: number, model?: string): CostForecast {
    const filtered = model
      ? this.dataPoints.filter((dp) => dp.model === model)
      : this.dataPoints;

    // Aggregate daily costs
    const dailyBuckets = new Map<number, number>();
    for (const dp of filtered) {
      const dayKey = Math.floor(dp.timestamp / MS_PER_DAY) * MS_PER_DAY;
      dailyBuckets.set(dayKey, (dailyBuckets.get(dayKey) ?? 0) + dp.cost);
    }

    const sortedDays = Array.from(dailyBuckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([timestamp, cost]) => ({ timestamp, cost }));

    const costPoints = sortedDays.map((d, i) => ({ x: i, y: d.cost }));
    const regression = this.linearRegression(costPoints);
    const seasonality = this.computeSeasonality(
      sortedDays.map((d) => ({ x: d.timestamp, y: d.cost })),
    );

    // Project forward
    let projectedCost = 0;
    const n = costPoints.length;
    for (let d = 0; d < days; d++) {
      const baselineValue = regression.slope * (n + d) + regression.intercept;
      const seasonalFactor =
        seasonality.length > 0 ? seasonality[(n + d) % seasonality.length] : 1;
      projectedCost += Math.max(0, baselineValue * seasonalFactor);
    }

    // Compute confidence interval using residual standard error
    const residuals = costPoints.map(
      (p) => p.y - (regression.slope * p.x + regression.intercept),
    );
    const residualMean =
      residuals.length > 0
        ? residuals.reduce((s, r) => s + r, 0) / residuals.length
        : 0;
    const residualStd =
      residuals.length > 1
        ? Math.sqrt(
            residuals.reduce((s, r) => s + (r - residualMean) ** 2, 0) /
              (residuals.length - 1),
          )
        : 0;

    // 95% confidence: ~1.96 standard deviations scaled by sqrt(days)
    const marginOfError = 1.96 * residualStd * Math.sqrt(days);
    const now = Date.now();

    const basis: CostForecast["basis"] =
      seasonality.length > 0 ? "seasonal" : "linear";

    return {
      periodStart: now,
      periodEnd: now + days * MS_PER_DAY,
      projectedCost: Math.max(0, projectedCost),
      lowerBound: Math.max(0, projectedCost - marginOfError),
      upperBound: projectedCost + marginOfError,
      confidence: 0.95,
      model: model ?? "all",
      basis,
    };
  }

  /**
   * Project cost to the end of the current month.
   */
  forecastMonthEnd(): CostForecast {
    const now = new Date();
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const daysRemaining = Math.max(
      1,
      Math.ceil((endOfMonth.getTime() - now.getTime()) / MS_PER_DAY),
    );
    return this.forecast(daysRemaining);
  }

  // ==========================================================================
  // Analysis
  // ==========================================================================

  /**
   * Detect cost anomalies using z-score analysis.
   *
   * @param lookbackDays - Number of days to analyze (default: 30)
   * @returns Array of detected anomalies
   */
  detectAnomalies(lookbackDays: number = 30): CostAnomaly[] {
    const cutoff = Date.now() - lookbackDays * MS_PER_DAY;
    const recent = this.dataPoints.filter((dp) => dp.timestamp >= cutoff);

    // Aggregate daily costs per model
    const dailyByModel = new Map<string, Map<number, number>>();
    for (const dp of recent) {
      if (!dailyByModel.has(dp.model)) {
        dailyByModel.set(dp.model, new Map());
      }
      const modelDays = dailyByModel.get(dp.model)!;
      const dayKey = Math.floor(dp.timestamp / MS_PER_DAY) * MS_PER_DAY;
      modelDays.set(dayKey, (modelDays.get(dayKey) ?? 0) + dp.cost);
    }

    const anomalies: CostAnomaly[] = [];

    for (const [model, dayMap] of dailyByModel) {
      const costs = Array.from(dayMap.values());
      if (costs.length < 3) continue; // Need at least 3 data points

      const mean = costs.reduce((s, c) => s + c, 0) / costs.length;
      const stdDev = Math.sqrt(
        costs.reduce((s, c) => s + (c - mean) ** 2, 0) / costs.length,
      );

      if (stdDev === 0) continue;

      for (const [dayTs, dayCost] of dayMap) {
        const z = this.zScore(dayCost, mean, stdDev);
        if (Math.abs(z) >= this.config.anomalyThreshold) {
          const severity: CostAnomaly["severity"] =
            Math.abs(z) >= 4 ? "high" : Math.abs(z) >= 3 ? "medium" : "low";

          anomalies.push({
            id: nanoid(),
            timestamp: dayTs,
            expectedCost: mean,
            actualCost: dayCost,
            deviation: z,
            model,
            severity,
          });
        }
      }
    }

    return anomalies.sort(
      (a, b) => Math.abs(b.deviation) - Math.abs(a.deviation),
    );
  }

  /**
   * Compare two models based on cost, quality (tokens per cost), and throughput.
   */
  compareModels(modelA: string, modelB: string): ModelComparison {
    const dataA = this.dataPoints.filter((dp) => dp.model === modelA);
    const dataB = this.dataPoints.filter((dp) => dp.model === modelB);

    const avgCostA =
      dataA.length > 0
        ? dataA.reduce((s, dp) => s + dp.cost, 0) / dataA.length
        : 0;
    const avgCostB =
      dataB.length > 0
        ? dataB.reduce((s, dp) => s + dp.cost, 0) / dataB.length
        : 0;

    const avgTokensA =
      dataA.length > 0
        ? dataA.reduce((s, dp) => s + dp.tokens.input + dp.tokens.output, 0) /
          dataA.length
        : 0;
    const avgTokensB =
      dataB.length > 0
        ? dataB.reduce((s, dp) => s + dp.tokens.input + dp.tokens.output, 0) /
          dataB.length
        : 0;

    // Quality proxy: output tokens per dollar (more output per dollar = higher quality/value)
    const qualityA = avgCostA > 0 ? avgTokensA / avgCostA : 0;
    const qualityB = avgCostB > 0 ? avgTokensB / avgCostB : 0;
    const qualityDiff = qualityB - qualityA;

    const costDiff = avgCostB - avgCostA;

    // Latency proxy: tokens per request (higher = slower assumed)
    const latencyDiff = avgTokensB - avgTokensA;

    // Determine recommendation
    let recommendation: ModelComparison["recommendation"];
    let rationale: string;

    if (costDiff < 0 && qualityDiff >= 0) {
      recommendation = "switch";
      rationale = `${modelB} is cheaper and provides equal or better value per dollar than ${modelA}.`;
    } else if (costDiff > 0 && qualityDiff <= 0) {
      recommendation = "stay";
      rationale = `${modelA} is cheaper and provides equal or better value per dollar than ${modelB}.`;
    } else if (Math.abs(costDiff) / Math.max(avgCostA, avgCostB, 0.001) < 0.1) {
      recommendation = "stay";
      rationale = `Cost difference between ${modelA} and ${modelB} is negligible (< 10%).`;
    } else {
      recommendation = "test";
      rationale = `Trade-offs exist between ${modelA} and ${modelB}. Run an A/B test to validate.`;
    }

    return {
      modelA,
      modelB,
      qualityDiff,
      costDiff,
      latencyDiff,
      recommendation,
      rationale,
    };
  }

  /**
   * Analyze repeated prompt patterns to identify caching opportunities.
   */
  findCachingOpportunities(): CachingOpportunity[] {
    // Hash input token patterns (using model + approximate token count as proxy)
    const patternCounts = new Map<
      string,
      { count: number; totalCost: number; avgCost: number }
    >();

    for (const dp of this.dataPoints) {
      const hash = this.hashContent(
        `${dp.model}:${dp.tokens.input}:${dp.feature ?? "unknown"}`,
      );
      const existing = patternCounts.get(hash);
      if (existing) {
        existing.count += 1;
        existing.totalCost += dp.cost;
        existing.avgCost = existing.totalCost / existing.count;
      } else {
        patternCounts.set(hash, {
          count: 1,
          totalCost: dp.cost,
          avgCost: dp.cost,
        });
      }
    }

    const opportunities: CachingOpportunity[] = [];

    for (const [pattern, stats] of patternCounts) {
      if (stats.count < 3) continue; // Only flag patterns seen 3+ times

      // Estimate: caching could save cost for all but the first occurrence
      const cacheHitRate = (stats.count - 1) / stats.count;
      const estimatedSavings = stats.avgCost * (stats.count - 1) * 0.9; // 90% savings on cached

      opportunities.push({
        id: nanoid(),
        pattern,
        frequency: stats.count,
        estimatedSavings,
        cacheHitRate,
        recommendation:
          stats.count >= 10
            ? "Strongly recommend caching. This pattern repeats frequently."
            : `Consider caching. Pattern seen ${stats.count} times.`,
      });
    }

    return opportunities.sort(
      (a, b) => b.estimatedSavings - a.estimatedSavings,
    );
  }

  /**
   * Suggest token optimizations based on usage patterns.
   */
  suggestTokenOptimizations(): TokenOptimization[] {
    const optimizations: TokenOptimization[] = [];

    // Analyze by model to find optimization opportunities
    const byModel = new Map<
      string,
      { totalInput: number; totalOutput: number; count: number }
    >();

    for (const dp of this.dataPoints) {
      const existing = byModel.get(dp.model);
      if (existing) {
        existing.totalInput += dp.tokens.input;
        existing.totalOutput += dp.tokens.output;
        existing.count += 1;
      } else {
        byModel.set(dp.model, {
          totalInput: dp.tokens.input,
          totalOutput: dp.tokens.output,
          count: 1,
        });
      }
    }

    for (const [model, stats] of byModel) {
      const avgInput = stats.totalInput / stats.count;
      const avgOutput = stats.totalOutput / stats.count;
      const ratio = avgInput / Math.max(avgOutput, 1);

      // System prompt optimization: if input tokens are very high relative to output
      if (ratio > 5 && avgInput > 1000) {
        const optimizedTokens = Math.round(avgInput * 0.6);
        optimizations.push({
          id: nanoid(),
          type: "system_prompt",
          description: `Model "${model}" uses ${Math.round(avgInput)} avg input tokens with only ${Math.round(avgOutput)} avg output tokens. Consider compressing the system prompt.`,
          currentTokens: Math.round(avgInput),
          optimizedTokens,
          savingsPercent: Math.round(
            ((avgInput - optimizedTokens) / avgInput) * 100,
          ),
          risk: "medium",
        });
      }

      // Context window optimization: if average input is very large
      if (avgInput > 4000) {
        const optimizedTokens = Math.round(avgInput * 0.5);
        optimizations.push({
          id: nanoid(),
          type: "context_window",
          description: `Model "${model}" averages ${Math.round(avgInput)} input tokens. Consider pruning context or using summarization.`,
          currentTokens: Math.round(avgInput),
          optimizedTokens,
          savingsPercent: Math.round(
            ((avgInput - optimizedTokens) / avgInput) * 100,
          ),
          risk: "medium",
        });
      }

      // Response format optimization: if output is very large
      if (avgOutput > 2000) {
        const optimizedTokens = Math.round(avgOutput * 0.7);
        optimizations.push({
          id: nanoid(),
          type: "response_format",
          description: `Model "${model}" averages ${Math.round(avgOutput)} output tokens. Consider structured output or limiting response length.`,
          currentTokens: Math.round(avgOutput),
          optimizedTokens,
          savingsPercent: Math.round(
            ((avgOutput - optimizedTokens) / avgOutput) * 100,
          ),
          risk: "low",
        });
      }

      // Few-shot reduction: if input is high and count is high (likely few-shot)
      if (avgInput > 2000 && stats.count > 10) {
        const optimizedTokens = Math.round(avgInput * 0.4);
        optimizations.push({
          id: nanoid(),
          type: "few_shot_reduction",
          description: `Model "${model}" has high input tokens across ${stats.count} requests. Consider reducing few-shot examples or using fine-tuning.`,
          currentTokens: Math.round(avgInput),
          optimizedTokens,
          savingsPercent: Math.round(
            ((avgInput - optimizedTokens) / avgInput) * 100,
          ),
          risk: "high",
        });
      }
    }

    return optimizations.sort((a, b) => b.savingsPercent - a.savingsPercent);
  }

  // ==========================================================================
  // Reporting
  // ==========================================================================

  /**
   * Generate a cost allocation report for a given period label.
   */
  generateAllocationReport(period: string): CostAllocationReport {
    const allocator = new CostAllocator();
    return allocator.generateReport(this.dataPoints, period);
  }

  /**
   * Generate a full FinOps dashboard.
   */
  getDashboard(): FinOpsDashboard {
    const summary = this.computeSummary();
    const trends = [
      this.getTrend("daily"),
      this.getTrend("weekly"),
      this.getTrend("monthly"),
    ];
    const forecasts = this.computeForecasts();
    const anomalies = this.detectAnomalies();
    const optimizations = this.suggestTokenOptimizations();
    const modelComparisons = this.computeModelComparisons();

    return {
      summary,
      trends,
      forecasts,
      anomalies,
      optimizations,
      modelComparisons,
    };
  }

  /**
   * Check budget thresholds and return any triggered alerts.
   *
   * @param budget - Total budget in USD. If not provided, returns an empty array.
   */
  getAlerts(budget?: number): BudgetAlert[] {
    if (budget === undefined || budget <= 0) return [];

    const totalSpend = this.dataPoints.reduce((s, dp) => s + dp.cost, 0);
    const percentUsed = (totalSpend / budget) * 100;

    const alerts: BudgetAlert[] = [];

    for (const threshold of this.config.budgetAlertThresholds) {
      if (percentUsed >= threshold) {
        const severity: BudgetAlert["severity"] =
          threshold >= 100 ? "critical" : threshold >= 90 ? "warning" : "info";

        alerts.push({
          id: nanoid(),
          type: "threshold",
          severity,
          message: `Spending has reached ${percentUsed.toFixed(1)}% of budget ($${totalSpend.toFixed(2)} / $${budget.toFixed(2)}). Threshold: ${threshold}%.`,
          currentSpend: totalSpend,
          threshold: budget * (threshold / 100),
          triggeredAt: Date.now(),
        });
      }
    }

    // Add forecast-based alert
    const monthEnd = this.forecastMonthEnd();
    if (monthEnd.projectedCost > budget) {
      alerts.push({
        id: nanoid(),
        type: "forecast",
        severity: "warning",
        message: `Projected month-end cost ($${monthEnd.projectedCost.toFixed(2)}) exceeds budget ($${budget.toFixed(2)}).`,
        currentSpend: totalSpend,
        threshold: budget,
        triggeredAt: Date.now(),
      });
    }

    // Add anomaly-based alerts
    const anomalies = this.detectAnomalies(7);
    for (const anomaly of anomalies) {
      if (anomaly.severity === "high") {
        alerts.push({
          id: nanoid(),
          type: "anomaly",
          severity: "warning",
          message: `Cost anomaly detected for ${anomaly.model ?? "unknown model"}: expected $${anomaly.expectedCost.toFixed(2)}, actual $${anomaly.actualCost.toFixed(2)} (${anomaly.deviation.toFixed(1)} std devs).`,
          currentSpend: totalSpend,
          triggeredAt: anomaly.timestamp,
        });
      }
    }

    return alerts;
  }

  // ==========================================================================
  // Private: Statistical Methods
  // ==========================================================================

  /**
   * Compute linear regression (ordinary least squares) over a set of points.
   * Returns slope and intercept.
   */
  private linearRegression(points: Array<{ x: number; y: number }>): {
    slope: number;
    intercept: number;
  } {
    const n = points.length;
    if (n === 0) return { slope: 0, intercept: 0 };
    if (n === 1) return { slope: 0, intercept: points[0].y };

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumXX += p.x * p.x;
    }

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return { slope: 0, intercept: sumY / n };

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  /**
   * Compute the z-score of a value given mean and standard deviation.
   */
  private zScore(value: number, mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }

  /**
   * Detect daily/weekly seasonality patterns.
   * Returns an array of seasonal multipliers (one per cycle position).
   */
  private computeSeasonality(
    points: Array<{ x: number; y: number }>,
  ): number[] {
    if (points.length < 14) return []; // Need at least 2 weeks for weekly seasonality

    // Try weekly seasonality (7-day cycle)
    const cyclePeriod = 7;
    const cycleBuckets: number[][] = Array.from(
      { length: cyclePeriod },
      () => [],
    );

    // Group values by day-of-week position
    const globalMean = points.reduce((s, p) => s + p.y, 0) / points.length;

    for (let i = 0; i < points.length; i++) {
      const cyclePos = i % cyclePeriod;
      cycleBuckets[cyclePos].push(points[i].y);
    }

    const seasonalFactors = cycleBuckets.map((bucket) => {
      if (bucket.length === 0 || globalMean === 0) return 1;
      const bucketMean = bucket.reduce((s, v) => s + v, 0) / bucket.length;
      return bucketMean / globalMean;
    });

    // Check if there's meaningful seasonality (variance of factors > threshold)
    const factorMean =
      seasonalFactors.reduce((s, f) => s + f, 0) / seasonalFactors.length;
    const factorVariance =
      seasonalFactors.reduce((s, f) => s + (f - factorMean) ** 2, 0) /
      seasonalFactors.length;

    // If variance is too low, no meaningful seasonality
    if (factorVariance < 0.01) return [];

    return seasonalFactors;
  }

  /**
   * Simple hash function for content-based caching opportunity detection.
   * Uses a djb2-style hash.
   */
  private hashContent(content: string): string {
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) + hash + content.charCodeAt(i)) & 0xffffffff;
    }
    return `pattern_${(hash >>> 0).toString(16)}`;
  }

  // ==========================================================================
  // Private: Dashboard Helpers
  // ==========================================================================

  /**
   * Compute the high-level cost summary.
   */
  private computeSummary(): CostSummary {
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ).getTime();
    const startOfPrevMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() - 1,
      1,
    ).getTime();

    const currentPeriod = this.dataPoints.filter(
      (dp) => dp.timestamp >= startOfMonth,
    );
    const previousPeriod = this.dataPoints.filter(
      (dp) => dp.timestamp >= startOfPrevMonth && dp.timestamp < startOfMonth,
    );

    const currentPeriodCost = currentPeriod.reduce((s, dp) => s + dp.cost, 0);
    const previousPeriodCost = previousPeriod.reduce((s, dp) => s + dp.cost, 0);

    const percentChange =
      previousPeriodCost > 0
        ? ((currentPeriodCost - previousPeriodCost) / previousPeriodCost) * 100
        : 0;

    // Top model
    const modelCosts = new Map<string, number>();
    for (const dp of currentPeriod) {
      modelCosts.set(dp.model, (modelCosts.get(dp.model) ?? 0) + dp.cost);
    }
    const topModel =
      Array.from(modelCosts.entries()).sort(([, a], [, b]) => b - a)[0]?.[0] ??
      "none";

    // Top feature
    const featureCosts = new Map<string, number>();
    for (const dp of currentPeriod) {
      const feature = dp.feature ?? "unknown";
      featureCosts.set(feature, (featureCosts.get(feature) ?? 0) + dp.cost);
    }
    const topFeature =
      Array.from(featureCosts.entries()).sort(
        ([, a], [, b]) => b - a,
      )[0]?.[0] ?? "none";

    // Projected month-end
    const monthEndForecast = this.forecastMonthEnd();

    return {
      currentPeriodCost,
      previousPeriodCost,
      percentChange,
      topModel,
      topFeature,
      projectedMonthEnd: currentPeriodCost + monthEndForecast.projectedCost,
    };
  }

  /**
   * Compute forecasts for each model.
   */
  private computeForecasts(): CostForecast[] {
    const models = new Set(this.dataPoints.map((dp) => dp.model));
    const forecasts: CostForecast[] = [
      this.forecast(this.config.forecastHorizon),
    ];
    for (const model of models) {
      forecasts.push(this.forecast(this.config.forecastHorizon, model));
    }
    return forecasts;
  }

  /**
   * Compute pairwise model comparisons for all models with data.
   */
  private computeModelComparisons(): ModelComparison[] {
    const models = Array.from(new Set(this.dataPoints.map((dp) => dp.model)));
    const comparisons: ModelComparison[] = [];

    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        comparisons.push(this.compareModels(models[i], models[j]));
      }
    }

    return comparisons;
  }

  // ==========================================================================
  // Private: Period Helpers
  // ==========================================================================

  private periodToMs(period: CostTrend["period"]): number {
    switch (period) {
      case "hourly":
        return MS_PER_HOUR;
      case "daily":
        return MS_PER_DAY;
      case "weekly":
        return MS_PER_WEEK;
      case "monthly":
        return 30 * MS_PER_DAY;
    }
  }
}

// ============================================================================
// CostAllocator
// ============================================================================

/**
 * Allocates costs across dimensions (model, feature, user) and generates
 * allocation reports.
 *
 * @example
 * ```typescript
 * const allocator = new CostAllocator();
 * const byModel = allocator.allocate(costs, 'model');
 * const topSpenders = allocator.topK(costs, 'user', 5);
 * const report = allocator.generateReport(costs, '2025-01');
 * ```
 */
export class CostAllocator {
  /**
   * Allocate costs by a given dimension.
   *
   * @param costs - Array of cost data points
   * @param dimension - Dimension to group by
   * @returns Record mapping dimension values to total cost
   */
  allocate(
    costs: CostDataPoint[],
    dimension: "model" | "feature" | "user",
  ): Record<string, number> {
    const result: Record<string, number> = {};

    for (const dp of costs) {
      const key = this.getDimensionValue(dp, dimension);
      result[key] = (result[key] ?? 0) + dp.cost;
    }

    return result;
  }

  /**
   * Return the top K spenders for a given dimension.
   *
   * @param costs - Array of cost data points
   * @param dimension - Dimension to rank by
   * @param k - Number of top entries to return
   * @returns Record of top K dimension values and their costs
   */
  topK(
    costs: CostDataPoint[],
    dimension: "model" | "feature" | "user",
    k: number,
  ): Record<string, number> {
    const allocation = this.allocate(costs, dimension);
    const sorted = Object.entries(allocation).sort(([, a], [, b]) => b - a);
    const topEntries = sorted.slice(0, k);

    const result: Record<string, number> = {};
    for (const [key, value] of topEntries) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Generate a full cost allocation report.
   *
   * @param costs - Array of cost data points
   * @param period - Period label (e.g., "2025-01")
   * @returns Complete allocation report
   */
  generateReport(costs: CostDataPoint[], period: string): CostAllocationReport {
    const totalCost = costs.reduce((s, dp) => s + dp.cost, 0);
    const byModel = this.allocate(costs, "model");
    const byFeature = this.allocate(costs, "feature");
    const byUser = this.allocate(costs, "user");

    return {
      period,
      totalCost,
      byModel,
      byFeature,
      byUser,
    };
  }

  /**
   * Extract the value for a dimension from a data point.
   */
  private getDimensionValue(
    dp: CostDataPoint,
    dimension: "model" | "feature" | "user",
  ): string {
    switch (dimension) {
      case "model":
        return dp.model;
      case "feature":
        return dp.feature ?? "unknown";
      case "user":
        return dp.userId ?? "unknown";
    }
  }
}
