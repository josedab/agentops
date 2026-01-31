/**
 * AgentOps SDK - Cost Module
 *
 * Intelligent cost optimization with focused, single-responsibility classes.
 */

// Main optimizer (facade over focused classes)
export { CostOptimizer } from "./optimizer.js";

// Focused classes (extracted from CostOptimizer)
export { CostAnalyzer } from "./analyzer.js";
export type { CostAnalyzerConfig } from "./analyzer.js";

export { CostSimulator } from "./simulator.js";
export type { CostSimulatorConfig } from "./simulator.js";

export { RecommendationEngine } from "./recommendation.js";
export type { RecommendationEngineConfig } from "./recommendation.js";

// Storage (Dependency Injection)
export { InMemoryUsageStore } from "./store.js";

// Types
export type {
  // Configuration
  CostOptimizerConfig,
  OptimizationStrategy,
  ModelTierMapping,

  // Analysis
  CostAnalysis,
  ModelCostBreakdown,
  FeatureCostBreakdown,
  HourlyCost,
  WasteAnalysis,
  WasteCategory,
  EfficiencyMetrics,

  // Recommendations
  CostRecommendation,
  RecommendationAction,

  // Simulation
  CostSimulation,
  SimulationScenario,

  // Savings
  RealizedSavings,

  // Usage
  UsageRecord,

  // Storage interface
  UsageRecordStore,
} from "./types.js";
