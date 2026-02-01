/**
 * Prompt Regression Testing - Test Runner
 *
 * Core test execution engine for running prompt regression tests.
 */

import {
  TestCase,
  TestSuite,
  TestResult,
  TestRun,
  TestRunSummary,
  TestResponse,
  AssertionResult,
  BaselineComparison,
  RegressionInfo,
  TestStatus,
  RegressionTestConfig,
  TestAssertion,
} from "./types.js";

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<RegressionTestConfig> = {
  enabled: true,
  testDir: "./tests/prompts",
  testPattern: "**/*.test.yaml",
  parallel: true,
  maxConcurrency: 5,
  timeout: 60000,
  failOnWarning: false,
  minPassRate: 0.95,
  baselineDir: "./tests/baselines",
  autoUpdateBaselines: false,
  reporters: [{ type: "console" }],
  provider: { type: "openai" },
  debug: false,
};

// ============================================================================
// Test Runner
// ============================================================================

export interface TestRunnerOptions {
  config?: RegressionTestConfig;
  llmClient?: LLMClient;
  embeddings?: EmbeddingClient;
  onTestStart?: (testCase: TestCase) => void;
  onTestComplete?: (result: TestResult) => void;
  onProgress?: (completed: number, total: number) => void;
}

export interface LLMClient {
  complete(input: {
    systemPrompt?: string;
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: Array<{ name: string; description: string; parameters?: unknown }>;
  }): Promise<{
    content: string;
    model: string;
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
    toolCalls?: Array<{ name: string; arguments: unknown }>;
    finishReason?: string;
  }>;
}

export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
  similarity(a: number[], b: number[]): number;
}

/**
 * TestRunner executes prompt regression tests and reports results.
 */
export class TestRunner {
  private readonly config: Required<RegressionTestConfig>;
  private readonly llmClient?: LLMClient;
  private readonly embeddings?: EmbeddingClient;
  private readonly onTestStart?: (testCase: TestCase) => void;
  private readonly onTestComplete?: (result: TestResult) => void;
  private readonly onProgress?: (completed: number, total: number) => void;

  constructor(options: TestRunnerOptions = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.llmClient = options.llmClient;
    this.embeddings = options.embeddings;
    this.onTestStart = options.onTestStart;
    this.onTestComplete = options.onTestComplete;
    this.onProgress = options.onProgress;
  }

  /**
   * Run a test suite
   */
  async runSuite(suite: TestSuite): Promise<TestRun> {
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();

    const enabledTests = suite.testCases.filter((t) => t.enabled !== false);
    const sortedTests = [...enabledTests].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );

    const results: TestResult[] = [];
    let completed = 0;

