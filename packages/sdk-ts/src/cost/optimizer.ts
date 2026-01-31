/**
 * AgentOps SDK - Intelligent Cost Optimizer
 *
 * AI-powered cost optimization with recommendations, simulation,
 * and automatic optimization capabilities.
 *
 * This class serves as a facade over the focused classes:
 * - CostAnalyzer: Cost analysis and waste detection
 * - CostSimulator: What-if scenario simulation
 * - RecommendationEngine: Recommendation generation and management
 *
 * For more granular control, use the focused classes directly.
 */

import { calculateCost, getModelPricing } from "../pricing.js";
import { now, generateEventId } from "../utils.js";

// NOTE: Focused classes are available for direct use:
// - CostAnalyzer: For cost analysis and waste detection
// - CostSimulator: For what-if scenario simulation
// - RecommendationEngine: For recommendation generation and management

// Re-export all types from types.ts for backward compatibility
export type {
  CostOptimizerConfig,
  OptimizationStrategy,
  ModelTierMapping,
  CostAnalysis,
  ModelCostBreakdown,
  FeatureCostBreakdown,
  HourlyCost,
  WasteAnalysis,
  WasteCategory,
  EfficiencyMetrics,
  CostRecommendation,
  RecommendationAction,
  CostSimulation,
  SimulationScenario,
  RealizedSavings,
  UsageRecord,
  UsageRecordStore,
} from "./types.js";

import type {
  CostOptimizerConfig,
  OptimizationStrategy,
  ModelTierMapping,
  CostAnalysis,
  CostRecommendation,
  CostSimulation,
  RealizedSavings,
  UsageRecord,
  ModelCostBreakdown,
  FeatureCostBreakdown,
  WasteAnalysis,
  WasteCategory,
  EfficiencyMetrics,
} from "./types.js";

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_MODEL_TIERS: ModelTierMapping = {
  premium: ["gpt-4", "gpt-4-32k", "claude-3-opus", "o1", "o1-preview"],
  standard: [
    "gpt-4o",
    "gpt-4-turbo",
    "claude-3-5-sonnet",
    "claude-3-sonnet",
    "o1-mini",
  ],
  economy: [
    "gpt-4o-mini",
    "gpt-3.5-turbo",
    "claude-3-5-haiku",
    "claude-3-haiku",
    "gemini-1.5-flash",
  ],
};

const MODEL_DOWNGRADE_MAP: Record<string, string[]> = {
  "gpt-4": ["gpt-4-turbo", "gpt-4o"],
  "gpt-4-turbo": ["gpt-4o", "gpt-4o-mini"],
  "gpt-4o": ["gpt-4o-mini"],
  "claude-3-opus": ["claude-3-5-sonnet", "claude-3-sonnet"],
  "claude-3-5-sonnet": ["claude-3-5-haiku"],
  "claude-3-sonnet": ["claude-3-haiku"],
  o1: ["o1-mini"],
  "o1-preview": ["o1-mini"],
};

// ============================================================================
// Cost Optimizer (Facade)
// ============================================================================

export class CostOptimizer {
  private readonly config: Required<
    Omit<CostOptimizerConfig, "onRecommendation" | "onSavingsRealized">
  > & {
    onRecommendation?: (recommendation: CostRecommendation) => void;
    onSavingsRealized?: (savings: RealizedSavings) => void;
  };
  private usageHistory: UsageRecord[] = [];
  private recommendations: Map<string, CostRecommendation> = new Map();
  private appliedOptimizations: Map<
    string,
    { strategy: OptimizationStrategy; appliedAt: number }
  > = new Map();
  private promptCache: Map<
    string,
    { response: string; cost: number; timestamp: number }
  > = new Map();

