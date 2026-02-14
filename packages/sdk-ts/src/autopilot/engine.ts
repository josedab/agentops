/**
 * AgentOps SDK - Autopilot Engine
 *
 * Self-healing engine that evaluates policies against session health
 * and executes automated remediations.
 *
 * @packageDocumentation
 */

import type {
  AutopilotConfig,
  ResolvedAutopilotConfig,
  RemediationPolicy,
  RemediationAction,
  RemediationEvent,
  AutopilotMetrics,
  SessionHealth,
  HealthMetricKey,
  CircuitBreakerState,
  PolicyTrigger,
} from "./types.js";
import { generateEventId, now } from "../utils.js";

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: ResolvedAutopilotConfig = {
  enabled: true,
  policies: [],
  defaultAction: "alert_only",
  warningThreshold: 0.8,
  debug: false,
};

const CIRCUIT_BREAKER_HALF_OPEN_THRESHOLD = 3;
const CIRCUIT_BREAKER_OPEN_TIMEOUT_MS = 30_000;

// ============================================================================
// AutopilotEngine
// ============================================================================

export class AutopilotEngine {
  private readonly config: ResolvedAutopilotConfig;
  private policies: Map<string, RemediationPolicy> = new Map();
  private sessionHealthMap: Map<string, SessionHealth> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private remediationHistory: RemediationEvent[] = [];
  private cooldownTracker: Map<string, number> = new Map();

  constructor(config: AutopilotConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      policies: config.policies ?? DEFAULT_CONFIG.policies,
      defaultAction: config.defaultAction ?? DEFAULT_CONFIG.defaultAction,
      warningThreshold:
        config.warningThreshold ?? DEFAULT_CONFIG.warningThreshold,
      debug: config.debug ?? DEFAULT_CONFIG.debug,
    };

