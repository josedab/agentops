/**
 * AgentOps SDK - Cost Guardrails Types
 *
 * Type definitions for real-time cost limits and budget enforcement.
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface GuardrailsConfig {
  /** Enable guardrails */
  enabled: boolean;
  /** Default session cost limit (USD) */
  defaultSessionLimit?: number;
  /** Default user cost limit per time window (USD) */
  defaultUserLimit?: number;
  /** Default user limit time window (ms, default: 1 hour) */
  defaultUserLimitWindow?: number;
  /** Global cost limit per time window (USD) */
  globalLimit?: number;
  /** Global limit time window (ms, default: 1 hour) */
  globalLimitWindow?: number;
  /** Action when limit is reached */
  defaultAction?: GuardrailAction;
  /** Warning threshold (percentage of limit, 0-1) */
  warningThreshold?: number;
  /** Enable adaptive limits based on historical usage */
  enableAdaptiveLimits?: boolean;
  /** Callback when warning threshold reached */
  onWarning?: (event: GuardrailWarning) => void;
  /** Callback when limit is enforced */
  onLimitEnforced?: (event: GuardrailEnforcement) => void;
  /** Callback when limit is updated */
  onLimitUpdated?: (event: LimitUpdate) => void;
}

export interface ResolvedGuardrailsConfig extends Required<
  Omit<
    GuardrailsConfig,
    "globalLimit" | "onWarning" | "onLimitEnforced" | "onLimitUpdated"
  >
> {
  globalLimit?: number;
  onWarning?: (event: GuardrailWarning) => void;
  onLimitEnforced?: (event: GuardrailEnforcement) => void;
  onLimitUpdated?: (event: LimitUpdate) => void;
}

export type GuardrailAction =
  | "warn" // Log warning but allow
  | "throttle" // Add delay to requests
  | "soft_block" // Block with override option
  | "hard_block"; // Block completely

// ============================================================================
// Limit Types
// ============================================================================

