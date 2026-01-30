/**
 * AgentOps SDK - Prompt Optimization Types
 *
 * Type definitions for prompt versioning and A/B testing.
 */

// ============================================================================
// Prompt Types
// ============================================================================

export interface PromptTemplate {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** The prompt template text (with variable placeholders) */
  template: string;

  /** Variable names expected in the template */
  variables: string[];

  /** Version string */
  version: string;

  /** Description of this prompt */
  description?: string;

  /** Tags for categorization */
  tags?: string[];

  /** Model this prompt is optimized for */
  targetModel?: string;

  /** Creation timestamp */
  createdAt: number;

  /** Last updated timestamp */
  updatedAt: number;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface PromptVersion {
  /** Version identifier */
  version: string;

  /** Template content */
  template: string;

  /** Timestamp */
  createdAt: number;

  /** Optional change description */
  changeDescription?: string;

  /** Author */
  author?: string;
}

// ============================================================================
// Experiment Types
// ============================================================================

export interface PromptExperiment {
  /** Unique experiment identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Experiment description */
  description?: string;

  /** Variants in this experiment */
  variants: ExperimentVariant[];

  /** Experiment status */
  status: "draft" | "running" | "paused" | "completed";

  /** Metric to optimize */
  primaryMetric:
    | "quality_score"
    | "latency"
    | "token_count"
    | "cost"
    | "custom";

  /** Custom metric name if primaryMetric is 'custom' */
  customMetricName?: string;

  /** Minimum sample size per variant */
  minSampleSize: number;

  /** Statistical significance threshold (default: 0.95) */
  significanceThreshold: number;

  /** Start timestamp */
  startedAt?: number;

  /** End timestamp */
  endedAt?: number;

  /** Winner variant ID (if completed) */
  winnerVariantId?: string;

  /** Creation timestamp */
  createdAt: number;
}

export interface ExperimentVariant {
  /** Unique variant identifier */
  id: string;

  /** Human-readable name (e.g., "Control", "Variant A") */
  name: string;

  /** Prompt template ID */
  promptTemplateId: string;

  /** Traffic allocation (0-1) */
  trafficAllocation: number;

  /** Whether this is the control variant */
  isControl: boolean;
}

export interface VariantMetrics {
  /** Variant ID */
  variantId: string;

  /** Number of samples */
  sampleSize: number;

  /** Mean value of primary metric */
  mean: number;

  /** Standard deviation */
  stdDev: number;

  /** 95% confidence interval */
  confidenceInterval: [number, number];

  /** Individual metric values */
  metricBreakdown: {
    qualityScore?: { mean: number; stdDev: number };
    latencyMs?: { mean: number; stdDev: number };
    tokenCount?: { mean: number; stdDev: number };
    costUsd?: { mean: number; stdDev: number };
  };
}

export interface ExperimentResults {
  /** Experiment ID */
  experimentId: string;

  /** Metrics per variant */
  variantMetrics: VariantMetrics[];

  /** Statistical comparison results */
  comparisons: VariantComparison[];

  /** Whether results are statistically significant */
  isSignificant: boolean;

  /** Recommended winner (if significant) */
  recommendedWinner?: string;

  /** Improvement percentage of winner over control */
  improvementPercent?: number;

  /** Analysis timestamp */
  analyzedAt: number;
}

export interface VariantComparison {
  /** Control variant ID */
  controlId: string;

  /** Treatment variant ID */
  treatmentId: string;

  /** P-value from statistical test */
  pValue: number;

  /** Effect size (Cohen's d) */
  effectSize: number;

  /** Whether this comparison is significant */
  isSignificant: boolean;

  /** Relative improvement */
  relativeImprovement: number;
}

// ============================================================================
// Optimization Types
// ============================================================================

export interface TokenAnalysis {
  /** Total token count */
  totalTokens: number;

  /** Estimated tokens by section */
  sectionBreakdown: Array<{
    name: string;
    startIndex: number;
    endIndex: number;
    estimatedTokens: number;
    content: string;
  }>;

  /** Redundancy analysis */
  redundancies: Array<{
    text: string;
    occurrences: number;
    potentialSavings: number;
  }>;

  /** Suggestions for reduction */
  suggestions: Array<{
    type: "remove_redundancy" | "simplify" | "restructure" | "compress";
    description: string;
    estimatedSavings: number;
    confidence: number;
  }>;
}

export interface OptimizationSuggestion {
  /** Type of optimization */
  type: "token_reduction" | "clarity" | "structure" | "specificity";

  /** Description of the suggestion */
  description: string;

  /** Original text */
  originalText: string;

  /** Suggested replacement */
  suggestedText: string;

  /** Estimated token savings */
  tokenSavings: number;

  /** Confidence in the suggestion (0-1) */
  confidence: number;
}

// ============================================================================
// Configuration
// ============================================================================

export interface PromptStudioConfig {
  /** Enable prompt studio features */
  enabled: boolean;

  /** Storage backend for prompts */
  storage?: "memory" | "local" | "remote";

  /** Remote storage endpoint */
  remoteEndpoint?: string;

  /** Enable token counting */
  enableTokenCounting?: boolean;

  /** Model for token counting (affects tokenizer) */
  tokenCountingModel?: string;
}