  constructor(config: CostOptimizerConfig) {
    this.config = {
      enabled: config.enabled,
      qualityThreshold: config.qualityThreshold ?? 7.0,
      maxLatencyIncrease: config.maxLatencyIncrease ?? 0.3,
      autoOptimize: config.autoOptimize ?? false,
      autoStrategies: config.autoStrategies ?? [
        "response_caching",
        "model_downgrade",
      ],
      modelTiers: config.modelTiers ?? DEFAULT_MODEL_TIERS,
      onRecommendation: config.onRecommendation,
      onSavingsRealized: config.onSavingsRealized,
    };
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  // =========================================================================
  // Usage Recording
  // =========================================================================

  /**
   * Record usage for analysis
   */
  recordUsage(record: UsageRecord): void {
    if (!this.config.enabled) return;
    this.usageHistory.push(record);

    // Trim old records (keep last 30 days)
    const cutoff = now() - 30 * 24 * 60 * 60 * 1000;
    this.usageHistory = this.usageHistory.filter((r) => r.timestamp > cutoff);
  }

  /**
   * Bulk import usage data
   */
  importUsageData(records: UsageRecord[]): void {
    if (!this.config.enabled) return;
    this.usageHistory.push(...records);
  }

  // =========================================================================
  // Cost Analysis
  // =========================================================================

  /**
   * Analyze costs for a given time period
   */
  analyzeCosts(startTime?: number, endTime?: number): CostAnalysis {
    const end = endTime ?? now();
    const start = startTime ?? end - 30 * 24 * 60 * 60 * 1000;

    const records = this.usageHistory.filter(
      (r) => r.timestamp >= start && r.timestamp <= end,
    );

    const byModel: Record<string, ModelCostBreakdown> = {};
    const byFeature: Record<string, FeatureCostBreakdown> = {};
    const byUser: Record<string, number> = {};
    const byHour: Map<number, { cost: number; count: number }> = new Map();

    let totalCost = 0;
    let totalSuccesses = 0;
    let totalQuality = 0;
    let qualityCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const record of records) {
      const cost = calculateCost(
        record.model,
        record.inputTokens,
        record.outputTokens,
      );
      totalCost += cost;
      totalInputTokens += record.inputTokens;
      totalOutputTokens += record.outputTokens;

      if (record.success) totalSuccesses++;
      if (record.qualityScore !== undefined) {
        totalQuality += record.qualityScore;
        qualityCount++;
      }

      // By model
      if (!byModel[record.model]) {
        byModel[record.model] = {
          totalCost: 0,
          inputCost: 0,
          outputCost: 0,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          requestCount: 0,
          avgCostPerRequest: 0,
          avgTokensPerRequest: 0,
        };
      }
      const modelBreakdown = byModel[record.model];
      const pricing = getModelPricing(record.model);
      modelBreakdown.totalCost += cost;
      modelBreakdown.inputCost += pricing
        ? (record.inputTokens / 1000) * pricing.input
        : 0;
      modelBreakdown.outputCost += pricing
        ? (record.outputTokens / 1000) * pricing.output
        : 0;
      modelBreakdown.totalTokens += record.inputTokens + record.outputTokens;
      modelBreakdown.inputTokens += record.inputTokens;
      modelBreakdown.outputTokens += record.outputTokens;
      modelBreakdown.requestCount++;

      // By feature
      if (record.featureId) {
        if (!byFeature[record.featureId]) {
          byFeature[record.featureId] = {
            totalCost: 0,
            requestCount: 0,
            avgCostPerRequest: 0,
            primaryModel: record.model,
          };
        }
        byFeature[record.featureId].totalCost += cost;
        byFeature[record.featureId].requestCount++;
      }

      // By user
      if (record.userId) {
        byUser[record.userId] = (byUser[record.userId] ?? 0) + cost;
      }

      // By hour
      const hour = Math.floor(record.timestamp / (60 * 60 * 1000));
      const hourData = byHour.get(hour) ?? { cost: 0, count: 0 };
      hourData.cost += cost;
      hourData.count++;
      byHour.set(hour, hourData);
    }

    // Calculate averages
    for (const model of Object.keys(byModel)) {
      const m = byModel[model];
      m.avgCostPerRequest =
        m.requestCount > 0 ? m.totalCost / m.requestCount : 0;
      m.avgTokensPerRequest =
        m.requestCount > 0 ? m.totalTokens / m.requestCount : 0;
    }

    for (const feature of Object.keys(byFeature)) {
      const f = byFeature[feature];
      f.avgCostPerRequest =
        f.requestCount > 0 ? f.totalCost / f.requestCount : 0;
    }

    // Analyze waste
    const waste = this.analyzeWaste(records, byModel);

    // Calculate efficiency metrics
    const efficiency: EfficiencyMetrics = {
      costPerSuccess: totalSuccesses > 0 ? totalCost / totalSuccesses : 0,
      tokensPerSuccess:
        totalSuccesses > 0
          ? (totalInputTokens + totalOutputTokens) / totalSuccesses
          : 0,
      avgQualityScore: qualityCount > 0 ? totalQuality / qualityCount : 0,
      tokenEfficiency:
        totalInputTokens > 0 ? totalOutputTokens / totalInputTokens : 0,
      modelOptimality: this.calculateModelOptimality(records),
    };

    return {
      id: generateEventId(),
      period: { start, end },
      totalCost,
      breakdown: {
        byModel,
        byFeature,
        byUser,
        byHour: Array.from(byHour.entries()).map(([hour, data]) => ({
          hour: hour * 60 * 60 * 1000,
          cost: data.cost,
          requestCount: data.count,
        })),
      },
      waste,
      efficiency,
      generatedAt: now(),
    };
  }

