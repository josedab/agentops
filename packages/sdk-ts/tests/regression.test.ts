import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TestRunner,
  parseTestSuiteYaml,
  generateTestSuiteYaml,
  EXAMPLE_TEST_SUITE_YAML,
  type LLMClient,
} from "../src/regression/index";
import type {
  TestSuite,
  TestCase,
  TestAssertion,
  TestBaseline,
} from "../src/regression/types";

// Helper to create mock LLM client
function createMockLLMClient(response: string, latencyMs = 100): LLMClient {
  return {
    complete: vi.fn().mockResolvedValue({
      content: response,
      model: "gpt-4",
      latencyMs,
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      cost: 0.001,
    }),
  };
}

describe("Regression Testing Module", () => {
  describe("parseTestSuiteYaml", () => {
    it("should parse valid YAML test suite", () => {
      const yaml = `
version: "1.0"
name: Basic Tests
description: Test suite for basic functionality
tests:
  - id: test-1
    name: Basic prompt test
    description: Tests basic prompt handling
    input:
      messages:
        - role: user
          content: Hello world
      model: gpt-4
    assertions:
      - type: contains
        value: hello
`;

      const result = parseTestSuiteYaml(yaml);

      expect(result.name).toBe("Basic Tests");
      expect(result.description).toBe("Test suite for basic functionality");
      expect(result.testCases).toHaveLength(1);
      expect(result.testCases[0].id).toBe("test-1");
      expect(result.testCases[0].assertions).toHaveLength(1);
    });

    it("should parse EXAMPLE_TEST_SUITE_YAML", () => {
      const result = parseTestSuiteYaml(EXAMPLE_TEST_SUITE_YAML);

      expect(result.name).toBeDefined();
      expect(result.testCases).toBeDefined();
      expect(Array.isArray(result.testCases)).toBe(true);
    });

    it("should handle multiple test cases", () => {
      const yaml = `
version: "1.0"
name: Multi Test Suite
tests:
  - id: test-1
    name: Test 1
    input:
      messages:
        - role: user
          content: First test
    assertions:
      - type: contains
        value: result
  - id: test-2
    name: Test 2
    input:
      messages:
        - role: user
          content: Second test
    assertions:
      - type: not_contains
        value: error
`;

      const result = parseTestSuiteYaml(yaml);

      expect(result.testCases).toHaveLength(2);
      expect(result.testCases[0].id).toBe("test-1");
      expect(result.testCases[1].id).toBe("test-2");
    });
  });

  describe("generateTestSuiteYaml", () => {
    it("should generate valid YAML from suite", () => {
      const suite: TestSuite = {
        id: "suite-1",
        name: "Generated Suite",
        description: "A test suite",
        testCases: [
          {
            id: "tc-1",
            name: "Test Case 1",
            input: {
              messages: [{ role: "user" as const, content: "Hello" }],
            },
            assertions: [
              {
                type: "contains",
                target: "response",
                value: "world",
              } as TestAssertion,
            ],
          },
        ],
      };

      const yaml = generateTestSuiteYaml(suite);

      expect(yaml).toContain("name: Generated Suite");
      expect(yaml).toContain("description: A test suite");
      expect(yaml).toContain("id: tc-1");
    });
  });

  describe("TestRunner", () => {
    let runner: TestRunner;
    let mockLLMClient: LLMClient;

    beforeEach(() => {
      mockLLMClient = createMockLLMClient("Hello world response");
      runner = new TestRunner({
        llmClient: mockLLMClient,
        config: {
          parallel: false,
          timeout: 5000,
        },
      });
    });

    it("should run a simple test case", async () => {
      const testCase: TestCase = {
        id: "tc-1",
        name: "Simple test",
        input: {
          messages: [{ role: "user", content: "Say hello" }],
        },
        assertions: [
          {
            type: "contains",
            target: "response",
            value: "Hello",
          } as TestAssertion,
        ],
      };

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe("passed");
      expect(result.assertionResults).toHaveLength(1);
      expect(result.assertionResults[0].passed).toBe(true);
    });

    it("should fail when assertion fails", async () => {
      mockLLMClient = createMockLLMClient("Goodbye world");
      runner = new TestRunner({
        llmClient: mockLLMClient,
        config: { parallel: false },
      });

      const testCase: TestCase = {
        id: "tc-2",
        name: "Failing test",
        input: {
          messages: [{ role: "user", content: "Say hello" }],
        },
        assertions: [
          {
            type: "contains",
            target: "response",
            value: "hello",
          } as TestAssertion,
        ],
      };

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe("failed");
      expect(result.assertionResults[0].passed).toBe(false);
    });

    it("should run a test suite", async () => {
      mockLLMClient = createMockLLMClient("Test response with hello");
      runner = new TestRunner({
        llmClient: mockLLMClient,
        config: { parallel: false },
      });

      const suite: TestSuite = {
        id: "suite-1",
        name: "Test Suite",
        testCases: [
          {
            id: "tc-1",
            name: "Test 1",
            input: {
              messages: [{ role: "user", content: "Test" }],
            },
            assertions: [
              {
                type: "contains",
                target: "response",
                value: "response",
              } as TestAssertion,
            ],
          },
          {
            id: "tc-2",
            name: "Test 2",
            input: {
              messages: [{ role: "user", content: "Test" }],
            },
            assertions: [
              {
                type: "contains",
                target: "response",
                value: "Test",
              } as TestAssertion,
            ],
          },
        ],
      };

      const run = await runner.runSuite(suite);

      expect(run.suiteId).toBe("suite-1");
      expect(run.results).toHaveLength(2);
      expect(run.summary.total).toBe(2);
      expect(run.summary.passed).toBe(2);
    });

    it("should handle test timeouts", async () => {
      const slowClient: LLMClient = {
        complete: vi.fn().mockImplementation(
          () =>
            new Promise((r) =>
              setTimeout(
                () =>
                  r({
                    content: "Late response",
                    model: "gpt-4",
                    latencyMs: 10000,
                    promptTokens: 10,
                    completionTokens: 10,
                    totalTokens: 20,
                    cost: 0.001,
                  }),
                10000,
              ),
            ),
        ),
      };

      runner = new TestRunner({
        llmClient: slowClient,
        config: { parallel: false, timeout: 100 },
      });

      const testCase: TestCase = {
        id: "tc-timeout",
        name: "Timeout test",
        input: {
          messages: [{ role: "user", content: "Slow" }],
        },
        assertions: [],
        timeout: 100,
      };

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe("error");
      expect(result.error).toBeDefined();
    }, 5000);

    it("should handle executor errors", async () => {
      const errorClient: LLMClient = {
        complete: vi.fn().mockRejectedValue(new Error("LLM failed")),
      };

      runner = new TestRunner({
        llmClient: errorClient,
        config: { parallel: false },
      });

      const testCase: TestCase = {
        id: "tc-error",
        name: "Error test",
        input: {
          messages: [{ role: "user", content: "Fail" }],
        },
        assertions: [],
      };

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe("error");
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("LLM failed");
    });

    describe("assertions", () => {
      it("should validate contains assertion", async () => {
        mockLLMClient = createMockLLMClient("Hello beautiful world");
        runner = new TestRunner({
          llmClient: mockLLMClient,
          config: { parallel: false },
        });

        const result = await runner.runTestCase({
          id: "tc",
          name: "Contains",
          input: {
            messages: [{ role: "user", content: "test" }],
          },
          assertions: [
            {
              type: "contains",
              target: "response",
              value: "world",
            } as TestAssertion,
          ],
        });

        expect(result.assertionResults[0].passed).toBe(true);
      });

      it("should validate not_contains assertion", async () => {
        mockLLMClient = createMockLLMClient("Hello world");
        runner = new TestRunner({
          llmClient: mockLLMClient,
          config: { parallel: false },
        });

        const result = await runner.runTestCase({
          id: "tc",
          name: "Not Contains",
          input: {
            messages: [{ role: "user", content: "test" }],
          },
          assertions: [
            {
              type: "not_contains",
              target: "response",
              value: "error",
            } as TestAssertion,
          ],
        });

        expect(result.assertionResults[0].passed).toBe(true);
      });

      it("should validate matches_regex assertion", async () => {
        mockLLMClient = createMockLLMClient("Hello world 123");
        runner = new TestRunner({
          llmClient: mockLLMClient,
          config: { parallel: false },
        });

        const result = await runner.runTestCase({
          id: "tc",
          name: "Regex",
          input: {
            messages: [{ role: "user", content: "test" }],
          },
          assertions: [
            {
              type: "matches_regex",
              target: "response",
              value: "\\d+",
            } as TestAssertion,
          ],
        });

        expect(result.assertionResults[0].passed).toBe(true);
      });

      it("should validate latency assertion", async () => {
        mockLLMClient = createMockLLMClient("OK", 500);
        runner = new TestRunner({
          llmClient: mockLLMClient,
          config: { parallel: false },
        });

        const result = await runner.runTestCase({
          id: "tc",
          name: "Latency",
          input: {
            messages: [{ role: "user", content: "test" }],
          },
          assertions: [
            {
              type: "latency",
              target: "metrics",
              value: { maxMs: 1000 },
            } as TestAssertion,
          ],
        });

        expect(result.assertionResults[0].passed).toBe(true);
      });

      it("should validate tokens assertion", async () => {
        mockLLMClient = createMockLLMClient("OK");
        runner = new TestRunner({
          llmClient: mockLLMClient,
          config: { parallel: false },
        });

        const result = await runner.runTestCase({
          id: "tc",
          name: "Tokens",
          input: {
            messages: [{ role: "user", content: "test" }],
          },
          assertions: [
            {
              type: "tokens",
              target: "metrics",
              value: { maxTotal: 200 },
            } as TestAssertion,
          ],
        });

        expect(result.assertionResults[0].passed).toBe(true);
      });
    });
  });
});
