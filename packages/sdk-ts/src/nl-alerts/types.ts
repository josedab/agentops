/**
 * Natural Language Alert Configuration - Types
 *
 * Type definitions for NL-based alert rule creation.
 */

// ============================================================================
// Parse Result Types
// ============================================================================

export interface ParsedAlertRule {
  /** Extracted rule configuration */
  rule: AlertRuleConfig;

  /** Original natural language query */
  originalQuery: string;

  /** Confidence in the parse (0-1) */
  confidence: number;

  /** Ambiguities that need clarification */
  ambiguities: Ambiguity[];

  /** Suggestions for improving the query */
  suggestions: string[];

  /** Parse metadata */
  metadata: ParseMetadata;
}

export interface AlertRuleConfig {
  /** Rule name (auto-generated or extracted) */
  name: string;

  /** Rule description */
  description: string;

  /** What metric to monitor */
  metric: MetricSpec;

  /** Alert condition */
  condition: ConditionSpec;

  /** Alert severity */
  severity: "info" | "warning" | "critical";

  /** Who/what to filter by */
  filters: FilterSpec[];

  /** Notification settings */
  notifications: NotificationSpec[];

  /** Whether rule is enabled */
  enabled: boolean;

  /** Cooldown between alerts */
  cooldownMs: number;
}

export interface MetricSpec {
  type: MetricType;
  name: string;
  unit: string;
  aggregation?: "avg" | "sum" | "min" | "max" | "p50" | "p90" | "p99" | "count";
  window?: number;
}

export type MetricType =
  | "cost"
  | "latency"
  | "error_rate"
  | "token_usage"
  | "quality_score"
  | "throughput"
  | "session_count"
  | "tool_usage"
  | "custom";

export interface ConditionSpec {
  type: "threshold" | "trend" | "anomaly" | "forecast" | "rate_of_change";
  operator: "gt" | "lt" | "gte" | "lte" | "eq" | "neq";
  value: number;
  duration?: number;
  percentage?: number;
}

export interface FilterSpec {
  field: "user" | "feature" | "model" | "session" | "tag" | "environment";
  operator: "eq" | "neq" | "contains" | "in" | "not_in";
  value: string | string[];
}

export interface NotificationSpec {
  channel: "email" | "slack" | "webhook" | "pagerduty" | "dashboard";
  recipients?: string[];
  webhookUrl?: string;
  template?: string;
}

export interface Ambiguity {
  type: "metric" | "threshold" | "user" | "timeframe" | "severity";
  question: string;
  options: Array<{
    value: string | number;
    label: string;
    confidence: number;
  }>;
  default?: string | number;
}

export interface ParseMetadata {
  parseTimeMs: number;
  tokensUsed?: number;
  modelUsed?: string;
  extractedEntities: ExtractedEntity[];
}

export interface ExtractedEntity {
  type: string;
  value: string;
  span: [number, number];
  confidence: number;
}

// ============================================================================
// Parser Configuration
// ============================================================================

export interface NLAlertParserConfig {
  /** Enable the parser */
  enabled?: boolean;

  /** LLM provider for parsing */
  llmProvider?: LLMProvider;

  /** Enable fuzzy matching for metrics/users */
  fuzzyMatching?: boolean;

  /** Confidence threshold for auto-acceptance */
  confidenceThreshold?: number;

  /** Maximum ambiguities before rejection */
  maxAmbiguities?: number;

  /** Custom metric definitions */
  customMetrics?: MetricDefinition[];

  /** Known users/features for better matching */
  knownEntities?: KnownEntities;

  /** Debug mode */
  debug?: boolean;
}

export interface LLMProvider {
  complete(prompt: string): Promise<string>;
}

export interface MetricDefinition {
  name: string;
  aliases: string[];
  type: MetricType;
  unit: string;
  description: string;
}

export interface KnownEntities {
  users?: string[];
  features?: string[];
  models?: string[];
  tags?: string[];
  environments?: string[];
}

// ============================================================================
// Feedback Types
// ============================================================================

export interface AlertFeedback {
  alertId: string;
  ruleId: string;
  type: "helpful" | "not_helpful" | "false_positive" | "too_late" | "too_early";
  comment?: string;
  timestamp: number;
}

export interface RuleEffectiveness {
  ruleId: string;
  totalAlerts: number;
  acknowledgedAlerts: number;
  falsePositives: number;
  averageResponseTimeMs: number;
  feedbackScore: number;
  recommendations: string[];
}

// ============================================================================
// Example Queries and Expected Parses
// ============================================================================

export const EXAMPLE_QUERIES: Array<{
  query: string;
  expectedParse: Partial<AlertRuleConfig>;
}> = [
  {
    query: "Alert me when costs exceed $10 per hour",
    expectedParse: {
      metric: {
        type: "cost",
        name: "cost",
        unit: "USD",
        aggregation: "sum",
        window: 3600000,
      },
      condition: { type: "threshold", operator: "gt", value: 10 },
      severity: "warning",
    },
  },
  {
    query:
      "Send a critical alert if error rate goes above 5% for user john@example.com",
    expectedParse: {
      metric: {
        type: "error_rate",
        name: "error_rate",
        unit: "percent",
        aggregation: "avg",
      },
      condition: { type: "threshold", operator: "gt", value: 5 },
      severity: "critical",
      filters: [{ field: "user", operator: "eq", value: "john@example.com" }],
    },
  },
  {
    query:
      "Notify me via Slack when latency spikes more than 50% above average",
    expectedParse: {
      metric: {
        type: "latency",
        name: "latency",
        unit: "ms",
        aggregation: "avg",
      },
      condition: {
        type: "rate_of_change",
        operator: "gt",
        value: 50,
        percentage: 50,
      },
      severity: "warning",
      notifications: [{ channel: "slack" }],
    },
  },
  {
    query:
      "Create an alert for when the chat-agent feature uses more than 100k tokens per day",
    expectedParse: {
      metric: {
        type: "token_usage",
        name: "token_usage",
        unit: "tokens",
        aggregation: "sum",
        window: 86400000,
      },
      condition: { type: "threshold", operator: "gt", value: 100000 },
      filters: [{ field: "feature", operator: "eq", value: "chat-agent" }],
    },
  },
  {
    query: "Warn me if quality score drops below 0.8 in production",
    expectedParse: {
      metric: {
        type: "quality_score",
        name: "quality_score",
        unit: "score",
        aggregation: "avg",
      },
      condition: { type: "threshold", operator: "lt", value: 0.8 },
      severity: "warning",
      filters: [{ field: "environment", operator: "eq", value: "production" }],
    },
  },
];
