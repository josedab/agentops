/**
 * Prompt CI/CD Pipeline - Engine
 *
 * Core engine for prompt testing, CI gating, and workflow generation.
 *
 * @packageDocumentation
 */

import type {
  PromptTestSuite,
  PromptTestCase,
  TestAssertion,
  AssertionResult,
  TestExecutionResult,
  TestSuiteResult,
  CIGateConfig,
  CIGateVerdict,
  GitHubActionConfig,
  PromptTestDSL,
} from "./types.js";

// ============================================================================
// Prompt Executor Interface
// ============================================================================

/** Interface for executing prompts against an LLM */
export interface PromptExecutor {
  execute(
    input: string,
    options: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<{
    response: string;
    tokens: { prompt: number; completion: number };
    latencyMs: number;
    costUsd: number;
  }>;
}

// ============================================================================
// Simple YAML Parser/Serializer
// ============================================================================

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function stripQuotes(val: string): string {
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseValue(val: string): string | number | boolean {
  const trimmed = val.trim();
  if (trimmed === "true") return true as unknown as number;
  if (trimmed === "false") return false as unknown as number;
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== "") return num;
  return stripQuotes(trimmed);
}

function parseSimpleYaml(yaml: string): PromptTestDSL {
  const lines = yaml.split("\n");
  const result: PromptTestDSL = { name: "", tests: [] };

  // Test-level list items are at indent ~2, assertion/tag items are deeper (~6+)
  const TEST_ITEM_MAX_INDENT = 3;

  let i = 0;
  let inTests = false;
  let inGlobalAssertions = false;
  let currentTest: PromptTestDSL["tests"][0] | null = null;
  let inAssertions = false;
  let currentAssertion: { type: string; value: string | number } | null = null;
  let inTags = false;
  let globalAssertion: { type: string; value: string | number } | null = null;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    const indent = getIndentLevel(line);

    // Top-level key:value pairs (indent 0)
    if (indent === 0 && trimmed.includes(":")) {
      // Flush state when returning to top level
      if (inGlobalAssertions && globalAssertion && result.globalAssertions) {
        result.globalAssertions.push(globalAssertion);
        globalAssertion = null;
      }
      if (inTests && currentTest) {
        if (currentAssertion) {
          currentTest.assertions.push(currentAssertion);
          currentAssertion = null;
        }
        result.tests.push(currentTest);
        currentTest = null;
      }

      const colonIdx = trimmed.indexOf(":");
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();

      if (key === "tests") {
        inTests = true;
        inGlobalAssertions = false;
      } else if (key === "globalAssertions") {
        inGlobalAssertions = true;
        inTests = false;
        result.globalAssertions = [];
      } else {
        inTests = false;
        inGlobalAssertions = false;
        if (key === "name") result.name = stripQuotes(val);
        else if (key === "description") result.description = stripQuotes(val);
        else if (key === "model") result.model = stripQuotes(val);
      }

      i++;
      continue;
    }

    // Global assertions section
    if (inGlobalAssertions && !inTests) {
      if (trimmed.startsWith("- ")) {
        if (globalAssertion && result.globalAssertions) {
          result.globalAssertions.push(globalAssertion);
        }
        globalAssertion = { type: "", value: "" };
        const afterDash = trimmed.slice(2).trim();
        if (afterDash.includes(":")) {
          const colonIdx = afterDash.indexOf(":");
          const key = afterDash.slice(0, colonIdx).trim();
          const val = afterDash.slice(colonIdx + 1).trim();
          if (key === "type") globalAssertion.type = stripQuotes(val) as string;
          else if (key === "value")
            globalAssertion.value = parseValue(val) as string | number;
        }
      } else if (globalAssertion && trimmed.includes(":")) {
        const colonIdx = trimmed.indexOf(":");
        const key = trimmed.slice(0, colonIdx).trim();
        const val = trimmed.slice(colonIdx + 1).trim();
        if (key === "type") globalAssertion.type = stripQuotes(val) as string;
        else if (key === "value")
          globalAssertion.value = parseValue(val) as string | number;
      }
      i++;
      continue;
    }

    // Inside tests array
    if (inTests) {
      // New test item: "- " at low indent (indent <= TEST_ITEM_MAX_INDENT)
      if (trimmed.startsWith("- ") && indent <= TEST_ITEM_MAX_INDENT) {
        // Save previous test
        if (currentTest) {
          if (currentAssertion) {
            currentTest.assertions.push(currentAssertion);
            currentAssertion = null;
          }
          result.tests.push(currentTest);
        }
        currentTest = { name: "", input: "", assertions: [] };
        inAssertions = false;
        inTags = false;

        const afterDash = trimmed.slice(2).trim();
        if (afterDash.includes(":")) {
          const colonIdx = afterDash.indexOf(":");
          const key = afterDash.slice(0, colonIdx).trim();
          const val = afterDash.slice(colonIdx + 1).trim();
          this_setTestProp(currentTest, key, val);
        }
      } else if (currentTest) {
        // Nested content within a test case
        if (inTags && trimmed.startsWith("- ")) {
          if (!currentTest.tags) currentTest.tags = [];
          currentTest.tags.push(stripQuotes(trimmed.slice(2).trim()));
        } else if (inAssertions && trimmed.startsWith("- ")) {
          // New assertion item
          if (currentAssertion) {
            currentTest.assertions.push(currentAssertion);
          }
          currentAssertion = { type: "", value: "" };
          const afterDash = trimmed.slice(2).trim();
          if (afterDash.includes(":")) {
            const colonIdx = afterDash.indexOf(":");
            const key = afterDash.slice(0, colonIdx).trim();
            const val = afterDash.slice(colonIdx + 1).trim();
            if (key === "type")
              currentAssertion.type = stripQuotes(val) as string;
            else if (key === "value")
              currentAssertion.value = parseValue(val) as string | number;
          }
        } else if (inAssertions && currentAssertion && trimmed.includes(":")) {
          // Continuation of assertion properties
          const colonIdx = trimmed.indexOf(":");
          const key = trimmed.slice(0, colonIdx).trim();
          const val = trimmed.slice(colonIdx + 1).trim();
          if (key === "type")
            currentAssertion.type = stripQuotes(val) as string;
          else if (key === "value")
            currentAssertion.value = parseValue(val) as string | number;
        } else if (trimmed.includes(":")) {
          // Test property or section header
          const colonIdx = trimmed.indexOf(":");
          const key = trimmed.slice(0, colonIdx).trim();
          const val = trimmed.slice(colonIdx + 1).trim();

          if (key === "assertions") {
            // Flush current assertion state
            if (currentAssertion) {
              currentTest.assertions.push(currentAssertion);
              currentAssertion = null;
            }
            inAssertions = true;
            inTags = false;
          } else if (key === "tags") {
            inTags = true;
            inAssertions = false;
            if (currentAssertion) {
              currentTest.assertions.push(currentAssertion);
              currentAssertion = null;
            }
            currentTest.tags = [];
          } else {
            inTags = false;
            inAssertions = false;
            if (currentAssertion) {
              currentTest.assertions.push(currentAssertion);
              currentAssertion = null;
            }
            this_setTestProp(currentTest, key, val);
          }
        }
      }

      i++;
      continue;
    }

    i++;
  }

