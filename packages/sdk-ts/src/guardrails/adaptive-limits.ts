/**
 * AgentOps SDK - Adaptive Limits
 *
 * Single-responsibility class for calculating adaptive limits based on historical usage.
 * Extracted from CostGuardrailsEngine for better maintainability.
 */

import { now } from "../utils.js";
import { LimitManager } from "./limit-manager.js";
import { CostTracker } from "./cost-tracker.js";
import {
  LimitType,
  AdaptiveLimitConfig,
  AdaptiveLimitResult,
} from "./types.js";

const DEFAULT_ADAPTIVE_CONFIG: Required<AdaptiveLimitConfig> = {
  enabled: false,
  lookbackPeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  percentile: 95,
  multiplier: 1.5,
  minLimit: 0.01,
  maxLimit: 1000,
  updateFrequencyMs: 60 * 60 * 1000, // 1 hour
};

/**
 * Calculates adaptive limits based on historical usage patterns.
 */
export class AdaptiveLimits {
  private config: Required<AdaptiveLimitConfig>;

  constructor(
    config: AdaptiveLimitConfig | undefined,
    private readonly limitManager: LimitManager,
    private readonly costTracker: CostTracker,
  ) {
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
  }

  /**
   * Check if adaptive limits are enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the adaptive limits configuration
   */
  getConfig(): Required<AdaptiveLimitConfig> {
    return { ...this.config };
  }

  /**
   * Calculate adaptive limit based on historical usage
   */
  calculateAdaptiveLimit(
    type: LimitType,
    scopeId: string,
    customConfig?: Partial<AdaptiveLimitConfig>,
  ): AdaptiveLimitResult {
    const config = { ...this.config, ...customConfig };

    // Get historical data
    const cutoff = now() - config.lookbackPeriodMs;
    const relevantRecords = this.costTracker.getRecordsForScope(
      type,
      scopeId,
      cutoff,
    );

    if (relevantRecords.length === 0) {
      return {
        calculatedLimit: config.minLimit,
        historicalAverage: 0,
        historicalPercentile: 0,
        sampleSize: 0,
        confidence: 0,
        reason: "No historical data available",
      };
    }

    // Group by session for session-based analysis
    const costsByUnit = this.costTracker.groupCostsByUnit(
      relevantRecords,
      type,
    );
    const costs = Object.values(costsByUnit);

    if (costs.length === 0) {
      return {
        calculatedLimit: config.minLimit,
        historicalAverage: 0,
        historicalPercentile: 0,
        sampleSize: 0,
        confidence: 0,
        reason: "No historical sessions available",
      };
    }

    // Calculate statistics
    const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
    const sorted = [...costs].sort((a, b) => a - b);
    const percentileIndex =
      Math.ceil((config.percentile / 100) * sorted.length) - 1;
    const percentileValue = sorted[Math.max(0, percentileIndex)];

    // Calculate limit
    let calculatedLimit = percentileValue * config.multiplier;
    calculatedLimit = Math.max(
      config.minLimit,
      Math.min(config.maxLimit, calculatedLimit),
    );

    // Calculate confidence based on sample size
    const confidence = Math.min(1, costs.length / 100);

    return {
      calculatedLimit,
      historicalAverage: avg,
      historicalPercentile: percentileValue,
      sampleSize: costs.length,
      confidence,
      reason: `Based on ${costs.length} samples over ${config.lookbackPeriodMs / (24 * 60 * 60 * 1000)} days`,
    };
  }

  /**
   * Apply adaptive limits to all scopes of a given type
   */
  applyAdaptiveLimits(type: LimitType): number {
    if (!this.config.enabled) return 0;

    let updated = 0;
    const scopeIds = this.costTracker.getUniqueScopeIds(type);

    for (const scopeId of scopeIds) {
      const result = this.calculateAdaptiveLimit(type, scopeId);

      if (result.confidence >= 0.5) {
        this.limitManager.updateLimit(type, scopeId, {
          maxCost: result.calculatedLimit,
        });
        updated++;
      }
    }

    return updated;
  }

  /**
   * Get recommended limits for all scope types
   */
  getRecommendedLimits(): Map<string, AdaptiveLimitResult> {
    const recommendations = new Map<string, AdaptiveLimitResult>();

    const types: LimitType[] = ["session", "user", "feature", "model"];

    for (const type of types) {
      const scopeIds = this.costTracker.getUniqueScopeIds(type);

      for (const scopeId of scopeIds) {
        const result = this.calculateAdaptiveLimit(type, scopeId);
        recommendations.set(`${type}:${scopeId}`, result);
      }
    }

    return recommendations;
  }
}
