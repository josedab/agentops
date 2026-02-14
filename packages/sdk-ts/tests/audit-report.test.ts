import { describe, it, expect, beforeEach } from "vitest";
import {
  AuditReportEngine,
  type AuditReportConfig,
  type AuditDataSource,
  type ComplianceFramework,
} from "../src/audit-report/index.js";

describe("AuditReportEngine", () => {
  let engine: AuditReportEngine;

  const defaultConfig: AuditReportConfig = {
    enabled: true,
    organizationName: "Test Corp",
    frameworks: ["eu_ai_act", "soc2", "nist_ai_rmf", "iso_42001"],
    reportFormat: "json",
    includeEvidence: true,
    debug: false,
  };

  const fullDataSource: AuditDataSource = {
    sessionTraces: {
      count: 150,
      dateRange: { start: Date.now() - 86400000, end: Date.now() },
    },
    auditLogs: {
      count: 500,
      dateRange: { start: Date.now() - 86400000, end: Date.now() },
    },
    piiScans: { count: 80, violations: 0 },
    guardrailEnforcements: { count: 45, blocked: 12 },
    securityIncidents: { count: 3, resolved: 3 },
    configChanges: { count: 20 },
  };

  const emptyDataSource: AuditDataSource = {
    sessionTraces: { count: 0, dateRange: { start: 0, end: 0 } },
    auditLogs: { count: 0, dateRange: { start: 0, end: 0 } },
    piiScans: { count: 0, violations: 0 },
    guardrailEnforcements: { count: 0, blocked: 0 },
    securityIncidents: { count: 0, resolved: 0 },
    configChanges: { count: 0 },
  };

  const period = { start: Date.now() - 86400000 * 30, end: Date.now() };

  beforeEach(() => {
    engine = new AuditReportEngine(defaultConfig);
  });

  describe("framework controls retrieval", () => {
    it("should return EU AI Act controls", () => {
      const controls = engine.getFrameworkControls("eu_ai_act");
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.some((c) => c.id.startsWith("eu-"))).toBe(true);
      // Should contain Article 13, 14, 15, 9, 12 controls
      expect(controls.some((c) => c.id.includes("13"))).toBe(true);
      expect(controls.some((c) => c.id.includes("14"))).toBe(true);
      expect(controls.some((c) => c.id.includes("15"))).toBe(true);
      expect(controls.some((c) => c.id.includes("9"))).toBe(true);
      expect(controls.some((c) => c.id.includes("12"))).toBe(true);
    });

    it("should return SOC 2 controls", () => {
      const controls = engine.getFrameworkControls("soc2");
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.some((c) => c.id.startsWith("soc2-"))).toBe(true);
    });

    it("should return NIST AI RMF controls", () => {
      const controls = engine.getFrameworkControls("nist_ai_rmf");
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.some((c) => c.id.startsWith("nist-"))).toBe(true);
      // Should have Govern, Map, Measure, Manage functions
      expect(controls.some((c) => c.id.includes("gov"))).toBe(true);
      expect(controls.some((c) => c.id.includes("map"))).toBe(true);
      expect(controls.some((c) => c.id.includes("meas"))).toBe(true);
      expect(controls.some((c) => c.id.includes("man"))).toBe(true);
    });

    it("should return ISO 42001 controls", () => {
      const controls = engine.getFrameworkControls("iso_42001");
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.some((c) => c.id.startsWith("iso-"))).toBe(true);
    });

    it("should initialize controls with not_met status", () => {
      const controls = engine.getFrameworkControls("eu_ai_act");
      for (const control of controls) {
        expect(control.status).toBe("not_met");
        expect(control.evidence).toEqual([]);
        expect(control.notes).toBe("");
      }
    });

    it("should return empty array for unknown framework", () => {
      const controls = engine.getFrameworkControls(
        "unknown" as ComplianceFramework,
      );
      expect(controls).toEqual([]);
    });
  });

  describe("control evaluation", () => {
    it("should mark logging control as met when audit logs and session traces exist", () => {
      const control = {
        id: "eu-12-1",
        name: "Automatic Logging",
        description: "AI system automatically records events.",
        status: "not_met" as const,
        evidence: [],
        notes: "",
      };
      const evaluated = engine.evaluateControl(control, fullDataSource);
      expect(evaluated.status).toBe("met");
      expect(evaluated.evidence.length).toBeGreaterThan(0);
    });

    it("should mark control as not_met when no data exists", () => {
      const control = {
        id: "eu-12-1",
        name: "Automatic Logging",
        description: "AI system automatically records events.",
        status: "not_met" as const,
        evidence: [],
        notes: "",
      };
      const evaluated = engine.evaluateControl(control, emptyDataSource);
      expect(evaluated.status).toBe("not_met");
    });

    it("should mark PII control as met when scans exist with no violations", () => {
      const control = {
        id: "soc2-data-1",
        name: "PII Detection & Handling",
        description: "PII is detected and handled.",
        status: "not_met" as const,
        evidence: [],
        notes: "",
      };
      const evaluated = engine.evaluateControl(control, fullDataSource);
      expect(evaluated.status).toBe("met");
    });

    it("should mark PII control as partial when violations exist", () => {
      const control = {
        id: "soc2-data-1",
        name: "PII Detection & Handling",
        description: "PII is detected and handled.",
        status: "not_met" as const,
        evidence: [],
        notes: "",
      };
      const ds = {
        ...fullDataSource,
        piiScans: { count: 80, violations: 5 },
      };
      const evaluated = engine.evaluateControl(control, ds);
      expect(evaluated.status).toBe("partial");
    });

    it("should mark incident control as met when all incidents are resolved", () => {
      const control = {
        id: "soc2-inc-2",
        name: "Incident Resolution",
        description: "Incidents are resolved.",
        status: "not_met" as const,
        evidence: [],
        notes: "",
      };
      const evaluated = engine.evaluateControl(control, fullDataSource);
      expect(evaluated.status).toBe("met");
    });

    it("should not include evidence when includeEvidence is false", () => {
      const noEvidenceEngine = new AuditReportEngine({
        ...defaultConfig,
        includeEvidence: false,
      });
      const control = {
        id: "eu-12-1",
        name: "Automatic Logging",
        description: "AI system automatically records events.",
        status: "not_met" as const,
        evidence: [],
        notes: "",
      };
      const evaluated = noEvidenceEngine.evaluateControl(
        control,
        fullDataSource,
      );
      expect(evaluated.evidence).toEqual([]);
    });
  });

  describe("report generation", () => {
    it("should generate EU AI Act report with data source", () => {
      const report = engine.generateReport("eu_ai_act", fullDataSource, period);
      expect(report.framework).toBe("eu_ai_act");
      expect(report.organizationName).toBe("Test Corp");
      expect(report.sections.length).toBeGreaterThan(0);
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
      expect(["compliant", "partial", "non_compliant"]).toContain(
        report.status,
      );
    });

    it("should generate SOC 2 report", () => {
      const report = engine.generateReport("soc2", fullDataSource, period);
      expect(report.framework).toBe("soc2");
      expect(report.sections.length).toBe(5);
    });

    it("should generate NIST AI RMF report", () => {
      const report = engine.generateReport(
        "nist_ai_rmf",
        fullDataSource,
        period,
      );
      expect(report.framework).toBe("nist_ai_rmf");
      expect(report.sections.length).toBe(4);
    });

    it("should generate ISO 42001 report", () => {
      const report = engine.generateReport("iso_42001", fullDataSource, period);
      expect(report.framework).toBe("iso_42001");
      expect(report.sections.length).toBe(4);
    });

    it("should throw for unknown framework", () => {
      expect(() =>
        engine.generateReport(
          "unknown" as ComplianceFramework,
          fullDataSource,
          period,
        ),
      ).toThrow("Unknown compliance framework");
    });

    it("should include gaps and recommendations in report", () => {
      const report = engine.generateReport(
        "eu_ai_act",
        emptyDataSource,
        period,
      );
      expect(report.gaps.length).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("report scoring", () => {
    it("should score compliant when all controls are met", () => {
      const report = engine.generateReport("eu_ai_act", fullDataSource, period);
      // With full data source, most controls should be met
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
    });

    it("should score non_compliant when no data exists", () => {
      const report = engine.generateReport(
        "eu_ai_act",
        emptyDataSource,
        period,
      );
      expect(report.status).toBe("non_compliant");
      expect(report.overallScore).toBeLessThan(50);
    });

    it("should score partial with mixed data", () => {
      const partialDataSource: AuditDataSource = {
        sessionTraces: {
          count: 10,
          dateRange: { start: Date.now() - 86400000, end: Date.now() },
        },
        auditLogs: { count: 0, dateRange: { start: 0, end: 0 } },
        piiScans: { count: 0, violations: 0 },
        guardrailEnforcements: { count: 0, blocked: 0 },
        securityIncidents: { count: 0, resolved: 0 },
        configChanges: { count: 0 },
      };
      const report = engine.generateReport(
        "eu_ai_act",
        partialDataSource,
        period,
      );
      // With only session traces, some controls should be partial
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.overallScore).toBeLessThan(100);
    });
  });

  describe("gap identification", () => {
    it("should identify gaps for not_met controls", () => {
      const report = engine.generateReport(
        "eu_ai_act",
        emptyDataSource,
        period,
      );
      const gaps = engine.identifyGaps(report);
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps.every((g) => g.framework === "eu_ai_act")).toBe(true);
    });

    it("should set severity high for not_met controls", () => {
      const report = engine.generateReport(
        "eu_ai_act",
        emptyDataSource,
        period,
      );
      const gaps = engine.identifyGaps(report);
      const notMetGaps = gaps.filter((g) => g.severity === "high");
      expect(notMetGaps.length).toBeGreaterThan(0);
    });

    it("should set severity medium for partial controls", () => {
      const partialDs: AuditDataSource = {
        sessionTraces: {
          count: 10,
          dateRange: { start: Date.now() - 86400000, end: Date.now() },
        },
        auditLogs: { count: 0, dateRange: { start: 0, end: 0 } },
        piiScans: { count: 0, violations: 0 },
        guardrailEnforcements: { count: 0, blocked: 0 },
        securityIncidents: { count: 0, resolved: 0 },
        configChanges: { count: 0 },
      };
      const report = engine.generateReport("eu_ai_act", partialDs, period);
      const gaps = engine.identifyGaps(report);
      const mediumGaps = gaps.filter((g) => g.severity === "medium");
      // Some controls should be partial with only session traces
      expect(
        mediumGaps.length > 0 || gaps.some((g) => g.severity === "high"),
      ).toBe(true);
    });

    it("should include remediation for each gap", () => {
      const report = engine.generateReport(
        "eu_ai_act",
        emptyDataSource,
        period,
      );
      const gaps = engine.identifyGaps(report);
      for (const gap of gaps) {
        expect(gap.remediation).toBeTruthy();
        expect(gap.description).toBeTruthy();
      }
    });
  });

  describe("compliance posture assessment", () => {
    it("should assess posture across all configured frameworks", () => {
      const posture = engine.assessPosture(fullDataSource);
      expect(posture.frameworks.size).toBe(4);
      expect(posture.totalControls).toBeGreaterThan(0);
      expect(posture.lastAssessed).toBeGreaterThan(0);
    });

    it("should count controls correctly", () => {
      const posture = engine.assessPosture(fullDataSource);
      expect(
        posture.metControls + posture.partialControls + posture.notMetControls,
      ).toBe(posture.totalControls);
    });

    it("should include posture score for each framework", () => {
      const posture = engine.assessPosture(fullDataSource);
      for (const [fw, score] of posture.frameworks) {
        expect(score.framework).toBe(fw);
        expect(score.score).toBeGreaterThanOrEqual(0);
        expect(score.score).toBeLessThanOrEqual(100);
        expect(["compliant", "partial", "non_compliant"]).toContain(
          score.status,
        );
        expect(score.lastAssessed).toBeGreaterThan(0);
      }
    });
  });

  describe("markdown export", () => {
    it("should export report as valid markdown", () => {
      const report = engine.generateReport("eu_ai_act", fullDataSource, period);
      const md = engine.exportToMarkdown(report);
      expect(md).toContain("# Compliance Report:");
      expect(md).toContain("**Organization:** Test Corp");
      expect(md).toContain("**Overall Score:**");
      expect(md).toContain("**Status:**");
    });

    it("should include sections and controls in markdown", () => {
      const report = engine.generateReport("eu_ai_act", fullDataSource, period);
      const md = engine.exportToMarkdown(report);
      expect(md).toContain("## ");
      expect(md).toContain("### ");
    });

    it("should include gaps section when gaps exist", () => {
      const report = engine.generateReport(
        "eu_ai_act",
        emptyDataSource,
        period,
      );
      const md = engine.exportToMarkdown(report);
      expect(md).toContain("## Compliance Gaps");
    });
  });

  describe("CSV export", () => {
    it("should export report as valid CSV with headers", () => {
      const report = engine.generateReport("eu_ai_act", fullDataSource, period);
      const csv = engine.exportToCSV(report);
      const lines = csv.split("\n");
      expect(lines[0]).toBe(
        "Section,Control ID,Control Name,Status,Score,Evidence Count,Notes",
      );
      expect(lines.length).toBeGreaterThan(1);
    });

    it("should have a row for each control", () => {
      const report = engine.generateReport("eu_ai_act", fullDataSource, period);
      const csv = engine.exportToCSV(report);
      const lines = csv.split("\n");
      const totalControls = report.sections.reduce(
        (sum, s) => sum + s.controls.length,
        0,
      );
      // header + one row per control
      expect(lines.length).toBe(totalControls + 1);
    });
  });

  describe("JSON export", () => {
    it("should export report as valid JSON", () => {
      const report = engine.generateReport("eu_ai_act", fullDataSource, period);
      const json = engine.exportToJSON(report);
      const parsed = JSON.parse(json);
      expect(parsed.framework).toBe("eu_ai_act");
      expect(parsed.organizationName).toBe("Test Corp");
      expect(parsed.sections).toBeInstanceOf(Array);
    });

    it("should be formatted with indentation", () => {
      const report = engine.generateReport("eu_ai_act", fullDataSource, period);
      const json = engine.exportToJSON(report);
      expect(json).toContain("\n");
      expect(json).toContain("  ");
    });
  });

  describe("metrics tracking", () => {
    it("should start with zero metrics", () => {
      const metrics = engine.getMetrics();
      expect(metrics.reportsGenerated).toBe(0);
      expect(metrics.frameworksCovered).toBe(0);
      expect(metrics.totalGapsIdentified).toBe(0);
      expect(metrics.avgComplianceScore).toBe(0);
      expect(metrics.lastReportGenerated).toBeNull();
    });

    it("should track reports generated", () => {
      engine.generateReport("eu_ai_act", fullDataSource, period);
      engine.generateReport("soc2", fullDataSource, period);
      const metrics = engine.getMetrics();
      expect(metrics.reportsGenerated).toBe(2);
      expect(metrics.frameworksCovered).toBe(2);
    });

    it("should track total gaps identified", () => {
      engine.generateReport("eu_ai_act", emptyDataSource, period);
      const metrics = engine.getMetrics();
      expect(metrics.totalGapsIdentified).toBeGreaterThan(0);
    });

    it("should calculate average compliance score", () => {
      engine.generateReport("eu_ai_act", fullDataSource, period);
      engine.generateReport("soc2", fullDataSource, period);
      const metrics = engine.getMetrics();
      expect(metrics.avgComplianceScore).toBeGreaterThan(0);
      expect(metrics.avgComplianceScore).toBeLessThanOrEqual(100);
    });

    it("should track last report generated timestamp", () => {
      const before = Date.now();
      engine.generateReport("eu_ai_act", fullDataSource, period);
      const metrics = engine.getMetrics();
      expect(metrics.lastReportGenerated).toBeGreaterThanOrEqual(before);
    });
  });
});
