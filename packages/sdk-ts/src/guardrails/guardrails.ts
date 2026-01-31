/**
 * AgentOps SDK - Cost Guardrails Engine
 *
 * Real-time cost limits and budget enforcement for AI agent sessions.
 * Prevents runaway costs with configurable limits and actions.
 *
 * This module is a facade that orchestrates the decomposed components:
 * - LimitManager: CRUD operations for limits
 * - CostTracker: Cost recording and spending analysis
 * - EnforcementEngine: Cost checking and enforcement logic
 * - AdaptiveLimits: Adaptive limit calculations
 */

import { InMemoryCostRecordStore } from "./store.js";
import { LimitManager } from "./limit-manager.js";
import { CostTracker } from "./cost-tracker.js";
import { EnforcementEngine } from "./enforcement-engine.js";
import { AdaptiveLimits } from "./adaptive-limits.js";
import {
  GuardrailsConfig,
  CostRecordStore,
  ResolvedGuardrailsConfig,
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
  CostCheckRequest,
  CostCheckResult,
  CostRecord,
  SpendingSummary,
  AdaptiveLimitConfig,
  AdaptiveLimitResult,
  GuardrailStats,
} from "./types.js";

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ResolvedGuardrailsConfig = {
  enabled: true,
  defaultSessionLimit: 1.0, // $1 per session
  defaultUserLimit: 10.0, // $10 per user per hour
  defaultUserLimitWindow: 60 * 60 * 1000, // 1 hour
  globalLimitWindow: 60 * 60 * 1000, // 1 hour
  defaultAction: "warn",
  warningThreshold: 0.8, // Warn at 80%
  enableAdaptiveLimits: false,
};

// ============================================================================
// Cost Guardrails Engine (Facade)
// ============================================================================

/**
 * CostGuardrailsEngine is the main entry point for cost limit management.
 *
 * It delegates to specialized components:
 * - LimitManager handles limit CRUD
 * - CostTracker handles cost recording and analysis
 * - EnforcementEngine handles cost checking
 * - AdaptiveLimits handles adaptive limit calculations
 *
 * @example
 * ```typescript
 * const engine = new CostGuardrailsEngine({
 *   enabled: true,
 *   defaultSessionLimit: 1.0,
 *   defaultAction: 'soft_block'
 * });
 *
 * // Check before making an LLM call
 * const result = engine.checkCost({
 *   sessionId: 'sess_123',
 *   estimatedCost: 0.05
 * });
 *
 * if (!result.allowed) {
 *   throw new Error(result.message);
 * }
 *
 * // Record actual cost after the call
 * engine.recordCost({
 *   sessionId: 'sess_123',
 *   cost: 0.04,
 *   timestamp: Date.now()
 * });
 * ```
 */
export class CostGuardrailsEngine {
  private readonly config: ResolvedGuardrailsConfig;
  private readonly limitManager: LimitManager;
  private readonly costTracker: CostTracker;
  private readonly enforcementEngine: EnforcementEngine;
  private readonly adaptiveLimits: AdaptiveLimits;

  /**
   * Create a new CostGuardrailsEngine
   * @param config - Guardrails configuration
   * @param options - Optional dependencies
   * @param options.adaptiveConfig - Adaptive limit configuration
   * @param options.costStore - Custom cost record store (defaults to in-memory)
   */
  constructor(
    config: GuardrailsConfig,
    options?: {
      adaptiveConfig?: AdaptiveLimitConfig;
      costStore?: CostRecordStore;
    },
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize cost store
    const costStore = options?.costStore ?? new InMemoryCostRecordStore();

    // Initialize decomposed components
    this.limitManager = new LimitManager({
      defaultAction: this.config.defaultAction,
      defaultSessionLimit: this.config.defaultSessionLimit,
      defaultUserLimit: this.config.defaultUserLimit,
      defaultUserLimitWindow: this.config.defaultUserLimitWindow,
      globalLimitWindow: this.config.globalLimitWindow,
      warningThreshold: this.config.warningThreshold,
      onLimitUpdated: this.config.onLimitUpdated,
    });

    this.costTracker = new CostTracker(costStore);

    this.enforcementEngine = new EnforcementEngine(
      {
        enabled: this.config.enabled,
        warningThreshold: this.config.warningThreshold,
        defaultSessionLimit: this.config.defaultSessionLimit,
        defaultUserLimit: this.config.defaultUserLimit,
        onWarning: this.config.onWarning,
        onLimitEnforced: this.config.onLimitEnforced,
      },
      this.limitManager,
      this.costTracker,
    );

    this.adaptiveLimits = new AdaptiveLimits(
      options?.adaptiveConfig,
      this.limitManager,
      this.costTracker,
    );

    // Initialize global limit if configured
    if (this.config.globalLimit) {
      this.setGlobalLimit({
        maxCost: this.config.globalLimit,
        windowMs: this.config.globalLimitWindow,
        action: this.config.defaultAction,
      });
    }
  }

