/**
 * AgentOps SDK - Profiler Engine
 *
 * Performance profiling engine for agent call trees with
 * flame graph generation, bottleneck detection, and optimization recommendations.
 */

import type {
  ProfilerConfig,
  ResolvedProfilerConfig,
  ProfileNode,
  ProfileSession,
  FlameGraphData,
  FlameGraphEntry,
  Bottleneck,
  OptimizationRecommendation,
  ProfilerMetrics,
} from "./types.js";
import { generateEventId, now } from "../utils.js";

const DEFAULT_PROFILER_CONFIG: ResolvedProfilerConfig = {
  enabled: false,
  samplingRate: 1.0,
  maxDepth: 50,
  trackTokens: true,
  trackCost: true,
  trackLatency: true,
  debug: false,
};

export class ProfilerEngine {
  private readonly config: ResolvedProfilerConfig;
  private readonly profiles: Map<string, ProfileSession> = new Map();
  private completedDurations: number[] = [];
  private completedTokens: number[] = [];
  private completedCosts: number[] = [];
  private totalOptimizationsFound = 0;
  private totalBottlenecksFound = 0;

  constructor(config?: ProfilerConfig) {
    this.config = {
      ...DEFAULT_PROFILER_CONFIG,
      ...config,
    };
  }

  /**
   * Start a new profiling session.
   */
  startProfile(sessionId: string): string {
    const profileId = generateEventId();
    const startTime = now();

    const rootNode: ProfileNode = {
      id: generateEventId(),
      name: "root",
      type: "session",
      parentId: null,
      children: [],
      startTime,
      endTime: null,
      durationMs: 0,
      selfDurationMs: 0,
      tokens: { prompt: 0, completion: 0, total: 0 },
      cost: 0,
      model: null,
      metadata: {},
      depth: 0,
    };

    const session: ProfileSession = {
      id: profileId,
      sessionId,
      rootNodeId: rootNode.id,
      nodes: new Map([[rootNode.id, rootNode]]),
      startTime,
      endTime: null,
      totalDurationMs: 0,
      totalTokens: 0,
      totalCost: 0,
      totalNodes: 1,
    };

    this.profiles.set(profileId, session);
    return profileId;
  }

  /**
   * Add a node to a profiling session.
   */
  addNode(
    profileId: string,
    node: Omit<ProfileNode, "id" | "selfDurationMs" | "depth" | "children">,
  ): string {
    const session = this.profiles.get(profileId);
    if (!session) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const nodeId = generateEventId();

    // Calculate depth from parent chain
    let depth = 0;
    if (node.parentId) {
      const parent = session.nodes.get(node.parentId);
      if (parent) {
        depth = parent.depth + 1;
        parent.children.push(nodeId);
      }
    }

    if (depth > this.config.maxDepth) {
      depth = this.config.maxDepth;
    }

    const profileNode: ProfileNode = {
      ...node,
      id: nodeId,
      children: [],
      selfDurationMs: 0,
      depth,
    };

    session.nodes.set(nodeId, profileNode);
    session.totalNodes = session.nodes.size;

    return nodeId;
  }

  /**
   * End a node, calculating its duration.
   */
  endNode(profileId: string, nodeId: string, endTime?: number): void {
    const session = this.profiles.get(profileId);
    if (!session) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const node = session.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    node.endTime = endTime ?? now();
    node.durationMs = node.endTime - node.startTime;
  }

  /**
   * End a profiling session, finalizing all calculations.
   */
  endProfile(profileId: string): ProfileSession {
    const session = this.profiles.get(profileId);
    if (!session) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    session.endTime = now();
    session.totalDurationMs = session.endTime - session.startTime;

    // Finalize all nodes: calculate selfDuration and accumulate totals
    let totalTokens = 0;
    let totalCost = 0;

    for (const node of session.nodes.values()) {
      // End any unclosed nodes
      if (node.endTime === null) {
        node.endTime = session.endTime;
        node.durationMs = node.endTime - node.startTime;
      }

      // Calculate self duration (total minus children)
      const childrenDuration = node.children.reduce((sum, childId) => {
        const child = session.nodes.get(childId);
        return sum + (child?.durationMs ?? 0);
      }, 0);
      node.selfDurationMs = Math.max(0, node.durationMs - childrenDuration);

      totalTokens += node.tokens.total;
      totalCost += node.cost;
    }

    session.totalTokens = totalTokens;
    session.totalCost = totalCost;
    session.totalNodes = session.nodes.size;

    // Track for metrics
    this.completedDurations.push(session.totalDurationMs);
    this.completedTokens.push(session.totalTokens);
    this.completedCosts.push(session.totalCost);

    return session;
  }

  /**
   * Get a profiling session by ID.
   */
  getProfile(profileId: string): ProfileSession | undefined {
    return this.profiles.get(profileId);
  }

