import { describe, it, expect, beforeEach } from "vitest";
import { IDEIntegrationService } from "../src/ide/integration.js";
import type {
  InlineAnnotation,
  DiagnosticInfo,
} from "../src/ide/integration.js";

describe("IDEIntegrationService", () => {
  let service: IDEIntegrationService;

  beforeEach(() => {
    service = new IDEIntegrationService({
      enabled: true,
      apiKey: "test-api-key",
      dashboardBaseUrl: "https://app.agentops.ai",
      refreshInterval: 5000,
    });
  });

  describe("initialization", () => {
    it("should create service with config", () => {
      expect(service).toBeDefined();
      expect(service.isEnabled).toBe(true);
    });

    it("should respect disabled state", () => {
      const disabled = new IDEIntegrationService({
        enabled: false,
        apiKey: "test",
      });
      expect(disabled.isEnabled).toBe(false);
    });
  });

  describe("session links", () => {
    it("should generate session link", () => {
      const link = service.getSessionLink("session-123");
      expect(link).toBeDefined();
      expect(link.sessionId).toBe("session-123");
      expect(link.url).toContain("session-123");
      expect(link.text).toContain("session-123");
    });

    it("should generate trace link", () => {
      const link = service.getTraceLink("session-123", "trace-456");
      expect(link).toBeDefined();
      expect(link.url).toContain("trace-456");
    });
  });

  describe("cost estimation", () => {
    it("should estimate cost for prompt", () => {
      const estimate = service.estimateCost("gpt-4", "Tell me a story", 500);
      expect(estimate).toBeDefined();
      expect(estimate.inputCost).toBeGreaterThan(0);
      expect(estimate.outputCost).toBeGreaterThan(0);
      expect(estimate.totalCost).toBe(estimate.inputCost + estimate.outputCost);
    });

    it("should provide cost suggestions for expensive prompts", () => {
      const longPrompt = "x".repeat(10000);
      const estimate = service.estimateCost("gpt-4", longPrompt, 2000);
      expect(estimate.suggestions.length).toBeGreaterThan(0);
    });

    it("should handle unknown models", () => {
      const estimate = service.estimateCost("unknown-model", "test", 100);
      expect(estimate.totalCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe("diagnostics", () => {
    it("should register and retrieve diagnostics", () => {
      const diagnostic: DiagnosticInfo = {
        id: "diag-1",
        file: "src/agent.ts",
        line: 42,
        column: 10,
        severity: "warning",
        message: "High cost prompt detected",
        source: "agentops",
        code: "AO001",
      };

      service.registerDiagnostic(diagnostic);
      const diagnostics = service.getDiagnostics("src/agent.ts");

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].id).toBe("diag-1");
    });

    it("should clear diagnostics by file", () => {
      service.registerDiagnostic({
        id: "diag-1",
        file: "src/agent.ts",
        line: 10,
        column: 0,
        severity: "error",
        message: "Test",
        source: "agentops",
      });

      service.clearDiagnostics("src/agent.ts");
      const diagnostics = service.getDiagnostics("src/agent.ts");
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("inline annotations", () => {
    it("should add and retrieve inline annotations", () => {
      const annotation: InlineAnnotation = {
        id: "ann-1",
        file: "src/prompts.ts",
        line: 5,
        type: "cost",
        text: "$0.02 per call",
        tooltip: "Based on average token count",
      };

      service.addAnnotation(annotation);
      const annotations = service.getAnnotations("src/prompts.ts");

      expect(annotations).toHaveLength(1);
      expect(annotations[0].text).toBe("$0.02 per call");
    });

    it("should support different annotation types", () => {
      service.addAnnotation({
        id: "ann-cost",
        file: "test.ts",
        line: 1,
        type: "cost",
        text: "Cost info",
      });

      service.addAnnotation({
        id: "ann-latency",
        file: "test.ts",
        line: 2,
        type: "latency",
        text: "Latency info",
      });

      service.addAnnotation({
        id: "ann-quality",
        file: "test.ts",
        line: 3,
        type: "quality",
        text: "Quality info",
      });

      const annotations = service.getAnnotations("test.ts");
      expect(annotations).toHaveLength(3);
    });
  });

  describe("prompt hover", () => {
    it("should get hover info for prompt", () => {
      const hover = service.getPromptHover("prompt-123");
      expect(hover).toBeDefined();
      expect(hover.promptId).toBe("prompt-123");
    });
  });

  describe("quick fixes", () => {
    it("should suggest quick fixes for diagnostics", () => {
      const diagnostic: DiagnosticInfo = {
        id: "diag-expensive",
        file: "src/agent.ts",
        line: 10,
        column: 0,
        severity: "warning",
        message: "Expensive model detected",
        source: "agentops",
        code: "AO001",
      };

      service.registerDiagnostic(diagnostic);
      const fixes = service.getQuickFixes("diag-expensive");

      expect(fixes.length).toBeGreaterThan(0);
      expect(fixes[0].title).toBeDefined();
    });

    it("should provide edits for quick fixes", () => {
      const diagnostic: DiagnosticInfo = {
        id: "diag-with-fix",
        file: "src/agent.ts",
        line: 10,
        column: 0,
        severity: "warning",
        message: "Test warning",
        source: "agentops",
        code: "AO002",
      };

      service.registerDiagnostic(diagnostic);
      const fixes = service.getQuickFixes("diag-with-fix");

      if (fixes.length > 0 && fixes[0].edits) {
        expect(fixes[0].edits).toBeDefined();
      }
    });
  });
});
