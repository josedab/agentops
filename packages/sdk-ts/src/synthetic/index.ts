/**
 * AgentOps SDK - Synthetic Agent Testing Module
 *
 * Exports for synthetic agent testing functionality.
 */

export { SyntheticTestEngine } from "./engine.js";

export type {
  SyntheticConfig,
  ResolvedSyntheticConfig,
  Persona,
  PersonaTrait,
  SyntheticScenario,
  ScenarioTurn,
  TurnAssertion,
  SyntheticSession,
  ExecutedTurn,
  AgentExecutor,
  LoadTestConfig,
  LoadTestResult,
  SyntheticMetrics,
} from "./types.js";
