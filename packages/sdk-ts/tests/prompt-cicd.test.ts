import { describe, it, expect, vi } from "vitest";
import { PromptCICDEngine } from "../src/prompt-cicd/index";
import type {
  PromptTestSuite,
  TestAssertion,
  TestSuiteResult,
  CIGateConfig,
  GitHubActionConfig,
  PromptExecutor,
} from "../src/prompt-cicd/index";

function createMockExecutor(
  response = "Hello, world!",
  overrides?: Partial<Awaited<ReturnType<PromptExecutor["execute"]>>>,
): PromptExecutor {
  return {
    execute: vi.fn().mockResolvedValue({
      response,
      tokens: { prompt: 10, completion: 20 },
      latencyMs: 150,
      costUsd: 0.002,
      ...overrides,
    }),
  };
}

describe("Prompt CI/CD Module", () => {
  const engine = new PromptCICDEngine();

  // ==========================================================================
  // YAML DSL Parsing
  // ==========================================================================
  describe("parseTestSuite", () => {
    it("should parse a basic YAML test suite", () => {
      const yaml = `
name: My Test Suite
model: gpt-4o
tests:
  - name: Basic greeting
    input: "Hello"
    assertions:
      - type: contains
        value: hello
      - type: cost_under
        value: 0.01
`;
      const suite = engine.parseTestSuite(yaml);

      expect(suite.name).toBe("My Test Suite");
      expect(suite.model).toBe("gpt-4o");
      expect(suite.prompts).toHaveLength(1);
      expect(suite.prompts[0].name).toBe("Basic greeting");
      expect(suite.prompts[0].input).toBe("Hello");
      expect(suite.prompts[0].assertions).toHaveLength(2);
      expect(suite.prompts[0].assertions[0].type).toBe("contains");
      expect(suite.prompts[0].assertions[0].value).toBe("hello");
      expect(suite.prompts[0].assertions[1].type).toBe("cost_under");
      expect(suite.prompts[0].assertions[1].value).toBe(0.01);
    });

    it("should parse multiple test cases", () => {
      const yaml = `
name: Multi Test
model: gpt-4o
tests:
  - name: Test One
    input: "First input"
    assertions:
      - type: contains
        value: first
  - name: Test Two
    input: "Second input"
    assertions:
      - type: regex
        value: "\\\\w+"
`;
      const suite = engine.parseTestSuite(yaml);

      expect(suite.prompts).toHaveLength(2);
      expect(suite.prompts[0].name).toBe("Test One");
      expect(suite.prompts[1].name).toBe("Test Two");
    });

    it("should parse suite with description", () => {
      const yaml = `
name: Described Suite
description: A suite with a description
tests:
  - name: Test
    input: "Hello"
    assertions:
      - type: contains
        value: hello
`;
      const suite = engine.parseTestSuite(yaml);

      expect(suite.description).toBe("A suite with a description");
    });

    it("should generate a valid suite id from name", () => {
      const yaml = `
name: My Complex Suite Name
tests:
  - name: Test
    input: "Hello"
    assertions:
      - type: contains
        value: hello
`;
      const suite = engine.parseTestSuite(yaml);
      expect(suite.id).toBe("my-complex-suite-name");
    });
  });

  // ==========================================================================
  // YAML Serialization Roundtrip
  // ==========================================================================
  describe("serializeTestSuite / roundtrip", () => {
    it("should serialize and re-parse a suite", () => {
      const original: PromptTestSuite = {
        id: "roundtrip-suite",
        name: "Roundtrip Suite",
        description: "Testing roundtrip",
        model: "gpt-4o",
        prompts: [
          {
            id: "roundtrip-suite-0",
            name: "Greeting Test",
            input: "Hello",
            assertions: [
              { type: "contains", value: "hello" },
              { type: "cost_under", value: 0.01 },
            ],
          },
        ],
      };

      const yaml = engine.serializeTestSuite(original);
      expect(yaml).toContain("name: Roundtrip Suite");
      expect(yaml).toContain("model: gpt-4o");
      expect(yaml).toContain("Greeting Test");

      const reparsed = engine.parseTestSuite(yaml);
      expect(reparsed.name).toBe(original.name);
      expect(reparsed.model).toBe(original.model);
      expect(reparsed.prompts).toHaveLength(1);
      expect(reparsed.prompts[0].name).toBe("Greeting Test");
      expect(reparsed.prompts[0].assertions).toHaveLength(2);
      expect(reparsed.prompts[0].assertions[0].type).toBe("contains");
      expect(reparsed.prompts[0].assertions[1].value).toBe(0.01);
    });
  });

  // ==========================================================================
  // Assertion Evaluation
  // ==========================================================================
  describe("evaluateAssertion", () => {
    const baseResult = {
      response: "Hello, world! This is a JSON test.",
      costUsd: 0.005,
      latencyMs: 200,
      qualityScore: 0.85,
    };

    it("should evaluate contains assertion - pass", () => {
      const assertion: TestAssertion = { type: "contains", value: "hello" };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(true);
    });

    it("should evaluate contains assertion - fail", () => {
      const assertion: TestAssertion = { type: "contains", value: "goodbye" };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(false);
    });

    it("should evaluate not_contains assertion - pass", () => {
      const assertion: TestAssertion = {
        type: "not_contains",
        value: "goodbye",
      };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(true);
    });

    it("should evaluate not_contains assertion - fail", () => {
      const assertion: TestAssertion = {
        type: "not_contains",
        value: "hello",
      };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(false);
    });

    it("should evaluate regex assertion - pass", () => {
      const assertion: TestAssertion = {
        type: "regex",
        value: "Hello,\\s+world",
      };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(true);
    });

    it("should evaluate regex assertion - fail", () => {
      const assertion: TestAssertion = {
        type: "regex",
        value: "^Goodbye",
      };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(false);
    });

    it("should evaluate json_schema assertion - pass", () => {
      const assertion: TestAssertion = { type: "json_schema", value: "{}" };
      const result = engine.evaluateAssertion(assertion, {
        ...baseResult,
        response: '{"key": "value"}',
      });
      expect(result.passed).toBe(true);
    });

    it("should evaluate json_schema assertion - fail", () => {
      const assertion: TestAssertion = { type: "json_schema", value: "{}" };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(false);
    });

    it("should evaluate cost_under assertion - pass", () => {
      const assertion: TestAssertion = { type: "cost_under", value: 0.01 };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(true);
    });

    it("should evaluate cost_under assertion - fail", () => {
      const assertion: TestAssertion = { type: "cost_under", value: 0.001 };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(false);
    });

    it("should evaluate latency_under assertion - pass", () => {
      const assertion: TestAssertion = { type: "latency_under", value: 300 };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(true);
    });

    it("should evaluate latency_under assertion - fail", () => {
      const assertion: TestAssertion = { type: "latency_under", value: 100 };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(false);
    });

    it("should evaluate quality_above assertion - pass", () => {
      const assertion: TestAssertion = { type: "quality_above", value: 0.8 };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(true);
    });

    it("should evaluate quality_above assertion - fail", () => {
      const assertion: TestAssertion = { type: "quality_above", value: 0.9 };
      const result = engine.evaluateAssertion(assertion, baseResult);
      expect(result.passed).toBe(false);
    });

    it("should evaluate semantic_similarity assertion", () => {
      const assertion: TestAssertion = {
        type: "semantic_similarity",
        value: "Hello world",
      };
      const result = engine.evaluateAssertion(assertion, baseResult);
      // "Hello" and "world" are both in the response
      expect(result.passed).toBe(true);
    });
  });

  // ==========================================================================
  // Test Suite Execution
  // ==========================================================================
  describe("runTestSuite", () => {
    it("should execute all tests with mock executor", async () => {
      const suite: PromptTestSuite = {
        id: "exec-suite",
        name: "Execution Suite",
        model: "gpt-4o",
        prompts: [
          {
            id: "test-1",
            name: "Test One",
            input: "Say hello",
            assertions: [{ type: "contains", value: "hello" }],
          },
          {
            id: "test-2",
            name: "Test Two",
            input: "Say world",
            assertions: [{ type: "contains", value: "world" }],
          },
        ],
      };

      const executor = createMockExecutor("Hello, world!");
      const result = await engine.runTestSuite(suite, executor);

      expect(result.suiteId).toBe("exec-suite");
      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.summary).toContain("2/2");
      expect(executor.execute).toHaveBeenCalledTimes(2);
    });

    it("should report failures when assertions fail", async () => {
      const suite: PromptTestSuite = {
        id: "fail-suite",
        name: "Failure Suite",
        model: "gpt-4o",
        prompts: [
          {
            id: "test-fail",
            name: "Failing Test",
            input: "Say hello",
            assertions: [{ type: "contains", value: "goodbye" }],
          },
        ],
      };

      const executor = createMockExecutor("Hello there");
      const result = await engine.runTestSuite(suite, executor);

      expect(result.passed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0].passed).toBe(false);
    });

    it("should use model from test case over suite", async () => {
      const suite: PromptTestSuite = {
        id: "model-suite",
        name: "Model Override Suite",
        model: "gpt-4o",
        prompts: [
          {
            id: "test-model",
            name: "Model Test",
            input: "Hello",
            model: "gpt-3.5-turbo",
            assertions: [{ type: "contains", value: "hello" }],
          },
        ],
      };

      const executor = createMockExecutor("Hello!");
      const result = await engine.runTestSuite(suite, executor);

      expect(result.results[0].model).toBe("gpt-3.5-turbo");
      expect(executor.execute).toHaveBeenCalledWith("Hello", {
        model: "gpt-3.5-turbo",
        temperature: undefined,
        maxTokens: undefined,
      });
    });
  });

  // ==========================================================================
  // CI Gate
  // ==========================================================================
  describe("checkCIGate", () => {
    const defaultGateConfig: CIGateConfig = {
      qualityThreshold: 0.7,
      maxCostPerTest: 0.01,
      maxLatencyMs: 500,
      minPassRate: 0.8,
      blockOnFailure: true,
    };

    function makeSuiteResult(
      overrides?: Partial<TestSuiteResult>,
    ): TestSuiteResult {
      return {
        suiteId: "gate-suite",
        name: "Gate Suite",
        passed: 4,
        total: 5,
        failed: 1,
        results: Array.from({ length: 5 }, (_, i) => ({
          testCaseId: `test-${i}`,
          passed: i < 4,
          assertions: [],
          response: "test",
          model: "gpt-4o",
          tokens: { prompt: 10, completion: 20 },
          costUsd: 0.002,
          latencyMs: 200,
          qualityScore: 0.9,
          timestamp: new Date().toISOString(),
        })),
        durationMs: 1000,
        summary: "4/5 passed",
        ...overrides,
      };
    }

    it("should pass when all thresholds are met", () => {
      const result = engine.checkCIGate([makeSuiteResult()], defaultGateConfig);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.passRate).toBe(0.8);
      expect(result.avgQuality).toBe(0.9);
    });

    it("should fail when pass rate is too low", () => {
      const suiteResult = makeSuiteResult({ passed: 2, failed: 3 });
      const result = engine.checkCIGate([suiteResult], defaultGateConfig);

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.includes("Pass rate"))).toBe(true);
    });

    it("should fail when cost exceeds threshold", () => {
      const suiteResult = makeSuiteResult();
      suiteResult.results[0].costUsd = 0.05; // Over the 0.01 threshold
      const result = engine.checkCIGate([suiteResult], defaultGateConfig);

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.includes("cost"))).toBe(true);
    });

    it("should fail when latency exceeds threshold", () => {
      const suiteResult = makeSuiteResult();
      suiteResult.results[0].latencyMs = 1000; // Over the 500ms threshold
      const result = engine.checkCIGate([suiteResult], defaultGateConfig);

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.includes("latency"))).toBe(true);
    });

    it("should fail when quality is too low", () => {
      const suiteResult = makeSuiteResult();
      for (const r of suiteResult.results) {
        r.qualityScore = 0.3;
      }
      const result = engine.checkCIGate([suiteResult], defaultGateConfig);

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.includes("quality"))).toBe(true);
    });

    it("should aggregate results from multiple suites", () => {
      const suite1 = makeSuiteResult();
      const suite2 = makeSuiteResult({
        suiteId: "gate-suite-2",
        name: "Gate Suite 2",
      });
      const result = engine.checkCIGate([suite1, suite2], defaultGateConfig);

      expect(result.totalCost).toBeCloseTo(0.02, 3);
    });
  });

  // ==========================================================================
  // GitHub Workflow Generation
  // ==========================================================================
  describe("generateGitHubWorkflow", () => {
    it("should generate valid workflow YAML", () => {
      const config: GitHubActionConfig = {
        workflowName: "Prompt Tests",
        triggerOn: ["push", "pull_request"],
        branches: ["main", "develop"],
        suiteGlob: "tests/prompts/**/*.yaml",
        agentopsApiKeySecret: "AGENTOPS_API_KEY",
      };

      const workflow = engine.generateGitHubWorkflow(config);

      expect(workflow).toContain("name: Prompt Tests");
      expect(workflow).toContain("push:");
      expect(workflow).toContain("pull_request:");
      expect(workflow).toContain("- main");
      expect(workflow).toContain("- develop");
      expect(workflow).toContain("actions/checkout@v4");
      expect(workflow).toContain("actions/setup-node@v4");
      expect(workflow).toContain("AGENTOPS_API_KEY");
      expect(workflow).toContain("tests/prompts/**/*.yaml");
    });

    it("should include schedule trigger", () => {
      const config: GitHubActionConfig = {
        workflowName: "Scheduled Tests",
        triggerOn: ["schedule"],
        branches: ["main"],
        suiteGlob: "**/*.yaml",
        agentopsApiKeySecret: "API_KEY",
      };

      const workflow = engine.generateGitHubWorkflow(config);

      expect(workflow).toContain("schedule:");
      expect(workflow).toContain("cron:");
    });

    it("should include artifact upload step", () => {
      const config: GitHubActionConfig = {
        workflowName: "Tests",
        triggerOn: ["push"],
        branches: ["main"],
        suiteGlob: "*.yaml",
        agentopsApiKeySecret: "KEY",
      };

      const workflow = engine.generateGitHubWorkflow(config);

      expect(workflow).toContain("upload-artifact@v4");
      expect(workflow).toContain("prompt-test-results");
    });
  });

  // ==========================================================================
  // Markdown Report Generation
  // ==========================================================================
  describe("generateMarkdownReport", () => {
    it("should generate a valid markdown report", () => {
      const results: TestSuiteResult[] = [
        {
          suiteId: "report-suite",
          name: "Report Suite",
          passed: 2,
          total: 3,
          failed: 1,
          results: [
            {
              testCaseId: "test-a",
              passed: true,
              assertions: [],
              response: "ok",
              model: "gpt-4o",
              tokens: { prompt: 10, completion: 20 },
              costUsd: 0.001,
              latencyMs: 100,
              qualityScore: 0.95,
              timestamp: new Date().toISOString(),
            },
            {
              testCaseId: "test-b",
              passed: true,
              assertions: [],
              response: "ok",
              model: "gpt-4o",
              tokens: { prompt: 10, completion: 20 },
              costUsd: 0.002,
              latencyMs: 150,
              qualityScore: 0.88,
              timestamp: new Date().toISOString(),
            },
            {
              testCaseId: "test-c",
              passed: false,
              assertions: [],
              response: "fail",
              model: "gpt-4o",
              tokens: { prompt: 10, completion: 20 },
              costUsd: 0.003,
              latencyMs: 300,
              qualityScore: 0.5,
              timestamp: new Date().toISOString(),
            },
          ],
          durationMs: 550,
          summary: "2/3 passed",
        },
      ];

      const report = engine.generateMarkdownReport(results);

      expect(report).toContain("# Prompt Test Results");
      expect(report).toContain("## Report Suite");
      expect(report).toContain("test-a");
      expect(report).toContain("test-b");
      expect(report).toContain("test-c");
      expect(report).toContain("✅");
      expect(report).toContain("❌");
      expect(report).toContain("## Summary");
      expect(report).toContain("**Total Passed**: 2");
      expect(report).toContain("**Total Failed**: 1");
    });

    it("should handle multiple suites", () => {
      const results: TestSuiteResult[] = [
        {
          suiteId: "suite-1",
          name: "Suite One",
          passed: 1,
          total: 1,
          failed: 0,
          results: [
            {
              testCaseId: "s1-t1",
              passed: true,
              assertions: [],
              response: "ok",
              model: "gpt-4o",
              tokens: { prompt: 10, completion: 20 },
              costUsd: 0.001,
              latencyMs: 100,
              qualityScore: 0.9,
              timestamp: new Date().toISOString(),
            },
          ],
          durationMs: 100,
          summary: "1/1 passed",
        },
        {
          suiteId: "suite-2",
          name: "Suite Two",
          passed: 0,
          total: 1,
          failed: 1,
          results: [
            {
              testCaseId: "s2-t1",
              passed: false,
              assertions: [],
              response: "fail",
              model: "gpt-4o",
              tokens: { prompt: 10, completion: 20 },
              costUsd: 0.005,
              latencyMs: 400,
              qualityScore: 0.3,
              timestamp: new Date().toISOString(),
            },
          ],
          durationMs: 400,
          summary: "0/1 passed",
        },
      ];

      const report = engine.generateMarkdownReport(results);

      expect(report).toContain("## Suite One");
      expect(report).toContain("## Suite Two");
      expect(report).toContain("**Total Passed**: 1");
      expect(report).toContain("**Total Failed**: 1");
    });
  });
});
