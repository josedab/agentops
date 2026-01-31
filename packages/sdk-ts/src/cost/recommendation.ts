/**
 * Recommendation Engine
 *
 * Generates, manages, and tracks cost optimization recommendations.
 */

import { now, generateEventId } from "../utils.js";
import { CostAnalyzer } from "./analyzer.js";
import { CostSimulator } from "./simulator.js";
import type {
  CostRecommendation,
  UsageRecord,
  CostAnalysis,
  ModelTierMapping,
} from "./types.js";

/**
 * Model downgrade paths (premium -> cheaper alternatives)
 */
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

/**
 * Configuration for RecommendationEngine
 */
export interface RecommendationEngineConfig {
  /** Quality threshold for recommendations */
  qualityThreshold?: number;
  /** Maximum acceptable latency increase */
  maxLatencyIncrease?: number;
  /** Custom model tiers */
  modelTiers?: ModelTierMapping;
  /** Callback when recommendation is generated */
  onRecommendation?: (recommendation: CostRecommendation) => void;
}

/**
 * Default model tier mappings
 */
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

/**
 * Generates and manages cost optimization recommendations
 */
export class RecommendationEngine {
  private readonly qualityThreshold: number;
  private readonly maxLatencyIncrease: number;
  private readonly modelTiers: ModelTierMapping;
  private readonly onRecommendation?: (
    recommendation: CostRecommendation,
  ) => void;

  private readonly analyzer: CostAnalyzer;
  private readonly simulator: CostSimulator;
  private readonly recommendations: Map<string, CostRecommendation> = new Map();

  constructor(config?: RecommendationEngineConfig) {
    this.qualityThreshold = config?.qualityThreshold ?? 7.0;
    this.maxLatencyIncrease = config?.maxLatencyIncrease ?? 0.3;
    this.modelTiers = config?.modelTiers ?? DEFAULT_MODEL_TIERS;
    this.onRecommendation = config?.onRecommendation;

    this.analyzer = new CostAnalyzer({ modelTiers: this.modelTiers });
    this.simulator = new CostSimulator({
      qualityThreshold: this.qualityThreshold,
      maxLatencyIncrease: this.maxLatencyIncrease,
    });
  }

  /**
   * Generate recommendations based on usage records
   */
  generate(records: UsageRecord[]): CostRecommendation[] {
    if (records.length === 0) return [];

    const analysis = this.analyzer.analyze(records);
    const recommendations: CostRecommendation[] = [];

    // Check for model downgrade opportunities
    const modelDowngrade = this.checkModelDowngradeOpportunity(
      records,
      analysis,
    );
    if (modelDowngrade) {
      recommendations.push(modelDowngrade);
    }

    // Check for caching opportunities
    const caching = this.checkCachingOpportunity(records, analysis);
    if (caching) {
      recommendations.push(caching);
    }

    // Check for prompt compression opportunities
    const compression = this.checkCompressionOpportunity(records, analysis);
    if (compression) {
      recommendations.push(compression);
    }

    // Check for batching opportunities
    const batching = this.checkBatchingOpportunity(records, analysis);
    if (batching) {
      recommendations.push(batching);
    }

    // Sort by priority (highest first)
    recommendations.sort((a, b) => b.priority - a.priority);

    // Store and notify
    for (const rec of recommendations) {
      this.recommendations.set(rec.id, rec);
      this.onRecommendation?.(rec);
    }

    return recommendations;
  }

  /**
   * Get a specific recommendation by ID
   */
  get(id: string): CostRecommendation | undefined {
    return this.recommendations.get(id);
  }

  /**
   * Get all pending recommendations
   */
  getPending(): CostRecommendation[] {
    return Array.from(this.recommendations.values()).filter(
      (r) => r.status === "pending",
    );
  }

  /**
   * Get all recommendations
   */
  getAll(): CostRecommendation[] {
    return Array.from(this.recommendations.values());
  }

  /**
   * Apply a recommendation (mark as applied)
   */
  apply(id: string): boolean {
    const rec = this.recommendations.get(id);
    if (!rec || rec.status !== "pending") return false;

    rec.status = "applied";
    return true;
  }

