/**
 * AgentOps SDK - Cost Forecasting & Budget Types
 *
 * Type definitions for cost management features.
 */

// ============================================================================
// Budget Types
// ============================================================================

export interface Budget {
  /** Unique identifier */
  id: string;

  /** Budget name */
  name: string;

  /** Budget amount in USD */
  amount: number;

  /** Budget period */
  period: "daily" | "weekly" | "monthly" | "quarterly" | "annual";

  /** Start date of current period */
  periodStart: number;

  /** End date of current period */
  periodEnd: number;

  /** Current spend */
  currentSpend: number;

  /** Whether budget is active */
  active: boolean;

  /** Scope of the budget */
  scope: {
    type: "organization" | "team" | "feature" | "user" | "model";
    id?: string;
  };

  /** Alert thresholds */
  alertThresholds: AlertThreshold[];

  /** Action when budget exceeded */
  overageAction: "warn" | "throttle" | "block";

  /** Soft limit (warning) */
  softLimit?: number;

  /** Hard limit (block) */
  hardLimit?: number;

  /** Metadata */
  metadata?: Record<string, unknown>;

  /** Creation timestamp */
  createdAt: number;

  /** Last updated */
  updatedAt: number;
}

export interface AlertThreshold {
  /** Percentage of budget (0-100) */
  percentage: number;

  /** Whether this threshold has been triggered */
  triggered: boolean;

  /** When it was triggered */
  triggeredAt?: number;

  /** Notification channels */
  notifyChannels: ("email" | "slack" | "webhook")[];
}

export interface BudgetAlert {
  id: string;
  budgetId: string;
  budgetName: string;
  thresholdPercent: number;
  currentSpend: number;
  budgetAmount: number;
  percentUsed: number;
  timestamp: number;
  acknowledged: boolean;
}

// ============================================================================
// Forecast Types
// ============================================================================

export interface CostForecast {
  /** Forecast identifier */
  id: string;

  /** Scope of forecast */
  scope: Budget["scope"];

  /** Forecast period */
  period: Budget["period"];

  /** Start of forecast period */
  periodStart: number;

  /** End of forecast period */
  periodEnd: number;

  /** Current spend to date */
  currentSpend: number;

  /** Forecasted total spend */
  forecastedSpend: number;

  /** Confidence interval */
  confidenceInterval: {
    low: number;
    high: number;
    confidence: number; // e.g., 0.95 for 95%
  };

  /** Daily breakdown */
  dailyForecast: Array<{
    date: number;
    actual?: number;
    forecasted: number;
    cumulativeActual?: number;
    cumulativeForecast: number;
  }>;

  /** Trend direction */
  trend: "increasing" | "decreasing" | "stable";

  /** Percent change from previous period */
  changeFromPrevious: number;

  /** Generated at */
  generatedAt: number;

  /** Model used for forecasting */
  forecastModel: "linear" | "exponential" | "seasonal";
}

// ============================================================================
// Cost Tracking Types
// ============================================================================

export interface CostRecord {
  /** Record timestamp */
  timestamp: number;

  /** Session ID */
  sessionId: string;

  /** Feature ID */
  featureId?: string;

  /** User ID */
  userId?: string;

  /** Model used */
  model: string;

  /** Token counts */
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };

  /** Costs in USD */
  cost: {
    input: number;
    output: number;
    total: number;
  };
}

export interface CostSummary {
  /** Time period */
  period: {
    start: number;
    end: number;
  };

  /** Total cost */
  totalCost: number;

  /** Total tokens */
  totalTokens: number;

  /** Total sessions */
  totalSessions: number;

  /** Cost by model */
  byModel: Record<
    string,
    {
      cost: number;
      tokens: number;
      sessions: number;
    }
  >;

  /** Cost by feature */
  byFeature: Record<
    string,
    {
      cost: number;
      tokens: number;
      sessions: number;
    }
  >;

  /** Cost by user (top N) */
  byUser: Record<
    string,
    {
      cost: number;
      tokens: number;
      sessions: number;
    }
  >;

  /** Average cost per session */
  avgCostPerSession: number;

  /** Average tokens per session */
  avgTokensPerSession: number;
}

// ============================================================================
// Configuration
// ============================================================================

export interface BudgetConfig {
  /** Enable budget tracking */
  enabled: boolean;

  /** Default budgets */
  budgets?: Budget[];

  /** Enable forecasting */
  enableForecasting?: boolean;

  /** Forecast update interval (ms) */
  forecastInterval?: number;

  /** Cost calculation method */
  costMethod?: "estimated" | "actual";

  /** Callback on budget alert */
  onAlert?: (alert: BudgetAlert) => void;

  /** Callback when budget exceeded */
  onBudgetExceeded?: (budget: Budget, overage: number) => void;

  /** Callback for throttling decision */
  onThrottleCheck?: (budget: Budget) => boolean;
}