  // ============================================================================
  // Cost Checking (delegated to EnforcementEngine)
  // ============================================================================

  /**
   * Check if a request should be allowed based on cost limits
   */
  checkCost(request: CostCheckRequest): CostCheckResult {
    return this.enforcementEngine.checkCost(request);
  }

  /**
   * Record a cost event and update limits
   */
  recordCost(record: Omit<CostRecord, "id">): CostRecord {
    const fullRecord = this.costTracker.recordCost(record);

    // Update all applicable limits
    this.enforcementEngine.updateLimitsForCost(
      record.sessionId,
      record.userId,
      record.featureId,
      record.model,
      record.cost,
    );

    return fullRecord;
  }

  // ============================================================================
  // Limit Management (delegated to LimitManager)
  // ============================================================================

  /**
   * Set a session cost limit
   */
  setSessionLimit(config: SessionLimitConfig): SessionLimit {
    return this.limitManager.setSessionLimit(config);
  }

  /**
   * Set a user cost limit
   */
  setUserLimit(config: UserLimitConfig): UserLimit {
    return this.limitManager.setUserLimit(config);
  }

  /**
   * Set a feature cost limit
   */
  setFeatureLimit(config: FeatureLimitConfig): FeatureLimit {
    return this.limitManager.setFeatureLimit(config);
  }

  /**
   * Set a model cost limit
   */
  setModelLimit(config: ModelLimitConfig): ModelLimit {
    return this.limitManager.setModelLimit(config);
  }

  /**
   * Set the global cost limit
   */
  setGlobalLimit(config: LimitConfig): GlobalLimit {
    return this.limitManager.setGlobalLimit(config);
  }

  /**
   * Get a session limit
   */
  getSessionLimit(sessionId: string): SessionLimit | null {
    return this.limitManager.getSessionLimit(sessionId);
  }

  /**
   * Get a user limit
   */
  getUserLimit(userId: string): UserLimit | null {
    return this.limitManager.getUserLimit(userId);
  }

  /**
   * Get a feature limit
   */
  getFeatureLimit(featureId: string): FeatureLimit | null {
    return this.limitManager.getFeatureLimit(featureId);
  }

  /**
   * Get a model limit
   */
  getModelLimit(model: string): ModelLimit | null {
    return this.limitManager.getModelLimit(model);
  }

  /**
   * Get the global limit
   */
  getGlobalLimit(): GlobalLimit | null {
    return this.limitManager.getGlobalLimit();
  }

  /**
   * Remove a limit
   */
  removeLimit(type: LimitType, scopeId: string): boolean {
    return this.limitManager.removeLimit(type, scopeId);
  }

  /**
   * Update an existing limit
   */
  updateLimit(
    type: LimitType,
    scopeId: string,
    updates: Partial<LimitConfig>,
  ): CostLimit | null {
    return this.limitManager.updateLimit(type, scopeId, updates);
  }

  /**
   * Reset a limit's current spend
   */
  resetLimit(type: LimitType, scopeId: string): CostLimit | null {
    return this.limitManager.resetLimit(type, scopeId);
  }

  // ============================================================================
  // Auto-limit Management
  // ============================================================================

  /**
   * Ensure session has a limit (auto-create with defaults if not)
   */
  ensureSessionLimit(sessionId: string): SessionLimit {
    return this.limitManager.ensureSessionLimit(sessionId);
  }