  /**
   * Generate flame graph data for a profile.
   */
  generateFlameGraph(
    profileId: string,
    metric: "duration" | "tokens" | "cost",
  ): FlameGraphData {
    const session = this.profiles.get(profileId);
    if (!session) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const rootNode = session.nodes.get(session.rootNodeId);
    if (!rootNode) {
      throw new Error("Root node not found");
    }

    // Calculate total value for percentage calculations
    let totalValue = 0;
    for (const node of session.nodes.values()) {
      totalValue += this.getMetricValue(node, metric);
    }
    if (totalValue === 0) totalValue = 1; // Avoid division by zero

    let maxDepth = 0;
    const buildEntry = (node: ProfileNode): FlameGraphEntry => {
      if (node.depth > maxDepth) maxDepth = node.depth;

      const value = this.getMetricValue(node, metric);
      const children = node.children
        .map((childId) => session.nodes.get(childId))
        .filter((child): child is ProfileNode => child !== undefined)
        .map((child) => buildEntry(child));

      return {
        id: node.id,
        name: node.name,
        type: node.type,
        value,
        children,
        depth: node.depth,
        percentage: (value / totalValue) * 100,
      };
    };

    const root = buildEntry(rootNode);

    return {
      root,
      metric,
      totalValue,
      maxDepth,
    };
  }

  /**
   * Find performance bottlenecks in a profile.
   */
  findBottlenecks(
    profileId: string,
    options?: { topN?: number; metric?: "duration" | "tokens" | "cost" },
  ): Bottleneck[] {
    const session = this.profiles.get(profileId);
    if (!session) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const topN = options?.topN ?? 5;
    const metric = options?.metric ?? "duration";

    // Calculate total for percentage
    let totalValue = 0;
    const nodeValues: Array<{ node: ProfileNode; value: number }> = [];

    for (const node of session.nodes.values()) {
      // Skip root session node
      if (node.type === "session") continue;

      const value = this.getMetricValue(node, metric);
      totalValue += value;
      nodeValues.push({ node, value });
    }

    if (totalValue === 0) totalValue = 1;

    // Sort by value descending and take top N
    nodeValues.sort((a, b) => b.value - a.value);
    const topNodes = nodeValues.slice(0, topN);

    const bottlenecks = topNodes.map(({ node, value }) => {
      const percentage = (value / totalValue) * 100;
      return {
        nodeId: node.id,
        nodeName: node.name,
        type: node.type,
        metric,
        value,
        percentage,
        severity: this.getSeverity(percentage),
        suggestion: this.getBottleneckSuggestion(node, metric, percentage),
      } satisfies Bottleneck;
    });

    this.totalBottlenecksFound += bottlenecks.length;
    return bottlenecks;
  }

  /**
   * Generate optimization recommendations based on profile data.
   */
  generateRecommendations(profileId: string): OptimizationRecommendation[] {
    const session = this.profiles.get(profileId);
    if (!session) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const recommendations: OptimizationRecommendation[] = [];
    const nodes = Array.from(session.nodes.values());

    // 1. Model downgrade: single LLM call >50% of total cost
    this.checkModelDowngrade(session, nodes, recommendations);

    // 2. Reduce context: total tokens >10000
    this.checkReduceContext(session, nodes, recommendations);

    // 3. Cache response: duplicate tool calls
    this.checkCacheResponse(nodes, recommendations);

    // 4. Parallelize: >3 sequential LLM calls
    this.checkParallelize(nodes, recommendations);

    // 5. Remove redundant: tool calls with zero effect
    this.checkRemoveRedundant(nodes, recommendations);

    this.totalOptimizationsFound += recommendations.length;
    return recommendations;
  }

  /**
   * Get aggregate profiler metrics.
   */
  getMetrics(): ProfilerMetrics {
    const total = this.completedDurations.length;
    return {
      totalProfiles: total,
      avgDurationMs:
        total > 0
          ? this.completedDurations.reduce((a, b) => a + b, 0) / total
          : 0,
      avgTokens:
        total > 0 ? this.completedTokens.reduce((a, b) => a + b, 0) / total : 0,
      avgCost:
        total > 0 ? this.completedCosts.reduce((a, b) => a + b, 0) / total : 0,
      totalOptimizationsFound: this.totalOptimizationsFound,
      totalBottlenecksFound: this.totalBottlenecksFound,
    };
  }

