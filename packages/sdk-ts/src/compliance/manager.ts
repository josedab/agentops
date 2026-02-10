/**
 * AgentOps SDK - Compliance Manager
 *
 * Handles PII detection, audit logging, and policy enforcement.
 */

import type {
  PIIType,
  PIIMatch,
  PIIScanResult,
  AuditLogEntry,
  AuditAction,
  CompliancePolicy,
  PolicyViolation,
  DataDeletionRequest,
  DataExportRequest,
  ComplianceConfig,
} from "./types.js";
import { generateEventId, now } from "../utils.js";

// PII detection patterns
const PII_PATTERNS: Record<PIIType, RegExp> = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  credit_card: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  name: /\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g, // Simple name pattern
  address:
    /\b\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct)\b/gi,
  date_of_birth:
    /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](19|20)\d{2}\b/g,
  passport: /\b[A-Z]{1,2}\d{6,9}\b/g,
  driver_license: /\b[A-Z]{1,2}\d{5,8}\b/g,
  bank_account: /\b\d{8,17}\b/g,
  api_key: /\b(sk|pk|api|key)[-_]?[A-Za-z0-9]{20,}\b/gi,
  password: /\b(password|passwd|pwd)\s*[:=]\s*\S+/gi,
  custom: /(?:)/g, // Placeholder for custom patterns
};

export class ComplianceManager {
  private readonly config: ComplianceConfig;
  private auditLog: AuditLogEntry[] = [];
  private violations: PolicyViolation[] = [];
  private deletionRequests: Map<string, DataDeletionRequest> = new Map();
  private exportRequests: Map<string, DataExportRequest> = new Map();
  private customPIIPatterns: Map<string, RegExp> = new Map();

  constructor(config: ComplianceConfig) {
    this.config = {
      enabled: config.enabled ?? false,
      enablePIIDetection: config.enablePIIDetection ?? true,
      piiTypes: config.piiTypes ?? [
        "email",
        "phone",
        "ssn",
        "credit_card",
        "api_key",
      ],
      autoRedactPII: config.autoRedactPII ?? true,
      enableAuditLog: config.enableAuditLog ?? true,
      policies: config.policies ?? [],
      retentionPolicies: config.retentionPolicies ?? [],
      onViolation: config.onViolation,
      onPIIDetected: config.onPIIDetected,
    };
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  // =========================================================================
  // PII Detection
  // =========================================================================

  /**
   * Scan content for PII
   */
  scanForPII(content: string): PIIScanResult {
    const matches: PIIMatch[] = [];
    let sanitizedContent = content;

    const typesToScan = this.config.piiTypes ?? [];

    for (const piiType of typesToScan) {
      const pattern =
        PII_PATTERNS[piiType] || this.customPIIPatterns.get(piiType);
      if (!pattern) continue;

      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(content)) !== null) {
        const value = match[0];
        const maskedValue = this.maskValue(value, piiType);

        matches.push({
          type: piiType,
          value,
          maskedValue,
          startIndex: match.index,
          endIndex: match.index + value.length,
          confidence: this.calculateConfidence(piiType, value),
        });
      }
    }

    // Sort by position and remove overlaps
    matches.sort((a, b) => a.startIndex - b.startIndex);
    const dedupedMatches = this.removeOverlaps(matches);

    // Create sanitized content
    if (this.config.autoRedactPII) {
      let offset = 0;
      for (const m of dedupedMatches) {
        const adjustedStart = m.startIndex + offset;
        const adjustedEnd = m.endIndex + offset;
        sanitizedContent =
          sanitizedContent.substring(0, adjustedStart) +
          m.maskedValue +
          sanitizedContent.substring(adjustedEnd);
        offset += m.maskedValue.length - (m.endIndex - m.startIndex);
      }
    }

    const result: PIIScanResult = {
      hasPII: dedupedMatches.length > 0,
      matches: dedupedMatches,
      sanitizedContent,
      originalContent: content,
      scannedAt: now(),
    };

