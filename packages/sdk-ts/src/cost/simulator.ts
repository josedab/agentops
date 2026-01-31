/**
 * Cost Simulator
 *
 * Simulates cost optimization scenarios to predict savings
 * and quality impact before applying changes.
 */

import { calculateCost } from "../pricing.js";
import { now, generateEventId } from "../utils.js";
import type {
  CostSimulation,
  SimulationScenario,
  OptimizationStrategy,
  UsageRecord,
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
 * Configuration for CostSimulator
 */
export interface CostSimulatorConfig {
  /** Quality threshold for model downgrades */
  qualityThreshold?: number;
  /** Maximum acceptable latency increase */
  maxLatencyIncrease?: number;
}

/**
 * Simulates cost optimization scenarios
 */
export class CostSimulator {
  private readonly qualityThreshold: number;
  private readonly maxLatencyIncrease: number;

  constructor(config?: CostSimulatorConfig) {
    this.qualityThreshold = config?.qualityThreshold ?? 7.0;
    this.maxLatencyIncrease = config?.maxLatencyIncrease ?? 0.3;
  }

  /**
   * Simulate optimizations for given usage records
   */
  simulate(
    records: UsageRecord[],
    strategies: OptimizationStrategy[],
  ): CostSimulation {
    const baselineCost = this.calculateBaselineCost(records);
    let simulatedCost = baselineCost;
    let qualityImpact = 0;
    let latencyImpact = 0;

    const strategyBreakdown: CostSimulation["strategyBreakdown"] = [];

    for (const strategy of strategies) {
      const result = this.simulateStrategy(records, strategy, simulatedCost);
      simulatedCost = result.newCost;
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
      riskLevel: this.assessRisk(qualityImpact, latencyImpact, savingsPercent),
      createdAt: now(),
    };
  }

  /**
   * Simulate a specific scenario
   */
  simulateScenario(
    records: UsageRecord[],
    scenario: SimulationScenario,
  ): CostSimulation {
    const baselineCost = this.calculateBaselineCost(records);
    let simulatedCost = 0;
    let qualityImpact = 0;
    let latencyImpact = 0;

    for (const record of records) {
      let { model, inputTokens } = record;
      const { outputTokens } = record;

      // Apply model substitution
      if (scenario.modelSubstitutions?.[model]) {
        model = scenario.modelSubstitutions[model];
        qualityImpact -= 0.3; // Assume slight quality decrease
        latencyImpact += 0.05; // Assume slight latency increase
      }

      // Apply context compression
      if (scenario.contextCompression) {
        inputTokens = Math.floor(inputTokens * scenario.contextCompression);
      }

      // Apply caching (skip cost for cached requests)
      if (
        record.cached ||
        (scenario.assumedCacheHitRate &&
          Math.random() < scenario.assumedCacheHitRate)
      ) {
        continue;
      }

      simulatedCost += calculateCost(model, inputTokens, outputTokens);
    }

    const savings = baselineCost - simulatedCost;
    const savingsPercent =
      baselineCost > 0 ? (savings / baselineCost) * 100 : 0;

    return {
      id: generateEventId(),
      baselineCost,
      simulatedCost,
      savings,
      savingsPercent,
      qualityImpact,
      latencyImpact,
      strategiesApplied: scenario.strategies,
      strategyBreakdown: scenario.strategies.map((s) => ({
        strategy: s,
        savings: savings / scenario.strategies.length,
        qualityImpact: qualityImpact / scenario.strategies.length,
        latencyImpact: latencyImpact / scenario.strategies.length,
      })),
      riskLevel: this.assessRisk(qualityImpact, latencyImpact, savingsPercent),
      createdAt: now(),
    };
  }

  /**
   * Compare multiple scenarios
   */
  compareScenarios(
    records: UsageRecord[],
    scenarios: SimulationScenario[],
  ): { scenario: SimulationScenario; simulation: CostSimulation }[] {
    return scenarios.map((scenario) => ({
      scenario,
      simulation: this.simulateScenario(records, scenario),
    }));
  }

  private calculateBaselineCost(records: UsageRecord[]): number {
    return records.reduce(
      (sum, r) => sum + calculateCost(r.model, r.inputTokens, r.outputTokens),
      0,
    );
  }

  private simulateStrategy(
    records: UsageRecord[],
    strategy: OptimizationStrategy,
    currentCost: number,
  ): {
    newCost: number;
    savings: number;
    qualityImpact: number;
    latencyImpact: number;
  } {
    switch (strategy) {
      case "model_downgrade":
        return this.simulateModelDowngrade(records, currentCost);

      case "prompt_compression":
        return this.simulatePromptCompression(records, currentCost);

      case "response_caching":
        return this.simulateResponseCaching(records, currentCost);

      case "batch_requests":
        return this.simulateBatchRequests(records, currentCost);

      case "context_pruning":
        return this.simulateContextPruning(records, currentCost);

      case "token_limit_adjustment":
        return this.simulateTokenLimitAdjustment(records, currentCost);

      default:
        return {
          newCost: currentCost,
          savings: 0,
          qualityImpact: 0,
          latencyImpact: 0,
        };
    }
  }

  private simulateModelDowngrade(
    records: UsageRecord[],
    currentCost: number,
  ): {
    newCost: number;
    savings: number;
    qualityImpact: number;
    latencyImpact: number;
  } {
    let newCost = 0;
    let qualityImpact = 0;
    let downgradedCount = 0;

    for (const record of records) {
      const downgrades = MODEL_DOWNGRADE_MAP[record.model];
      const quality = record.qualityScore ?? 8;

      // Only downgrade if quality allows and alternatives exist
      if (downgrades && quality >= this.qualityThreshold + 1) {
        const newModel = downgrades[0]; // Use first downgrade option
        newCost += calculateCost(
          newModel,
          record.inputTokens,
          record.outputTokens,
        );
        qualityImpact -= 0.5;
        downgradedCount++;
      } else {
        newCost += calculateCost(
          record.model,
          record.inputTokens,
          record.outputTokens,
        );
      }
    }

    return {
      newCost,
      savings: currentCost - newCost,
      qualityImpact: records.length > 0 ? qualityImpact / records.length : 0,
      latencyImpact: downgradedCount > 0 ? -0.1 : 0, // Cheaper models often faster
    };
  }

  private simulatePromptCompression(
    records: UsageRecord[],
    currentCost: number,
  ): {
    newCost: number;
    savings: number;
    qualityImpact: number;
    latencyImpact: number;
  } {
    // Assume 20% prompt compression is achievable
    const compressionRatio = 0.8;
    let newCost = 0;

    for (const record of records) {
      const compressedInput = Math.floor(record.inputTokens * compressionRatio);
      newCost += calculateCost(
        record.model,
        compressedInput,
        record.outputTokens,
      );
    }

    return {
      newCost,
      savings: currentCost - newCost,
      qualityImpact: -0.2, // Slight quality impact from compression
      latencyImpact: -0.1, // Faster due to smaller prompts
    };
  }

  private simulateResponseCaching(
    _records: UsageRecord[],
    currentCost: number,
  ): {
    newCost: number;
    savings: number;
    qualityImpact: number;
    latencyImpact: number;
  } {
    // Estimate cache hit rate based on prompt similarity
    const estimatedHitRate = 0.15; // 15% cache hits
    const uncachedCost = currentCost * (1 - estimatedHitRate);

    return {
      newCost: uncachedCost,
      savings: currentCost - uncachedCost,
      qualityImpact: 0, // No quality impact for cached responses
      latencyImpact: -0.5 * estimatedHitRate, // Much faster for cached
    };
  }

  private simulateBatchRequests(
    _records: UsageRecord[],
    currentCost: number,
  ): {
    newCost: number;
    savings: number;
    qualityImpact: number;
    latencyImpact: number;
  } {
    // Batching typically provides ~10% savings from reduced overhead
    const batchSavingsRate = 0.1;
    const newCost = currentCost * (1 - batchSavingsRate);

    return {
      newCost,
      savings: currentCost - newCost,
      qualityImpact: 0,
      latencyImpact: 0.2, // Higher latency due to batching
    };
  }

  private simulateContextPruning(
    records: UsageRecord[],
    currentCost: number,
  ): {
    newCost: number;
    savings: number;
    qualityImpact: number;
    latencyImpact: number;
  } {
    // Prune 30% of context for large prompts
    let newCost = 0;
    const pruneThreshold = 2000; // tokens
    const pruneRatio = 0.7;

    for (const record of records) {
      const inputTokens =
        record.inputTokens > pruneThreshold
          ? Math.floor(record.inputTokens * pruneRatio)
          : record.inputTokens;
      newCost += calculateCost(record.model, inputTokens, record.outputTokens);
    }

    return {
      newCost,
      savings: currentCost - newCost,
      qualityImpact: -0.3, // May lose some context
      latencyImpact: -0.15, // Faster processing
    };
  }

  private simulateTokenLimitAdjustment(
    records: UsageRecord[],
    currentCost: number,
  ): {
    newCost: number;
    savings: number;
    qualityImpact: number;
    latencyImpact: number;
  } {
    // Reduce max output tokens by 25%
    const outputReduction = 0.75;
    let newCost = 0;

    for (const record of records) {
      const adjustedOutput = Math.floor(record.outputTokens * outputReduction);
      newCost += calculateCost(
        record.model,
        record.inputTokens,
        adjustedOutput,
      );
    }

    return {
      newCost,
      savings: currentCost - newCost,
      qualityImpact: -0.2, // May truncate useful output
      latencyImpact: -0.2, // Faster completion
    };
  }

  private assessRisk(
    qualityImpact: number,
    latencyImpact: number,
    _savingsPercent: number,
  ): "low" | "medium" | "high" {
    // Risk increases with quality degradation
    if (qualityImpact < -1 || latencyImpact > this.maxLatencyIncrease * 2) {
      return "high";
    }
    if (qualityImpact < -0.5 || latencyImpact > this.maxLatencyIncrease) {
      return "medium";
    }
    return "low";
  }
}
