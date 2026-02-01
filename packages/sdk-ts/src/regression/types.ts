/**
 * Prompt Regression Testing - Types
 *
 * Type definitions for prompt regression testing framework.
 */

// ============================================================================
// Test Case Types
// ============================================================================

export interface TestCase {
  /** Unique test case identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this test validates */
  description?: string;

  /** Tags for filtering and organization */
  tags?: string[];

  /** Input prompt(s) to send */
  input: TestInput;

  /** Expected behavior assertions */
  assertions: TestAssertion[];

  /** Optional baseline to compare against */
  baseline?: TestBaseline;

  /** Timeout for test execution in ms */
  timeout?: number;

  /** Number of times to run for statistical validity */
  runs?: number;

  /** Test priority (higher = run first) */
  priority?: number;

  /** Whether test is enabled */
  enabled?: boolean;
}

export interface TestInput {
  /** System prompt */
  systemPrompt?: string;

  /** User message(s) */
  messages: TestMessage[];

  /** Model to use */
  model?: string;

  /** Temperature setting */
  temperature?: number;

  /** Max tokens */
  maxTokens?: number;

  /** Tools available */
  tools?: TestTool[];

  /** Additional model parameters */
  parameters?: Record<string, unknown>;
}

export interface TestMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface TestTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

// ============================================================================
// Assertion Types
// ============================================================================

export type AssertionType =
  | "contains"
  | "not_contains"
  | "matches_regex"
  | "semantic_similarity"
  | "json_schema"
  | "json_path"
  | "length"
  | "latency"
  | "tokens"
  | "cost"
  | "tool_called"
  | "tool_not_called"
  | "quality_score"
  | "custom";

export interface TestAssertion {
  /** Type of assertion */
  type: AssertionType;

  /** What to assert on */
  target: "response" | "tool_calls" | "metrics";

  /** Assertion-specific value */
  value: unknown;

  /** Custom error message */
  message?: string;

  /** Whether this is a warning vs failure */
  severity?: "error" | "warning";

  /** Weight for aggregate scoring (0-1) */
  weight?: number;
}

export interface ContainsAssertion extends TestAssertion {
  type: "contains";
  value: string;
  caseSensitive?: boolean;
}

export interface RegexAssertion extends TestAssertion {
  type: "matches_regex";
  value: string;
  flags?: string;
}

export interface SemanticSimilarityAssertion extends TestAssertion {
  type: "semantic_similarity";
  value: {
    expected: string;
    threshold: number;
  };
}

export interface JsonSchemaAssertion extends TestAssertion {
  type: "json_schema";
  value: Record<string, unknown>;
}

export interface JsonPathAssertion extends TestAssertion {
  type: "json_path";
  value: {
    path: string;
    expected: unknown;
  };
}

export interface LengthAssertion extends TestAssertion {
  type: "length";
  value: {
    min?: number;
    max?: number;
  };
}

export interface LatencyAssertion extends TestAssertion {
  type: "latency";
  value: {
    maxMs: number;
  };
}

export interface TokenAssertion extends TestAssertion {
  type: "tokens";
  value: {
    maxTotal?: number;
    maxPrompt?: number;
    maxCompletion?: number;
  };
}

export interface CostAssertion extends TestAssertion {
  type: "cost";
  value: {
    maxCost: number;
  };
}

export interface ToolCalledAssertion extends TestAssertion {
  type: "tool_called";
  value: {
    toolName: string;
    minCalls?: number;
    maxCalls?: number;
  };
}

export interface QualityScoreAssertion extends TestAssertion {
  type: "quality_score";
  value: {
    criterion: string;
    minScore: number;
  };
}

// ============================================================================
// Baseline Types
// ============================================================================

export interface TestBaseline {
  /** Baseline identifier */
  id: string;

  /** When baseline was captured */
  capturedAt: number;

  /** Version/commit that captured baseline */
  version?: string;

  /** Baseline response */
  response: string;

  /** Baseline metrics */
  metrics: BaselineMetrics;

  /** Tolerance for regression detection */
  tolerance?: BaselineTolerance;
}

export interface BaselineMetrics {
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  toolCalls?: string[];
  qualityScores?: Record<string, number>;
}

export interface BaselineTolerance {
  /** Max percentage increase in latency */
  latencyPercent?: number;

  /** Max percentage increase in tokens */
  tokenPercent?: number;

  /** Max percentage increase in cost */
  costPercent?: number;

  /** Min semantic similarity to baseline */
  semanticSimilarity?: number;

  /** Max quality score decrease */
  qualityScoreDelta?: number;
}

// ============================================================================
// Test Suite Types
// ============================================================================

export interface TestSuite {
  /** Suite identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description */
  description?: string;

  /** Version of the suite */
  version?: string;

  /** Test cases in this suite */
  testCases: TestCase[];

  /** Default configuration for all tests */
  defaults?: TestSuiteDefaults;

  /** Suite-level tags */
  tags?: string[];

  /** When suite was last updated */
  updatedAt?: number;
}

