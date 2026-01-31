/**
 * Tests for Multi-Agent Orchestration Tracing (Feature 7)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MultiAgentTracer } from "../src/multiagent/tracer.js";
import type { MultiAgentConfig } from "../src/multiagent/tracer.js";

describe("MultiAgentTracer", () => {
  let tracer: MultiAgentTracer;
  let defaultConfig: MultiAgentConfig;

  beforeEach(() => {
    defaultConfig = {
      enabled: true,
      maxAgentsPerSession: 10,
      trackSharedContext: true,
      detectConflicts: true,
    };
    tracer = new MultiAgentTracer(defaultConfig);
  });

  describe("Session Management", () => {
    it("should start a session", () => {
      const session = tracer.startSession("sequential");

      expect(session.id).toBeDefined();
      expect(session.orchestrationType).toBe("sequential");
      expect(session.status).toBe("active");
    });

    it("should end a session", () => {
      tracer.startSession();
      const ended = tracer.endSession();

      expect(ended?.status).toBe("completed");
      expect(ended?.endTime).toBeDefined();
    });

    it("should list sessions", () => {
      tracer.startSession("sequential");
      tracer.endSession();
      tracer.startSession("parallel");

      const sessions = tracer.listSessions();
      expect(sessions.length).toBe(2);
    });
  });

  describe("Agent Management", () => {
    it("should register an agent", () => {
      tracer.startSession();

      const agent = tracer.registerAgent({
        name: "Researcher",
        type: "specialist",
        role: "Research specialist",
        capabilities: ["search", "summarize"],
      });

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe("Researcher");
    });

    it("should list agents", () => {
      tracer.startSession();
      tracer.registerAgent({
        name: "Agent 1",
        type: "worker",
        role: "Worker",
        capabilities: [],
      });
      tracer.registerAgent({
        name: "Agent 2",
        type: "worker",
        role: "Worker",
        capabilities: [],
      });

      const agents = tracer.listAgents();
      expect(agents.length).toBe(2);
    });

    it("should remove an agent", () => {
      tracer.startSession();
      const agent = tracer.registerAgent({
        name: "Temp Agent",
        type: "worker",
        role: "Temporary",
        capabilities: [],
      });

      const removed = tracer.removeAgent(agent.id);
      expect(removed).toBe(true);
      expect(tracer.getAgent(agent.id)).toBeUndefined();
    });

    it("should enforce max agents limit", () => {
      const limitedTracer = new MultiAgentTracer({
        ...defaultConfig,
        maxAgentsPerSession: 2,
      });

      limitedTracer.startSession();
      limitedTracer.registerAgent({
        name: "Agent 1",
        type: "worker",
        role: "W",
        capabilities: [],
      });
      limitedTracer.registerAgent({
        name: "Agent 2",
        type: "worker",
        role: "W",
        capabilities: [],
      });

      expect(() =>
        limitedTracer.registerAgent({
          name: "Agent 3",
          type: "worker",
          role: "W",
          capabilities: [],
        }),
      ).toThrow("Maximum agents reached");
    });
  });

  describe("Handoffs", () => {
    it("should record a handoff", () => {
      tracer.startSession();
      const agent1 = tracer.registerAgent({
        name: "Agent 1",
        type: "primary",
        role: "P",
        capabilities: [],
      });
      const agent2 = tracer.registerAgent({
        name: "Agent 2",
        type: "specialist",
        role: "S",
        capabilities: [],
      });

      const handoff = tracer.recordHandoff({
        fromAgentId: agent1.id,
        toAgentId: agent2.id,
        reason: "Specialist needed",
        context: { task: "analyze data" },
      });

      expect(handoff.id).toBeDefined();
      expect(handoff.success).toBe(true);
    });

    it("should update metrics on handoff", () => {
      tracer.startSession();
      const agent1 = tracer.registerAgent({
        name: "Agent 1",
        type: "primary",
        role: "P",
        capabilities: [],
      });
      const agent2 = tracer.registerAgent({
        name: "Agent 2",
        type: "specialist",
        role: "S",
        capabilities: [],
      });

      tracer.recordHandoff({
        fromAgentId: agent1.id,
        toAgentId: agent2.id,
        reason: "Test",
      });

      const metrics = tracer.getMetrics();
      expect(metrics?.totalHandoffs).toBe(1);
      expect(metrics?.successfulHandoffs).toBe(1);
    });
  });

  describe("Shared Context", () => {
    it("should update shared context", () => {
      tracer.startSession();
      const agent = tracer.registerAgent({
        name: "Agent",
        type: "worker",
        role: "W",
        capabilities: [],
      });

      tracer.updateContext(agent.id, "task", "analyze");

      expect(tracer.getContext("task")).toBe("analyze");
    });

    it("should track context history", () => {
      tracer.startSession();
      const agent = tracer.registerAgent({
        name: "Agent",
        type: "worker",
        role: "W",
        capabilities: [],
      });

      tracer.updateContext(agent.id, "count", 1);
      tracer.updateContext(agent.id, "count", 2);

      const session = tracer.getCurrentSession();
      expect(session?.sharedContext.history.length).toBe(2);
      expect(session?.sharedContext.version).toBe(2);
    });

    it("should get all context", () => {
      tracer.startSession();
      const agent = tracer.registerAgent({
        name: "Agent",
        type: "worker",
        role: "W",
        capabilities: [],
      });

      tracer.updateContext(agent.id, "key1", "value1");
      tracer.updateContext(agent.id, "key2", "value2");

      const ctx = tracer.getAllContext();
      expect(ctx.size).toBe(2);
    });
  });

  describe("Communication", () => {
    it("should record messages", () => {
      tracer.startSession();
      const agent1 = tracer.registerAgent({
        name: "Agent 1",
        type: "worker",
        role: "W",
        capabilities: [],
      });
      const agent2 = tracer.registerAgent({
        name: "Agent 2",
        type: "worker",
        role: "W",
        capabilities: [],
      });

      const message = tracer.recordMessage({
        fromAgentId: agent1.id,
        toAgentId: agent2.id,
        messageType: "request",
        content: { task: "help" },
      });

      expect(message.id).toBeDefined();
      expect(message.messageType).toBe("request");
    });
  });

  describe("Conflicts", () => {
    it("should record a conflict", () => {
      tracer.startSession();
      const agent1 = tracer.registerAgent({
        name: "Agent 1",
        type: "worker",
        role: "W",
        capabilities: [],
      });
      const agent2 = tracer.registerAgent({
        name: "Agent 2",
        type: "worker",
        role: "W",
        capabilities: [],
      });

      const conflict = tracer.recordConflict({
        type: "resource_contention",
        agentIds: [agent1.id, agent2.id],
        description: "Both agents want same resource",
        severity: "medium",
      });

      expect(conflict.id).toBeDefined();
      expect(conflict.type).toBe("resource_contention");
    });

    it("should resolve a conflict", () => {
      tracer.startSession();
      const agent1 = tracer.registerAgent({
        name: "Agent 1",
        type: "worker",
        role: "W",
        capabilities: [],
      });
      const agent2 = tracer.registerAgent({
        name: "Agent 2",
        type: "worker",
        role: "W",
        capabilities: [],
      });

      const conflict = tracer.recordConflict({
        type: "decision_conflict",
        agentIds: [agent1.id, agent2.id],
        description: "Disagreement on approach",
      });

      const resolved = tracer.resolveConflict(conflict.id, {
        resolvedBy: agent1.id,
        strategy: "voting",
        outcome: "Agent 1 approach selected",
      });

      expect(resolved).toBe(true);

      const metrics = tracer.getMetrics();
      expect(metrics?.resolvedConflicts).toBe(1);
    });
  });

  describe("Visualization", () => {
    it("should generate interaction graph", () => {
      tracer.startSession();
      const agent1 = tracer.registerAgent({
        name: "Agent 1",
        type: "primary",
        role: "P",
        capabilities: [],
      });
      const agent2 = tracer.registerAgent({
        name: "Agent 2",
        type: "specialist",
        role: "S",
        capabilities: [],
      });

      tracer.recordMessage({
        fromAgentId: agent1.id,
        toAgentId: agent2.id,
        messageType: "request",
        content: {},
      });

      const graph = tracer.getInteractionGraph();
      expect(graph.nodes.length).toBe(2);
      expect(graph.edges.length).toBeGreaterThanOrEqual(1);
    });

    it("should generate timeline", () => {
      tracer.startSession();
      const agent = tracer.registerAgent({
        name: "Agent",
        type: "worker",
        role: "W",
        capabilities: [],
      });
      tracer.updateContext(agent.id, "test", "value");

      const timeline = tracer.getTimeline();
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline[0].agentName).toBe("Agent");
    });
  });

  describe("Callbacks", () => {
    it("should call onAgentRegistered", () => {
      const registeredAgents: string[] = [];
      const callbackTracer = new MultiAgentTracer({
        ...defaultConfig,
        onAgentRegistered: (agent) => registeredAgents.push(agent.name),
      });

      callbackTracer.startSession();
      callbackTracer.registerAgent({
        name: "Callback Agent",
        type: "worker",
        role: "W",
        capabilities: [],
      });

      expect(registeredAgents).toContain("Callback Agent");
    });

    it("should call onHandoff", () => {
      const handoffs: string[] = [];
      const callbackTracer = new MultiAgentTracer({
        ...defaultConfig,
        onHandoff: (h) => handoffs.push(h.reason),
      });

      callbackTracer.startSession();
      const a1 = callbackTracer.registerAgent({
        name: "A1",
        type: "worker",
        role: "W",
        capabilities: [],
      });
      const a2 = callbackTracer.registerAgent({
        name: "A2",
        type: "worker",
        role: "W",
        capabilities: [],
      });
      callbackTracer.recordHandoff({
        fromAgentId: a1.id,
        toAgentId: a2.id,
        reason: "Test handoff",
      });

      expect(handoffs).toContain("Test handoff");
    });
  });
});
