/**
 * AgentOps SDK - Federated Learning Engine
 *
 * Privacy-preserving federated learning engine that aggregates
 * model performance data across tenants using differential privacy.
 *
 * @packageDocumentation
 */

import type {
  FederatedConfig,
  ResolvedFederatedConfig,
  TenantContribution,
  ModelPerformanceReport,
  AggregatedInsight,
  CommunityRoutingProfile,
  DifferentialPrivacyParams,
  PrivacyAuditEntry,
  FederatedMetrics,
} from "./types.js";
import { generateEventId, now } from "../utils.js";

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: ResolvedFederatedConfig = {
  enabled: true,
  privacyBudget: 1.0,
  minTenantSamples: 100,
  aggregationIntervalMs: 3_600_000,
  debug: false,
};

// ============================================================================
// Internal types
// ============================================================================

interface PerformanceSample {
  tenantId: string;
  modelId: string;
  cost: number;
  latencyMs: number;
  qualityScore: number;
  timestamp: number;
}

// ============================================================================
// FederatedLearningEngine
// ============================================================================

export class FederatedLearningEngine {
  private readonly config: ResolvedFederatedConfig;
  private readonly contributions: Map<string, TenantContribution> = new Map();
  private readonly samples: PerformanceSample[] = [];
  private readonly auditLog: PrivacyAuditEntry[] = [];
  private readonly routingProfiles: Map<string, CommunityRoutingProfile> =
    new Map();
  private readonly generatedInsights: AggregatedInsight[] = [];

