import { describe, it, expect, beforeEach } from "vitest";
import {
  ProfilerEngine,
  type ProfilerConfig,
  type ProfileNode,
} from "../src/profiler";

describe("ProfilerEngine", () => {
  let profiler: ProfilerEngine;
  const mockConfig: ProfilerConfig = {
    enabled: true,
    samplingRate: 1.0,
    maxDepth: 50,
    trackTokens: true,
    trackCost: true,
    trackLatency: true,
    debug: false,
  };

  beforeEach(() => {
    profiler = new ProfilerEngine(mockConfig);
  });

  describe("start and end profile", () => {
    it("should start a profile and return profileId", () => {
      const profileId = profiler.startProfile("session-1");
      expect(profileId).toBeDefined();
      expect(typeof profileId).toBe("string");
    });

    it("should end a profile and return session data", () => {
      const profileId = profiler.startProfile("session-1");
      const session = profiler.endProfile(profileId);

      expect(session.id).toBe(profileId);
      expect(session.sessionId).toBe("session-1");
      expect(session.endTime).not.toBeNull();
      expect(session.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(session.totalNodes).toBe(1); // root node
    });

    it("should get profile by ID", () => {
      const profileId = profiler.startProfile("session-1");
      const session = profiler.getProfile(profileId);
      expect(session).toBeDefined();
      expect(session!.sessionId).toBe("session-1");
    });

    it("should return undefined for unknown profile", () => {
      expect(profiler.getProfile("unknown-id")).toBeUndefined();
    });
  });

  describe("node management", () => {
    it("should add nodes with parent-child relationships", () => {
      const profileId = profiler.startProfile("session-1");
      const session = profiler.getProfile(profileId)!;
      const rootId = session.rootNodeId;

      const childId = profiler.addNode(profileId, {
        name: "llm-call-1",
        type: "llm_call",
        parentId: rootId,
        startTime: 1000,
        endTime: null,
        durationMs: 0,
        tokens: { prompt: 100, completion: 50, total: 150 },
        cost: 0.01,
        model: "gpt-4",
        metadata: {},
      });

      expect(childId).toBeDefined();
      const rootNode = session.nodes.get(rootId)!;
      expect(rootNode.children).toContain(childId);

      const childNode = session.nodes.get(childId)!;
      expect(childNode.parentId).toBe(rootId);
    });

    it("should calculate depth from parent chain", () => {
      const profileId = profiler.startProfile("session-1");
      const session = profiler.getProfile(profileId)!;
      const rootId = session.rootNodeId;

      const level1Id = profiler.addNode(profileId, {
        name: "level-1",
        type: "llm_call",
        parentId: rootId,
        startTime: 1000,
        endTime: null,
        durationMs: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        model: null,
        metadata: {},
      });

      const level2Id = profiler.addNode(profileId, {
        name: "level-2",
        type: "tool_call",
        parentId: level1Id,
        startTime: 1100,
        endTime: null,
        durationMs: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        model: null,
        metadata: {},
      });

      const level1 = session.nodes.get(level1Id)!;
      const level2 = session.nodes.get(level2Id)!;

      expect(level1.depth).toBe(1);
      expect(level2.depth).toBe(2);
    });

    it("should calculate duration on endNode", () => {
      const profileId = profiler.startProfile("session-1");
      const session = profiler.getProfile(profileId)!;
      const rootId = session.rootNodeId;

      const nodeId = profiler.addNode(profileId, {
        name: "call-1",
        type: "llm_call",
        parentId: rootId,
        startTime: 1000,
        endTime: null,
        durationMs: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        model: null,
        metadata: {},
      });

      profiler.endNode(profileId, nodeId, 1500);

      const node = session.nodes.get(nodeId)!;
      expect(node.endTime).toBe(1500);
      expect(node.durationMs).toBe(500);
    });
  });

  describe("duration calculation (total and self)", () => {
    it("should calculate selfDurationMs correctly", () => {
      const profileId = profiler.startProfile("session-1");
      const session = profiler.getProfile(profileId)!;
      const rootId = session.rootNodeId;

      const parentId = profiler.addNode(profileId, {
        name: "parent",
        type: "llm_call",
        parentId: rootId,
        startTime: 1000,
        endTime: null,
        durationMs: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        model: null,
        metadata: {},
      });

      const child1Id = profiler.addNode(profileId, {
        name: "child-1",
        type: "tool_call",
        parentId,
        startTime: 1100,
        endTime: null,
        durationMs: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        model: null,
        metadata: {},
      });

      const child2Id = profiler.addNode(profileId, {
        name: "child-2",
        type: "tool_call",
        parentId,
        startTime: 1300,
        endTime: null,
        durationMs: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        model: null,
        metadata: {},
      });

      profiler.endNode(profileId, child1Id, 1200);
      profiler.endNode(profileId, child2Id, 1500);
      profiler.endNode(profileId, parentId, 1600);

      const result = profiler.endProfile(profileId);

      const parent = result.nodes.get(parentId)!;
      // parent total: 600ms, child1: 100ms, child2: 200ms → self: 300ms
      expect(parent.durationMs).toBe(600);
      expect(parent.selfDurationMs).toBe(300);
    });
  });

  describe("token/cost accumulation", () => {
    it("should accumulate tokens and cost across all nodes", () => {
      const profileId = profiler.startProfile("session-1");
      const session = profiler.getProfile(profileId)!;
      const rootId = session.rootNodeId;

      profiler.addNode(profileId, {
        name: "call-1",
        type: "llm_call",
        parentId: rootId,
        startTime: 1000,
        endTime: 1500,
        durationMs: 500,
        tokens: { prompt: 100, completion: 50, total: 150 },
        cost: 0.01,
        model: "gpt-4",
        metadata: {},
      });

      profiler.addNode(profileId, {
        name: "call-2",
        type: "llm_call",
        parentId: rootId,
        startTime: 1500,
        endTime: 2000,
        durationMs: 500,
        tokens: { prompt: 200, completion: 100, total: 300 },
        cost: 0.02,
        model: "gpt-4",
        metadata: {},
      });

      const result = profiler.endProfile(profileId);
      expect(result.totalTokens).toBe(450);
      expect(result.totalCost).toBeCloseTo(0.03);
    });
  });

  describe("flame graph generation", () => {
    let profileId: string;
    let rootId: string;

    beforeEach(() => {
      profileId = profiler.startProfile("session-1");
      const session = profiler.getProfile(profileId)!;
      rootId = session.rootNodeId;

      const call1 = profiler.addNode(profileId, {
        name: "llm-call-1",
        type: "llm_call",
        parentId: rootId,
        startTime: 1000,
        endTime: 1500,
        durationMs: 500,
        tokens: { prompt: 100, completion: 50, total: 150 },
        cost: 0.05,
        model: "gpt-4",
        metadata: {},
      });

      profiler.addNode(profileId, {
        name: "tool-1",
        type: "tool_call",
        parentId: call1,
        startTime: 1100,
        endTime: 1300,
        durationMs: 200,
        tokens: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        model: null,
        metadata: {},
      });

      profiler.addNode(profileId, {
        name: "llm-call-2",
        type: "llm_call",
        parentId: rootId,
        startTime: 1500,
        endTime: 2000,
        durationMs: 500,
        tokens: { prompt: 200, completion: 100, total: 300 },
        cost: 0.1,
        model: "gpt-4",
        metadata: {},
      });

      profiler.endProfile(profileId);
    });

    it("should generate flame graph for duration", () => {
      const graph = profiler.generateFlameGraph(profileId, "duration");

      expect(graph.metric).toBe("duration");
      expect(graph.root).toBeDefined();
      expect(graph.root.children.length).toBe(2);
      expect(graph.totalValue).toBeGreaterThan(0);
      expect(graph.maxDepth).toBeGreaterThanOrEqual(2);
    });

    it("should generate flame graph for cost", () => {
      const graph = profiler.generateFlameGraph(profileId, "cost");

      expect(graph.metric).toBe("cost");
      expect(graph.totalValue).toBeGreaterThan(0);

      // LLM calls should have cost, tool call should not
      const llmEntry = graph.root.children.find(
        (c) => c.name === "llm-call-2",
      )!;
      expect(llmEntry.value).toBe(0.1);
    });

    it("should generate flame graph for tokens", () => {
      const graph = profiler.generateFlameGraph(profileId, "tokens");

      expect(graph.metric).toBe("tokens");
      expect(graph.totalValue).toBe(450);

      // Find the tool call - should have 0 tokens
      const llm1 = graph.root.children.find((c) => c.name === "llm-call-1")!;
      const tool = llm1.children.find((c) => c.name === "tool-1")!;
      expect(tool.value).toBe(0);
    });

    it("should calculate percentages correctly", () => {
      const graph = profiler.generateFlameGraph(profileId, "tokens");

      const totalTokens = graph.totalValue;
      const llm2 = graph.root.children.find((c) => c.name === "llm-call-2")!;
      expect(llm2.percentage).toBeCloseTo((300 / totalTokens) * 100, 1);
    });
  });

  describe("bottleneck detection", () => {
    it("should find top N bottlenecks by duration", () => {
      const profileId = profiler.startProfile("session-1");
      const session = profiler.getProfile(profileId)!;
      const rootId = session.rootNodeId;

      // Add nodes with varying durations
      profiler.addNode(profileId, {
        name: "fast-call",
        type: "tool_call",
        parentId: rootId,
        startTime: 1000,
        endTime: 1100,
        durationMs: 100,
        tokens: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        model: null,
        metadata: {},
      });

      profiler.addNode(profileId, {
        name: "slow-call",
        type: "llm_call",
        parentId: rootId,
        startTime: 1100,
        endTime: 2100,
        durationMs: 1000,
        tokens: { prompt: 500, completion: 200, total: 700 },
        cost: 0.05,
        model: "gpt-4",
        metadata: {},
      });

      profiler.addNode(profileId, {
        name: "medium-call",
        type: "tool_call",
        parentId: rootId,
        startTime: 2100,
        endTime: 2600,
        durationMs: 500,
        tokens: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        model: null,
        metadata: {},
      });

      profiler.endProfile(profileId);

      const bottlenecks = profiler.findBottlenecks(profileId, {
        topN: 2,
        metric: "duration",
      });

      expect(bottlenecks).toHaveLength(2);
      expect(bottlenecks[0].nodeName).toBe("slow-call");
      expect(bottlenecks[1].nodeName).toBe("medium-call");
      expect(bottlenecks[0].value).toBe(1000);
      expect(bottlenecks[0].severity).toBeDefined();
    });
  });

  describe("optimization recommendations", () => {
    it("should recommend model_downgrade for expensive LLM calls", () => {
      const profileId = profiler.startProfile("session-1");
      const session = profiler.getProfile(profileId)!;
      const rootId = session.rootNodeId;

      profiler.addNode(profileId, {
        name: "expensive-call",
        type: "llm_call",
        parentId: rootId,
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        tokens: { prompt: 1000, completion: 500, total: 1500 },
        cost: 0.8,
        model: "gpt-4",
        metadata: {},
      });

      profiler.addNode(profileId, {
        name: "cheap-call",
        type: "llm_call",
        parentId: rootId,
        startTime: 2000,
        endTime: 2500,
        durationMs: 500,
        tokens: { prompt: 100, completion: 50, total: 150 },
        cost: 0.05,
        model: "gpt-3.5-turbo",
        metadata: {},
      });

      profiler.endProfile(profileId);

      const recommendations = profiler.generateRecommendations(profileId);
      const downgrade = recommendations.find(
        (r) => r.type === "model_downgrade",
      );
      expect(downgrade).toBeDefined();
      expect(downgrade!.affectedNodes).toHaveLength(1);
      expect(downgrade!.estimatedSavings.cost).toBeGreaterThan(0);
    });

    it("should recommend reduce_context for high token usage", () => {
      const profileId = profiler.startProfile("session-1");
      const session = profiler.getProfile(profileId)!;
      const rootId = session.rootNodeId;

      profiler.addNode(profileId, {
        name: "big-prompt",
        type: "llm_call",
        parentId: rootId,
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        tokens: { prompt: 8000, completion: 3000, total: 11000 },
        cost: 0.1,
        model: "gpt-4",
        metadata: {},
      });

      profiler.endProfile(profileId);

      const recommendations = profiler.generateRecommendations(profileId);
      const reduceCtx = recommendations.find(
        (r) => r.type === "reduce_context",
      );
      expect(reduceCtx).toBeDefined();
      expect(reduceCtx!.estimatedSavings.tokens).toBeGreaterThan(0);
    });

    it("should recommend cache_response for duplicate tool calls", () => {
      const profileId = profiler.startProfile("session-1");
      const session = profiler.getProfile(profileId)!;
      const rootId = session.rootNodeId;

      // Add duplicate tool calls with same name and input
      profiler.addNode(profileId, {
        name: "search-api",
        type: "tool_call",
        parentId: rootId,
        startTime: 1000,
        endTime: 1500,
        durationMs: 500,
        tokens: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        model: null,
        metadata: { input: "query=test" },
      });

      profiler.addNode(profileId, {
        name: "search-api",
        type: "tool_call",
        parentId: rootId,
        startTime: 2000,
        endTime: 2500,
        durationMs: 500,
        tokens: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        model: null,
        metadata: { input: "query=test" },
      });

      profiler.endProfile(profileId);

      const recommendations = profiler.generateRecommendations(profileId);
      const cache = recommendations.find((r) => r.type === "cache_response");
      expect(cache).toBeDefined();
      expect(cache!.affectedNodes).toHaveLength(2);
      expect(cache!.estimatedSavings.latencyMs).toBe(500);
    });

    it("should recommend parallelize for sequential LLM calls", () => {
      const profileId = profiler.startProfile("session-1");
      const session = profiler.getProfile(profileId)!;
      const rootId = session.rootNodeId;

      // Add 4 sequential LLM calls under the same parent
      for (let i = 0; i < 4; i++) {
        profiler.addNode(profileId, {
          name: `llm-call-${i}`,
          type: "llm_call",
          parentId: rootId,
          startTime: 1000 + i * 500,
          endTime: 1000 + (i + 1) * 500,
          durationMs: 500,
          tokens: { prompt: 100, completion: 50, total: 150 },
          cost: 0.01,
          model: "gpt-4",
          metadata: {},
        });
      }

      profiler.endProfile(profileId);

      const recommendations = profiler.generateRecommendations(profileId);
      const parallel = recommendations.find((r) => r.type === "parallelize");
      expect(parallel).toBeDefined();
      expect(parallel!.affectedNodes).toHaveLength(4);
      expect(parallel!.estimatedSavings.latencyMs).toBeGreaterThan(0);
    });
  });

  describe("metrics tracking", () => {
    it("should track aggregate metrics", () => {
      const p1 = profiler.startProfile("session-1");
      const s1 = profiler.getProfile(p1)!;
      profiler.addNode(p1, {
        name: "call-1",
        type: "llm_call",
        parentId: s1.rootNodeId,
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        tokens: { prompt: 100, completion: 50, total: 150 },
        cost: 0.01,
        model: "gpt-4",
        metadata: {},
      });
      profiler.endProfile(p1);

      const p2 = profiler.startProfile("session-2");
      const s2 = profiler.getProfile(p2)!;
      profiler.addNode(p2, {
        name: "call-2",
        type: "llm_call",
        parentId: s2.rootNodeId,
        startTime: 1000,
        endTime: 3000,
        durationMs: 2000,
        tokens: { prompt: 200, completion: 100, total: 300 },
        cost: 0.02,
        model: "gpt-4",
        metadata: {},
      });
      profiler.endProfile(p2);

      const metrics = profiler.getMetrics();
      expect(metrics.totalProfiles).toBe(2);
      expect(metrics.avgTokens).toBe(225); // (150 + 300) / 2
      expect(metrics.avgCost).toBeCloseTo(0.015);
    });
  });

  describe("reset", () => {
    it("should clear all state on reset", () => {
      const profileId = profiler.startProfile("session-1");
      profiler.endProfile(profileId);

      profiler.reset();

      expect(profiler.getProfile(profileId)).toBeUndefined();
      const metrics = profiler.getMetrics();
      expect(metrics.totalProfiles).toBe(0);
      expect(metrics.avgDurationMs).toBe(0);
      expect(metrics.avgTokens).toBe(0);
      expect(metrics.avgCost).toBe(0);
      expect(metrics.totalOptimizationsFound).toBe(0);
      expect(metrics.totalBottlenecksFound).toBe(0);
    });
  });
});
