/**
 * AgentOps SDK - Evaluation & Benchmark Suite Types
 *
 * Type definitions for the evaluation framework, including evaluators,
 * datasets, run configuration, CI gates, and production-to-eval conversion.
 */

// ============================================================================
// Evaluator Types
// ============================================================================

/**
 * Built-in evaluator types plus custom.
 */
export type EvaluatorType =
  | "faithfulness"
  | "relevance"
  | "toxicity"
  | "hallucination"
  | "coherence"
  | "completeness"
  | "custom";

/**
 * Configuration for an evaluator instance.
 */
export interface EvaluatorConfig {
  /** The type of evaluator */
  type: EvaluatorType;

  /** Display name for the evaluator */
  name: string;

  /** Optional description of what this evaluator checks */
  description?: string;

  /** Score threshold to pass (0-1) */
  threshold: number;

  /** Weight for aggregate score calculation */
  weight?: number;

  /** Custom prompt template for 'custom' evaluator type */
  customPrompt?: string;
}

// ============================================================================
// Evaluation Input / Output Types
// ============================================================================

/**
 * Input data for a single evaluation.
 */
export interface EvaluationInput {
  /** The prompt sent to the LLM */
  prompt: string;

  /** The LLM response to evaluate */
  response: string;

  /** Optional context documents used for generation */
  context?: string[];

  /** Optional reference/ground-truth answer */
  reference?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Score from a single evaluator for a single input.
 */
export interface EvaluationScore {
  /** Name of the evaluator that produced this score */
  evaluator: string;

  /** Numeric score (0-1) */
  score: number;

  /** Whether the score meets the evaluator threshold */
  passed: boolean;

  /** Human-readable reasoning for the score */
  reasoning: string;

  /** Additional details about the scoring */
  details?: Record<string, unknown>;
}

/**
 * Complete result for evaluating a single input across all evaluators.
 */
export interface EvaluationResult {
  /** Unique result identifier */
  id: string;

  /** The input that was evaluated */
  input: EvaluationInput;

  /** Scores from each evaluator */
  scores: EvaluationScore[];

  /** Weighted aggregate score across all evaluators */
  aggregateScore: number;

  /** Whether the overall evaluation passed */
  passed: boolean;

  /** ISO 8601 timestamp of when the evaluation was performed */
  timestamp: string;

  /** Duration of the evaluation in milliseconds */
  durationMs: number;
}

// ============================================================================
// Dataset Types
// ============================================================================

/**
 * A single sample in an evaluation dataset.
 */
export interface EvalSample {
  /** Unique sample identifier */
  id: string;

  /** The evaluation input for this sample */
  input: EvaluationInput;

  /** Optional expected scores per evaluator name */
  expectedScores?: Record<string, number>;

  /** Optional tags for filtering/grouping */
  tags?: string[];
}

/**
 * A collection of evaluation samples.
 */
export interface EvalDataset {
  /** Unique dataset identifier */
  id: string;

  /** Display name for the dataset */
  name: string;

  /** Optional description */
  description?: string;

  /** The evaluation samples */
  samples: EvalSample[];

  /** ISO 8601 creation timestamp */
  createdAt: string;

  /** Dataset version string */
  version: string;
}

// ============================================================================
// Evaluation Run Types
// ============================================================================

/**
 * Configuration for an evaluation run.
 */
export interface EvalRunConfig {
  /** Optional dataset ID to evaluate against */
  datasetId?: string;

  /** Evaluators to apply */
  evaluators: EvaluatorConfig[];

  /** Maximum concurrent evaluations */
  concurrency?: number;

  /** Whether to fail the run if any threshold is not met */
  failOnThreshold?: boolean;
}

/**
 * Summary statistics for an evaluation run.
 */
export interface EvalRunSummary {
  /** Total number of samples evaluated */
  totalSamples: number;

  /** Number of samples that passed all evaluators */
  passedSamples: number;

  /** Number of samples that failed at least one evaluator */
  failedSamples: number;

  /** Average aggregate score across all samples */
  averageScore: number;

  /** Per-evaluator score statistics */
  scoresByEvaluator: Record<string, { avg: number; min: number; max: number }>;

  /** Total run duration in milliseconds */
  durationMs: number;
}

/**
 * A complete evaluation run with configuration, results, and summary.
 */
export interface EvalRun {
  /** Unique run identifier */
  id: string;

  /** Run configuration */
  config: EvalRunConfig;

  /** Individual evaluation results */
  results: EvaluationResult[];

  /** Aggregated summary statistics */
  summary: EvalRunSummary;

  /** ISO 8601 timestamp when the run started */
  startedAt: string;

  /** ISO 8601 timestamp when the run completed */
  completedAt?: string;

  /** Current run status */
  status: "running" | "completed" | "failed";
}

// ============================================================================
// CI Gate Types
// ============================================================================

/**
 * Configuration for a CI quality gate.
 */
export interface CIGateConfig {
  /** Evaluators to run as part of the gate */
  evaluators: EvaluatorConfig[];

  /** Minimum acceptable aggregate score (0-1) */
  minAggregateScore: number;

  /** Minimum acceptable pass rate (0-1) */
  minPassRate: number;

  /** Whether to block the pipeline on failure */
  blockOnFailure: boolean;
}

/**
 * Result from running a CI quality gate.
 */
export interface CIGateResult {
  /** Whether the gate passed */
  passed: boolean;

  /** The aggregate score achieved */
  aggregateScore: number;

  /** The pass rate achieved (0-1) */
  passRate: number;

  /** Human-readable details about the result */
  details: string;

  /** Individual evaluation results */
  results: EvaluationResult[];
}

// ============================================================================
// LLM Judge Types
// ============================================================================

/**
 * Configuration for an LLM-as-judge evaluator.
 */
export interface LLMJudgeConfig {
  /** Model identifier to use as judge */
  model: string;

  /** Sampling temperature (0-1) */
  temperature?: number;

  /** System prompt for the judge model */
  systemPrompt?: string;
}
