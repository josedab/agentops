/**
 * AgentOps SDK - Prompt Firewall Types
 *
 * Type definitions for prompt security scanning and threat detection.
 *
 * @packageDocumentation
 */

// ============================================================================
// Configuration
// ============================================================================

export type FirewallMode = "monitor" | "enforce" | "block";

export interface FirewallConfig {
  /** Enable the firewall */
  enabled: boolean;

  /** Operating mode */
  mode?: FirewallMode;

  /** Custom attack patterns to add */
  patterns?: AttackPattern[];

  /** Sensitivity level */
  sensitivity?: "low" | "medium" | "high";

  /** Patterns to always allow (bypass) */
  allowList?: string[];

  /** Callback when a threat is detected */
  onThreatDetected?: (threat: ThreatIncident) => void;

  /** Callback when content is blocked */
  onBlocked?: (incident: ThreatIncident) => void;

  /** Maximum content length to scan */
  maxContentLength?: number;

  /** Enable debug logging */
  debug?: boolean;
}

export interface ResolvedFirewallConfig {
  enabled: boolean;
  mode: FirewallMode;
  patterns: AttackPattern[];
  sensitivity: "low" | "medium" | "high";
  allowList: string[];
  onThreatDetected?: (threat: ThreatIncident) => void;
  onBlocked?: (incident: ThreatIncident) => void;
  maxContentLength: number;
  debug: boolean;
}

// ============================================================================
// Attack Patterns
// ============================================================================

export type AttackCategory =
  | "prompt_injection"
  | "jailbreak"
  | "data_exfiltration"
  | "role_manipulation"
  | "instruction_override"
  | "encoding_attack"
  | "context_manipulation"
  | "custom";

export type ThreatSeverity = "critical" | "high" | "medium" | "low";

export interface AttackPattern {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of the pattern */
  description: string;

  /** Attack category */
  category: AttackCategory;

  /** Regex pattern string */
  pattern: string;

  /** Threat severity */
  severity: ThreatSeverity;

  /** Whether this pattern is enabled */
  enabled: boolean;
}

// ============================================================================
// Incidents
// ============================================================================

export interface ThreatIncident {
  /** Unique incident identifier */
  id: string;

  /** When the incident occurred */
  timestamp: number;

  /** Associated session */
  sessionId?: string;

  /** The flagged prompt content (truncated) */
  content: string;

  /** Patterns that matched */
  matchedPatterns: PatternMatch[];

  /** Highest severity of all matches */
  severity: ThreatSeverity;

  /** Action taken */
  action: "allowed" | "flagged" | "sanitized" | "blocked";

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface PatternMatch {
  /** Pattern identifier */
  patternId: string;

  /** Pattern name */
  patternName: string;

  /** Attack category */
  category: AttackCategory;

  /** Threat severity */
  severity: ThreatSeverity;

  /** The text that matched */
  matchedText: string;

  /** Position of the match */
  position: { start: number; end: number };
}

// ============================================================================
// Scan Results
// ============================================================================

export interface ScanResult {
  /** Whether the content is safe */
  safe: boolean;

  /** Detected threats */
  threats: PatternMatch[];

  /** Highest severity (null if safe) */
  severity: ThreatSeverity | null;

  /** Action taken */
  action: "allowed" | "flagged" | "sanitized" | "blocked";

  /** Sanitized content (if applicable) */
  sanitizedContent: string | null;

  /** Time taken to scan in ms */
  scanDurationMs: number;
}

// ============================================================================
// Metrics
// ============================================================================

export interface FirewallMetrics {
  /** Total scans performed */
  totalScans: number;

  /** Total threats detected */
  threatsDetected: number;

  /** Number of blocked requests */
  blocked: number;

  /** Number of flagged requests */
  flagged: number;

  /** Number of sanitized requests */
  sanitized: number;

  /** Number of allowed requests */
  allowed: number;

  /** Number of false positives reported */
  falsePositivesReported: number;

  /** Average scan duration in ms */
  avgScanDurationMs: number;

  /** Top attack categories */
  topCategories: { category: AttackCategory; count: number }[];

  /** Recent incident history (last 100) */
  incidentHistory: ThreatIncident[];
}
