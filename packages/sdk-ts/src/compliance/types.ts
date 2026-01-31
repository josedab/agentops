/**
 * AgentOps SDK - Compliance & Audit Types
 *
 * Type definitions for compliance and audit features.
 */

// ============================================================================
// PII Detection Types
// ============================================================================

export type PIIType =
  | "email"
  | "phone"
  | "ssn"
  | "credit_card"
  | "ip_address"
  | "name"
  | "address"
  | "date_of_birth"
  | "passport"
  | "driver_license"
  | "bank_account"
  | "api_key"
  | "password"
  | "custom";

export interface PIIMatch {
  type: PIIType;
  value: string;
  maskedValue: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface PIIScanResult {
  /** Whether PII was detected */
  hasPII: boolean;

  /** List of PII matches */
  matches: PIIMatch[];

  /** Sanitized content (with PII masked) */
  sanitizedContent: string;

  /** Original content */
  originalContent: string;

  /** Scan timestamp */
  scannedAt: number;
}

// ============================================================================
// Audit Log Types
// ============================================================================

export type AuditAction =
  | "session_start"
  | "session_end"
  | "prompt_sent"
  | "response_received"
  | "tool_called"
  | "error_occurred"
  | "config_changed"
  | "data_exported"
  | "data_deleted"
  | "user_accessed"
  | "share_created"
  | "pii_detected"
  | "policy_violated";

export interface AuditLogEntry {
  /** Unique identifier */
  id: string;

  /** Action performed */
  action: AuditAction;

  /** Actor who performed the action */
  actor: {
    type: "user" | "system" | "api";
    id: string;
    name?: string;
    ip?: string;
  };

  /** Resource affected */
  resource: {
    type: "session" | "event" | "config" | "data" | "user";
    id: string;
  };

  /** Action details */
  details: Record<string, unknown>;

  /** Timestamp */
  timestamp: number;

  /** Result of the action */
  result: "success" | "failure" | "denied";

  /** Reason for failure/denial */
  reason?: string;

  /** Request metadata */
  requestMetadata?: {
    userAgent?: string;
    ip?: string;
    location?: string;
  };
}

// ============================================================================
// Policy Types
// ============================================================================

export interface CompliancePolicy {
  /** Policy identifier */
  id: string;

  /** Policy name */
  name: string;

  /** Description */
  description: string;

  /** Whether policy is enabled */
  enabled: boolean;

  /** Policy rules */
  rules: PolicyRule[];

  /** Actions to take on violation */
  enforcementActions: EnforcementAction[];

  /** Severity of violation */
  severity: "low" | "medium" | "high" | "critical";
}

export interface PolicyRule {
  /** Rule type */
  type: "content" | "metadata" | "rate" | "access" | "retention";

  /** Rule condition */
  condition: {
    field?: string;
    operator: "contains" | "not_contains" | "matches" | "exceeds" | "equals";
    value: string | number | RegExp;
  };

  /** Target to check */
  target: "prompt" | "response" | "metadata" | "session" | "all";
}

export type EnforcementAction =
  | { type: "block"; message: string }
  | { type: "warn"; message: string }
  | { type: "redact" }
  | { type: "audit" }
  | { type: "notify"; recipients: string[] };

export interface PolicyViolation {
  id: string;
  policyId: string;
  policyName: string;
  ruleIndex: number;
  severity: CompliancePolicy["severity"];
  description: string;
  violatingContent?: string;
  sessionId?: string;
  eventId?: string;
  timestamp: number;
  actionsTriggered: EnforcementAction[];
}

// ============================================================================
// Retention Types
// ============================================================================

export interface RetentionPolicy {
  /** Policy identifier */
  id: string;

  /** Policy name */
  name: string;

  /** Data type this applies to */
  dataType: "sessions" | "events" | "audit_logs" | "all";

  /** Retention period in days */
  retentionDays: number;

  /** Action when retention expires */
  expirationAction: "delete" | "archive" | "anonymize";

  /** Whether to retain on legal hold */
  respectLegalHold: boolean;

  /** Filter for specific data */
  filter?: {
    tags?: string[];
    featureIds?: string[];
    userIds?: string[];
  };
}

export interface DataDeletionRequest {
  id: string;
  type: "user" | "session" | "date_range";
  targetId?: string;
  dateRange?: { start: number; end: number };
  requestedBy: string;
  requestedAt: number;
  status: "pending" | "processing" | "completed" | "failed";
  completedAt?: number;
  deletedCount?: number;
  error?: string;
}

// ============================================================================
// Export Types
// ============================================================================

export interface DataExportRequest {
  id: string;
  type: "user_data" | "sessions" | "audit_logs" | "full";
  format: "json" | "csv" | "parquet";
  filter?: {
    startDate?: number;
    endDate?: number;
    userId?: string;
    sessionIds?: string[];
  };
  requestedBy: string;
  requestedAt: number;
  status: "pending" | "processing" | "completed" | "failed" | "expired";
  downloadUrl?: string;
  expiresAt?: number;
  completedAt?: number;
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

export interface ComplianceConfig {
  /** Enable compliance features */
  enabled: boolean;

  /** Enable PII detection */
  enablePIIDetection?: boolean;

  /** PII types to detect */
  piiTypes?: PIIType[];

  /** Auto-redact detected PII */
  autoRedactPII?: boolean;

  /** Enable audit logging */
  enableAuditLog?: boolean;

  /** Compliance policies */
  policies?: CompliancePolicy[];

  /** Retention policies */
  retentionPolicies?: RetentionPolicy[];

  /** Callback on policy violation */
  onViolation?: (violation: PolicyViolation) => void;

  /** Callback on PII detection */
  onPIIDetected?: (result: PIIScanResult) => void;
}