    for (const policy of this.config.policies) {
      this.policies.set(policy.id, policy);
    }
  }

  // ==========================================================================
  // Policy CRUD
  // ==========================================================================

  /** Add a remediation policy */
  addPolicy(policy: RemediationPolicy): void {
    this.policies.set(policy.id, policy);
  }

  /** Remove a remediation policy by id */
  removePolicy(id: string): boolean {
    return this.policies.delete(id);
  }

  /** Get all registered policies */
  getPolicies(): RemediationPolicy[] {
    return Array.from(this.policies.values());
  }

  // ==========================================================================
  // Metric Recording & Health
  // ==========================================================================

  /** Record a metric value for a session */
  recordMetric(
    sessionId: string,
    metric: HealthMetricKey,
    value: number,
  ): void {
    let health = this.sessionHealthMap.get(sessionId);
    if (!health) {
      health = {
        sessionId,
        metrics: new Map(),
        status: "healthy",
        lastEvaluated: now(),
      };
      this.sessionHealthMap.set(sessionId, health);
    }
    health.metrics.set(metric, value);
    health.lastEvaluated = now();

    // Update health status
    health.status = this.computeHealthStatus(health);
  }

  /** Get current health assessment for a session */
  getSessionHealth(sessionId: string): SessionHealth | undefined {
    return this.sessionHealthMap.get(sessionId);
  }

  // ==========================================================================
  // Policy Evaluation
  // ==========================================================================

  /** Evaluate all policies against a session's health, returns triggered remediations */
  evaluateSession(health: SessionHealth): RemediationEvent[] {
    const events: RemediationEvent[] = [];

    for (const policy of this.policies.values()) {
      if (!policy.enabled) continue;

      if (this.isPolicyCoolingDown(policy)) continue;

      if (this.isTriggerMet(policy.trigger, health)) {
        this.config.onPolicyMatch?.(policy, health);

        for (const action of policy.actions) {
          const event = this.executeRemediationInternal(
            action,
            health.sessionId,
            policy,
            health,
          );
          events.push(event);

          // If a remediation succeeded, stop trying further actions for this policy
          if (event.outcome === "success") break;
        }

        // Record cooldown
        if (policy.cooldownMs != null && policy.cooldownMs > 0) {
          this.cooldownTracker.set(policy.id, now());
        }
      }
    }

    return events;
  }

  // ==========================================================================
  // Remediation Execution
  // ==========================================================================

  /** Execute a single remediation action for a session */
  executeRemediation(
    action: RemediationAction,
    sessionId: string,
  ): RemediationEvent {
    const health = this.sessionHealthMap.get(sessionId);
    return this.executeRemediationInternal(
      action,
      sessionId,
      undefined,
      health,
    );
  }

  // ==========================================================================
  // Circuit Breaker
  // ==========================================================================

  /** Get the circuit breaker state for a session */
  getCircuitBreakerState(sessionId: string): CircuitBreakerState {
    let cb = this.circuitBreakers.get(sessionId);
    if (!cb) {
      cb = {
        sessionId,
        state: "closed",
        failureCount: 0,
        successCount: 0,
        halfOpenAttempts: 0,
      };
      this.circuitBreakers.set(sessionId, cb);
    }

    // Auto-transition from open to half_open after timeout
    if (
      cb.state === "open" &&
      cb.openedAt != null &&
      now() - cb.openedAt >= CIRCUIT_BREAKER_OPEN_TIMEOUT_MS
    ) {
      cb.state = "half_open";
      cb.halfOpenAttempts = 0;
      cb.successCount = 0;
    }

    return cb;
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  /** Get aggregate autopilot metrics */
  getMetrics(): AutopilotMetrics {
    const total = this.remediationHistory.length;
    const successes = this.remediationHistory.filter(
      (e) => e.outcome === "success",
    ).length;
    const failures = this.remediationHistory.filter(
      (e) => e.outcome === "failure",
    ).length;

    const totalDuration = this.remediationHistory.reduce(
      (sum, e) => sum + e.durationMs,
      0,
    );

    let activeBreakers = 0;
    for (const cb of this.circuitBreakers.values()) {
      if (cb.state === "open" || cb.state === "half_open") {
        activeBreakers++;
      }
    }

    // Estimate cost savings: each successful cost-related remediation saves the delta
    let costSavings = 0;
    for (const e of this.remediationHistory) {
      if (e.outcome === "success" && e.metrics.after != null) {
        const saved = e.metrics.before - e.metrics.after;
        if (saved > 0) costSavings += saved;
      }
    }

    return {
      totalRemediations: total,
      successCount: successes,
      failureCount: failures,
      costSavingsEstimate: costSavings,
      averageRemediationMs: total > 0 ? totalDuration / total : 0,
      policiesEvaluated: this.policies.size,
      activeCircuitBreakers: activeBreakers,
    };
  }

  // ==========================================================================
  // Reset
  // ==========================================================================

  /** Clear all state */
  reset(): void {
    this.policies.clear();
    this.sessionHealthMap.clear();
    this.circuitBreakers.clear();
    this.remediationHistory = [];
    this.cooldownTracker.clear();
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  private isTriggerMet(trigger: PolicyTrigger, health: SessionHealth): boolean {
    const value = health.metrics.get(trigger.metric);
    if (value == null) return false;

    switch (trigger.operator) {
      case "gt":
        return value > trigger.threshold;
      case "lt":
        return value < trigger.threshold;
      case "gte":
        return value >= trigger.threshold;
      case "lte":
        return value <= trigger.threshold;
      case "eq":
        return value === trigger.threshold;
      default:
        return false;
    }
  }

  private isPolicyCoolingDown(policy: RemediationPolicy): boolean {
    if (policy.cooldownMs == null || policy.cooldownMs <= 0) return false;
    const lastFired = this.cooldownTracker.get(policy.id);
    if (lastFired == null) return false;
    return now() - lastFired < policy.cooldownMs;
  }

  private executeRemediationInternal(
    action: RemediationAction,
    sessionId: string,
    policy?: RemediationPolicy,
    health?: SessionHealth,
  ): RemediationEvent {
    const startTime = now();
    const metricBefore = health
      ? (health.metrics.get(policy?.trigger.metric ?? "latency") ?? 0)
      : 0;

    const trigger: PolicyTrigger = policy?.trigger ?? {
      metric: "latency",
      operator: "gt",
      threshold: 0,
    };

    let outcome: "success" | "failure" | "skipped" = "success";
    let metricAfter: number | undefined;

    // Handle circuit breaker actions
    if (action.type === "circuit_break") {
      const cb = this.getCircuitBreakerState(sessionId);
      if (cb.state === "open") {
        outcome = "skipped";
      } else {
        cb.state = "open";
        cb.openedAt = now();
        cb.failureCount++;
      }
    }

    // For other action types, simulate success
    // In a real implementation, these would integrate with the LLM client
    if (action.type === "switch_model") {
      metricAfter = metricBefore * 0.7; // Simulated improvement
    } else if (action.type === "adjust_temperature") {
      metricAfter = metricBefore * 0.9;
    } else if (action.type === "throttle") {
      metricAfter = metricBefore * 0.5;
    } else if (action.type === "add_fallback") {
      metricAfter = metricBefore * 0.8;
    } else if (action.type === "modify_prompt") {
      metricAfter = metricBefore * 0.85;
    }

    const durationMs = now() - startTime;

    const event: RemediationEvent = {
      id: generateEventId(),
      policyId: policy?.id ?? "manual",
      trigger,
      action,
      sessionId,
      timestamp: now(),
      outcome,
      metrics: {
        before: metricBefore,
        after: metricAfter,
      },
      durationMs,
    };

    this.remediationHistory.push(event);
    this.config.onRemediation?.(event);

    // Update circuit breaker on success in half_open state
    if (outcome === "success") {
      const cb = this.circuitBreakers.get(sessionId);
      if (cb && cb.state === "half_open") {
        cb.successCount++;
        cb.halfOpenAttempts++;
        if (cb.successCount >= CIRCUIT_BREAKER_HALF_OPEN_THRESHOLD) {
          cb.state = "closed";
          cb.failureCount = 0;
          cb.successCount = 0;
          cb.halfOpenAttempts = 0;
          cb.openedAt = undefined;
        }
      }
    }

    return event;
  }

  private computeHealthStatus(
    health: SessionHealth,
  ): "healthy" | "degraded" | "critical" {
    const errorRate = health.metrics.get("error_rate");
    const quality = health.metrics.get("quality_score");

    if (errorRate != null && errorRate > 0.5) return "critical";
    if (quality != null && quality < 0.3) return "critical";

    if (errorRate != null && errorRate > this.config.warningThreshold * 0.3)
      return "degraded";
    if (quality != null && quality < this.config.warningThreshold)
      return "degraded";

    return "healthy";
  }
}
