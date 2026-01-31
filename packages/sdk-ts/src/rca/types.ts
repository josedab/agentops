/**
 * AgentOps SDK - RCA Types
 *
 * Type definitions for Root Cause Analysis.
 * Extracted for better organization and reusability.
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface RCAConfig {
  /** Enable RCA features */
  enabled: boolean;
  /** Minimum samples for pattern detection */
  minSamplesForPattern?: number;
  /** Similarity threshold for clustering (0-1) */
  similarityThreshold?: number;
  /** Maximum age of events to analyze (ms) */
  maxEventAge?: number;
  /** Enable automatic remediation suggestions */
  autoSuggestRemediation?: boolean;
  /** Callback when pattern is detected */
  onPatternDetected?: (pattern: FailurePattern) => void;
  /** Callback when root cause is identified */
  onRootCauseIdentified?: (analysis: RootCauseAnalysis) => void;
}

export interface ResolvedRCAConfig extends Required<
  Omit<RCAConfig, "onPatternDetected" | "onRootCauseIdentified">
> {
  onPatternDetected?: (pattern: FailurePattern) => void;
  onRootCauseIdentified?: (analysis: RootCauseAnalysis) => void;
}

// ============================================================================
// Event Types
// ============================================================================

export interface FailureEvent {
  id: string;
  timestamp: number;
  sessionId: string;
  featureId?: string;
  userId?: string;
  model?: string;
  /** Error type/code */
  errorType: string;
  /** Error message */
  errorMessage: string;
  /** Stack trace if available */
  stackTrace?: string;
  /** Tool that failed (if applicable) */
  toolName?: string;
  /** Tool input */
  toolInput?: unknown;
  /** Prompt content */
  prompt?: string;
  /** Response content (if partial) */
  response?: string;
  /** Duration before failure (ms) */
  durationMs?: number;
  /** Token count before failure */
  tokenCount?: number;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Tags */
  tags?: string[];
}

// ============================================================================
// Pattern Types
// ============================================================================

export interface FailurePattern {
  id: string;
  /** Pattern name */
  name: string;
  /** Pattern description */
  description: string;
  /** Pattern type */
  type: PatternType;
  /** Number of occurrences */
  occurrenceCount: number;
  /** Percentage of total failures */
  prevalence: number;
  /** First occurrence */
  firstSeen: number;
  /** Last occurrence */
  lastSeen: number;
  /** Common attributes in this pattern */
  commonAttributes: PatternAttribute[];
  /** Sample event IDs */
  sampleEventIds: string[];
  /** Severity */
  severity: "low" | "medium" | "high" | "critical";
  /** Trend */
  trend: "increasing" | "stable" | "decreasing";
  /** Is actively occurring */
  isActive: boolean;
  createdAt: number;
}

export type PatternType =
  | "error_cluster"
  | "rate_limit"
  | "timeout"
  | "model_issue"
  | "tool_failure"
  | "prompt_issue"
  | "context_overflow"
  | "quality_degradation"
  | "unknown";

export interface PatternAttribute {
  name: string;
  value: string | number | boolean;
  frequency: number;
  correlation: number;
}

// ============================================================================
// Root Cause Analysis Types
// ============================================================================

export interface RootCauseAnalysis {
  id: string;
  /** Pattern this analysis is for */
  patternId: string;
  /** Identified root causes (ordered by likelihood) */
  rootCauses: RootCause[];
  /** Confidence in the analysis */
  confidence: number;
  /** Evidence supporting the analysis */
  evidence: Evidence[];
  /** Contributing factors */
  contributingFactors: ContributingFactor[];
  /** Timeline of related events */
  timeline: TimelineEvent[];
  /** Analysis timestamp */
  analyzedAt: number;
}

export interface RootCause {
  id: string;
  /** Root cause description */
  description: string;
  /** Cause category */
  category: CauseCategory;
  /** Probability this is the actual cause */
  probability: number;
  /** How this was determined */
  reasoning: string;
  /** Affected components */
  affectedComponents: string[];
  /** Impact level */
  impact: "low" | "medium" | "high" | "critical";
}

export type CauseCategory =
  | "infrastructure"
  | "model_provider"
  | "rate_limiting"
  | "prompt_design"
  | "tool_configuration"
  | "data_quality"
  | "context_management"
  | "api_changes"
  | "external_service"
  | "unknown";

export interface Evidence {
  type: "correlation" | "temporal" | "statistical" | "pattern" | "user_report";
  description: string;
  strength: number;
  data?: unknown;
}

export interface ContributingFactor {
  factor: string;
  contribution: number;
  isActionable: boolean;
}

export interface TimelineEvent {
  timestamp: number;
  eventType: "failure" | "change" | "recovery" | "spike";
  description: string;
  relatedEventId?: string;
}

// ============================================================================
// Remediation Types
// ============================================================================

export interface Remediation {
  id: string;
  /** Remediation title */
  title: string;
  /** Detailed description */
  description: string;
  /** Priority */
  priority: "low" | "medium" | "high" | "critical";
  /** Remediation type */
  type: RemediationType;
  /** Specific steps to take */
  steps: RemediationStep[];
  /** Estimated time to implement */
  estimatedEffort: "minutes" | "hours" | "days" | "weeks";
  /** Expected impact */
  expectedImpact: string;
  /** Risk of implementing */
  implementationRisk: "low" | "medium" | "high";
  /** Whether this can be automated */
  canAutomate: boolean;
  /** Pattern this addresses */
  patternId: string;
  /** Root cause this addresses */
  rootCauseId?: string;
  createdAt: number;
  status: "suggested" | "in_progress" | "completed" | "rejected";
}

export type RemediationType =
  | "config_change"
  | "code_fix"
  | "prompt_update"
  | "rate_limit_adjustment"
  | "model_switch"
  | "retry_logic"
  | "cache_configuration"
  | "monitoring_alert"
  | "escalation"
  | "manual_intervention";

export interface RemediationStep {
  order: number;
  action: string;
  details?: string;
  automated: boolean;
  command?: string;
  verification?: string;
}

// ============================================================================
// Report Types
// ============================================================================

export interface RCAReport {
  id: string;
  /** Report period */
  period: { start: number; end: number };
  /** Summary statistics */
  summary: {
    totalFailures: number;
    uniquePatterns: number;
    identifiedRootCauses: number;
    suggestedRemediations: number;
    mttr: number; // Mean time to resolution
  };
  /** Top patterns by impact */
  topPatterns: FailurePattern[];
  /** Active root causes */
  activeRootCauses: RootCause[];
  /** Recommended actions */
  recommendedActions: Remediation[];
  /** Health score (0-100) */
  healthScore: number;
  generatedAt: number;
}
