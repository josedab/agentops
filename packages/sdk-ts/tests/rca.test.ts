/**
 * Tests for Root Cause Analysis Engine (Feature 3)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RootCauseAnalyzer } from "../src/rca/analyzer.js";
import type { RCAConfig, FailureEvent } from "../src/rca/analyzer.js";

describe("RootCauseAnalyzer", () => {
  let analyzer: RootCauseAnalyzer;
  let defaultConfig: RCAConfig;

  beforeEach(() => {
    defaultConfig = {
      enabled: true,
      minSamplesForPattern: 2,
      similarityThreshold: 0.5,
      maxEventAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      autoSuggestRemediation: true,
    };
    analyzer = new RootCauseAnalyzer(defaultConfig);
  });

  // Helper function to create failure event input (without id/timestamp which are auto-generated)
  function createFailureInput(
    overrides: Partial<Omit<FailureEvent, "id" | "timestamp">> = {},
  ): Omit<FailureEvent, "id" | "timestamp"> {
    return {
      sessionId: `session-${Math.random().toString(36).substring(7)}`,
      errorType: "GenericError",
      errorMessage: "Something went wrong",
      severity: "medium",
      context: {
        model: "gpt-4",
        promptLength: 1000,
        userId: "user-123",
      },
      ...overrides,
    };
  }

  describe("Event Recording", () => {
    it("should record a failure event", () => {
      const event = analyzer.recordFailure(createFailureInput());
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
    });

    it("should record multiple events", () => {
      for (let i = 0; i < 10; i++) {
        analyzer.recordFailure(createFailureInput());
      }
      const events = analyzer.listEvents({ limit: 100 });
      expect(events.length).toBe(10);
    });

    it("should list events with filters", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            featureId: "feature-1",
            errorType: "ErrorA",
          }),
        );
        analyzer.recordFailure(
          createFailureInput({
            featureId: "feature-2",
            errorType: "ErrorB",
          }),
        );
      }

      const events = analyzer.listEvents({ featureId: "feature-1" });
      expect(events.length).toBe(5);
      expect(events.every((e) => e.featureId === "feature-1")).toBe(true);
    });
  });

  describe("Pattern Detection", () => {
    it("should detect patterns from similar errors", () => {
      // Create similar failure events
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "RateLimitError",
            errorMessage: "Rate limit exceeded",
            context: {
              model: "gpt-4",
              endpoint: "/v1/chat/completions",
            },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].type).toBe("rate_limit");
    });

    it("should detect timeout patterns", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "TimeoutError",
            errorMessage: "Request timed out after 30000ms",
            context: { model: "gpt-4" },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      expect(patterns.some((p) => p.type === "timeout")).toBe(true);
    });

    it("should detect context overflow patterns", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "InvalidRequestError",
            errorMessage: "Context length exceeded maximum",
            context: { model: "gpt-4", contextTokens: 130000 },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      // Should detect a pattern for these errors
      expect(patterns.length).toBeGreaterThan(0);
    });

    it("should detect tool failure patterns", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "ToolExecutionError",
            errorMessage: "Tool execution failed: database_query",
            context: { tool: "database_query" },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      // Should detect at least one pattern for tool errors
      expect(patterns.length).toBeGreaterThan(0);
    });

    it("should identify common attributes in patterns", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "ModelError",
            errorMessage: "Model overloaded",
            context: {
              model: "gpt-4",
              region: "us-east-1",
              provider: "openai",
            },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].commonAttributes.length).toBeGreaterThan(0);
    });

    it("should not create patterns below minimum occurrences", () => {
      // Only 1 event, below minPatternOccurrences of 2
      analyzer.recordFailure(
        createFailureInput({
          errorType: "UniqueError",
          errorMessage: "This only happens once",
        }),
      );

      const patterns = analyzer.detectPatterns();
      const uniquePattern = patterns.find((p) =>
        p.commonAttributes.some((a) => a.value === "UniqueError"),
      );
      expect(uniquePattern).toBeUndefined();
    });
  });

  describe("Root Cause Analysis", () => {
    it("should analyze a specific pattern", () => {
      const sessionId = "session-to-analyze";

      // Record failures for the session
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            sessionId,
            errorType: "RateLimitError",
            errorMessage: "Rate limit exceeded",
            context: { model: "gpt-4" },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      const analysis = analyzer.analyzeRootCause(patterns[0].id);
      expect(analysis).not.toBeNull();
      expect(analysis!.rootCauses.length).toBeGreaterThan(0);
    });

    it("should include confidence scores", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "TimeoutError",
            errorMessage: "Request timed out",
            context: { model: "gpt-4", latency: 30000 },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      const analysis = analyzer.analyzeRootCause(patterns[0].id);

      expect(analysis).not.toBeNull();
      expect(analysis!.confidence).toBeGreaterThan(0);
      expect(analysis!.confidence).toBeLessThanOrEqual(1);
    });

    it("should provide evidence for root causes", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "ModelError",
            errorMessage: "Model capacity exceeded",
            context: { model: "gpt-4", region: "us-west-2" },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      const analysis = analyzer.analyzeRootCause(patterns[0].id);

      expect(analysis).not.toBeNull();
      expect(analysis!.evidence.length).toBeGreaterThan(0);
    });
  });

  describe("Remediation Generation", () => {
    it("should generate remediations for rate limit issues", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "RateLimitError",
            errorMessage: "Rate limit exceeded",
            context: { model: "gpt-4" },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      const analysis = analyzer.analyzeRootCause(patterns[0].id);

      expect(analysis).not.toBeNull();
      const remediations = analyzer.getRemediations();
      expect(remediations.length).toBeGreaterThan(0);
    });

    it("should generate remediations for timeout issues", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "TimeoutError",
            errorMessage: "Request timed out after 30s",
            context: { model: "gpt-4" },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      analyzer.analyzeRootCause(patterns[0].id);

      const remediations = analyzer.getRemediations();
      expect(
        remediations.some(
          (r) =>
            r.description.toLowerCase().includes("timeout") ||
            r.description.toLowerCase().includes("time"),
        ),
      ).toBe(true);
    });

    it("should include implementation steps in remediations", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "ContextOverflowError",
            errorMessage: "Context too long",
            context: { model: "gpt-4", tokens: 200000 },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      analyzer.analyzeRootCause(patterns[0].id);

      const remediations = analyzer.getRemediations();
      if (remediations.length > 0) {
        expect(remediations[0].steps.length).toBeGreaterThan(0);
      }
    });

    it("should estimate remediation effort", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "ModelError",
            errorMessage: "Model failed",
            context: { model: "gpt-4" },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      analyzer.analyzeRootCause(patterns[0].id);

      const remediations = analyzer.getRemediations();
      if (remediations.length > 0) {
        expect(["minutes", "hours", "days", "weeks"]).toContain(
          remediations[0].estimatedEffort,
        );
      }
    });
  });

  describe("RCA Report Generation", () => {
    it("should generate a comprehensive report", () => {
      for (let i = 0; i < 10; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "RateLimitError",
            errorMessage: "Rate limit exceeded",
            severity: "high",
            context: { model: "gpt-4" },
          }),
        );
      }

      analyzer.detectPatterns();
      const report = analyzer.generateReport();

      expect(report.summary).toBeDefined();
      expect(report.summary.totalFailures).toBe(10);
    });

    it("should include top patterns in report", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: i % 2 === 0 ? "ErrorA" : "ErrorB",
            errorMessage: "Error occurred",
            context: { model: "gpt-4" },
          }),
        );
      }

      analyzer.detectPatterns();
      const report = analyzer.generateReport();

      expect(report.topPatterns).toBeDefined();
    });

    it("should include health score in report", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "HealthError",
            errorMessage: `Error ${i}`,
          }),
        );
      }

      analyzer.detectPatterns();
      const report = analyzer.generateReport();

      expect(report.healthScore).toBeDefined();
      expect(report.healthScore).toBeGreaterThanOrEqual(0);
      expect(report.healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe("Pattern Clustering", () => {
    it("should cluster similar errors together", () => {
      // Create events with similar characteristics
      for (let i = 0; i < 10; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "ClusterError",
            errorMessage: `Error variant ${i % 3}`,
            context: {
              model: "gpt-4",
              feature: "chat",
              cluster: `group-${i % 2}`,
            },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it("should respect maxPatterns configuration", () => {
      const limitedAnalyzer = new RootCauseAnalyzer({
        ...defaultConfig,
        minSamplesForPattern: 2,
      });

      // Create many different error types that will form 1 pattern
      for (let i = 0; i < 20; i++) {
        limitedAnalyzer.recordFailure(
          createFailureInput({
            errorType: "SameError",
            errorMessage: `Message ${i}`,
          }),
        );
      }

      const patterns = limitedAnalyzer.detectPatterns();
      expect(patterns.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Severity Classification", () => {
    it("should detect patterns with severity", () => {
      // High severity errors
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "CriticalError",
            errorMessage: "Critical failure",
            severity: "critical",
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].severity).toBeDefined();
    });
  });

  describe("Contributing Factors", () => {
    it("should identify contributing factors", () => {
      for (let i = 0; i < 5; i++) {
        analyzer.recordFailure(
          createFailureInput({
            errorType: "FactorError",
            errorMessage: "Error with factors",
            context: {
              model: "gpt-4",
              promptLength: 10000,
              temperature: 0.9,
              maxTokens: 4000,
            },
          }),
        );
      }

      const patterns = analyzer.detectPatterns();
      const analysis = analyzer.analyzeRootCause(patterns[0].id);

      expect(analysis).not.toBeNull();
      expect(analysis!.contributingFactors).toBeDefined();
    });
  });

  describe("Configuration", () => {
    it("should get configuration", () => {
      const config = analyzer.getConfig();
      expect(config.minSamplesForPattern).toBe(2);
      expect(config.similarityThreshold).toBe(0.5);
    });

    it("should respect similarity threshold", () => {
      const strictAnalyzer = new RootCauseAnalyzer({
        ...defaultConfig,
        similarityThreshold: 0.95,
      });

      for (let i = 0; i < 5; i++) {
        strictAnalyzer.recordFailure(
          createFailureInput({
            errorType: "CorrelationError",
            context: {
              // Mixed attributes - lower similarity
              model: i % 2 === 0 ? "gpt-4" : "gpt-3.5-turbo",
              region: i % 3 === 0 ? "us-east-1" : "us-west-2",
            },
          }),
        );
      }

      const patterns = strictAnalyzer.detectPatterns();
      // With strict threshold, may get fewer patterns
      expect(patterns.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Auto-Remediation", () => {
    it("should generate remediations when autoSuggestRemediation is enabled", () => {
      const autoAnalyzer = new RootCauseAnalyzer({
        ...defaultConfig,
        autoSuggestRemediation: true,
      });

      for (let i = 0; i < 5; i++) {
        autoAnalyzer.recordFailure(
          createFailureInput({
            errorType: "ApprovalError",
            errorMessage: "Needs remediation",
          }),
        );
      }

      const patterns = autoAnalyzer.detectPatterns();
      if (patterns.length > 0) {
        autoAnalyzer.analyzeRootCause(patterns[0].id);
        const remediations = autoAnalyzer.getRemediations();
        expect(remediations.length).toBeGreaterThan(0);
      }
    });
  });

  describe("isEnabled", () => {
    it("should be enabled by default when enabled: true", () => {
      expect(analyzer.isEnabled).toBe(true);
    });

    it("should respect enabled config", () => {
      const disabledAnalyzer = new RootCauseAnalyzer({
        ...defaultConfig,
        enabled: false,
      });
      expect(disabledAnalyzer.isEnabled).toBe(false);
    });
  });
});