  /**
   * Dismiss a recommendation
   */
  dismiss(id: string): boolean {
    const rec = this.recommendations.get(id);
    if (!rec || rec.status !== "pending") return false;

    rec.status = "dismissed";
    return true;
  }

  /**
   * Clear all recommendations
   */
  clear(): void {
    this.recommendations.clear();
  }

  private checkModelDowngradeOpportunity(
    records: UsageRecord[],
    analysis: CostAnalysis,
  ): CostRecommendation | null {
    const downgradeCandidates: {
      model: string;
      count: number;
      savings: number;
    }[] = [];

    for (const [model, breakdown] of Object.entries(
      analysis.breakdown.byModel,
    )) {
      const downgrades = MODEL_DOWNGRADE_MAP[model];
      if (!downgrades) continue;

      // Check if this model is being used for tasks that could use cheaper alternative
      const modelRecords = records.filter((r) => r.model === model);
      const avgQuality =
        modelRecords.reduce((sum, r) => sum + (r.qualityScore ?? 7), 0) /
        modelRecords.length;

      if (avgQuality >= this.qualityThreshold + 1) {
        // Simulate savings
        const simulation = this.simulator.simulate(modelRecords, [
          "model_downgrade",
        ]);
        if (simulation.savings > breakdown.totalCost * 0.1) {
          downgradeCandidates.push({
            model,
            count: breakdown.requestCount,
            savings: simulation.savings,
          });
        }
      }
    }

    if (downgradeCandidates.length === 0) return null;

    const totalSavings = downgradeCandidates.reduce(
      (sum, c) => sum + c.savings,
      0,
    );
    const monthlySavings = this.extrapolateMonthly(records, totalSavings);
    const primaryModel = downgradeCandidates.sort(
      (a, b) => b.savings - a.savings,
    )[0];

    return this.createRecommendation({
      strategy: "model_downgrade",
      title: `Switch from ${primaryModel.model} to cheaper alternative`,
      description: `${downgradeCandidates.length} model(s) can be downgraded while maintaining quality above ${this.qualityThreshold}`,
      estimatedMonthlySavings: monthlySavings,
      confidence: 0.8,
      difficulty: "low",
      qualityImpact: -0.5,
      latencyImpact: -0.1,
      priority: this.calculatePriority(monthlySavings, "low", -0.5),
      actions: downgradeCandidates.map((c) => ({
        type: "model_switch" as const,
        description: `Switch ${c.model} to ${MODEL_DOWNGRADE_MAP[c.model][0]}`,
        before: c.model,
        after: MODEL_DOWNGRADE_MAP[c.model][0],
        automatic: true,
      })),
      scope: {
        models: downgradeCandidates.map((c) => c.model),
      },
    });
  }

  private checkCachingOpportunity(
    records: UsageRecord[],
    _analysis: CostAnalysis,
  ): CostRecommendation | null {
    // Look for duplicate or similar prompts
    const promptHashes = new Map<string, number>();
    let duplicateCount = 0;

    for (const record of records) {
      if (record.prompt) {
        const hash = this.simpleHash(record.prompt);
        const count = promptHashes.get(hash) || 0;
        if (count > 0) duplicateCount++;
        promptHashes.set(hash, count + 1);
      }
    }

    const duplicationRate =
      records.length > 0 ? duplicateCount / records.length : 0;
    if (duplicationRate < 0.05) return null; // Less than 5% duplicates

    const simulation = this.simulator.simulate(records, ["response_caching"]);
    const monthlySavings = this.extrapolateMonthly(records, simulation.savings);

    return this.createRecommendation({
      strategy: "response_caching",
      title: "Enable response caching for repeated prompts",
      description: `${(duplicationRate * 100).toFixed(1)}% of prompts are duplicates. Caching could significantly reduce costs.`,
      estimatedMonthlySavings: monthlySavings,
      confidence: 0.9,
      difficulty: "low",
      qualityImpact: 0,
      latencyImpact: -0.5 * duplicationRate,
      priority: this.calculatePriority(monthlySavings, "low", 0),
      actions: [
        {
          type: "cache_enable",
          description: "Enable prompt-response caching",
          automatic: true,
        },
      ],
      scope: {},
    });
  }

