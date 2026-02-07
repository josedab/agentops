/**
 * AgentOps SDK - Managed Cloud Platform Types
 *
 * Type definitions for multi-tenant platform, API key management,
 * usage tracking, rate limiting, and onboarding.
 */

// ============================================================================
// Plan Types & Defaults
// ============================================================================

export type PlanType = "free" | "pro" | "enterprise";

export type TenantStatus = "active" | "suspended" | "trial";

export const PLAN_DEFAULTS: Record<
  string,
  { events: number; sessions: number; retention: number; cost: number }
> = {
  free: { events: 50_000, sessions: 1_000, retention: 7, cost: 0 },
  pro: { events: 1_000_000, sessions: 25_000, retention: 30, cost: 99 },
  enterprise: {
    events: 10_000_000,
    sessions: 250_000,
    retention: 90,
    cost: 499,
  },
} as const;

// ============================================================================
// Tenant Types
// ============================================================================

export interface TenantSettings {
  /** Maximum events allowed per month */
  maxEventsPerMonth: number;

  /** Maximum concurrent sessions */
  maxSessions: number;

  /** Data retention period in days */
  retentionDays: number;

  /** Allowed LLM models (empty = all allowed) */
  allowedModels?: string[];

  /** Custom API endpoint override */
  customEndpoint?: string;
}

export interface Tenant {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** URL-safe slug */
  slug: string;

  /** Subscription plan */
  plan: PlanType;

  /** Account status */
  status: TenantStatus;

  /** Creation timestamp */
  createdAt: number;

  /** Tenant-specific settings */
  settings: TenantSettings;
}

// ============================================================================
// API Key Types
// ============================================================================

export interface APIKeyRecord {
  /** Hashed key value (SHA-256) */
  key: string;

  /** Owning tenant */
  tenantId: string;

  /** Human-readable name */
  name: string;

  /** First 8 characters for display (e.g., "agops_ab") */
  prefix: string;

  /** Granted permissions */
  permissions: string[];

  /** Creation timestamp */
  createdAt: number;

  /** Last time this key was used */
  lastUsedAt?: number;

  /** Expiration timestamp */
  expiresAt?: number;

  /** Whether the key has been revoked */
  revoked: boolean;
}

export interface APIKeyValidationResult {
  /** Whether the key is valid */
  valid: boolean;

  /** Tenant the key belongs to */
  tenantId?: string;

  /** Permissions granted by the key */
  permissions?: string[];

  /** Error message if invalid */
  error?: string;
}

// ============================================================================
// Usage Tracking Types
// ============================================================================

export interface UsageRecord {
  /** Tenant identifier */
  tenantId: string;

  /** Billing period (YYYY-MM format) */
  period: string;

  /** Total events ingested */
  eventsCount: number;

  /** Total sessions created */
  sessionsCount: number;

  /** Total tokens consumed */
  tokensUsed: number;

  /** Estimated cost in USD */
  estimatedCost: number;
}

export interface UsageLimits {
  /** Maximum events per month */
  maxEventsPerMonth: number;

  /** Maximum sessions per month */
  maxSessionsPerMonth: number;

  /** Maximum cost per month in USD */
  maxCostPerMonth: number;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;

  /** Maximum requests in the window */
  maxRequests: number;

  /** Burst size for short spikes */
  burstSize: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;

  /** Remaining requests in the current window */
  remaining: number;

  /** When the current window resets (timestamp) */
  resetAt: number;

  /** Seconds to wait before retrying (if not allowed) */
  retryAfter?: number;
}

// ============================================================================
// Onboarding Types
// ============================================================================

export interface OnboardingStep {
  /** Step identifier */
  id: string;

  /** Display title */
  title: string;

  /** Description of what to do */
  description: string;

  /** Whether the step is completed */
  completed: boolean;

  /** Completion timestamp */
  completedAt?: number;
}

export interface OnboardingState {
  /** Tenant this onboarding belongs to */
  tenantId: string;

  /** Ordered list of onboarding steps */
  steps: OnboardingStep[];

  /** When all steps were completed */
  completedAt?: number;

  /** Index of the current step to complete */
  currentStep: number;
}

// ============================================================================
// Platform Configuration
// ============================================================================

export interface PlatformConfig {
  /** Default plan for new tenants */
  defaultPlan: PlanType;

  /** Number of days for trial period */
  trialDays: number;

  /** Rate limits per plan */
  rateLimits: Record<PlanType, RateLimitConfig>;

  /** Usage limits per plan */
  usageLimits: Record<PlanType, UsageLimits>;
}
