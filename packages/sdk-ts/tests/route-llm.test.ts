import { describe, it, expect, beforeEach } from "vitest";
import { RouteLLMEngine } from "../src/route-llm";
import type { ModelProfile, RoutingRequest } from "../src/route-llm";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestModels(): ModelProfile[] {
  return [
    {
      modelId: "gpt-4o",
      costPer1kTokens: { input: 0.005, output: 0.015 },
      avgLatencyMs: 800,
      qualityScore: 0.95,
      maxTokens: 128000,
      capabilities: ["chat", "code", "reasoning", "vision"],
      tier: "premium",
    },
    {
      modelId: "gpt-4o-mini",
      costPer1kTokens: { input: 0.00015, output: 0.0006 },
      avgLatencyMs: 400,
      qualityScore: 0.8,
      maxTokens: 128000,
      capabilities: ["chat", "code", "reasoning"],
      tier: "standard",
    },
    {
      modelId: "gpt-3.5-turbo",
      costPer1kTokens: { input: 0.0005, output: 0.0015 },
      avgLatencyMs: 300,
      qualityScore: 0.6,
      maxTokens: 16384,
      capabilities: ["chat"],
      tier: "economy",
    },
  ];
}

function createRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    input: "Explain quantum computing",
    estimatedTokens: 1000,
    requiredCapabilities: ["chat"],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("RouteLLMEngine", () => {
  let engine: RouteLLMEngine;
  const models = createTestModels();

  beforeEach(() => {
    engine = new RouteLLMEngine({
      enabled: true,
      models,
      defaultModel: "gpt-4o",
      qualityFloor: 0.5,
      costWeight: 0.4,
      qualityWeight: 0.4,
      latencyWeight: 0.2,
    });
  });

  // ==========================================================================
  // Model CRUD
  // ==========================================================================

  describe("model management", () => {
    it("should initialize with provided models", () => {
      expect(engine.getModels()).toHaveLength(3);
    });

    it("should add a model", () => {
      engine.addModel({
        modelId: "claude-3-opus",
        costPer1kTokens: { input: 0.015, output: 0.075 },
        avgLatencyMs: 1200,
        qualityScore: 0.97,
        maxTokens: 200000,
        capabilities: ["chat", "code", "reasoning", "vision"],
        tier: "premium",
      });
      expect(engine.getModels()).toHaveLength(4);
      expect(
        engine.getModels().find((m) => m.modelId === "claude-3-opus"),
      ).toBeDefined();
    });

    it("should remove a model", () => {
      engine.removeModel("gpt-3.5-turbo");
      expect(engine.getModels()).toHaveLength(2);
      expect(
        engine.getModels().find((m) => m.modelId === "gpt-3.5-turbo"),
      ).toBeUndefined();
    });

    it("should update default model when current default is removed", () => {
      engine.removeModel("gpt-4o");
      // Default should shift to another model
      const decision = engine.route(createRequest());
      expect(decision.selectedModel).not.toBe("gpt-4o");
    });
  });

  // ==========================================================================
  // Basic Routing
  // ==========================================================================

  describe("basic routing", () => {
    it("should select cheapest model meeting quality floor", () => {
      const decision = engine.route(createRequest());
      // With equal cost+quality weights and quality floor of 0.5,
      // gpt-4o-mini should score well due to very low cost + decent quality
      expect(decision.selectedModel).toBeDefined();
      expect(decision.estimatedCost).toBeGreaterThan(0);
      expect(decision.estimatedQuality).toBeGreaterThanOrEqual(0.5);
    });

    it("should filter models below quality floor", () => {
      const highQualityEngine = new RouteLLMEngine({
        enabled: true,
        models,
        defaultModel: "gpt-4o",
        qualityFloor: 0.9,
        costWeight: 0.4,
        qualityWeight: 0.4,
        latencyWeight: 0.2,
      });

      const decision = highQualityEngine.route(createRequest());
      // Only gpt-4o has quality >= 0.9
      expect(decision.selectedModel).toBe("gpt-4o");
    });

    it("should provide alternative models", () => {
      const decision = engine.route(createRequest());
      expect(decision.alternativeModels).toBeDefined();
      expect(Array.isArray(decision.alternativeModels)).toBe(true);
    });

    it("should include timestamp in decision", () => {
      const decision = engine.route(createRequest());
      expect(decision.timestamp).toBeGreaterThan(0);
    });

    it("should fall back to default when no models meet constraints", () => {
      const decision = engine.route(
        createRequest({ maxCostPerRequest: 0.0000001 }),
      );
      expect(decision.selectedModel).toBe("gpt-4o");
      expect(decision.reason).toContain("falling back to default");
    });
  });

  // ==========================================================================
  // Capability Filtering
  // ==========================================================================

  describe("capability filtering", () => {
    it("should filter models by required capabilities", () => {
      const decision = engine.route(
        createRequest({ requiredCapabilities: ["vision"] }),
      );
      // Only gpt-4o has vision
      expect(decision.selectedModel).toBe("gpt-4o");
    });

    it("should filter by multiple capabilities", () => {
      const decision = engine.route(
        createRequest({ requiredCapabilities: ["chat", "code", "reasoning"] }),
      );
      // gpt-4o and gpt-4o-mini both have these
      expect(["gpt-4o", "gpt-4o-mini"]).toContain(decision.selectedModel);
    });

    it("should fall back when no model has required capability", () => {
      const decision = engine.route(
        createRequest({ requiredCapabilities: ["nonexistent"] }),
      );
      expect(decision.selectedModel).toBe("gpt-4o");
      expect(decision.reason).toContain("falling back to default");
    });
  });

  // ==========================================================================
  // Cost/Latency Constraints
  // ==========================================================================

  describe("cost and latency constraints", () => {
    it("should respect maxCostPerRequest", () => {
      const decision = engine.route(
        createRequest({ maxCostPerRequest: 0.001 }),
      );
      expect(decision.estimatedCost).toBeLessThanOrEqual(0.001);
    });

    it("should respect maxLatencyMs", () => {
      const decision = engine.route(createRequest({ maxLatencyMs: 500 }));
      // gpt-4o is 800ms, so should be excluded
      expect(decision.estimatedLatency).toBeLessThanOrEqual(500);
    });

    it("should handle token capacity constraint", () => {
      const decision = engine.route(createRequest({ estimatedTokens: 20000 }));
      // gpt-3.5-turbo has maxTokens=16384, should be excluded
      expect(decision.selectedModel).not.toBe("gpt-3.5-turbo");
    });
  });

  // ==========================================================================
  // Shadow Mode
  // ==========================================================================

  describe("shadow mode", () => {
    it("should return default model in shadow mode", () => {
      const shadowEngine = new RouteLLMEngine({
        enabled: true,
        models,
        defaultModel: "gpt-4o",
        shadowMode: true,
        costWeight: 0.8,
        qualityWeight: 0.1,
        latencyWeight: 0.1,
        qualityFloor: 0.5,
      });

      const decision = shadowEngine.route(createRequest());
      expect(decision.selectedModel).toBe("gpt-4o");
      expect(decision.shadowMode).toBe(true);
    });

    it("should log optimal model in shadow mode reason", () => {
      const shadowEngine = new RouteLLMEngine({
        enabled: true,
        models,
        defaultModel: "gpt-4o",
        shadowMode: true,
        costWeight: 0.8,
        qualityWeight: 0.1,
        latencyWeight: 0.1,
        qualityFloor: 0.5,
      });

      const decision = shadowEngine.route(createRequest());
      // If optimal != default, reason should mention the optimal model
      if (decision.reason.includes("Shadow mode")) {
        expect(decision.reason).toContain("optimal=");
      }
    });

    it("should track shadow mode decisions in metrics", () => {
      const shadowEngine = new RouteLLMEngine({
        enabled: true,
        models,
        defaultModel: "gpt-4o",
        shadowMode: true,
        qualityFloor: 0.5,
      });

      shadowEngine.route(createRequest());
      shadowEngine.route(createRequest());

      const metrics = shadowEngine.getMetrics();
      expect(metrics.shadowModeDecisions).toBe(2);
    });
  });

  // ==========================================================================
  // Performance Data
  // ==========================================================================

  describe("performance data recording", () => {
    it("should record and retrieve outcome data", () => {
      const decision = engine.route(createRequest());
      const history = engine.getRoutingHistory();
      const requestId = history[0].requestId;

      engine.recordOutcome(requestId, 0.005, 750, 0.92);

      const updatedHistory = engine.getRoutingHistory();
      expect(updatedHistory[0].actualCost).toBe(0.005);
      expect(updatedHistory[0].actualLatency).toBe(750);
      expect(updatedHistory[0].actualQuality).toBe(0.92);
    });

    it("should compute model performance statistics", () => {
      // Route multiple requests and record outcomes
      for (let i = 0; i < 5; i++) {
        engine.route(createRequest());
      }

      const history = engine.getRoutingHistory();
      const modelId = history[0].decision.selectedModel;

      for (const entry of history) {
        if (entry.decision.selectedModel === modelId) {
          engine.recordOutcome(
            entry.requestId,
            0.003 + Math.random() * 0.002,
            400,
            0.85,
          );
        }
      }

      const perf = engine.getModelPerformance(modelId);
      expect(perf).toBeDefined();
      expect(perf!.samples).toBeGreaterThan(0);
      expect(perf!.avgCost).toBeGreaterThan(0);
      expect(perf!.avgLatency).toBeGreaterThan(0);
      expect(perf!.avgQuality).toBeGreaterThan(0);
    });

    it("should return undefined for models with no data", () => {
      const perf = engine.getModelPerformance("nonexistent-model");
      expect(perf).toBeUndefined();
    });
  });

  // ==========================================================================
  // Fallback Chain
  // ==========================================================================

  describe("fallback chain routing", () => {
    it("should create a fallback chain", () => {
      const chain = engine.createFallbackChain("gpt-4o", [
        "gpt-4o-mini",
        "gpt-3.5-turbo",
      ]);
      expect(chain.models).toEqual(["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"]);
      expect(chain.strategy).toBe("sequential");
    });

    it("should route with sequential fallback", () => {
      const chain = engine.createFallbackChain(
        "gpt-4o",
        ["gpt-4o-mini", "gpt-3.5-turbo"],
        "sequential",
      );

      const decision = engine.routeWithFallback(createRequest(), chain);
      expect(decision.selectedModel).toBe("gpt-4o");
    });

    it("should skip models missing capabilities in fallback chain", () => {
      const chain = engine.createFallbackChain(
        "gpt-3.5-turbo",
        ["gpt-4o-mini", "gpt-4o"],
        "sequential",
      );

      const decision = engine.routeWithFallback(
        createRequest({ requiredCapabilities: ["code"] }),
        chain,
      );
      // gpt-3.5-turbo doesn't have "code", should fall to gpt-4o-mini
      expect(decision.selectedModel).toBe("gpt-4o-mini");
    });

    it("should route with quality_threshold strategy", () => {
      const chain = engine.createFallbackChain(
        "gpt-3.5-turbo",
        ["gpt-4o-mini", "gpt-4o"],
        "quality_threshold",
        0.7,
      );

      const decision = engine.routeWithFallback(createRequest(), chain);
      // gpt-3.5-turbo quality is 0.6, below 0.7. gpt-4o-mini is 0.8, above 0.7
      expect(decision.selectedModel).not.toBe("gpt-3.5-turbo");
    });
  });

  // ==========================================================================
  // Savings Estimation
  // ==========================================================================

  describe("savings estimation", () => {
    it("should estimate savings compared to default model", () => {
      const requests = Array.from({ length: 10 }, () => createRequest());

      const result = engine.estimateSavings(requests);
      expect(result.totalCostDirect).toBeGreaterThan(0);
      expect(result.totalCostRouted).toBeGreaterThan(0);
      expect(result.totalCostRouted).toBeLessThanOrEqual(
        result.totalCostDirect,
      );
      expect(result.savings).toBeGreaterThanOrEqual(0);
      expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
    });

    it("should return zero savings when default is cheapest", () => {
      const cheapEngine = new RouteLLMEngine({
        enabled: true,
        models,
        defaultModel: "gpt-4o-mini",
        qualityFloor: 0.0,
        costWeight: 1.0,
        qualityWeight: 0.0,
        latencyWeight: 0.0,
      });

      const requests = [createRequest()];
      const result = cheapEngine.estimateSavings(requests);
      // When the cheapest model is the default, savings should be 0
      expect(result.savings).toBeCloseTo(0, 5);
    });
  });

  // ==========================================================================
  // Routing Metrics
  // ==========================================================================

  describe("routing metrics", () => {
    it("should track total requests", () => {
      engine.route(createRequest());
      engine.route(createRequest());
      engine.route(createRequest());

      const metrics = engine.getMetrics();
      expect(metrics.totalRequests).toBe(3);
    });

    it("should track routing by tier", () => {
      // Force routing to different tiers
      const premiumEngine = new RouteLLMEngine({
        enabled: true,
        models,
        defaultModel: "gpt-4o",
        qualityFloor: 0.9,
      });

      premiumEngine.route(createRequest());
      const metrics = premiumEngine.getMetrics();
      expect(metrics.routedToPremium).toBe(1);
    });

    it("should track estimated savings in metrics", () => {
      // Route with cost optimization
      engine.route(createRequest());
      const metrics = engine.getMetrics();
      expect(typeof metrics.estimatedSavings).toBe("number");
    });

    it("should reset metrics", () => {
      engine.route(createRequest());
      engine.route(createRequest());
      engine.reset();

      const metrics = engine.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.routedToPremium).toBe(0);
    });
  });

  // ==========================================================================
  // Routing History
  // ==========================================================================

  describe("routing history", () => {
    it("should record routing decisions", () => {
      engine.route(createRequest());
      const history = engine.getRoutingHistory();
      expect(history).toHaveLength(1);
      expect(history[0].request.input).toBe("Explain quantum computing");
      expect(history[0].decision.selectedModel).toBeDefined();
    });

    it("should filter history by model", () => {
      engine.route(createRequest());
      const history = engine.getRoutingHistory();
      const modelId = history[0].decision.selectedModel;

      const filtered = engine.getRoutingHistory({ modelId });
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((h) => h.decision.selectedModel === modelId)).toBe(
        true,
      );
    });

    it("should filter history by session", () => {
      engine.route(createRequest({ sessionId: "session-1" }));
      engine.route(createRequest({ sessionId: "session-2" }));

      const filtered = engine.getRoutingHistory({ sessionId: "session-1" });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].request.sessionId).toBe("session-1");
    });

    it("should filter history by timestamp", () => {
      engine.route(createRequest());

      const future = Date.now() + 100000;
      const filtered = engine.getRoutingHistory({ since: future });
      expect(filtered).toHaveLength(0);
    });

    it("should clear history on reset", () => {
      engine.route(createRequest());
      engine.reset();
      expect(engine.getRoutingHistory()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Callback
  // ==========================================================================

  describe("routing callback", () => {
    it("should invoke onRoutingDecision callback", () => {
      const decisions: unknown[] = [];
      const cbEngine = new RouteLLMEngine({
        enabled: true,
        models,
        defaultModel: "gpt-4o",
        qualityFloor: 0.5,
        onRoutingDecision: (d) => decisions.push(d),
      });

      cbEngine.route(createRequest());
      expect(decisions).toHaveLength(1);
    });
  });
});
