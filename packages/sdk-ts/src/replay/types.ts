/**
 * AgentOps SDK - Replay & Simulation Types
 *
 * Type definitions for session replay and testing.
 */

// ============================================================================
// Captured Session Types
// ============================================================================

export interface CapturedSession {
  /** Session identifier */
  sessionId: string;

  /** User who created the session */
  userId?: string;

  /** Feature identifier */
  featureId?: string;

  /** Session start time */
  startTime: number;

  /** Session end time */
  endTime?: number;

  /** Captured events in order */
  events: CapturedEvent[];

  /** Session metadata */
  metadata?: Record<string, unknown>;

  /** Session tags */
  tags?: string[];

  /** Total tokens used */
  totalTokens?: number;

  /** Total cost */
  totalCost?: number;

  /** Final status */
  status: "completed" | "error";
}

export interface CapturedEvent {
  /** Event identifier */
  eventId: string;

  /** Parent event ID */
  parentEventId?: string;

  /** Event type */
  type: "prompt" | "response" | "tool_call" | "tool_result" | "error";

  /** Timestamp */
  timestamp: number;

  /** Duration (for responses) */
  durationMs?: number;

  /** Event-specific data */
  data:
    | CapturedPrompt
    | CapturedResponse
    | CapturedToolCall
    | CapturedToolResult
    | CapturedError;
}

export interface CapturedPrompt {
  role: "user" | "system" | "assistant";
  content: string;
  model?: string;
}

export interface CapturedResponse {
  content: string;
  model: string;
  tokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export interface CapturedToolCall {
  toolName: string;
  toolInput: unknown;
}

export interface CapturedToolResult {
  toolName: string;
  toolOutput: unknown;
  status: "success" | "error";
}

export interface CapturedError {
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
}

// ============================================================================
// Replay Configuration
// ============================================================================

export interface ReplayConfig {
  /** Speed multiplier (1 = real-time, 2 = 2x speed, 0 = instant) */
  speed?: number;

  /** Whether to actually call the LLM */
  mode: "mock" | "live";

  /** Model to use for live replay (overrides captured model) */
  overrideModel?: string;

  /** Prompt modifications to apply */
  promptModifications?: PromptModification[];

  /** Callback for each event during replay */
  onEvent?: (event: CapturedEvent, isOriginal: boolean) => void;

  /** Callback when replay completes */
  onComplete?: (result: ReplayResult) => void;
}

export interface PromptModification {
  /** Type of modification */
  type: "replace" | "prepend" | "append" | "regex";

  /** Target: 'system' | 'user' | 'all' */
  target: "system" | "user" | "all";

  /** Pattern to match (for replace/regex) */
  pattern?: string;

  /** Replacement text */
  replacement: string;
}

// ============================================================================
// Replay Results
// ============================================================================

export interface ReplayResult {
  /** Original session ID */
  originalSessionId: string;

  /** New session ID (for live replays) */
  replaySessionId?: string;

  /** Replay start time */
  startTime: number;

  /** Replay end time */
  endTime: number;

  /** Whether replay completed successfully */
  success: boolean;

  /** Error if replay failed */
  error?: string;

  /** Comparison of original vs replay */
  comparison: ReplayComparison;

  /** Individual event comparisons */
  eventComparisons: EventComparison[];
}

export interface ReplayComparison {
  /** Token usage difference (percentage) */
  tokenDifferencePercent: number;

  /** Cost difference (percentage) */
  costDifferencePercent: number;

  /** Latency difference (percentage) */
  latencyDifferencePercent: number;

  /** Output similarity (0-1) */
  outputSimilarity: number;

  /** Quality score difference (if available) */
  qualityScoreDifference?: number;
}

export interface EventComparison {
  /** Original event ID */
  originalEventId: string;

  /** Replay event ID */
  replayEventId?: string;

  /** Event type */
  type: CapturedEvent["type"];

  /** Whether outputs match */
  outputsMatch: boolean;

  /** Similarity score (0-1) */
  similarity: number;

  /** Differences found */
  differences: string[];
}

// ============================================================================
// Simulation Types
// ============================================================================

export interface SimulationScenario {
  /** Scenario identifier */
  id: string;

  /** Scenario name */
  name: string;

  /** Description */
  description?: string;

  /** Base session to simulate from */
  baseSessionId?: string;

  /** Test cases in this scenario */
  testCases: TestCase[];

  /** Success criteria */
  successCriteria: SuccessCriterion[];
}

export interface TestCase {
  /** Test case identifier */
  id: string;

  /** Test case name */
  name: string;

  /** Input prompt */
  prompt: string;

  /** Expected behavior (not exact output) */
  expectedBehavior?: string;

  /** Variables for prompt templates */
  variables?: Record<string, string>;

  /** Model to use */
  model?: string;
}

export interface SuccessCriterion {
  /** Criterion type */
  type:
    | "contains"
    | "not_contains"
    | "regex"
    | "quality_score"
    | "token_limit"
    | "custom";

  /** Value for comparison */
  value: string | number | RegExp;

  /** Custom evaluation function */
  evaluate?: (response: string) => boolean;
}

export interface SimulationResult {
  /** Scenario ID */
  scenarioId: string;

  /** Overall pass rate */
  passRate: number;

  /** Individual test results */
  testResults: TestResult[];

  /** Aggregate statistics */
  stats: {
    totalTests: number;
    passed: number;
    failed: number;
    avgLatencyMs: number;
    avgTokens: number;
    avgCost: number;
  };
}

export interface TestResult {
  /** Test case ID */
  testCaseId: string;

  /** Whether test passed */
  passed: boolean;

  /** Actual response */
  actualResponse: string;

  /** Criteria results */
  criteriaResults: Array<{
    criterion: SuccessCriterion;
    passed: boolean;
    reason?: string;
  }>;

  /** Performance metrics */
  metrics: {
    latencyMs: number;
    tokens: number;
    cost: number;
    qualityScore?: number;
  };
}
