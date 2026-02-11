/**
 * Agent Workflow Builder - Engine
 *
 * Build, validate, and execute agent workflows with visual editing support.
 */

import { generateEventId, now } from "../utils.js";
import type { AgentEvent } from "../types.js";
import type {
  WorkflowConfig,
  ResolvedWorkflowConfig,
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowValidation,
  WorkflowExecution,
  WorkflowTemplate,
  WorkflowMetrics,
} from "./types.js";

export class WorkflowEngine {
  private readonly config: ResolvedWorkflowConfig;
  private readonly workflows: Map<string, Workflow> = new Map();
  private readonly templates: Map<string, WorkflowTemplate> = new Map();
  private readonly executions: WorkflowExecution[] = [];

  constructor(config: WorkflowConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      maxNodes: config.maxNodes ?? 100,
      maxEdges: config.maxEdges ?? 200,
      debug: config.debug ?? false,
    };
  }

  // ==========================================================================
  // Workflow CRUD
  // ==========================================================================

  createWorkflow(
    wf: Omit<Workflow, "id" | "createdAt" | "updatedAt">,
  ): Workflow {
    const workflow: Workflow = {
      ...wf,
      id: generateEventId(),
      createdAt: now(),
      updatedAt: now(),
    };
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  updateWorkflow(
    id: string,
    updates: Partial<
      Pick<Workflow, "name" | "description" | "nodes" | "edges" | "tags">
    >,
  ): Workflow {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }

    const updated: Workflow = {
      ...workflow,
      ...updates,
      updatedAt: now(),
    };
    this.workflows.set(id, updated);
    return updated;
  }

  deleteWorkflow(id: string): boolean {
    return this.workflows.delete(id);
  }

  listWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  // ==========================================================================
  // Node & Edge Management
  // ==========================================================================

  addNode(workflowId: string, node: Omit<WorkflowNode, "id">): WorkflowNode {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.nodes.length >= this.config.maxNodes) {
      throw new Error(
        `Maximum nodes (${this.config.maxNodes}) reached for workflow ${workflowId}`,
      );
    }

    const newNode: WorkflowNode = {
      ...node,
      id: generateEventId(),
    };
    workflow.nodes.push(newNode);
    workflow.updatedAt = now();
    return newNode;
  }

  removeNode(workflowId: string, nodeId: string): boolean {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const index = workflow.nodes.findIndex((n) => n.id === nodeId);
    if (index === -1) return false;

    workflow.nodes.splice(index, 1);
    // Remove connected edges
    workflow.edges = workflow.edges.filter(
      (e) => e.sourceId !== nodeId && e.targetId !== nodeId,
    );
    workflow.updatedAt = now();
    return true;
  }

  addEdge(workflowId: string, edge: Omit<WorkflowEdge, "id">): WorkflowEdge {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.edges.length >= this.config.maxEdges) {
      throw new Error(
        `Maximum edges (${this.config.maxEdges}) reached for workflow ${workflowId}`,
      );
    }

    const newEdge: WorkflowEdge = {
      ...edge,
      id: generateEventId(),
    };
    workflow.edges.push(newEdge);
    workflow.updatedAt = now();
    return newEdge;
  }

  removeEdge(workflowId: string, edgeId: string): boolean {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const index = workflow.edges.findIndex((e) => e.id === edgeId);
    if (index === -1) return false;

    workflow.edges.splice(index, 1);
    workflow.updatedAt = now();
    return true;
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  validateWorkflow(workflowId: string): WorkflowValidation {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const errors: WorkflowValidation["errors"] = [];
    const warnings: string[] = [];

    // Check for exactly one start node
    const startNodes = workflow.nodes.filter((n) => n.type === "start");
    if (startNodes.length === 0) {
      errors.push({ message: "Workflow must have exactly one start node" });
    } else if (startNodes.length > 1) {
      for (const node of startNodes.slice(1)) {
        errors.push({
          nodeId: node.id,
          message: "Workflow must have exactly one start node",
        });
      }
    }

    // Check for at least one end node
    const endNodes = workflow.nodes.filter((n) => n.type === "end");
    if (endNodes.length === 0) {
      errors.push({ message: "Workflow must have at least one end node" });
    }

    // Check all edges reference existing nodes
    const nodeIds = new Set(workflow.nodes.map((n) => n.id));
    for (const edge of workflow.edges) {
      if (!nodeIds.has(edge.sourceId)) {
        errors.push({
          edgeId: edge.id,
          message: `Edge references non-existent source node: ${edge.sourceId}`,
        });
      }
      if (!nodeIds.has(edge.targetId)) {
        errors.push({
          edgeId: edge.id,
          message: `Edge references non-existent target node: ${edge.targetId}`,
        });
      }
    }

    // Check for orphaned nodes (no incoming or outgoing edges, except start)
    for (const node of workflow.nodes) {
      if (node.type === "start") continue;
      const hasIncoming = workflow.edges.some((e) => e.targetId === node.id);
      const hasOutgoing = workflow.edges.some((e) => e.sourceId === node.id);
      if (!hasIncoming && !hasOutgoing) {
        errors.push({
          nodeId: node.id,
          message: `Orphaned node: ${node.name} (${node.id})`,
        });
      }
    }

    // Check condition nodes have at least 2 outgoing edges
    const conditionNodes = workflow.nodes.filter((n) => n.type === "condition");
    for (const node of conditionNodes) {
      const outgoing = workflow.edges.filter((e) => e.sourceId === node.id);
      if (outgoing.length < 2) {
        errors.push({
          nodeId: node.id,
          message: `Condition node "${node.name}" must have at least 2 outgoing edges`,
        });
      }
    }

    // Cycle detection (DFS)
    if (this.hasCycle(workflow)) {
      errors.push({ message: "Workflow contains a cycle" });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private hasCycle(workflow: Workflow): boolean {
    const adjacency = new Map<string, string[]>();
    for (const node of workflow.nodes) {
      adjacency.set(node.id, []);
    }
    for (const edge of workflow.edges) {
      adjacency.get(edge.sourceId)?.push(edge.targetId);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) return true;
      }
    }

    return false;
  }

  // ==========================================================================
  // Execution
  // ==========================================================================

  async executeWorkflow(
    workflowId: string,
    initialContext: Record<string, unknown> = {},
    nodeExecutor?: (
      node: WorkflowNode,
      context: Record<string, unknown>,
    ) => Promise<unknown>,
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const execution: WorkflowExecution = {
      id: generateEventId(),
      workflowId,
      status: "running",
      currentNodeId: null,
      executedNodes: [],
      startTime: now(),
      endTime: null,
      error: null,
      context: { ...initialContext },
    };

    try {
      const startNode = workflow.nodes.find((n) => n.type === "start");
      if (!startNode) {
        throw new Error("Workflow has no start node");
      }

      await this.executeNode(
        workflow,
        startNode,
        execution,
        nodeExecutor,
        new Set(),
      );

      execution.status = "completed";
    } catch (err) {
      execution.status = "failed";
      execution.error = err instanceof Error ? err.message : String(err);
    }

    execution.endTime = now();
    execution.currentNodeId = null;
    this.executions.push(execution);
    return execution;
  }

  private async executeNode(
    workflow: Workflow,
    node: WorkflowNode,
    execution: WorkflowExecution,
    nodeExecutor:
      | ((
          node: WorkflowNode,
          context: Record<string, unknown>,
        ) => Promise<unknown>)
      | undefined,
    visited: Set<string>,
  ): Promise<void> {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    execution.currentNodeId = node.id;
    const startTime = now();
    let result: unknown = undefined;
    let status: "success" | "failed" | "skipped" = "success";

    try {
      if (nodeExecutor && node.type !== "start" && node.type !== "end") {
        result = await nodeExecutor(node, execution.context);
      }
    } catch (err) {
      status = "failed";
      result = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      execution.executedNodes.push({
        nodeId: node.id,
        startTime,
        endTime: now(),
        result,
        status,
      });
    }

    if (node.type === "end") return;

    // Find outgoing edges
    const outgoing = workflow.edges.filter((e) => e.sourceId === node.id);

    if (node.type === "condition") {
      // For condition nodes, pick edge based on context
      const matchedEdge =
        outgoing.find((e) => {
          if (!e.condition) return false;
          return execution.context[e.condition] === true;
        }) ?? outgoing[0];

      if (matchedEdge) {
        const nextNode = workflow.nodes.find(
          (n) => n.id === matchedEdge.targetId,
        );
        if (nextNode) {
          await this.executeNode(
            workflow,
            nextNode,
            execution,
            nodeExecutor,
            visited,
          );
        }
      }
    } else if (node.type === "parallel") {
      // Execute all outgoing branches concurrently
      const promises = outgoing.map(async (edge) => {
        const nextNode = workflow.nodes.find((n) => n.id === edge.targetId);
        if (nextNode) {
          await this.executeNode(
            workflow,
            nextNode,
            execution,
            nodeExecutor,
            new Set(visited),
          );
        }
      });
      await Promise.all(promises);
    } else {
      // Sequential: follow first outgoing edge
      for (const edge of outgoing) {
        const nextNode = workflow.nodes.find((n) => n.id === edge.targetId);
        if (nextNode) {
          await this.executeNode(
            workflow,
            nextNode,
            execution,
            nodeExecutor,
            visited,
          );
        }
      }
    }
  }

  // ==========================================================================
  // Import / Export
  // ==========================================================================

  importFromTrace(events: AgentEvent[], name?: string): Workflow {
    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];
    let x = 0;
    const xStep = 200;

    for (const event of events) {
      let nodeType: WorkflowNode["type"];
      let nodeName: string;

      switch (event.type) {
        case "session_start":
          nodeType = "start";
          nodeName = "Session Start";
          break;
        case "session_end": {
          nodeType = "end";
          const endEvent = event as { status?: string };
          nodeName =
            endEvent.status === "error" ? "End (Failed)" : "Session End";
          break;
        }
        case "prompt":
        case "response":
          nodeType = "llm_call";
          nodeName = `LLM: ${event.type}`;
          break;
        case "tool_call":
        case "tool_result":
          nodeType = "tool_call";
          nodeName = `Tool: ${(event as { toolName?: string }).toolName ?? event.type}`;
          break;
        case "error":
          nodeType = "end";
          nodeName = "End (Error)";
          break;
        default:
          nodeType = "transform";
          nodeName = event.type;
          break;
      }

      const node: WorkflowNode = {
        id: generateEventId(),
        type: nodeType,
        name: nodeName,
        description: `Imported from ${event.type} event`,
        config: {},
        position: { x, y: 0 },
        metadata: { sourceEventId: event.eventId },
      };
      nodes.push(node);
      x += xStep;

      // Connect to previous node
      if (nodes.length > 1) {
        edges.push({
          id: generateEventId(),
          sourceId: nodes[nodes.length - 2].id,
          targetId: node.id,
        });
      }
    }

    const workflow = this.createWorkflow({
      name: name ?? "Imported Workflow",
      description: "Workflow imported from trace events",
      version: "1.0.0",
      nodes,
      edges,
      tags: ["imported"],
    });

    return workflow;
  }

  exportToCode(workflowId: string, language: "typescript" | "python"): string {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (language === "typescript") {
      return this.exportToTypeScript(workflow);
    }
    return this.exportToPython(workflow);
  }

  private exportToTypeScript(workflow: Workflow): string {
    const lines: string[] = [
      `// Auto-generated workflow: ${workflow.name}`,
      `// Version: ${workflow.version}`,
      "",
      'import { WorkflowEngine } from "@agentops/sdk";',
      "",
      "const engine = new WorkflowEngine();",
      "",
      "const workflow = engine.createWorkflow({",
      `  name: "${workflow.name}",`,
      `  description: "${workflow.description}",`,
      `  version: "${workflow.version}",`,
      "  nodes: [],",
      "  edges: [],",
      `  tags: [${workflow.tags.map((t) => `"${t}"`).join(", ")}],`,
      "});",
      "",
    ];

    for (const node of workflow.nodes) {
      lines.push(
        `const ${this.toVarName(node.name)} = engine.addNode(workflow.id, {`,
      );
      lines.push(`  type: "${node.type}",`);
      lines.push(`  name: "${node.name}",`);
      lines.push(`  description: "${node.description}",`);
      lines.push("  config: {},");
      lines.push(
        `  position: { x: ${node.position.x}, y: ${node.position.y} },`,
      );
      lines.push("  metadata: {},");
      lines.push("});");
      lines.push("");
    }

    for (const edge of workflow.edges) {
      const sourceNode = workflow.nodes.find((n) => n.id === edge.sourceId);
      const targetNode = workflow.nodes.find((n) => n.id === edge.targetId);
      if (sourceNode && targetNode) {
        lines.push("engine.addEdge(workflow.id, {");
        lines.push(`  sourceId: ${this.toVarName(sourceNode.name)}.id,`);
        lines.push(`  targetId: ${this.toVarName(targetNode.name)}.id,`);
        if (edge.label) lines.push(`  label: "${edge.label}",`);
        if (edge.condition) lines.push(`  condition: "${edge.condition}",`);
        lines.push("});");
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  private exportToPython(workflow: Workflow): string {
    const lines: string[] = [
      `# Auto-generated workflow: ${workflow.name}`,
      `# Version: ${workflow.version}`,
      "",
      "from agentops import WorkflowEngine",
      "",
      "engine = WorkflowEngine()",
      "",
      "workflow = engine.create_workflow(",
      `    name="${workflow.name}",`,
      `    description="${workflow.description}",`,
      `    version="${workflow.version}",`,
      "    nodes=[],",
      "    edges=[],",
      `    tags=[${workflow.tags.map((t) => `"${t}"`).join(", ")}],`,
      ")",
      "",
    ];

    for (const node of workflow.nodes) {
      const varName = this.toSnakeCase(node.name);
      lines.push(`${varName} = engine.add_node(workflow.id,`);
      lines.push(`    type="${node.type}",`);
      lines.push(`    name="${node.name}",`);
      lines.push(`    description="${node.description}",`);
      lines.push("    config={},");
      lines.push(
        `    position={"x": ${node.position.x}, "y": ${node.position.y}},`,
      );
      lines.push("    metadata={},");
      lines.push(")");
      lines.push("");
    }

    for (const edge of workflow.edges) {
      const sourceNode = workflow.nodes.find((n) => n.id === edge.sourceId);
      const targetNode = workflow.nodes.find((n) => n.id === edge.targetId);
      if (sourceNode && targetNode) {
        lines.push("engine.add_edge(workflow.id,");
        lines.push(`    source_id=${this.toSnakeCase(sourceNode.name)}.id,`);
        lines.push(`    target_id=${this.toSnakeCase(targetNode.name)}.id,`);
        if (edge.label) lines.push(`    label="${edge.label}",`);
        if (edge.condition) lines.push(`    condition="${edge.condition}",`);
        lines.push(")");
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  private toVarName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase();
  }

  private toSnakeCase(name: string): string {
    return this.toVarName(name);
  }

  // ==========================================================================
  // Templates
  // ==========================================================================

  saveAsTemplate(workflowId: string, category: string): WorkflowTemplate {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const template: WorkflowTemplate = {
      id: generateEventId(),
      name: workflow.name,
      description: workflow.description,
      category,
      workflow: { ...workflow },
      usageCount: 0,
    };
    this.templates.set(template.id, template);
    return template;
  }

  listTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  createFromTemplate(templateId: string, name?: string): Workflow {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    template.usageCount++;

    return this.createWorkflow({
      name: name ?? `${template.name} (copy)`,
      description: template.workflow.description,
      version: template.workflow.version,
      nodes: template.workflow.nodes.map((n) => ({
        ...n,
        id: generateEventId(),
      })),
      edges: template.workflow.edges.map((e) => ({
        ...e,
        id: generateEventId(),
      })),
      tags: [...template.workflow.tags],
    });
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  getMetrics(): WorkflowMetrics {
    const completed = this.executions.filter((e) => e.status === "completed");
    const total = this.executions.length;
    const durations = this.executions
      .filter((e) => e.endTime !== null)
      .map((e) => (e.endTime as number) - e.startTime);

    return {
      totalWorkflows: this.workflows.size,
      totalExecutions: total,
      successRate: total > 0 ? completed.length / total : 0,
      avgExecutionDurationMs:
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0,
      totalTemplates: this.templates.size,
    };
  }

  // ==========================================================================
  // Reset
  // ==========================================================================

  reset(): void {
    this.workflows.clear();
    this.templates.clear();
    this.executions.length = 0;
  }
}
