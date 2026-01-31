/**
 * AgentOps SDK - Budget Manager
 *
 * Cost tracking, forecasting, and budget management.
 */

import type {
  Budget,
  BudgetAlert,
  AlertThreshold,
  CostForecast,
  CostRecord,
  CostSummary,
  BudgetConfig,
} from "./types.js";
import { generateEventId, now } from "../utils.js";

// Model pricing (USD per 1K tokens) - inline to avoid external dependency
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "gpt-5": { input: 0.005, output: 0.015 },
  "gpt-5-mini": { input: 0.001, output: 0.003 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  "claude-3-5-haiku-20241022": { input: 0.001, output: 0.005 },
  "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
  "claude-sonnet-4": { input: 0.003, output: 0.015 },
  "claude-haiku-4": { input: 0.0008, output: 0.004 },
  "claude-opus-4": { input: 0.015, output: 0.075 },
  unknown: { input: 0.001, output: 0.002 },
};

function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): { inputCost: number; outputCost: number; totalCost: number } {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["unknown"];
  const inputCost = (promptTokens / 1000) * pricing.input;
  const outputCost = (completionTokens / 1000) * pricing.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

export class BudgetManager {
  private readonly config: BudgetConfig;
  private budgets: Map<string, Budget> = new Map();
  private costRecords: CostRecord[] = [];
  private alerts: BudgetAlert[] = [];
  private forecasts: Map<string, CostForecast> = new Map();

  constructor(config: BudgetConfig) {
    this.config = {
      enabled: config.enabled ?? false,
      budgets: config.budgets ?? [],
      enableForecasting: config.enableForecasting ?? true,
      forecastInterval: config.forecastInterval ?? 3600000, // 1 hour
      costMethod: config.costMethod ?? "estimated",
      onAlert: config.onAlert,
      onBudgetExceeded: config.onBudgetExceeded,
      onThrottleCheck: config.onThrottleCheck,
    };

    // Load initial budgets
    for (const budget of this.config.budgets ?? []) {
      this.budgets.set(budget.id, budget);
    }
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  // =========================================================================
  // Budget Management
  // =========================================================================

  /**
   * Create a new budget
   */
  createBudget(
    name: string,
    amount: number,
    period: Budget["period"],
    scope: Budget["scope"],
    options?: {
      alertThresholds?: number[];
      overageAction?: Budget["overageAction"];
      softLimit?: number;
      hardLimit?: number;
    },
  ): Budget {
    const id = generateEventId();
    const timestamp = now();
    const { periodStart, periodEnd } = this.calculatePeriodBounds(
      period,
      timestamp,
    );

    const alertThresholds: AlertThreshold[] = (
      options?.alertThresholds ?? [80, 90, 100]
    ).map((pct) => ({
      percentage: pct,
      triggered: false,
      notifyChannels: ["email"],
    }));

    const budget: Budget = {
      id,
      name,
      amount,
      period,
      periodStart,
      periodEnd,
      currentSpend: 0,
      active: true,
      scope,
      alertThresholds,
      overageAction: options?.overageAction ?? "warn",
      softLimit: options?.softLimit,
      hardLimit: options?.hardLimit,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.budgets.set(id, budget);

    return budget;
  }

  /**
   * Get a budget by ID
   */
  getBudget(id: string): Budget | undefined {
    return this.budgets.get(id);
  }

  /**
   * List all budgets
   */
  listBudgets(filter?: {
    scope?: Budget["scope"]["type"];
    scopeId?: string;
    active?: boolean;
  }): Budget[] {
    let budgets = Array.from(this.budgets.values());

    if (filter?.scope) {
      budgets = budgets.filter((b) => b.scope.type === filter.scope);
    }

    if (filter?.scopeId) {
      budgets = budgets.filter((b) => b.scope.id === filter.scopeId);
    }

    if (filter?.active !== undefined) {
      budgets = budgets.filter((b) => b.active === filter.active);
    }

    return budgets;
  }

  /**
   * Update budget amount
   */
  updateBudgetAmount(id: string, newAmount: number): Budget | null {
    const budget = this.budgets.get(id);
    if (!budget) return null;

    budget.amount = newAmount;
    budget.updatedAt = now();

    // Reset threshold triggers if amount increased
    for (const threshold of budget.alertThresholds) {
      if ((budget.currentSpend / newAmount) * 100 < threshold.percentage) {
        threshold.triggered = false;
      }
    }

    return budget;
  }

  /**
   * Delete a budget
   */
  deleteBudget(id: string): boolean {
    return this.budgets.delete(id);
  }

  // =========================================================================
  // Cost Tracking
  // =========================================================================

  /**
   * Record a cost
   */
  recordCost(
    record: Omit<CostRecord, "cost"> & { cost?: CostRecord["cost"] },
  ): CostRecord {
    // Calculate cost if not provided
    let cost = record.cost;
    if (!cost && this.config.costMethod === "estimated") {
      const calculated = calculateCost(
        record.model,
        record.tokens.prompt,
        record.tokens.completion,
      );
      cost = {
        input: calculated.inputCost,
        output: calculated.outputCost,
        total: calculated.totalCost,
      };
    }

    const fullRecord: CostRecord = {
      ...record,
      cost: cost ?? { input: 0, output: 0, total: 0 },
    };

    this.costRecords.push(fullRecord);

    // Update relevant budgets
    this.updateBudgetsForCost(fullRecord);

    return fullRecord;
  }

  /**
   * Get cost summary for a period
   */
  getCostSummary(startTime: number, endTime: number): CostSummary {
    const records = this.costRecords.filter(
      (r) => r.timestamp >= startTime && r.timestamp <= endTime,
    );

    const byModel: CostSummary["byModel"] = {};
    const byFeature: CostSummary["byFeature"] = {};
    const byUser: CostSummary["byUser"] = {};

    let totalCost = 0;
    let totalTokens = 0;
    const sessionIds = new Set<string>();

    for (const record of records) {
      totalCost += record.cost.total;
      totalTokens += record.tokens.total;
      sessionIds.add(record.sessionId);

      // By model
      if (!byModel[record.model]) {
        byModel[record.model] = { cost: 0, tokens: 0, sessions: 0 };
      }
      byModel[record.model].cost += record.cost.total;
      byModel[record.model].tokens += record.tokens.total;
      byModel[record.model].sessions++;

      // By feature
      if (record.featureId) {
        if (!byFeature[record.featureId]) {
          byFeature[record.featureId] = { cost: 0, tokens: 0, sessions: 0 };
        }
        byFeature[record.featureId].cost += record.cost.total;
        byFeature[record.featureId].tokens += record.tokens.total;
        byFeature[record.featureId].sessions++;
      }

      // By user
      if (record.userId) {
        if (!byUser[record.userId]) {
          byUser[record.userId] = { cost: 0, tokens: 0, sessions: 0 };
        }
        byUser[record.userId].cost += record.cost.total;
        byUser[record.userId].tokens += record.tokens.total;
        byUser[record.userId].sessions++;
      }
    }

    const totalSessions = sessionIds.size;

    return {
      period: { start: startTime, end: endTime },
      totalCost,
      totalTokens,
      totalSessions,
      byModel,
      byFeature,
      byUser,
      avgCostPerSession: totalSessions > 0 ? totalCost / totalSessions : 0,
      avgTokensPerSession: totalSessions > 0 ? totalTokens / totalSessions : 0,
    };
  }

  /**
   * Check if an action should be throttled based on budgets
   */
  shouldThrottle(scope: Budget["scope"]): {
    throttle: boolean;
    reason?: string;
    budget?: Budget;
  } {
    for (const budget of this.budgets.values()) {
      if (!budget.active) continue;
      if (budget.scope.type !== scope.type) continue;
      if (budget.scope.id && budget.scope.id !== scope.id) continue;

      const percentUsed = (budget.currentSpend / budget.amount) * 100;

      // Check hard limit
      if (budget.hardLimit && budget.currentSpend >= budget.hardLimit) {
        return {
          throttle: true,
          reason: `Hard limit exceeded for budget "${budget.name}"`,
          budget,
        };
      }

      // Check budget exceeded with block action
      if (percentUsed >= 100 && budget.overageAction === "block") {
        return {
          throttle: true,
          reason: `Budget "${budget.name}" exceeded`,
          budget,
        };
      }

      // Check custom throttle logic
      if (budget.overageAction === "throttle" && percentUsed >= 100) {
        if (this.config.onThrottleCheck) {
          const shouldThrottle = this.config.onThrottleCheck(budget);
          if (shouldThrottle) {
            return {
              throttle: true,
              reason: `Budget "${budget.name}" throttled`,
              budget,
            };
          }
        }
      }
    }

    return { throttle: false };
  }

  // =========================================================================
  // Forecasting
  // =========================================================================

  /**
   * Generate a cost forecast
   */
  generateForecast(
    scope: Budget["scope"],
    period: Budget["period"],
  ): CostForecast {
    const timestamp = now();
    const { periodStart, periodEnd } = this.calculatePeriodBounds(
      period,
      timestamp,
    );

    // Get historical data for the current period
    const relevantRecords = this.costRecords.filter((r) => {
      if (r.timestamp < periodStart || r.timestamp > timestamp) return false;
      if (scope.type === "feature" && r.featureId !== scope.id) return false;
      if (scope.type === "user" && r.userId !== scope.id) return false;
      if (scope.type === "model" && r.model !== scope.id) return false;
      return true;
    });

    // Calculate current spend
    const currentSpend = relevantRecords.reduce(
      (sum, r) => sum + r.cost.total,
      0,
    );

    // Group by day for trend analysis
    const dailySpend = this.groupByDay(relevantRecords, periodStart, timestamp);

    // Simple linear forecasting
    const forecast = this.linearForecast(
      dailySpend,
      periodStart,
      periodEnd,
      timestamp,
    );

    const costForecast: CostForecast = {
      id: generateEventId(),
      scope,
      period,
      periodStart,
      periodEnd,
      currentSpend,
      forecastedSpend: forecast.total,
      confidenceInterval: forecast.confidence,
      dailyForecast: forecast.daily,
      trend: forecast.trend,
      changeFromPrevious: this.calculatePeriodChange(
        scope,
        period,
        currentSpend,
      ),
      generatedAt: timestamp,
      forecastModel: "linear",
    };

    // Cache the forecast
    const cacheKey = `${scope.type}:${scope.id ?? "all"}:${period}`;
    this.forecasts.set(cacheKey, costForecast);

    return costForecast;
  }

  /**
   * Get cached forecast
   */
  getForecast(
    scope: Budget["scope"],
    period: Budget["period"],
  ): CostForecast | undefined {
    const cacheKey = `${scope.type}:${scope.id ?? "all"}:${period}`;
    return this.forecasts.get(cacheKey);
  }

  // =========================================================================
  // Alerts
  // =========================================================================

  /**
   * Get budget alerts
   */
  getAlerts(filter?: {
    budgetId?: string;
    acknowledged?: boolean;
    startTime?: number;
    endTime?: number;
  }): BudgetAlert[] {
    let alerts = [...this.alerts];

    if (filter?.budgetId) {
      alerts = alerts.filter((a) => a.budgetId === filter.budgetId);
    }

    if (filter?.acknowledged !== undefined) {
      alerts = alerts.filter((a) => a.acknowledged === filter.acknowledged);
    }

    if (filter?.startTime) {
      alerts = alerts.filter((a) => a.timestamp >= filter.startTime!);
    }

    if (filter?.endTime) {
      alerts = alerts.filter((a) => a.timestamp <= filter.endTime!);
    }

    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return false;
    alert.acknowledged = true;
    return true;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private updateBudgetsForCost(record: CostRecord): void {
    for (const budget of this.budgets.values()) {
      if (!budget.active) continue;
      if (
        record.timestamp < budget.periodStart ||
        record.timestamp > budget.periodEnd
      )
        continue;

      // Check scope match
      let matches = false;
      switch (budget.scope.type) {
        case "organization":
          matches = true;
          break;
        case "feature":
          matches = record.featureId === budget.scope.id;
          break;
        case "user":
          matches = record.userId === budget.scope.id;
          break;
        case "model":
          matches = record.model === budget.scope.id;
          break;
      }

      if (!matches) continue;

      // Update spend
      budget.currentSpend += record.cost.total;
      budget.updatedAt = now();

      // Check thresholds
      this.checkBudgetThresholds(budget);

      // Check if exceeded
      if (budget.currentSpend > budget.amount && this.config.onBudgetExceeded) {
        this.config.onBudgetExceeded(
          budget,
          budget.currentSpend - budget.amount,
        );
      }
    }
  }

  private checkBudgetThresholds(budget: Budget): void {
    const percentUsed = (budget.currentSpend / budget.amount) * 100;

    for (const threshold of budget.alertThresholds) {
      if (!threshold.triggered && percentUsed >= threshold.percentage) {
        threshold.triggered = true;
        threshold.triggeredAt = now();

        const alert: BudgetAlert = {
          id: generateEventId(),
          budgetId: budget.id,
          budgetName: budget.name,
          thresholdPercent: threshold.percentage,
          currentSpend: budget.currentSpend,
          budgetAmount: budget.amount,
          percentUsed,
          timestamp: now(),
          acknowledged: false,
        };

        this.alerts.push(alert);

        if (this.config.onAlert) {
          this.config.onAlert(alert);
        }
      }
    }
  }

  private calculatePeriodBounds(
    period: Budget["period"],
    timestamp: number,
  ): { periodStart: number; periodEnd: number } {
    const date = new Date(timestamp);
    let periodStart: Date;
    let periodEnd: Date;

    switch (period) {
      case "daily":
        periodStart = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
        );
        periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000 - 1);
        break;

      case "weekly":
        const dayOfWeek = date.getDay();
        periodStart = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate() - dayOfWeek,
        );
        periodEnd = new Date(
          periodStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1,
        );
        break;

      case "monthly":
        periodStart = new Date(date.getFullYear(), date.getMonth(), 1);
        periodEnd = new Date(
          date.getFullYear(),
          date.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        );
        break;

      case "quarterly":
        const quarter = Math.floor(date.getMonth() / 3);
        periodStart = new Date(date.getFullYear(), quarter * 3, 1);
        periodEnd = new Date(
          date.getFullYear(),
          (quarter + 1) * 3,
          0,
          23,
          59,
          59,
          999,
        );
        break;

      case "annual":
        periodStart = new Date(date.getFullYear(), 0, 1);
        periodEnd = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
    }

    return {
      periodStart: periodStart.getTime(),
      periodEnd: periodEnd.getTime(),
    };
  }

  private groupByDay(
    records: CostRecord[],
    _periodStart: number,
    _currentTime: number,
  ): Map<string, number> {
    const daily = new Map<string, number>();

    for (const record of records) {
      const dateKey = new Date(record.timestamp).toISOString().split("T")[0];
      daily.set(dateKey, (daily.get(dateKey) ?? 0) + record.cost.total);
    }

    return daily;
  }

  private linearForecast(
    dailySpend: Map<string, number>,
    periodStart: number,
    periodEnd: number,
    currentTime: number,
  ): {
    total: number;
    confidence: CostForecast["confidenceInterval"];
    daily: CostForecast["dailyForecast"];
    trend: CostForecast["trend"];
  } {
    const values = Array.from(dailySpend.values());
    const n = values.length;

    if (n === 0) {
      return {
        total: 0,
        confidence: { low: 0, high: 0, confidence: 0.95 },
        daily: [],
        trend: "stable",
      };
    }

    // Calculate average daily spend
    const avgDaily = values.reduce((a, b) => a + b, 0) / n;

    // Simple linear regression for trend
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slope =
      n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0;
    const intercept = (sumY - slope * sumX) / n;

    // Determine trend
    let trend: CostForecast["trend"];
    if (Math.abs(slope) < avgDaily * 0.05) {
      trend = "stable";
    } else if (slope > 0) {
      trend = "increasing";
    } else {
      trend = "decreasing";
    }

    // Calculate days in period
    const msPerDay = 24 * 60 * 60 * 1000;
    const totalDays = Math.ceil((periodEnd - periodStart) / msPerDay);
    const elapsedDays = Math.ceil((currentTime - periodStart) / msPerDay);
    const remainingDays = totalDays - elapsedDays;

    // Current total
    const currentTotal = values.reduce((a, b) => a + b, 0);

    // Forecast remaining days
    let forecastedRemaining = 0;
    const daily: CostForecast["dailyForecast"] = [];

    // Add actual days
    let cumulative = 0;
    let dayIndex = 0;
    for (const [dateStr, value] of dailySpend) {
      cumulative += value;
      daily.push({
        date: new Date(dateStr).getTime(),
        actual: value,
        forecasted: intercept + slope * dayIndex,
        cumulativeActual: cumulative,
        cumulativeForecast: cumulative,
      });
      dayIndex++;
    }

    // Add forecasted days
    for (let i = 0; i < remainingDays; i++) {
      const dayForecast = Math.max(0, intercept + slope * (elapsedDays + i));
      forecastedRemaining += dayForecast;
      cumulative += dayForecast;
      daily.push({
        date: currentTime + (i + 1) * msPerDay,
        forecasted: dayForecast,
        cumulativeForecast: cumulative,
      });
    }

    const forecastedTotal = currentTotal + forecastedRemaining;

    // Confidence interval (simple estimate based on variance)
    const variance =
      n > 1
        ? values.reduce((sum, v) => sum + Math.pow(v - avgDaily, 2), 0) /
          (n - 1)
        : avgDaily * 0.25;
    const stdDev = Math.sqrt(variance);
    const margin = 1.96 * stdDev * Math.sqrt(remainingDays); // 95% CI

    return {
      total: forecastedTotal,
      confidence: {
        low: Math.max(0, forecastedTotal - margin),
        high: forecastedTotal + margin,
        confidence: 0.95,
      },
      daily,
      trend,
    };
  }

  private calculatePeriodChange(
    scope: Budget["scope"],
    period: Budget["period"],
    currentSpend: number,
  ): number {
    // Get previous period bounds
    const now_ts = now();
    const { periodStart: currentStart } = this.calculatePeriodBounds(
      period,
      now_ts,
    );

    // Calculate previous period
    const periodLengthMs = now_ts - currentStart;
    const previousEnd = currentStart - 1;
    const previousStart = previousEnd - periodLengthMs;

    // Get previous period spend
    const previousRecords = this.costRecords.filter((r) => {
      if (r.timestamp < previousStart || r.timestamp > previousEnd)
        return false;
      if (scope.type === "feature" && r.featureId !== scope.id) return false;
      if (scope.type === "user" && r.userId !== scope.id) return false;
      if (scope.type === "model" && r.model !== scope.id) return false;
      return true;
    });

    const previousSpend = previousRecords.reduce(
      (sum, r) => sum + r.cost.total,
      0,
    );

    if (previousSpend === 0) return 0;

    return ((currentSpend - previousSpend) / previousSpend) * 100;
  }
}
