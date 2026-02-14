/**
 * AgentOps SDK - Synthetic Test Engine
 *
 * Engine for creating personas, running synthetic scenarios,
 * executing load tests, and generating scenarios from traces.
 */

import type {
  SyntheticConfig,
  ResolvedSyntheticConfig,
  Persona,
  PersonaTrait,
  SyntheticScenario,
  ScenarioTurn,
  SyntheticSession,
  ExecutedTurn,
  TurnAssertion,
  AgentExecutor,
  LoadTestConfig,
  LoadTestResult,
  SyntheticMetrics,
} from "./types.js";
import type { AgentEvent } from "../types.js";
import { generateEventId, now } from "../utils.js";

const DEFAULT_SYNTHETIC_CONFIG: ResolvedSyntheticConfig = {
  enabled: true,
  maxConcurrentSessions: 10,
  defaultTimeout: 30000,
  debug: false,
};

const BUILT_IN_PERSONAS: Omit<Persona, "id">[] = [
  {
    name: "happy_user",
    description: "A compliant user who makes simple, straightforward requests",
    traits: ["compliant"] as PersonaTrait[],
    conversationStyle: "concise",
    intentPatterns: ["simple query", "basic request", "greeting"],
    edgeCaseProbability: 0.05,
  },
  {
    name: "power_user",
    description: "An expert user who makes complex, technical queries",
    traits: ["expert"] as PersonaTrait[],
    conversationStyle: "technical",
    intentPatterns: [
      "complex query",
      "multi-step task",
      "advanced configuration",
    ],
    edgeCaseProbability: 0.2,
  },
  {
    name: "confused_user",
    description: "A confused user who makes ambiguous, verbose requests",
    traits: ["confused"] as PersonaTrait[],
    conversationStyle: "verbose",
    intentPatterns: ["ambiguous request", "unclear question", "mixed intent"],
    edgeCaseProbability: 0.4,
  },
  {
    name: "adversarial_user",
    description: "An adversarial user who tries edge cases and unusual inputs",
    traits: ["adversarial"] as PersonaTrait[],
    conversationStyle: "casual",
    intentPatterns: ["injection attempt", "boundary test", "malformed input"],
    edgeCaseProbability: 0.9,
  },
  {
    name: "impatient_user",
    description:
      "An impatient user who expects fast responses with short inputs",
    traits: ["impatient"] as PersonaTrait[],
    conversationStyle: "concise",
    intentPatterns: ["quick question", "one-word query", "terse command"],
    edgeCaseProbability: 0.1,
  },
];

export class SyntheticTestEngine {
  private readonly config: ResolvedSyntheticConfig;
  private readonly personas: Map<string, Persona> = new Map();
  private readonly scenarios: Map<string, SyntheticScenario> = new Map();
  private readonly sessions: SyntheticSession[] = [];
  private totalScenariosRun = 0;
  private totalLoadTests = 0;

  constructor(config?: SyntheticConfig) {
    this.config = {
      ...DEFAULT_SYNTHETIC_CONFIG,
      ...config,
    };

    // Register built-in personas
    for (const p of BUILT_IN_PERSONAS) {
      const persona: Persona = { ...p, id: generateEventId() };
      this.personas.set(persona.id, persona);
    }
  }

  // ============================================================================
  // Persona Management
  // ============================================================================

  createPersona(persona: Omit<Persona, "id">): Persona {
    const full: Persona = { ...persona, id: generateEventId() };
    this.personas.set(full.id, full);
    return full;
  }

  getPersona(id: string): Persona | undefined {
    return this.personas.get(id);
  }

  listPersonas(): Persona[] {
    return Array.from(this.personas.values());
  }

  getBuiltInPersonas(): Persona[] {
    return Array.from(this.personas.values()).filter((p) =>
      BUILT_IN_PERSONAS.some((bp) => bp.name === p.name),
    );
  }

  // ============================================================================
  // Scenario Management
  // ============================================================================

  createScenario(scenario: Omit<SyntheticScenario, "id">): SyntheticScenario {
    const full: SyntheticScenario = { ...scenario, id: generateEventId() };
    this.scenarios.set(full.id, full);
    return full;
  }

