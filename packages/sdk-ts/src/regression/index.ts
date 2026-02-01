/**
 * Prompt Regression Testing Module
 *
 * Comprehensive prompt regression testing framework for AI agents.
 */

// Types
export type {
  // Test case types
  TestCase,
  TestInput,
  TestMessage,
  TestTool,

  // Assertion types
  AssertionType,
  TestAssertion,
  ContainsAssertion,
  RegexAssertion,
  SemanticSimilarityAssertion,
  JsonSchemaAssertion,
  JsonPathAssertion,
  LengthAssertion,
  LatencyAssertion,
  TokenAssertion,
  CostAssertion,
  ToolCalledAssertion,
  QualityScoreAssertion,

  // Baseline types
  TestBaseline,
  BaselineMetrics,
  BaselineTolerance,

  // Suite types
  TestSuite,
  TestSuiteDefaults,

  // Result types
  TestStatus,
  TestResult,
  AssertionResult,
  TestResponse,
  BaselineComparison,
  RegressionInfo,
  TestError,

  // Run types
  TestRun,
  TestRunSummary,

  // Config types
  RegressionTestConfig,
  ReporterConfig,
  ProviderConfig,

  // YAML types
  TestSuiteYaml,
  TestCaseYaml,
} from "./types.js";

// Runner
export {
  TestRunner,
  type TestRunnerOptions,
  type LLMClient,
  type EmbeddingClient,
} from "./runner.js";

// Parser
export {
  parseTestSuiteYaml,
  generateTestSuiteYaml,
  EXAMPLE_TEST_SUITE_YAML,
} from "./parser.js";

// GitHub Integration
export {
  GitHubReporter,
  generateWorkflow,
  generateTestConfig,
  type GitHubReporterOptions,
  type GitHubContext,
  type CheckRunOutput,
  type CheckRunAnnotation,
  type PRComment,
  type WorkflowOptions,
} from "./github.js";
