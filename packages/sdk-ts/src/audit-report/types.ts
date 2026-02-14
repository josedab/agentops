/**
 * AgentOps SDK - Audit Report Types
 *
 * Types for compliance and audit report generation.
 */

/** Supported compliance frameworks */
export type ComplianceFramework =
  | "eu_ai_act"
  | "soc2"
  | "nist_ai_rmf"
  | "iso_42001";

/** Configuration for the audit report engine */
export interface AuditReportConfig {
  enabled: boolean;
  organizationName: string;
  frameworks: ComplianceFramework[];
  reportFormat: "json" | "csv" | "markdown";
  includeEvidence: boolean;
  debug?: boolean;
}

/** A single piece of evidence supporting a control assessment */
export interface EvidenceItem {
  id: string;
  type:
    | "session_trace"
    | "audit_log"
    | "pii_scan"
    | "guardrail_enforcement"
    | "security_incident"
    | "config_setting";
  description: string;
  reference: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/** A single compliance control */
export interface Control {
  id: string;
  name: string;
  description: string;
  status: "met" | "partial" | "not_met" | "not_applicable";
  evidence: EvidenceItem[];
  notes: string;
}

/** A section within a compliance report */
export interface ReportSection {
  id: string;
  title: string;
  description: string;
  controls: Control[];
  score: number;
  status: "compliant" | "partial" | "non_compliant";
}

/** A gap identified during compliance assessment */
export interface ComplianceGap {
  controlId: string;
  framework: ComplianceFramework;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  remediation: string;
  deadline?: number;
}

/** Full audit report for a compliance framework */
export interface AuditReport {
  id: string;
  framework: ComplianceFramework;
  organizationName: string;
  generatedAt: number;
  period: { start: number; end: number };
  sections: ReportSection[];
  overallScore: number;
  status: "compliant" | "partial" | "non_compliant";
  gaps: ComplianceGap[];
  recommendations: string[];
}

/** Score for a single framework in a posture assessment */
export interface PostureScore {
  framework: ComplianceFramework;
  score: number;
  status: "compliant" | "partial" | "non_compliant";
  gaps: number;
  lastAssessed: number;
}

/** Overall compliance posture across frameworks */
export interface CompliancePosture {
  frameworks: Map<ComplianceFramework, PostureScore>;
  totalControls: number;
  metControls: number;
  partialControls: number;
  notMetControls: number;
  lastAssessed: number;
}

/** Data source information for audit report generation */
export interface AuditDataSource {
  sessionTraces: { count: number; dateRange: { start: number; end: number } };
  auditLogs: { count: number; dateRange: { start: number; end: number } };
  piiScans: { count: number; violations: number };
  guardrailEnforcements: { count: number; blocked: number };
  securityIncidents: { count: number; resolved: number };
  configChanges: { count: number };
}

/** Metrics tracked by the audit report engine */
export interface AuditReportMetrics {
  reportsGenerated: number;
  frameworksCovered: number;
  totalGapsIdentified: number;
  avgComplianceScore: number;
  lastReportGenerated: number | null;
}
