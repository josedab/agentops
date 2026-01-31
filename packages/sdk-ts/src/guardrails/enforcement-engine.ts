/**
 * AgentOps SDK - Enforcement Engine
 *
 * Single-responsibility class for checking and enforcing cost limits.
 * Extracted from CostGuardrailsEngine for better maintainability.
 */

import { generateEventId, now } from "../utils.js";
import { LimitManager } from "./limit-manager.js";
import { CostTracker } from "./cost-tracker.js";
import {
  CostLimit,
  CostCheckRequest,
  CostCheckResult,
  GuardrailAction,
  GuardrailWarning,
  GuardrailEnforcement,
  GuardrailStats,
} from "./types.js";

export interface EnforcementConfig {
  enabled: boolean;
  warningThreshold: number;
  defaultSessionLimit: number;
  defaultUserLimit: number;
  onWarning?: (warning: GuardrailWarning) => void;
  onLimitEnforced?: (enforcement: GuardrailEnforcement) => void;
}

/**
 * Enforces cost limits by checking requests and managing limit state.
 */
export class EnforcementEngine {
  private stats: GuardrailStats = {
    totalChecks: 0,
    allowedRequests: 0,
    blockedRequests: 0,
    throttledRequests: 0,
    warningsIssued: 0,
    totalCostTracked: 0,
    activeLimits: 0,
    limitsExceeded: 0,
  };

  constructor(
    private readonly config: EnforcementConfig,
    private readonly limitManager: LimitManager,
    private readonly costTracker: CostTracker,
  ) {}

  /**
   * Check if a request should be allowed based on cost limits
   */
  checkCost(request: CostCheckRequest): CostCheckResult {
    if (!this.config.enabled) {
      return {
        allowed: true,
        triggeredLimits: [],
        warnings: [],
        canOverride: false,
      };
    }

    this.stats.totalChecks++;
    const triggeredLimits: CostLimit[] = [];
    const warnings: GuardrailWarning[] = [];
    let action: GuardrailAction | undefined;
    let throttleDelayMs: number | undefined;

    // Check all applicable limits
    const limitsToCheck = this.getApplicableLimits(request);

    for (const limit of limitsToCheck) {
      this.updateRollingWindow(limit);

      // Check warning threshold
      const percentUsed =
        (limit.currentSpend + request.estimatedCost) / limit.maxCost;

      if (percentUsed >= this.config.warningThreshold && !limit.isWarning) {
        limit.isWarning = true;
        const warning = this.createWarning(limit, request.estimatedCost);
        warnings.push(warning);
        this.stats.warningsIssued++;
        this.config.onWarning?.(warning);
      }

      // Check if would exceed limit
      if (limit.currentSpend + request.estimatedCost > limit.maxCost) {
        triggeredLimits.push(limit);

        // Use most restrictive action
        if (!action || this.isMoreRestrictive(limit.action, action)) {
          action = limit.action;
        }
      }
    }

    // Determine result
    if (triggeredLimits.length === 0) {
      this.stats.allowedRequests++;
      return {
        allowed: true,
        triggeredLimits: [],
        warnings,
        canOverride: false,
      };
    }

    // Handle enforcement
    const enforcement = this.createEnforcement(
      triggeredLimits[0],
      action!,
      request,
    );
    this.config.onLimitEnforced?.(enforcement);

    switch (action) {
      case "warn":
        this.stats.allowedRequests++;
        return {
          allowed: true,
          action,
          triggeredLimits,
          warnings,
          message: `Warning: Cost limit approaching. Current spend: $${triggeredLimits[0].currentSpend.toFixed(4)}`,
          canOverride: false,
        };

      case "throttle":
        this.stats.throttledRequests++;
        throttleDelayMs = this.calculateThrottleDelay(triggeredLimits[0]);
        return {
          allowed: true,
          action,
          triggeredLimits,
          warnings,
          throttleDelayMs,
          message: `Request throttled for ${throttleDelayMs}ms due to cost limits`,
          canOverride: false,
        };

      case "soft_block":
        if (request.allowOverride) {
          this.stats.allowedRequests++;
          return {
            allowed: true,
            action,
            triggeredLimits,
            warnings,
            message: "Cost limit exceeded but override applied",
            canOverride: true,
          };
        }
        this.stats.blockedRequests++;
        return {
          allowed: false,
          action,
          triggeredLimits,
          warnings,
          message: `Cost limit exceeded: $${triggeredLimits[0].currentSpend.toFixed(4)} / $${triggeredLimits[0].maxCost.toFixed(4)}`,
          canOverride: true,
        };

      case "hard_block":
        this.stats.blockedRequests++;
        return {
          allowed: false,
          action,
          triggeredLimits,
          warnings,
          message: `Cost limit exceeded: $${triggeredLimits[0].currentSpend.toFixed(4)} / $${triggeredLimits[0].maxCost.toFixed(4)}. Cannot override.`,
          canOverride: false,
        };

      default:
        this.stats.allowedRequests++;
        return {
          allowed: true,
          triggeredLimits,
          warnings,
          canOverride: false,
        };
    }
  }

