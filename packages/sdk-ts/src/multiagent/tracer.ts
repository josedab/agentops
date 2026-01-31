/**
 * AgentOps SDK - Multi-Agent Orchestration Tracing
 *
 * Visualize interactions between multiple agents: handoffs,
 * shared context, and conflict resolution.
 */

import { now, generateEventId } from "../utils.js";

// ============================================================================
// Types
// ============================================================================

export interface MultiAgentConfig {
  enabled: boolean;
  maxAgentsPerSession?: number;
  trackSharedContext?: boolean;
  detectConflicts?: boolean;
  onAgentRegistered?: (agent: Agent) => void;
  onHandoff?: (handoff: AgentHandoff) => void;
  onConflict?: (conflict: ConflictEvent) => void;
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  role: string;
  capabilities: string[];
  model?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export type AgentType =
  | "primary"
  | "specialist"
  | "supervisor"
  | "worker"
  | "coordinator"
  | "custom";

export interface AgentSession {
  id: string;
  agents: Map<string, Agent>;
  orchestrationType: OrchestrationType;
  status: "active" | "completed" | "failed";
  startTime: number;
  endTime?: number;
  events: MultiAgentEvent[];
  sharedContext: SharedContext;
  metrics: OrchestrationMetrics;
}

export type OrchestrationType =
  | "sequential" // Agents work in order
  | "parallel" // Agents work simultaneously
  | "hierarchical" // Supervisor delegates to workers
  | "consensus" // Agents must agree
  | "auction" // Agents bid for tasks
  | "custom";

export interface MultiAgentEvent {
  id: string;
  type: EventType;
  timestamp: number;
  agentId: string;
  targetAgentId?: string;
  data: unknown;
}

export type EventType =
  | "agent_join"
  | "agent_leave"
  | "message"
  | "task_assign"
  | "task_complete"
  | "handoff"
  | "context_update"
  | "conflict"
  | "resolution";

export interface AgentHandoff {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  context: unknown;
  timestamp: number;
  success: boolean;
  duration?: number;
}

export interface SharedContext {
  data: Map<string, unknown>;
  version: number;
  lastUpdatedBy: string;
  lastUpdatedAt: number;
  history: ContextUpdate[];
}

export interface ContextUpdate {
  agentId: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}

export interface ConflictEvent {
  id: string;
  type: ConflictType;
  agentIds: string[];
  description: string;
  severity: "low" | "medium" | "high";
  resolution?: ConflictResolution;
  timestamp: number;
}

export type ConflictType =
  | "resource_contention"
  | "context_conflict"
  | "decision_conflict"
  | "priority_conflict";

export interface ConflictResolution {
  resolvedBy: string;
  strategy: "priority" | "voting" | "supervisor" | "merge" | "abort";
  outcome: string;
  timestamp: number;
}

export interface OrchestrationMetrics {
  totalHandoffs: number;
  successfulHandoffs: number;
  avgHandoffTime: number;
  conflicts: number;
  resolvedConflicts: number;
  contextUpdates: number;
  agentUtilization: Map<string, number>;
}

export interface AgentCommunication {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  messageType: "request" | "response" | "broadcast" | "notification";
  content: unknown;
  timestamp: number;
  latency?: number;
}

// ============================================================================
// Multi-Agent Orchestration Tracer
// ============================================================================

export class MultiAgentTracer {
  private readonly config: Required<
    Omit<MultiAgentConfig, "onAgentRegistered" | "onHandoff" | "onConflict">
  > & {
    onAgentRegistered?: (agent: Agent) => void;
    onHandoff?: (handoff: AgentHandoff) => void;
    onConflict?: (conflict: ConflictEvent) => void;
  };

  private sessions: Map<string, AgentSession> = new Map();
  private currentSession: AgentSession | null = null;

