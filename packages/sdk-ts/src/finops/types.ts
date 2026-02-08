/**
 * AgentOps SDK - Cost Intelligence & FinOps Types
 *
 * Type definitions for advanced cost intelligence, forecasting,
 * anomaly detection, and financial operations dashboard.
 */

// ============================================================================
// Cost Data Types
// ============================================================================

/**
 * A single cost data point representing one LLM invocation.
 */
export interface CostDataPoint {
  /** Timestamp of the invocation (epoch ms) */
  timestamp: number;

  /** Model used (e.g., "gpt-4", "claude-3-opus") */
  model: string;

  /** Token counts */
  tokens: {
    input: number;
    output: number;
  };

  /** Total cost in USD */
  cost: number;

  /** Feature or capability that triggered the invocation */
  feature?: string;

  /** User ID associated with the invocation */
  userId?: string;

  /** Session ID associated with the invocation */
  sessionId?: string;
}

// ============================================================================
// Trend & Forecasting Types
// ============================================================================

/**
 * Cost trend over a time period with linear regression analysis.
 */
export interface CostTrend {
  /** Aggregation period */
  period: "hourly" | "daily" | "weekly" | "monthly";

  /** Aggregated data points */
  dataPoints: Array<{
    timestamp: number;
    cost: number;
    tokens: number;
  }>;

  /** Linear regression slope (cost change per period unit) */
  slope: number;

  /** Projected cost for next period based on trend */
  projection: number;
}

/**
 * Cost forecast with confidence intervals.
 */
export interface CostForecast {
  /** Start of the forecast period (epoch ms) */
  periodStart: number;

  /** End of the forecast period (epoch ms) */
  periodEnd: number;

  /** Projected total cost for the period */
  projectedCost: number;

  /** Lower bound of confidence interval */
  lowerBound: number;

  /** Upper bound of confidence interval */
  upperBound: number;

  /** Confidence level (0-1, e.g. 0.95 = 95%) */
  confidence: number;

  /** Model or scope this forecast applies to */
  model: string;

  /** Forecasting method used */
  basis: "linear" | "seasonal" | "exponential";
}

// ============================================================================
// Analysis Types
// ============================================================================

/**
 * Side-by-side comparison between two models.
 */
export interface ModelComparison {
  /** First model identifier */
  modelA: string;

  /** Second model identifier */
  modelB: string;

  /** Quality score difference (modelB - modelA, positive means B is better) */
  qualityDiff: number;

  /** Cost difference (modelB - modelA, positive means B costs more) */
  costDiff: number;

  /** Latency difference (modelB - modelA, positive means B is slower) */
  latencyDiff: number;

  /** Recommendation based on analysis */
  recommendation: "switch" | "stay" | "test";

  /** Human-readable explanation of the recommendation */
  rationale: string;
}

/**
 * A detected caching opportunity based on repeated prompt patterns.
 */
export interface CachingOpportunity {
  /** Unique identifier */
  id: string;

  /** The repeated prompt pattern or content hash */
  pattern: string;

  /** How often this pattern appears */
  frequency: number;

  /** Estimated savings in USD if cached */
  estimatedSavings: number;

  /** Estimated cache hit rate (0-1) */
  cacheHitRate: number;

  /** Human-readable recommendation */
  recommendation: string;
}

/**
 * A token optimization suggestion.
 */
export interface TokenOptimization {
  /** Unique identifier */
  id: string;

  /** Type of optimization */
  type:
    | "system_prompt"
    | "context_window"
    | "response_format"
    | "few_shot_reduction";

  /** Description of the optimization */
  description: string;

  /** Current token usage */
  currentTokens: number;

  /** Projected token usage after optimization */
  optimizedTokens: number;

  /** Savings as a percentage (0-100) */
  savingsPercent: number;

  /** Risk level of applying this optimization */
  risk: "low" | "medium" | "high";
}

// ============================================================================
// Reporting Types
// ============================================================================

/**
 * Cost allocation report broken down by various dimensions.
 */
export interface CostAllocationReport {
  /** Reporting period label (e.g., "2025-01", "2025-W03") */
  period: string;

  /** Total cost for the period */
  totalCost: number;

  /** Cost broken down by model */
  byModel: Record<string, number>;

  /** Cost broken down by feature */
  byFeature: Record<string, number>;

  /** Cost broken down by user */
  byUser: Record<string, number>;

  /** Cost broken down by team (optional) */
  byTeam?: Record<string, number>;
}

// ============================================================================
// Alert Types
// ============================================================================

/**
 * A budget or spending alert.
 */
export interface BudgetAlert {
  /** Unique identifier */
  id: string;

  /** Tenant or organization ID (optional, for multi-tenant) */
  tenantId?: string;

  /** Type of alert */
  type: "threshold" | "anomaly" | "forecast";

  /** Severity level */
  severity: "info" | "warning" | "critical";

  /** Human-readable alert message */
  message: string;

  /** Current spending amount */
  currentSpend: number;

  /** Budget threshold that was exceeded (if threshold type) */
  threshold?: number;

  /** When the alert was triggered (epoch ms) */
  triggeredAt: number;
}

// ============================================================================
// Anomaly Types
// ============================================================================

/**
 * A detected cost anomaly.
 */
export interface CostAnomaly {
  /** Unique identifier */
  id: string;

  /** When the anomaly occurred (epoch ms) */
  timestamp: number;

  /** Expected cost based on historical data */
  expectedCost: number;

  /** Actual cost observed */
  actualCost: number;

  /** Deviation from expected (z-score or multiplier) */
  deviation: number;

  /** Model associated with the anomaly */
  model?: string;

  /** Feature associated with the anomaly */
  feature?: string;

  /** Severity based on deviation magnitude */
  severity: "low" | "medium" | "high";
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the FinOps cost intelligence engine.
 */
export interface FinOpsConfig {
  /** Whether cost tracking is enabled */
  trackingEnabled: boolean;

  /** Forecast horizon in days (default: 30) */
  forecastHorizon?: number;

  /** Anomaly detection threshold in standard deviations (default: 2) */
  anomalyThreshold?: number;

  /** Budget alert thresholds as percentages (default: [50, 75, 90, 100]) */
  budgetAlertThresholds?: number[];
}

// ============================================================================
// Dashboard Types
// ============================================================================

/**
 * Full FinOps dashboard data.
 */
export interface FinOpsDashboard {
  /** High-level cost summary */
  summary: CostSummary;

  /** Cost trends across periods */
  trends: CostTrend[];

  /** Cost forecasts */
  forecasts: CostForecast[];

  /** Detected cost anomalies */
  anomalies: CostAnomaly[];

  /** Token optimization suggestions */
  optimizations: TokenOptimization[];

  /** Model comparison results */
  modelComparisons: ModelComparison[];
}

/**
 * High-level cost summary for dashboard display.
 */
export interface CostSummary {
  /** Cost for the current period */
  currentPeriodCost: number;

  /** Cost for the previous period */
  previousPeriodCost: number;

  /** Percent change from previous to current period */
  percentChange: number;

  /** Model with the highest cost */
  topModel: string;

  /** Feature with the highest cost */
  topFeature: string;

  /** Projected cost for the end of the current month */
  projectedMonthEnd: number;
}
