/**
 * AgentOps SDK - Agent Autopilot (Self-Healing) Module
 *
 * Automated remediation and self-healing for AI agent sessions.
 *
 * @packageDocumentation
 */

export { AutopilotEngine } from "./engine.js";

export type {
  AutopilotConfig,
  ResolvedAutopilotConfig,
  RemediationPolicy,
  PolicyTrigger,
  PolicyMetric,
  PolicyOperator,
  RemediationAction,
  RemediationActionType,
  RemediationEvent,
  AutopilotMetrics,
  SessionHealth,
  HealthMetricKey,
  HealthStatus,
  CircuitBreakerState,
  CircuitBreakerStateValue,
} from "./types.js";
