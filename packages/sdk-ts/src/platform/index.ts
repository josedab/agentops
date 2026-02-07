/**
 * AgentOps SDK - Managed Cloud Platform
 *
 * Multi-tenant platform foundations including tenant management,
 * API key lifecycle, usage tracking, rate limiting, and onboarding.
 */

import { nanoid } from "nanoid";

import type {
  Tenant,
  TenantSettings,
  TenantStatus,
  PlanType,
  APIKeyRecord,
  APIKeyValidationResult,
  UsageRecord,
  UsageLimits,
  RateLimitConfig,
  RateLimitResult,
  OnboardingStep,
  OnboardingState,
} from "./types.js";

import { PLAN_DEFAULTS } from "./types.js";

// Re-export all types
export type {
  Tenant,
  TenantSettings,
  TenantStatus,
  PlanType,
  APIKeyRecord,
  APIKeyValidationResult,
  UsageRecord,
  UsageLimits,
  RateLimitConfig,
  RateLimitResult,
  OnboardingStep,
  OnboardingState,
  PlatformConfig,
} from "./types.js";

export { PLAN_DEFAULTS } from "./types.js";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Hash a string using SHA-256 via the Web Crypto API.
 * Returns the hex-encoded digest.
 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a slug from a name string.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Get the current billing period in YYYY-MM format.
 */
function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// ============================================================================
// TenantManager
// ============================================================================

export class TenantManager {
  private tenants = new Map<string, Tenant>();

  /**
   * Create a new tenant with the given name and plan.
   * Tenant settings are derived from plan defaults unless overridden.
   */
  createTenant(
    name: string,
    plan: PlanType,
    settings?: Partial<TenantSettings>,
  ): Tenant {
    const id = `tenant_${nanoid(21)}`;
    const defaults = PLAN_DEFAULTS[plan];

    const tenant: Tenant = {
      id,
      name,
      slug: slugify(name),
      plan,
      status: "active",
      createdAt: Date.now(),
      settings: {
        maxEventsPerMonth: settings?.maxEventsPerMonth ?? defaults.events,
        maxSessions: settings?.maxSessions ?? defaults.sessions,
        retentionDays: settings?.retentionDays ?? defaults.retention,
        allowedModels: settings?.allowedModels,
        customEndpoint: settings?.customEndpoint,
      },
    };

    this.tenants.set(id, tenant);
    return tenant;
  }

  /**
   * Retrieve a tenant by ID.
   */
  getTenant(tenantId: string): Tenant | undefined {
    return this.tenants.get(tenantId);
  }

  /**
   * Update a tenant's settings or plan.
   */
  updateTenant(
    tenantId: string,
    updates: Partial<Pick<Tenant, "name" | "plan" | "settings">>,
  ): Tenant {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    if (updates.name !== undefined) {
      tenant.name = updates.name;
      tenant.slug = slugify(updates.name);
    }

    if (updates.plan !== undefined) {
      tenant.plan = updates.plan;
    }

    if (updates.settings !== undefined) {
      tenant.settings = { ...tenant.settings, ...updates.settings };
    }

    this.tenants.set(tenantId, tenant);
    return tenant;
  }

  /**
   * Suspend a tenant account.
   */
  suspendTenant(tenantId: string, _reason: string): Tenant {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    tenant.status = "suspended";
    this.tenants.set(tenantId, tenant);
    return tenant;
  }

  /**
   * Reactivate a suspended tenant.
   */
  activateTenant(tenantId: string): Tenant {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    tenant.status = "active";
    this.tenants.set(tenantId, tenant);
    return tenant;
  }

  /**
   * Delete a tenant permanently.
   */
  deleteTenant(tenantId: string): boolean {
    return this.tenants.delete(tenantId);
  }

  /**
   * List tenants with optional filtering by plan and/or status.
   */
  listTenants(filter?: { plan?: PlanType; status?: TenantStatus }): Tenant[] {
    let results = Array.from(this.tenants.values());

    if (filter?.plan) {
      results = results.filter((t) => t.plan === filter.plan);
    }
    if (filter?.status) {
      results = results.filter((t) => t.status === filter.status);
    }

    return results;
  }
}

// ============================================================================
// APIKeyManager
// ============================================================================

export class APIKeyManager {
  private keys = new Map<string, APIKeyRecord>();

  /**
   * Generate a new API key for a tenant.
   * Returns the raw key value -- this is the only time it is available in plaintext.
   */
  async generateKey(
    tenantId: string,
    name: string,
    permissions: string[],
    expiresAt?: number,
  ): Promise<{ record: APIKeyRecord; rawKey: string }> {
    const rawKey = `agops_${nanoid(32)}`;
    const prefix = rawKey.slice(0, 8);
    const hashedKey = await sha256(rawKey);

    const record: APIKeyRecord = {
      key: hashedKey,
      tenantId,
      name,
      prefix,
      permissions,
      createdAt: Date.now(),
      expiresAt,
      revoked: false,
    };

    this.keys.set(hashedKey, record);
    return { record, rawKey };
  }