  constructor(config: FederatedConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      privacyBudget: config.privacyBudget ?? DEFAULT_CONFIG.privacyBudget,
      minTenantSamples:
        config.minTenantSamples ?? DEFAULT_CONFIG.minTenantSamples,
      aggregationIntervalMs:
        config.aggregationIntervalMs ?? DEFAULT_CONFIG.aggregationIntervalMs,
      debug: config.debug ?? DEFAULT_CONFIG.debug,
    };
  }

  // --------------------------------------------------------------------------
  // Tenant opt-in / opt-out
  // --------------------------------------------------------------------------

  optIn(tenantId: string): TenantContribution {
    const contribution: TenantContribution = {
      tenantId,
      optedIn: true,
      optedInAt: now(),
      samplesContributed: 0,
      lastContribution: null,
    };
    this.contributions.set(tenantId, contribution);
    this.recordAudit(
      tenantId,
      "opt_in",
      `Tenant ${tenantId} opted in to federated learning`,
    );
    return contribution;
  }

  optOut(tenantId: string): boolean {
    const contribution = this.contributions.get(tenantId);
    if (!contribution) return false;

    contribution.optedIn = false;
    this.contributions.set(tenantId, contribution);

    // Remove all samples from this tenant
    this.deleteTenantSamples(tenantId);

    this.recordAudit(
      tenantId,
      "opt_out",
      `Tenant ${tenantId} opted out of federated learning`,
    );
    return true;
  }

  getContribution(tenantId: string): TenantContribution | undefined {
    return this.contributions.get(tenantId);
  }

  listContributors(): TenantContribution[] {
    return Array.from(this.contributions.values());
  }

  // --------------------------------------------------------------------------
  // Sample submission
  // --------------------------------------------------------------------------

  submitSample(
    tenantId: string,
    sample: {
      modelId: string;
      cost: number;
      latencyMs: number;
      qualityScore: number;
    },
  ): boolean {
    const contribution = this.contributions.get(tenantId);
    if (!contribution || !contribution.optedIn) return false;

    this.samples.push({
      tenantId,
      modelId: sample.modelId,
      cost: sample.cost,
      latencyMs: sample.latencyMs,
      qualityScore: sample.qualityScore,
      timestamp: now(),
    });

    contribution.samplesContributed += 1;
    contribution.lastContribution = now();
    this.contributions.set(tenantId, contribution);

    this.recordAudit(
      tenantId,
      "contribution",
      `Tenant ${tenantId} contributed sample for model ${sample.modelId}`,
    );

    return true;
  }

  // --------------------------------------------------------------------------
  // Differential privacy
  // --------------------------------------------------------------------------

  addNoise(value: number, sensitivity: number, noiseOverride?: number): number {
    const epsilon = this.config.privacyBudget;
    if (noiseOverride !== undefined) {
      return value + noiseOverride;
    }
    const scale = sensitivity / epsilon;
    // Laplace noise: sample from Laplace(0, scale)
    const u = Math.random() - 0.5;
    const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    return value + noise;
  }

  getPrivacyParams(): DifferentialPrivacyParams {
    const epsilon = this.config.privacyBudget;
    return {
      epsilon,
      delta: 1e-5,
      noiseScale: 1.0 / epsilon,
    };
  }

  // --------------------------------------------------------------------------
  // Model performance aggregation
  // --------------------------------------------------------------------------

  aggregateModelPerformance(noiseOverride?: number): ModelPerformanceReport[] {
    const modelSamples = new Map<string, PerformanceSample[]>();

    for (const sample of this.samples) {
      const existing = modelSamples.get(sample.modelId) ?? [];
      existing.push(sample);
      modelSamples.set(sample.modelId, existing);
    }

    const reports: ModelPerformanceReport[] = [];

    for (const [modelId, samples] of modelSamples) {
      if (samples.length < this.config.minTenantSamples) continue;

      const costs = samples.map((s) => s.cost).sort((a, b) => a - b);
      const latencies = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
      const qualities = samples
        .map((s) => s.qualityScore)
        .sort((a, b) => a - b);

      const avgCost = this.addNoise(mean(costs), maxVal(costs), noiseOverride);
      const avgLatencyMs = this.addNoise(
        mean(latencies),
        maxVal(latencies),
        noiseOverride,
      );
      const avgQualityScore = this.addNoise(
        mean(qualities),
        1.0,
        noiseOverride,
      );

      reports.push({
        modelId,
        avgCost,
        avgLatencyMs,
        avgQualityScore,
        sampleCount: samples.length,
        costP95: percentile(costs, 0.95),
        latencyP95: percentile(latencies, 0.95),
        qualityP5: percentile(qualities, 0.05),
      });
    }

    return reports;
  }

  // --------------------------------------------------------------------------
  // Insight generation
  // --------------------------------------------------------------------------

  generateInsights(noiseOverride?: number): AggregatedInsight[] {
    const reports = this.aggregateModelPerformance(noiseOverride);
    const insights: AggregatedInsight[] = [];

    if (reports.length < 2) return insights;

    // Model recommendation: model A has 30%+ lower cost but similar quality to model B
    for (const a of reports) {
      for (const b of reports) {
        if (a.modelId === b.modelId) continue;
        const costRatio = a.avgCost / b.avgCost;
        const qualityDiff = Math.abs(a.avgQualityScore - b.avgQualityScore);
        if (costRatio <= 0.7 && qualityDiff < 0.1) {
          insights.push({
            id: generateEventId(),
            type: "model_recommendation",
            title: `Consider ${a.modelId} over ${b.modelId}`,
            description: `${a.modelId} is ${Math.round((1 - costRatio) * 100)}% cheaper with similar quality`,
            confidence: Math.min(a.sampleCount, b.sampleCount) / 1000,
            affectedModels: [a.modelId, b.modelId],
            estimatedImpact: { metric: "cost", improvement: 1 - costRatio },
            generatedAt: now(),
            sampleSize: a.sampleCount + b.sampleCount,
          });
        }
      }
    }

    // Cost optimization: avg cost across all models decreased (compare first/second half)
    const allCosts = this.samples.map((s) => s.cost);
    if (allCosts.length >= 2) {
      const midpoint = Math.floor(allCosts.length / 2);
      const firstHalf = mean(allCosts.slice(0, midpoint));
      const secondHalf = mean(allCosts.slice(midpoint));
      if (secondHalf < firstHalf) {
        insights.push({
          id: generateEventId(),
          type: "cost_optimization",
          title: "Cost trend is decreasing",
          description: `Average cost decreased from ${firstHalf.toFixed(4)} to ${secondHalf.toFixed(4)}`,
          confidence: 0.7,
          affectedModels: reports.map((r) => r.modelId),
          estimatedImpact: {
            metric: "cost",
            improvement: (firstHalf - secondHalf) / firstHalf,
          },
          generatedAt: now(),
          sampleSize: allCosts.length,
        });
      }
    }

    // Quality improvement: model quality improved >10%
    for (const report of reports) {
      const modelSamples = this.samples
        .filter((s) => s.modelId === report.modelId)
        .sort((a, b) => a.timestamp - b.timestamp);
      if (modelSamples.length < 2) continue;
      const midpoint = Math.floor(modelSamples.length / 2);
      const earlyQuality = mean(
        modelSamples.slice(0, midpoint).map((s) => s.qualityScore),
      );
      const lateQuality = mean(
        modelSamples.slice(midpoint).map((s) => s.qualityScore),
      );
      if (
        earlyQuality > 0 &&
        (lateQuality - earlyQuality) / earlyQuality > 0.1
      ) {
        insights.push({
          id: generateEventId(),
          type: "quality_improvement",
          title: `${report.modelId} quality improving`,
          description: `Quality improved by ${Math.round(((lateQuality - earlyQuality) / earlyQuality) * 100)}%`,
          confidence: 0.6,
          affectedModels: [report.modelId],
          estimatedImpact: {
            metric: "quality",
            improvement: (lateQuality - earlyQuality) / earlyQuality,
          },
          generatedAt: now(),
          sampleSize: modelSamples.length,
        });
      }
    }

    // Routing suggestion: switching from model A to B saves >20%
    for (const a of reports) {
      for (const b of reports) {
        if (a.modelId === b.modelId) continue;
        const savings = (a.avgCost - b.avgCost) / a.avgCost;
        if (savings > 0.2 && b.avgQualityScore >= a.avgQualityScore * 0.9) {
          insights.push({
            id: generateEventId(),
            type: "routing_suggestion",
            title: `Route from ${a.modelId} to ${b.modelId}`,
            description: `Switching saves ${Math.round(savings * 100)}% with acceptable quality`,
            confidence: Math.min(a.sampleCount, b.sampleCount) / 1000,
            affectedModels: [a.modelId, b.modelId],
            estimatedImpact: { metric: "cost", improvement: savings },
            generatedAt: now(),
            sampleSize: a.sampleCount + b.sampleCount,
          });
        }
      }
    }

    this.generatedInsights.push(...insights);
    return insights;
  }

  // --------------------------------------------------------------------------
  // Routing profiles
  // --------------------------------------------------------------------------

  buildRoutingProfile(workloadType: string): CommunityRoutingProfile {
    const reports = this.aggregateModelPerformance(0);
    const totalSamples = reports.reduce((sum, r) => sum + r.sampleCount, 0);

    const modelRankings = reports
      .map((r) => {
        const maxCost = Math.max(...reports.map((rp) => rp.avgCost), 1);
        const costEfficiency = 1 - r.avgCost / maxCost;
        const qualityScore = r.avgQualityScore;
        const score = qualityScore * 0.6 + costEfficiency * 0.4;
        return {
          modelId: r.modelId,
          score,
          costEfficiency,
          qualityScore,
        };
      })
      .sort((a, b) => b.score - a.score);

    const profile: CommunityRoutingProfile = {
      id: generateEventId(),
      name: `${workloadType} routing profile`,
      description: `Community-driven routing profile for ${workloadType} workloads`,
      modelRankings,
      workloadType,
      sampleSize: totalSamples,
      updatedAt: now(),
    };

    this.routingProfiles.set(profile.id, profile);
    return profile;
  }

  getRoutingProfiles(): CommunityRoutingProfile[] {
    return Array.from(this.routingProfiles.values());
  }

  // --------------------------------------------------------------------------
  // Audit & GDPR
  // --------------------------------------------------------------------------

  getAuditLog(tenantId?: string): PrivacyAuditEntry[] {
    if (tenantId) {
      return this.auditLog.filter((e) => e.tenantId === tenantId);
    }
    return [...this.auditLog];
  }

  deleteTenantData(tenantId: string): boolean {
    const contribution = this.contributions.get(tenantId);
    if (!contribution) return false;

    this.deleteTenantSamples(tenantId);
    this.contributions.delete(tenantId);
    this.recordAudit(
      tenantId,
      "data_deletion",
      `All data for tenant ${tenantId} deleted (GDPR)`,
    );
    return true;
  }

  // --------------------------------------------------------------------------
  // Metrics & reset
  // --------------------------------------------------------------------------

  getMetrics(): FederatedMetrics {
    const contributors = Array.from(this.contributions.values());
    const optedIn = contributors.filter((c) => c.optedIn);

    return {
      totalTenants: contributors.length,
      optedInTenants: optedIn.length,
      totalSamples: this.samples.length,
      totalInsightsGenerated: this.generatedInsights.length,
      totalRoutingProfiles: this.routingProfiles.size,
      avgPrivacyBudgetUsed: this.config.privacyBudget,
    };
  }

  reset(): void {
    this.contributions.clear();
    this.samples.length = 0;
    this.auditLog.length = 0;
    this.routingProfiles.clear();
    this.generatedInsights.length = 0;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private recordAudit(
    tenantId: string,
    action: PrivacyAuditEntry["action"],
    details: string,
  ): void {
    this.auditLog.push({
      id: generateEventId(),
      tenantId,
      action,
      timestamp: now(),
      details,
    });
  }

  private deleteTenantSamples(tenantId: string): void {
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (this.samples[i].tenantId === tenantId) {
        this.samples.splice(i, 1);
      }
    }
  }
}

// ============================================================================
// Utility functions
// ============================================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function maxVal(values: number[]): number {
  if (values.length === 0) return 1;
  return Math.max(...values);
}
