/**
 * Prompt CI/CD Pipeline - Types
 *
 * Type definitions for prompt CI/CD testing, gating, and automation.
 *
 * @packageDocumentation
 */

// ============================================================================
// Test Configuration
// ============================================================================

/** Configuration for running prompt test suites */
export interface PromptTestConfig {
  /** Directory containing test suite files */
  suiteDir: string;

  /** Output format for test results */
  outputFormat: "json" | "junit" | "markdown";

  /** Timeout per test case in milliseconds */
  timeout: number;

  /** Whether to run tests in parallel */
  parallel: boolean;

  /** Minimum quality score threshold (0-1) */
  qualityThreshold: number;

  /** Maximum cost per test in USD */
  costThreshold: number;

  /** Maximum latency per test in milliseconds */
  latencyThreshold: number;
}

// ============================================================================
// Test Suite & Case Types
// ============================================================================

/** A collection of prompt test cases */
export interface PromptTestSuite {
  /** Unique suite identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of the test suite */
  description?: string;

  /** Test cases in this suite */
  prompts: PromptTestCase[];

  /** Default model for all tests */
  model?: string;

  /** Assertions applied to all test cases */
  globalAssertions?: TestAssertion[];
}

/** A single prompt test case */
export interface PromptTestCase {
  /** Unique test case identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Input prompt string */
  input: string;

  /** Optional expected output for comparison */
  expectedOutput?: string;

  /** Assertions to evaluate against the response */
  assertions: TestAssertion[];

  /** Model override for this test case */
  model?: string;

  /** Temperature for generation */
  temperature?: number;

  /** Max tokens for generation */
  maxTokens?: number;

  /** Tags for filtering and organization */
  tags?: string[];
}

// ============================================================================
// Assertion Types
// ============================================================================

/** A single assertion to evaluate against a test result */
export interface TestAssertion {
  /** Assertion type */
  type:
    | "contains"
    | "not_contains"
    | "regex"
    | "json_schema"
    | "cost_under"
    | "latency_under"
    | "quality_above"
    | "semantic_similarity";

  /** Expected value (string for text assertions, number for threshold assertions) */
  value: string | number;

  /** Additional options for the assertion */
  options?: Record<string, unknown>;
}

/** Result of evaluating a single assertion */
export interface AssertionResult {
  /** The assertion that was evaluated */
  assertion: TestAssertion;

  /** Whether the assertion passed */
  passed: boolean;

  /** Actual value observed */
  actual: unknown;

  /** Human-readable message */
  message: string;
}

// ============================================================================
// Execution Result Types
// ============================================================================

/** Result of executing a single test case */
export interface TestExecutionResult {
  /** ID of the test case that was executed */
  testCaseId: string;

  /** Whether all assertions passed */
  passed: boolean;

  /** Individual assertion results */
  assertions: AssertionResult[];

  /** Raw response from the model */
  response: string;

  /** Model used for execution */
  model: string;

  /** Token usage */
  tokens: { prompt: number; completion: number };

  /** Cost in USD */
  costUsd: number;

  /** Latency in milliseconds */
  latencyMs: number;

  /** Quality score (0-1) */
  qualityScore: number;

  /** Timestamp of execution */
  timestamp: string;
}

/** Aggregated result for an entire test suite */
export interface TestSuiteResult {
  /** ID of the suite that was executed */
  suiteId: string;

  /** Suite name */
  name: string;

  /** Number of tests that passed */
  passed: number;

  /** Total number of tests */
  total: number;

  /** Number of tests that failed */
  failed: number;

  /** Individual test execution results */
  results: TestExecutionResult[];

  /** Total duration in milliseconds */
  durationMs: number;

  /** Human-readable summary */
  summary: string;
}

// ============================================================================
// CI Gate Types
// ============================================================================

/** Configuration for CI/CD gate checks */
export interface CIGateConfig {
  /** Minimum average quality score (0-1) */
  qualityThreshold: number;

  /** Maximum cost per test in USD */
  maxCostPerTest: number;

  /** Maximum latency per test in milliseconds */
  maxLatencyMs: number;

  /** Minimum pass rate (0-1) */
  minPassRate: number;

  /** Whether to block the pipeline on failure */
  blockOnFailure: boolean;
}

/** Verdict from CI gate evaluation */
export interface CIGateVerdict {
  /** Whether the gate passed */
  passed: boolean;

  /** Overall pass rate (0-1) */
  passRate: number;

  /** Average quality score across all tests */
  avgQuality: number;

  /** Total cost in USD */
  totalCost: number;

  /** Maximum latency observed in milliseconds */
  maxLatency: number;

  /** List of violation descriptions */
  violations: string[];

  /** Human-readable summary */
  summary: string;
}

// ============================================================================
// GitHub Actions Types
// ============================================================================

/** Configuration for GitHub Actions workflow generation */
export interface GitHubActionConfig {
  /** Name of the workflow */
  workflowName: string;

  /** Events that trigger the workflow */
  triggerOn: ("push" | "pull_request" | "schedule")[];

  /** Branches to run on */
  branches: string[];

  /** Glob pattern for test suite files */
  suiteGlob: string;

  /** GitHub secret name containing the AgentOps API key */
  agentopsApiKeySecret: string;
}

// ============================================================================
// DSL Types
// ============================================================================

/** A YAML-parsed prompt test definition format */
export interface PromptTestDSL {
  /** Suite name */
  name: string;

  /** Suite description */
  description?: string;

  /** Default model */
  model?: string;

  /** Global assertions applied to all tests */
  globalAssertions?: Array<{ type: string; value: string | number }>;

  /** Test case definitions */
  tests: Array<{
    /** Test name */
    name: string;

    /** Input prompt */
    input: string;

    /** Expected output */
    expectedOutput?: string;

    /** Model override */
    model?: string;

    /** Temperature */
    temperature?: number;

    /** Max tokens */
    maxTokens?: number;

    /** Tags */
    tags?: string[];

    /** Assertions */
    assertions: Array<{ type: string; value: string | number }>;
  }>;
}
