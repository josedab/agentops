/**
 * AgentOps SDK - Semantic Diff Types
 *
 * Type definitions for comparing agent behavior across versions, deployments, and time periods.
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface SemanticDiffConfig {
  /** Enable semantic diff features */
  enabled: boolean;
  /** Minimum sample size for valid comparison */
  minSampleSize?: number;
  /** Statistical significance threshold (0-1, default 0.05) */
  significanceThreshold?: number;
  /** Maximum number of sessions to compare */
  maxSessionsPerCohort?: number;
  /** Enable automatic version tracking */
  autoTrackVersions?: boolean;
  /** Callback when significant change detected */
  onSignificantChange?: (change: SignificantChange) => void;
}

export interface ResolvedSemanticDiffConfig extends Required<
  Omit<SemanticDiffConfig, "onSignificantChange">
> {
  onSignificantChange?: (change: SignificantChange) => void;
}

// ============================================================================
// Cohort Types
// ============================================================================

export interface Cohort {
  /** Cohort identifier */
  id: string;
  /** Cohort name */
  name: string;
  /** Cohort type */
  type: CohortType;
  /** Filter criteria for this cohort */
  filter: CohortFilter;
  /** Sessions in this cohort */
  sessionIds: string[];
  /** Sample size */
  sampleSize: number;
  /** Time range covered */
  timeRange: {
    start: number;
    end: number;
  };
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export type CohortType =
  | "time_period"
  | "prompt_version"
  | "model_version"
  | "deployment"
  | "feature_flag"
  | "custom";

export interface CohortFilter {
  /** Time range filter */
  timeRange?: {
    start: number;
    end: number;
  };
  /** Prompt version filter */
  promptVersion?: string;
  /** Model filter */
  model?: string;
  /** Deployment ID filter */
  deploymentId?: string;
  /** Feature flag filter */
  featureFlag?: string;
  /** Feature ID filter */
  featureId?: string;
  /** User ID filter */
  userId?: string;
  /** Tags filter */
  tags?: string[];
  /** Custom filter function */
  customFilter?: (session: CohortSession) => boolean;
}

export interface CohortSession {
  sessionId: string;
  userId?: string;
  featureId?: string;
  model?: string;
  promptVersion?: string;
  deploymentId?: string;
  status: "success" | "error";
  startTime: number;
  endTime?: number;
  durationMs: number;
  totalCost: number;
  totalTokens: number;
  eventCount: number;
  errorCount: number;
  toolCalls: number;
  toolSuccesses: number;
  toolFailures: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Comparison Types
// ============================================================================

export interface ComparisonRequest {
  /** Baseline cohort (the "before" or "control") */
  baseline: Cohort | CohortFilter;
  /** Comparison cohort (the "after" or "variant") */
  comparison: Cohort | CohortFilter;
  /** Metrics to compare */
  metrics?: MetricType[];
  /** Dimensions to break down by */
  dimensions?: DimensionType[];
  /** Include statistical tests */
  includeStatistics?: boolean;
}

export type MetricType =
  | "success_rate"
  | "error_rate"
  | "latency_p50"
  | "latency_p95"
  | "latency_p99"
  | "avg_latency"
  | "total_cost"
  | "avg_cost"
  | "avg_tokens"
  | "tool_success_rate"
  | "tool_usage_rate"
  | "events_per_session";

export type DimensionType =
  | "model"
  | "feature"
  | "user"
  | "tool"
  | "error_type"
  | "hour_of_day"
  | "day_of_week";

// ============================================================================
// Diff Result Types
// ============================================================================

export interface DiffResult {
  /** Unique diff ID */
  id: string;
  /** Comparison request */
  request: ComparisonRequest;
  /** Summary of changes */
  summary: DiffSummary;
  /** Metric comparisons */
  metricDiffs: MetricDiff[];
  /** Dimensional breakdowns */
  dimensionalDiffs: DimensionalDiff[];
  /** Behavioral changes detected */
  behavioralChanges: BehavioralChange[];
  /** Statistical analysis */
  statistics: StatisticalAnalysis;
  /** Significant changes flagged */
  significantChanges: SignificantChange[];
  /** Recommendations based on diff */
  recommendations: DiffRecommendation[];
  /** Generated at */
  generatedAt: number;
}

export interface DiffSummary {
  /** Overall assessment */
  assessment: "improved" | "degraded" | "neutral" | "mixed";
  /** Confidence in assessment (0-1) */
  confidence: number;
  /** Key findings */
  keyFindings: string[];
  /** Number of significant changes */
  significantChangeCount: number;
  /** Risk level */
  riskLevel: "low" | "medium" | "high";
}

export interface MetricDiff {
  /** Metric name */
  metric: MetricType;
  /** Baseline value */
  baselineValue: number;
  /** Comparison value */
  comparisonValue: number;
  /** Absolute change */
  absoluteChange: number;
  /** Percentage change */
  percentageChange: number;
  /** Direction of change */
  direction: "increase" | "decrease" | "no_change";
  /** Is this change statistically significant? */
  isSignificant: boolean;
  /** P-value from statistical test */
  pValue?: number;
  /** Confidence interval */
  confidenceInterval?: {
    lower: number;
    upper: number;
    level: number; // e.g., 0.95 for 95%
  };
  /** Impact assessment */
  impact: "positive" | "negative" | "neutral";
}

export interface DimensionalDiff {
  /** Dimension type */
  dimension: DimensionType;
  /** Breakdown by dimension values */
  breakdown: DimensionalBreakdown[];
}

export interface DimensionalBreakdown {
  /** Dimension value (e.g., model name, feature ID) */
  value: string;
  /** Baseline metrics */
  baseline: {
    count: number;
    percentage: number;
    avgMetric?: number;
  };
  /** Comparison metrics */
  comparison: {
    count: number;
    percentage: number;
    avgMetric?: number;
  };
  /** Change */
  change: {
    countChange: number;
    percentagePointChange: number;
    avgMetricChange?: number;
  };
  /** Is significant */
  isSignificant: boolean;
}

// ============================================================================
// Behavioral Change Types
// ============================================================================

export interface BehavioralChange {
  /** Change ID */
  id: string;
  /** Change type */
  type: BehavioralChangeType;
  /** Description */
  description: string;
  /** Severity */
  severity: "low" | "medium" | "high";
  /** Evidence for this change */
  evidence: BehavioralEvidence[];
  /** Confidence (0-1) */
  confidence: number;
}

export type BehavioralChangeType =
  | "new_error_pattern"
  | "error_pattern_resolved"
  | "tool_usage_change"
  | "response_length_change"
  | "decision_pattern_change"
  | "latency_pattern_change"
  | "cost_pattern_change";

export interface BehavioralEvidence {
  /** Evidence type */
  type: string;
  /** Description */
  description: string;
  /** Data supporting the evidence */
  data: unknown;
}

// ============================================================================
// Statistical Analysis Types
// ============================================================================

export interface StatisticalAnalysis {
  /** Sample sizes */
  sampleSizes: {
    baseline: number;
    comparison: number;
  };
  /** Statistical power */
  power: number;
  /** Minimum detectable effect */
  mde: number;
  /** Tests performed */
  testsPerformed: StatisticalTest[];
  /** Overall validity */
  isValid: boolean;
  /** Validity warnings */
  warnings: string[];
}

export interface StatisticalTest {
  /** Test name */
  name: string;
  /** Metric tested */
  metric: MetricType;
  /** Test statistic */
  statistic: number;
  /** P-value */
  pValue: number;
  /** Is significant */
  isSignificant: boolean;
  /** Effect size */
  effectSize?: number;
  /** Test details */
  details?: string;
}

// ============================================================================
// Significant Change Types
// ============================================================================

export interface SignificantChange {
  /** Change ID */
  id: string;
  /** Metric or behavior affected */
  affected: string;
  /** Change type */
  type: "metric" | "behavioral";
  /** Before value (human readable) */
  before: string;
  /** After value (human readable) */
  after: string;
  /** Impact */
  impact: "positive" | "negative" | "neutral";
  /** Severity */
  severity: "low" | "medium" | "high" | "critical";
  /** Recommended action */
  recommendedAction?: string;
}

// ============================================================================
// Recommendation Types
// ============================================================================

export interface DiffRecommendation {
  /** Recommendation ID */
  id: string;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Priority */
  priority: "low" | "medium" | "high" | "critical";
  /** Category */
  category: DiffRecommendationCategory;
  /** Based on which changes */
  basedOn: string[];
}

export type DiffRecommendationCategory =
  | "rollback"
  | "investigate"
  | "optimize"
  | "monitor"
  | "approve";

// ============================================================================
// Version Tracking Types
// ============================================================================

export interface VersionMarker {
  /** Version ID */
  id: string;
  /** Version type */
  type: VersionType;
  /** Version string */
  version: string;
  /** Description */
  description?: string;
  /** Timestamp when deployed/released */
  timestamp: number;
  /** Associated metadata */
  metadata?: Record<string, unknown>;
}

export type VersionType =
  | "prompt"
  | "model"
  | "deployment"
  | "sdk"
  | "configuration";

export interface DeploymentMarker extends VersionMarker {
  type: "deployment";
  /** Git commit SHA */
  commitSha?: string;
  /** Git branch */
  branch?: string;
  /** Environment */
  environment?: string;
  /** Deployed by */
  deployedBy?: string;
}

export interface PromptVersionMarker extends VersionMarker {
  type: "prompt";
  /** Prompt template ID */
  templateId: string;
  /** Prompt content hash */
  contentHash: string;
  /** Token count */
  tokenCount?: number;
}

// ============================================================================
// Aggregated Stats Types
// ============================================================================

export interface CohortStats {
  /** Number of sessions */
  sessionCount: number;
  /** Success count */
  successCount: number;
  /** Error count */
  errorCount: number;
  /** Success rate */
  successRate: number;
  /** Latency stats */
  latency: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    stdDev: number;
  };
  /** Cost stats */
  cost: {
    total: number;
    avg: number;
    min: number;
    max: number;
    stdDev: number;
  };
  /** Token stats */
  tokens: {
    total: number;
    avg: number;
    min: number;
    max: number;
  };
  /** Tool stats */
  tools: {
    totalCalls: number;
    successRate: number;
    uniqueTools: number;
    callsPerSession: number;
  };
  /** Error breakdown */
  errorBreakdown: Record<string, number>;
  /** Model breakdown */
  modelBreakdown: Record<string, number>;
}
