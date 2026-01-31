/**
 * Cost Optimizer Types
 *
 * Shared type definitions for cost analysis, simulation, and optimization.
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface CostOptimizerConfig {
  /** Enable cost optimization features */
  enabled: boolean;
  /** Minimum quality score threshold (0-10) */
  qualityThreshold?: number;
  /** Maximum acceptable latency increase (percentage, e.g., 0.2 = 20%) */
  maxLatencyIncrease?: number;
  /** Enable automatic optimizations */
  autoOptimize?: boolean;
  /** Auto-optimization strategies to apply */
  autoStrategies?: OptimizationStrategy[];
  /** Custom model tier mappings */
  modelTiers?: ModelTierMapping;
  /** Callback when recommendation is generated */
  onRecommendation?: (recommendation: CostRecommendation) => void;
  /** Callback when savings are realized */
  onSavingsRealized?: (savings: RealizedSavings) => void;
}

export type OptimizationStrategy =
  | "model_downgrade"
  | "prompt_compression"
  | "response_caching"
  | "batch_requests"
  | "context_pruning"
  | "token_limit_adjustment";

export interface ModelTierMapping {
  premium: string[];
  standard: string[];
  economy: string[];
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface CostAnalysis {
  /** Analysis ID */
  id: string;
  /** Time period analyzed */
  period: {
    start: number;
    end: number;
  };
  /** Total cost in USD */
  totalCost: number;
  /** Cost breakdown */
  breakdown: {
    byModel: Record<string, ModelCostBreakdown>;
    byFeature: Record<string, FeatureCostBreakdown>;
    byUser: Record<string, number>;
    byHour: HourlyCost[];
  };
  /** Waste analysis */
  waste: WasteAnalysis;
  /** Efficiency metrics */
  efficiency: EfficiencyMetrics;
  /** Generated at timestamp */
  generatedAt: number;
}

export interface ModelCostBreakdown {
  totalCost: number;
  inputCost: number;
  outputCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  avgCostPerRequest: number;
  avgTokensPerRequest: number;
}

export interface FeatureCostBreakdown {
  totalCost: number;
  requestCount: number;
  avgCostPerRequest: number;
  primaryModel: string;
  qualityScore?: number;
  successRate?: number;
}

export interface HourlyCost {
  hour: number;
  cost: number;
  requestCount: number;
}

export interface WasteAnalysis {
  /** Total estimated waste */
  estimatedWaste: number;
  /** Waste as percentage of total cost */
  wastePercentage: number;
  /** Individual waste categories */
  categories: WasteCategory[];
}

export interface WasteCategory {
  type:
    | "oversized_context"
    | "redundant_prompts"
    | "inefficient_model"
    | "unused_output"
    | "retry_waste";
  description: string;
  estimatedWaste: number;
  affectedRequests: number;
  examples?: string[];
}

export interface EfficiencyMetrics {
  /** Cost per successful outcome */
  costPerSuccess: number;
  /** Tokens per successful outcome */
  tokensPerSuccess: number;
  /** Average quality score */
  avgQualityScore: number;
  /** Token efficiency (output value per input token) */
  tokenEfficiency: number;
  /** Model utilization (% of requests using optimal model) */
  modelOptimality: number;
}

// ============================================================================
// Recommendation Types
// ============================================================================

export interface CostRecommendation {
  id: string;
  strategy: OptimizationStrategy;
  title: string;
  description: string;
  /** Estimated monthly savings in USD */
  estimatedMonthlySavings: number;
  /** Confidence in the recommendation (0-1) */
  confidence: number;
  /** Implementation difficulty */
  difficulty: "low" | "medium" | "high";
  /** Expected impact on quality (negative means degradation) */
  qualityImpact: number;
  /** Expected impact on latency (percentage increase) */
  latencyImpact: number;
  /** Specific actions to implement */
  actions: RecommendationAction[];
  /** Affected features/models */
  scope: {
    models?: string[];
    features?: string[];
  };
  /** Priority score (higher = more important) */
  priority: number;
  createdAt: number;
  status: "pending" | "applied" | "dismissed";
}

export interface RecommendationAction {
  type:
    | "config_change"
    | "code_change"
    | "model_switch"
    | "cache_enable"
    | "prompt_edit";
  description: string;
  before?: string;
  after?: string;
  automatic: boolean;
}

// ============================================================================
// Simulation Types
// ============================================================================

export interface CostSimulation {
  id: string;
  /** Baseline (current) cost */
  baselineCost: number;
  /** Simulated cost after optimizations */
  simulatedCost: number;
  /** Total savings */
  savings: number;
  /** Savings percentage */
  savingsPercent: number;
  /** Quality impact (change in average score) */
  qualityImpact: number;
  /** Latency impact (percentage change) */
  latencyImpact: number;
  /** Strategies applied */
  strategiesApplied: OptimizationStrategy[];
  /** Per-strategy breakdown */
  strategyBreakdown: Array<{
    strategy: OptimizationStrategy;
    savings: number;
    qualityImpact: number;
    latencyImpact: number;
  }>;
  /** Risk assessment */
  riskLevel: "low" | "medium" | "high";
  createdAt: number;
}

export interface SimulationScenario {
  /** Name of the scenario */
  name: string;
  /** Strategies to apply */
  strategies: OptimizationStrategy[];
  /** Model substitutions (from -> to) */
  modelSubstitutions?: Record<string, string>;
  /** Context compression ratio (0-1, where 0.7 means 30% reduction) */
  contextCompression?: number;
  /** Cache hit rate assumption (0-1) */
  assumedCacheHitRate?: number;
}

// ============================================================================
// Savings Types
// ============================================================================

export interface RealizedSavings {
  period: { start: number; end: number };
  totalSavings: number;
  byStrategy: Record<OptimizationStrategy, number>;
  byModel: Record<string, number>;
  byFeature: Record<string, number>;
}

// ============================================================================
// Usage Types
// ============================================================================

export interface UsageRecord {
  timestamp: number;
  sessionId: string;
  featureId?: string;
  userId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  success: boolean;
  qualityScore?: number;
  prompt?: string;
  cached?: boolean;
}

// ============================================================================
// Store Interface (Dependency Injection)
// ============================================================================

/**
 * Interface for usage record storage.
 * Implement this for custom storage backends.
 */
export interface UsageRecordStore {
  /** Add a usage record */
  add(record: UsageRecord): void;

  /** Bulk import records */
  addBatch(records: UsageRecord[]): void;

  /** Query records by time range */
  query(startTime: number, endTime: number): UsageRecord[];

  /** Get all records */
  getAll(): UsageRecord[];

  /** Get record count */
  count(): number;

  /** Clear all records */
  clear(): void;

  /** Prune records older than timestamp */
  pruneOlderThan(timestamp: number): void;
}