  // Flush remaining global assertion
  if (globalAssertion && result.globalAssertions) {
    result.globalAssertions.push(globalAssertion);
  }

  // Flush remaining test
  if (currentTest) {
    if (currentAssertion) {
      currentTest.assertions.push(currentAssertion);
    }
    result.tests.push(currentTest);
  }

  return result;
}

function this_setTestProp(
  test: PromptTestDSL["tests"][0],
  key: string,
  val: string,
): void {
  const parsed = parseValue(val);
  switch (key) {
    case "name":
      test.name = stripQuotes(val);
      break;
    case "input":
      test.input = stripQuotes(val);
      break;
    case "expectedOutput":
      test.expectedOutput = stripQuotes(val);
      break;
    case "model":
      test.model = stripQuotes(val);
      break;
    case "temperature":
      test.temperature = parsed as number;
      break;
    case "maxTokens":
      test.maxTokens = parsed as number;
      break;
  }
}

function serializeToYaml(suite: PromptTestSuite): string {
  const lines: string[] = [];
  lines.push(`name: ${suite.name}`);
  if (suite.description) {
    lines.push(`description: ${suite.description}`);
  }
  if (suite.model) {
    lines.push(`model: ${suite.model}`);
  }
  if (suite.globalAssertions && suite.globalAssertions.length > 0) {
    lines.push("globalAssertions:");
    for (const a of suite.globalAssertions) {
      lines.push(`  - type: ${a.type}`);
      lines.push(`    value: ${a.value}`);
    }
  }
  lines.push("tests:");
  for (const test of suite.prompts) {
    lines.push(`  - name: ${test.name}`);
    lines.push(`    input: "${test.input}"`);
    if (test.expectedOutput) {
      lines.push(`    expectedOutput: "${test.expectedOutput}"`);
    }
    if (test.model) {
      lines.push(`    model: ${test.model}`);
    }
    if (test.temperature !== undefined) {
      lines.push(`    temperature: ${test.temperature}`);
    }
    if (test.maxTokens !== undefined) {
      lines.push(`    maxTokens: ${test.maxTokens}`);
    }
    if (test.tags && test.tags.length > 0) {
      lines.push("    tags:");
      for (const tag of test.tags) {
        lines.push(`      - ${tag}`);
      }
    }
    if (test.assertions.length > 0) {
      lines.push("    assertions:");
      for (const a of test.assertions) {
        lines.push(`      - type: ${a.type}`);
        lines.push(`        value: ${a.value}`);
      }
    }
  }
  return lines.join("\n");
}