  private checkCompressionOpportunity(
    records: UsageRecord[],
    _analysis: CostAnalysis,
  ): CostRecommendation | null {
    // Check for large prompts that could be compressed
    const largePromptRecords = records.filter((r) => r.inputTokens > 2000);
    if (largePromptRecords.length < records.length * 0.1) return null;

    const simulation = this.simulator.simulate(largePromptRecords, [
      "prompt_compression",
    ]);
    const monthlySavings = this.extrapolateMonthly(records, simulation.savings);

    if (monthlySavings < 10) return null; // Not worth it for small savings

    return this.createRecommendation({
      strategy: "prompt_compression",
      title: "Compress large prompts to reduce token usage",
      description: `${largePromptRecords.length} requests use >2000 input tokens. Compression could reduce costs.`,
      estimatedMonthlySavings: monthlySavings,
      confidence: 0.7,
      difficulty: "medium",
      qualityImpact: -0.2,
      latencyImpact: -0.1,
      priority: this.calculatePriority(monthlySavings, "medium", -0.2),
      actions: [
        {
          type: "prompt_edit",
          description:
            "Review and compress prompts over 2000 tokens. Consider removing redundant instructions and examples.",
          automatic: false,
        },
      ],
      scope: {},
    });
  }

  private checkBatchingOpportunity(
    records: UsageRecord[],
    _analysis: CostAnalysis,
  ): CostRecommendation | null {
    // Check if requests are coming in rapid succession (could be batched)
    const sortedRecords = [...records].sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    let rapidSuccession = 0;

    for (let i = 1; i < sortedRecords.length; i++) {
      if (sortedRecords[i].timestamp - sortedRecords[i - 1].timestamp < 1000) {
        rapidSuccession++;
      }
    }

    const batchableRate =
      records.length > 1 ? rapidSuccession / (records.length - 1) : 0;
    if (batchableRate < 0.2) return null; // Less than 20% could be batched

    const simulation = this.simulator.simulate(records, ["batch_requests"]);
    const monthlySavings = this.extrapolateMonthly(records, simulation.savings);

    return this.createRecommendation({
      strategy: "batch_requests",
      title: "Batch rapid successive requests",
      description: `${(batchableRate * 100).toFixed(1)}% of requests occur within 1 second of each other. Batching could improve efficiency.`,
      estimatedMonthlySavings: monthlySavings,
      confidence: 0.6,
      difficulty: "high",
      qualityImpact: 0,
      latencyImpact: 0.2,
      priority: this.calculatePriority(monthlySavings, "high", 0),
      actions: [
        {
          type: "code_change",
          description: "Implement request batching for rapid successive calls",
          automatic: false,
        },
      ],
      scope: {},
    });
  }

  private createRecommendation(
    params: Omit<CostRecommendation, "id" | "createdAt" | "status">,
  ): CostRecommendation {
    return {
      id: generateEventId(),
      createdAt: now(),
      status: "pending",
      ...params,
    };
  }

  private calculatePriority(
    savings: number,
    difficulty: "low" | "medium" | "high",
    qualityImpact: number,
  ): number {
    const difficultyMultiplier =
      difficulty === "low" ? 1.5 : difficulty === "medium" ? 1.0 : 0.5;
    const qualityPenalty = Math.abs(qualityImpact) * 10;

    return savings * difficultyMultiplier - qualityPenalty;
  }

  private extrapolateMonthly(records: UsageRecord[], savings: number): number {
    if (records.length === 0) return 0;

    const timestamps = records.map((r) => r.timestamp);
    const timeSpanMs = Math.max(...timestamps) - Math.min(...timestamps);
    const monthMs = 30 * 24 * 60 * 60 * 1000;

    if (timeSpanMs < 1000) return savings; // Less than 1 second of data
    return (savings / timeSpanMs) * monthMs;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}
