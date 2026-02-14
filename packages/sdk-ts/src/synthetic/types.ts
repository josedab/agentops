/**
 * AgentOps SDK - Synthetic Agent Testing Types
 *
 * Type definitions for synthetic testing personas, scenarios, sessions, and load tests.
 */

// ============================================================================
// Configuration
// ============================================================================

export interface SyntheticConfig {
  enabled: boolean;
  maxConcurrentSessions?: number;
  defaultTimeout?: number;
  debug?: boolean;
}

export interface ResolvedSyntheticConfig {
  enabled: boolean;
  maxConcurrentSessions: number;
  defaultTimeout: number;
  debug: boolean;
}

// ============================================================================
// Persona Types
// ============================================================================

export type PersonaTrait =
  | "curious"
  | "impatient"
  | "adversarial"
  | "compliant"
  | "confused"
  | "expert"
  | "novice";

export interface Persona {
  id: string;
  name: string;
  description: string;
  traits: PersonaTrait[];
  conversationStyle: "concise" | "verbose" | "technical" | "casual";
  intentPatterns: string[];
  edgeCaseProbability: number;
}

// ============================================================================
// Scenario Types
// ============================================================================

export interface TurnAssertion {
  type:
    | "contains"
    | "not_contains"
    | "max_latency"
    | "max_cost"
    | "min_quality";
  value: string | number;
}

export interface ScenarioTurn {
  role: "user" | "system";
  content: string;
  expectedAssertions?: TurnAssertion[];
  delayMs?: number;
}

export interface SyntheticScenario {
  id: string;
  name: string;
  description: string;
  persona: Persona;
  turns: ScenarioTurn[];
  expectedOutcome: "success" | "failure" | "any";
  tags: string[];
}

// ============================================================================
// Session & Execution Types
// ============================================================================

export interface ExecutedTurn {
  input: string;
  output: string;
  latencyMs: number;
  tokens: number;
  cost: number;
  assertionResults: {
    assertion: TurnAssertion;
    passed: boolean;
    actual: unknown;
  }[];
}

export interface SyntheticSession {
  id: string;
  scenarioId: string;
  personaId: string;
  turns: ExecutedTurn[];
  status: "pending" | "running" | "completed" | "failed" | "timeout";
  startTime: number;
  endTime: number | null;
  totalTokens: number;
  totalCost: number;
  assertionsPassed: number;
  assertionsFailed: number;
  error: string | null;
}

// ============================================================================
// Agent Executor Interface
// ============================================================================

export interface AgentExecutor {
  execute(
    input: string,
    context?: Record<string, unknown>,
  ): Promise<{
    output: string;
    latencyMs: number;
    tokens: number;
    cost: number;
  }>;
}

// ============================================================================
// Load Test Types
// ============================================================================

export interface LoadTestConfig {
  scenarios: SyntheticScenario[];
  concurrency: number;
  totalSessions: number;
  rampUpMs?: number;
  timeout: number;
}

export interface LoadTestResult {
  id: string;
  sessions: SyntheticSession[];
  totalDurationMs: number;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  totalTokens: number;
  totalCost: number;
  throughput: number;
  errors: { message: string; count: number }[];
}

// ============================================================================
// Metrics
// ============================================================================

export interface SyntheticMetrics {
  totalScenariosRun: number;
  totalSessionsGenerated: number;
  avgSuccessRate: number;
  totalLoadTests: number;
}
