/**
 * AgentOps SDK - Security & Safety Monitor Types
 *
 * Type definitions for security scanning, threat detection,
 * PII detection, and safety policy enforcement.
 */

// ============================================================================
// Threat Detection Types
// ============================================================================

/** Types of threats that can be detected */
export type ThreatType =
  | "prompt_injection"
  | "jailbreak"
  | "data_exfiltration"
  | "pii_leakage"
  | "policy_violation"
  | "toxic_content"
  | "unauthorized_access";

/** Severity levels for detected threats */
export type ThreatSeverity = "low" | "medium" | "high" | "critical";

/** A single threat detection result */
export interface ThreatDetection {
  /** Unique identifier for this detection */
  id: string;

  /** The type of threat detected */
  type: ThreatType;

  /** How severe the threat is */
  severity: ThreatSeverity;

  /** Human-readable description of the threat */
  description: string;

  /** The evidence string that triggered detection */
  evidence: string;

  /** Confidence score between 0 and 1 */
  score: number;

  /** When the threat was detected (epoch ms) */
  timestamp: number;

  /** Optional session ID associated with the threat */
  sessionId?: string;

  /** Optional additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Security Policy Types
// ============================================================================

/** A condition that a policy rule evaluates */
export interface RuleCondition {
  /** The comparison operator */
  operator: "contains" | "matches" | "exceeds" | "custom";

  /** The value to compare against */
  value: string | number | RegExp;

  /** Which field to evaluate */
  field: "input" | "output" | "model" | "tool";
}

/** A single rule within a security policy */
export interface PolicyRule {
  /** Unique identifier for this rule */
  id: string;

  /** The type of threat this rule detects */
  type: ThreatType;

  /** The condition to evaluate */
  condition: RuleCondition;

  /** What action to take when the rule is triggered */
  action: "block" | "warn" | "log";

  /** Human-readable message when the rule is triggered */
  message: string;
}

/** A security policy containing one or more rules */
export interface SecurityPolicy {
  /** Unique identifier for this policy */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this policy enforces */
  description: string;

  /** The rules that make up this policy */
  rules: PolicyRule[];

  /** Whether this policy is currently active */
  enabled: boolean;

  /** Default action for the policy */
  action: "block" | "warn" | "log";

  /** When the policy was created (epoch ms) */
  createdAt: number;
}

/** A record of a policy violation */
export interface PolicyViolation {
  /** Unique identifier for this violation */
  id: string;

  /** The policy that was violated */
  policyId: string;

  /** The specific rule that was violated */
  ruleId: string;

  /** The type of threat that triggered the violation */
  threatType: ThreatType;

  /** Truncated content that violated the policy */
  content: string;

  /** The action that was taken */
  action: "blocked" | "warned" | "logged";

  /** When the violation occurred (epoch ms) */
  timestamp: number;

  /** Optional session ID associated with the violation */
  sessionId?: string;
}

// ============================================================================
// Security Scan Types
// ============================================================================

/** Result of a full security scan */
export interface SecurityScanResult {
  /** The input that was scanned */
  input: string;

  /** All threats detected */
  threats: ThreatDetection[];

  /** Whether the content was blocked */
  blocked: boolean;

  /** Sanitized version of the content (if applicable) */
  sanitizedContent?: string;

  /** How long the scan took in milliseconds */
  scanDurationMs: number;
}

// ============================================================================
// PII Detection Types
// ============================================================================

/** A single PII entity found in content */
export interface PIIEntity {
  /** The type of PII found */
  type:
    | "email"
    | "phone"
    | "ssn"
    | "credit_card"
    | "api_key"
    | "ip_address"
    | "name"
    | "address";

  /** The matched PII value */
  value: string;

  /** Start index of the match in the original string */
  startIndex: number;

  /** End index of the match in the original string */
  endIndex: number;

  /** Confidence score between 0 and 1 */
  confidence: number;
}

/** Result of a PII scan */
export interface PIIScanResult {
  /** The content that was scanned */
  content: string;

  /** All PII entities found */
  entities: PIIEntity[];

  /** Content with PII redacted */
  redactedContent: string;

  /** Total number of PII entities found */
  entityCount: number;
}

// ============================================================================
// Incident Management Types
// ============================================================================

/** A security incident aggregating one or more detections */
export interface SecurityIncident {
  /** Unique identifier for this incident */
  id: string;

  /** The primary threat type */
  type: ThreatType;

  /** The overall severity */
  severity: ThreatSeverity;

  /** All detections associated with this incident */
  detections: ThreatDetection[];

  /** Current status of the incident */
  status: "open" | "investigating" | "resolved" | "false_positive";

  /** When the incident was created (epoch ms) */
  createdAt: number;

  /** When the incident was resolved (epoch ms) */
  resolvedAt?: number;

  /** Who resolved the incident */
  resolvedBy?: string;
}

// ============================================================================
// Dashboard & Statistics Types
// ============================================================================

/** Aggregated security dashboard data */
export interface SecurityDashboard {
  /** Total number of scans performed */
  totalScans: number;

  /** Total number of threats detected */
  threatsDetected: number;

  /** Breakdown of threats by type */
  threatsByType: Record<ThreatType, number>;

  /** Breakdown of threats by severity */
  threatsBySeverity: Record<ThreatSeverity, number>;

  /** Number of active policies */
  policiesActive: number;

  /** Total number of policy violations */
  policyViolations: number;

  /** Most recent incidents */
  recentIncidents: SecurityIncident[];

  /** Top threats by score */
  topThreats: ThreatDetection[];
}

// ============================================================================
// Configuration Types
// ============================================================================

/** Configuration for the security monitor */
export interface SecurityConfig {
  /** Whether security scanning is enabled */
  enabled: boolean;

  /** Operating mode: enforce blocks, shadow logs only, monitor warns */
  mode: "enforce" | "shadow" | "monitor";

  /** Policies to load at initialization */
  policies?: SecurityPolicy[];

  /** Whether to scan inputs */
  scanInputs?: boolean;

  /** Whether to scan outputs */
  scanOutputs?: boolean;

  /** Whether to detect PII */
  piiDetection?: boolean;

  /** Whether to redact detected PII */
  piiRedaction?: boolean;

  /** Maximum content length to scan (truncate beyond this) */
  maxContentLength?: number;
}