  // =========================================================================
  // Recommendations
  // =========================================================================

  /**
   * Generate cost optimization recommendations
   */
  generateRecommendations(): CostRecommendation[] {
    const analysis = this.analyzeCosts();
    const recommendations: CostRecommendation[] = [];

    // Strategy 1: Model Downgrade
    recommendations.push(
      ...this.generateModelDowngradeRecommendations(analysis),
    );

    // Strategy 2: Prompt Compression
    recommendations.push(
      ...this.generatePromptCompressionRecommendations(analysis),
    );

    // Strategy 3: Response Caching
    recommendations.push(...this.generateCachingRecommendations(analysis));

    // Strategy 4: Batch Requests
    recommendations.push(...this.generateBatchingRecommendations(analysis));

    // Strategy 5: Context Pruning
    recommendations.push(
      ...this.generateContextPruningRecommendations(analysis),
    );

    // Sort by priority
    recommendations.sort((a, b) => b.priority - a.priority);

    // Store and notify
    for (const rec of recommendations) {
      this.recommendations.set(rec.id, rec);
      if (this.config.onRecommendation) {
        this.config.onRecommendation(rec);
      }
    }

    return recommendations;
  }

  /**
   * Get a specific recommendation
   */
  getRecommendation(id: string): CostRecommendation | undefined {
    return this.recommendations.get(id);
  }

  /**
   * List all recommendations
   */
  listRecommendations(
    status?: CostRecommendation["status"],
  ): CostRecommendation[] {
    const recs = Array.from(this.recommendations.values());
    if (status) {
      return recs.filter((r) => r.status === status);
    }
    return recs;
  }

  /**
   * Apply a recommendation
   */
  applyRecommendation(id: string): boolean {
    const rec = this.recommendations.get(id);
    if (!rec) return false;

    rec.status = "applied";
    this.appliedOptimizations.set(id, {
      strategy: rec.strategy,
      appliedAt: now(),
    });

    return true;
  }

  /**
   * Dismiss a recommendation
   */
  dismissRecommendation(id: string): boolean {
    const rec = this.recommendations.get(id);
    if (!rec) return false;

    rec.status = "dismissed";
    return true;
  }

