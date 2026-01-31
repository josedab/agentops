import { describe, it, expect, beforeEach } from "vitest";
import { CostOptimizer } from "../src/cost";

describe("CostOptimizer", () => {
  let optimizer: CostOptimizer;
  const now = Date.now();

  beforeEach(() => {
    optimizer = new CostOptimizer({
      enabled: true,
      qualityThreshold: 7.0,
      autoOptimize: true,
      autoStrategies: ["model_downgrade", "response_caching"],
    });
  });

  describe("configuration", () => {
    it("should initialize with provided config", () => {
      expect(optimizer.isEnabled).toBe(true);
    });

    it("should respect disabled state", () => {
      const disabledOptimizer = new CostOptimizer({ enabled: false });
      expect(disabledOptimizer.isEnabled).toBe(false);
    });
  });

  describe("usage recording", () => {
    it("should record usage data", () => {
      optimizer.recordUsage({
        timestamp: now,
        sessionId: "session-1",
        model: "gpt-4o",
        inputTokens: 1000,
        outputTokens: 500,
        durationMs: 1500,
        success: true,
      });

      const analysis = optimizer.analyzeCosts();
      expect(analysis.totalCost).toBeGreaterThan(0);
    });

    it("should bulk import usage data", () => {
      const records = [
        {
          timestamp: now - 1000,
          sessionId: "session-1",
          model: "gpt-4o",
          inputTokens: 1000,
          outputTokens: 500,
          durationMs: 1500,
          success: true,
        },
        {
          timestamp: now,
          sessionId: "session-2",
          model: "gpt-4o-mini",
          inputTokens: 800,
          outputTokens: 400,
          durationMs: 1200,
          success: true,
        },
      ];

      optimizer.importUsageData(records);
      const analysis = optimizer.analyzeCosts();
      expect(analysis.breakdown.byModel["gpt-4o"]).toBeDefined();
      expect(analysis.breakdown.byModel["gpt-4o-mini"]).toBeDefined();
    });
  });

  describe("cost analysis", () => {
    beforeEach(() => {
      // Add test data
      for (let i = 0; i < 100; i++) {
        optimizer.recordUsage({
          timestamp: now - i * 60000,
          sessionId: `session-${i}`,
          featureId: i % 2 === 0 ? "chat" : "summarize",
          userId: `user-${i % 10}`,
          model: i % 3 === 0 ? "gpt-4" : "gpt-4o-mini",
          inputTokens: 500 + Math.random() * 2000,
          outputTokens: 200 + Math.random() * 500,
          durationMs: 1000 + Math.random() * 2000,
          success: Math.random() > 0.1,
          qualityScore: 5 + Math.random() * 5,
        });
      }
    });

    it("should calculate total cost", () => {
      const analysis = optimizer.analyzeCosts();
      expect(analysis.totalCost).toBeGreaterThan(0);
    });

    it("should break down costs by model", () => {
      const analysis = optimizer.analyzeCosts();
      expect(Object.keys(analysis.breakdown.byModel).length).toBeGreaterThan(0);

      for (const model of Object.keys(analysis.breakdown.byModel)) {
        const breakdown = analysis.breakdown.byModel[model];
        expect(breakdown.requestCount).toBeGreaterThan(0);
        expect(breakdown.totalCost).toBeGreaterThan(0);
        expect(breakdown.avgCostPerRequest).toBeGreaterThan(0);
      }
    });

    it("should break down costs by feature", () => {
      const analysis = optimizer.analyzeCosts();
      expect(analysis.breakdown.byFeature["chat"]).toBeDefined();
      expect(analysis.breakdown.byFeature["summarize"]).toBeDefined();
    });

    it("should analyze waste", () => {
      const analysis = optimizer.analyzeCosts();
      expect(analysis.waste).toBeDefined();
      expect(analysis.waste.wastePercentage).toBeGreaterThanOrEqual(0);
    });

    it("should calculate efficiency metrics", () => {
      const analysis = optimizer.analyzeCosts();
      expect(analysis.efficiency.costPerSuccess).toBeGreaterThan(0);
      expect(analysis.efficiency.avgQualityScore).toBeGreaterThan(0);
    });
  });

  describe("recommendations", () => {
    beforeEach(() => {
      // Add data that would trigger recommendations
      for (let i = 0; i < 200; i++) {
        optimizer.recordUsage({
          timestamp: now - i * 60000,
          sessionId: `session-${i}`,
          featureId: "code-review",
          model: "gpt-4", // Premium model
          inputTokens: 3000 + Math.random() * 3000, // Large context
          outputTokens: 500,
          durationMs: 2000,
          success: true,
          qualityScore: 7 + Math.random() * 2,
          prompt:
            i % 5 === 0 ? "Duplicate prompt content" : `Unique prompt ${i}`,
        });
      }
    });

    it("should generate recommendations", () => {
      const recommendations = optimizer.generateRecommendations();
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it("should recommend model downgrades for premium models", () => {
      const recommendations = optimizer.generateRecommendations();
      const modelDowngradeRec = recommendations.find(
        (r) => r.strategy === "model_downgrade",
      );
      expect(modelDowngradeRec).toBeDefined();
      expect(modelDowngradeRec?.estimatedMonthlySavings).toBeGreaterThan(0);
    });

    it("should prioritize recommendations by potential savings", () => {
      const recommendations = optimizer.generateRecommendations();
      for (let i = 1; i < recommendations.length; i++) {
        expect(recommendations[i - 1].priority).toBeGreaterThanOrEqual(
          recommendations[i].priority,
        );
      }
    });

    it("should apply recommendations", () => {
      const recommendations = optimizer.generateRecommendations();
      const rec = recommendations[0];

      const applied = optimizer.applyRecommendation(rec.id);
      expect(applied).toBe(true);

      const updated = optimizer.getRecommendation(rec.id);
      expect(updated?.status).toBe("applied");
    });

    it("should dismiss recommendations", () => {
      const recommendations = optimizer.generateRecommendations();
      const rec = recommendations[0];

      const dismissed = optimizer.dismissRecommendation(rec.id);
      expect(dismissed).toBe(true);

      const updated = optimizer.getRecommendation(rec.id);
      expect(updated?.status).toBe("dismissed");
    });

    it("should list recommendations by status", () => {
      const recommendations = optimizer.generateRecommendations();
      optimizer.applyRecommendation(recommendations[0].id);

      const pending = optimizer.listRecommendations("pending");
      const applied = optimizer.listRecommendations("applied");

      expect(applied.length).toBe(1);
      expect(pending.length).toBe(recommendations.length - 1);
    });
  });

  describe("simulation", () => {
    beforeEach(() => {
      for (let i = 0; i < 100; i++) {
        optimizer.recordUsage({
          timestamp: now - i * 60000,
          sessionId: `session-${i}`,
          model: "gpt-4",
          inputTokens: 2000,
          outputTokens: 500,
          durationMs: 1500,
          success: true,
        });
      }
    });

    it("should simulate single strategy", () => {
      const simulation = optimizer.simulateOptimizations(["model_downgrade"]);

      expect(simulation.baselineCost).toBeGreaterThan(0);
      expect(simulation.savings).toBeGreaterThan(0);
      expect(simulation.savingsPercent).toBeGreaterThan(0);
    });

    it("should simulate multiple strategies", () => {
      const simulation = optimizer.simulateOptimizations([
        "model_downgrade",
        "prompt_compression",
        "response_caching",
      ]);

      expect(simulation.strategyBreakdown.length).toBe(3);
    });

    it("should assess risk level", () => {
      const lowRisk = optimizer.simulateOptimizations(["response_caching"]);
      expect(lowRisk.riskLevel).toBe("low");

      const multiStrategy = optimizer.simulateOptimizations([
        "model_downgrade",
        "prompt_compression",
        "context_pruning",
        "batch_requests",
      ]);
      // Multiple strategies with quality impacts should increase risk
      expect(["low", "medium", "high"]).toContain(multiStrategy.riskLevel);
    });

    it("should calculate quality and latency impacts", () => {
      const simulation = optimizer.simulateOptimizations(["model_downgrade"]);

      expect(simulation.qualityImpact).toBeDefined();
      expect(simulation.latencyImpact).toBeDefined();
    });
  });

  describe("auto-optimization", () => {
    beforeEach(() => {
      // Add quality data for different models
      for (let i = 0; i < 50; i++) {
        optimizer.recordUsage({
          timestamp: now - i * 60000,
          sessionId: `session-${i}`,
          featureId: "translation",
          model: "gpt-4o-mini",
          inputTokens: 500,
          outputTokens: 200,
          durationMs: 800,
          success: true,
          qualityScore: 8.5, // Good quality with cheaper model
        });
      }
    });

    it("should recommend model downgrade based on historical quality", () => {
      const result = optimizer.getOptimizedModel("gpt-4o", {
        featureId: "translation",
        qualityRequired: 7.0,
      });

      expect(result.model).toBe("gpt-4o-mini");
      expect(result.reason).toContain("Auto-downgraded");
    });

    it("should not downgrade when quality threshold not met", () => {
      const result = optimizer.getOptimizedModel("gpt-4o", {
        featureId: "translation",
        qualityRequired: 9.5, // Higher than historical quality
      });

      expect(result.model).toBe("gpt-4o");
    });

    it("should return original model when auto-optimize is disabled", () => {
      const noAutoOptimizer = new CostOptimizer({
        enabled: true,
        autoOptimize: false,
      });

      const result = noAutoOptimizer.getOptimizedModel("gpt-4");
      expect(result.model).toBe("gpt-4");
    });
  });

  describe("caching", () => {
    it("should check and use cache", () => {
      const promptHash = "test-hash-123";

      // Initially no cache
      const miss = optimizer.checkCache(promptHash);
      expect(miss.hit).toBe(false);

      // Add to cache
      optimizer.addToCache(promptHash, "Cached response", 0.05);

      // Now should hit
      const hit = optimizer.checkCache(promptHash);
      expect(hit.hit).toBe(true);
      expect(hit.response).toBe("Cached response");
      expect(hit.savedCost).toBe(0.05);
    });

    it("should not cache when response_caching not in strategies", () => {
      const noCacheOptimizer = new CostOptimizer({
        enabled: true,
        autoOptimize: true,
        autoStrategies: ["model_downgrade"],
      });

      noCacheOptimizer.addToCache("hash", "response", 0.05);
      const result = noCacheOptimizer.checkCache("hash");
      expect(result.hit).toBe(false);
    });
  });

  describe("realized savings", () => {
    it("should calculate realized savings from cached requests", () => {
      for (let i = 0; i < 20; i++) {
        optimizer.recordUsage({
          timestamp: now - i * 60000,
          sessionId: `session-${i}`,
          model: "gpt-4o",
          inputTokens: 1000,
          outputTokens: 500,
          durationMs: 100, // Fast response = cached
          success: true,
          cached: true,
        });
      }

      const savings = optimizer.calculateRealizedSavings();
      expect(savings.totalSavings).toBeGreaterThan(0);
      expect(savings.byStrategy.response_caching).toBeGreaterThan(0);
    });
  });
});
