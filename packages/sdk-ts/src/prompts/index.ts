/**
 * AgentOps SDK - Prompts Module
 *
 * Exports for prompt optimization functionality.
 */

export { PromptRegistry } from "./registry.js";
export { ExperimentManager } from "./experiments.js";
export { TokenAnalyzer } from "./analyzer.js";

// Enhanced Version Control
export { VersionControlledRegistry } from "./version-control.js";
export type {
  PromptBranch,
  PromptTag,
  VersionDiff,
  DiffLine,
  VersionedPrompt,
  PromptCommit,
  MergeResult,
  MergeConflict,
} from "./version-control.js";

// Advanced A/B Testing
export { AdvancedExperimentManager } from "./ab-testing.js";
export type {
  AdvancedExperimentConfig,
  VariantConfig,
  MetricType,
  ExtendedVariantMetrics,
  PowerAnalysis,
  BayesianAnalysis,
  ExtendedExperimentResults,
} from "./ab-testing.js";

export type {
  PromptTemplate,
  PromptVersion,
  PromptExperiment,
  ExperimentVariant,
  VariantMetrics,
  ExperimentResults,
  VariantComparison,
  TokenAnalysis,
  OptimizationSuggestion,
  PromptStudioConfig,
} from "./types.js";