// ============================================================================
// PromptCICDEngine
// ============================================================================

/** Engine for prompt CI/CD testing, gating, and automation */
export class PromptCICDEngine {
  /**
   * Parse a YAML DSL string into a PromptTestSuite.
   * Uses a simple hand-written indentation-based parser.
   */
  parseTestSuite(yaml: string): PromptTestSuite {
    const dsl = parseSimpleYaml(yaml);
    return this.dslToSuite(dsl);
  }

  /** Serialize a PromptTestSuite to YAML DSL string */
  serializeTestSuite(suite: PromptTestSuite): string {
    return serializeToYaml(suite);
  }

  /** Execute all test cases in a suite using the provided executor */
  async runTestSuite(
    suite: PromptTestSuite,
    executor: PromptExecutor,
  ): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const results: TestExecutionResult[] = [];

    for (const testCase of suite.prompts) {
      const result = await this.runTestCase(testCase, suite, executor);
      results.push(result);
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const durationMs = Date.now() - startTime;

    return {
      suiteId: suite.id,
      name: suite.name,
      passed,
      total: results.length,
      failed,
      results,
      durationMs,
      summary: `${passed}/${results.length} tests passed (${failed} failed) in ${durationMs}ms`,
    };
  }

  /** Evaluate a single assertion against execution metrics */
  evaluateAssertion(
    assertion: TestAssertion,
    result: {
      response: string;
      costUsd: number;
      latencyMs: number;
      qualityScore: number;
    },
  ): AssertionResult {
    switch (assertion.type) {
      case "contains":
        return this.evalContains(assertion, result.response);
      case "not_contains":
        return this.evalNotContains(assertion, result.response);
      case "regex":
        return this.evalRegex(assertion, result.response);
      case "json_schema":
        return this.evalJsonSchema(assertion, result.response);
      case "cost_under":
        return this.evalCostUnder(assertion, result.costUsd);
      case "latency_under":
        return this.evalLatencyUnder(assertion, result.latencyMs);
      case "quality_above":
        return this.evalQualityAbove(assertion, result.qualityScore);
      case "semantic_similarity":
        return this.evalSemanticSimilarity(assertion, result.response);
      default:
        return {
          assertion,
          passed: false,
          actual: null,
          message: `Unknown assertion type: ${assertion.type}`,
        };
    }
  }

