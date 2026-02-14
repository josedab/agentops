/**
 * Tests for Agent Autopilot (Self-Healing) Engine
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AutopilotEngine } from "../src/autopilot/index.js";
import type {
  RemediationPolicy,
  RemediationEvent,
  SessionHealth,
  RemediationAction,
} from "../src/autopilot/index.js";

function makePolicy(
  overrides: Partial<RemediationPolicy> = {},
): RemediationPolicy {
  return {
    id: "policy-1",
    name: "High Latency Policy",
    description: "Trigger on high latency",
    trigger: { metric: "latency", operator: "gt", threshold: 1000 },
    actions: [{ type: "switch_model", params: { model: "gpt-3.5-turbo" } }],
    enabled: true,
    cooldownMs: 0,
    ...overrides,
  };
}

function makeHealth(
  sessionId: string,
  metrics: Record<string, number>,
): SessionHealth {
  const m = new Map<any, number>();
  for (const [k, v] of Object.entries(metrics)) {
    m.set(k, v);
  }
  return {
    sessionId,
    metrics: m,
    status: "healthy",
    lastEvaluated: Date.now(),
  };
}

describe("AutopilotEngine", () => {
  let engine: AutopilotEngine;

  beforeEach(() => {
    engine = new AutopilotEngine({ enabled: true });
  });

  // ==========================================================================
  // Policy CRUD
  // ==========================================================================

  describe("Policy CRUD", () => {
    it("should add and list policies", () => {
      const policy = makePolicy();
      engine.addPolicy(policy);
      expect(engine.getPolicies()).toHaveLength(1);
      expect(engine.getPolicies()[0].id).toBe("policy-1");
    });

    it("should remove a policy by id", () => {
      engine.addPolicy(makePolicy());
      expect(engine.removePolicy("policy-1")).toBe(true);
      expect(engine.getPolicies()).toHaveLength(0);
    });

    it("should return false when removing nonexistent policy", () => {
      expect(engine.removePolicy("nonexistent")).toBe(false);
    });

    it("should initialize with policies from config", () => {
      const policy = makePolicy();
      const e = new AutopilotEngine({ enabled: true, policies: [policy] });
      expect(e.getPolicies()).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Metric Recording & Session Health
  // ==========================================================================

  describe("Metric Recording & Session Health", () => {
    it("should record metrics and create session health", () => {
      engine.recordMetric("sess-1", "latency", 500);
      const health = engine.getSessionHealth("sess-1");
      expect(health).toBeDefined();
      expect(health!.metrics.get("latency")).toBe(500);
      expect(health!.status).toBe("healthy");
    });

    it("should update existing session metrics", () => {
      engine.recordMetric("sess-1", "latency", 500);
      engine.recordMetric("sess-1", "cost", 0.05);
      const health = engine.getSessionHealth("sess-1");
      expect(health!.metrics.get("latency")).toBe(500);
      expect(health!.metrics.get("cost")).toBe(0.05);
    });

    it("should mark session as degraded on moderate error rate", () => {
      engine.recordMetric("sess-1", "error_rate", 0.3);
      const health = engine.getSessionHealth("sess-1");
      expect(health!.status).toBe("degraded");
    });

    it("should mark session as critical on high error rate", () => {
      engine.recordMetric("sess-1", "error_rate", 0.6);
      const health = engine.getSessionHealth("sess-1");
      expect(health!.status).toBe("critical");
    });

    it("should return undefined for unknown session", () => {
      expect(engine.getSessionHealth("unknown")).toBeUndefined();
    });
  });

  // ==========================================================================
  // Policy Evaluation
  // ==========================================================================

  describe("Policy Evaluation", () => {
    it("should trigger remediation when policy threshold is breached", () => {
      engine.addPolicy(makePolicy());
      const health = makeHealth("sess-1", { latency: 2000 });
      const events = engine.evaluateSession(health);
      expect(events).toHaveLength(1);
      expect(events[0].policyId).toBe("policy-1");
      expect(events[0].outcome).toBe("success");
    });

    it("should not trigger when metric is below threshold", () => {
      engine.addPolicy(makePolicy());
      const health = makeHealth("sess-1", { latency: 500 });
      const events = engine.evaluateSession(health);
      expect(events).toHaveLength(0);
    });

    it("should not trigger disabled policies", () => {
      engine.addPolicy(makePolicy({ enabled: false }));
      const health = makeHealth("sess-1", { latency: 2000 });
      const events = engine.evaluateSession(health);
      expect(events).toHaveLength(0);
    });

    it("should support lt operator", () => {
      engine.addPolicy(
        makePolicy({
          id: "low-quality",
          trigger: { metric: "quality_score", operator: "lt", threshold: 0.5 },
        }),
      );
      const health = makeHealth("sess-1", { quality_score: 0.3 });
      const events = engine.evaluateSession(health);
      expect(events).toHaveLength(1);
    });

    it("should support gte operator", () => {
      engine.addPolicy(
        makePolicy({
          id: "high-cost",
          trigger: { metric: "cost", operator: "gte", threshold: 1.0 },
        }),
      );
      const health = makeHealth("sess-1", { cost: 1.0 });
      const events = engine.evaluateSession(health);
      expect(events).toHaveLength(1);
    });

    it("should support lte operator", () => {
      engine.addPolicy(
        makePolicy({
          id: "low-tokens",
          trigger: { metric: "token_usage", operator: "lte", threshold: 10 },
        }),
      );
      const health = makeHealth("sess-1", { token_usage: 10 });
      const events = engine.evaluateSession(health);
      expect(events).toHaveLength(1);
    });

    it("should support eq operator", () => {
      engine.addPolicy(
        makePolicy({
          id: "exact-match",
          trigger: { metric: "error_rate", operator: "eq", threshold: 0 },
        }),
      );
      const health = makeHealth("sess-1", { error_rate: 0 });
      const events = engine.evaluateSession(health);
      expect(events).toHaveLength(1);
    });

    it("should fire onPolicyMatch callback", () => {
      const onPolicyMatch = vi.fn();
      const e = new AutopilotEngine({ enabled: true, onPolicyMatch });
      e.addPolicy(makePolicy());
      const health = makeHealth("sess-1", { latency: 2000 });
      e.evaluateSession(health);
      expect(onPolicyMatch).toHaveBeenCalledTimes(1);
    });

    it("should fire onRemediation callback", () => {
      const onRemediation = vi.fn();
      const e = new AutopilotEngine({ enabled: true, onRemediation });
      e.addPolicy(makePolicy());
      const health = makeHealth("sess-1", { latency: 2000 });
      e.evaluateSession(health);
      expect(onRemediation).toHaveBeenCalledTimes(1);
      expect(onRemediation.mock.calls[0][0].outcome).toBe("success");
    });
  });

  // ==========================================================================
  // Multiple Policies
  // ==========================================================================

  describe("Multiple Policies", () => {
    it("should evaluate multiple policies on the same session", () => {
      engine.addPolicy(makePolicy({ id: "p1" }));
      engine.addPolicy(
        makePolicy({
          id: "p2",
          trigger: { metric: "cost", operator: "gt", threshold: 0.5 },
          actions: [{ type: "throttle", params: {} }],
        }),
      );

      const health = makeHealth("sess-1", { latency: 2000, cost: 1.0 });
      const events = engine.evaluateSession(health);
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.policyId).sort()).toEqual(["p1", "p2"]);
    });
  });

  // ==========================================================================
  // Cooldown Enforcement
  // ==========================================================================

  describe("Cooldown Enforcement", () => {
    it("should not fire policy again within cooldown period", () => {
      engine.addPolicy(makePolicy({ cooldownMs: 60_000 }));
      const health = makeHealth("sess-1", { latency: 2000 });

      const events1 = engine.evaluateSession(health);
      expect(events1).toHaveLength(1);

      // Second evaluation within cooldown should not fire
      const events2 = engine.evaluateSession(health);
      expect(events2).toHaveLength(0);
    });

    it("should fire again after cooldown expires", () => {
      vi.useFakeTimers();
      try {
        engine.addPolicy(makePolicy({ cooldownMs: 1000 }));
        const health = makeHealth("sess-1", { latency: 2000 });

        engine.evaluateSession(health);
        vi.advanceTimersByTime(1500);

        const events = engine.evaluateSession(health);
        expect(events).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should fire immediately when no cooldown is set", () => {
      engine.addPolicy(makePolicy({ cooldownMs: 0 }));
      const health = makeHealth("sess-1", { latency: 2000 });

      expect(engine.evaluateSession(health)).toHaveLength(1);
      expect(engine.evaluateSession(health)).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Circuit Breaker
  // ==========================================================================

  describe("Circuit Breaker", () => {
    it("should start in closed state", () => {
      const cb = engine.getCircuitBreakerState("sess-1");
      expect(cb.state).toBe("closed");
      expect(cb.failureCount).toBe(0);
    });

    it("should transition to open on circuit_break action", () => {
      engine.addPolicy(
        makePolicy({
          actions: [{ type: "circuit_break", params: {} }],
        }),
      );
      const health = makeHealth("sess-1", { latency: 2000 });
      engine.evaluateSession(health);

      const cb = engine.getCircuitBreakerState("sess-1");
      expect(cb.state).toBe("open");
      expect(cb.failureCount).toBe(1);
    });

    it("should transition from open to half_open after timeout", () => {
      vi.useFakeTimers();
      try {
        engine.executeRemediation(
          { type: "circuit_break", params: {} },
          "sess-1",
        );

        const cbOpen = engine.getCircuitBreakerState("sess-1");
        expect(cbOpen.state).toBe("open");

        // Advance past the open timeout (30s)
        vi.advanceTimersByTime(31_000);

        const cbHalfOpen = engine.getCircuitBreakerState("sess-1");
        expect(cbHalfOpen.state).toBe("half_open");
      } finally {
        vi.useRealTimers();
      }
    });

    it("should transition from half_open to closed after successful remediations", () => {
      vi.useFakeTimers();
      try {
        // Open the circuit
        engine.executeRemediation(
          { type: "circuit_break", params: {} },
          "sess-1",
        );

        // Advance to half_open
        vi.advanceTimersByTime(31_000);
        engine.getCircuitBreakerState("sess-1"); // triggers transition

        // Execute 3 successful remediations to close
        for (let i = 0; i < 3; i++) {
          engine.executeRemediation(
            { type: "switch_model", params: { model: "gpt-4" } },
            "sess-1",
          );
        }

        const cb = engine.getCircuitBreakerState("sess-1");
        expect(cb.state).toBe("closed");
        expect(cb.failureCount).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should skip circuit_break when already open", () => {
      engine.executeRemediation(
        { type: "circuit_break", params: {} },
        "sess-1",
      );
      const event = engine.executeRemediation(
        { type: "circuit_break", params: {} },
        "sess-1",
      );
      expect(event.outcome).toBe("skipped");
    });
  });

  // ==========================================================================
  // Remediation Execution
  // ==========================================================================

  describe("Remediation Execution", () => {
    const actionTypes: Array<{
      type: RemediationAction["type"];
      params: Record<string, unknown>;
    }> = [
      { type: "switch_model", params: { model: "gpt-3.5-turbo" } },
      { type: "adjust_temperature", params: { temperature: 0.5 } },
      { type: "circuit_break", params: {} },
      { type: "add_fallback", params: { fallbackModel: "gpt-3.5-turbo" } },
      { type: "modify_prompt", params: { prefix: "Be concise:" } },
      { type: "throttle", params: { maxRpm: 10 } },
      { type: "alert_only", params: { channel: "slack" } },
    ];

    for (const { type, params } of actionTypes) {
      it(`should execute ${type} action`, () => {
        const event = engine.executeRemediation({ type, params }, "sess-1");
        expect(event.action.type).toBe(type);
        expect(event.sessionId).toBe("sess-1");
        expect(event.id).toBeTruthy();
        expect(event.timestamp).toBeGreaterThan(0);
      });
    }

    it("should stop at first successful action in policy", () => {
      engine.addPolicy(
        makePolicy({
          actions: [
            { type: "switch_model", params: { model: "gpt-3.5-turbo" } },
            { type: "throttle", params: {} },
          ],
        }),
      );
      const health = makeHealth("sess-1", { latency: 2000 });
      const events = engine.evaluateSession(health);
      // Only the first action should fire since it succeeds
      expect(events).toHaveLength(1);
      expect(events[0].action.type).toBe("switch_model");
    });
  });

  // ==========================================================================
  // Metrics Tracking
  // ==========================================================================

  describe("Metrics Tracking", () => {
    it("should track remediation counts", () => {
      engine.addPolicy(makePolicy());
      const health = makeHealth("sess-1", { latency: 2000 });
      engine.evaluateSession(health);

      const metrics = engine.getMetrics();
      expect(metrics.totalRemediations).toBe(1);
      expect(metrics.successCount).toBe(1);
      expect(metrics.failureCount).toBe(0);
    });

    it("should track cost savings from switch_model", () => {
      engine.recordMetric("sess-1", "latency", 2000);
      engine.addPolicy(makePolicy());

      const health = engine.getSessionHealth("sess-1")!;
      engine.evaluateSession(health);

      const metrics = engine.getMetrics();
      expect(metrics.costSavingsEstimate).toBeGreaterThanOrEqual(0);
    });

    it("should count active circuit breakers", () => {
      engine.executeRemediation(
        { type: "circuit_break", params: {} },
        "sess-1",
      );
      engine.executeRemediation(
        { type: "circuit_break", params: {} },
        "sess-2",
      );

      const metrics = engine.getMetrics();
      expect(metrics.activeCircuitBreakers).toBe(2);
    });

    it("should report policies evaluated", () => {
      engine.addPolicy(makePolicy({ id: "p1" }));
      engine.addPolicy(makePolicy({ id: "p2" }));

      const metrics = engine.getMetrics();
      expect(metrics.policiesEvaluated).toBe(2);
    });

    it("should calculate average remediation time", () => {
      engine.executeRemediation({ type: "alert_only", params: {} }, "sess-1");
      engine.executeRemediation({ type: "alert_only", params: {} }, "sess-2");

      const metrics = engine.getMetrics();
      expect(metrics.averageRemediationMs).toBeGreaterThanOrEqual(0);
      expect(metrics.totalRemediations).toBe(2);
    });
  });

  // ==========================================================================
  // Reset
  // ==========================================================================

  describe("Reset", () => {
    it("should clear all state", () => {
      engine.addPolicy(makePolicy());
      engine.recordMetric("sess-1", "latency", 2000);
      engine.executeRemediation(
        { type: "circuit_break", params: {} },
        "sess-1",
      );

      engine.reset();

      expect(engine.getPolicies()).toHaveLength(0);
      expect(engine.getSessionHealth("sess-1")).toBeUndefined();
      expect(engine.getMetrics().totalRemediations).toBe(0);
      // Circuit breaker returns new default after reset
      expect(engine.getCircuitBreakerState("sess-1").state).toBe("closed");
    });
  });
});