  // =========================================================================
  // Simulation
  // =========================================================================

  /**
   * Simulate cost savings for given strategies
   */
  simulateOptimizations(
    strategies: OptimizationStrategy[],
    options?: {
      period?: { start: number; end: number };
      qualityThreshold?: number;
    },
  ): CostSimulation {
    const end = options?.period?.end ?? now();
    const start = options?.period?.start ?? end - 30 * 24 * 60 * 60 * 1000;
    const qualityThreshold =
      options?.qualityThreshold ?? this.config.qualityThreshold;

    const analysis = this.analyzeCosts(start, end);
    const baselineCost = analysis.totalCost;

    let simulatedCost = baselineCost;
    let qualityImpact = 0;
    let latencyImpact = 0;
    const strategyBreakdown: CostSimulation["strategyBreakdown"] = [];

    for (const strategy of strategies) {
      const result = this.simulateStrategy(
        strategy,
        analysis,
        qualityThreshold,
      );
      simulatedCost -= result.savings;
      qualityImpact += result.qualityImpact;
      latencyImpact += result.latencyImpact;
      strategyBreakdown.push({
        strategy,
        savings: result.savings,
        qualityImpact: result.qualityImpact,
        latencyImpact: result.latencyImpact,
      });
    }

    const savings = baselineCost - simulatedCost;
    const savingsPercent =
      baselineCost > 0 ? (savings / baselineCost) * 100 : 0;

    // Assess risk
    let riskLevel: "low" | "medium" | "high";
    if (Math.abs(qualityImpact) < 0.5 && latencyImpact < 10) {
      riskLevel = "low";
    } else if (Math.abs(qualityImpact) < 1.0 && latencyImpact < 30) {
      riskLevel = "medium";
    } else {
      riskLevel = "high";
    }

    return {
      id: generateEventId(),
      baselineCost,
      simulatedCost,
      savings,
      savingsPercent,
      qualityImpact,
      latencyImpact,
      strategiesApplied: strategies,
      strategyBreakdown,
      riskLevel,
      createdAt: now(),
    };
  }

  // =========================================================================
  // Auto-Optimization
  // =========================================================================

  /**
   * Get optimized model for a request
   */
  getOptimizedModel(
    requestedModel: string,
    options?: {
      featureId?: string;
      qualityRequired?: number;
      latencyBudgetMs?: number;
    },
  ): { model: string; reason?: string; estimatedSavings?: number } {
    if (!this.config.autoOptimize) {
      return { model: requestedModel };
    }

    if (!this.config.autoStrategies.includes("model_downgrade")) {
      return { model: requestedModel };
    }

    const qualityRequired =
      options?.qualityRequired ?? this.config.qualityThreshold;

    // Check if feature has good quality with cheaper models
    if (options?.featureId) {
      const featureRecords = this.usageHistory.filter(
        (r) =>
          r.featureId === options.featureId && r.qualityScore !== undefined,
      );

      // Group by model and calculate average quality
      const modelQuality: Record<string, { total: number; count: number }> = {};
      for (const record of featureRecords) {
        if (!modelQuality[record.model]) {
          modelQuality[record.model] = { total: 0, count: 0 };
        }
        modelQuality[record.model].total += record.qualityScore!;
        modelQuality[record.model].count++;
      }

      // Find cheapest model that meets quality threshold
      const downgrades = MODEL_DOWNGRADE_MAP[requestedModel] ?? [];
      for (const downgrade of downgrades) {
        const quality = modelQuality[downgrade];
        if (quality && quality.count >= 10) {
          const avgQuality = quality.total / quality.count;
          if (avgQuality >= qualityRequired) {
            const originalPricing = getModelPricing(requestedModel);
            const downgradePricing = getModelPricing(downgrade);
            if (originalPricing && downgradePricing) {
              const savingsPercent =
                1 - downgradePricing.input / originalPricing.input;
              return {
                model: downgrade,
                reason: `Auto-downgraded based on historical quality (avg: ${avgQuality.toFixed(1)})`,
                estimatedSavings: savingsPercent,
              };
            }
          }
        }
      }
    }

    return { model: requestedModel };
  }

