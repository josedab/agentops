/**
 * AgentOps SDK - Compliance-as-Code Engine
 *
 * Policy-driven compliance checking, reporting, and CI/CD gate enforcement
 * for AI agent systems.
 *
 * @packageDocumentation
 */

import type {
  ComplianceCodeConfig,
  ResolvedComplianceCodeConfig,
  CompliancePolicy,
  ComplianceRule,
  RuleCondition,
  ComplianceCheck,
  EvidenceItem,
  ComplianceReport,
  ComplianceFinding,
  PolicyTemplate,
  ComplianceGate,
  ComplianceCodeMetrics,
} from "./types.js";
import { generateEventId, now } from "../utils.js";

export type {
  ComplianceCodeConfig,
  ResolvedComplianceCodeConfig,
  CompliancePolicy,
  ComplianceRule,
  RuleCondition,
  ComplianceCheck,
  EvidenceItem,
  ComplianceReport,
  ComplianceFinding,
  PolicyTemplate,
  ComplianceGate,
  ComplianceCodeMetrics,
} from "./types.js";

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: ResolvedComplianceCodeConfig = {
  enabled: true,
  defaultFramework: "soc2",
  autoEvidence: true,
  debug: false,
};

// ============================================================================
// ComplianceCodeEngine
// ============================================================================

export class ComplianceCodeEngine {
  private readonly config: ResolvedComplianceCodeConfig;
  private readonly policies = new Map<string, CompliancePolicy>();
  private readonly checks = new Map<string, ComplianceCheck>();
  private readonly gates = new Map<string, ComplianceGate>();
  private readonly reports = new Map<string, ComplianceReport>();
  private readonly templates = new Map<string, PolicyTemplate>();

  constructor(config: ComplianceCodeConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeTemplates();
  }

  // ==========================================================================
  // Templates
  // ==========================================================================

  private initializeTemplates(): void {
    const soc2Template: PolicyTemplate = {
      id: generateEventId(),
      framework: "soc2",
      name: "SOC 2 Type II Basic Controls",
      description: "Basic SOC 2 compliance controls for AI systems",
      rules: [
        {
          name: "Audit Logging Required",
          description: "All agent actions must be logged",
          severity: "critical",
          category: "audit-logging",
          condition: { type: "field_required", field: "auditLog" },
          remediation: "Enable audit logging for all agent actions",
          enabled: true,
        },
        {
          name: "PII Detection",
          description: "PII must not be present in unencrypted fields",
          severity: "high",
          category: "data-protection",
          condition: {
            type: "field_matches",
            field: "containsPII",
            operator: "equals",
            value: false,
          },
          remediation: "Encrypt or redact PII from agent outputs",
          enabled: true,
        },
        {
          name: "Access Control",
          description: "All sessions must have authenticated user",
          severity: "high",
          category: "access-control",
          condition: { type: "field_required", field: "userId" },
          remediation: "Ensure all sessions are authenticated",
          enabled: true,
        },
        {
          name: "Data Retention Policy",
          description: "Data retention must be configured",
          severity: "medium",
          category: "data-protection",
          condition: { type: "field_required", field: "retentionDays" },
          remediation: "Configure data retention policy",
          enabled: true,
        },
      ],
    };
    this.templates.set(soc2Template.id, soc2Template);

    const hipaaTemplate: PolicyTemplate = {
      id: generateEventId(),
      framework: "hipaa",
      name: "HIPAA Basic Safeguards",
      description: "Basic HIPAA compliance for healthcare AI",
      rules: [
        {
          name: "PHI Encryption",
          description: "PHI must be encrypted at rest and in transit",
          severity: "critical",
          category: "encryption",
          condition: {
            type: "field_matches",
            field: "encrypted",
            operator: "equals",
            value: true,
          },
          remediation: "Enable encryption for all PHI data",
          enabled: true,
        },
        {
          name: "Access Audit Trail",
          description: "All PHI access must be logged",
          severity: "critical",
          category: "audit-logging",
          condition: { type: "field_required", field: "accessLog" },
          remediation: "Enable access audit logging",
          enabled: true,
        },
        {
          name: "Minimum Necessary",
          description: "Only minimum necessary PHI should be accessed",
          severity: "high",
          category: "data-protection",
          condition: { type: "field_required", field: "dataScope" },
          remediation: "Implement minimum necessary access controls",
          enabled: true,
        },
      ],
    };
    this.templates.set(hipaaTemplate.id, hipaaTemplate);
  }

