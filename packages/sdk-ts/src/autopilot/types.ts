/**
 * AgentOps SDK - Agent Autopilot (Self-Healing) Types
 *
 * Type definitions for automated remediation and self-healing policies.
 *
 * @packageDocumentation
 */

// ============================================================================
// Configuration
// ============================================================================

export interface AutopilotConfig {
  /** Enable autopilot */
  enabled: boolean;

  /** Remediation policies */
  policies?: RemediationPolicy[];

  /** Default action when no policy matches */
  defaultAction?: RemediationActionType;

  /** Warning threshold (0-1) for session health before triggering */
  warningThreshold?: number;

  /** Callback when a remediation is executed */
  onRemediation?: (event: RemediationEvent) => void;

  /** Callback when a policy matches */
  onPolicyMatch?: (policy: RemediationPolicy, health: SessionHealth) => void;

  /** Enable debug logging */
  debug?: boolean;
}

export interface ResolvedAutopilotConfig {
  enabled: boolean;
  policies: RemediationPolicy[];
  defaultAction: RemediationActionType;
  warningThreshold: number;
  onRemediation?: (event: RemediationEvent) => void;
  onPolicyMatch?: (policy: RemediationPolicy, health: SessionHealth) => void;
  debug: boolean;
}

// ============================================================================
// Policies
// ============================================================================

export interface RemediationPolicy {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this policy does */
  description?: string;

  /** Conditions that trigger this policy */
  trigger: PolicyTrigger;

  /** Ordered list of actions to execute */
  actions: RemediationAction[];

  /** Whether this policy is active */
  enabled: boolean;

  /** Cooldown period before policy can fire again (ms) */
  cooldownMs?: number;
}

// ============================================================================
// Triggers
// ============================================================================

export type PolicyMetric =
  | "latency"
  | "cost"
  | "error_rate"
  | "quality_score"
  | "token_usage";

export type PolicyOperator = "gt" | "lt" | "gte" | "lte" | "eq";

export interface PolicyTrigger {
  /** Metric to evaluate */
  metric: PolicyMetric;

  /** Comparison operator */
  operator: PolicyOperator;

  /** Threshold value */
  threshold: number;

  /** Optional rolling window in ms */
  windowMs?: number;
}

// ============================================================================
// Actions
// ============================================================================

export type RemediationActionType =
  | "switch_model"
  | "adjust_temperature"
  | "circuit_break"
  | "add_fallback"
  | "modify_prompt"
  | "throttle"
  | "alert_only";

export interface RemediationAction {
  /** Type of remediation action */
  type: RemediationActionType;

  /** Action-specific parameters */
  params: Record<string, unknown>;

  /** Maximum retries for this action */
  maxRetries?: number;
}

// ============================================================================
// Events
// ============================================================================

export interface RemediationEvent {
  /** Unique event identifier */
  id: string;

  /** Policy that triggered this remediation */
  policyId: string;

  /** The trigger that matched */
  trigger: PolicyTrigger;

  /** The action that was taken */
  action: RemediationAction;

  /** Session that was remediated */
  sessionId: string;

  /** When the remediation occurred */
  timestamp: number;

  /** Outcome of the remediation */
  outcome: "success" | "failure" | "skipped";

  /** Metrics before and after remediation */
  metrics: {
    before: number;
    after?: number;
  };

  /** Duration of remediation in ms */
  durationMs: number;
}

// ============================================================================
// Metrics & Health
// ============================================================================

export interface AutopilotMetrics {
  /** Total remediations executed */
  totalRemediations: number;

  /** Successful remediations */
  successCount: number;

  /** Failed remediations */
  failureCount: number;

  /** Estimated cost savings from remediations */
  costSavingsEstimate: number;

  /** Average remediation duration in ms */
  averageRemediationMs: number;

  /** Total policies evaluated */
  policiesEvaluated: number;

  /** Number of active circuit breakers */
  activeCircuitBreakers: number;
}

export type HealthMetricKey =
  | "latency"
  | "cost"
  | "error_rate"
  | "quality_score"
  | "token_usage";

export type HealthStatus = "healthy" | "degraded" | "critical";

export interface SessionHealth {
  /** Session identifier */
  sessionId: string;

  /** Current metric values */
  metrics: Map<HealthMetricKey, number>;

  /** Overall health status */
  status: HealthStatus;

  /** Last evaluation timestamp */
  lastEvaluated: number;
}

// ============================================================================
// Circuit Breaker
// ============================================================================

export type CircuitBreakerStateValue = "closed" | "open" | "half_open";

export interface CircuitBreakerState {
  /** Session identifier */
  sessionId: string;

  /** Current state */
  state: CircuitBreakerStateValue;

  /** When the circuit was opened */
  openedAt?: number;

  /** Consecutive failure count */
  failureCount: number;

  /** Consecutive success count (in half_open) */
  successCount: number;

  /** Number of attempts in half_open state */
  halfOpenAttempts: number;
}