  /**
   * Check cache for a prompt
   */
  checkCache(promptHash: string): {
    hit: boolean;
    response?: string;
    savedCost?: number;
  } {
    if (
      !this.config.autoOptimize ||
      !this.config.autoStrategies.includes("response_caching")
    ) {
      return { hit: false };
    }

    const cached = this.promptCache.get(promptHash);
    if (cached && cached.timestamp > now() - 3600000) {
      return {
        hit: true,
        response: cached.response,
        savedCost: cached.cost,
      };
    }

    return { hit: false };
  }

  /**
   * Add response to cache
   */
  addToCache(promptHash: string, response: string, cost: number): void {
    if (
      !this.config.autoOptimize ||
      !this.config.autoStrategies.includes("response_caching")
    ) {
      return;
    }

    this.promptCache.set(promptHash, {
      response,
      cost,
      timestamp: now(),
    });

    // Limit cache size
    if (this.promptCache.size > 10000) {
      const oldest = Array.from(this.promptCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, 1000);
      for (const [key] of oldest) {
        this.promptCache.delete(key);
      }
    }
  }

  // =========================================================================
  // Savings Tracking
  // =========================================================================

  /**
   * Calculate realized savings
   */
  calculateRealizedSavings(
    startTime?: number,
    endTime?: number,
  ): RealizedSavings {
    const end = endTime ?? now();
    const start = startTime ?? end - 30 * 24 * 60 * 60 * 1000;

    const byStrategy: Record<OptimizationStrategy, number> = {
      model_downgrade: 0,
      prompt_compression: 0,
      response_caching: 0,
      batch_requests: 0,
      context_pruning: 0,
      token_limit_adjustment: 0,
    };

    const byModel: Record<string, number> = {};
    const byFeature: Record<string, number> = {};

    // Calculate savings from cache hits
    const records = this.usageHistory.filter(
      (r) => r.timestamp >= start && r.timestamp <= end && r.cached,
    );

    for (const record of records) {
      const cost = calculateCost(
        record.model,
        record.inputTokens,
        record.outputTokens,
      );
      byStrategy.response_caching += cost;
      byModel[record.model] = (byModel[record.model] ?? 0) + cost;
      if (record.featureId) {
        byFeature[record.featureId] = (byFeature[record.featureId] ?? 0) + cost;
      }
    }

    const totalSavings = Object.values(byStrategy).reduce((a, b) => a + b, 0);

    return {
      period: { start, end },
      totalSavings,
      byStrategy,
      byModel,
      byFeature,
    };
  }

  // =========================================================================
  // Private Methods - Waste Analysis
  // =========================================================================