  constructor(config: MultiAgentConfig) {
    this.config = {
      enabled: config.enabled,
      maxAgentsPerSession: config.maxAgentsPerSession ?? 10,
      trackSharedContext: config.trackSharedContext ?? true,
      detectConflicts: config.detectConflicts ?? true,
      onAgentRegistered: config.onAgentRegistered,
      onHandoff: config.onHandoff,
      onConflict: config.onConflict,
    };
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  // =========================================================================
  // Session Management
  // =========================================================================

  startSession(
    orchestrationType: OrchestrationType = "sequential",
  ): AgentSession {
    const session: AgentSession = {
      id: generateEventId(),
      agents: new Map(),
      orchestrationType,
      status: "active",
      startTime: now(),
      events: [],
      sharedContext: {
        data: new Map(),
        version: 0,
        lastUpdatedBy: "",
        lastUpdatedAt: now(),
        history: [],
      },
      metrics: {
        totalHandoffs: 0,
        successfulHandoffs: 0,
        avgHandoffTime: 0,
        conflicts: 0,
        resolvedConflicts: 0,
        contextUpdates: 0,
        agentUtilization: new Map(),
      },
    };

    this.sessions.set(session.id, session);
    this.currentSession = session;
    return session;
  }

  endSession(sessionId?: string): AgentSession | null {
    const session = sessionId
      ? this.sessions.get(sessionId)
      : this.currentSession;
    if (!session) return null;

    session.status = "completed";
    session.endTime = now();

    if (session === this.currentSession) {
      this.currentSession = null;
    }

    return session;
  }

  getSession(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  getCurrentSession(): AgentSession | null {
    return this.currentSession;
  }

  listSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  // =========================================================================
  // Agent Management
  // =========================================================================

  registerAgent(params: Omit<Agent, "id" | "createdAt">): Agent {
    if (!this.currentSession) {
      throw new Error("No active session");
    }

    if (this.currentSession.agents.size >= this.config.maxAgentsPerSession) {
      throw new Error("Maximum agents reached for session");
    }

    const agent: Agent = {
      ...params,
      id: generateEventId(),
      createdAt: now(),
    };

    this.currentSession.agents.set(agent.id, agent);
    this.addEvent("agent_join", agent.id);

    if (this.config.onAgentRegistered) {
      this.config.onAgentRegistered(agent);
    }

    return agent;
  }

  getAgent(agentId: string): Agent | undefined {
    return this.currentSession?.agents.get(agentId);
  }

  listAgents(): Agent[] {
    if (!this.currentSession) return [];
    return Array.from(this.currentSession.agents.values());
  }

  removeAgent(agentId: string): boolean {
    if (!this.currentSession) return false;

    const removed = this.currentSession.agents.delete(agentId);
    if (removed) {
      this.addEvent("agent_leave", agentId);
    }
    return removed;
  }

  // =========================================================================
  // Handoffs
  // =========================================================================

  recordHandoff(params: {
    fromAgentId: string;
    toAgentId: string;
    reason: string;
    context?: unknown;
  }): AgentHandoff {
    if (!this.currentSession) {
      throw new Error("No active session");
    }

    const handoff: AgentHandoff = {
      id: generateEventId(),
      fromAgentId: params.fromAgentId,
      toAgentId: params.toAgentId,
      reason: params.reason,
      context: params.context,
      timestamp: now(),
      success: true,
    };

    this.addEvent("handoff", params.fromAgentId, params.toAgentId, handoff);
    this.currentSession.metrics.totalHandoffs++;
    this.currentSession.metrics.successfulHandoffs++;

    if (this.config.onHandoff) {
      this.config.onHandoff(handoff);
    }

    return handoff;
  }

  // =========================================================================
  // Shared Context
  // =========================================================================

  updateContext(agentId: string, key: string, value: unknown): void {
    if (!this.currentSession || !this.config.trackSharedContext) return;

    const ctx = this.currentSession.sharedContext;
    const oldValue = ctx.data.get(key);

    ctx.data.set(key, value);
    ctx.version++;
    ctx.lastUpdatedBy = agentId;
    ctx.lastUpdatedAt = now();

    ctx.history.push({
      agentId,
      key,
      oldValue,
      newValue: value,
      timestamp: now(),
    });

    this.currentSession.metrics.contextUpdates++;
    this.addEvent("context_update", agentId, undefined, {
      key,
      oldValue,
      newValue: value,
    });

    // Detect conflicts
    if (this.config.detectConflicts && oldValue !== undefined) {
      this.checkForConflict(agentId, key, oldValue, value);
    }
  }

  getContext(key: string): unknown {
    return this.currentSession?.sharedContext.data.get(key);
  }

  getAllContext(): Map<string, unknown> {
    return new Map(this.currentSession?.sharedContext.data ?? []);
  }

  // =========================================================================
  // Communication
  // =========================================================================

  recordMessage(params: {
    fromAgentId: string;
    toAgentId: string;
    messageType: AgentCommunication["messageType"];
    content: unknown;
  }): AgentCommunication {
    if (!this.currentSession) {
      throw new Error("No active session");
    }

    const message: AgentCommunication = {
      id: generateEventId(),
      fromAgentId: params.fromAgentId,
      toAgentId: params.toAgentId,
      messageType: params.messageType,
      content: params.content,
      timestamp: now(),
    };

    this.addEvent("message", params.fromAgentId, params.toAgentId, message);
    return message;
  }

  // =========================================================================
  // Conflict Detection
  // =========================================================================

  recordConflict(params: {
    type: ConflictType;
    agentIds: string[];
    description: string;
    severity?: "low" | "medium" | "high";
  }): ConflictEvent {
    if (!this.currentSession) {
      throw new Error("No active session");
    }

    const conflict: ConflictEvent = {
      id: generateEventId(),
      type: params.type,
      agentIds: params.agentIds,
      description: params.description,
      severity: params.severity ?? "medium",
      timestamp: now(),
    };

    this.addEvent("conflict", params.agentIds[0], undefined, conflict);
    this.currentSession.metrics.conflicts++;

    if (this.config.onConflict) {
      this.config.onConflict(conflict);
    }

    return conflict;
  }

  resolveConflict(
    conflictId: string,
    resolution: Omit<ConflictResolution, "timestamp">,
  ): boolean {
    if (!this.currentSession) return false;

    // Find and update conflict
    const conflictEvent = this.currentSession.events.find(
      (e) =>
        e.type === "conflict" && (e.data as ConflictEvent).id === conflictId,
    );

    if (conflictEvent) {
      const conflict = conflictEvent.data as ConflictEvent;
      conflict.resolution = { ...resolution, timestamp: now() };
      this.currentSession.metrics.resolvedConflicts++;
      this.addEvent("resolution", resolution.resolvedBy, undefined, conflict);
      return true;
    }

    return false;
  }

  // =========================================================================
  // Visualization & Reports
  // =========================================================================

  getInteractionGraph(): InteractionGraph {
    if (!this.currentSession) {
      return { nodes: [], edges: [] };
    }

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const edgeCounts = new Map<string, number>();

    // Build nodes from agents
    for (const agent of this.currentSession.agents.values()) {
      nodes.push({
        id: agent.id,
        label: agent.name,
        type: agent.type,
        role: agent.role,
      });
    }

    // Build edges from events
    for (const event of this.currentSession.events) {
      if (event.targetAgentId) {
        const edgeKey = `${event.agentId}-${event.targetAgentId}`;
        const count = (edgeCounts.get(edgeKey) ?? 0) + 1;
        edgeCounts.set(edgeKey, count);
      }
    }

    for (const [key, count] of edgeCounts) {
      const [from, to] = key.split("-");
      edges.push({
        from,
        to,
        weight: count,
        label: `${count} interactions`,
      });
    }

    return { nodes, edges };
  }

  getTimeline(): TimelineEntry[] {
    if (!this.currentSession) return [];

    return this.currentSession.events.map((event) => ({
      timestamp: event.timestamp,
      type: event.type,
      agentId: event.agentId,
      agentName:
        this.currentSession!.agents.get(event.agentId)?.name ?? event.agentId,
      targetAgentId: event.targetAgentId,
      targetAgentName: event.targetAgentId
        ? (this.currentSession!.agents.get(event.targetAgentId)?.name ??
          event.targetAgentId)
        : undefined,
      summary: this.summarizeEvent(event),
    }));
  }

  getMetrics(): OrchestrationMetrics | null {
    return this.currentSession?.metrics ?? null;
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private addEvent(
    type: EventType,
    agentId: string,
    targetAgentId?: string,
    data?: unknown,
  ): void {
    if (!this.currentSession) return;

    this.currentSession.events.push({
      id: generateEventId(),
      type,
      timestamp: now(),
      agentId,
      targetAgentId,
      data,
    });

    // Update agent utilization
    const util = this.currentSession.metrics.agentUtilization.get(agentId) ?? 0;
    this.currentSession.metrics.agentUtilization.set(agentId, util + 1);
  }

  private checkForConflict(
    agentId: string,
    key: string,
    _oldValue: unknown,
    _newValue: unknown,
  ): void {
    // Check if another agent recently updated this key
    const recentUpdates = this.currentSession?.sharedContext.history
      .filter((h) => h.key === key && h.agentId !== agentId)
      .filter((h) => now() - h.timestamp < 1000); // Within 1 second

    if (recentUpdates && recentUpdates.length > 0) {
      this.recordConflict({
        type: "context_conflict",
        agentIds: [agentId, ...recentUpdates.map((u) => u.agentId)],
        description: `Multiple agents updated "${key}" simultaneously`,
        severity: "low",
      });
    }
  }

  private summarizeEvent(event: MultiAgentEvent): string {
    switch (event.type) {
      case "agent_join":
        return "joined the session";
      case "agent_leave":
        return "left the session";
      case "handoff":
        return `handed off to ${event.targetAgentId}`;
      case "message":
        return `sent message to ${event.targetAgentId}`;
      case "context_update":
        return "updated shared context";
      case "conflict":
        return "conflict detected";
      case "resolution":
        return "conflict resolved";
      default:
        return event.type;
    }
  }
}

// Supporting types for visualization
export interface InteractionGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: AgentType;
  role: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
  label?: string;
}

export interface TimelineEntry {
  timestamp: number;
  type: EventType;
  agentId: string;
  agentName: string;
  targetAgentId?: string;
  targetAgentName?: string;
  summary: string;
}