  /**
   * Ensure user has a limit (auto-create with defaults if not)
   */
  ensureUserLimit(userId: string): UserLimit {
    return this.limitManager.ensureUserLimit(userId);
  }

  // ============================================================================
  // Adaptive Limits (delegated to AdaptiveLimits)
  // ============================================================================

  /**
   * Calculate adaptive limit based on historical usage
   */
  calculateAdaptiveLimit(
    type: LimitType,
    scopeId: string,
    customConfig?: Partial<AdaptiveLimitConfig>,
  ): AdaptiveLimitResult {
    return this.adaptiveLimits.calculateAdaptiveLimit(
      type,
      scopeId,
      customConfig,
    );
  }

  /**
   * Apply adaptive limits to all scopes
   */
  applyAdaptiveLimits(type: LimitType): number {
    return this.adaptiveLimits.applyAdaptiveLimits(type);
  }

  // ============================================================================
  // Spending Analysis (delegated to CostTracker)
  // ============================================================================

  /**
   * Get spending summary for a time period
   */
  getSpendingSummary(startTime: number, endTime?: number): SpendingSummary {
    return this.costTracker.getSpendingSummary(startTime, endTime);
  }

  /**
   * Get current spending for a scope
   */
  getCurrentSpending(type: LimitType, scopeId: string): number {
    const limit = this.limitManager.getLimit(type, scopeId);
    if (!limit) return 0;
    return this.enforcementEngine.getCurrentSpending(limit);
  }

  /**
   * Get remaining budget for a scope
   */
  getRemainingBudget(type: LimitType, scopeId: string): number {
    const limit = this.limitManager.getLimit(type, scopeId);
    if (!limit) return Infinity;
    return this.enforcementEngine.getRemainingBudget(limit);
  }

  // ============================================================================
  // Stats & Utilities
  // ============================================================================

  /**
   * Get guardrail statistics
   */
  getStats(): GuardrailStats {
    return this.enforcementEngine.getStats();
  }

  /**
   * Get all active limits
   */
  getAllLimits(): CostLimit[] {
    return this.limitManager.getAllLimits();
  }

  /**
   * Get exceeded limits
   */
  getExceededLimits(): CostLimit[] {
    return this.enforcementEngine.getExceededLimits();
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.limitManager.clear();
    this.costTracker.clear();
    this.enforcementEngine.resetStats();
  }
}

// ============================================================================
// Middleware Factory
// ============================================================================

export interface GuardrailMiddlewareOptions {
  /** Session ID extractor */
  getSessionId: (context: unknown) => string;
  /** User ID extractor (optional) */
  getUserId?: (context: unknown) => string | undefined;
  /** Feature ID extractor (optional) */
  getFeatureId?: (context: unknown) => string | undefined;
  /** Model extractor (optional) */
  getModel?: (context: unknown) => string | undefined;
  /** Cost estimator */
  estimateCost: (context: unknown) => number;
  /** Called when request is blocked */
  onBlocked?: (result: CostCheckResult, context: unknown) => void;
  /** Called when request is throttled */
  onThrottled?: (result: CostCheckResult, context: unknown) => void;
}

/**
 * Create a middleware function for cost guardrails
 */
export function createGuardrailMiddleware(
  engine: CostGuardrailsEngine,
  options: GuardrailMiddlewareOptions,
): (context: unknown, next: () => Promise<unknown>) => Promise<unknown> {
  return async (
    context: unknown,
    next: () => Promise<unknown>,
  ): Promise<unknown> => {
    const request: CostCheckRequest = {
      sessionId: options.getSessionId(context),
      userId: options.getUserId?.(context),
      featureId: options.getFeatureId?.(context),
      model: options.getModel?.(context),
      estimatedCost: options.estimateCost(context),
    };

    const result = engine.checkCost(request);

    if (!result.allowed) {
      options.onBlocked?.(result, context);
      throw new Error(result.message ?? "Request blocked by cost guardrails");
    }

    if (result.throttleDelayMs) {
      options.onThrottled?.(result, context);
      await new Promise((resolve) =>
        setTimeout(resolve, result.throttleDelayMs),
      );
    }

    return next();
  };
}
