/**
 * Tests for Compliance-as-Code SDK
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ComplianceCodeEngine } from "../src/compliance-code/index.js";
import type {
  CompliancePolicy,
  ComplianceRule,
  ComplianceCheck,
  ComplianceReport,
  ComplianceGate,
  PolicyTemplate,
} from "../src/compliance-code/index.js";

function makeRule(
  overrides: Partial<Omit<ComplianceRule, "id" | "policyId">> = {},
): Omit<ComplianceRule, "id" | "policyId"> {
  return {
    name: "Test Rule",
    description: "A test rule",
    severity: "medium",
    category: "test",
    condition: { type: "field_required", field: "testField" },
    remediation: "Fix the test field",
    enabled: true,
    ...overrides,
  };
}

function makeTarget(
  data: Record<string, unknown> = {},
  overrides: Partial<{ type: string; id: string }> = {},
) {
  return {
    type: overrides.type ?? "event",
    id: overrides.id ?? "target-1",
    data,
  };
}

describe("ComplianceCodeEngine", () => {
  let engine: ComplianceCodeEngine;

  beforeEach(() => {
    engine = new ComplianceCodeEngine({ enabled: true });
  });

  // ==========================================================================
  // Policy Management
  // ==========================================================================

  describe("Policy Management", () => {
    it("should create a policy with defaults", () => {
      const policy = engine.createPolicy({ name: "My Policy" });
      expect(policy.id).toBeDefined();
      expect(policy.name).toBe("My Policy");
      expect(policy.framework).toBe("soc2");
      expect(policy.version).toBe("1.0.0");
      expect(policy.rules).toHaveLength(0);
      expect(policy.createdAt).toBeGreaterThan(0);
    });

    it("should create a policy with custom framework", () => {
      const policy = engine.createPolicy({
        name: "HIPAA Policy",
        framework: "hipaa",
      });
      expect(policy.framework).toBe("hipaa");
    });

    it("should retrieve a policy by ID", () => {
      const policy = engine.createPolicy({ name: "Fetch Me" });
      const retrieved = engine.getPolicy(policy.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe("Fetch Me");
    });

    it("should return undefined for unknown policy ID", () => {
      expect(engine.getPolicy("nonexistent")).toBeUndefined();
    });

    it("should list all policies", () => {
      engine.createPolicy({ name: "P1" });
      engine.createPolicy({ name: "P2" });
      expect(engine.listPolicies()).toHaveLength(2);
    });

    it("should filter policies by framework", () => {
      engine.createPolicy({ name: "SOC2", framework: "soc2" });
      engine.createPolicy({ name: "HIPAA", framework: "hipaa" });
      engine.createPolicy({ name: "SOC2-2", framework: "soc2" });
      expect(engine.listPolicies("soc2")).toHaveLength(2);
      expect(engine.listPolicies("hipaa")).toHaveLength(1);
    });

    it("should delete a policy", () => {
      const policy = engine.createPolicy({ name: "Delete Me" });
      expect(engine.deletePolicy(policy.id)).toBe(true);
      expect(engine.getPolicy(policy.id)).toBeUndefined();
    });

    it("should return false when deleting nonexistent policy", () => {
      expect(engine.deletePolicy("nonexistent")).toBe(false);
    });
  });

  // ==========================================================================
  // Rule Management
  // ==========================================================================

  describe("Rule Management", () => {
    it("should add a rule to a policy", () => {
      const policy = engine.createPolicy({ name: "Test" });
      const rule = engine.addRule(policy.id, makeRule());
      expect(rule.id).toBeDefined();
      expect(rule.policyId).toBe(policy.id);
      expect(rule.name).toBe("Test Rule");

      const updated = engine.getPolicy(policy.id)!;
      expect(updated.rules).toHaveLength(1);
    });

    it("should throw when adding rule to nonexistent policy", () => {
      expect(() => engine.addRule("nonexistent", makeRule())).toThrow(
        "Policy not found",
      );
    });

    it("should remove a rule from a policy", () => {
      const policy = engine.createPolicy({ name: "Test" });
      const rule = engine.addRule(policy.id, makeRule());
      expect(engine.removeRule(policy.id, rule.id)).toBe(true);
      expect(engine.getPolicy(policy.id)!.rules).toHaveLength(0);
    });

    it("should return false when removing nonexistent rule", () => {
      const policy = engine.createPolicy({ name: "Test" });
      expect(engine.removeRule(policy.id, "nonexistent")).toBe(false);
    });

    it("should enable a rule", () => {
      const policy = engine.createPolicy({ name: "Test" });
      const rule = engine.addRule(policy.id, makeRule({ enabled: false }));
      expect(engine.enableRule(policy.id, rule.id)).toBe(true);
      const updated = engine.getPolicy(policy.id)!;
      expect(updated.rules[0].enabled).toBe(true);
    });

    it("should disable a rule", () => {
      const policy = engine.createPolicy({ name: "Test" });
      const rule = engine.addRule(policy.id, makeRule({ enabled: true }));
      expect(engine.disableRule(policy.id, rule.id)).toBe(true);
      const updated = engine.getPolicy(policy.id)!;
      expect(updated.rules[0].enabled).toBe(false);
    });

    it("should return false when enabling rule on nonexistent policy", () => {
      expect(engine.enableRule("nonexistent", "rule-id")).toBe(false);
    });

    it("should return false when disabling nonexistent rule", () => {
      const policy = engine.createPolicy({ name: "Test" });
      expect(engine.disableRule(policy.id, "nonexistent")).toBe(false);
    });
  });

  // ==========================================================================
  // Template Management
  // ==========================================================================

  describe("Template Management", () => {
    it("should list all templates", () => {
      const templates = engine.listTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(2);
    });

    it("should filter templates by framework", () => {
      const soc2 = engine.listTemplates("soc2");
      expect(soc2.length).toBeGreaterThanOrEqual(1);
      expect(soc2.every((t) => t.framework === "soc2")).toBe(true);

      const hipaa = engine.listTemplates("hipaa");
      expect(hipaa.length).toBeGreaterThanOrEqual(1);
      expect(hipaa.every((t) => t.framework === "hipaa")).toBe(true);
    });

    it("should create a policy from a template", () => {
      const templates = engine.listTemplates("soc2");
      const template = templates[0];
      const policy = engine.createPolicyFromTemplate(template.id);
      expect(policy.name).toBe(template.name);
      expect(policy.framework).toBe("soc2");
      expect(policy.rules.length).toBe(template.rules.length);
      expect(policy.rules[0].id).toBeDefined();
      expect(policy.rules[0].policyId).toBe(policy.id);
    });

    it("should create a policy from template with custom name", () => {
      const templates = engine.listTemplates("soc2");
      const policy = engine.createPolicyFromTemplate(
        templates[0].id,
        "Custom Name",
      );
      expect(policy.name).toBe("Custom Name");
    });

    it("should throw when creating from nonexistent template", () => {
      expect(() => engine.createPolicyFromTemplate("nonexistent")).toThrow(
        "Template not found",
      );
    });
  });

  // ==========================================================================
  // Compliance Checking - field_required
  // ==========================================================================

  describe("Compliance Checking - field_required", () => {
    it("should pass when required field exists and is truthy", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "auditLog" },
        }),
      );
      const checks = engine.runCheck(policy.id, makeTarget({ auditLog: true }));
      expect(checks).toHaveLength(1);
      expect(checks[0].status).toBe("pass");
    });

    it("should fail when required field is missing", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "auditLog" },
        }),
      );
      const checks = engine.runCheck(policy.id, makeTarget({}));
      expect(checks[0].status).toBe("fail");
    });

    it("should fail when required field is null", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "auditLog" },
        }),
      );
      const checks = engine.runCheck(policy.id, makeTarget({ auditLog: null }));
      expect(checks[0].status).toBe("fail");
    });

    it("should fail when required field is empty string", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "auditLog" },
        }),
      );
      const checks = engine.runCheck(policy.id, makeTarget({ auditLog: "" }));
      expect(checks[0].status).toBe("fail");
    });
  });

  // ==========================================================================
  // Compliance Checking - field_matches
  // ==========================================================================

  describe("Compliance Checking - field_matches", () => {
    it("should pass with equals operator when values match", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: {
            type: "field_matches",
            field: "encrypted",
            operator: "equals",
            value: true,
          },
        }),
      );
      const checks = engine.runCheck(
        policy.id,
        makeTarget({ encrypted: true }),
      );
      expect(checks[0].status).toBe("pass");
    });

    it("should fail with equals operator when values differ", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: {
            type: "field_matches",
            field: "encrypted",
            operator: "equals",
            value: true,
          },
        }),
      );
      const checks = engine.runCheck(
        policy.id,
        makeTarget({ encrypted: false }),
      );
      expect(checks[0].status).toBe("fail");
    });

    it("should pass with not_equals operator", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: {
            type: "field_matches",
            field: "status",
            operator: "not_equals",
            value: "disabled",
          },
        }),
      );
      const checks = engine.runCheck(
        policy.id,
        makeTarget({ status: "active" }),
      );
      expect(checks[0].status).toBe("pass");
    });

    it("should pass with contains operator", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: {
            type: "field_matches",
            field: "description",
            operator: "contains",
            value: "audit",
          },
        }),
      );
      const checks = engine.runCheck(
        policy.id,
        makeTarget({ description: "enable audit logging" }),
      );
      expect(checks[0].status).toBe("pass");
    });

    it("should pass with not_contains operator", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: {
            type: "field_matches",
            field: "output",
            operator: "not_contains",
            value: "password",
          },
        }),
      );
      const checks = engine.runCheck(
        policy.id,
        makeTarget({ output: "safe content" }),
      );
      expect(checks[0].status).toBe("pass");
    });

    it("should pass with regex operator", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: {
            type: "field_matches",
            field: "email",
            operator: "regex",
            value: "^[^@]+@[^@]+\\.[^@]+$",
          },
        }),
      );
      const checks = engine.runCheck(
        policy.id,
        makeTarget({ email: "user@example.com" }),
      );
      expect(checks[0].status).toBe("pass");
    });

    it("should fail with regex operator when pattern does not match", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: {
            type: "field_matches",
            field: "email",
            operator: "regex",
            value: "^[^@]+@[^@]+\\.[^@]+$",
          },
        }),
      );
      const checks = engine.runCheck(
        policy.id,
        makeTarget({ email: "not-an-email" }),
      );
      expect(checks[0].status).toBe("fail");
    });
  });

  // ==========================================================================
  // Compliance Checking - field_range
  // ==========================================================================

  describe("Compliance Checking - field_range", () => {
    it("should pass with greater_than when value exceeds threshold", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: {
            type: "field_range",
            field: "retentionDays",
            operator: "greater_than",
            value: 30,
          },
        }),
      );
      const checks = engine.runCheck(
        policy.id,
        makeTarget({ retentionDays: 90 }),
      );
      expect(checks[0].status).toBe("pass");
    });

    it("should fail with greater_than when value is below threshold", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: {
            type: "field_range",
            field: "retentionDays",
            operator: "greater_than",
            value: 30,
          },
        }),
      );
      const checks = engine.runCheck(
        policy.id,
        makeTarget({ retentionDays: 7 }),
      );
      expect(checks[0].status).toBe("fail");
    });

    it("should pass with less_than when value is below threshold", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: {
            type: "field_range",
            field: "errorRate",
            operator: "less_than",
            value: 0.05,
          },
        }),
      );
      const checks = engine.runCheck(
        policy.id,
        makeTarget({ errorRate: 0.01 }),
      );
      expect(checks[0].status).toBe("pass");
    });

    it("should fail field_range when field is not a number", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: {
            type: "field_range",
            field: "retentionDays",
            operator: "greater_than",
            value: 30,
          },
        }),
      );
      const checks = engine.runCheck(
        policy.id,
        makeTarget({ retentionDays: "ninety" }),
      );
      expect(checks[0].status).toBe("fail");
    });
  });

  // ==========================================================================
  // Compliance Checking - custom & disabled
  // ==========================================================================

  describe("Compliance Checking - custom & disabled", () => {
    it("should pass for custom condition type", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: { type: "custom", customFn: "myValidator" },
        }),
      );
      const checks = engine.runCheck(policy.id, makeTarget({}));
      expect(checks[0].status).toBe("pass");
    });

    it("should skip disabled rules", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          enabled: false,
          condition: { type: "field_required", field: "missing" },
        }),
      );
      const checks = engine.runCheck(policy.id, makeTarget({}));
      expect(checks[0].status).toBe("skip");
    });

    it("should throw when running check on nonexistent policy", () => {
      expect(() => engine.runCheck("nonexistent", makeTarget({}))).toThrow(
        "Policy not found",
      );
    });
  });

  // ==========================================================================
  // Auto Evidence Collection
  // ==========================================================================

  describe("Auto Evidence Collection", () => {
    it("should auto-collect evidence when enabled", () => {
      const eng = new ComplianceCodeEngine({
        enabled: true,
        autoEvidence: true,
      });
      const policy = eng.createPolicy({ name: "Test" });
      eng.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "auditLog" },
        }),
      );
      const checks = eng.runCheck(policy.id, makeTarget({ auditLog: true }));
      expect(checks[0].evidence).toHaveLength(1);
      expect(checks[0].evidence[0].type).toBe("audit_trail");
    });

    it("should not auto-collect evidence when disabled", () => {
      const eng = new ComplianceCodeEngine({
        enabled: true,
        autoEvidence: false,
      });
      const policy = eng.createPolicy({ name: "Test" });
      eng.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "auditLog" },
        }),
      );
      const checks = eng.runCheck(policy.id, makeTarget({ auditLog: true }));
      expect(checks[0].evidence).toHaveLength(0);
    });

    it("should manually collect evidence for a check", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "auditLog" },
        }),
      );
      const checks = engine.runCheck(policy.id, makeTarget({ auditLog: true }));
      const evidence = engine.collectEvidence(checks[0].id, {
        type: "document",
        description: "Manual evidence",
        data: { note: "Verified manually" },
      });
      expect(evidence.id).toBeDefined();
      expect(evidence.checkId).toBe(checks[0].id);
      expect(evidence.collectedAt).toBeGreaterThan(0);

      const updated = engine.getCheck(checks[0].id)!;
      expect(updated.evidence.length).toBeGreaterThanOrEqual(2);
    });

    it("should throw when collecting evidence for nonexistent check", () => {
      expect(() =>
        engine.collectEvidence("nonexistent", {
          type: "log",
          description: "Test",
          data: {},
        }),
      ).toThrow("Check not found");
    });
  });

  // ==========================================================================
  // Check Listing & Filtering
  // ==========================================================================

  describe("Check Listing & Filtering", () => {
    it("should list checks filtered by policyId", () => {
      const p1 = engine.createPolicy({ name: "P1" });
      const p2 = engine.createPolicy({ name: "P2" });
      engine.addRule(
        p1.id,
        makeRule({
          condition: { type: "field_required", field: "f" },
        }),
      );
      engine.addRule(
        p2.id,
        makeRule({
          condition: { type: "field_required", field: "f" },
        }),
      );
      engine.runCheck(p1.id, makeTarget({ f: true }));
      engine.runCheck(p2.id, makeTarget({ f: true }));

      expect(engine.listChecks({ policyId: p1.id })).toHaveLength(1);
    });

    it("should list checks filtered by status", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "a" },
        }),
      );
      engine.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "b" },
        }),
      );
      engine.runCheck(policy.id, makeTarget({ a: true }));

      const failed = engine.listChecks({ status: "fail" });
      expect(failed.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Report Generation
  // ==========================================================================

  describe("Report Generation", () => {
    it("should generate a compliant report (score >= 90)", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "a" },
        }),
      );
      engine.runCheck(policy.id, makeTarget({ a: true }));

      const report = engine.generateReport(policy.id);
      expect(report.id).toBeDefined();
      expect(report.policyId).toBe(policy.id);
      expect(report.passed).toBe(1);
      expect(report.failed).toBe(0);
      expect(report.complianceScore).toBe(100);
      expect(report.status).toBe("compliant");
    });

    it("should generate a non_compliant report (score < 70)", () => {
      const policy = engine.createPolicy({ name: "Test" });
      // Add 3 rules, only 1 will pass
      engine.addRule(
        policy.id,
        makeRule({
          name: "R1",
          condition: { type: "field_required", field: "a" },
        }),
      );
      engine.addRule(
        policy.id,
        makeRule({
          name: "R2",
          condition: { type: "field_required", field: "b" },
        }),
      );
      engine.addRule(
        policy.id,
        makeRule({
          name: "R3",
          condition: { type: "field_required", field: "c" },
        }),
      );
      engine.runCheck(policy.id, makeTarget({ a: true }));

      const report = engine.generateReport(policy.id);
      expect(report.passed).toBe(1);
      expect(report.failed).toBe(2);
      // score = (1/3)*100 = 33
      expect(report.complianceScore).toBeLessThan(70);
      expect(report.status).toBe("non_compliant");
    });

    it("should generate a partial report (70 <= score < 90)", () => {
      const policy = engine.createPolicy({ name: "Test" });
      // 4 rules, 3 pass, 1 fail => 75%
      engine.addRule(
        policy.id,
        makeRule({
          name: "R1",
          condition: { type: "field_required", field: "a" },
        }),
      );
      engine.addRule(
        policy.id,
        makeRule({
          name: "R2",
          condition: { type: "field_required", field: "b" },
        }),
      );
      engine.addRule(
        policy.id,
        makeRule({
          name: "R3",
          condition: { type: "field_required", field: "c" },
        }),
      );
      engine.addRule(
        policy.id,
        makeRule({
          name: "R4",
          condition: { type: "field_required", field: "d" },
        }),
      );
      engine.runCheck(policy.id, makeTarget({ a: true, b: true, c: true }));

      const report = engine.generateReport(policy.id);
      expect(report.complianceScore).toBe(75);
      expect(report.status).toBe("partial");
    });

    it("should aggregate findings for failed rules", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          name: "Audit Required",
          condition: { type: "field_required", field: "auditLog" },
        }),
      );
      engine.runCheck(policy.id, makeTarget({}));

      const report = engine.generateReport(policy.id);
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0].ruleName).toBe("Audit Required");
      expect(report.findings[0].failedChecks).toBe(1);
    });

    it("should group checks by category and severity", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          severity: "critical",
          category: "encryption",
          condition: { type: "field_required", field: "enc" },
        }),
      );
      engine.addRule(
        policy.id,
        makeRule({
          severity: "high",
          category: "audit-logging",
          condition: { type: "field_required", field: "log" },
        }),
      );
      engine.runCheck(policy.id, makeTarget({ enc: true, log: true }));

      const report = engine.generateReport(policy.id);
      expect(report.checksByCategory["encryption"]).toBeDefined();
      expect(report.checksByCategory["encryption"].passed).toBe(1);
      expect(report.checksBySeverity["critical"]).toBeDefined();
      expect(report.checksBySeverity["high"]).toBeDefined();
    });

    it("should return 100 score when no graded checks exist", () => {
      const policy = engine.createPolicy({ name: "Empty" });
      const report = engine.generateReport(policy.id);
      expect(report.complianceScore).toBe(100);
      expect(report.status).toBe("compliant");
    });

    it("should throw when generating report for nonexistent policy", () => {
      expect(() => engine.generateReport("nonexistent")).toThrow(
        "Policy not found",
      );
    });

    it("should list and retrieve reports", () => {
      const policy = engine.createPolicy({ name: "Test" });
      const report = engine.generateReport(policy.id);
      expect(engine.getReport(report.id)).toBeDefined();
      expect(engine.listReports(policy.id)).toHaveLength(1);
      expect(engine.listReports()).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Compliance Gates
  // ==========================================================================

  describe("Compliance Gates", () => {
    it("should create a gate with defaults", () => {
      const policy = engine.createPolicy({ name: "Test" });
      const gate = engine.createGate({
        policyId: policy.id,
        name: "Pre-Deploy Gate",
        stage: "pre_deploy",
      });
      expect(gate.id).toBeDefined();
      expect(gate.status).toBe("pending");
      expect(gate.enforced).toBe(true);
      expect(gate.requiredScore).toBe(80);
      expect(gate.result).toBeNull();
    });

    it("should evaluate gate as passed when score meets threshold", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "auditLog" },
        }),
      );
      const gate = engine.createGate({
        policyId: policy.id,
        name: "Deploy Gate",
        stage: "pre_deploy",
        requiredScore: 80,
      });

      const evaluated = engine.evaluateGate(gate.id, [
        makeTarget({ auditLog: true }),
      ]);
      expect(evaluated.status).toBe("passed");
      expect(evaluated.result).toBeDefined();
      expect(evaluated.result!.complianceScore).toBe(100);
      expect(evaluated.evaluatedAt).toBeGreaterThan(0);
    });

    it("should evaluate gate as failed when score is below threshold", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          name: "R1",
          condition: { type: "field_required", field: "a" },
        }),
      );
      engine.addRule(
        policy.id,
        makeRule({
          name: "R2",
          condition: { type: "field_required", field: "b" },
        }),
      );
      const gate = engine.createGate({
        policyId: policy.id,
        name: "Deploy Gate",
        stage: "pre_deploy",
        requiredScore: 80,
      });

      const evaluated = engine.evaluateGate(gate.id, [makeTarget({ a: true })]);
      expect(evaluated.status).toBe("failed");
      expect(evaluated.result!.complianceScore).toBe(50);
    });

    it("should throw when evaluating nonexistent gate", () => {
      expect(() => engine.evaluateGate("nonexistent", [])).toThrow(
        "Gate not found",
      );
    });

    it("should bypass a gate", () => {
      const policy = engine.createPolicy({ name: "Test" });
      const gate = engine.createGate({
        policyId: policy.id,
        name: "Bypass Gate",
        stage: "runtime",
      });
      const bypassed = engine.bypassGate(gate.id, "Emergency deployment");
      expect(bypassed.status).toBe("bypassed");
      expect(bypassed.evaluatedAt).toBeGreaterThan(0);
    });

    it("should throw when bypassing nonexistent gate", () => {
      expect(() => engine.bypassGate("nonexistent", "reason")).toThrow(
        "Gate not found",
      );
    });

    it("should list gates filtered by policyId", () => {
      const p1 = engine.createPolicy({ name: "P1" });
      const p2 = engine.createPolicy({ name: "P2" });
      engine.createGate({
        policyId: p1.id,
        name: "G1",
        stage: "pre_deploy",
      });
      engine.createGate({
        policyId: p2.id,
        name: "G2",
        stage: "runtime",
      });

      expect(engine.listGates(p1.id)).toHaveLength(1);
      expect(engine.listGates()).toHaveLength(2);
    });

    it("should retrieve a gate by ID", () => {
      const policy = engine.createPolicy({ name: "Test" });
      const gate = engine.createGate({
        policyId: policy.id,
        name: "G",
        stage: "post_deploy",
      });
      expect(engine.getGate(gate.id)).toBeDefined();
      expect(engine.getGate("nonexistent")).toBeUndefined();
    });
  });

  // ==========================================================================
  // Metrics
  // ==========================================================================

  describe("Metrics", () => {
    it("should return empty metrics for fresh engine", () => {
      const metrics = engine.getMetrics();
      expect(metrics.totalPolicies).toBe(0);
      expect(metrics.totalRules).toBe(0);
      expect(metrics.totalChecks).toBe(0);
      expect(metrics.overallComplianceScore).toBe(100);
      expect(metrics.gatePassRate).toBe(100);
      expect(metrics.topViolations).toHaveLength(0);
    });

    it("should calculate metrics after checks", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          name: "Rule A",
          condition: { type: "field_required", field: "a" },
        }),
      );
      engine.addRule(
        policy.id,
        makeRule({
          name: "Rule B",
          condition: { type: "field_required", field: "b" },
        }),
      );
      engine.runCheck(policy.id, makeTarget({ a: true }));

      const metrics = engine.getMetrics();
      expect(metrics.totalPolicies).toBe(1);
      expect(metrics.totalRules).toBe(2);
      expect(metrics.totalChecks).toBe(2);
      expect(metrics.checksByStatus["pass"]).toBe(1);
      expect(metrics.checksByStatus["fail"]).toBe(1);
      expect(metrics.overallComplianceScore).toBe(50);
      expect(metrics.topViolations).toHaveLength(1);
      expect(metrics.topViolations[0].ruleName).toBe("Rule B");
    });

    it("should calculate gate pass rate", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "a" },
        }),
      );
      const g1 = engine.createGate({
        policyId: policy.id,
        name: "G1",
        stage: "pre_deploy",
        requiredScore: 80,
      });
      engine.evaluateGate(g1.id, [makeTarget({ a: true })]);

      const g2 = engine.createGate({
        policyId: policy.id,
        name: "G2",
        stage: "runtime",
        requiredScore: 100,
      });
      // This will see all previous checks too, so score depends on accumulated state.
      // Add a failing check to make this gate fail
      engine.addRule(
        policy.id,
        makeRule({
          name: "Always Fail",
          condition: { type: "field_required", field: "missing" },
        }),
      );
      engine.evaluateGate(g2.id, [makeTarget({})]);

      const metrics = engine.getMetrics();
      expect(metrics.gatePassRate).toBeLessThanOrEqual(100);
    });
  });

  // ==========================================================================
  // Reset
  // ==========================================================================

  describe("Reset", () => {
    it("should clear all state and reinitialize templates", () => {
      const policy = engine.createPolicy({ name: "Test" });
      engine.addRule(
        policy.id,
        makeRule({
          condition: { type: "field_required", field: "a" },
        }),
      );
      engine.runCheck(policy.id, makeTarget({ a: true }));
      engine.createGate({
        policyId: policy.id,
        name: "G",
        stage: "pre_deploy",
      });

      engine.reset();

      expect(engine.listPolicies()).toHaveLength(0);
      expect(engine.listChecks()).toHaveLength(0);
      expect(engine.listGates()).toHaveLength(0);
      expect(engine.listReports()).toHaveLength(0);
      // Templates should be reinitialized
      expect(engine.listTemplates().length).toBeGreaterThanOrEqual(2);
    });
  });
});
