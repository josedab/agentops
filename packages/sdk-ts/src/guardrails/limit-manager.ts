/**
 * AgentOps SDK - Limit Manager
 *
 * Single-responsibility class for CRUD operations on cost limits.
 * Extracted from CostGuardrailsEngine for better maintainability.
 */

import { generateEventId, now } from "../utils.js";
import {
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
  GuardrailAction,
  LimitUpdate,
} from "./types.js";

export interface LimitManagerConfig {
  defaultAction: GuardrailAction;
  defaultSessionLimit: number;
  defaultUserLimit: number;
  defaultUserLimitWindow: number;
  globalLimitWindow: number;
  warningThreshold: number;
  onLimitUpdated?: (event: LimitUpdate) => void;
}

/**
 * Manages the lifecycle of cost limits (create, read, update, delete).
 */
export class LimitManager {
  private sessionLimits: Map<string, SessionLimit> = new Map();
  private userLimits: Map<string, UserLimit> = new Map();
  private featureLimits: Map<string, FeatureLimit> = new Map();
  private modelLimits: Map<string, ModelLimit> = new Map();
  private globalLimit: GlobalLimit | null = null;

  constructor(private readonly config: LimitManagerConfig) {}

  /**
   * Create a new limit with default values
   */
  private createLimit(
    type: LimitType,
    scopeId: string,
    config: LimitConfig,
  ): CostLimit {
    return {
      id: generateEventId(),
      type,
      scopeId,
      maxCost: config.maxCost,
      windowMs: config.windowMs ?? null,
      action: config.action ?? this.config.defaultAction,
      currentSpend: 0,
      windowStart: now(),
      isExceeded: false,
      isWarning: false,
      createdAt: now(),
      updatedAt: now(),
      metadata: config.metadata,
    };
  }

  // =========================================================================
  // Session Limits
  // =========================================================================

  setSessionLimit(config: SessionLimitConfig): SessionLimit {
    const limit = this.createLimit(
      "session",
      config.sessionId,
      config,
    ) as SessionLimit;
    limit.sessionId = config.sessionId;
    this.sessionLimits.set(config.sessionId, limit);
    return limit;
  }

  getSessionLimit(sessionId: string): SessionLimit | null {
    return this.sessionLimits.get(sessionId) ?? null;
  }

  ensureSessionLimit(sessionId: string): SessionLimit {
    let limit = this.sessionLimits.get(sessionId);
    if (!limit) {
      limit = this.setSessionLimit({
        sessionId,
        maxCost: this.config.defaultSessionLimit,
        windowMs: null,
        action: this.config.defaultAction,
      });
    }
    return limit;
  }

  // =========================================================================
  // User Limits
  // =========================================================================

  setUserLimit(config: UserLimitConfig): UserLimit {
    const limit = this.createLimit("user", config.userId, {
      ...config,
      windowMs: config.windowMs ?? this.config.defaultUserLimitWindow,
    }) as UserLimit;
    limit.userId = config.userId;
    this.userLimits.set(config.userId, limit);
    return limit;
  }

  getUserLimit(userId: string): UserLimit | null {
    return this.userLimits.get(userId) ?? null;
  }

  ensureUserLimit(userId: string): UserLimit {
    let limit = this.userLimits.get(userId);
    if (!limit) {
      limit = this.setUserLimit({
        userId,
        maxCost: this.config.defaultUserLimit,
        windowMs: this.config.defaultUserLimitWindow,
        action: this.config.defaultAction,
      });
    }
    return limit;
  }

  // =========================================================================
  // Feature Limits
  // =========================================================================

  setFeatureLimit(config: FeatureLimitConfig): FeatureLimit {
    const limit = this.createLimit(
      "feature",
      config.featureId,
      config,
    ) as FeatureLimit;
    limit.featureId = config.featureId;
    this.featureLimits.set(config.featureId, limit);
    return limit;
  }

  getFeatureLimit(featureId: string): FeatureLimit | null {
    return this.featureLimits.get(featureId) ?? null;
  }

  // =========================================================================
  // Model Limits
  // =========================================================================

