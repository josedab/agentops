/**
 * AgentOps SDK - Semantic Diff
 *
 * Compare agent behavior across versions, deployments, and time periods.
 *
 * @packageDocumentation
 */

export { SemanticDiffEngine, InMemoryDiffSessionStore } from "./diff-engine.js";
export type { DiffSessionStore } from "./diff-engine.js";

export type {
  // Configuration
  SemanticDiffConfig,
  ResolvedSemanticDiffConfig,

  // Cohorts
  Cohort,
  CohortType,
  CohortFilter,
  CohortSession,
  CohortStats,

  // Comparisons
  ComparisonRequest,
  MetricType,
  DimensionType,

  // Results
  DiffResult,
  DiffSummary,
  MetricDiff,
  DimensionalDiff,
  DimensionalBreakdown,

  // Behavioral Changes
  BehavioralChange,
  BehavioralChangeType,
  BehavioralEvidence,

  // Statistics
  StatisticalAnalysis,
  StatisticalTest,

  // Significant Changes
  SignificantChange,

  // Recommendations
  DiffRecommendation,
  DiffRecommendationCategory,

  // Version Tracking
  VersionMarker,
  VersionType,
  DeploymentMarker,
  PromptVersionMarker,
} from "./types.js";
