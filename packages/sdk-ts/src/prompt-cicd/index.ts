/**
 * Prompt CI/CD Pipeline Module
 *
 * Testing, CI gating, and workflow automation for prompt quality.
 *
 * @packageDocumentation
 */

// Types
export type {
  PromptTestConfig,
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

// Engine
export { PromptCICDEngine, type PromptExecutor } from "./engine.js";