  setModelLimit(config: ModelLimitConfig): ModelLimit {
    const limit = this.createLimit("model", config.model, config) as ModelLimit;
    limit.model = config.model;
    this.modelLimits.set(config.model, limit);
    return limit;
  }

  getModelLimit(model: string): ModelLimit | null {
    return this.modelLimits.get(model) ?? null;
  }

  // =========================================================================
  // Global Limit
  // =========================================================================

  setGlobalLimit(config: LimitConfig): GlobalLimit {
    const limit = this.createLimit("global", "global", {
      ...config,
      windowMs: config.windowMs ?? this.config.globalLimitWindow,
    }) as GlobalLimit;
    this.globalLimit = limit;
    return limit;
  }

  getGlobalLimit(): GlobalLimit | null {
    return this.globalLimit;
  }

  // =========================================================================
  // Generic Operations
  // =========================================================================

  getLimit(type: LimitType, scopeId: string): CostLimit | null {
    switch (type) {
      case "session":
        return this.sessionLimits.get(scopeId) ?? null;
      case "user":
        return this.userLimits.get(scopeId) ?? null;
      case "feature":
        return this.featureLimits.get(scopeId) ?? null;
      case "model":
        return this.modelLimits.get(scopeId) ?? null;
      case "global":
        return this.globalLimit;
    }
  }

  removeLimit(type: LimitType, scopeId: string): boolean {
    switch (type) {
      case "session":
        return this.sessionLimits.delete(scopeId);
      case "user":
        return this.userLimits.delete(scopeId);
      case "feature":
        return this.featureLimits.delete(scopeId);
      case "model":
        return this.modelLimits.delete(scopeId);
      case "global":
        if (this.globalLimit) {
          this.globalLimit = null;
          return true;
        }
        return false;
    }
  }

  updateLimit(
    type: LimitType,
    scopeId: string,
    updates: Partial<LimitConfig>,
  ): CostLimit | null {
    const limit = this.getLimit(type, scopeId);
    if (!limit) return null;

    const previous = {
      maxCost: limit.maxCost,
      action: limit.action,
      windowMs: limit.windowMs,
    };

    if (updates.maxCost !== undefined) limit.maxCost = updates.maxCost;
    if (updates.action !== undefined) limit.action = updates.action;
    if (updates.windowMs !== undefined) limit.windowMs = updates.windowMs;
    limit.updatedAt = now();

    // Reset exceeded status if limit increased
    if (updates.maxCost && updates.maxCost > previous.maxCost) {
      limit.isExceeded = limit.currentSpend > limit.maxCost;
      limit.isWarning =
        limit.currentSpend >= limit.maxCost * this.config.warningThreshold;
    }

    const event: LimitUpdate = {
      limit,
      previous,
      reason: "manual",
      timestamp: now(),
    };
    this.config.onLimitUpdated?.(event);

    return limit;
  }

  resetLimit(type: LimitType, scopeId: string): CostLimit | null {
    const limit = this.getLimit(type, scopeId);
    if (!limit) return null;

    limit.currentSpend = 0;
    limit.windowStart = now();
    limit.isExceeded = false;
    limit.isWarning = false;
    limit.updatedAt = now();

    return limit;
  }

  // =========================================================================
  // Bulk Operations
  // =========================================================================

  getAllLimits(): CostLimit[] {
    const limits: CostLimit[] = [];

    for (const limit of this.sessionLimits.values()) {
      limits.push(limit);
    }
    for (const limit of this.userLimits.values()) {
      limits.push(limit);
    }
    for (const limit of this.featureLimits.values()) {
      limits.push(limit);
    }
    for (const limit of this.modelLimits.values()) {
      limits.push(limit);
    }
    if (this.globalLimit) {
      limits.push(this.globalLimit);
    }

    return limits;
  }

  getActiveLimitCount(): number {
    return (
      this.sessionLimits.size +
      this.userLimits.size +
      this.featureLimits.size +
      this.modelLimits.size +
      (this.globalLimit ? 1 : 0)
    );
  }

  clear(): void {
    this.sessionLimits.clear();
    this.userLimits.clear();
    this.featureLimits.clear();
    this.modelLimits.clear();
    this.globalLimit = null;
  }
}
