/**
 * AgentOps SDK - Route LLM Engine
 *
 * Intelligent routing engine that selects optimal LLM models based on
 * cost, quality, and latency constraints.
 */

import type {
  RouteLLMConfig,
  ResolvedRouteLLMConfig,
  ModelProfile,
  RoutingRequest,
  RoutingDecision,
  RoutingHistory,
  ModelPerformanceData,
  RoutingMetrics,
  FallbackChain,
  AlternativeModel,
} from "./types.js";
import { generateEventId, now } from "../utils.js";

// ============================================================================
// Internal Types
// ============================================================================

interface PerformanceSample {
  cost: number;
  latency: number;
  quality: number;
  timestamp: number;
}

interface ScoredModel {
  modelId: string;
  score: number;
  estimatedCost: number;
  estimatedLatency: number;
  estimatedQuality: number;
  reason: string;
}

// ============================================================================
// RouteLLMEngine
// ============================================================================

export class RouteLLMEngine {
  private readonly config: ResolvedRouteLLMConfig;
  private models: Map<string, ModelProfile> = new Map();
  private history: RoutingHistory[] = [];
  private performanceData: Map<string, PerformanceSample[]> = new Map();
  private metrics: RoutingMetrics;

  constructor(config: RouteLLMConfig) {
    this.config = {
      enabled: config.enabled ?? false,
      models: config.models ?? [],
      qualityFloor: config.qualityFloor ?? 0.5,
      defaultModel: config.defaultModel ?? "",
      shadowMode: config.shadowMode ?? false,
      costWeight: config.costWeight ?? 0.4,
      qualityWeight: config.qualityWeight ?? 0.4,
      latencyWeight: config.latencyWeight ?? 0.2,
      onRoutingDecision: config.onRoutingDecision,
      debug: config.debug ?? false,
    };

    this.metrics = this.createEmptyMetrics();

    for (const model of this.config.models) {
      this.models.set(model.modelId, model);
    }

    if (!this.config.defaultModel && this.models.size > 0) {
      this.config.defaultModel = this.models.keys().next().value!;
    }
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  // =========================================================================
  // Model Management
  // =========================================================================

  addModel(profile: ModelProfile): void {
    this.models.set(profile.modelId, profile);
    if (!this.config.defaultModel) {
      this.config.defaultModel = profile.modelId;
    }
  }

  removeModel(modelId: string): void {
    this.models.delete(modelId);
    this.performanceData.delete(modelId);
    if (this.config.defaultModel === modelId) {
      this.config.defaultModel =
        this.models.size > 0 ? this.models.keys().next().value! : "";
    }
  }

  getModels(): ModelProfile[] {
    return Array.from(this.models.values());
  }

  // =========================================================================
  // Core Routing
  // =========================================================================

  route(request: RoutingRequest): RoutingDecision {
    const timestamp = now();
    const requestId = generateEventId();
    const qualityFloor = request.minQuality ?? this.config.qualityFloor;

    // Filter eligible models
    const eligible = this.filterEligibleModels(request, qualityFloor);

    if (eligible.length === 0) {
      // Fall back to default model if no models meet constraints
      const defaultProfile = this.models.get(this.config.defaultModel);
      const decision: RoutingDecision = {
        selectedModel: this.config.defaultModel,
        reason: "No models met all constraints; falling back to default",
        score: 0,
        alternativeModels: [],
        estimatedCost: defaultProfile
          ? this.estimateModelCost(defaultProfile, request.estimatedTokens)
          : 0,
        estimatedLatency: defaultProfile?.avgLatencyMs ?? 0,
        estimatedQuality: defaultProfile?.qualityScore ?? 0,
        shadowMode: this.config.shadowMode,
        timestamp,
      };

      this.recordDecision(requestId, request, decision);
      return decision;
    }

    // Score each eligible model
    const scored = this.scoreModels(eligible, request);
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const alternatives: AlternativeModel[] = scored.slice(1, 4).map((s) => ({
      modelId: s.modelId,
      score: s.score,
      reason: s.reason,
    }));

    let selectedModel = best.modelId;
    let reason = best.reason;
    let score = best.score;

    // Shadow mode: log optimal but return default
    if (this.config.shadowMode) {
      const defaultProfile = this.models.get(this.config.defaultModel);
      if (defaultProfile && selectedModel !== this.config.defaultModel) {
        reason = `Shadow mode: optimal=${best.modelId} (score=${best.score.toFixed(3)}), using default=${this.config.defaultModel}`;
        selectedModel = this.config.defaultModel;
        score =
          scored.find((s) => s.modelId === this.config.defaultModel)?.score ??
          0;
      }
    }

    const selectedProfile = this.models.get(selectedModel)!;
    const decision: RoutingDecision = {
      selectedModel,
      reason,
      score,
      alternativeModels: alternatives,
      estimatedCost: this.estimateModelCost(
        selectedProfile,
        request.estimatedTokens,
      ),
      estimatedLatency: selectedProfile.avgLatencyMs,
      estimatedQuality: selectedProfile.qualityScore,
      shadowMode: this.config.shadowMode,
      timestamp,
    };

    this.recordDecision(requestId, request, decision);
    return decision;
  }

  // =========================================================================
  // Performance Recording
  // =========================================================================

  recordOutcome(
    requestId: string,
    actualCost: number,
    actualLatency: number,
    actualQuality: number,
  ): void {
    // Update history entry
    const entry = this.history.find((h) => h.requestId === requestId);
    if (entry) {
      entry.actualCost = actualCost;
      entry.actualLatency = actualLatency;
      entry.actualQuality = actualQuality;
    }

    // Record performance sample
    const modelId = entry?.decision.selectedModel;
    if (modelId) {
      if (!this.performanceData.has(modelId)) {
        this.performanceData.set(modelId, []);
      }
      this.performanceData.get(modelId)!.push({
        cost: actualCost,
        latency: actualLatency,
        quality: actualQuality,
        timestamp: now(),
      });
    }
  }

  getModelPerformance(modelId: string): ModelPerformanceData | undefined {
    const samples = this.performanceData.get(modelId);
    if (!samples || samples.length === 0) {
      return undefined;
    }

    const costs = samples.map((s) => s.cost).sort((a, b) => a - b);
    const latencies = samples.map((s) => s.latency).sort((a, b) => a - b);
    const qualities = samples.map((s) => s.quality).sort((a, b) => a - b);

    return {
      modelId,
      samples: samples.length,
      avgCost: costs.reduce((a, b) => a + b, 0) / costs.length,
      avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      avgQuality: qualities.reduce((a, b) => a + b, 0) / qualities.length,
      costP95: this.percentile(costs, 95),
      latencyP95: this.percentile(latencies, 95),
      qualityP5: this.percentile(qualities, 5),
      lastUpdated: samples[samples.length - 1].timestamp,
    };
  }

  // =========================================================================
  // History & Metrics
  // =========================================================================

  getRoutingHistory(filter?: {
    modelId?: string;
    sessionId?: string;
    since?: number;
  }): RoutingHistory[] {
    let results = this.history;
    if (filter?.modelId) {
      results = results.filter(
        (h) => h.decision.selectedModel === filter.modelId,
      );
    }
    if (filter?.sessionId) {
      results = results.filter((h) => h.request.sessionId === filter.sessionId);
    }
    if (filter?.since) {
      results = results.filter((h) => h.timestamp >= filter.since!);
    }
    return results;
  }

  getMetrics(): RoutingMetrics {
    return { ...this.metrics };
  }

  // =========================================================================
  // Fallback Chain
  // =========================================================================

  createFallbackChain(
    primary: string,
    fallbacks: string[],
    strategy: FallbackChain["strategy"] = "sequential",
    qualityThreshold: number = this.config.qualityFloor,
  ): FallbackChain {
    return {
      models: [primary, ...fallbacks],
      strategy,
      qualityThreshold,
    };
  }

  routeWithFallback(
    request: RoutingRequest,
    chain: FallbackChain,
  ): RoutingDecision {
    if (chain.strategy === "quality_threshold") {
      // Find first model in chain meeting quality threshold
      for (const modelId of chain.models) {
        const profile = this.models.get(modelId);
        if (profile && profile.qualityScore >= chain.qualityThreshold) {
          const eligible = this.filterEligibleModels(request, 0);
          const match = eligible.find((m) => m.modelId === modelId);
          if (match) {
            const scored = this.scoreModels([match], request);
            const s = scored[0];
            const requestId = generateEventId();
            const decision: RoutingDecision = {
              selectedModel: modelId,
              reason: `Fallback chain (quality_threshold): ${modelId} meets threshold ${chain.qualityThreshold}`,
              score: s.score,
              alternativeModels: chain.models
                .filter((m) => m !== modelId)
                .map((m) => ({
                  modelId: m,
                  score: 0,
                  reason: "fallback candidate",
                })),
              estimatedCost: s.estimatedCost,
              estimatedLatency: s.estimatedLatency,
              estimatedQuality: s.estimatedQuality,
              shadowMode: this.config.shadowMode,
              timestamp: now(),
            };
            this.recordDecision(requestId, request, decision);
            return decision;
          }
        }
      }
    }

    // Sequential strategy: try each model in order
    for (const modelId of chain.models) {
      const profile = this.models.get(modelId);
      if (!profile) continue;

      const hasCapabilities = request.requiredCapabilities.every((cap) =>
        profile.capabilities.includes(cap),
      );
      if (!hasCapabilities) continue;

      const requestId = generateEventId();
      const estimatedCost = this.estimateModelCost(
        profile,
        request.estimatedTokens,
      );
      const decision: RoutingDecision = {
        selectedModel: modelId,
        reason: `Fallback chain (sequential): first available model`,
        score: profile.qualityScore,
        alternativeModels: chain.models
          .filter((m) => m !== modelId)
          .map((m) => ({
            modelId: m,
            score: 0,
            reason: "fallback candidate",
          })),
        estimatedCost,
        estimatedLatency: profile.avgLatencyMs,
        estimatedQuality: profile.qualityScore,
        shadowMode: this.config.shadowMode,
        timestamp: now(),
      };
      this.recordDecision(requestId, request, decision);
      return decision;
    }

    // No model available — return empty decision
    const requestId = generateEventId();
    const decision: RoutingDecision = {
      selectedModel: "",
      reason: "No models in fallback chain could handle request",
      score: 0,
      alternativeModels: [],
      estimatedCost: 0,
      estimatedLatency: 0,
      estimatedQuality: 0,
      shadowMode: this.config.shadowMode,
      timestamp: now(),
    };
    this.recordDecision(requestId, request, decision);
    return decision;
  }

  // =========================================================================
  // Savings Estimation
  // =========================================================================

  estimateSavings(requests: RoutingRequest[]): {
    totalCostDirect: number;
    totalCostRouted: number;
    savings: number;
    savingsPercent: number;
  } {
    let totalCostDirect = 0;
    let totalCostRouted = 0;

    const defaultProfile = this.models.get(this.config.defaultModel);

    for (const request of requests) {
      // Direct cost: using default model
      if (defaultProfile) {
        totalCostDirect += this.estimateModelCost(
          defaultProfile,
          request.estimatedTokens,
        );
      }

      // Routed cost: using optimal model
      const decision = this.route(request);
      totalCostRouted += decision.estimatedCost;
    }

    const savings = totalCostDirect - totalCostRouted;
    const savingsPercent =
      totalCostDirect > 0 ? (savings / totalCostDirect) * 100 : 0;

    return { totalCostDirect, totalCostRouted, savings, savingsPercent };
  }

  // =========================================================================
  // Reset
  // =========================================================================

  reset(): void {
    this.history = [];
    this.performanceData.clear();
    this.metrics = this.createEmptyMetrics();
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private filterEligibleModels(
    request: RoutingRequest,
    qualityFloor: number,
  ): ModelProfile[] {
    const eligible: ModelProfile[] = [];

    for (const profile of this.models.values()) {
      // Check capabilities
      const hasCapabilities = request.requiredCapabilities.every((cap) =>
        profile.capabilities.includes(cap),
      );
      if (!hasCapabilities) continue;

      // Check quality floor
      if (profile.qualityScore < qualityFloor) continue;

      // Check optional cost constraint
      if (request.maxCostPerRequest !== undefined) {
        const cost = this.estimateModelCost(profile, request.estimatedTokens);
        if (cost > request.maxCostPerRequest) continue;
      }

      // Check optional latency constraint
      if (
        request.maxLatencyMs !== undefined &&
        profile.avgLatencyMs > request.maxLatencyMs
      ) {
        continue;
      }

      // Check token capacity
      if (request.estimatedTokens > profile.maxTokens) continue;

      eligible.push(profile);
    }

    return eligible;
  }

  private scoreModels(
    models: ModelProfile[],
    _request: RoutingRequest,
  ): ScoredModel[] {
    if (models.length === 0) return [];

    // Compute min/max for normalization
    const costs = models.map(
      (m) => m.costPer1kTokens.input + m.costPer1kTokens.output,
    );
    const latencies = models.map((m) => m.avgLatencyMs);

    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);

    const costRange = maxCost - minCost || 1;
    const latencyRange = maxLatency - minLatency || 1;

    return models.map((profile) => {
      const totalCostRate =
        profile.costPer1kTokens.input + profile.costPer1kTokens.output;
      const normalizedCost = (totalCostRate - minCost) / costRange;
      const normalizedLatency =
        (profile.avgLatencyMs - minLatency) / latencyRange;

      const costScore = this.config.costWeight * (1 - normalizedCost);
      const qualityScore = this.config.qualityWeight * profile.qualityScore;
      const latencyScore = this.config.latencyWeight * (1 - normalizedLatency);

      const totalScore = costScore + qualityScore + latencyScore;

      const reasons: string[] = [];
      if (costScore > 0.1) reasons.push("low cost");
      if (qualityScore > 0.2) reasons.push("high quality");
      if (latencyScore > 0.05) reasons.push("low latency");

      return {
        modelId: profile.modelId,
        score: totalScore,
        estimatedCost: this.estimateModelCost(
          profile,
          _request.estimatedTokens,
        ),
        estimatedLatency: profile.avgLatencyMs,
        estimatedQuality: profile.qualityScore,
        reason:
          reasons.length > 0
            ? `Best balance of ${reasons.join(", ")}`
            : "Selected by scoring algorithm",
      };
    });
  }

  private estimateModelCost(
    profile: ModelProfile,
    estimatedTokens: number,
  ): number {
    // Assume roughly equal input/output split
    const inputTokens = Math.ceil(estimatedTokens * 0.6);
    const outputTokens = estimatedTokens - inputTokens;
    return (
      (inputTokens / 1000) * profile.costPer1kTokens.input +
      (outputTokens / 1000) * profile.costPer1kTokens.output
    );
  }

  private recordDecision(
    requestId: string,
    request: RoutingRequest,
    decision: RoutingDecision,
  ): void {
    this.history.push({
      requestId,
      request,
      decision,
      timestamp: decision.timestamp,
    });

    // Update metrics
    this.metrics.totalRequests++;

    const profile = this.models.get(decision.selectedModel);
    if (profile) {
      switch (profile.tier) {
        case "premium":
          this.metrics.routedToPremium++;
          break;
        case "standard":
          this.metrics.routedToStandard++;
          break;
        case "economy":
          this.metrics.routedToEconomy++;
          break;
      }
    }

    if (decision.shadowMode) {
      this.metrics.shadowModeDecisions++;
    }

    // Track estimated savings vs default model
    const defaultProfile = this.models.get(this.config.defaultModel);
    if (defaultProfile && decision.selectedModel !== this.config.defaultModel) {
      const defaultCost = this.estimateModelCost(
        defaultProfile,
        request.estimatedTokens,
      );
      this.metrics.estimatedSavings += defaultCost - decision.estimatedCost;
    }

    // Invoke callback
    if (this.config.onRoutingDecision) {
      this.config.onRoutingDecision(decision);
    }
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  }

  private createEmptyMetrics(): RoutingMetrics {
    return {
      totalRequests: 0,
      routedToPremium: 0,
      routedToStandard: 0,
      routedToEconomy: 0,
      estimatedSavings: 0,
      actualSavings: 0,
      avgQualityDelta: 0,
      shadowModeDecisions: 0,
    };
  }
}
