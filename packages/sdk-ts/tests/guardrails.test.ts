/**
 * Tests for Cost Guardrails Engine
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CostGuardrailsEngine,
  createGuardrailMiddleware,
} from "../src/guardrails/index.js";
import type {
  GuardrailWarning,
  GuardrailEnforcement,
} from "../src/guardrails/index.js";

describe("CostGuardrailsEngine", () => {
  let engine: CostGuardrailsEngine;

  beforeEach(() => {
    engine = new CostGuardrailsEngine({
      enabled: true,
      defaultSessionLimit: 1.0,
      defaultUserLimit: 10.0,
      defaultUserLimitWindow: 60 * 60 * 1000,
      defaultAction: "warn",
      warningThreshold: 0.8,
    });
  });

  describe("cost checking", () => {
    it("should allow requests under limit", () => {
      const result = engine.checkCost({
        sessionId: "sess_1",
        estimatedCost: 0.5,
      });

      expect(result.allowed).toBe(true);
      expect(result.triggeredLimits).toHaveLength(0);
    });

    it("should warn when approaching limit", () => {
      engine.setSessionLimit({
        sessionId: "sess_1",
        maxCost: 1.0,
        action: "warn",
      });

      // Record a small cost first (below warning threshold of 80%)
      engine.recordCost({
        sessionId: "sess_1",
        cost: 0.7,
        timestamp: Date.now(),
      });

      // This check should trigger a warning since 0.7 + 0.15 = 0.85 which is >= 0.8 threshold
      const result = engine.checkCost({
        sessionId: "sess_1",
        estimatedCost: 0.15,
      });

      expect(result.allowed).toBe(true);
      // Warning is generated, or the limit is in warning state
      const limit = engine.getSessionLimit("sess_1");
      expect(limit?.isWarning).toBe(true);
    });

    it("should block when limit exceeded with hard_block", () => {
      engine.setSessionLimit({
        sessionId: "sess_1",
        maxCost: 1.0,
        action: "hard_block",
      });

      engine.recordCost({
        sessionId: "sess_1",
        cost: 1.1,
        timestamp: Date.now(),
      });

      const result = engine.checkCost({
        sessionId: "sess_1",
        estimatedCost: 0.1,
      });

      expect(result.allowed).toBe(false);
      expect(result.action).toBe("hard_block");
      expect(result.canOverride).toBe(false);
    });

    it("should soft block with override option", () => {
      engine.setSessionLimit({
        sessionId: "sess_1",
        maxCost: 1.0,
        action: "soft_block",
      });

      engine.recordCost({
        sessionId: "sess_1",
        cost: 1.1,
        timestamp: Date.now(),
      });

      // Without override
      let result = engine.checkCost({
        sessionId: "sess_1",
        estimatedCost: 0.1,
      });
      expect(result.allowed).toBe(false);
      expect(result.canOverride).toBe(true);

      // With override
      result = engine.checkCost({
        sessionId: "sess_1",
        estimatedCost: 0.1,
        allowOverride: true,
      });
      expect(result.allowed).toBe(true);
    });

    it("should throttle requests when configured", () => {
      engine.setSessionLimit({
        sessionId: "sess_1",
        maxCost: 1.0,
        action: "throttle",
      });

      engine.recordCost({
        sessionId: "sess_1",
        cost: 1.1,
        timestamp: Date.now(),
      });

      const result = engine.checkCost({
        sessionId: "sess_1",
        estimatedCost: 0.1,
      });

      expect(result.allowed).toBe(true);
      expect(result.action).toBe("throttle");
      expect(result.throttleDelayMs).toBeGreaterThan(0);
    });
  });

  describe("limit management", () => {
    it("should set and get session limits", () => {
      const limit = engine.setSessionLimit({
        sessionId: "sess_1",
        maxCost: 5.0,
        action: "hard_block",
      });

      expect(limit.maxCost).toBe(5.0);
      expect(limit.action).toBe("hard_block");

      const retrieved = engine.getSessionLimit("sess_1");
      expect(retrieved?.maxCost).toBe(5.0);
    });

    it("should set and get user limits", () => {
      const limit = engine.setUserLimit({
        userId: "user_1",
        maxCost: 50.0,
        windowMs: 24 * 60 * 60 * 1000,
      });

      expect(limit.maxCost).toBe(50.0);

      const retrieved = engine.getUserLimit("user_1");
      expect(retrieved?.maxCost).toBe(50.0);
    });

    it("should set global limits", () => {
      engine.setGlobalLimit({
        maxCost: 1000.0,
        action: "soft_block",
      });

      const limit = engine.getGlobalLimit();
      expect(limit?.maxCost).toBe(1000.0);
    });

    it("should update existing limits", () => {
      engine.setSessionLimit({
        sessionId: "sess_1",
        maxCost: 1.0,
      });

      engine.updateLimit("session", "sess_1", { maxCost: 2.0 });

      const limit = engine.getSessionLimit("sess_1");
      expect(limit?.maxCost).toBe(2.0);
    });

    it("should remove limits", () => {
      engine.setSessionLimit({
        sessionId: "sess_1",
        maxCost: 1.0,
      });

      const removed = engine.removeLimit("session", "sess_1");
      expect(removed).toBe(true);
      expect(engine.getSessionLimit("sess_1")).toBeNull();
    });

    it("should reset limit spending", () => {
      engine.setSessionLimit({
        sessionId: "sess_1",
        maxCost: 1.0,
      });

      engine.recordCost({
        sessionId: "sess_1",
        cost: 0.5,
        timestamp: Date.now(),
      });

      engine.resetLimit("session", "sess_1");

      const limit = engine.getSessionLimit("sess_1");
      expect(limit?.currentSpend).toBe(0);
    });
  });

  describe("cost recording", () => {
    it("should record costs and update limits", () => {
      engine.setSessionLimit({
        sessionId: "sess_1",
        maxCost: 10.0,
      });

      engine.recordCost({
        sessionId: "sess_1",
        cost: 0.5,
        timestamp: Date.now(),
      });

      const limit = engine.getSessionLimit("sess_1");
      expect(limit?.currentSpend).toBe(0.5);
    });

    it("should track costs across multiple records", () => {
      engine.setSessionLimit({
        sessionId: "sess_1",
        maxCost: 10.0,
      });

      engine.recordCost({
        sessionId: "sess_1",
        cost: 0.3,
        timestamp: Date.now(),
      });
      engine.recordCost({
        sessionId: "sess_1",
        cost: 0.2,
        timestamp: Date.now(),
      });
      engine.recordCost({
        sessionId: "sess_1",
        cost: 0.5,
        timestamp: Date.now(),
      });

      const limit = engine.getSessionLimit("sess_1");
      expect(limit?.currentSpend).toBe(1.0);
    });
  });

  describe("spending analysis", () => {
    it("should get spending summary", () => {
      const now = Date.now();

      engine.recordCost({
        sessionId: "s1",
        userId: "u1",
        featureId: "f1",
        model: "gpt-4",
        cost: 0.1,
        timestamp: now,
      });
      engine.recordCost({
        sessionId: "s2",
        userId: "u1",
        featureId: "f2",
        model: "gpt-4",
        cost: 0.2,
        timestamp: now,
      });
      engine.recordCost({
        sessionId: "s3",
        userId: "u2",
        featureId: "f1",
        model: "gpt-3.5",
        cost: 0.05,
        timestamp: now,
      });

      const summary = engine.getSpendingSummary(now - 1000, now + 1000);

      expect(summary.total).toBeCloseTo(0.35, 5);
      expect(summary.byUser["u1"]).toBeCloseTo(0.3, 5);
      expect(summary.byModel["gpt-4"]).toBeCloseTo(0.3, 5);
    });

    it("should get current spending for a scope", () => {
      engine.setUserLimit({ userId: "user_1", maxCost: 100.0 });

      engine.recordCost({
        sessionId: "s1",
        userId: "user_1",
        cost: 5.0,
        timestamp: Date.now(),
      });
      engine.recordCost({
        sessionId: "s2",
        userId: "user_1",
        cost: 3.0,
        timestamp: Date.now(),
      });

      const spending = engine.getCurrentSpending("user", "user_1");
      expect(spending).toBe(8.0);
    });

    it("should get remaining budget", () => {
      engine.setUserLimit({ userId: "user_1", maxCost: 10.0 });

      engine.recordCost({
        sessionId: "s1",
        userId: "user_1",
        cost: 3.0,
        timestamp: Date.now(),
      });

      const remaining = engine.getRemainingBudget("user", "user_1");
      expect(remaining).toBe(7.0);
    });
  });

  describe("callbacks", () => {
    it("should call onWarning when threshold reached", () => {
      const onWarning = vi.fn();
      const engineWithCallback = new CostGuardrailsEngine({
        enabled: true,
        defaultSessionLimit: 1.0,
        warningThreshold: 0.5,
        onWarning,
      });

      engineWithCallback.setSessionLimit({
        sessionId: "sess_1",
        maxCost: 1.0,
      });

      // First cost puts us below warning threshold
      engineWithCallback.recordCost({
        sessionId: "sess_1",
        cost: 0.4,
        timestamp: Date.now(),
      });

      // Check puts us at 0.4 + 0.2 = 0.6, which is above 0.5 threshold
      engineWithCallback.checkCost({
        sessionId: "sess_1",
        estimatedCost: 0.2,
      });

      expect(onWarning).toHaveBeenCalled();
    });

    it("should call onLimitEnforced when limit exceeded", () => {
      const onLimitEnforced = vi.fn();
      const engineWithCallback = new CostGuardrailsEngine({
        enabled: true,
        onLimitEnforced,
      });

      engineWithCallback.setSessionLimit({
        sessionId: "sess_1",
        maxCost: 1.0,
        action: "hard_block",
      });

      engineWithCallback.recordCost({
        sessionId: "sess_1",
        cost: 1.1,
        timestamp: Date.now(),
      });

      engineWithCallback.checkCost({
        sessionId: "sess_1",
        estimatedCost: 0.1,
      });

      expect(onLimitEnforced).toHaveBeenCalled();
    });
  });

  describe("adaptive limits", () => {
    it("should calculate adaptive limits from history", () => {
      // Add historical data
      for (let i = 0; i < 50; i++) {
        engine.recordCost({
          sessionId: `sess_${i}`,
          userId: "user_1",
          cost: 0.1 + Math.random() * 0.1,
          timestamp: Date.now() - i * 1000,
        });
      }

      const result = engine.calculateAdaptiveLimit("user", "user_1");

      expect(result.sampleSize).toBeGreaterThan(0);
      expect(result.calculatedLimit).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should return minimum limit when no history", () => {
      const result = engine.calculateAdaptiveLimit("user", "new_user", {
        minLimit: 0.5,
      });

      expect(result.calculatedLimit).toBe(0.5);
      expect(result.confidence).toBe(0);
    });
  });

  describe("statistics", () => {
    it("should track check statistics", () => {
      engine.setSessionLimit({
        sessionId: "s1",
        maxCost: 1.0,
        action: "hard_block",
      });

      // Allowed request
      engine.checkCost({ sessionId: "s1", estimatedCost: 0.1 });

      // Blocked request
      engine.recordCost({ sessionId: "s1", cost: 1.5, timestamp: Date.now() });
      engine.checkCost({ sessionId: "s1", estimatedCost: 0.1 });

      const stats = engine.getStats();

      expect(stats.totalChecks).toBe(2);
      expect(stats.allowedRequests).toBe(1);
      expect(stats.blockedRequests).toBe(1);
    });

    it("should track total cost", () => {
      engine.recordCost({ sessionId: "s1", cost: 1.0, timestamp: Date.now() });
      engine.recordCost({ sessionId: "s2", cost: 2.0, timestamp: Date.now() });

      const stats = engine.getStats();
      expect(stats.totalCostTracked).toBe(3.0);
    });
  });

  describe("exceeded limits", () => {
    it("should list all exceeded limits", () => {
      engine.setSessionLimit({ sessionId: "s1", maxCost: 1.0 });
      engine.setSessionLimit({ sessionId: "s2", maxCost: 1.0 });

      engine.recordCost({ sessionId: "s1", cost: 1.5, timestamp: Date.now() });

      const exceeded = engine.getExceededLimits();
      expect(exceeded.length).toBe(1);
      expect(exceeded[0].scopeId).toBe("s1");
    });
  });
});

describe("createGuardrailMiddleware", () => {
  it("should create working middleware", async () => {
    const engine = new CostGuardrailsEngine({
      enabled: true,
      defaultSessionLimit: 10.0,
    });

    const middleware = createGuardrailMiddleware(engine, {
      getSessionId: (ctx: any) => ctx.sessionId,
      estimateCost: (ctx: any) => ctx.estimatedCost,
    });

    const context = { sessionId: "sess_1", estimatedCost: 0.5 };
    let nextCalled = false;

    await middleware(context, async () => {
      nextCalled = true;
      return "result";
    });

    expect(nextCalled).toBe(true);
  });

  it("should block when limit exceeded", async () => {
    const engine = new CostGuardrailsEngine({ enabled: true });
    engine.setSessionLimit({
      sessionId: "sess_1",
      maxCost: 1.0,
      action: "hard_block",
    });
    engine.recordCost({
      sessionId: "sess_1",
      cost: 1.5,
      timestamp: Date.now(),
    });

    const middleware = createGuardrailMiddleware(engine, {
      getSessionId: (ctx: any) => ctx.sessionId,
      estimateCost: () => 0.1,
      onBlocked: vi.fn(),
    });

    await expect(
      middleware({ sessionId: "sess_1" }, async () => "result"),
    ).rejects.toThrow("Cost limit exceeded");
  });
});
