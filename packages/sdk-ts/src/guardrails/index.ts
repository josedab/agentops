/**
 * AgentOps SDK - Cost Guardrails
 *
 * Real-time cost limits and budget enforcement for AI agent sessions.
 *
 * The module is composed of focused, single-responsibility classes:
 * - CostGuardrailsEngine: Main facade orchestrating all components
 * - LimitManager: CRUD operations for limits
 * - CostTracker: Cost recording and spending analysis
 * - EnforcementEngine: Cost checking and enforcement logic
 * - AdaptiveLimits: Adaptive limit calculations based on history
 *
 * @packageDocumentation
 */

// Main facade
export {
  CostGuardrailsEngine,
  createGuardrailMiddleware,
} from "./guardrails.js";
export type { GuardrailMiddlewareOptions } from "./guardrails.js";

// Decomposed components (for advanced use cases)
export { LimitManager } from "./limit-manager.js";
export type { LimitManagerConfig } from "./limit-manager.js";
export { CostTracker } from "./cost-tracker.js";
export { EnforcementEngine } from "./enforcement-engine.js";
export type { EnforcementConfig } from "./enforcement-engine.js";
export { AdaptiveLimits } from "./adaptive-limits.js";

// Store implementations (Dependency Injection)
export { InMemoryCostRecordStore } from "./store.js";

export type {
  // Configuration
  GuardrailsConfig,
  ResolvedGuardrailsConfig,
  GuardrailAction,

  // Limits
  CostLimit,
  LimitType,
  SessionLimit,
  UserLimit,
  FeatureLimit,
  ModelLimit,
  GlobalLimit,
  LimitConfig,
  SessionLimitConfig,
  UserLimitConfig,
  FeatureLimitConfig,
  ModelLimitConfig,

  // Events
  GuardrailWarning,
  GuardrailEnforcement,
  LimitUpdate,

  // Cost Checking
  CostCheckRequest,
  CostCheckResult,

  // Tracking
  CostRecord,
  SpendingSummary,

  // Adaptive Limits
  AdaptiveLimitConfig,
  AdaptiveLimitResult,

  // Stats
  GuardrailStats,

  // Dependency Injection
  CostRecordStore,
  CostRecordFilter,
} from "./types.js";