export interface TestSuiteDefaults {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  runs?: number;
  assertions?: TestAssertion[];
}

// ============================================================================
// Test Result Types
// ============================================================================

export type TestStatus = "passed" | "failed" | "warning" | "skipped" | "error";

export interface TestResult {
  /** Test case ID */
  testCaseId: string;

  /** Test case name */
  testCaseName: string;

  /** Overall status */
  status: TestStatus;

  /** Run duration in ms */
  durationMs: number;

  /** When test was run */
  runAt: number;

  /** Individual assertion results */
  assertionResults: AssertionResult[];

  /** Response from the model */
  response?: TestResponse;

  /** Comparison to baseline */
  baselineComparison?: BaselineComparison;

  /** Error if test errored */
  error?: TestError;

  /** Aggregate score (0-1) */
  score: number;
}

export interface AssertionResult {
  /** Assertion type */
  type: AssertionType;

  /** Pass/fail */
  passed: boolean;

  /** Actual value */
  actual: unknown;

  /** Expected value */
  expected: unknown;

  /** Error message if failed */
  message?: string;

  /** Severity */
  severity: "error" | "warning";
}

export interface TestResponse {
  content: string;
  model: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  toolCalls?: Array<{
    name: string;
    arguments: unknown;
  }>;
  finishReason?: string;
}

export interface BaselineComparison {
  /** Semantic similarity score (0-1) */
  semanticSimilarity: number;

  /** Latency change percentage */
  latencyChange: number;

  /** Token change percentage */
  tokenChange: number;

  /** Cost change percentage */
  costChange: number;

  /** Whether this is a regression */
  isRegression: boolean;

  /** Specific regressions detected */
  regressions: RegressionInfo[];
}

export interface RegressionInfo {
  type: "semantic" | "latency" | "tokens" | "cost" | "quality";
  message: string;
  severity: "error" | "warning";
  baseline: number;
  current: number;
  delta: number;
}

export interface TestError {
  type: string;
  message: string;
  stack?: string;
}

// ============================================================================
// Test Run Types
// ============================================================================

export interface TestRun {
  /** Run identifier */
  id: string;

  /** Suite being run */
  suiteId: string;

  /** Suite name */
  suiteName: string;

  /** Overall status */
  status: TestStatus;

  /** When run started */
  startedAt: number;

  /** When run completed */
  completedAt?: number;

  /** Total duration in ms */
  durationMs?: number;

  /** Git commit SHA */
  commitSha?: string;

  /** Git branch */
  branch?: string;

  /** PR number if in PR context */
  prNumber?: number;

  /** Individual test results */
  results: TestResult[];

  /** Summary statistics */
  summary: TestRunSummary;

  /** Environment info */
  environment?: Record<string, string>;
}

export interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  errors: number;
  passRate: number;
  averageScore: number;
  totalLatencyMs: number;
  totalTokens: number;
  totalCost: number;
  regressionCount: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface RegressionTestConfig {
  /** Enable/disable regression testing */
  enabled?: boolean;

  /** Directory containing test files */
  testDir?: string;

  /** Pattern for test file names */
  testPattern?: string;

  /** Parallel test execution */
  parallel?: boolean;

  /** Max concurrent tests */
  maxConcurrency?: number;

  /** Global timeout */
  timeout?: number;

  /** Fail on any warning */
  failOnWarning?: boolean;

  /** Minimum pass rate to succeed */
  minPassRate?: number;

  /** Baseline storage location */
  baselineDir?: string;

  /** Auto-update baselines on pass */
  autoUpdateBaselines?: boolean;

  /** Reporter configuration */
  reporters?: ReporterConfig[];

  /** Model provider configuration */
  provider?: ProviderConfig;

  /** Debug mode */
  debug?: boolean;
}

export interface ReporterConfig {
  type: "console" | "json" | "html" | "github" | "junit";
  options?: Record<string, unknown>;
}

export interface ProviderConfig {
  type: "openai" | "anthropic" | "copilot" | "mock";
  apiKey?: string;
  endpoint?: string;
  defaultModel?: string;
}

// ============================================================================
// YAML Schema Types (for .agentops-tests.yaml files)
// ============================================================================

export interface TestSuiteYaml {
  version: "1.0";
  name: string;
  description?: string;
  defaults?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    timeout?: number;
    runs?: number;
  };
  tests: TestCaseYaml[];
}

export interface TestCaseYaml {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  enabled?: boolean;
  input: {
    system?: string;
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    tools?: Array<{
      name: string;
      description: string;
      parameters?: Record<string, unknown>;
    }>;
  };
  assertions: Array<{
    type: string;
    target?: string;
    value: unknown;
    message?: string;
    severity?: string;
    weight?: number;
  }>;
  baseline?: {
    response: string;
    metrics: {
      latency_ms: number;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      cost: number;
    };
    tolerance?: {
      latency_percent?: number;
      token_percent?: number;
      cost_percent?: number;
      semantic_similarity?: number;
    };
  };
}