  /**
   * Add cost to applicable limits after a cost is recorded
   */
  updateLimitsForCost(
    sessionId: string,
    userId: string | undefined,
    featureId: string | undefined,
    model: string | undefined,
    cost: number,
  ): void {
    // Update session limit
    const sessionLimit = this.limitManager.getSessionLimit(sessionId);
    if (sessionLimit) {
      this.addCostToLimit(sessionLimit, cost);
    }

    // Update user limit
    if (userId) {
      const userLimit = this.limitManager.getUserLimit(userId);
      if (userLimit) {
        this.addCostToLimit(userLimit, cost);
      }
    }

    // Update feature limit
    if (featureId) {
      const featureLimit = this.limitManager.getFeatureLimit(featureId);
      if (featureLimit) {
        this.addCostToLimit(featureLimit, cost);
      }
    }

    // Update model limit
    if (model) {
      const modelLimit = this.limitManager.getModelLimit(model);
      if (modelLimit) {
        this.addCostToLimit(modelLimit, cost);
      }
    }

    // Update global limit
    const globalLimit = this.limitManager.getGlobalLimit();
    if (globalLimit) {
      this.addCostToLimit(globalLimit, cost);
    }

    this.stats.totalCostTracked += cost;
  }

  /**
   * Get current spending for a limit
   */
  getCurrentSpending(limit: CostLimit): number {
    this.updateRollingWindow(limit);
    return limit.currentSpend;
  }

  /**
   * Get remaining budget for a limit
   */
  getRemainingBudget(limit: CostLimit): number {
    this.updateRollingWindow(limit);
    return Math.max(0, limit.maxCost - limit.currentSpend);
  }

  /**
   * Get exceeded limits
   */
  getExceededLimits(): CostLimit[] {
    return this.limitManager.getAllLimits().filter((l) => {
      this.updateRollingWindow(l);
      return l.isExceeded;
    });
  }

  /**
   * Get statistics
   */
  getStats(): GuardrailStats {
    this.stats.activeLimits = this.limitManager.getActiveLimitCount();
    this.stats.limitsExceeded = this.getExceededLimits().length;
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalChecks: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      throttledRequests: 0,
      warningsIssued: 0,
      totalCostTracked: 0,
      activeLimits: 0,
      limitsExceeded: 0,
    };
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private getApplicableLimits(request: CostCheckRequest): CostLimit[] {
    const limits: CostLimit[] = [];

    // Session limit
    const sessionLimit = this.limitManager.getSessionLimit(request.sessionId);
    if (sessionLimit) {
      limits.push(sessionLimit);
    } else if (this.config.defaultSessionLimit > 0) {
      limits.push(this.limitManager.ensureSessionLimit(request.sessionId));
    }

    // User limit
    if (request.userId) {
      const userLimit = this.limitManager.getUserLimit(request.userId);
      if (userLimit) {
        limits.push(userLimit);
      } else if (this.config.defaultUserLimit > 0) {
        limits.push(this.limitManager.ensureUserLimit(request.userId));
      }
    }

    // Feature limit
    if (request.featureId) {
      const featureLimit = this.limitManager.getFeatureLimit(request.featureId);
      if (featureLimit) limits.push(featureLimit);
    }

    // Model limit
    if (request.model) {
      const modelLimit = this.limitManager.getModelLimit(request.model);
      if (modelLimit) limits.push(modelLimit);
    }

    // Global limit
    const globalLimit = this.limitManager.getGlobalLimit();
    if (globalLimit) {
      limits.push(globalLimit);
    }

    return limits;
  }

  private addCostToLimit(limit: CostLimit, cost: number): void {
    this.updateRollingWindow(limit);
    limit.currentSpend += cost;
    limit.updatedAt = now();

    limit.isExceeded = limit.currentSpend > limit.maxCost;
    limit.isWarning =
      limit.currentSpend >= limit.maxCost * this.config.warningThreshold;
  }

  private updateRollingWindow(limit: CostLimit): void {
    if (!limit.windowMs) return;

    const currentTime = now();
    const windowExpired = currentTime - limit.windowStart > limit.windowMs;

    if (windowExpired) {
      // Reset window and recalculate from store
      limit.windowStart = currentTime;
      limit.currentSpend = this.costTracker.calculateWindowSpend(limit);
      limit.isExceeded = limit.currentSpend > limit.maxCost;
      limit.isWarning =
        limit.currentSpend >= limit.maxCost * this.config.warningThreshold;
      limit.updatedAt = currentTime;
    }
  }

  private isMoreRestrictive(a: GuardrailAction, b: GuardrailAction): boolean {
    const order: Record<GuardrailAction, number> = {
      warn: 0,
      throttle: 1,
      soft_block: 2,
      hard_block: 3,
    };
    return order[a] > order[b];
  }

  private calculateThrottleDelay(limit: CostLimit): number {
    const percentOver = limit.currentSpend / limit.maxCost - 1;
    const baseDelay = 100;
    const maxDelay = 10000;
    const delay = Math.min(maxDelay, baseDelay * Math.pow(2, percentOver * 10));
    return Math.round(delay);
  }

  private createWarning(
    limit: CostLimit,
    estimatedCost: number,
  ): GuardrailWarning {
    const percentUsed = (limit.currentSpend + estimatedCost) / limit.maxCost;
    return {
      id: generateEventId(),
      limit,
      currentSpend: limit.currentSpend,
      percentUsed,
      remaining: Math.max(0, limit.maxCost - limit.currentSpend),
      timestamp: now(),
    };
  }

  private createEnforcement(
    limit: CostLimit,
    action: GuardrailAction,
    request: CostCheckRequest,
  ): GuardrailEnforcement {
    return {
      id: generateEventId(),
      limit,
      action,
      request: {
        sessionId: request.sessionId,
        userId: request.userId,
        featureId: request.featureId,
        model: request.model,
        estimatedCost: request.estimatedCost,
      },
      reason: `Exceeded ${limit.type} limit: $${limit.currentSpend.toFixed(4)} / $${limit.maxCost.toFixed(4)}`,
      overridden: request.allowOverride ?? false,
      timestamp: now(),
    };
  }
}
