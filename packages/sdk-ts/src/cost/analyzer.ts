/**
 * Cost Analyzer
 *
 * Analyzes usage data to provide cost breakdowns, waste analysis,
 * and efficiency metrics. Extracted from CostOptimizer for SRP.
 */

import { calculateCost } from "../pricing.js";
import { now, generateEventId } from "../utils.js";
import type {
  CostAnalysis,
  ModelCostBreakdown,
  FeatureCostBreakdown,
  HourlyCost,
  WasteAnalysis,
  WasteCategory,
  EfficiencyMetrics,
  UsageRecord,
  ModelTierMapping,
} from "./types.js";

/**
 * Configuration for CostAnalyzer
 */
export interface CostAnalyzerConfig {
  /** Custom model tier mappings for efficiency analysis */
  modelTiers?: ModelTierMapping;
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
 * Analyzes LLM usage costs and identifies inefficiencies
 */
export class CostAnalyzer {
  private readonly modelTiers: ModelTierMapping;

  constructor(config?: CostAnalyzerConfig) {
    this.modelTiers = config?.modelTiers ?? DEFAULT_MODEL_TIERS;
  }

  /**
   * Analyze costs for a given set of usage records
   */
  analyze(
    records: UsageRecord[],
    startTime?: number,
    endTime?: number,
  ): CostAnalysis {
    const end = endTime ?? now();
    const start = startTime ?? end - 30 * 24 * 60 * 60 * 1000;

    const filteredRecords = records.filter(
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

    for (const record of filteredRecords) {
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
      this.aggregateByModel(byModel, record, cost);

      // By feature
      if (record.featureId) {
        this.aggregateByFeature(byFeature, record, cost);
      }

      // By user
      if (record.userId) {
        byUser[record.userId] = (byUser[record.userId] || 0) + cost;
      }

      // By hour
      const hour = Math.floor(record.timestamp / (60 * 60 * 1000));
      const hourData = byHour.get(hour) || { cost: 0, count: 0 };
      hourData.cost += cost;
      hourData.count += 1;
      byHour.set(hour, hourData);
    }

    // Finalize model averages
    for (const model of Object.keys(byModel)) {
      const data = byModel[model];
      data.avgCostPerRequest = data.totalCost / data.requestCount;
      data.avgTokensPerRequest = data.totalTokens / data.requestCount;
    }

    // Finalize feature averages
    for (const feature of Object.keys(byFeature)) {
      const data = byFeature[feature];
      data.avgCostPerRequest = data.totalCost / data.requestCount;
    }

    // Convert hourly map to array
    const hourlyData: HourlyCost[] = Array.from(byHour.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, data]) => ({
        hour,
        cost: data.cost,
        requestCount: data.count,
      }));

    return {
      id: generateEventId(),
      period: { start, end },
      totalCost,
      breakdown: {
        byModel,
        byFeature,
        byUser,
        byHour: hourlyData,
      },
      waste: this.analyzeWaste(filteredRecords, totalCost),
      efficiency: this.calculateEfficiency(
        filteredRecords,
        totalCost,
        totalSuccesses,
        totalInputTokens,
        totalOutputTokens,
        totalQuality,
        qualityCount,
      ),
      generatedAt: now(),
    };
  }

  /**
   * Analyze waste in usage patterns
   */
  analyzeWaste(records: UsageRecord[], totalCost: number): WasteAnalysis {
    const categories: WasteCategory[] = [];
    let estimatedWaste = 0;

    // Check for oversized context
    const oversizedRecords = records.filter((r) => r.inputTokens > 4000);
    if (oversizedRecords.length > 0) {
      const wasteFromOversized = this.estimateOversizedWaste(oversizedRecords);
      estimatedWaste += wasteFromOversized;
      categories.push({
        type: "oversized_context",
        description: "Large prompts that could be compressed",
        estimatedWaste: wasteFromOversized,
        affectedRequests: oversizedRecords.length,
      });
    }

    // Check for inefficient model usage (premium models for simple tasks)
    const inefficientUsage = this.findInefficientModelUsage(records);
    if (inefficientUsage.count > 0) {
      estimatedWaste += inefficientUsage.waste;
      categories.push({
        type: "inefficient_model",
        description:
          "Premium models used for tasks suitable for economy models",
        estimatedWaste: inefficientUsage.waste,
        affectedRequests: inefficientUsage.count,
      });
    }

    // Check for retry waste
    const retryWaste = this.calculateRetryWaste(records);
    if (retryWaste.count > 0) {
      estimatedWaste += retryWaste.waste;
      categories.push({
        type: "retry_waste",
        description: "Failed requests that required retries",
        estimatedWaste: retryWaste.waste,
        affectedRequests: retryWaste.count,
      });
    }

    return {
      estimatedWaste,
      wastePercentage: totalCost > 0 ? (estimatedWaste / totalCost) * 100 : 0,
      categories,
    };
  }