  private analyzeWaste(
    records: UsageRecord[],
    byModel: Record<string, ModelCostBreakdown>,
  ): WasteAnalysis {
    const categories: WasteCategory[] = [];
    let totalWaste = 0;
    let totalCost = 0;

    for (const model of Object.keys(byModel)) {
      totalCost += byModel[model].totalCost;
    }

    // Oversized context detection
    const oversizedRecords = records.filter((r) => r.inputTokens > 4000);
    if (oversizedRecords.length > 0) {
      const avgOversized =
        oversizedRecords.reduce((sum, r) => sum + r.inputTokens, 0) /
        oversizedRecords.length;
      const wasteEstimate =
        oversizedRecords.length * (avgOversized - 2000) * 0.000003;
      categories.push({
        type: "oversized_context",
        description: `${oversizedRecords.length} requests with >4000 input tokens`,
        estimatedWaste: wasteEstimate,
        affectedRequests: oversizedRecords.length,
      });
      totalWaste += wasteEstimate;
    }

    // Redundant prompts (similar prompts to same model)
    const promptHashes = new Map<string, number>();
    for (const record of records) {
      if (record.prompt) {
        const hash = this.simpleHash(record.prompt);
        promptHashes.set(hash, (promptHashes.get(hash) ?? 0) + 1);
      }
    }
    const duplicates = Array.from(promptHashes.values()).filter((c) => c > 1);
    if (duplicates.length > 0) {
      const duplicateCount = duplicates.reduce(
        (a, b) => a + b - duplicates.length,
        0,
      );
      const avgCost = records.length > 0 ? totalCost / records.length : 0;
      const wasteEstimate = duplicateCount * avgCost;
      categories.push({
        type: "redundant_prompts",
        description: `${duplicateCount} potentially duplicate requests`,
        estimatedWaste: wasteEstimate,
        affectedRequests: duplicateCount,
      });
      totalWaste += wasteEstimate;
    }

    // Inefficient model usage
    for (const model of Object.keys(byModel)) {
      const downgrades = MODEL_DOWNGRADE_MAP[model];
      if (downgrades && downgrades.length > 0) {
        const currentPricing = getModelPricing(model);
        const downgradePricing = getModelPricing(downgrades[0]);
        if (currentPricing && downgradePricing) {
          const potentialSavings =
            byModel[model].totalCost *
            (1 - downgradePricing.input / currentPricing.input);
          if (potentialSavings > 1) {
            categories.push({
              type: "inefficient_model",
              description: `${model} could potentially be replaced with ${downgrades[0]}`,
              estimatedWaste: potentialSavings * 0.3,
              affectedRequests: byModel[model].requestCount,
            });
            totalWaste += potentialSavings * 0.3;
          }
        }
      }
    }

    // Retry waste
    const failedRecords = records.filter((r) => !r.success);
    if (failedRecords.length > 0) {
      const wasteEstimate = failedRecords.reduce(
        (sum, r) => sum + calculateCost(r.model, r.inputTokens, r.outputTokens),
        0,
      );
      categories.push({
        type: "retry_waste",
        description: `${failedRecords.length} failed requests`,
        estimatedWaste: wasteEstimate,
        affectedRequests: failedRecords.length,
      });
      totalWaste += wasteEstimate;
    }

    return {
      estimatedWaste: totalWaste,
      wastePercentage: totalCost > 0 ? (totalWaste / totalCost) * 100 : 0,
      categories,
    };
  }

  private calculateModelOptimality(records: UsageRecord[]): number {
    if (records.length === 0) return 100;

    let optimalCount = 0;
    const economyModels = new Set(this.config.modelTiers.economy);

    for (const record of records) {
      if (economyModels.has(record.model)) {
        optimalCount++;
      } else if (
        record.qualityScore !== undefined &&
        record.qualityScore >= 8
      ) {
        optimalCount++;
      }
    }

    return (optimalCount / records.length) * 100;
  }

  // =========================================================================
  // Private Methods - Recommendation Generation
  // =========================================================================

  private generateModelDowngradeRecommendations(
    analysis: CostAnalysis,
  ): CostRecommendation[] {
    const recommendations: CostRecommendation[] = [];

    for (const [model, breakdown] of Object.entries(
      analysis.breakdown.byModel,
    )) {
      const downgrades = MODEL_DOWNGRADE_MAP[model];
      if (!downgrades || downgrades.length === 0) continue;

      const currentPricing = getModelPricing(model);
      const downgradePricing = getModelPricing(downgrades[0]);
      if (!currentPricing || !downgradePricing) continue;

      const savingsPercent =
        1 -
        (downgradePricing.input + downgradePricing.output) /
          (currentPricing.input + currentPricing.output);

      if (savingsPercent < 0.2) continue;

      const estimatedMonthlySavings = breakdown.totalCost * savingsPercent;
      if (estimatedMonthlySavings < 10) continue;

      recommendations.push({
        id: generateEventId(),
        strategy: "model_downgrade",
        title: `Switch from ${model} to ${downgrades[0]}`,
        description: `Based on usage patterns, ${model} could be replaced with ${downgrades[0]} for ${(savingsPercent * 100).toFixed(0)}% cost savings.`,
        estimatedMonthlySavings,
        confidence: 0.7,
        difficulty: "low",
        qualityImpact: -0.5,
        latencyImpact: -5,
        actions: [
          {
            type: "model_switch",
            description: `Change model from ${model} to ${downgrades[0]}`,
            before: model,
            after: downgrades[0],
            automatic: true,
          },
        ],
        scope: { models: [model] },
        priority: estimatedMonthlySavings * 0.7,
        createdAt: now(),
        status: "pending",
      });
    }

    return recommendations;
  }

