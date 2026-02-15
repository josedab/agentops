/**
 * Tests for Federated Learning from Traces Engine
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FederatedLearningEngine } from "../src/federated/index.js";
import type {
  TenantContribution,
  ModelPerformanceReport,
  AggregatedInsight,
  CommunityRoutingProfile,
  PrivacyAuditEntry,
  FederatedMetrics,
} from "../src/federated/index.js";

function makeSample(
  overrides: Partial<{
    modelId: string;
    cost: number;
    latencyMs: number;
    qualityScore: number;
  }> = {},
) {
  return {
    modelId: overrides.modelId ?? "gpt-4",
    cost: overrides.cost ?? 0.03,
    latencyMs: overrides.latencyMs ?? 500,
    qualityScore: overrides.qualityScore ?? 0.85,
  };
}

function submitMany(
  engine: FederatedLearningEngine,
  tenantId: string,
  count: number,
  overrides: Partial<{
    modelId: string;
    cost: number;
    latencyMs: number;
    qualityScore: number;
  }> = {},
): void {
  for (let i = 0; i < count; i++) {
    engine.submitSample(tenantId, makeSample(overrides));
  }
}

describe("FederatedLearningEngine", () => {
  let engine: FederatedLearningEngine;

  beforeEach(() => {
    engine = new FederatedLearningEngine({
      enabled: true,
      minTenantSamples: 5,
    });
  });

  // --------------------------------------------------------------------------
  // Opt-in / Opt-out
  // --------------------------------------------------------------------------

  describe("Opt-in / Opt-out", () => {
    it("should opt a tenant in", () => {
      const contribution = engine.optIn("tenant-1");
      expect(contribution.tenantId).toBe("tenant-1");
      expect(contribution.optedIn).toBe(true);
      expect(contribution.optedInAt).toBeTypeOf("number");
      expect(contribution.samplesContributed).toBe(0);
      expect(contribution.lastContribution).toBeNull();
    });

    it("should opt a tenant out", () => {
      engine.optIn("tenant-1");
      const result = engine.optOut("tenant-1");
      expect(result).toBe(true);

      const contribution = engine.getContribution("tenant-1");
      expect(contribution?.optedIn).toBe(false);
    });

    it("should return false when opting out non-existent tenant", () => {
      expect(engine.optOut("nonexistent")).toBe(false);
    });

    it("should list all contributors", () => {
      engine.optIn("tenant-1");
      engine.optIn("tenant-2");
      const contributors = engine.listContributors();
      expect(contributors).toHaveLength(2);
    });

    it("should remove samples on opt-out", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10);
      engine.optOut("tenant-1");

      // Re-opt-in and check aggregation is empty
      engine.optIn("tenant-1");
      const reports = engine.aggregateModelPerformance(0);
      expect(reports).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Sample submission
  // --------------------------------------------------------------------------

  describe("Sample submission", () => {
    it("should accept samples from opted-in tenants", () => {
      engine.optIn("tenant-1");
      const result = engine.submitSample("tenant-1", makeSample());
      expect(result).toBe(true);

      const contribution = engine.getContribution("tenant-1");
      expect(contribution?.samplesContributed).toBe(1);
      expect(contribution?.lastContribution).toBeTypeOf("number");
    });

    it("should reject samples from opted-out tenants", () => {
      engine.optIn("tenant-1");
      engine.optOut("tenant-1");
      const result = engine.submitSample("tenant-1", makeSample());
      expect(result).toBe(false);
    });

    it("should reject samples from unknown tenants", () => {
      const result = engine.submitSample("unknown", makeSample());
      expect(result).toBe(false);
    });

    it("should track sample count per tenant", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 5);
      const contribution = engine.getContribution("tenant-1");
      expect(contribution?.samplesContributed).toBe(5);
    });
  });

  // --------------------------------------------------------------------------
  // Model performance aggregation
  // --------------------------------------------------------------------------

  describe("Model performance aggregation", () => {
    it("should aggregate samples by model with DP noise zeroed out", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10, {
        modelId: "gpt-4",
        cost: 0.03,
        latencyMs: 500,
        qualityScore: 0.9,
      });

      const reports = engine.aggregateModelPerformance(0);
      expect(reports).toHaveLength(1);
      expect(reports[0].modelId).toBe("gpt-4");
      expect(reports[0].avgCost).toBeCloseTo(0.03, 2);
      expect(reports[0].avgLatencyMs).toBeCloseTo(500, 0);
      expect(reports[0].avgQualityScore).toBeCloseTo(0.9, 1);
      expect(reports[0].sampleCount).toBe(10);
    });

    it("should compute percentiles", () => {
      engine.optIn("tenant-1");
      for (let i = 1; i <= 20; i++) {
        engine.submitSample(
          "tenant-1",
          makeSample({
            cost: i * 0.01,
            latencyMs: i * 100,
            qualityScore: i * 0.05,
          }),
        );
      }

      const reports = engine.aggregateModelPerformance(0);
      expect(reports).toHaveLength(1);
      expect(reports[0].costP95).toBeGreaterThan(0);
      expect(reports[0].latencyP95).toBeGreaterThan(0);
      expect(reports[0].qualityP5).toBeGreaterThan(0);
    });

    it("should not include models below minTenantSamples threshold", () => {
      engine = new FederatedLearningEngine({
        enabled: true,
        minTenantSamples: 50,
      });
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10);
      const reports = engine.aggregateModelPerformance(0);
      expect(reports).toHaveLength(0);
    });

    it("should aggregate multiple models separately", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10, { modelId: "gpt-4" });
      submitMany(engine, "tenant-1", 10, { modelId: "claude-3" });

      const reports = engine.aggregateModelPerformance(0);
      expect(reports).toHaveLength(2);
      const modelIds = reports.map((r) => r.modelId).sort();
      expect(modelIds).toEqual(["claude-3", "gpt-4"]);
    });
  });

  // --------------------------------------------------------------------------
  // Differential privacy
  // --------------------------------------------------------------------------

  describe("Differential privacy", () => {
    it("should add deterministic noise when noiseOverride is provided", () => {
      const result = engine.addNoise(10.0, 1.0, 0.5);
      expect(result).toBeCloseTo(10.5, 5);
    });

    it("should add zero noise when noiseOverride is 0", () => {
      const result = engine.addNoise(10.0, 1.0, 0);
      expect(result).toBe(10.0);
    });

    it("should add stochastic noise without override", () => {
      const results = new Set<number>();
      for (let i = 0; i < 20; i++) {
        results.add(engine.addNoise(10.0, 1.0));
      }
      // Stochastic noise should produce varying values
      expect(results.size).toBeGreaterThan(1);
    });

    it("should return privacy params", () => {
      const params = engine.getPrivacyParams();
      expect(params.epsilon).toBe(1.0);
      expect(params.delta).toBe(1e-5);
      expect(params.noiseScale).toBeCloseTo(1.0, 5);
    });

    it("should respect custom privacy budget", () => {
      const customEngine = new FederatedLearningEngine({ privacyBudget: 2.0 });
      const params = customEngine.getPrivacyParams();
      expect(params.epsilon).toBe(2.0);
      expect(params.noiseScale).toBeCloseTo(0.5, 5);
    });
  });

  // --------------------------------------------------------------------------
  // Insight generation
  // --------------------------------------------------------------------------

  describe("Insight generation", () => {
    it("should generate model_recommendation when cost is 30%+ lower with similar quality", () => {
      engine.optIn("tenant-1");
      // Cheap model with good quality
      submitMany(engine, "tenant-1", 10, {
        modelId: "gpt-3.5",
        cost: 0.002,
        qualityScore: 0.85,
      });
      // Expensive model with similar quality
      submitMany(engine, "tenant-1", 10, {
        modelId: "gpt-4",
        cost: 0.03,
        qualityScore: 0.88,
      });

      const insights = engine.generateInsights(0);
      const recommendations = insights.filter(
        (i) => i.type === "model_recommendation",
      );
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].affectedModels).toContain("gpt-3.5");
    });

    it("should generate routing_suggestion when switching saves >20%", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10, {
        modelId: "expensive",
        cost: 0.1,
        qualityScore: 0.8,
      });
      submitMany(engine, "tenant-1", 10, {
        modelId: "cheap",
        cost: 0.02,
        qualityScore: 0.78,
      });

      const insights = engine.generateInsights(0);
      const routingSuggestions = insights.filter(
        (i) => i.type === "routing_suggestion",
      );
      expect(routingSuggestions.length).toBeGreaterThan(0);
    });

    it("should return empty insights with fewer than 2 models", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10);
      const insights = engine.generateInsights(0);
      expect(insights).toHaveLength(0);
    });

    it("should track generated insights in metrics", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10, {
        modelId: "a",
        cost: 0.01,
        qualityScore: 0.85,
      });
      submitMany(engine, "tenant-1", 10, {
        modelId: "b",
        cost: 0.1,
        qualityScore: 0.86,
      });
      engine.generateInsights(0);
      const metrics = engine.getMetrics();
      expect(metrics.totalInsightsGenerated).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Routing profiles
  // --------------------------------------------------------------------------

  describe("Routing profiles", () => {
    it("should build a routing profile ranking models by composite score", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10, {
        modelId: "gpt-4",
        cost: 0.03,
        qualityScore: 0.95,
      });
      submitMany(engine, "tenant-1", 10, {
        modelId: "gpt-3.5",
        cost: 0.002,
        qualityScore: 0.8,
      });

      const profile = engine.buildRoutingProfile("general");
      expect(profile.workloadType).toBe("general");
      expect(profile.modelRankings).toHaveLength(2);
      expect(profile.modelRankings[0].score).toBeGreaterThan(0);
      expect(profile.sampleSize).toBe(20);
    });

    it("should store and retrieve routing profiles", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10, { modelId: "gpt-4" });

      engine.buildRoutingProfile("coding");
      engine.buildRoutingProfile("chat");

      const profiles = engine.getRoutingProfiles();
      expect(profiles).toHaveLength(2);
    });

    it("should have modelRankings sorted by score descending", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10, {
        modelId: "a",
        cost: 0.01,
        qualityScore: 0.95,
      });
      submitMany(engine, "tenant-1", 10, {
        modelId: "b",
        cost: 0.1,
        qualityScore: 0.5,
      });

      const profile = engine.buildRoutingProfile("test");
      for (let i = 1; i < profile.modelRankings.length; i++) {
        expect(profile.modelRankings[i - 1].score).toBeGreaterThanOrEqual(
          profile.modelRankings[i].score,
        );
      }
    });
  });

  // --------------------------------------------------------------------------
  // Audit log
  // --------------------------------------------------------------------------

  describe("Audit log", () => {
    it("should record opt-in audit entry", () => {
      engine.optIn("tenant-1");
      const log = engine.getAuditLog("tenant-1");
      expect(log).toHaveLength(1);
      expect(log[0].action).toBe("opt_in");
      expect(log[0].tenantId).toBe("tenant-1");
    });

    it("should record opt-out audit entry", () => {
      engine.optIn("tenant-1");
      engine.optOut("tenant-1");
      const log = engine.getAuditLog("tenant-1");
      expect(log).toHaveLength(2);
      expect(log[1].action).toBe("opt_out");
    });

    it("should record contribution audit entry", () => {
      engine.optIn("tenant-1");
      engine.submitSample("tenant-1", makeSample());
      const log = engine.getAuditLog("tenant-1");
      const contributions = log.filter((e) => e.action === "contribution");
      expect(contributions).toHaveLength(1);
    });

    it("should filter audit log by tenant", () => {
      engine.optIn("tenant-1");
      engine.optIn("tenant-2");
      const log1 = engine.getAuditLog("tenant-1");
      const log2 = engine.getAuditLog("tenant-2");
      expect(log1).toHaveLength(1);
      expect(log2).toHaveLength(1);
    });

    it("should return all entries when no tenant filter specified", () => {
      engine.optIn("tenant-1");
      engine.optIn("tenant-2");
      const allLog = engine.getAuditLog();
      expect(allLog).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // GDPR data deletion
  // --------------------------------------------------------------------------

  describe("Data deletion (GDPR)", () => {
    it("should delete all tenant data", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10);
      const deleted = engine.deleteTenantData("tenant-1");
      expect(deleted).toBe(true);
      expect(engine.getContribution("tenant-1")).toBeUndefined();
    });

    it("should return false for unknown tenant", () => {
      expect(engine.deleteTenantData("nonexistent")).toBe(false);
    });

    it("should record data_deletion audit entry", () => {
      engine.optIn("tenant-1");
      engine.deleteTenantData("tenant-1");
      const allLog = engine.getAuditLog();
      const deletionEntries = allLog.filter(
        (e) => e.action === "data_deletion",
      );
      expect(deletionEntries).toHaveLength(1);
      expect(deletionEntries[0].tenantId).toBe("tenant-1");
    });

    it("should remove samples after deletion", () => {
      engine.optIn("tenant-1");
      engine.optIn("tenant-2");
      submitMany(engine, "tenant-1", 10, { modelId: "gpt-4" });
      submitMany(engine, "tenant-2", 10, { modelId: "gpt-4" });

      engine.deleteTenantData("tenant-1");

      const reports = engine.aggregateModelPerformance(0);
      // Only tenant-2's 10 samples remain
      expect(reports).toHaveLength(1);
      expect(reports[0].sampleCount).toBe(10);
    });
  });

  // --------------------------------------------------------------------------
  // Metrics
  // --------------------------------------------------------------------------

  describe("Metrics", () => {
    it("should return correct metrics", () => {
      engine.optIn("tenant-1");
      engine.optIn("tenant-2");
      engine.optOut("tenant-2");
      submitMany(engine, "tenant-1", 5);

      const metrics = engine.getMetrics();
      expect(metrics.totalTenants).toBe(2);
      expect(metrics.optedInTenants).toBe(1);
      expect(metrics.totalSamples).toBe(5);
      expect(metrics.avgPrivacyBudgetUsed).toBe(1.0);
    });

    it("should count routing profiles", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10);
      engine.buildRoutingProfile("general");

      const metrics = engine.getMetrics();
      expect(metrics.totalRoutingProfiles).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  describe("Reset", () => {
    it("should clear all state", () => {
      engine.optIn("tenant-1");
      submitMany(engine, "tenant-1", 10);
      engine.buildRoutingProfile("general");
      engine.generateInsights(0);

      engine.reset();

      const metrics = engine.getMetrics();
      expect(metrics.totalTenants).toBe(0);
      expect(metrics.optedInTenants).toBe(0);
      expect(metrics.totalSamples).toBe(0);
      expect(metrics.totalInsightsGenerated).toBe(0);
      expect(metrics.totalRoutingProfiles).toBe(0);

      expect(engine.listContributors()).toHaveLength(0);
      expect(engine.getRoutingProfiles()).toHaveLength(0);
      expect(engine.getAuditLog()).toHaveLength(0);
    });
  });
});
