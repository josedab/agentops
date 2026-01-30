/**
 * AgentOps SDK - Replay Module
 *
 * Exports for session replay and simulation.
 */

export { ReplayEngine } from "./engine.js";

export type {
  CapturedSession,
  CapturedEvent,
  CapturedPrompt,
  CapturedResponse,
  CapturedToolCall,
  CapturedToolResult,
  CapturedError,
  ReplayConfig,
  PromptModification,
  ReplayResult,
  ReplayComparison,
  EventComparison,
  SimulationScenario,
  TestCase,
  SuccessCriterion,
  SimulationResult,
  TestResult,
} from "./types.js";

// Extended types for synthetic session replay (Feature 5)
export type {
  BatchReplayResult,
  AggregateMetrics,
  ConfigComparisonResult,
  ReplayTemplate,
} from "./engine.js";