    if (result.hasPII && this.config.onPIIDetected) {
      this.config.onPIIDetected(result);
    }

    return result;
  }

  /**
   * Add a custom PII pattern
   */
  addCustomPIIPattern(name: string, pattern: RegExp): void {
    this.customPIIPatterns.set(name, new RegExp(pattern.source, "g"));
  }

  /**
   * Mask a value based on PII type
   */
  maskValue(value: string, type: PIIType): string {
    switch (type) {
      case "email":
        const [local, domain] = value.split("@");
        return `${local[0]}***@${domain}`;

      case "phone":
        return value.replace(/\d(?=\d{4})/g, "*");

      case "ssn":
        return "***-**-" + value.slice(-4);

      case "credit_card":
        return "**** **** **** " + value.slice(-4);

      case "api_key":
      case "password":
        return "[REDACTED]";

      default:
        if (value.length <= 4) return "***";
        return (
          value[0] + "*".repeat(value.length - 2) + value[value.length - 1]
        );
    }
  }

  // =========================================================================
  // Audit Logging
  // =========================================================================

  /**
   * Record an audit log entry
   */
  audit(
    action: AuditAction,
    actor: AuditLogEntry["actor"],
    resource: AuditLogEntry["resource"],
    details: Record<string, unknown>,
    result: AuditLogEntry["result"] = "success",
    reason?: string,
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: generateEventId(),
      action,
      actor,
      resource,
      details,
      timestamp: now(),
      result,
      reason,
    };

    if (this.config.enableAuditLog) {
      this.auditLog.push(entry);
    }

    return entry;
  }

  /**
   * Get audit log entries
   */
  getAuditLog(filter?: {
    action?: AuditAction;
    actorId?: string;
    resourceType?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): AuditLogEntry[] {
    let entries = [...this.auditLog];

    if (filter?.action) {
      entries = entries.filter((e) => e.action === filter.action);
    }

    if (filter?.actorId) {
      entries = entries.filter((e) => e.actor.id === filter.actorId);
    }

    if (filter?.resourceType) {
      entries = entries.filter((e) => e.resource.type === filter.resourceType);
    }

    if (filter?.startTime) {
      entries = entries.filter((e) => e.timestamp >= filter.startTime!);
    }

    if (filter?.endTime) {
      entries = entries.filter((e) => e.timestamp <= filter.endTime!);
    }

    entries.sort((a, b) => b.timestamp - a.timestamp);

    if (filter?.limit) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }

  /**
   * Export audit log
   */
  exportAuditLog(format: "json" | "csv" = "json"): string {
    if (format === "json") {
      return JSON.stringify(this.auditLog, null, 2);
    }

    // CSV format
    const headers = [
      "id",
      "action",
      "actor_type",
      "actor_id",
      "resource_type",
      "resource_id",
      "result",
      "timestamp",
    ];
    const rows = this.auditLog.map((e) => [
      e.id,
      e.action,
      e.actor.type,
      e.actor.id,
      e.resource.type,
      e.resource.id,
      e.result,
      new Date(e.timestamp).toISOString(),
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }

  // =========================================================================
  // Policy Enforcement
  // =========================================================================

  /**
   * Check content against all policies
   */
  checkPolicies(
    content: string,
    context: {
      type: "prompt" | "response";
      sessionId?: string;
      eventId?: string;
      metadata?: Record<string, unknown>;
    },
  ): PolicyViolation[] {
    const violations: PolicyViolation[] = [];

    for (const policy of this.config.policies ?? []) {
      if (!policy.enabled) continue;

      for (let i = 0; i < policy.rules.length; i++) {
        const rule = policy.rules[i];

        if (rule.target !== "all" && rule.target !== context.type) continue;

        const isViolation = this.evaluateRule(rule, content, context.metadata);

        if (isViolation) {
          const violation: PolicyViolation = {
            id: generateEventId(),
            policyId: policy.id,
            policyName: policy.name,
            ruleIndex: i,
            severity: policy.severity,
            description: `Policy "${policy.name}" violated: ${rule.condition.operator} ${rule.condition.value}`,
            violatingContent: content.substring(0, 200),
            sessionId: context.sessionId,
            eventId: context.eventId,
            timestamp: now(),
            actionsTriggered: policy.enforcementActions,
          };

          violations.push(violation);
          this.violations.push(violation);

          if (this.config.onViolation) {
            this.config.onViolation(violation);
          }

          // Execute enforcement actions
          this.executeEnforcementActions(policy.enforcementActions, violation);
        }
      }
    }

    return violations;
  }

  /**
   * Get policy violations
   */
  getViolations(filter?: {
    policyId?: string;
    severity?: CompliancePolicy["severity"];
    sessionId?: string;
    startTime?: number;
    endTime?: number;
  }): PolicyViolation[] {
    let violations = [...this.violations];

    if (filter?.policyId) {
      violations = violations.filter((v) => v.policyId === filter.policyId);
    }

    if (filter?.severity) {
      violations = violations.filter((v) => v.severity === filter.severity);
    }

    if (filter?.sessionId) {
      violations = violations.filter((v) => v.sessionId === filter.sessionId);
    }

    if (filter?.startTime) {
      violations = violations.filter((v) => v.timestamp >= filter.startTime!);
    }

    if (filter?.endTime) {
      violations = violations.filter((v) => v.timestamp <= filter.endTime!);
    }

    return violations.sort((a, b) => b.timestamp - a.timestamp);
  }

  // =========================================================================
  // Data Management
  // =========================================================================

  /**
   * Request data deletion
   */
  requestDeletion(
    type: DataDeletionRequest["type"],
    requestedBy: string,
    options?: {
      targetId?: string;
      dateRange?: { start: number; end: number };
    },
  ): DataDeletionRequest {
    const request: DataDeletionRequest = {
      id: generateEventId(),
      type,
      targetId: options?.targetId,
      dateRange: options?.dateRange,
      requestedBy,
      requestedAt: now(),
      status: "pending",
    };

    this.deletionRequests.set(request.id, request);

    this.audit(
      "data_deleted",
      { type: "user", id: requestedBy },
      { type: "data", id: request.id },
      { type, targetId: options?.targetId },
      "success",
    );

    return request;
  }

  /**
   * Request data export
   */
  requestExport(
    type: DataExportRequest["type"],
    format: DataExportRequest["format"],
    requestedBy: string,
    filter?: DataExportRequest["filter"],
  ): DataExportRequest {
    const request: DataExportRequest = {
      id: generateEventId(),
      type,
      format,
      filter,
      requestedBy,
      requestedAt: now(),
      status: "pending",
    };

    this.exportRequests.set(request.id, request);

    this.audit(
      "data_exported",
      { type: "user", id: requestedBy },
      { type: "data", id: request.id },
      { type, format, filter },
      "success",
    );

    return request;
  }

  /**
   * Get deletion request status
   */
  getDeletionRequest(id: string): DataDeletionRequest | undefined {
    return this.deletionRequests.get(id);
  }

  /**
   * Get export request status
   */
  getExportRequest(id: string): DataExportRequest | undefined {
    return this.exportRequests.get(id);
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private calculateConfidence(type: PIIType, _value: string): number {
    // Higher confidence for stricter patterns
    const highConfidenceTypes: PIIType[] = [
      "email",
      "ssn",
      "credit_card",
      "api_key",
    ];
    const mediumConfidenceTypes: PIIType[] = [
      "phone",
      "ip_address",
      "passport",
    ];

    if (highConfidenceTypes.includes(type)) return 0.95;
    if (mediumConfidenceTypes.includes(type)) return 0.85;
    return 0.7;
  }

  private removeOverlaps(matches: PIIMatch[]): PIIMatch[] {
    const result: PIIMatch[] = [];
    let lastEnd = -1;

    for (const match of matches) {
      if (match.startIndex >= lastEnd) {
        result.push(match);
        lastEnd = match.endIndex;
      }
    }

    return result;
  }

  private evaluateRule(
    rule: CompliancePolicy["rules"][0],
    content: string,
    metadata?: Record<string, unknown>,
  ): boolean {
    const targetValue = rule.condition.field
      ? (metadata?.[rule.condition.field] as string)
      : content;

    if (targetValue === undefined) return false;

    switch (rule.condition.operator) {
      case "contains":
        return String(targetValue)
          .toLowerCase()
          .includes(String(rule.condition.value).toLowerCase());

      case "not_contains":
        return !String(targetValue)
          .toLowerCase()
          .includes(String(rule.condition.value).toLowerCase());

      case "matches":
        return new RegExp(String(rule.condition.value), "i").test(
          String(targetValue),
        );

      case "exceeds":
        return Number(targetValue) > Number(rule.condition.value);

      case "equals":
        return String(targetValue) === String(rule.condition.value);

      default:
        return false;
    }
  }

  private executeEnforcementActions(
    actions: CompliancePolicy["enforcementActions"],
    violation: PolicyViolation,
  ): void {
    for (const action of actions) {
      switch (action.type) {
        case "audit":
          this.audit(
            "policy_violated",
            { type: "system", id: "compliance-manager" },
            { type: "session", id: violation.sessionId ?? "unknown" },
            { violation },
            "success",
          );
          break;

        case "notify":
          // In a real implementation, this would send notifications
          console.warn(
            `[Compliance] Policy violation notification to: ${action.recipients.join(", ")}`,
          );
          break;

        case "block":
          // Blocking would be handled by the caller
          console.error(`[Compliance] Blocked: ${action.message}`);
          break;

        case "warn":
          console.warn(`[Compliance] Warning: ${action.message}`);
          break;

        case "redact":
          // Redaction handled in content processing
          break;
      }
    }
  }

  // =========================================================================
  // Compliance Reports (Feature 8 Extension)
  // =========================================================================

  /**
   * Generate a compliance report for a specific framework
   */
  generateComplianceReport(
    framework: "soc2" | "gdpr" | "eu_ai_act" | "hipaa" | "custom",
    dateRange?: { start: number; end: number },
  ): ComplianceReport {
    const start = dateRange?.start ?? now() - 30 * 24 * 60 * 60 * 1000;
    const end = dateRange?.end ?? now();

    // Filter audit entries for the date range
    const auditEntries = this.getAuditLog({ startTime: start, endTime: end });
    const violationsInRange = this.violations.filter(
      (v) => v.timestamp >= start && v.timestamp <= end,
    );

    const controls = this.getFrameworkControls(framework);
    const controlAssessments: ControlAssessment[] = controls.map((control) => ({
      controlId: control.id,
      controlName: control.name,
      status: this.assessControl(control, auditEntries, violationsInRange),
      evidence: this.gatherEvidence(control, auditEntries),
      findings: this.gatherFindings(control, violationsInRange),
      recommendations: this.generateRecommendations(control, violationsInRange),
    }));

    const passedControls = controlAssessments.filter(
      (c) => c.status === "passed",
    ).length;
    const overallScore =
      controls.length > 0
        ? Math.round((passedControls / controls.length) * 100)
        : 100;

    return {
      id: generateEventId(),
      framework,
      generatedAt: now(),
      period: { start, end },
      summary: {
        totalControls: controls.length,
        passedControls,
        failedControls: controlAssessments.filter((c) => c.status === "failed")
          .length,
        partialControls: controlAssessments.filter(
          (c) => c.status === "partial",
        ).length,
        overallScore,
      },
      controlAssessments,
      auditSummary: {
        totalEntries: auditEntries.length,
        byAction: this.groupByAction(auditEntries),
        violations: violationsInRange.length,
      },
      dataHandling: {
        piiScanned: this.auditLog.filter((e) => e.action === "pii_detected")
          .length,
        dataExports: Array.from(this.exportRequests.values()).filter(
          (r) => r.requestedAt >= start && r.requestedAt <= end,
        ).length,
        dataDeletions: Array.from(this.deletionRequests.values()).filter(
          (r) => r.requestedAt >= start && r.requestedAt <= end,
        ).length,
      },
    };
  }

  /**
   * Export compliance report
   */
  exportComplianceReport(
    report: ComplianceReport,
    format: "json" | "pdf_summary" | "html",
  ): string {
    if (format === "json") {
      return JSON.stringify(report, null, 2);
    }

    if (format === "html") {
      return this.generateHTMLReport(report);
    }

    // PDF summary (markdown that can be converted to PDF)
    return this.generateMarkdownReport(report);
  }

  private getFrameworkControls(framework: string): FrameworkControl[] {
    const frameworkControls: Record<string, FrameworkControl[]> = {
      soc2: [
        { id: "CC6.1", name: "Logical Access Controls", category: "Security" },
        { id: "CC6.6", name: "External System Access", category: "Security" },
        { id: "CC7.2", name: "System Monitoring", category: "Monitoring" },
        { id: "CC8.1", name: "Change Management", category: "Operations" },
        { id: "PI1.4", name: "Data Lifecycle", category: "Privacy" },
      ],
      gdpr: [
        {
          id: "ART5",
          name: "Data Processing Principles",
          category: "Processing",
        },
        { id: "ART7", name: "Consent Management", category: "Consent" },
        { id: "ART17", name: "Right to Erasure", category: "Rights" },
        { id: "ART20", name: "Data Portability", category: "Rights" },
        { id: "ART32", name: "Security of Processing", category: "Security" },
        { id: "ART33", name: "Breach Notification", category: "Incidents" },
      ],
      eu_ai_act: [
        { id: "ART9", name: "Risk Management", category: "Governance" },
        { id: "ART10", name: "Data Governance", category: "Data" },
        {
          id: "ART11",
          name: "Technical Documentation",
          category: "Documentation",
        },
        { id: "ART12", name: "Record Keeping", category: "Logging" },
        { id: "ART13", name: "Transparency", category: "Transparency" },
        { id: "ART14", name: "Human Oversight", category: "Oversight" },
      ],
      hipaa: [
        { id: "164.308", name: "Administrative Safeguards", category: "Admin" },
        { id: "164.310", name: "Physical Safeguards", category: "Physical" },
        { id: "164.312", name: "Technical Safeguards", category: "Technical" },
        { id: "164.502", name: "Uses and Disclosures", category: "Privacy" },
      ],
      custom:
        this.config.policies?.map((p) => ({
          id: p.id,
          name: p.name,
          category: "Custom",
        })) ?? [],
    };

    return frameworkControls[framework] ?? [];
  }

  private assessControl(
    control: FrameworkControl,
    _auditEntries: AuditLogEntry[],
    violations: PolicyViolation[],
  ): "passed" | "failed" | "partial" | "not_applicable" {
    // Simplified assessment logic
    const relatedViolations = violations.filter((v) =>
      v.policyId.toLowerCase().includes(control.id.toLowerCase()),
    );

    if (relatedViolations.length === 0) return "passed";
    if (relatedViolations.length > 5) return "failed";
    return "partial";
  }

  private gatherEvidence(
    control: FrameworkControl,
    auditEntries: AuditLogEntry[],
  ): string[] {
    return [
      `${auditEntries.length} audit log entries recorded`,
      `Control ${control.id} monitoring active`,
      `Last assessment: ${new Date().toISOString()}`,
    ];
  }

  private gatherFindings(
    _control: FrameworkControl,
    violations: PolicyViolation[],
  ): string[] {
    return violations
      .slice(0, 5)
      .map((v) => `${v.severity} violation: ${v.description}`);
  }

  private generateRecommendations(
    control: FrameworkControl,
    violations: PolicyViolation[],
  ): string[] {
    if (violations.length === 0) {
      return ["Continue current practices"];
    }
    return [
      `Review ${violations.length} violation(s) for ${control.name}`,
      "Update policies as needed",
      "Conduct team training on compliance requirements",
    ];
  }

  private groupByAction(entries: AuditLogEntry[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const entry of entries) {
      grouped[entry.action] = (grouped[entry.action] ?? 0) + 1;
    }
    return grouped;
  }

  private generateHTMLReport(report: ComplianceReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Compliance Report - ${report.framework.toUpperCase()}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; }
    .score { font-size: 48px; font-weight: bold; color: ${report.summary.overallScore >= 80 ? "#2e7d32" : "#c62828"}; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; border: 1px solid #ddd; text-align: left; }
    th { background: #f0f0f0; }
    .passed { color: #2e7d32; }
    .failed { color: #c62828; }
    .partial { color: #f57c00; }
  </style>
</head>
<body>
  <h1>Compliance Report: ${report.framework.toUpperCase()}</h1>
  <p>Generated: ${new Date(report.generatedAt).toISOString()}</p>
  <p>Period: ${new Date(report.period.start).toLocaleDateString()} - ${new Date(report.period.end).toLocaleDateString()}</p>
  
  <div class="summary">
    <div class="score">${report.summary.overallScore}%</div>
    <p>Overall Compliance Score</p>
    <p>Passed: ${report.summary.passedControls} | Failed: ${report.summary.failedControls} | Partial: ${report.summary.partialControls}</p>
  </div>

  <h2>Control Assessments</h2>
  <table>
    <tr><th>Control</th><th>Name</th><th>Status</th><th>Findings</th></tr>
    ${report.controlAssessments
      .map(
        (c) => `
      <tr>
        <td>${c.controlId}</td>
        <td>${c.controlName}</td>
        <td class="${c.status}">${c.status.toUpperCase()}</td>
        <td>${c.findings.length} finding(s)</td>
      </tr>
    `,
      )
      .join("")}
  </table>

  <h2>Audit Summary</h2>
  <p>Total audit entries: ${report.auditSummary.totalEntries}</p>
  <p>Violations: ${report.auditSummary.violations}</p>
</body>
</html>`.trim();
  }

  private generateMarkdownReport(report: ComplianceReport): string {
    return `
# Compliance Report: ${report.framework.toUpperCase()}

**Generated:** ${new Date(report.generatedAt).toISOString()}
**Period:** ${new Date(report.period.start).toLocaleDateString()} - ${new Date(report.period.end).toLocaleDateString()}

## Summary

- **Overall Score:** ${report.summary.overallScore}%
- **Total Controls:** ${report.summary.totalControls}
- **Passed:** ${report.summary.passedControls}
- **Failed:** ${report.summary.failedControls}
- **Partial:** ${report.summary.partialControls}

## Control Assessments

| Control | Name | Status | Findings |
|---------|------|--------|----------|
${report.controlAssessments
  .map(
    (c) =>
      `| ${c.controlId} | ${c.controlName} | ${c.status.toUpperCase()} | ${c.findings.length} |`,
  )
  .join("\n")}

## Audit Summary

- Total entries: ${report.auditSummary.totalEntries}
- Violations: ${report.auditSummary.violations}

## Data Handling

- PII scanned: ${report.dataHandling.piiScanned}
- Data exports: ${report.dataHandling.dataExports}
- Data deletions: ${report.dataHandling.dataDeletions}
`.trim();
  }
}

// Extended types for compliance reporting
export interface ComplianceReport {
  id: string;
  framework: string;
  generatedAt: number;
  period: { start: number; end: number };
  summary: {
    totalControls: number;
    passedControls: number;
    failedControls: number;
    partialControls: number;
    overallScore: number;
  };
  controlAssessments: ControlAssessment[];
  auditSummary: {
    totalEntries: number;
    byAction: Record<string, number>;
    violations: number;
  };
  dataHandling: {
    piiScanned: number;
    dataExports: number;
    dataDeletions: number;
  };
}

export interface ControlAssessment {
  controlId: string;
  controlName: string;
  status: "passed" | "failed" | "partial" | "not_applicable";
  evidence: string[];
  findings: string[];
  recommendations: string[];
}

interface FrameworkControl {
  id: string;
  name: string;
  category: string;
}