  getScenario(id: string): SyntheticScenario | undefined {
    return this.scenarios.get(id);
  }

  listScenarios(): SyntheticScenario[] {
    return Array.from(this.scenarios.values());
  }

  // ============================================================================
  // Scenario Execution
  // ============================================================================

  async runScenario(
    scenarioId: string,
    executor: AgentExecutor,
  ): Promise<SyntheticSession> {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    const session: SyntheticSession = {
      id: generateEventId(),
      scenarioId,
      personaId: scenario.persona.id,
      turns: [],
      status: "running",
      startTime: now(),
      endTime: null,
      totalTokens: 0,
      totalCost: 0,
      assertionsPassed: 0,
      assertionsFailed: 0,
      error: null,
    };

    try {
      const userTurns = scenario.turns.filter((t) => t.role === "user");

      for (const turn of userTurns) {
        if (turn.delayMs && turn.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, turn.delayMs));
        }

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Turn execution timed out")),
            this.config.defaultTimeout,
          ),
        );

        const result = await Promise.race([
          executor.execute(turn.content),
          timeoutPromise,
        ]);

        const assertionResults = this.evaluateAssertions(
          turn.expectedAssertions ?? [],
          result,
        );

        const executed: ExecutedTurn = {
          input: turn.content,
          output: result.output,
          latencyMs: result.latencyMs,
          tokens: result.tokens,
          cost: result.cost,
          assertionResults,
        };

        session.turns.push(executed);
        session.totalTokens += result.tokens;
        session.totalCost += result.cost;

        for (const ar of assertionResults) {
          if (ar.passed) {
            session.assertionsPassed++;
          } else {
            session.assertionsFailed++;
          }
        }
      }

      session.status = session.assertionsFailed > 0 ? "failed" : "completed";
    } catch (err) {
      session.status = (err as Error).message.includes("timed out")
        ? "timeout"
        : "failed";
      session.error = (err as Error).message;
    }

    session.endTime = now();
    this.sessions.push(session);
    this.totalScenariosRun++;
    return session;
  }

  // ============================================================================
  // Load Testing
  // ============================================================================

  async runLoadTest(
    config: LoadTestConfig,
    executor: AgentExecutor,
  ): Promise<LoadTestResult> {
    const startTime = now();
    const sessions: SyntheticSession[] = [];
    const rampUpMs = config.rampUpMs ?? 0;

    // Register scenarios that aren't already stored
    for (const scenario of config.scenarios) {
      if (!this.scenarios.has(scenario.id)) {
        this.scenarios.set(scenario.id, scenario);
      }
    }

    // Build a queue of scenario IDs for the total sessions
    const queue: string[] = [];
    for (let i = 0; i < config.totalSessions; i++) {
      queue.push(config.scenarios[i % config.scenarios.length].id);
    }

    // Process in batches by concurrency
    for (let i = 0; i < queue.length; i += config.concurrency) {
      if (rampUpMs > 0 && i > 0) {
        const delayPerBatch =
          rampUpMs / Math.ceil(queue.length / config.concurrency);
        await new Promise((resolve) => setTimeout(resolve, delayPerBatch));
      }

      const batch = queue.slice(i, i + config.concurrency);
      const batchPromises = batch.map((scenarioId) => {
        const timeoutPromise = new Promise<SyntheticSession>((resolve) =>
          setTimeout(() => {
            const timedOut: SyntheticSession = {
              id: generateEventId(),
              scenarioId,
              personaId: this.scenarios.get(scenarioId)!.persona.id,
              turns: [],
              status: "timeout",
              startTime: now(),
              endTime: now(),
              totalTokens: 0,
              totalCost: 0,
              assertionsPassed: 0,
              assertionsFailed: 0,
              error: "Load test session timed out",
            };
            return resolve(timedOut);
          }, config.timeout),
        );

        return Promise.race([
          this.runScenario(scenarioId, executor),
          timeoutPromise,
        ]);
      });

      const batchResults = await Promise.all(batchPromises);
      sessions.push(...batchResults);
    }

    const endTime = now();
    const totalDurationMs = endTime - startTime;

    // Compute stats
    const allLatencies = sessions.flatMap((s) =>
      s.turns.map((t) => t.latencyMs),
    );
    allLatencies.sort((a, b) => a - b);

    const successCount = sessions.filter(
      (s) => s.status === "completed",
    ).length;

    // Aggregate errors
    const errorMap = new Map<string, number>();
    for (const s of sessions) {
      if (s.error) {
        errorMap.set(s.error, (errorMap.get(s.error) ?? 0) + 1);
      }
    }

    const result: LoadTestResult = {
      id: generateEventId(),
      sessions,
      totalDurationMs,
      successRate: sessions.length > 0 ? successCount / sessions.length : 0,
      avgLatencyMs:
        allLatencies.length > 0
          ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
          : 0,
      p95LatencyMs: this.percentile(allLatencies, 0.95),
      p99LatencyMs: this.percentile(allLatencies, 0.99),
      totalTokens: sessions.reduce((sum, s) => sum + s.totalTokens, 0),
      totalCost: sessions.reduce((sum, s) => sum + s.totalCost, 0),
      throughput:
        totalDurationMs > 0 ? (sessions.length / totalDurationMs) * 1000 : 0,
      errors: Array.from(errorMap.entries()).map(([message, count]) => ({
        message,
        count,
      })),
    };

    this.totalLoadTests++;
    return result;
  }

  // ============================================================================
  // Trace Import
  // ============================================================================

  generateScenarioFromTrace(
    events: AgentEvent[],
    persona?: Persona,
  ): SyntheticScenario {
    const turns: ScenarioTurn[] = [];

    for (const event of events) {
      if (event.type === "prompt") {
        turns.push({
          role: event.role === "system" ? "system" : "user",
          content:
            typeof event.content === "string"
              ? event.content
              : JSON.stringify(event.content),
        });
      }
    }

    const usedPersona = persona ?? this.getBuiltInPersonas()[0];

    const scenario = this.createScenario({
      name: `Trace scenario (${turns.length} turns)`,
      description: `Auto-generated from ${events.length} trace events`,
      persona: usedPersona,
      turns,
      expectedOutcome: "any",
      tags: ["generated", "from-trace"],
    });

    return scenario;
  }

  // ============================================================================
  // Metrics & Reset
  // ============================================================================

  getMetrics(): SyntheticMetrics {
    const completedSessions = this.sessions.filter(
      (s) => s.status === "completed",
    );
    const totalSessionsGenerated = this.sessions.length;
    const avgSuccessRate =
      totalSessionsGenerated > 0
        ? completedSessions.length / totalSessionsGenerated
        : 0;

    return {
      totalScenariosRun: this.totalScenariosRun,
      totalSessionsGenerated,
      avgSuccessRate,
      totalLoadTests: this.totalLoadTests,
    };
  }

  reset(): void {
    this.personas.clear();
    this.scenarios.clear();
    this.sessions.length = 0;
    this.totalScenariosRun = 0;
    this.totalLoadTests = 0;

    // Re-register built-in personas
    for (const p of BUILT_IN_PERSONAS) {
      const persona: Persona = { ...p, id: generateEventId() };
      this.personas.set(persona.id, persona);
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private evaluateAssertions(
    assertions: TurnAssertion[],
    result: { output: string; latencyMs: number; cost: number },
  ): { assertion: TurnAssertion; passed: boolean; actual: unknown }[] {
    return assertions.map((assertion) => {
      switch (assertion.type) {
        case "contains":
          return {
            assertion,
            passed: result.output.includes(String(assertion.value)),
            actual: result.output,
          };
        case "not_contains":
          return {
            assertion,
            passed: !result.output.includes(String(assertion.value)),
            actual: result.output,
          };
        case "max_latency":
          return {
            assertion,
            passed: result.latencyMs <= Number(assertion.value),
            actual: result.latencyMs,
          };
        case "max_cost":
          return {
            assertion,
            passed: result.cost <= Number(assertion.value),
            actual: result.cost,
          };
        case "min_quality":
          return {
            assertion,
            passed: true,
            actual: null,
          };
        default:
          return { assertion, passed: false, actual: null };
      }
    });
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil(p * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }
}
