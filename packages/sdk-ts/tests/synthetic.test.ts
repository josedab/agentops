import { describe, it, expect, beforeEach } from "vitest";
import {
  SyntheticTestEngine,
  type Persona,
  type SyntheticScenario,
  type AgentExecutor,
  type LoadTestConfig,
} from "../src/synthetic";

/** Deterministic mock executor */
function createMockExecutor(
  overrides?: Partial<Awaited<ReturnType<AgentExecutor["execute"]>>>,
): AgentExecutor {
  return {
    execute: async (input: string) => ({
      output: `Response to: ${input}`,
      latencyMs: 50,
      tokens: 100,
      cost: 0.01,
      ...overrides,
    }),
  };
}

describe("SyntheticTestEngine", () => {
  let engine: SyntheticTestEngine;
  let mockExecutor: AgentExecutor;

  beforeEach(() => {
    engine = new SyntheticTestEngine({ enabled: true, debug: false });
    mockExecutor = createMockExecutor();
  });

  // ==========================================================================
  // Persona Management
  // ==========================================================================

  describe("persona management", () => {
    it("should return 5 built-in personas", () => {
      const builtIn = engine.getBuiltInPersonas();
      expect(builtIn).toHaveLength(5);
      const names = builtIn.map((p) => p.name);
      expect(names).toContain("happy_user");
      expect(names).toContain("power_user");
      expect(names).toContain("confused_user");
      expect(names).toContain("adversarial_user");
      expect(names).toContain("impatient_user");
    });

    it("should create a custom persona with generated id", () => {
      const persona = engine.createPersona({
        name: "test_persona",
        description: "A test persona",
        traits: ["curious"],
        conversationStyle: "concise",
        intentPatterns: ["test query"],
        edgeCaseProbability: 0.1,
      });

      expect(persona.id).toBeDefined();
      expect(persona.name).toBe("test_persona");
      expect(persona.traits).toEqual(["curious"]);
    });

    it("should retrieve persona by id", () => {
      const persona = engine.createPersona({
        name: "lookup_test",
        description: "Test",
        traits: ["expert"],
        conversationStyle: "technical",
        intentPatterns: [],
        edgeCaseProbability: 0,
      });

      const found = engine.getPersona(persona.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe("lookup_test");
    });

    it("should return undefined for unknown persona id", () => {
      expect(engine.getPersona("nonexistent")).toBeUndefined();
    });

    it("should list all personas including built-in and custom", () => {
      const before = engine.listPersonas().length;
      engine.createPersona({
        name: "custom",
        description: "Custom",
        traits: ["novice"],
        conversationStyle: "casual",
        intentPatterns: [],
        edgeCaseProbability: 0,
      });
      expect(engine.listPersonas()).toHaveLength(before + 1);
    });
  });

  // ==========================================================================
  // Scenario Management
  // ==========================================================================

  describe("scenario management", () => {
    let persona: Persona;

    beforeEach(() => {
      persona = engine.getBuiltInPersonas()[0];
    });

    it("should create a scenario with generated id", () => {
      const scenario = engine.createScenario({
        name: "Test Scenario",
        description: "A simple scenario",
        persona,
        turns: [{ role: "user", content: "Hello" }],
        expectedOutcome: "success",
        tags: ["test"],
      });

      expect(scenario.id).toBeDefined();
      expect(scenario.name).toBe("Test Scenario");
      expect(scenario.turns).toHaveLength(1);
    });

    it("should retrieve scenario by id", () => {
      const scenario = engine.createScenario({
        name: "Lookup Test",
        description: "Test",
        persona,
        turns: [],
        expectedOutcome: "any",
        tags: [],
      });

      const found = engine.getScenario(scenario.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe("Lookup Test");
    });

    it("should return undefined for unknown scenario id", () => {
      expect(engine.getScenario("nonexistent")).toBeUndefined();
    });

    it("should list all scenarios", () => {
      engine.createScenario({
        name: "S1",
        description: "First",
        persona,
        turns: [],
        expectedOutcome: "any",
        tags: [],
      });
      engine.createScenario({
        name: "S2",
        description: "Second",
        persona,
        turns: [],
        expectedOutcome: "any",
        tags: [],
      });

      expect(engine.listScenarios()).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Scenario Execution
  // ==========================================================================

  describe("runScenario", () => {
    it("should execute a scenario and return completed session", async () => {
      const persona = engine.getBuiltInPersonas()[0];
      const scenario = engine.createScenario({
        name: "Simple Chat",
        description: "One turn chat",
        persona,
        turns: [{ role: "user", content: "What is 2+2?" }],
        expectedOutcome: "success",
        tags: ["math"],
      });

      const session = await engine.runScenario(scenario.id, mockExecutor);

      expect(session.status).toBe("completed");
      expect(session.scenarioId).toBe(scenario.id);
      expect(session.personaId).toBe(persona.id);
      expect(session.turns).toHaveLength(1);
      expect(session.turns[0].input).toBe("What is 2+2?");
      expect(session.turns[0].output).toBe("Response to: What is 2+2?");
      expect(session.totalTokens).toBe(100);
      expect(session.totalCost).toBe(0.01);
      expect(session.endTime).not.toBeNull();
    });

    it("should handle multi-turn scenarios", async () => {
      const persona = engine.getBuiltInPersonas()[0];
      const scenario = engine.createScenario({
        name: "Multi-turn",
        description: "Multi-turn chat",
        persona,
        turns: [
          { role: "user", content: "Hi" },
          { role: "system", content: "System context" },
          { role: "user", content: "Follow-up" },
        ],
        expectedOutcome: "success",
        tags: [],
      });

      const session = await engine.runScenario(scenario.id, mockExecutor);

      // Only user turns are executed
      expect(session.turns).toHaveLength(2);
      expect(session.totalTokens).toBe(200);
      expect(session.totalCost).toBeCloseTo(0.02);
    });

    it("should throw for unknown scenario", async () => {
      await expect(
        engine.runScenario("nonexistent", mockExecutor),
      ).rejects.toThrow("Scenario not found: nonexistent");
    });

    it("should evaluate contains assertion - pass", async () => {
      const persona = engine.getBuiltInPersonas()[0];
      const scenario = engine.createScenario({
        name: "Assertion test",
        description: "Test assertions",
        persona,
        turns: [
          {
            role: "user",
            content: "Hello",
            expectedAssertions: [{ type: "contains", value: "Response to" }],
          },
        ],
        expectedOutcome: "success",
        tags: [],
      });

      const session = await engine.runScenario(scenario.id, mockExecutor);
      expect(session.assertionsPassed).toBe(1);
      expect(session.assertionsFailed).toBe(0);
      expect(session.status).toBe("completed");
    });

    it("should evaluate contains assertion - fail", async () => {
      const persona = engine.getBuiltInPersonas()[0];
      const scenario = engine.createScenario({
        name: "Fail assertion",
        description: "Test failing assertion",
        persona,
        turns: [
          {
            role: "user",
            content: "Hello",
            expectedAssertions: [{ type: "contains", value: "MISSING_TEXT" }],
          },
        ],
        expectedOutcome: "failure",
        tags: [],
      });

      const session = await engine.runScenario(scenario.id, mockExecutor);
      expect(session.assertionsFailed).toBe(1);
      expect(session.status).toBe("failed");
    });

    it("should evaluate not_contains assertion", async () => {
      const persona = engine.getBuiltInPersonas()[0];
      const scenario = engine.createScenario({
        name: "Not contains",
        description: "Test not_contains",
        persona,
        turns: [
          {
            role: "user",
            content: "Hello",
            expectedAssertions: [{ type: "not_contains", value: "ERROR" }],
          },
        ],
        expectedOutcome: "success",
        tags: [],
      });

      const session = await engine.runScenario(scenario.id, mockExecutor);
      expect(session.assertionsPassed).toBe(1);
    });

    it("should evaluate max_latency assertion", async () => {
      const persona = engine.getBuiltInPersonas()[0];
      const scenario = engine.createScenario({
        name: "Latency check",
        description: "Test max_latency",
        persona,
        turns: [
          {
            role: "user",
            content: "Hello",
            expectedAssertions: [{ type: "max_latency", value: 100 }],
          },
        ],
        expectedOutcome: "success",
        tags: [],
      });

      const session = await engine.runScenario(scenario.id, mockExecutor);
      expect(session.assertionsPassed).toBe(1);
    });

    it("should fail max_latency assertion when exceeded", async () => {
      const slowExecutor = createMockExecutor({ latencyMs: 500 });
      const persona = engine.getBuiltInPersonas()[0];
      const scenario = engine.createScenario({
        name: "Slow latency",
        description: "Test slow latency",
        persona,
        turns: [
          {
            role: "user",
            content: "Hello",
            expectedAssertions: [{ type: "max_latency", value: 100 }],
          },
        ],
        expectedOutcome: "failure",
        tags: [],
      });

      const session = await engine.runScenario(scenario.id, slowExecutor);
      expect(session.assertionsFailed).toBe(1);
      expect(session.turns[0].assertionResults[0].actual).toBe(500);
    });

    it("should evaluate max_cost assertion", async () => {
      const persona = engine.getBuiltInPersonas()[0];
      const scenario = engine.createScenario({
        name: "Cost check",
        description: "Test max_cost",
        persona,
        turns: [
          {
            role: "user",
            content: "Hello",
            expectedAssertions: [{ type: "max_cost", value: 0.05 }],
          },
        ],
        expectedOutcome: "success",
        tags: [],
      });

      const session = await engine.runScenario(scenario.id, mockExecutor);
      expect(session.assertionsPassed).toBe(1);
    });

    it("should handle executor errors gracefully", async () => {
      const failingExecutor: AgentExecutor = {
        execute: async () => {
          throw new Error("LLM API error");
        },
      };

      const persona = engine.getBuiltInPersonas()[0];
      const scenario = engine.createScenario({
        name: "Error scenario",
        description: "Test error handling",
        persona,
        turns: [{ role: "user", content: "Hello" }],
        expectedOutcome: "failure",
        tags: [],
      });

      const session = await engine.runScenario(scenario.id, failingExecutor);
      expect(session.status).toBe("failed");
      expect(session.error).toBe("LLM API error");
    });

    it("should support multiple assertions per turn", async () => {
      const persona = engine.getBuiltInPersonas()[0];
      const scenario = engine.createScenario({
        name: "Multi-assert",
        description: "Multiple assertions",
        persona,
        turns: [
          {
            role: "user",
            content: "Hello",
            expectedAssertions: [
              { type: "contains", value: "Response" },
              { type: "max_latency", value: 200 },
              { type: "max_cost", value: 1.0 },
            ],
          },
        ],
        expectedOutcome: "success",
        tags: [],
      });

      const session = await engine.runScenario(scenario.id, mockExecutor);
      expect(session.assertionsPassed).toBe(3);
      expect(session.assertionsFailed).toBe(0);
      expect(session.turns[0].assertionResults).toHaveLength(3);
    });
  });

  // ==========================================================================
  // Load Testing
  // ==========================================================================

  describe("runLoadTest", () => {
    let scenario: SyntheticScenario;

    beforeEach(() => {
      const persona = engine.getBuiltInPersonas()[0];
      scenario = engine.createScenario({
        name: "Load Scenario",
        description: "For load testing",
        persona,
        turns: [{ role: "user", content: "Ping" }],
        expectedOutcome: "success",
        tags: ["load"],
      });
    });

    it("should run load test with concurrency=2, totalSessions=4", async () => {
      const config: LoadTestConfig = {
        scenarios: [scenario],
        concurrency: 2,
        totalSessions: 4,
        timeout: 5000,
      };

      const result = await engine.runLoadTest(config, mockExecutor);

      expect(result.id).toBeDefined();
      expect(result.sessions).toHaveLength(4);
      expect(result.successRate).toBe(1);
      expect(result.avgLatencyMs).toBe(50);
      expect(result.totalTokens).toBe(400);
      expect(result.totalCost).toBeCloseTo(0.04);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.throughput).toBeGreaterThanOrEqual(0);
      if (result.totalDurationMs > 0) {
        expect(result.throughput).toBeGreaterThan(0);
      }
      expect(result.errors).toHaveLength(0);
    });

    it("should calculate percentiles correctly", async () => {
      const config: LoadTestConfig = {
        scenarios: [scenario],
        concurrency: 2,
        totalSessions: 4,
        timeout: 5000,
      };

      const result = await engine.runLoadTest(config, mockExecutor);

      expect(result.p95LatencyMs).toBe(50);
      expect(result.p99LatencyMs).toBe(50);
    });

    it("should report errors from failing executors in load test", async () => {
      const failingExecutor: AgentExecutor = {
        execute: async () => {
          throw new Error("Boom");
        },
      };

      const config: LoadTestConfig = {
        scenarios: [scenario],
        concurrency: 2,
        totalSessions: 4,
        timeout: 5000,
      };

      const result = await engine.runLoadTest(config, failingExecutor);

      expect(result.successRate).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toBe("Boom");
      expect(result.errors[0].count).toBe(4);
    });

    it("should handle multiple scenarios in round-robin", async () => {
      const persona = engine.getBuiltInPersonas()[0];
      const scenario2 = engine.createScenario({
        name: "Second Scenario",
        description: "Another scenario",
        persona,
        turns: [{ role: "user", content: "Pong" }],
        expectedOutcome: "success",
        tags: [],
      });

      const config: LoadTestConfig = {
        scenarios: [scenario, scenario2],
        concurrency: 2,
        totalSessions: 4,
        timeout: 5000,
      };

      const result = await engine.runLoadTest(config, mockExecutor);

      expect(result.sessions).toHaveLength(4);
      // Sessions alternate between scenarios
      const scenarioIds = result.sessions.map((s) => s.scenarioId);
      expect(scenarioIds.filter((id) => id === scenario.id)).toHaveLength(2);
      expect(scenarioIds.filter((id) => id === scenario2.id)).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Generate Scenario from Trace
  // ==========================================================================

  describe("generateScenarioFromTrace", () => {
    it("should create a scenario from prompt events", () => {
      const events = [
        {
          type: "prompt" as const,
          eventId: "e1",
          timestamp: 1000,
          sessionId: "s1",
          role: "user" as const,
          content: "What is AI?",
        },
        {
          type: "response" as const,
          eventId: "e2",
          timestamp: 1100,
          sessionId: "s1",
          content: "AI is...",
          model: "gpt-4",
          durationMs: 100,
        },
        {
          type: "prompt" as const,
          eventId: "e3",
          timestamp: 1200,
          sessionId: "s1",
          role: "user" as const,
          content: "Tell me more",
        },
      ];

      const scenario = engine.generateScenarioFromTrace(events);

      expect(scenario.id).toBeDefined();
      expect(scenario.tags).toContain("generated");
      expect(scenario.tags).toContain("from-trace");
      expect(scenario.turns).toHaveLength(2);
      expect(scenario.turns[0].content).toBe("What is AI?");
      expect(scenario.turns[0].role).toBe("user");
      expect(scenario.turns[1].content).toBe("Tell me more");
      expect(scenario.expectedOutcome).toBe("any");
    });

    it("should use provided persona", () => {
      const customPersona = engine.createPersona({
        name: "trace_persona",
        description: "For trace tests",
        traits: ["expert"],
        conversationStyle: "technical",
        intentPatterns: [],
        edgeCaseProbability: 0,
      });

      const events = [
        {
          type: "prompt" as const,
          eventId: "e1",
          timestamp: 1000,
          sessionId: "s1",
          role: "user" as const,
          content: "Hello",
        },
      ];

      const scenario = engine.generateScenarioFromTrace(events, customPersona);
      expect(scenario.persona.id).toBe(customPersona.id);
    });

    it("should handle system role prompts", () => {
      const events = [
        {
          type: "prompt" as const,
          eventId: "e1",
          timestamp: 1000,
          sessionId: "s1",
          role: "system" as const,
          content: "You are a helpful assistant",
        },
        {
          type: "prompt" as const,
          eventId: "e2",
          timestamp: 1100,
          sessionId: "s1",
          role: "user" as const,
          content: "Hi",
        },
      ];

      const scenario = engine.generateScenarioFromTrace(events);
      expect(scenario.turns).toHaveLength(2);
      expect(scenario.turns[0].role).toBe("system");
      expect(scenario.turns[1].role).toBe("user");
    });

    it("should handle non-string content in prompts", () => {
      const events = [
        {
          type: "prompt" as const,
          eventId: "e1",
          timestamp: 1000,
          sessionId: "s1",
          role: "user" as const,
          content: [{ type: "text", text: "Hello" }],
        },
      ];

      const scenario = engine.generateScenarioFromTrace(events);
      expect(scenario.turns).toHaveLength(1);
      expect(scenario.turns[0].content).toBe(
        JSON.stringify([{ type: "text", text: "Hello" }]),
      );
    });
  });

  // ==========================================================================
  // Metrics & Reset
  // ==========================================================================

  describe("metrics", () => {
    it("should return initial metrics", () => {
      const metrics = engine.getMetrics();
      expect(metrics.totalScenariosRun).toBe(0);
      expect(metrics.totalSessionsGenerated).toBe(0);
      expect(metrics.avgSuccessRate).toBe(0);
      expect(metrics.totalLoadTests).toBe(0);
    });

    it("should track metrics after running scenarios", async () => {
      const persona = engine.getBuiltInPersonas()[0];
      const scenario = engine.createScenario({
        name: "Metrics test",
        description: "Test",
        persona,
        turns: [{ role: "user", content: "Hi" }],
        expectedOutcome: "success",
        tags: [],
      });

      await engine.runScenario(scenario.id, mockExecutor);
      await engine.runScenario(scenario.id, mockExecutor);

      const metrics = engine.getMetrics();
      expect(metrics.totalScenariosRun).toBe(2);
      expect(metrics.totalSessionsGenerated).toBe(2);
      expect(metrics.avgSuccessRate).toBe(1);
    });
  });

  describe("reset", () => {
    it("should clear all state and re-register built-in personas", async () => {
      const persona = engine.getBuiltInPersonas()[0];
      engine.createPersona({
        name: "custom",
        description: "Custom",
        traits: ["novice"],
        conversationStyle: "casual",
        intentPatterns: [],
        edgeCaseProbability: 0,
      });
      engine.createScenario({
        name: "S1",
        description: "Test",
        persona,
        turns: [{ role: "user", content: "Hi" }],
        expectedOutcome: "any",
        tags: [],
      });

      engine.reset();

      expect(engine.listPersonas()).toHaveLength(5); // only built-in
      expect(engine.listScenarios()).toHaveLength(0);
      const metrics = engine.getMetrics();
      expect(metrics.totalScenariosRun).toBe(0);
      expect(metrics.totalSessionsGenerated).toBe(0);
      expect(metrics.totalLoadTests).toBe(0);
    });
  });
});