  private generatePromptCompressionRecommendations(
    analysis: CostAnalysis,
  ): CostRecommendation[] {
    const recommendations: CostRecommendation[] = [];

    for (const [model, breakdown] of Object.entries(
      analysis.breakdown.byModel,
    )) {
      const avgInputTokens = breakdown.inputTokens / breakdown.requestCount;

      if (avgInputTokens > 2000) {
        const compressionSavings = breakdown.inputCost * 0.3;

        if (compressionSavings > 10) {
          recommendations.push({
            id: generateEventId(),
            strategy: "prompt_compression",
            title: `Compress prompts for ${model}`,
            description: `Average input size is ${avgInputTokens.toFixed(0)} tokens. Prompt compression could reduce costs by ~30%.`,
            estimatedMonthlySavings: compressionSavings,
            confidence: 0.6,
            difficulty: "medium",
            qualityImpact: -0.2,
            latencyImpact: -10,
            actions: [
              {
                type: "prompt_edit",
                description: "Review and compress system prompts",
                automatic: false,
              },
            ],
            scope: { models: [model] },
            priority: compressionSavings * 0.6,
            createdAt: now(),
            status: "pending",
          });
        }
      }
    }

    return recommendations;
  }

  private generateCachingRecommendations(
    analysis: CostAnalysis,
  ): CostRecommendation[] {
    const recommendations: CostRecommendation[] = [];

    if (analysis.waste.categories.some((c) => c.type === "redundant_prompts")) {
      const redundantWaste = analysis.waste.categories.find(
        (c) => c.type === "redundant_prompts",
      );
      if (redundantWaste && redundantWaste.estimatedWaste > 10) {
        recommendations.push({
          id: generateEventId(),
          strategy: "response_caching",
          title: "Enable response caching",
          description: `Detected ${redundantWaste.affectedRequests} potentially duplicate requests.`,
          estimatedMonthlySavings: redundantWaste.estimatedWaste,
          confidence: 0.8,
          difficulty: "low",
          qualityImpact: 0,
          latencyImpact: -90,
          actions: [
            {
              type: "cache_enable",
              description: "Enable semantic caching for repeated queries",
              automatic: true,
            },
          ],
          scope: {},
          priority: redundantWaste.estimatedWaste * 0.8,
          createdAt: now(),
          status: "pending",
        });
      }
    }

    return recommendations;
  }

  private generateBatchingRecommendations(
    analysis: CostAnalysis,
  ): CostRecommendation[] {
    const recommendations: CostRecommendation[] = [];

    const hourlyData = analysis.breakdown.byHour;
    const avgRequestsPerHour =
      hourlyData.reduce((sum, h) => sum + h.requestCount, 0) /
      Math.max(hourlyData.length, 1);

    if (avgRequestsPerHour > 100) {
      const estimatedSavings = analysis.totalCost * 0.1;

      if (estimatedSavings > 20) {
        recommendations.push({
          id: generateEventId(),
          strategy: "batch_requests",
          title: "Enable request batching",
          description: `With ${avgRequestsPerHour.toFixed(0)} requests/hour, batching could reduce overhead.`,
          estimatedMonthlySavings: estimatedSavings,
          confidence: 0.5,
          difficulty: "high",
          qualityImpact: 0,
          latencyImpact: 20,
          actions: [
            {
              type: "code_change",
              description: "Implement request batching for bulk operations",
              automatic: false,
            },
          ],
          scope: {},
          priority: estimatedSavings * 0.5,
          createdAt: now(),
          status: "pending",
        });
      }
    }

    return recommendations;
  }