export interface CostLimit {
  /** Limit ID */
  id: string;
  /** Limit type */
  type: LimitType;
  /** Limit scope identifier */
  scopeId: string;
  /** Maximum cost (USD) */
  maxCost: number;
  /** Time window for rolling limits (ms, null = lifetime) */
  windowMs: number | null;
  /** Action when limit reached */
  action: GuardrailAction;
  /** Current spend within window */
  currentSpend: number;
  /** Window start time */
  windowStart: number;
  /** Is limit currently exceeded? */
  isExceeded: boolean;
  /** Is warning threshold reached? */
  isWarning: boolean;
  /** Created at */
  createdAt: number;
  /** Updated at */
  updatedAt: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export type LimitType =
  | "session" // Per-session limit
  | "user" // Per-user rolling window
  | "feature" // Per-feature rolling window
  | "model" // Per-model rolling window
  | "global"; // Global rolling window

export interface SessionLimit extends CostLimit {
  type: "session";
  sessionId: string;
}

export interface UserLimit extends CostLimit {
  type: "user";
  userId: string;
}

export interface FeatureLimit extends CostLimit {
  type: "feature";
  featureId: string;
}

export interface ModelLimit extends CostLimit {
  type: "model";
  model: string;
}

export interface GlobalLimit extends CostLimit {
  type: "global";
}

// ============================================================================
// Limit Configuration Types
// ============================================================================

export interface LimitConfig {
  /** Maximum cost (USD) */
  maxCost: number;
  /** Time window (ms), null for session lifetime */
  windowMs?: number | null;
  /** Action when exceeded */
  action?: GuardrailAction;
  /** Custom warning threshold (0-1) */
  warningThreshold?: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface SessionLimitConfig extends LimitConfig {
  sessionId: string;
}

export interface UserLimitConfig extends LimitConfig {
  userId: string;
  /** Per-session limit for this user */
  perSessionLimit?: number;
}

export interface FeatureLimitConfig extends LimitConfig {
  featureId: string;
}

export interface ModelLimitConfig extends LimitConfig {
  model: string;
}

// ============================================================================
// Event Types
// ============================================================================

export interface GuardrailWarning {
  /** Warning ID */
  id: string;
  /** Limit that triggered warning */
  limit: CostLimit;
  /** Current spend */
  currentSpend: number;
  /** Percentage of limit used */
  percentUsed: number;
  /** Estimated remaining budget */
  remaining: number;
  /** Projected overage (if current rate continues) */
  projectedOverage?: number;
  /** Timestamp */
  timestamp: number;
}

export interface GuardrailEnforcement {
  /** Enforcement ID */
  id: string;
  /** Limit that was enforced */
  limit: CostLimit;
  /** Action taken */
  action: GuardrailAction;
  /** Request that triggered enforcement */
  request: {
    sessionId: string;
    userId?: string;
    featureId?: string;
    model?: string;
    estimatedCost: number;
  };
  /** Reason for enforcement */
  reason: string;
  /** Was enforcement overridden? */
  overridden: boolean;
  /** Timestamp */
  timestamp: number;
}

export interface LimitUpdate {
  /** Limit that was updated */
  limit: CostLimit;
  /** Previous values */
  previous: {
    maxCost: number;
    action: GuardrailAction;
    windowMs: number | null;
  };
  /** Update reason */
  reason: "manual" | "adaptive" | "reset";
  /** Timestamp */
  timestamp: number;
}

// ============================================================================
// Cost Check Types
// ============================================================================

export interface CostCheckRequest {
  /** Session ID */
  sessionId: string;
  /** User ID (optional) */
  userId?: string;
  /** Feature ID (optional) */
  featureId?: string;
  /** Model being used */
  model?: string;
  /** Estimated cost of the request */
  estimatedCost: number;
  /** Allow override if soft-blocked */
  allowOverride?: boolean;
}

export interface CostCheckResult {
  /** Is the request allowed? */
  allowed: boolean;
  /** Action taken (if any) */
  action?: GuardrailAction;
  /** Limits that blocked/warned */
  triggeredLimits: CostLimit[];
  /** Warnings (if any) */
  warnings: GuardrailWarning[];
  /** If throttled, delay in ms */
  throttleDelayMs?: number;
  /** Message for user/logs */
  message?: string;
  /** Can be overridden? */
  canOverride: boolean;
}

// ============================================================================
// Tracking Types
// ============================================================================

export interface CostRecord {
  /** Record ID */
  id: string;
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId?: string;
  /** Feature ID */
  featureId?: string;
  /** Model used */
  model?: string;
  /** Cost (USD) */
  cost: number;
  /** Tokens used */
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** Timestamp */
  timestamp: number;
}

export interface SpendingSummary {
  /** Total spend */
  total: number;
  /** By session */
  bySession: Record<string, number>;
  /** By user */
  byUser: Record<string, number>;
  /** By feature */
  byFeature: Record<string, number>;
  /** By model */
  byModel: Record<string, number>;
  /** Time period */
  period: {
    start: number;
    end: number;
  };
}

// ============================================================================
// Adaptive Limit Types
// ============================================================================

export interface AdaptiveLimitConfig {
  /** Enable adaptive limits */
  enabled: boolean;
  /** Lookback period for historical data (ms) */
  lookbackPeriodMs?: number;
  /** Percentile to use for limit calculation */
  percentile?: number;
  /** Multiplier for calculated limit */
  multiplier?: number;
  /** Minimum limit (floor) */
  minLimit?: number;
  /** Maximum limit (ceiling) */
  maxLimit?: number;
  /** Update frequency (ms) */
  updateFrequencyMs?: number;
}

export interface AdaptiveLimitResult {
  /** Calculated limit */
  calculatedLimit: number;
  /** Historical average */
  historicalAverage: number;
  /** Historical percentile value */
  historicalPercentile: number;
  /** Sample size used */
  sampleSize: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reason for calculation */
  reason: string;
}

// ============================================================================
// Stats Types
// ============================================================================

export interface GuardrailStats {
  /** Total cost checks performed */
  totalChecks: number;
  /** Allowed requests */
  allowedRequests: number;
  /** Blocked requests */
  blockedRequests: number;
  /** Throttled requests */
  throttledRequests: number;
  /** Warnings issued */
  warningsIssued: number;
  /** Total cost tracked */
  totalCostTracked: number;
  /** Active limits */
  activeLimits: number;
  /** Limits exceeded (currently) */
  limitsExceeded: number;
}

// ============================================================================
// Cost Record Store Interface (Dependency Injection)
// ============================================================================

/**
 * Interface for cost record storage.
 * Implement this to provide custom storage (e.g., persistent DB).
 */
export interface CostRecordStore {
  /** Add a cost record */
  add(record: CostRecord): void;

  /** Query records by time range and optional filters */
  query(filter: CostRecordFilter): CostRecord[];

  /** Get records for a specific session */
  getBySession(sessionId: string): CostRecord[];

  /** Get records for a specific user */
  getByUser(userId: string, sinceMs?: number): CostRecord[];

  /** Get recent records within time window */
  getRecent(windowMs: number): CostRecord[];

  /** Get total count of records */
  count(): number;

  /** Clear all records */
  clear(): void;

  /** Prune old records beyond max count */
  prune(maxRecords: number): void;
}

/**
 * Filter options for querying cost records
 */
export interface CostRecordFilter {
  /** Start time (timestamp) */
  sinceMs?: number;
  /** End time (timestamp) */
  untilMs?: number;
  /** Filter by session */
  sessionId?: string;
  /** Filter by user */
  userId?: string;
  /** Filter by feature */
  featureId?: string;
  /** Filter by model */
  model?: string;
}