  /**
   * Reset all profiler state.
   */
  reset(): void {
    this.profiles.clear();
    this.completedDurations = [];
    this.completedTokens = [];
    this.completedCosts = [];
    this.totalOptimizationsFound = 0;
    this.totalBottlenecksFound = 0;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private getMetricValue(
    node: ProfileNode,
    metric: "duration" | "tokens" | "cost",
  ): number {
    switch (metric) {
      case "duration":
        return node.durationMs;
      case "tokens":
        return node.tokens.total;
      case "cost":
        return node.cost;
    }
  }

  private getSeverity(
    percentage: number,
  ): "critical" | "high" | "medium" | "low" {
    if (percentage >= 50) return "critical";
    if (percentage >= 30) return "high";
    if (percentage >= 15) return "medium";
    return "low";
  }

  private getBottleneckSuggestion(
    node: ProfileNode,
    metric: "duration" | "tokens" | "cost",
    percentage: number,
  ): string {
    if (node.type === "llm_call" && metric === "cost" && percentage > 40) {
      return `Consider using a smaller model for "${node.name}" to reduce cost`;
    }
    if (node.type === "llm_call" && metric === "tokens") {
      return `Reduce prompt size or context for "${node.name}"`;
    }
    if (node.type === "tool_call" && metric === "duration") {
      return `Optimize or cache tool call "${node.name}" to reduce latency`;
    }
    return `"${node.name}" consumes ${percentage.toFixed(1)}% of total ${metric}`;
  }

  private checkModelDowngrade(
    session: ProfileSession,
    nodes: ProfileNode[],
    recommendations: OptimizationRecommendation[],
  ): void {
    if (session.totalCost === 0) return;

    for (const node of nodes) {
      if (node.type !== "llm_call") continue;
      const costPercentage = node.cost / session.totalCost;
      if (costPercentage > 0.5) {
        recommendations.push({
          id: generateEventId(),
          type: "model_downgrade",
          title: "Consider downgrading model",
          description: `LLM call "${node.name}" accounts for ${(costPercentage * 100).toFixed(1)}% of total cost. Consider using a cheaper model.`,
          estimatedSavings: { cost: node.cost * 0.5 },
          impactScore: costPercentage,
          affectedNodes: [node.id],
        });
      }
    }
  }

  private checkReduceContext(
    session: ProfileSession,
    _nodes: ProfileNode[],
    recommendations: OptimizationRecommendation[],
  ): void {
    if (session.totalTokens > 10000) {
      const affectedNodes = Array.from(session.nodes.values())
        .filter((n) => n.tokens.total > 0)
        .map((n) => n.id);

      recommendations.push({
        id: generateEventId(),
        type: "reduce_context",
        title: "Reduce context window usage",
        description: `Session uses ${session.totalTokens} total tokens. Consider reducing prompt sizes or summarizing context.`,
        estimatedSavings: { tokens: Math.floor(session.totalTokens * 0.3) },
        impactScore: Math.min(1, session.totalTokens / 50000),
        affectedNodes,
      });
    }
  }

  private checkCacheResponse(
    nodes: ProfileNode[],
    recommendations: OptimizationRecommendation[],
  ): void {
    const toolCalls = nodes.filter((n) => n.type === "tool_call");
    const seen = new Map<string, ProfileNode[]>();

    for (const call of toolCalls) {
      const key = `${call.name}:${JSON.stringify(call.metadata.input ?? "")}`;
      const existing = seen.get(key) ?? [];
      existing.push(call);
      seen.set(key, existing);
    }

    for (const [, duplicates] of seen) {
      if (duplicates.length > 1) {
        recommendations.push({
          id: generateEventId(),
          type: "cache_response",
          title: "Cache duplicate tool call responses",
          description: `Tool call "${duplicates[0].name}" is called ${duplicates.length} times with the same input. Consider caching the response.`,
          estimatedSavings: {
            latencyMs: duplicates
              .slice(1)
              .reduce((s, n) => s + n.durationMs, 0),
          },
          impactScore: Math.min(1, duplicates.length / 5),
          affectedNodes: duplicates.map((n) => n.id),
        });
      }
    }
  }

  private checkParallelize(
    nodes: ProfileNode[],
    recommendations: OptimizationRecommendation[],
  ): void {
    // Find sequential LLM calls (sharing same parent, ordered by startTime)
    const llmCalls = nodes.filter((n) => n.type === "llm_call");
    const byParent = new Map<string, ProfileNode[]>();

    for (const call of llmCalls) {
      if (!call.parentId) continue;
      const siblings = byParent.get(call.parentId) ?? [];
      siblings.push(call);
      byParent.set(call.parentId, siblings);
    }

    for (const [, siblings] of byParent) {
      if (siblings.length > 3) {
        const sorted = siblings.sort((a, b) => a.startTime - b.startTime);
        const totalLatency = sorted.reduce((s, n) => s + n.durationMs, 0);
        const maxLatency = Math.max(...sorted.map((n) => n.durationMs));

        recommendations.push({
          id: generateEventId(),
          type: "parallelize",
          title: "Parallelize sequential LLM calls",
          description: `${sorted.length} sequential LLM calls detected under the same parent. Running them in parallel could reduce latency.`,
          estimatedSavings: { latencyMs: totalLatency - maxLatency },
          impactScore: Math.min(1, sorted.length / 10),
          affectedNodes: sorted.map((n) => n.id),
        });
      }
    }
  }

  private checkRemoveRedundant(
    nodes: ProfileNode[],
    recommendations: OptimizationRecommendation[],
  ): void {
    const toolCalls = nodes.filter((n) => n.type === "tool_call");

    for (const call of toolCalls) {
      if (call.metadata.effect === "none" || call.metadata.output === "") {
        recommendations.push({
          id: generateEventId(),
          type: "remove_redundant",
          title: "Remove redundant tool call",
          description: `Tool call "${call.name}" produced no effect. Consider removing it.`,
          estimatedSavings: { latencyMs: call.durationMs },
          impactScore: 0.3,
          affectedNodes: [call.id],
        });
      }
    }
  }
}