    if (this.config.parallel) {
      // Parallel execution with concurrency limit
      const chunks = this.chunkArray(sortedTests, this.config.maxConcurrency);
      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map((tc) => this.runTestCase(tc, suite.defaults)),
        );
        results.push(...chunkResults);
        completed += chunkResults.length;
        this.onProgress?.(completed, enabledTests.length);
      }
    } else {
      // Sequential execution
      for (const testCase of sortedTests) {
        const result = await this.runTestCase(testCase, suite.defaults);
        results.push(result);
        completed++;
        this.onProgress?.(completed, enabledTests.length);
      }
    }

    const completedAt = Date.now();
    const summary = this.calculateSummary(results);

    const run: TestRun = {
      id: runId,
      suiteId: suite.id,
      suiteName: suite.name,
      status: this.determineRunStatus(summary),
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      results,
      summary,
    };

    return run;
  }

  /**
   * Run a single test case
   */
  async runTestCase(
    testCase: TestCase,
    defaults?: TestSuite["defaults"],
  ): Promise<TestResult> {
    const startTime = Date.now();
    this.onTestStart?.(testCase);

    try {
      // Execute the test (potentially multiple runs for statistical validity)
      const runs = testCase.runs ?? defaults?.runs ?? 1;
      const responses: TestResponse[] = [];

      for (let i = 0; i < runs; i++) {
        const response = await this.executeTest(testCase, defaults);
        responses.push(response);
      }

      // Use the median response for assertions
      const response = this.selectMedianResponse(responses);

      // Run assertions
      const mergedAssertions = [
        ...(defaults?.assertions ?? []),
        ...testCase.assertions,
      ];
      const assertionResults = await this.runAssertions(
        mergedAssertions,
        response,
      );

      // Compare to baseline if present
      let baselineComparison: BaselineComparison | undefined;
      if (testCase.baseline) {
        baselineComparison = await this.compareToBaseline(
          response,
          testCase.baseline,
        );
      }

      // Determine overall status
      const status = this.determineTestStatus(
        assertionResults,
        baselineComparison,
      );
      const score = this.calculateScore(assertionResults);

      const result: TestResult = {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        status,
        durationMs: Date.now() - startTime,
        runAt: startTime,
        assertionResults,
        response,
        baselineComparison,
        score,
      };

      this.onTestComplete?.(result);
      return result;
    } catch (error) {
      const result: TestResult = {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        status: "error",
        durationMs: Date.now() - startTime,
        runAt: startTime,
        assertionResults: [],
        error: {
          type: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        score: 0,
      };

      this.onTestComplete?.(result);
      return result;
    }
  }

  /**
   * Execute a test and get response
   */
  private async executeTest(
    testCase: TestCase,
    defaults?: TestSuite["defaults"],
  ): Promise<TestResponse> {
    if (!this.llmClient) {
      // Return mock response for testing without LLM
      return {
        content: "Mock response for testing",
        model: testCase.input.model ?? defaults?.model ?? "mock",
        latencyMs: 100,
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        cost: 0.001,
      };
    }

    const timeout =
      testCase.timeout ?? defaults?.timeout ?? this.config.timeout;

    const response = await Promise.race([
      this.llmClient.complete({
        systemPrompt: testCase.input.systemPrompt,
        messages: testCase.input.messages,
        model: testCase.input.model ?? defaults?.model,
        temperature: testCase.input.temperature ?? defaults?.temperature,
        maxTokens: testCase.input.maxTokens ?? defaults?.maxTokens,
        tools: testCase.input.tools,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Test timeout")), timeout),
      ),
    ]);

    return response;
  }

  /**
   * Run assertions against response
   */
  private async runAssertions(
    assertions: TestAssertion[],
    response: TestResponse,
  ): Promise<AssertionResult[]> {
    const results: AssertionResult[] = [];

    for (const assertion of assertions) {
      const result = await this.runAssertion(assertion, response);
      results.push(result);
    }

    return results;
  }

  /**
   * Run a single assertion
   */
  private async runAssertion(
    assertion: TestAssertion,
    response: TestResponse,
  ): Promise<AssertionResult> {
    const severity = assertion.severity ?? "error";

    try {
      switch (assertion.type) {
        case "contains":
          return this.assertContains(assertion, response, severity);
        case "not_contains":
          return this.assertNotContains(assertion, response, severity);
        case "matches_regex":
          return this.assertMatchesRegex(assertion, response, severity);
        case "length":
          return this.assertLength(assertion, response, severity);
        case "latency":
          return this.assertLatency(assertion, response, severity);
        case "tokens":
          return this.assertTokens(assertion, response, severity);
        case "cost":
          return this.assertCost(assertion, response, severity);
        case "tool_called":
          return this.assertToolCalled(assertion, response, severity);
        case "tool_not_called":
          return this.assertToolNotCalled(assertion, response, severity);
        case "json_schema":
          return this.assertJsonSchema(assertion, response, severity);
        case "semantic_similarity":
          return await this.assertSemanticSimilarity(
            assertion,
            response,
            severity,
          );
        default:
          return {
            type: assertion.type,
            passed: false,
            actual: null,
            expected: assertion.value,
            message: `Unknown assertion type: ${assertion.type}`,
            severity,
          };
      }
    } catch (error) {
      return {
        type: assertion.type,
        passed: false,
        actual: null,
        expected: assertion.value,
        message: `Assertion error: ${error instanceof Error ? error.message : String(error)}`,
        severity,
      };
    }
  }

  // Assertion implementations
  private assertContains(
    assertion: TestAssertion,
    response: TestResponse,
    severity: "error" | "warning",
  ): AssertionResult {
    const value = assertion.value as string;
    const caseSensitive =
      (assertion as { caseSensitive?: boolean }).caseSensitive ?? true;
    const content = caseSensitive
      ? response.content
      : response.content.toLowerCase();
    const search = caseSensitive ? value : value.toLowerCase();
    const passed = content.includes(search);

    return {
      type: "contains",
      passed,
      actual: response.content.slice(0, 200),
      expected: value,
      message: passed ? undefined : `Response does not contain "${value}"`,
      severity,
    };
  }

  private assertNotContains(
    assertion: TestAssertion,
    response: TestResponse,
    severity: "error" | "warning",
  ): AssertionResult {
    const value = assertion.value as string;
    const passed = !response.content.includes(value);

    return {
      type: "not_contains",
      passed,
      actual: response.content.slice(0, 200),
      expected: `NOT ${value}`,
      message: passed
        ? undefined
        : `Response contains forbidden text "${value}"`,
      severity,
    };
  }

  private assertMatchesRegex(
    assertion: TestAssertion,
    response: TestResponse,
    severity: "error" | "warning",
  ): AssertionResult {
    const value = assertion.value as string;
    const flags = (assertion as { flags?: string }).flags ?? "";
    const regex = new RegExp(value, flags);
    const passed = regex.test(response.content);

    return {
      type: "matches_regex",
      passed,
      actual: response.content.slice(0, 200),
      expected: value,
      message: passed
        ? undefined
        : `Response does not match pattern /${value}/${flags}`,
      severity,
    };
  }

  private assertLength(
    assertion: TestAssertion,
    response: TestResponse,
    severity: "error" | "warning",
  ): AssertionResult {
    const { min, max } = assertion.value as { min?: number; max?: number };
    const length = response.content.length;
    const passed =
      (min === undefined || length >= min) &&
      (max === undefined || length <= max);

    return {
      type: "length",
      passed,
      actual: length,
      expected: { min, max },
      message: passed
        ? undefined
        : `Response length ${length} is outside range [${min ?? 0}, ${max ?? "∞"}]`,
      severity,
    };
  }

  private assertLatency(
    assertion: TestAssertion,
    response: TestResponse,
    severity: "error" | "warning",
  ): AssertionResult {
    const { maxMs } = assertion.value as { maxMs: number };
    const passed = response.latencyMs <= maxMs;

    return {
      type: "latency",
      passed,
      actual: response.latencyMs,
      expected: maxMs,
      message: passed
        ? undefined
        : `Latency ${response.latencyMs}ms exceeds maximum ${maxMs}ms`,
      severity,
    };
  }

  private assertTokens(
    assertion: TestAssertion,
    response: TestResponse,
    severity: "error" | "warning",
  ): AssertionResult {
    const { maxTotal, maxPrompt, maxCompletion } = assertion.value as {
      maxTotal?: number;
      maxPrompt?: number;
      maxCompletion?: number;
    };

    const checks: string[] = [];
    if (maxTotal !== undefined && response.totalTokens > maxTotal) {
      checks.push(`total ${response.totalTokens} > ${maxTotal}`);
    }
    if (maxPrompt !== undefined && response.promptTokens > maxPrompt) {
      checks.push(`prompt ${response.promptTokens} > ${maxPrompt}`);
    }
    if (
      maxCompletion !== undefined &&
      response.completionTokens > maxCompletion
    ) {
      checks.push(`completion ${response.completionTokens} > ${maxCompletion}`);
    }

    const passed = checks.length === 0;

    return {
      type: "tokens",
      passed,
      actual: {
        total: response.totalTokens,
        prompt: response.promptTokens,
        completion: response.completionTokens,
      },
      expected: { maxTotal, maxPrompt, maxCompletion },
      message: passed
        ? undefined
        : `Token limits exceeded: ${checks.join(", ")}`,
      severity,
    };
  }

  private assertCost(
    assertion: TestAssertion,
    response: TestResponse,
    severity: "error" | "warning",
  ): AssertionResult {
    const { maxCost } = assertion.value as { maxCost: number };
    const passed = response.cost <= maxCost;

    return {
      type: "cost",
      passed,
      actual: response.cost,
      expected: maxCost,
      message: passed
        ? undefined
        : `Cost $${response.cost.toFixed(4)} exceeds maximum $${maxCost.toFixed(4)}`,
      severity,
    };
  }

  private assertToolCalled(
    assertion: TestAssertion,
    response: TestResponse,
    severity: "error" | "warning",
  ): AssertionResult {
    const { toolName, minCalls, maxCalls } = assertion.value as {
      toolName: string;
      minCalls?: number;
      maxCalls?: number;
    };

    const toolCalls = response.toolCalls ?? [];
    const callCount = toolCalls.filter((tc) => tc.name === toolName).length;

    const checks: string[] = [];
    if (minCalls !== undefined && callCount < minCalls) {
      checks.push(`called ${callCount} times, expected at least ${minCalls}`);
    }
    if (maxCalls !== undefined && callCount > maxCalls) {
      checks.push(`called ${callCount} times, expected at most ${maxCalls}`);
    }

    const passed =
      checks.length === 0 &&
      (minCalls === undefined || callCount >= (minCalls ?? 1));

    return {
      type: "tool_called",
      passed,
      actual: { toolName, callCount },
      expected: { toolName, minCalls, maxCalls },
      message: passed
        ? undefined
        : `Tool "${toolName}" ${checks.length > 0 ? checks.join(", ") : "was not called"}`,
      severity,
    };
  }

  private assertToolNotCalled(
    assertion: TestAssertion,
    response: TestResponse,
    severity: "error" | "warning",
  ): AssertionResult {
    const toolName = assertion.value as string;
    const toolCalls = response.toolCalls ?? [];
    const called = toolCalls.some((tc) => tc.name === toolName);

    return {
      type: "tool_not_called",
      passed: !called,
      actual: called,
      expected: false,
      message: called
        ? `Tool "${toolName}" was called but should not have been`
        : undefined,
      severity,
    };
  }

  private assertJsonSchema(
    assertion: TestAssertion,
    response: TestResponse,
    severity: "error" | "warning",
  ): AssertionResult {
    try {
      // Try to parse response as JSON
      const json = JSON.parse(response.content);
      // Basic schema validation (could use ajv for full JSON Schema support)
      const schema = assertion.value as Record<string, unknown>;
      const passed = this.validateBasicSchema(json, schema);

      return {
        type: "json_schema",
        passed,
        actual: json,
        expected: schema,
        message: passed ? undefined : "Response does not match JSON schema",
        severity,
      };
    } catch {
      return {
        type: "json_schema",
        passed: false,
        actual: response.content.slice(0, 200),
        expected: assertion.value,
        message: "Response is not valid JSON",
        severity,
      };
    }
  }

  private async assertSemanticSimilarity(
    assertion: TestAssertion,
    response: TestResponse,
    severity: "error" | "warning",
  ): Promise<AssertionResult> {
    const { expected, threshold } = assertion.value as {
      expected: string;
      threshold: number;
    };

    if (!this.embeddings) {
      return {
        type: "semantic_similarity",
        passed: false,
        actual: null,
        expected: { expected, threshold },
        message: "Embedding client not configured for semantic similarity",
        severity,
      };
    }

    try {
      const [responseEmb, expectedEmb] = await Promise.all([
        this.embeddings.embed(response.content),
        this.embeddings.embed(expected),
      ]);

      const similarity = this.embeddings.similarity(responseEmb, expectedEmb);
      const passed = similarity >= threshold;

      return {
        type: "semantic_similarity",
        passed,
        actual: similarity,
        expected: threshold,
        message: passed
          ? undefined
          : `Semantic similarity ${similarity.toFixed(3)} is below threshold ${threshold}`,
        severity,
      };
    } catch (error) {
      return {
        type: "semantic_similarity",
        passed: false,
        actual: null,
        expected: { expected, threshold },
        message: `Failed to compute similarity: ${error instanceof Error ? error.message : String(error)}`,
        severity,
      };
    }
  }

  private validateBasicSchema(
    json: unknown,
    schema: Record<string, unknown>,
  ): boolean {
    if (schema.type === "object" && typeof json !== "object") return false;
    if (schema.type === "array" && !Array.isArray(json)) return false;
    if (schema.type === "string" && typeof json !== "string") return false;
    if (schema.type === "number" && typeof json !== "number") return false;
    if (schema.type === "boolean" && typeof json !== "boolean") return false;

    if (
      schema.required &&
      Array.isArray(schema.required) &&
      typeof json === "object" &&
      json !== null
    ) {
      for (const key of schema.required as string[]) {
        if (!(key in json)) return false;
      }
    }

    return true;
  }

  /**
   * Compare response to baseline
   */
  private async compareToBaseline(
    response: TestResponse,
    baseline: TestCase["baseline"],
  ): Promise<BaselineComparison> {
    if (!baseline) {
      return {
        semanticSimilarity: 1,
        latencyChange: 0,
        tokenChange: 0,
        costChange: 0,
        isRegression: false,
        regressions: [],
      };
    }

    const regressions: RegressionInfo[] = [];
    const tolerance = baseline.tolerance ?? {};

    // Calculate changes
    const latencyChange =
      ((response.latencyMs - baseline.metrics.latencyMs) /
        baseline.metrics.latencyMs) *
      100;
    const tokenChange =
      ((response.totalTokens - baseline.metrics.totalTokens) /
        baseline.metrics.totalTokens) *
      100;
    const costChange =
      ((response.cost - baseline.metrics.cost) / baseline.metrics.cost) * 100;

    // Check for regressions
    if (
      tolerance.latencyPercent !== undefined &&
      latencyChange > tolerance.latencyPercent
    ) {
      regressions.push({
        type: "latency",
        message: `Latency increased by ${latencyChange.toFixed(1)}% (max ${tolerance.latencyPercent}%)`,
        severity: "warning",
        baseline: baseline.metrics.latencyMs,
        current: response.latencyMs,
        delta: latencyChange,
      });
    }

    if (
      tolerance.tokenPercent !== undefined &&
      tokenChange > tolerance.tokenPercent
    ) {
      regressions.push({
        type: "tokens",
        message: `Tokens increased by ${tokenChange.toFixed(1)}% (max ${tolerance.tokenPercent}%)`,
        severity: "warning",
        baseline: baseline.metrics.totalTokens,
        current: response.totalTokens,
        delta: tokenChange,
      });
    }

    if (
      tolerance.costPercent !== undefined &&
      costChange > tolerance.costPercent
    ) {
      regressions.push({
        type: "cost",
        message: `Cost increased by ${costChange.toFixed(1)}% (max ${tolerance.costPercent}%)`,
        severity: "warning",
        baseline: baseline.metrics.cost,
        current: response.cost,
        delta: costChange,
      });
    }

    // Calculate semantic similarity
    let semanticSimilarity = 1;
    if (this.embeddings && tolerance.semanticSimilarity !== undefined) {
      try {
        const [responseEmb, baselineEmb] = await Promise.all([
          this.embeddings.embed(response.content),
          this.embeddings.embed(baseline.response),
        ]);
        semanticSimilarity = this.embeddings.similarity(
          responseEmb,
          baselineEmb,
        );

        if (semanticSimilarity < tolerance.semanticSimilarity) {
          regressions.push({
            type: "semantic",
            message: `Semantic similarity ${semanticSimilarity.toFixed(3)} is below threshold ${tolerance.semanticSimilarity}`,
            severity: "error",
            baseline: tolerance.semanticSimilarity,
            current: semanticSimilarity,
            delta: tolerance.semanticSimilarity - semanticSimilarity,
          });
        }
      } catch {
        // Skip semantic check if embedding fails
      }
    }

    return {
      semanticSimilarity,
      latencyChange,
      tokenChange,
      costChange,
      isRegression: regressions.length > 0,
      regressions,
    };
  }

  // Helper methods
  private selectMedianResponse(responses: TestResponse[]): TestResponse {
    if (responses.length === 1) return responses[0];

    // Sort by latency and pick median
    const sorted = [...responses].sort((a, b) => a.latencyMs - b.latencyMs);
    return sorted[Math.floor(sorted.length / 2)];
  }

  private determineTestStatus(
    assertionResults: AssertionResult[],
    baselineComparison?: BaselineComparison,
  ): TestStatus {
    const hasErrors = assertionResults.some(
      (r) => !r.passed && r.severity === "error",
    );
    const hasWarnings =
      assertionResults.some((r) => !r.passed && r.severity === "warning") ||
      (baselineComparison?.isRegression ?? false);

    if (hasErrors) return "failed";
    if (hasWarnings) return "warning";
    return "passed";
  }

  private calculateScore(assertionResults: AssertionResult[]): number {
    if (assertionResults.length === 0) return 1;

    const totalWeight = assertionResults.reduce(
      (sum, r) => sum + (r.passed ? 1 : 0),
      0,
    );
    return totalWeight / assertionResults.length;
  }

  private calculateSummary(results: TestResult[]): TestRunSummary {
    const total = results.length;
    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const warnings = results.filter((r) => r.status === "warning").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const errors = results.filter((r) => r.status === "error").length;

    const passRate = total > 0 ? passed / total : 0;
    const averageScore =
      total > 0 ? results.reduce((sum, r) => sum + r.score, 0) / total : 0;

    const totalLatencyMs = results.reduce(
      (sum, r) => sum + (r.response?.latencyMs ?? 0),
      0,
    );
    const totalTokens = results.reduce(
      (sum, r) => sum + (r.response?.totalTokens ?? 0),
      0,
    );
    const totalCost = results.reduce(
      (sum, r) => sum + (r.response?.cost ?? 0),
      0,
    );

    const regressionCount = results.filter(
      (r) => r.baselineComparison?.isRegression,
    ).length;

    return {
      total,
      passed,
      failed,
      warnings,
      skipped,
      errors,
      passRate,
      averageScore,
      totalLatencyMs,
      totalTokens,
      totalCost,
      regressionCount,
    };
  }

  private determineRunStatus(summary: TestRunSummary): TestStatus {
    if (summary.errors > 0) return "error";
    if (summary.failed > 0) return "failed";
    if (summary.warnings > 0 && this.config.failOnWarning) return "failed";
    if (summary.warnings > 0) return "warning";
    if (summary.passRate < this.config.minPassRate) return "failed";
    return "passed";
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