  /** Determine if test suite results pass the CI gate */
  checkCIGate(results: TestSuiteResult[], config: CIGateConfig): CIGateVerdict {
    const violations: string[] = [];
    let totalTests = 0;
    let totalPassed = 0;
    let totalCost = 0;
    let maxLatency = 0;
    let qualitySum = 0;
    let qualityCount = 0;

    for (const suite of results) {
      totalTests += suite.total;
      totalPassed += suite.passed;
      for (const r of suite.results) {
        totalCost += r.costUsd;
        if (r.latencyMs > maxLatency) maxLatency = r.latencyMs;
        qualitySum += r.qualityScore;
        qualityCount++;

        if (r.costUsd > config.maxCostPerTest) {
          violations.push(
            `Test "${r.testCaseId}" cost $${r.costUsd.toFixed(4)} exceeds max $${config.maxCostPerTest.toFixed(4)}`,
          );
        }
        if (r.latencyMs > config.maxLatencyMs) {
          violations.push(
            `Test "${r.testCaseId}" latency ${r.latencyMs}ms exceeds max ${config.maxLatencyMs}ms`,
          );
        }
      }
    }

    const passRate = totalTests > 0 ? totalPassed / totalTests : 0;
    const avgQuality = qualityCount > 0 ? qualitySum / qualityCount : 0;

    if (passRate < config.minPassRate) {
      violations.push(
        `Pass rate ${(passRate * 100).toFixed(1)}% below minimum ${(config.minPassRate * 100).toFixed(1)}%`,
      );
    }
    if (avgQuality < config.qualityThreshold) {
      violations.push(
        `Average quality ${avgQuality.toFixed(3)} below threshold ${config.qualityThreshold}`,
      );
    }

    const passed = violations.length === 0;

    return {
      passed,
      passRate,
      avgQuality,
      totalCost,
      maxLatency,
      violations,
      summary: passed
        ? `CI gate passed: ${totalPassed}/${totalTests} tests, avg quality ${avgQuality.toFixed(3)}`
        : `CI gate failed: ${violations.length} violation(s) - ${violations[0]}`,
    };
  }

  /** Generate a GitHub Actions workflow YAML file */
  generateGitHubWorkflow(config: GitHubActionConfig): string {
    const triggers: string[] = [];
    for (const trigger of config.triggerOn) {
      if (trigger === "schedule") {
        triggers.push("  schedule:");
        triggers.push('    - cron: "0 6 * * *"');
      } else if (trigger === "push") {
        triggers.push("  push:");
        triggers.push("    branches:");
        for (const branch of config.branches) {
          triggers.push(`      - ${branch}`);
        }
      } else if (trigger === "pull_request") {
        triggers.push("  pull_request:");
        triggers.push("    branches:");
        for (const branch of config.branches) {
          triggers.push(`      - ${branch}`);
        }
      }
    }

    return `name: ${config.workflowName}

on:
${triggers.join("\n")}

jobs:
  prompt-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - name: Run Prompt Tests
        env:
          AGENTOPS_API_KEY: \${{ secrets.${config.agentopsApiKeySecret} }}
        run: npx agentops-test --suite "${config.suiteGlob}" --format json
      - name: Upload Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: prompt-test-results
          path: test-results/`;
  }