  /**
   * Calculate efficiency metrics
   */
  calculateEfficiency(
    records: UsageRecord[],
    totalCost: number,
    totalSuccesses: number,
    totalInputTokens: number,
    totalOutputTokens: number,
    totalQuality: number,
    qualityCount: number,
  ): EfficiencyMetrics {
    const avgQuality = qualityCount > 0 ? totalQuality / qualityCount : 0;
    const modelOptimality = this.calculateModelOptimality(records);

    return {
      costPerSuccess: totalSuccesses > 0 ? totalCost / totalSuccesses : 0,
      tokensPerSuccess:
        totalSuccesses > 0
          ? (totalInputTokens + totalOutputTokens) / totalSuccesses
          : 0,
      avgQualityScore: avgQuality,
      tokenEfficiency:
        totalInputTokens > 0 ? totalOutputTokens / totalInputTokens : 0,
      modelOptimality,
    };
  }

  private aggregateByModel(
    byModel: Record<string, ModelCostBreakdown>,
    record: UsageRecord,
    cost: number,
  ): void {
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

    const modelData = byModel[record.model];
    modelData.totalCost += cost;
    modelData.totalTokens += record.inputTokens + record.outputTokens;
    modelData.inputTokens += record.inputTokens;
    modelData.outputTokens += record.outputTokens;
    modelData.requestCount += 1;
  }

  private aggregateByFeature(
    byFeature: Record<string, FeatureCostBreakdown>,
    record: UsageRecord,
    cost: number,
  ): void {
    const featureId = record.featureId!;
    if (!byFeature[featureId]) {
      byFeature[featureId] = {
        totalCost: 0,
        requestCount: 0,
        avgCostPerRequest: 0,
        primaryModel: record.model,
      };
    }

    const featureData = byFeature[featureId];
    featureData.totalCost += cost;
    featureData.requestCount += 1;
  }

  private estimateOversizedWaste(records: UsageRecord[]): number {
    // Estimate 20% waste for oversized contexts
    let waste = 0;
    for (const record of records) {
      const cost = calculateCost(
        record.model,
        record.inputTokens,
        record.outputTokens,
      );
      waste += cost * 0.2;
    }
    return waste;
  }

  private findInefficientModelUsage(records: UsageRecord[]): {
    count: number;
    waste: number;
  } {
    let count = 0;
    let waste = 0;

    for (const record of records) {
      const tier = this.getModelTier(record.model);
      // Premium models with low quality scores or simple prompts
      if (
        tier === "premium" &&
        record.qualityScore !== undefined &&
        record.qualityScore < 8
      ) {
        count++;
        // Could have used economy model at ~50% cost
        const currentCost = calculateCost(
          record.model,
          record.inputTokens,
          record.outputTokens,
        );
        waste += currentCost * 0.5;
      }
    }

    return { count, waste };
  }

  private calculateRetryWaste(records: UsageRecord[]): {
    count: number;
    waste: number;
  } {
    const failedRecords = records.filter((r) => !r.success);
    let waste = 0;

    for (const record of failedRecords) {
      waste += calculateCost(
        record.model,
        record.inputTokens,
        record.outputTokens,
      );
    }

    return { count: failedRecords.length, waste };
  }

  private calculateModelOptimality(records: UsageRecord[]): number {
    if (records.length === 0) return 1;

    let optimalCount = 0;

    for (const record of records) {
      const tier = this.getModelTier(record.model);
      const quality = record.qualityScore ?? 7;

      // Consider optimal if:
      // - Economy model with acceptable quality (>=6)
      // - Standard model with good quality (>=7)
      // - Premium model with excellent quality (>=9)
      const isOptimal =
        (tier === "economy" && quality >= 6) ||
        (tier === "standard" && quality >= 7 && quality < 9) ||
        (tier === "premium" && quality >= 9);

      if (isOptimal) optimalCount++;
    }

    return optimalCount / records.length;
  }

  private getModelTier(model: string): "premium" | "standard" | "economy" {
    if (this.modelTiers.premium.includes(model)) return "premium";
    if (this.modelTiers.standard.includes(model)) return "standard";
    if (this.modelTiers.economy.includes(model)) return "economy";
    return "standard"; // Default
  }
}
