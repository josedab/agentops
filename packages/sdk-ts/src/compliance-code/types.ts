/**
 * AgentOps SDK - Compliance-as-Code Types
 *
 * @packageDocumentation
 */

export interface ComplianceCodeConfig {
  enabled?: boolean;
  defaultFramework?: string;
  autoEvidence?: boolean;
  debug?: boolean;
}

export interface ResolvedComplianceCodeConfig {
  enabled: boolean;
  defaultFramework: string;
  autoEvidence: boolean;
  debug: boolean;
}

export interface CompliancePolicy {
  id: string;
  name: string;
  framework: string; // 'soc2', 'hipaa', 'gdpr', 'pci-dss', 'iso27001', 'custom'
  version: string;
  rules: ComplianceRule[];
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

export interface ComplianceRule {
  id: string;
  policyId: string;
  name: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  condition: RuleCondition;
  remediation: string;
  enabled: boolean;
}

export interface RuleCondition {
  type: "field_required" | "field_matches" | "field_range" | "custom";
  field?: string;
  operator?:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "greater_than"
    | "less_than"
    | "regex";
  value?: unknown;
  customFn?: string;
}

export interface ComplianceCheck {
  id: string;
  policyId: string;
  ruleId: string;
  targetType: string;
  targetId: string;
  status: "pass" | "fail" | "warning" | "skip";
  message: string;
  evidence: EvidenceItem[];
  checkedAt: number;
}

export interface EvidenceItem {
  id: string;
  checkId: string;
  type: "log" | "config" | "audit_trail" | "screenshot" | "metric" | "document";
  description: string;
  data: Record<string, unknown>;
  collectedAt: number;
}

export interface ComplianceReport {
  id: string;
  policyId: string;
  generatedAt: number;
  period: { start: number; end: number };
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  complianceScore: number;
  status: "compliant" | "non_compliant" | "partial";
  checksByCategory: Record<
    string,
    { passed: number; failed: number; total: number }
  >;
  checksBySeverity: Record<
    string,
    { passed: number; failed: number; total: number }
  >;
  findings: ComplianceFinding[];
}

export interface ComplianceFinding {
  ruleId: string;
  ruleName: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  failedChecks: number;
  remediation: string;
  evidence: EvidenceItem[];
}

export interface PolicyTemplate {
  id: string;
  framework: string;
  name: string;
  description: string;
  rules: Omit<ComplianceRule, "id" | "policyId">[];
}

export interface ComplianceGate {
  id: string;
  policyId: string;
  name: string;
  stage: "pre_deploy" | "runtime" | "post_deploy";
  enforced: boolean;
  requiredScore: number;
  status: "pending" | "passed" | "failed" | "bypassed";
  result: ComplianceReport | null;
  evaluatedAt: number | null;
}

export interface ComplianceCodeMetrics {
  totalPolicies: number;
  totalRules: number;
  totalChecks: number;
  overallComplianceScore: number;
  checksByStatus: Record<string, number>;
  gatePassRate: number;
  topViolations: { ruleId: string; ruleName: string; count: number }[];
}