  // ==========================================================================
  // Policy Management
  // ==========================================================================

  createPolicy(options: {
    name: string;
    framework?: string;
    metadata?: Record<string, unknown>;
  }): CompliancePolicy {
    const policy: CompliancePolicy = {
      id: generateEventId(),
      name: options.name,
      framework: options.framework ?? this.config.defaultFramework,
      version: "1.0.0",
      rules: [],
      createdAt: now(),
      updatedAt: now(),
      metadata: options.metadata ?? {},
    };
    this.policies.set(policy.id, policy);
    return policy;
  }

  getPolicy(id: string): CompliancePolicy | undefined {
    return this.policies.get(id);
  }

  listPolicies(framework?: string): CompliancePolicy[] {
    const all = Array.from(this.policies.values());
    if (framework) {
      return all.filter((p) => p.framework === framework);
    }
    return all;
  }

  deletePolicy(id: string): boolean {
    return this.policies.delete(id);
  }

  // ==========================================================================
  // Rule Management
  // ==========================================================================

  addRule(
    policyId: string,
    rule: Omit<ComplianceRule, "id" | "policyId">,
  ): ComplianceRule {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }
    const fullRule: ComplianceRule = {
      ...rule,
      id: generateEventId(),
      policyId,
    };
    policy.rules.push(fullRule);
    policy.updatedAt = now();
    return fullRule;
  }

  removeRule(policyId: string, ruleId: string): boolean {
    const policy = this.policies.get(policyId);
    if (!policy) return false;
    const idx = policy.rules.findIndex((r) => r.id === ruleId);
    if (idx === -1) return false;
    policy.rules.splice(idx, 1);
    policy.updatedAt = now();
    return true;
  }

  enableRule(policyId: string, ruleId: string): boolean {
    const policy = this.policies.get(policyId);
    if (!policy) return false;
    const rule = policy.rules.find((r) => r.id === ruleId);
    if (!rule) return false;
    rule.enabled = true;
    policy.updatedAt = now();
    return true;
  }

  disableRule(policyId: string, ruleId: string): boolean {
    const policy = this.policies.get(policyId);
    if (!policy) return false;
    const rule = policy.rules.find((r) => r.id === ruleId);
    if (!rule) return false;
    rule.enabled = false;
    policy.updatedAt = now();
    return true;
  }

  // ==========================================================================
  // Template Management
  // ==========================================================================

  listTemplates(framework?: string): PolicyTemplate[] {
    const all = Array.from(this.templates.values());
    if (framework) {
      return all.filter((t) => t.framework === framework);
    }
    return all;
  }

  createPolicyFromTemplate(
    templateId: string,
    name?: string,
  ): CompliancePolicy {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    const policy = this.createPolicy({
      name: name ?? template.name,
      framework: template.framework,
    });
    for (const ruleTemplate of template.rules) {
      this.addRule(policy.id, ruleTemplate);
    }
    return this.policies.get(policy.id)!;
  }

  // ==========================================================================
  // Compliance Checking
  // ==========================================================================

  runCheck(
    policyId: string,
    target: { type: string; id: string; data: Record<string, unknown> },
  ): ComplianceCheck[] {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    const results: ComplianceCheck[] = [];

    for (const rule of policy.rules) {
      if (!rule.enabled) {
        const skipCheck: ComplianceCheck = {
          id: generateEventId(),
          policyId,
          ruleId: rule.id,
          targetType: target.type,
          targetId: target.id,
          status: "skip",
          message: `Rule "${rule.name}" is disabled`,
          evidence: [],
          checkedAt: now(),
        };
        this.checks.set(skipCheck.id, skipCheck);
        results.push(skipCheck);
        continue;
      }

      const passed = this.evaluateCondition(rule.condition, target.data);
      const check: ComplianceCheck = {
        id: generateEventId(),
        policyId,
        ruleId: rule.id,
        targetType: target.type,
        targetId: target.id,
        status: passed ? "pass" : "fail",
        message: passed
          ? `Rule "${rule.name}" passed`
          : `Rule "${rule.name}" failed: ${rule.remediation}`,
        evidence: [],
        checkedAt: now(),
      };

      if (this.config.autoEvidence) {
        const evidence: EvidenceItem = {
          id: generateEventId(),
          checkId: check.id,
          type: "audit_trail",
          description: `Auto-collected evidence for rule "${rule.name}"`,
          data: { targetData: target.data, condition: rule.condition },
          collectedAt: now(),
        };
        check.evidence.push(evidence);
      }

      this.checks.set(check.id, check);
      results.push(check);
    }

    return results;
  }

  private evaluateCondition(
    condition: RuleCondition,
    data: Record<string, unknown>,
  ): boolean {
    switch (condition.type) {
      case "field_required": {
        if (!condition.field) return false;
        const val = data[condition.field];
        return val !== undefined && val !== null && val !== "";
      }
      case "field_matches": {
        if (!condition.field || !condition.operator) return false;
        const fieldVal = data[condition.field];
        return this.evaluateOperator(
          condition.operator,
          fieldVal,
          condition.value,
        );
      }
      case "field_range": {
        if (!condition.field || !condition.operator) return false;
        const rangeVal = data[condition.field];
        if (typeof rangeVal !== "number") return false;
        return this.evaluateOperator(
          condition.operator,
          rangeVal,
          condition.value,
        );
      }
      case "custom":
        return true;
      default:
        return false;
    }
  }

  private evaluateOperator(
    operator: NonNullable<RuleCondition["operator"]>,
    fieldVal: unknown,
    expected: unknown,
  ): boolean {
    switch (operator) {
      case "equals":
        return fieldVal === expected;
      case "not_equals":
        return fieldVal !== expected;
      case "contains":
        if (typeof fieldVal === "string" && typeof expected === "string") {
          return fieldVal.includes(expected);
        }
        return false;
      case "not_contains":
        if (typeof fieldVal === "string" && typeof expected === "string") {
          return !fieldVal.includes(expected);
        }
        return true;
      case "greater_than":
        return (
          typeof fieldVal === "number" &&
          typeof expected === "number" &&
          fieldVal > expected
        );
      case "less_than":
        return (
          typeof fieldVal === "number" &&
          typeof expected === "number" &&
          fieldVal < expected
        );
      case "regex": {
        if (typeof fieldVal !== "string" || typeof expected !== "string")
          return false;
        try {
          return new RegExp(expected).test(fieldVal);
        } catch {
          return false;
        }
      }
      default:
        return false;
    }
  }

  getCheck(id: string): ComplianceCheck | undefined {
    return this.checks.get(id);
  }

  listChecks(filter?: {
    policyId?: string;
    status?: string;
    ruleId?: string;
  }): ComplianceCheck[] {
    let all = Array.from(this.checks.values());
    if (filter?.policyId) {
      all = all.filter((c) => c.policyId === filter.policyId);
    }
    if (filter?.status) {
      all = all.filter((c) => c.status === filter.status);
    }
    if (filter?.ruleId) {
      all = all.filter((c) => c.ruleId === filter.ruleId);
    }
    return all;
  }

  // ==========================================================================
  // Reporting
  // ==========================================================================

  generateReport(
    policyId: string,
    period?: { start: number; end: number },
  ): ComplianceReport {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    const effectivePeriod = period ?? { start: 0, end: now() };

    const policyChecks = Array.from(this.checks.values()).filter(
      (c) =>
        c.policyId === policyId &&
        c.checkedAt >= effectivePeriod.start &&
        c.checkedAt <= effectivePeriod.end,
    );

    let passed = 0;
    let failed = 0;
    let warnings = 0;
    let skipped = 0;

    const checksByCategory: Record<
      string,
      { passed: number; failed: number; total: number }
    > = {};
    const checksBySeverity: Record<
      string,
      { passed: number; failed: number; total: number }
    > = {};
    const failedByRule = new Map<
      string,
      { rule: ComplianceRule; checks: ComplianceCheck[] }
    >();

    for (const check of policyChecks) {
      const rule = policy.rules.find((r) => r.id === check.ruleId);
      const category = rule?.category ?? "unknown";
      const severity = rule?.severity ?? "low";

      if (!checksByCategory[category]) {
        checksByCategory[category] = { passed: 0, failed: 0, total: 0 };
      }
      if (!checksBySeverity[severity]) {
        checksBySeverity[severity] = { passed: 0, failed: 0, total: 0 };
      }

      checksByCategory[category].total++;
      checksBySeverity[severity].total++;

      switch (check.status) {
        case "pass":
          passed++;
          checksByCategory[category].passed++;
          checksBySeverity[severity].passed++;
          break;
        case "fail":
          failed++;
          checksByCategory[category].failed++;
          checksBySeverity[severity].failed++;
          if (rule) {
            if (!failedByRule.has(rule.id)) {
              failedByRule.set(rule.id, { rule, checks: [] });
            }
            failedByRule.get(rule.id)!.checks.push(check);
          }
          break;
        case "warning":
          warnings++;
          break;
        case "skip":
          skipped++;
          break;
      }
    }

    const gradedChecks = passed + failed;
    const complianceScore =
      gradedChecks > 0 ? Math.round((passed / gradedChecks) * 100) : 100;

    let status: ComplianceReport["status"];
    if (complianceScore >= 90) {
      status = "compliant";
    } else if (complianceScore >= 70) {
      status = "partial";
    } else {
      status = "non_compliant";
    }

    const findings: ComplianceFinding[] = [];
    for (const [, { rule, checks: failedChecks }] of failedByRule) {
      const allEvidence: EvidenceItem[] = [];
      for (const c of failedChecks) {
        allEvidence.push(...c.evidence);
      }
      findings.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        category: rule.category,
        failedChecks: failedChecks.length,
        remediation: rule.remediation,
        evidence: allEvidence,
      });
    }

    const report: ComplianceReport = {
      id: generateEventId(),
      policyId,
      generatedAt: now(),
      period: effectivePeriod,
      totalChecks: policyChecks.length,
      passed,
      failed,
      warnings,
      skipped,
      complianceScore,
      status,
      checksByCategory,
      checksBySeverity,
      findings,
    };

    this.reports.set(report.id, report);
    return report;
  }

  getReport(id: string): ComplianceReport | undefined {
    return this.reports.get(id);
  }

  listReports(policyId?: string): ComplianceReport[] {
    const all = Array.from(this.reports.values());
    if (policyId) {
      return all.filter((r) => r.policyId === policyId);
    }
    return all;
  }

  // ==========================================================================
  // Compliance Gates
  // ==========================================================================

  createGate(options: {
    policyId: string;
    name: string;
    stage: ComplianceGate["stage"];
    enforced?: boolean;
    requiredScore?: number;
  }): ComplianceGate {
    const gate: ComplianceGate = {
      id: generateEventId(),
      policyId: options.policyId,
      name: options.name,
      stage: options.stage,
      enforced: options.enforced ?? true,
      requiredScore: options.requiredScore ?? 80,
      status: "pending",
      result: null,
      evaluatedAt: null,
    };
    this.gates.set(gate.id, gate);
    return gate;
  }

  evaluateGate(
    gateId: string,
    targets: { type: string; id: string; data: Record<string, unknown> }[],
  ): ComplianceGate {
    const gate = this.gates.get(gateId);
    if (!gate) {
      throw new Error(`Gate not found: ${gateId}`);
    }

    for (const target of targets) {
      this.runCheck(gate.policyId, target);
    }

    const report = this.generateReport(gate.policyId);

    gate.result = report;
    gate.evaluatedAt = now();
    gate.status =
      report.complianceScore >= gate.requiredScore ? "passed" : "failed";

    return gate;
  }

  getGate(id: string): ComplianceGate | undefined {
    return this.gates.get(id);
  }

  listGates(policyId?: string): ComplianceGate[] {
    const all = Array.from(this.gates.values());
    if (policyId) {
      return all.filter((g) => g.policyId === policyId);
    }
    return all;
  }

  bypassGate(gateId: string, _reason: string): ComplianceGate {
    const gate = this.gates.get(gateId);
    if (!gate) {
      throw new Error(`Gate not found: ${gateId}`);
    }
    gate.status = "bypassed";
    gate.evaluatedAt = now();
    if (!gate.result) {
      gate.result = {
        id: generateEventId(),
        policyId: gate.policyId,
        generatedAt: now(),
        period: { start: 0, end: now() },
        totalChecks: 0,
        passed: 0,
        failed: 0,
        warnings: 0,
        skipped: 0,
        complianceScore: 0,
        status: "non_compliant",
        checksByCategory: {},
        checksBySeverity: {},
        findings: [],
      };
    }
    return gate;
  }

  // ==========================================================================
  // Evidence
  // ==========================================================================

  collectEvidence(
    checkId: string,
    evidence: Omit<EvidenceItem, "id" | "checkId" | "collectedAt">,
  ): EvidenceItem {
    const check = this.checks.get(checkId);
    if (!check) {
      throw new Error(`Check not found: ${checkId}`);
    }
    const item: EvidenceItem = {
      ...evidence,
      id: generateEventId(),
      checkId,
      collectedAt: now(),
    };
    check.evidence.push(item);
    return item;
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  getMetrics(): ComplianceCodeMetrics {
    const allChecks = Array.from(this.checks.values());
    const allGates = Array.from(this.gates.values());

    const checksByStatus: Record<string, number> = {};
    for (const check of allChecks) {
      checksByStatus[check.status] = (checksByStatus[check.status] ?? 0) + 1;
    }

    const gradedChecks =
      (checksByStatus["pass"] ?? 0) + (checksByStatus["fail"] ?? 0);
    const overallComplianceScore =
      gradedChecks > 0
        ? Math.round(((checksByStatus["pass"] ?? 0) / gradedChecks) * 100)
        : 100;

    const evaluatedGates = allGates.filter(
      (g) => g.status === "passed" || g.status === "failed",
    );
    const passedGates = evaluatedGates.filter(
      (g) => g.status === "passed",
    ).length;
    const gatePassRate =
      evaluatedGates.length > 0
        ? Math.round((passedGates / evaluatedGates.length) * 100)
        : 100;

    // Top violations
    const violationCounts = new Map<
      string,
      { ruleId: string; ruleName: string; count: number }
    >();
    for (const check of allChecks) {
      if (check.status === "fail") {
        const existing = violationCounts.get(check.ruleId);
        if (existing) {
          existing.count++;
        } else {
          // Find rule name from policies
          let ruleName = check.ruleId;
          for (const policy of this.policies.values()) {
            const rule = policy.rules.find((r) => r.id === check.ruleId);
            if (rule) {
              ruleName = rule.name;
              break;
            }
          }
          violationCounts.set(check.ruleId, {
            ruleId: check.ruleId,
            ruleName,
            count: 1,
          });
        }
      }
    }

    const topViolations = Array.from(violationCounts.values()).sort(
      (a, b) => b.count - a.count,
    );

    let totalRules = 0;
    for (const policy of this.policies.values()) {
      totalRules += policy.rules.length;
    }

    return {
      totalPolicies: this.policies.size,
      totalRules,
      totalChecks: allChecks.length,
      overallComplianceScore,
      checksByStatus,
      gatePassRate,
      topViolations,
    };
  }

  // ==========================================================================
  // Reset
  // ==========================================================================

  reset(): void {
    this.policies.clear();
    this.checks.clear();
    this.gates.clear();
    this.reports.clear();
    this.templates.clear();
    this.initializeTemplates();
  }
}
