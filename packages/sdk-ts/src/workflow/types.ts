/**
 * Agent Workflow Builder - Type Definitions
 *
 * Types for building, validating, and executing agent workflows.
 */

// ============================================================================
// Configuration
// ============================================================================

export interface WorkflowConfig {
  enabled?: boolean;
  maxNodes?: number;
  maxEdges?: number;
  debug?: boolean;
}

export interface ResolvedWorkflowConfig {
  enabled: boolean;
  maxNodes: number;
  maxEdges: number;
  debug: boolean;
}

// ============================================================================
// Workflow Structure
// ============================================================================

export type WorkflowNodeType =
  | "start"
  | "end"
  | "llm_call"
  | "tool_call"
  | "condition"
  | "parallel"
  | "human_review"
  | "transform"
  | "loop";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  description: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  metadata: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  condition?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

// ============================================================================
// Validation
// ============================================================================

export interface WorkflowValidation {
  valid: boolean;
  errors: { nodeId?: string; edgeId?: string; message: string }[];
  warnings: string[];
}

// ============================================================================
// Execution
// ============================================================================

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  currentNodeId: string | null;
  executedNodes: {
    nodeId: string;
    startTime: number;
    endTime: number;
    result: unknown;
    status: "success" | "failed" | "skipped";
  }[];
  startTime: number;
  endTime: number | null;
  error: string | null;
  context: Record<string, unknown>;
}

// ============================================================================
// Templates
// ============================================================================

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  workflow: Workflow;
  usageCount: number;
}

// ============================================================================
// Metrics
// ============================================================================

export interface WorkflowMetrics {
  totalWorkflows: number;
  totalExecutions: number;
  successRate: number;
  avgExecutionDurationMs: number;
  totalTemplates: number;
}
