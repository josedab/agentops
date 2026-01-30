/**
 * AgentOps SDK - Quality Scoring Types
 *
 * Type definitions for AI-powered quality evaluation.
 */

// ============================================================================
// Quality Rubric Types
// ============================================================================

export interface QualityCriterion {
  /** Unique identifier for this criterion */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this criterion measures */
  description: string;

  /** Weight in final score (0-1, should sum to 1 across all criteria) */
  weight: number;

  /** Optional custom evaluation prompt */
  evaluationPrompt?: string;
}

export interface QualityRubric {
  /** Unique identifier for the rubric */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this rubric evaluates */
  description?: string;

  /** List of criteria to evaluate */
  criteria: QualityCriterion[];

  /** Version for tracking changes */
  version: string;
}

// Default quality criteria
export const DEFAULT_CRITERIA: QualityCriterion[] = [
  {
    id: "accuracy",
    name: "Accuracy",
    description: "Is the response factually correct and free from errors?",
    weight: 0.3,
  },
  {
    id: "helpfulness",
    name: "Helpfulness",
    description: "Does the response effectively address the user's needs?",
    weight: 0.3,
  },
  {
    id: "relevance",
    name: "Relevance",
    description: "Is the response on-topic and directly addressing the prompt?",
    weight: 0.2,
  },
  {
    id: "safety",
    name: "Safety",
    description:
      "Is the response free from harmful, biased, or inappropriate content?",
    weight: 0.2,
  },
];

export const DEFAULT_RUBRIC: QualityRubric = {
  id: "default",
  name: "Default Quality Rubric",
  description: "Standard rubric for evaluating AI response quality",
  criteria: DEFAULT_CRITERIA,
  version: "1.0.0",
};

// ============================================================================
// Quality Score Types
// ============================================================================

export interface CriterionScore {
  /** Criterion ID */
  criterionId: string;

  /** Score from 1-10 */
  score: number;

  /** Reasoning for the score */
  reasoning: string;
}

export interface QualityScore {
  /** Event ID this score is for */
  eventId: string;

  /** Session ID */
  sessionId: string;

  /** Overall weighted score (1-10) */
  overallScore: number;

  /** Individual criterion scores */
  criterionScores: CriterionScore[];

  /** Rubric used for evaluation */
  rubricId: string;

  /** Model used for evaluation */
  judgeModel: string;

  /** Timestamp of evaluation */
  evaluatedAt: number;

  /** Time taken to evaluate (ms) */
  evaluationDurationMs: number;

  /** Raw judge response for debugging */
  rawResponse?: string;

  /** Any error that occurred during evaluation */
  error?: string;
}

// ============================================================================
// Quality Configuration
// ============================================================================

export interface QualityConfig {
  /** Enable quality scoring */
  enabled: boolean;

  /** Model to use for evaluation (default: gpt-4o-mini) */
  judgeModel?: string;

  /** Custom rubric to use */
  rubric?: QualityRubric;

  /** Sampling rate for quality evaluation (0-1, default: 1.0) */
  samplingRate?: number;

  /** Maximum concurrent evaluations */
  maxConcurrent?: number;

  /** Timeout for evaluation in ms */
  timeoutMs?: number;

  /** Custom API endpoint for judge model */
  judgeEndpoint?: string;

  /** API key for judge model (if different from main key) */
  judgeApiKey?: string;
}

export interface ResolvedQualityConfig {
  enabled: boolean;
  judgeModel: string;
  rubric: QualityRubric;
  samplingRate: number;
  maxConcurrent: number;
  timeoutMs: number;
  judgeEndpoint?: string;
  judgeApiKey?: string;
}

// ============================================================================
// Quality Event Types
// ============================================================================

export interface QualityScoreEvent {
  eventId: string;
  sessionId: string;
  type: "quality_score";
  targetEventId: string;
  score: QualityScore;
  timestamp: number;
}

// ============================================================================
// Quality Statistics
// ============================================================================

export interface QualityStats {
  /** Number of responses evaluated */
  evaluatedCount: number;

  /** Average overall score */
  averageScore: number;

  /** Average scores by criterion */
  criterionAverages: Record<string, number>;

  /** Score distribution (count per score bucket) */
  scoreDistribution: Record<number, number>;

  /** Number of evaluations that failed */
  errorCount: number;
}