  /** Generate a markdown report from test suite results */
  generateMarkdownReport(results: TestSuiteResult[]): string {
    const lines: string[] = [];
    lines.push("# Prompt Test Results\n");

    let totalPassed = 0;
    let totalFailed = 0;
    let totalCost = 0;

    for (const suite of results) {
      totalPassed += suite.passed;
      totalFailed += suite.failed;

      lines.push(`## ${suite.name}\n`);
      lines.push(`| Metric | Value |`);
      lines.push(`| --- | --- |`);
      lines.push(`| Passed | ${suite.passed}/${suite.total} |`);
      lines.push(`| Failed | ${suite.failed} |`);
      lines.push(`| Duration | ${suite.durationMs}ms |`);
      lines.push("");

      if (suite.results.length > 0) {
        lines.push("| Test | Status | Latency | Cost | Quality |");
        lines.push("| --- | --- | --- | --- | --- |");
        for (const r of suite.results) {
          const status = r.passed ? "✅" : "❌";
          totalCost += r.costUsd;
          lines.push(
            `| ${r.testCaseId} | ${status} | ${r.latencyMs}ms | $${r.costUsd.toFixed(4)} | ${r.qualityScore.toFixed(3)} |`,
          );
        }
        lines.push("");
      }
    }

    lines.push("## Summary\n");
    lines.push(`- **Total Passed**: ${totalPassed}`);
    lines.push(`- **Total Failed**: ${totalFailed}`);
    lines.push(`- **Total Cost**: $${totalCost.toFixed(4)}`);

    return lines.join("\n");
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private dslToSuite(dsl: PromptTestDSL): PromptTestSuite {
    const suiteId = dsl.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const prompts: PromptTestCase[] = dsl.tests.map((t, idx) => ({
      id: `${suiteId}-${idx}`,
      name: t.name,
      input: t.input,
      expectedOutput: t.expectedOutput,
      assertions: t.assertions.map((a) => ({
        type: a.type as TestAssertion["type"],
        value: a.value,
      })),
      model: t.model,
      temperature: t.temperature,
      maxTokens: t.maxTokens,
      tags: t.tags,
    }));

    const globalAssertions = dsl.globalAssertions?.map((a) => ({
      type: a.type as TestAssertion["type"],
      value: a.value,
    }));

    return {
      id: suiteId,
      name: dsl.name,
      description: dsl.description,
      prompts,
      model: dsl.model,
      globalAssertions,
    };
  }

  private async runTestCase(
    testCase: PromptTestCase,
    suite: PromptTestSuite,
    executor: PromptExecutor,
  ): Promise<TestExecutionResult> {
    const model = testCase.model ?? suite.model ?? "gpt-4o";

    const execResult = await executor.execute(testCase.input, {
      model,
      temperature: testCase.temperature,
      maxTokens: testCase.maxTokens,
    });

    // Simple quality score heuristic based on response length and assertion pass rate
    const allAssertions = [
      ...testCase.assertions,
      ...(suite.globalAssertions ?? []),
    ];

    const assertionResults: AssertionResult[] = allAssertions.map((a) =>
      this.evaluateAssertion(a, {
        response: execResult.response,
        costUsd: execResult.costUsd,
        latencyMs: execResult.latencyMs,
        qualityScore: 0, // Will be computed below
      }),
    );

    const passedAssertions = assertionResults.filter((a) => a.passed).length;
    const qualityScore =
      allAssertions.length > 0 ? passedAssertions / allAssertions.length : 1;

    // Re-evaluate quality_above assertions with computed score
    for (let j = 0; j < assertionResults.length; j++) {
      if (allAssertions[j].type === "quality_above") {
        assertionResults[j] = this.evaluateAssertion(allAssertions[j], {
          response: execResult.response,
          costUsd: execResult.costUsd,
          latencyMs: execResult.latencyMs,
          qualityScore,
        });
      }
    }

    const allPassed = assertionResults.every((a) => a.passed);

    return {
      testCaseId: testCase.id,
      passed: allPassed,
      assertions: assertionResults,
      response: execResult.response,
      model,
      tokens: execResult.tokens,
      costUsd: execResult.costUsd,
      latencyMs: execResult.latencyMs,
      qualityScore,
      timestamp: new Date().toISOString(),
    };
  }

  private evalContains(
    assertion: TestAssertion,
    response: string,
  ): AssertionResult {
    const expected = String(assertion.value).toLowerCase();
    const actual = response.toLowerCase();
    const passed = actual.includes(expected);
    return {
      assertion,
      passed,
      actual: response,
      message: passed
        ? `Response contains "${assertion.value}"`
        : `Response does not contain "${assertion.value}"`,
    };
  }

  private evalNotContains(
    assertion: TestAssertion,
    response: string,
  ): AssertionResult {
    const expected = String(assertion.value).toLowerCase();
    const actual = response.toLowerCase();
    const passed = !actual.includes(expected);
    return {
      assertion,
      passed,
      actual: response,
      message: passed
        ? `Response does not contain "${assertion.value}"`
        : `Response contains "${assertion.value}" (should not)`,
    };
  }

  private evalRegex(
    assertion: TestAssertion,
    response: string,
  ): AssertionResult {
    const pattern = new RegExp(String(assertion.value));
    const passed = pattern.test(response);
    return {
      assertion,
      passed,
      actual: response,
      message: passed
        ? `Response matches pattern /${assertion.value}/`
        : `Response does not match pattern /${assertion.value}/`,
    };
  }

  private evalJsonSchema(
    assertion: TestAssertion,
    response: string,
  ): AssertionResult {
    try {
      JSON.parse(response);
      return {
        assertion,
        passed: true,
        actual: response,
        message: "Response is valid JSON",
      };
    } catch {
      return {
        assertion,
        passed: false,
        actual: response,
        message: "Response is not valid JSON",
      };
    }
  }

  private evalCostUnder(
    assertion: TestAssertion,
    costUsd: number,
  ): AssertionResult {
    const threshold = Number(assertion.value);
    const passed = costUsd <= threshold;
    return {
      assertion,
      passed,
      actual: costUsd,
      message: passed
        ? `Cost $${costUsd.toFixed(4)} is under $${threshold}`
        : `Cost $${costUsd.toFixed(4)} exceeds $${threshold}`,
    };
  }

  private evalLatencyUnder(
    assertion: TestAssertion,
    latencyMs: number,
  ): AssertionResult {
    const threshold = Number(assertion.value);
    const passed = latencyMs <= threshold;
    return {
      assertion,
      passed,
      actual: latencyMs,
      message: passed
        ? `Latency ${latencyMs}ms is under ${threshold}ms`
        : `Latency ${latencyMs}ms exceeds ${threshold}ms`,
    };
  }

  private evalQualityAbove(
    assertion: TestAssertion,
    qualityScore: number,
  ): AssertionResult {
    const threshold = Number(assertion.value);
    const passed = qualityScore >= threshold;
    return {
      assertion,
      passed,
      actual: qualityScore,
      message: passed
        ? `Quality ${qualityScore.toFixed(3)} is above ${threshold}`
        : `Quality ${qualityScore.toFixed(3)} is below ${threshold}`,
    };
  }

  private evalSemanticSimilarity(
    assertion: TestAssertion,
    response: string,
  ): AssertionResult {
    // Simple word overlap heuristic (real implementation would use embeddings)
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(Boolean);
    const expected = normalize(String(assertion.value));
    const actual = normalize(response);
    const overlap = expected.filter((w) => actual.includes(w)).length;
    const similarity = expected.length > 0 ? overlap / expected.length : 0;
    const passed = similarity >= 0.5;
    return {
      assertion,
      passed,
      actual: similarity,
      message: passed
        ? `Semantic similarity ${similarity.toFixed(3)} is sufficient`
        : `Semantic similarity ${similarity.toFixed(3)} is too low`,
    };
  }
}
