/**
 * Tests for Semantic Diff Engine
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  SemanticDiffEngine,
  InMemoryDiffSessionStore,
} from "../src/semantic-diff/index.js";
import type { CohortSession } from "../src/semantic-diff/index.js";

describe("SemanticDiffEngine", () => {
  let engine: SemanticDiffEngine;
  let sessionStore: InMemoryDiffSessionStore;

  beforeEach(() => {
    sessionStore = new InMemoryDiffSessionStore();
    engine = new SemanticDiffEngine({ enabled: true }, sessionStore);
  });

  const createMockSession = (
    overrides: Partial<CohortSession> = {},
  ): CohortSession => ({
    sessionId: `sess_${Math.random().toString(36).substr(2, 9)}`,
    userId: "user123",
    featureId: "feature1",
    model: "gpt-4",
    status: "success",
    startTime: Date.now() - 5000,
    endTime: Date.now(),
    durationMs: 5000,
    totalCost: 0.01,
    totalTokens: 150,
    eventCount: 5,
    errorCount: 0,
    toolCalls: 2,
    toolSuccesses: 2,
    toolFailures: 0,
    ...overrides,
  });

  describe("basic comparison", () => {
    it("should compare two cohorts", async () => {
      // Add baseline sessions (older)
      const baselineTime = Date.now() - 100000;
      for (let i = 0; i < 10; i++) {
        sessionStore.addSession(
          createMockSession({
            startTime: baselineTime + i * 1000,
            durationMs: 1000,
            totalCost: 0.01,
          }),
        );
      }

      // Add comparison sessions (newer)
      const comparisonTime = Date.now() - 50000;
      for (let i = 0; i < 10; i++) {
        sessionStore.addSession(
          createMockSession({
            startTime: comparisonTime + i * 1000,
            durationMs: 1500,
            totalCost: 0.015,
          }),
        );
      }

      const result = await engine.compare({
        baseline: {
          timeRange: { start: baselineTime - 1000, end: baselineTime + 15000 },
        },
        comparison: {
          timeRange: {
            start: comparisonTime - 1000,
            end: comparisonTime + 15000,
          },
        },
      });

      expect(result.summary).toBeTruthy();
      expect(result.metricDiffs.length).toBeGreaterThan(0);
      expect(result.statistics.sampleSizes.baseline).toBe(10);
      expect(result.statistics.sampleSizes.comparison).toBe(10);
    });

    it("should detect significant changes", async () => {
      // Baseline: low error rate
      for (let i = 0; i < 20; i++) {
        sessionStore.addSession(
          createMockSession({
            promptVersion: "v1",
            status: "success",
          }),
        );
      }

      // Comparison: high error rate
      for (let i = 0; i < 20; i++) {
        sessionStore.addSession(
          createMockSession({
            promptVersion: "v2",
            status: i < 10 ? "success" : "error",
            errorCount: i < 10 ? 0 : 1,
          }),
        );
      }

      const result = await engine.comparePromptVersions("v1", "v2");

      expect(result.significantChanges.length).toBeGreaterThan(0);
      expect(
        result.behavioralChanges.some((c) => c.type === "new_error_pattern"),
      ).toBe(true);
    });
  });

  describe("time period comparison", () => {
    it("should compare before and after a pivot time", async () => {
      const pivotTime = Date.now() - 50000;

      // Before sessions
      for (let i = 0; i < 10; i++) {
        sessionStore.addSession(
          createMockSession({
            startTime: pivotTime - 10000 + i * 500,
          }),
        );
      }

      // After sessions
      for (let i = 0; i < 10; i++) {
        sessionStore.addSession(
          createMockSession({
            startTime: pivotTime + 1000 + i * 500,
          }),
        );
      }

      const result = await engine.compareTimePeriods(pivotTime, {
        beforeDurationMs: 20000,
        afterDurationMs: 20000,
      });

      expect(result.statistics.sampleSizes.baseline).toBe(10);
      expect(result.statistics.sampleSizes.comparison).toBe(10);
    });
  });

  describe("model comparison", () => {
    it("should compare different models", async () => {
      // GPT-4 sessions
      for (let i = 0; i < 15; i++) {
        sessionStore.addSession(
          createMockSession({
            model: "gpt-4",
            durationMs: 2000,
            totalCost: 0.02,
          }),
        );
      }

      // GPT-3.5 sessions
      for (let i = 0; i < 15; i++) {
        sessionStore.addSession(
          createMockSession({
            model: "gpt-3.5-turbo",
            durationMs: 1000,
            totalCost: 0.002,
          }),
        );
      }

      const result = await engine.compareModels("gpt-4", "gpt-3.5-turbo");

      expect(result.metricDiffs.some((d) => d.metric === "avg_cost")).toBe(
        true,
      );
      expect(result.metricDiffs.some((d) => d.metric === "avg_latency")).toBe(
        true,
      );
    });
  });

  describe("version markers", () => {
    it("should record deployment markers", () => {
      const id = engine.recordDeployment({
        version: "1.2.3",
        description: "New release",
        commitSha: "abc123",
        branch: "main",
        environment: "production",
      });

      const markers = engine.getVersionMarkers("deployment");
      expect(markers.length).toBe(1);
      expect(markers[0].id).toBe(id);
      expect(markers[0].version).toBe("1.2.3");
    });

    it("should record prompt version markers", () => {
      const id = engine.recordPromptVersion({
        version: "v2.0",
        description: "Improved system prompt",
        templateId: "tmpl_1",
        contentHash: "hash123",
        tokenCount: 500,
      });

      const markers = engine.getVersionMarkers("prompt");
      expect(markers.length).toBe(1);
      expect(markers[0].id).toBe(id);
    });
  });

  describe("statistical analysis", () => {
    it("should warn about small sample sizes", async () => {
      sessionStore.addSession(createMockSession({ promptVersion: "v1" }));
      sessionStore.addSession(createMockSession({ promptVersion: "v2" }));

      const result = await engine.comparePromptVersions("v1", "v2");

      expect(result.statistics.warnings.length).toBeGreaterThan(0);
      expect(result.statistics.isValid).toBe(false);
    });

    it("should calculate statistical power", async () => {
      for (let i = 0; i < 50; i++) {
        sessionStore.addSession(createMockSession({ promptVersion: "v1" }));
        sessionStore.addSession(createMockSession({ promptVersion: "v2" }));
      }

      const result = await engine.comparePromptVersions("v1", "v2");

      expect(result.statistics.power).toBeGreaterThan(0.5);
    });
  });

  describe("recommendations", () => {
    it("should recommend rollback for critical regressions", async () => {
      // Baseline: all success
      for (let i = 0; i < 30; i++) {
        sessionStore.addSession(
          createMockSession({
            promptVersion: "v1",
            status: "success",
          }),
        );
      }

      // Comparison: mostly failures
      for (let i = 0; i < 30; i++) {
        sessionStore.addSession(
          createMockSession({
            promptVersion: "v2",
            status: i < 5 ? "success" : "error",
            errorCount: i < 5 ? 0 : 1,
          }),
        );
      }

      const result = await engine.comparePromptVersions("v1", "v2");

      expect(
        result.recommendations.some(
          (r) => r.category === "rollback" || r.category === "investigate",
        ),
      ).toBe(true);
    });

    it("should approve when improvements detected", async () => {
      // Baseline: some errors, slow
      for (let i = 0; i < 30; i++) {
        sessionStore.addSession(
          createMockSession({
            promptVersion: "v1",
            status: i < 25 ? "success" : "error",
            durationMs: 5000,
          }),
        );
      }

      // Comparison: no errors, fast
      for (let i = 0; i < 30; i++) {
        sessionStore.addSession(
          createMockSession({
            promptVersion: "v2",
            status: "success",
            durationMs: 2000,
          }),
        );
      }

      const result = await engine.comparePromptVersions("v1", "v2");

      const hasApproveOrMonitor = result.recommendations.some(
        (r) => r.category === "approve" || r.category === "monitor",
      );
      expect(hasApproveOrMonitor).toBe(true);
    });
  });

  describe("dimensional breakdowns", () => {
    it("should break down by model", async () => {
      for (let i = 0; i < 10; i++) {
        sessionStore.addSession(
          createMockSession({
            promptVersion: "v1",
            model: i < 5 ? "gpt-4" : "gpt-3.5-turbo",
          }),
        );
        sessionStore.addSession(
          createMockSession({
            promptVersion: "v2",
            model: i < 7 ? "gpt-4" : "gpt-3.5-turbo",
          }),
        );
      }

      const result = await engine.compare({
        baseline: { promptVersion: "v1" },
        comparison: { promptVersion: "v2" },
        dimensions: ["model"],
      });

      const modelDiff = result.dimensionalDiffs.find(
        (d) => d.dimension === "model",
      );
      expect(modelDiff).toBeTruthy();
      expect(modelDiff?.breakdown.length).toBeGreaterThan(0);
    });
  });
});

describe("InMemoryDiffSessionStore", () => {
  let store: InMemoryDiffSessionStore;

  beforeEach(() => {
    store = new InMemoryDiffSessionStore();
  });

  it("should add and retrieve sessions", async () => {
    store.addSession({
      sessionId: "sess_1",
      status: "success",
      startTime: Date.now(),
      durationMs: 1000,
      totalCost: 0.01,
      totalTokens: 100,
      eventCount: 5,
      errorCount: 0,
      toolCalls: 0,
      toolSuccesses: 0,
      toolFailures: 0,
    });

    const sessions = await store.getSessions({});
    expect(sessions.length).toBe(1);
  });

  it("should filter by multiple criteria", async () => {
    store.addSessions([
      {
        sessionId: "s1",
        model: "gpt-4",
        featureId: "f1",
        status: "success",
        startTime: Date.now(),
        durationMs: 1000,
        totalCost: 0.01,
        totalTokens: 100,
        eventCount: 1,
        errorCount: 0,
        toolCalls: 0,
        toolSuccesses: 0,
        toolFailures: 0,
      },
      {
        sessionId: "s2",
        model: "gpt-4",
        featureId: "f2",
        status: "success",
        startTime: Date.now(),
        durationMs: 1000,
        totalCost: 0.01,
        totalTokens: 100,
        eventCount: 1,
        errorCount: 0,
        toolCalls: 0,
        toolSuccesses: 0,
        toolFailures: 0,
      },
      {
        sessionId: "s3",
        model: "gpt-3.5",
        featureId: "f1",
        status: "error",
        startTime: Date.now(),
        durationMs: 1000,
        totalCost: 0.01,
        totalTokens: 100,
        eventCount: 1,
        errorCount: 1,
        toolCalls: 0,
        toolSuccesses: 0,
        toolFailures: 0,
      },
    ]);

    const filtered = await store.getSessions({
      model: "gpt-4",
      featureId: "f1",
    });
    expect(filtered.length).toBe(1);
    expect(filtered[0].sessionId).toBe("s1");
  });
});