  /**
   * Validate a raw API key and return the validation result.
   */
  async validateKey(rawKey: string): Promise<APIKeyValidationResult> {
    const hashedKey = await sha256(rawKey);
    const record = this.keys.get(hashedKey);

    if (!record) {
      return { valid: false, error: "Key not found" };
    }

    if (record.revoked) {
      return { valid: false, error: "Key has been revoked" };
    }

    if (record.expiresAt && record.expiresAt < Date.now()) {
      return { valid: false, error: "Key has expired" };
    }

    // Update last used timestamp
    record.lastUsedAt = Date.now();
    this.keys.set(hashedKey, record);

    return {
      valid: true,
      tenantId: record.tenantId,
      permissions: record.permissions,
    };
  }

  /**
   * Revoke a key by its prefix and tenant ID.
   */
  revokeKey(keyPrefix: string, tenantId: string): boolean {
    for (const [hash, record] of this.keys) {
      if (record.prefix === keyPrefix && record.tenantId === tenantId) {
        record.revoked = true;
        this.keys.set(hash, record);
        return true;
      }
    }
    return false;
  }

  /**
   * List all keys for a tenant (without exposing the full hashed key value).
   */
  listKeys(tenantId: string): Omit<APIKeyRecord, "key">[] {
    const results: Omit<APIKeyRecord, "key">[] = [];

    for (const record of this.keys.values()) {
      if (record.tenantId === tenantId) {
        const { key: _key, ...rest } = record;
        results.push(rest);
      }
    }

    return results;
  }
}

// ============================================================================
// UsageTracker
// ============================================================================

export class UsageTracker {
  /** Map key: `${tenantId}:${period}` */
  private usage = new Map<string, UsageRecord>();
  private limits = new Map<string, UsageLimits>();

  /**
   * Set usage limits for a tenant.
   */
  setLimits(tenantId: string, limits: UsageLimits): void {
    this.limits.set(tenantId, limits);
  }

  /**
   * Record usage for a tenant in the current billing period.
   */
  recordUsage(
    tenantId: string,
    events: number,
    sessions: number,
    tokens: number,
    cost: number,
  ): UsageRecord {
    const period = getCurrentPeriod();
    const key = `${tenantId}:${period}`;
    const existing = this.usage.get(key);

    const record: UsageRecord = {
      tenantId,
      period,
      eventsCount: (existing?.eventsCount ?? 0) + events,
      sessionsCount: (existing?.sessionsCount ?? 0) + sessions,
      tokensUsed: (existing?.tokensUsed ?? 0) + tokens,
      estimatedCost: (existing?.estimatedCost ?? 0) + cost,
    };

    this.usage.set(key, record);
    return record;
  }

  /**
   * Get usage for a tenant in a specific period (defaults to current).
   */
  getUsage(tenantId: string, period?: string): UsageRecord | undefined {
    const p = period ?? getCurrentPeriod();
    return this.usage.get(`${tenantId}:${p}`);
  }

  /**
   * Check whether a tenant is within their usage limits.
   */
  checkLimits(tenantId: string): {
    withinLimits: boolean;
    usage: UsageRecord;
    limits: UsageLimits;
    percentUsed: { events: number; sessions: number; cost: number };
  } {
    const period = getCurrentPeriod();
    const usage = this.usage.get(`${tenantId}:${period}`) ?? {
      tenantId,
      period,
      eventsCount: 0,
      sessionsCount: 0,
      tokensUsed: 0,
      estimatedCost: 0,
    };

    const limits = this.limits.get(tenantId) ?? {
      maxEventsPerMonth: PLAN_DEFAULTS.free.events,
      maxSessionsPerMonth: PLAN_DEFAULTS.free.sessions,
      maxCostPerMonth: PLAN_DEFAULTS.free.cost,
    };

    const percentEvents =
      limits.maxEventsPerMonth > 0
        ? (usage.eventsCount / limits.maxEventsPerMonth) * 100
        : 0;
    const percentSessions =
      limits.maxSessionsPerMonth > 0
        ? (usage.sessionsCount / limits.maxSessionsPerMonth) * 100
        : 0;
    const percentCost =
      limits.maxCostPerMonth > 0
        ? (usage.estimatedCost / limits.maxCostPerMonth) * 100
        : 0;

    const withinLimits =
      usage.eventsCount <= limits.maxEventsPerMonth &&
      usage.sessionsCount <= limits.maxSessionsPerMonth &&
      (limits.maxCostPerMonth === 0 ||
        usage.estimatedCost <= limits.maxCostPerMonth);

    return {
      withinLimits,
      usage,
      limits,
      percentUsed: {
        events: Math.round(percentEvents * 100) / 100,
        sessions: Math.round(percentSessions * 100) / 100,
        cost: Math.round(percentCost * 100) / 100,
      },
    };
  }

