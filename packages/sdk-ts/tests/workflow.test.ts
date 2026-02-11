import { describe, it, expect, beforeEach } from "vitest";
import { WorkflowEngine } from "../src/workflow/index.js";
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
} from "../src/workflow/index.js";
import type { AgentEvent } from "../src/types.js";

describe("WorkflowEngine", () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine({ enabled: true, debug: false });
  });

  // Helper to create a minimal valid workflow
  function createMinimalWorkflow(): Workflow {
    return engine.createWorkflow({
      name: "Test Workflow",
      description: "A test workflow",
      version: "1.0.0",
      nodes: [],
      edges: [],
      tags: ["test"],
    });
  }

  function buildValidWorkflow(): Workflow {
    const wf = createMinimalWorkflow();
    const start = engine.addNode(wf.id, {
      type: "start",
      name: "Start",
      description: "Start node",
      config: {},
      position: { x: 0, y: 0 },
      metadata: {},
    });
    const llm = engine.addNode(wf.id, {
      type: "llm_call",
      name: "LLM Call",
      description: "Call LLM",
      config: {},
      position: { x: 200, y: 0 },
      metadata: {},
    });
    const end = engine.addNode(wf.id, {
      type: "end",
      name: "End",
      description: "End node",
      config: {},
      position: { x: 400, y: 0 },
      metadata: {},
    });
    engine.addEdge(wf.id, { sourceId: start.id, targetId: llm.id });
    engine.addEdge(wf.id, { sourceId: llm.id, targetId: end.id });
    return engine.getWorkflow(wf.id)!;
  }

  // ==========================================================================
  // Workflow CRUD
  // ==========================================================================

  describe("Workflow CRUD", () => {
    it("should create a workflow with generated id and timestamps", () => {
      const wf = createMinimalWorkflow();
      expect(wf.id).toBeDefined();
      expect(wf.name).toBe("Test Workflow");
      expect(wf.createdAt).toBeGreaterThan(0);
      expect(wf.updatedAt).toBeGreaterThan(0);
    });

    it("should get a workflow by id", () => {
      const wf = createMinimalWorkflow();
      const found = engine.getWorkflow(wf.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe("Test Workflow");
    });

    it("should return undefined for unknown workflow id", () => {
      expect(engine.getWorkflow("nonexistent")).toBeUndefined();
    });

    it("should update a workflow", () => {
      const wf = createMinimalWorkflow();
      const updated = engine.updateWorkflow(wf.id, {
        name: "Updated Workflow",
        tags: ["updated"],
      });
      expect(updated.name).toBe("Updated Workflow");
      expect(updated.tags).toEqual(["updated"]);
      expect(updated.updatedAt).toBeGreaterThanOrEqual(wf.updatedAt);
    });

    it("should throw when updating a non-existent workflow", () => {
      expect(() => engine.updateWorkflow("nope", { name: "X" })).toThrow(
        "Workflow not found",
      );
    });

    it("should delete a workflow", () => {
      const wf = createMinimalWorkflow();
      expect(engine.deleteWorkflow(wf.id)).toBe(true);
      expect(engine.getWorkflow(wf.id)).toBeUndefined();
    });

    it("should return false when deleting non-existent workflow", () => {
      expect(engine.deleteWorkflow("nope")).toBe(false);
    });

    it("should list all workflows", () => {
      createMinimalWorkflow();
      createMinimalWorkflow();
      expect(engine.listWorkflows()).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Node add/remove
  // ==========================================================================

  describe("Node management", () => {
    it("should add a node to a workflow", () => {
      const wf = createMinimalWorkflow();
      const node = engine.addNode(wf.id, {
        type: "llm_call",
        name: "My Node",
        description: "desc",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      expect(node.id).toBeDefined();
      expect(engine.getWorkflow(wf.id)!.nodes).toHaveLength(1);
    });

    it("should throw when adding node to non-existent workflow", () => {
      expect(() =>
        engine.addNode("nope", {
          type: "start",
          name: "S",
          description: "",
          config: {},
          position: { x: 0, y: 0 },
          metadata: {},
        }),
      ).toThrow("Workflow not found");
    });

    it("should remove a node and its connected edges", () => {
      const wf = createMinimalWorkflow();
      const n1 = engine.addNode(wf.id, {
        type: "start",
        name: "A",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      const n2 = engine.addNode(wf.id, {
        type: "end",
        name: "B",
        description: "",
        config: {},
        position: { x: 200, y: 0 },
        metadata: {},
      });
      engine.addEdge(wf.id, { sourceId: n1.id, targetId: n2.id });
      expect(engine.getWorkflow(wf.id)!.edges).toHaveLength(1);

      engine.removeNode(wf.id, n1.id);
      const updated = engine.getWorkflow(wf.id)!;
      expect(updated.nodes).toHaveLength(1);
      expect(updated.edges).toHaveLength(0);
    });

    it("should return false when removing non-existent node", () => {
      const wf = createMinimalWorkflow();
      expect(engine.removeNode(wf.id, "nope")).toBe(false);
    });

    it("should enforce maxNodes limit", () => {
      const eng = new WorkflowEngine({ maxNodes: 2 });
      const wf = eng.createWorkflow({
        name: "small",
        description: "",
        version: "1.0",
        nodes: [],
        edges: [],
        tags: [],
      });
      eng.addNode(wf.id, {
        type: "start",
        name: "A",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      eng.addNode(wf.id, {
        type: "end",
        name: "B",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      expect(() =>
        eng.addNode(wf.id, {
          type: "llm_call",
          name: "C",
          description: "",
          config: {},
          position: { x: 0, y: 0 },
          metadata: {},
        }),
      ).toThrow("Maximum nodes");
    });
  });

  // ==========================================================================
  // Edge add/remove
  // ==========================================================================

  describe("Edge management", () => {
    it("should add an edge to a workflow", () => {
      const wf = createMinimalWorkflow();
      const n1 = engine.addNode(wf.id, {
        type: "start",
        name: "A",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      const n2 = engine.addNode(wf.id, {
        type: "end",
        name: "B",
        description: "",
        config: {},
        position: { x: 200, y: 0 },
        metadata: {},
      });
      const edge = engine.addEdge(wf.id, {
        sourceId: n1.id,
        targetId: n2.id,
      });
      expect(edge.id).toBeDefined();
      expect(engine.getWorkflow(wf.id)!.edges).toHaveLength(1);
    });

    it("should remove an edge", () => {
      const wf = createMinimalWorkflow();
      const n1 = engine.addNode(wf.id, {
        type: "start",
        name: "A",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      const n2 = engine.addNode(wf.id, {
        type: "end",
        name: "B",
        description: "",
        config: {},
        position: { x: 200, y: 0 },
        metadata: {},
      });
      const edge = engine.addEdge(wf.id, {
        sourceId: n1.id,
        targetId: n2.id,
      });
      expect(engine.removeEdge(wf.id, edge.id)).toBe(true);
      expect(engine.getWorkflow(wf.id)!.edges).toHaveLength(0);
    });

    it("should return false when removing non-existent edge", () => {
      const wf = createMinimalWorkflow();
      expect(engine.removeEdge(wf.id, "nope")).toBe(false);
    });

    it("should enforce maxEdges limit", () => {
      const eng = new WorkflowEngine({ maxEdges: 1 });
      const wf = eng.createWorkflow({
        name: "small",
        description: "",
        version: "1.0",
        nodes: [],
        edges: [],
        tags: [],
      });
      const n1 = eng.addNode(wf.id, {
        type: "start",
        name: "A",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      const n2 = eng.addNode(wf.id, {
        type: "end",
        name: "B",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      const n3 = eng.addNode(wf.id, {
        type: "llm_call",
        name: "C",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      eng.addEdge(wf.id, { sourceId: n1.id, targetId: n2.id });
      expect(() =>
        eng.addEdge(wf.id, { sourceId: n2.id, targetId: n3.id }),
      ).toThrow("Maximum edges");
    });
  });

  // ==========================================================================
  // Validation
  // ==========================================================================

  describe("Validation", () => {
    it("should validate a valid workflow", () => {
      buildValidWorkflow();
      const wf = engine.listWorkflows()[0];
      const result = engine.validateWorkflow(wf.id);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing start node", () => {
      const wf = createMinimalWorkflow();
      engine.addNode(wf.id, {
        type: "end",
        name: "End",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      const result = engine.validateWorkflow(wf.id);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes("start node"))).toBe(
        true,
      );
    });

    it("should detect missing end node", () => {
      const wf = createMinimalWorkflow();
      engine.addNode(wf.id, {
        type: "start",
        name: "Start",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      const result = engine.validateWorkflow(wf.id);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes("end node"))).toBe(
        true,
      );
    });

    it("should detect orphaned nodes", () => {
      const wf = createMinimalWorkflow();
      engine.addNode(wf.id, {
        type: "start",
        name: "Start",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      engine.addNode(wf.id, {
        type: "end",
        name: "End",
        description: "",
        config: {},
        position: { x: 200, y: 0 },
        metadata: {},
      });
      // LLM node without any edges is orphaned
      engine.addNode(wf.id, {
        type: "llm_call",
        name: "Orphan",
        description: "",
        config: {},
        position: { x: 400, y: 0 },
        metadata: {},
      });
      const result = engine.validateWorkflow(wf.id);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes("Orphaned"))).toBe(
        true,
      );
    });

    it("should detect cycles", () => {
      const wf = createMinimalWorkflow();
      const start = engine.addNode(wf.id, {
        type: "start",
        name: "Start",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      const a = engine.addNode(wf.id, {
        type: "llm_call",
        name: "A",
        description: "",
        config: {},
        position: { x: 200, y: 0 },
        metadata: {},
      });
      const b = engine.addNode(wf.id, {
        type: "llm_call",
        name: "B",
        description: "",
        config: {},
        position: { x: 400, y: 0 },
        metadata: {},
      });
      const end = engine.addNode(wf.id, {
        type: "end",
        name: "End",
        description: "",
        config: {},
        position: { x: 600, y: 0 },
        metadata: {},
      });
      engine.addEdge(wf.id, { sourceId: start.id, targetId: a.id });
      engine.addEdge(wf.id, { sourceId: a.id, targetId: b.id });
      engine.addEdge(wf.id, { sourceId: b.id, targetId: a.id }); // cycle
      engine.addEdge(wf.id, { sourceId: b.id, targetId: end.id });

      const result = engine.validateWorkflow(wf.id);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes("cycle"))).toBe(true);
    });

    it("should detect condition nodes with fewer than 2 outgoing edges", () => {
      const wf = createMinimalWorkflow();
      const start = engine.addNode(wf.id, {
        type: "start",
        name: "Start",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      const cond = engine.addNode(wf.id, {
        type: "condition",
        name: "Check",
        description: "",
        config: {},
        position: { x: 200, y: 0 },
        metadata: {},
      });
      const end = engine.addNode(wf.id, {
        type: "end",
        name: "End",
        description: "",
        config: {},
        position: { x: 400, y: 0 },
        metadata: {},
      });
      engine.addEdge(wf.id, { sourceId: start.id, targetId: cond.id });
      // Only one outgoing edge from condition
      engine.addEdge(wf.id, { sourceId: cond.id, targetId: end.id });

      const result = engine.validateWorkflow(wf.id);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.message.includes("at least 2 outgoing edges"),
        ),
      ).toBe(true);
    });

    it("should throw when validating non-existent workflow", () => {
      expect(() => engine.validateWorkflow("nope")).toThrow(
        "Workflow not found",
      );
    });
  });

  // ==========================================================================
  // Execution
  // ==========================================================================

  describe("Execution", () => {
    it("should execute a workflow with a mock executor", async () => {
      const wf = buildValidWorkflow();
      const executor = async (
        node: WorkflowNode,
        context: Record<string, unknown>,
      ) => {
        return `executed: ${node.name}`;
      };

      const result = await engine.executeWorkflow(wf.id, {}, executor);
      expect(result.status).toBe("completed");
      expect(result.executedNodes.length).toBeGreaterThanOrEqual(3);
      expect(result.endTime).not.toBeNull();
    });

    it("should handle execution failure", async () => {
      const wf = buildValidWorkflow();
      const executor = async (node: WorkflowNode) => {
        if (node.type === "llm_call") {
          throw new Error("LLM failure");
        }
        return null;
      };

      const result = await engine.executeWorkflow(wf.id, {}, executor);
      expect(result.status).toBe("failed");
      expect(result.error).toContain("LLM failure");
    });

    it("should pass and use initial context", async () => {
      const wf = buildValidWorkflow();
      const results: Record<string, unknown>[] = [];
      const executor = async (
        node: WorkflowNode,
        context: Record<string, unknown>,
      ) => {
        results.push({ ...context });
        return null;
      };

      await engine.executeWorkflow(wf.id, { key: "value" }, executor);
      expect(results[0]).toEqual({ key: "value" });
    });

    it("should throw when executing non-existent workflow", async () => {
      await expect(engine.executeWorkflow("nope")).rejects.toThrow(
        "Workflow not found",
      );
    });

    it("should handle workflow with no start node gracefully", async () => {
      const wf = createMinimalWorkflow();
      engine.addNode(wf.id, {
        type: "end",
        name: "End",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      const result = await engine.executeWorkflow(wf.id);
      expect(result.status).toBe("failed");
      expect(result.error).toContain("no start node");
    });

    it("should execute condition node and follow correct branch", async () => {
      const wf = createMinimalWorkflow();
      const start = engine.addNode(wf.id, {
        type: "start",
        name: "Start",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      const cond = engine.addNode(wf.id, {
        type: "condition",
        name: "Check",
        description: "",
        config: {},
        position: { x: 200, y: 0 },
        metadata: {},
      });
      const endA = engine.addNode(wf.id, {
        type: "end",
        name: "End A",
        description: "",
        config: {},
        position: { x: 400, y: -100 },
        metadata: {},
      });
      const endB = engine.addNode(wf.id, {
        type: "end",
        name: "End B",
        description: "",
        config: {},
        position: { x: 400, y: 100 },
        metadata: {},
      });
      engine.addEdge(wf.id, { sourceId: start.id, targetId: cond.id });
      engine.addEdge(wf.id, {
        sourceId: cond.id,
        targetId: endA.id,
        condition: "branchA",
      });
      engine.addEdge(wf.id, {
        sourceId: cond.id,
        targetId: endB.id,
        condition: "branchB",
      });

      const result = await engine.executeWorkflow(wf.id, { branchA: true });
      expect(result.status).toBe("completed");
      // Should have executed start, condition, and endA
      const executedIds = result.executedNodes.map((n) => n.nodeId);
      expect(executedIds).toContain(start.id);
      expect(executedIds).toContain(cond.id);
      expect(executedIds).toContain(endA.id);
      expect(executedIds).not.toContain(endB.id);
    });
  });

  // ==========================================================================
  // Import from Trace
  // ==========================================================================

  describe("Import from trace events", () => {
    it("should import events into a workflow", () => {
      const events: AgentEvent[] = [
        {
          eventId: "e1",
          sessionId: "s1",
          type: "session_start",
          timestamp: 1000,
        },
        {
          eventId: "e2",
          sessionId: "s1",
          type: "prompt",
          timestamp: 2000,
          role: "user",
          content: "Hello",
        },
        {
          eventId: "e3",
          sessionId: "s1",
          type: "tool_call",
          timestamp: 3000,
          toolName: "search",
          toolInput: { q: "test" },
        },
        {
          eventId: "e4",
          sessionId: "s1",
          type: "session_end",
          timestamp: 4000,
          status: "completed",
        },
      ];

      const wf = engine.importFromTrace(events, "Traced Workflow");
      expect(wf.name).toBe("Traced Workflow");
      expect(wf.nodes).toHaveLength(4);
      expect(wf.edges).toHaveLength(3);
      expect(wf.nodes[0].type).toBe("start");
      expect(wf.nodes[1].type).toBe("llm_call");
      expect(wf.nodes[2].type).toBe("tool_call");
      expect(wf.nodes[3].type).toBe("end");
      expect(wf.tags).toContain("imported");
    });

    it("should import error events as end nodes", () => {
      const events: AgentEvent[] = [
        {
          eventId: "e1",
          sessionId: "s1",
          type: "session_start",
          timestamp: 1000,
        },
        {
          eventId: "e2",
          sessionId: "s1",
          type: "error",
          timestamp: 2000,
          errorType: "RuntimeError",
          errorMessage: "fail",
        },
      ];

      const wf = engine.importFromTrace(events);
      expect(wf.nodes[1].type).toBe("end");
      expect(wf.nodes[1].name).toContain("Error");
    });

    it("should use default name when none provided", () => {
      const events: AgentEvent[] = [
        {
          eventId: "e1",
          sessionId: "s1",
          type: "session_start",
          timestamp: 1000,
        },
      ];
      const wf = engine.importFromTrace(events);
      expect(wf.name).toBe("Imported Workflow");
    });
  });

  // ==========================================================================
  // Export to Code
  // ==========================================================================

  describe("Export to TypeScript code", () => {
    it("should generate TypeScript code", () => {
      const wf = buildValidWorkflow();
      const code = engine.exportToCode(wf.id, "typescript");
      expect(code).toContain("import { WorkflowEngine }");
      expect(code).toContain("engine.createWorkflow");
      expect(code).toContain("engine.addNode");
      expect(code).toContain("engine.addEdge");
      expect(code).toContain(wf.name);
    });

    it("should throw when exporting non-existent workflow", () => {
      expect(() => engine.exportToCode("nope", "typescript")).toThrow(
        "Workflow not found",
      );
    });
  });

  describe("Export to Python code", () => {
    it("should generate Python code", () => {
      const wf = buildValidWorkflow();
      const code = engine.exportToCode(wf.id, "python");
      expect(code).toContain("from agentops import WorkflowEngine");
      expect(code).toContain("engine.create_workflow");
      expect(code).toContain("engine.add_node");
      expect(code).toContain("engine.add_edge");
      expect(code).toContain(wf.name);
    });
  });

  // ==========================================================================
  // Templates
  // ==========================================================================

  describe("Templates", () => {
    it("should save a workflow as template", () => {
      const wf = buildValidWorkflow();
      const template = engine.saveAsTemplate(wf.id, "general");
      expect(template.id).toBeDefined();
      expect(template.category).toBe("general");
      expect(template.name).toBe(wf.name);
      expect(template.usageCount).toBe(0);
    });

    it("should list templates", () => {
      const wf = buildValidWorkflow();
      engine.saveAsTemplate(wf.id, "general");
      expect(engine.listTemplates()).toHaveLength(1);
    });

    it("should create workflow from template", () => {
      const wf = buildValidWorkflow();
      const template = engine.saveAsTemplate(wf.id, "general");
      const newWf = engine.createFromTemplate(template.id, "From Template");
      expect(newWf.name).toBe("From Template");
      expect(newWf.id).not.toBe(wf.id);
      // Template usage count incremented
      expect(engine.listTemplates()[0].usageCount).toBe(1);
    });

    it("should use default name when creating from template without name", () => {
      const wf = buildValidWorkflow();
      const template = engine.saveAsTemplate(wf.id, "general");
      const newWf = engine.createFromTemplate(template.id);
      expect(newWf.name).toContain("(copy)");
    });

    it("should throw when saving non-existent workflow as template", () => {
      expect(() => engine.saveAsTemplate("nope", "cat")).toThrow(
        "Workflow not found",
      );
    });

    it("should throw when creating from non-existent template", () => {
      expect(() => engine.createFromTemplate("nope")).toThrow(
        "Template not found",
      );
    });
  });

  // ==========================================================================
  // Metrics
  // ==========================================================================

  describe("Metrics", () => {
    it("should return correct metrics after executions", async () => {
      const wf = buildValidWorkflow();

      await engine.executeWorkflow(wf.id);
      await engine.executeWorkflow(wf.id);

      const metrics = engine.getMetrics();
      // buildValidWorkflow creates the workflow inside the engine
      expect(metrics.totalWorkflows).toBeGreaterThanOrEqual(1);
      expect(metrics.totalExecutions).toBe(2);
      expect(metrics.successRate).toBe(1);
      expect(metrics.avgExecutionDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("should calculate success rate with failures", async () => {
      const wf = buildValidWorkflow();

      // One success
      await engine.executeWorkflow(wf.id);

      // One failure (workflow with no start node)
      const bad = createMinimalWorkflow();
      engine.addNode(bad.id, {
        type: "end",
        name: "End",
        description: "",
        config: {},
        position: { x: 0, y: 0 },
        metadata: {},
      });
      await engine.executeWorkflow(bad.id);

      const metrics = engine.getMetrics();
      expect(metrics.totalExecutions).toBe(2);
      expect(metrics.successRate).toBe(0.5);
    });

    it("should return zero metrics initially", () => {
      const metrics = engine.getMetrics();
      expect(metrics.totalWorkflows).toBe(0);
      expect(metrics.totalExecutions).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.avgExecutionDurationMs).toBe(0);
      expect(metrics.totalTemplates).toBe(0);
    });
  });

  // ==========================================================================
  // Reset
  // ==========================================================================

  describe("Reset", () => {
    it("should clear all workflows, templates, and executions", async () => {
      const wf = buildValidWorkflow();
      engine.saveAsTemplate(wf.id, "cat");
      await engine.executeWorkflow(wf.id);

      engine.reset();

      expect(engine.listWorkflows()).toHaveLength(0);
      expect(engine.listTemplates()).toHaveLength(0);
      const metrics = engine.getMetrics();
      expect(metrics.totalExecutions).toBe(0);
    });
  });
});
