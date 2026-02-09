/**
 * AgentOps SDK - Prompt Optimization Engine Types
 *
 * Type definitions for prompt versioning, optimization, and A/B testing.
 */

// ============================================================================
// Prompt Versioning Types
// ============================================================================

export interface PromptVersion {
  /** Unique version identifier */
  id: string;

  /** Parent prompt identifier */
  promptId: string;

  /** Numeric version number (auto-incrementing) */
  version: number;

  /** The prompt content text */
  content: string;

  /** Variable placeholders found in the content */
  variables: string[];

  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;

  /** Creation timestamp */
  createdAt: number;

  /** Author of this version */
  author?: string;

  /** Version number this was derived from */
  parentVersion?: number;
}

export interface PromptDiff {
  /** The older version being compared */
  oldVersion: number;

  /** The newer version being compared */
  newVersion: number;

  /** Lines present in newVersion but not in oldVersion */
  additions: string[];

  /** Lines present in oldVersion but not in newVersion */
  deletions: string[];

  /** Lines that changed between versions */
  changes: Array<{
    line: number;
    old: string;
    new: string;
  }>;

  /** Cosine-similarity-inspired measure of content overlap (0-1) */
  similarity: number;
}

// ============================================================================
// Optimization Types
// ============================================================================

export type OptimizationGoal =
  | "quality"
  | "cost"
  | "latency"
  | "safety"
  | "conciseness";

export interface OptimizationSuggestion {
  /** Unique suggestion identifier */
  id: string;

  /** The prompt this suggestion applies to */
  promptId: string;

  /** Which optimization goal this addresses */
  goal: OptimizationGoal;

  /** The original prompt content */
  originalContent: string;

  /** The suggested replacement content */
  suggestedContent: string;

  /** Human-readable explanation of why this change helps */
  rationale: string;

  /** Estimated improvement factor (0-1) */
  estimatedImprovement: number;

  /** Confidence in the suggestion (0-1) */
  confidence: number;

  /** Category of the optimization */
  category: "structural" | "semantic" | "token_reduction" | "clarity";
}

// ============================================================================
// A/B Testing Types
// ============================================================================

export interface ABTestConfig {
  /** Prompt ID being tested */
  promptId: string;

  /** Variants to test */
  variants: Array<{
    /** Variant display name */
    name: string;
    /** The prompt content for this variant */
    content: string;
    /** Traffic weight (relative, will be normalized) */
    weight: number;
  }>;

  /** Required sample size per variant before declaring results */
  sampleSize: number;

  /** Metric names to track (e.g. 'quality', 'latency_ms', 'cost') */
  metrics: string[];

  /** Maximum test duration in milliseconds */
  duration?: number;

  /** Statistical confidence level (0-1, default 0.95) */
  confidenceLevel?: number;
}

export interface ABTestResult {
  /** Unique test identifier */
  testId: string;

  /** Prompt ID being tested */
  promptId: string;

  /** When the test was started */
  startedAt: number;

  /** When the test was completed (if finished) */
  completedAt?: number;

  /** Current test status */
  status: "running" | "completed" | "stopped";

  /** Results for each variant */
  variants: VariantResult[];

  /** Name of the winning variant (if determined) */
  winner?: string;

  /** Whether the result is statistically significant */
  statisticallySignificant: boolean;
}

export interface VariantResult {
  /** Variant display name */
  name: string;

  /** The prompt content used */
  content: string;

  /** Number of observations recorded */
  sampleCount: number;

  /** Metric results keyed by metric name */
  metrics: Record<string, VariantMetric>;
}

export interface VariantMetric {
  /** Arithmetic mean */
  mean: number;

  /** Sample standard deviation */
  stdDev: number;

  /** Minimum observed value */
  min: number;

  /** Maximum observed value */
  max: number;

  /** Confidence interval at the configured level */
  confidenceInterval: {
    lower: number;
    upper: number;
  };
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface PromptAnalysis {
  /** The prompt ID analyzed */
  promptId: string;

  /** The version number analyzed */
  version: number;

  /** Estimated token count */
  tokenCount: number;

  /** Estimated cost in USD (rough estimate) */
  estimatedCost: number;

  /** Readability score (0 = hard to read, 1 = very readable) */
  readabilityScore: number;

  /** Complexity score (0 = simple, 1 = very complex) */
  complexityScore: number;

  /** Optimization suggestions for this prompt */
  suggestions: OptimizationSuggestion[];
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface PromptOptimizerConfig {
  /** Optimization goals to target, ordered by priority */
  goals: OptimizationGoal[];

  /** Maximum token budget for optimized prompts */
  maxTokenBudget?: number;

  /** Target cost reduction factor (0-1, e.g. 0.2 = reduce cost by 20%) */
  targetCostReduction?: number;

  /** Whether to preserve semantic meaning during optimization (default: true) */
  preserveSemantics?: boolean;
}