  /**
   * Get historical usage across multiple billing periods.
   */
  getUsageHistory(tenantId: string, periods?: number): UsageRecord[] {
    const count = periods ?? 6;
    const results: UsageRecord[] = [];

    const now = new Date();
    for (let i = 0; i < count; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const period = `${year}-${month}`;
      const record = this.usage.get(`${tenantId}:${period}`);

      if (record) {
        results.push(record);
      }
    }

    return results;
  }
}

// ============================================================================
// RateLimiter
// ============================================================================

interface SlidingWindowEntry {
  timestamps: number[];
}

export class RateLimiter {
  private windows = new Map<string, SlidingWindowEntry>();

  /**
   * Check whether a request should be allowed under the given rate limit config.
   * Uses a sliding window algorithm.
   */
  checkLimit(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get or create window entry
    let entry = this.windows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(key, entry);
    }

    // Remove expired timestamps outside the sliding window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    // Check burst: count requests in the last 1 second
    const burstWindowStart = now - 1000;
    const burstCount = entry.timestamps.filter(
      (ts) => ts > burstWindowStart,
    ).length;

    // Determine if the request is allowed
    const requestCount = entry.timestamps.length;
    const allowed =
      requestCount < config.maxRequests && burstCount < config.burstSize;

    if (allowed) {
      entry.timestamps.push(now);
    }

    const remaining = Math.max(0, config.maxRequests - entry.timestamps.length);
    const resetAt = now + config.windowMs;

    const result: RateLimitResult = {
      allowed,
      remaining,
      resetAt,
    };

    if (!allowed) {
      // Calculate retry-after: time until the oldest timestamp expires
      const oldestInWindow = entry.timestamps[0];
      if (oldestInWindow) {
        result.retryAfter = Math.ceil(
          (oldestInWindow + config.windowMs - now) / 1000,
        );
      }
    }

    return result;
  }

  /**
   * Reset the rate limit state for a given key.
   */
  reset(key: string): void {
    this.windows.delete(key);
  }
}

// ============================================================================
// OnboardingManager
// ============================================================================

const DEFAULT_ONBOARDING_STEPS: Array<{
  id: string;
  title: string;
  description: string;
}> = [
  {
    id: "install-sdk",
    title: "Install the SDK",
    description: "Add @agentops/sdk to your project using npm, yarn, or pnpm.",
  },
  {
    id: "add-api-key",
    title: "Add your API key",
    description: "Configure the SDK with your API key to start sending data.",
  },
  {
    id: "first-session",
    title: "Record your first session",
    description:
      "Run your agent and verify that session data appears in the dashboard.",
  },
  {
    id: "view-dashboard",
    title: "View the dashboard",
    description: "Explore your session traces, costs, and performance metrics.",
  },
  {
    id: "invite-team",
    title: "Invite your team",
    description: "Add team members to collaborate on agent observability.",
  },
];

export class OnboardingManager {
  private states = new Map<string, OnboardingState>();

  /**
   * Initialize onboarding for a new tenant with default steps.
   */
  initOnboarding(tenantId: string): OnboardingState {
    const steps: OnboardingStep[] = DEFAULT_ONBOARDING_STEPS.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      completed: false,
    }));

    const state: OnboardingState = {
      tenantId,
      steps,
      currentStep: 0,
    };

    this.states.set(tenantId, state);
    return state;
  }

  /**
   * Mark an onboarding step as completed.
   */
  completeStep(tenantId: string, stepId: string): OnboardingState {
    const state = this.states.get(tenantId);
    if (!state) {
      throw new Error(`Onboarding not found for tenant: ${tenantId}`);
    }

    const stepIndex = state.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Onboarding step not found: ${stepId}`);
    }

    state.steps[stepIndex].completed = true;
    state.steps[stepIndex].completedAt = Date.now();

    // Advance currentStep to the next incomplete step
    const nextIncomplete = state.steps.findIndex((s) => !s.completed);
    state.currentStep =
      nextIncomplete === -1 ? state.steps.length : nextIncomplete;

    // Mark onboarding as fully completed if all steps are done
    const allCompleted = state.steps.every((s) => s.completed);
    if (allCompleted && !state.completedAt) {
      state.completedAt = Date.now();
    }

    this.states.set(tenantId, state);
    return state;
  }

  /**
   * Get the current onboarding state for a tenant.
   */
  getState(tenantId: string): OnboardingState | undefined {
    return this.states.get(tenantId);
  }
}