  private generateContextPruningRecommendations(
    analysis: CostAnalysis,
  ): CostRecommendation[] {
    const recommendations: CostRecommendation[] = [];

    const oversizedWaste = analysis.waste.categories.find(
      (c) => c.type === "oversized_context",
    );
    if (oversizedWaste && oversizedWaste.estimatedWaste > 10) {
      recommendations.push({
        id: generateEventId(),
        strategy: "context_pruning",
        title: "Prune context windows",
        description: `${oversizedWaste.affectedRequests} requests have >4000 tokens.`,
        estimatedMonthlySavings: oversizedWaste.estimatedWaste,
        confidence: 0.65,
        difficulty: "medium",
        qualityImpact: -0.3,
        latencyImpact: -15,
        actions: [
          {
            type: "code_change",
            description: "Implement sliding window context management",
            automatic: false,
          },
        ],
        scope: {},
        priority: oversizedWaste.estimatedWaste * 0.65,
        createdAt: now(),
        status: "pending",
      });
    }

    return recommendations;
  }

  // =========================================================================
  // Private Methods - Simulation
  // =========================================================================

  private simulateStrategy(
    strategy: OptimizationStrategy,
    analysis: CostAnalysis,
    _qualityThreshold: number,
  ): { savings: number; qualityImpact: number; latencyImpact: number } {
    switch (strategy) {
      case "model_downgrade": {
        let savings = 0;
        for (const [model, breakdown] of Object.entries(
          analysis.breakdown.byModel,
        )) {
          const downgrades = MODEL_DOWNGRADE_MAP[model];
          if (downgrades && downgrades.length > 0) {
            const currentPricing = getModelPricing(model);
            const downgradePricing = getModelPricing(downgrades[0]);
            if (currentPricing && downgradePricing) {
              const savingsPercent =
                1 - downgradePricing.input / currentPricing.input;
              savings += breakdown.totalCost * savingsPercent * 0.5;
            }
          }
        }
        return { savings, qualityImpact: -0.5, latencyImpact: -5 };
      }

      case "prompt_compression": {
        let inputCost = 0;
        for (const breakdown of Object.values(analysis.breakdown.byModel)) {
          inputCost += breakdown.inputCost;
        }
        return {
          savings: inputCost * 0.25,
          qualityImpact: -0.2,
          latencyImpact: -10,
        };
      }

      case "response_caching": {
        const cacheableWaste = analysis.waste.categories.find(
          (c) => c.type === "redundant_prompts",
        );
        return {
          savings: cacheableWaste?.estimatedWaste ?? 0,
          qualityImpact: 0,
          latencyImpact: -80,
        };
      }

      case "batch_requests":
        return {
          savings: analysis.totalCost * 0.08,
          qualityImpact: 0,
          latencyImpact: 15,
        };

      case "context_pruning": {
        const oversizedWaste = analysis.waste.categories.find(
          (c) => c.type === "oversized_context",
        );
        return {
          savings: oversizedWaste?.estimatedWaste ?? 0,
          qualityImpact: -0.3,
          latencyImpact: -15,
        };
      }

      case "token_limit_adjustment":
        return {
          savings: analysis.totalCost * 0.05,
          qualityImpact: -0.1,
          latencyImpact: -5,
        };

      default:
        return { savings: 0, qualityImpact: 0, latencyImpact: 0 };
    }
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}
