/**
 * AgentOps SDK - Topology Tracker
 *
 * Core implementation for multi-agent topology tracking, analysis,
 * snapshot management, and replay.
 */

import { nanoid } from "nanoid";
import { now } from "../utils.js";

import type {
  NodeMetrics,
  TopologyNode,
  TopologyEdge,
  GraphMetadata,
  TopologyGraph,
  TopologySnapshot,
  TopologyEvent,
  ReplayState,
  CommunicationPattern,
  BottleneckAnalysis,
  TopologyConfig,
} from "./types.js";

// ============================================================================
// Default Metrics
// ============================================================================

function createDefaultMetrics(): NodeMetrics {
  return {
    messagesSent: 0,
    messagesReceived: 0,
    toolCalls: 0,
    errors: 0,
    avgResponseMs: 0,
    totalTokens: 0,
    totalCost: 0,
  };
}

// ============================================================================
// TopologyTracker
// ============================================================================

export class TopologyTracker {
  private readonly config: TopologyConfig;
  private nodes: Map<string, TopologyNode> = new Map();
  private edges: Map<string, TopologyEdge> = new Map();
  private snapshots: TopologySnapshot[] = [];
  private listeners: Array<(event: TopologyEvent) => void> = [];
  private graphStartedAt: number;
  private graphUpdatedAt: number;

  constructor(config: TopologyConfig) {
    this.config = config;
    this.graphStartedAt = now();
    this.graphUpdatedAt = this.graphStartedAt;
  }

  // ==========================================================================
  // Node Management
  // ==========================================================================

  /**
   * Add a new node to the topology graph.
   */
  addNode(
    id: string,
    type: TopologyNode["type"],
    name: string,
    metadata?: Record<string, unknown>,
  ): TopologyNode {
    const node: TopologyNode = {
      id,
      type,
      name,
      metadata,
      status: "active",
      metrics: createDefaultMetrics(),
    };

    this.nodes.set(id, node);
    this.graphUpdatedAt = now();

    this.emit({
      type: "node_added",
      data: { nodeId: id, nodeType: type, name },
      timestamp: now(),
    });

    return node;
  }

  /**
   * Update an existing node with partial data.
   */
  updateNode(id: string, updates: Partial<TopologyNode>): TopologyNode | null {
    const node = this.nodes.get(id);
    if (!node) return null;

    const updatedNode: TopologyNode = {
      ...node,
      ...updates,
      id: node.id, // Preserve the original ID
      metrics: updates.metrics
        ? { ...node.metrics, ...updates.metrics }
        : node.metrics,
    };

    this.nodes.set(id, updatedNode);
    this.graphUpdatedAt = now();

    this.emit({
      type: "node_updated",
      data: { nodeId: id, updates },
      timestamp: now(),
    });

    return updatedNode;
  }

  /**
   * Remove a node and all connected edges from the graph.
   */
  removeNode(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Remove all edges connected to this node
    const edgesToRemove: string[] = [];
    for (const [edgeId, edge] of this.edges) {
      if (edge.sourceId === id || edge.targetId === id) {
        edgesToRemove.push(edgeId);
      }
    }
    for (const edgeId of edgesToRemove) {
      this.edges.delete(edgeId);
    }

    this.nodes.delete(id);
    this.graphUpdatedAt = now();

    this.emit({
      type: "node_removed",
      data: { nodeId: id, removedEdges: edgesToRemove.length },
      timestamp: now(),
    });

    return true;
  }

  /**
   * Retrieve a node by its ID.
   */
  getNode(id: string): TopologyNode | undefined {
    return this.nodes.get(id);
  }

  // ==========================================================================
  // Edge Management
  // ==========================================================================

  /**
   * Record an interaction between two nodes. Creates a new edge if one does
   * not exist for the given source, target, and type; otherwise updates
   * the existing edge's weight and metrics.
   */
  recordInteraction(
    sourceId: string,
    targetId: string,
    type: TopologyEdge["type"],
    metadata?: Record<string, unknown>,
  ): TopologyEdge {
    // Ensure both nodes exist
    if (!this.nodes.has(sourceId)) {
      throw new Error(`Source node "${sourceId}" not found in topology`);
    }
    if (!this.nodes.has(targetId)) {
      throw new Error(`Target node "${targetId}" not found in topology`);
    }

    // Check type-specific config filtering
    if (type === "message" && !this.config.trackMessages) {
      // Still return existing edge if any, but do not create/update
      const existing = this.findEdge(sourceId, targetId, type);
      if (existing) return existing;
    }
    if (type === "delegation" && !this.config.trackDelegations) {
      const existing = this.findEdge(sourceId, targetId, type);
      if (existing) return existing;
    }
    if (type === "tool_call" && !this.config.trackToolCalls) {
      const existing = this.findEdge(sourceId, targetId, type);
      if (existing) return existing;
    }

    // Find existing edge for this source -> target -> type
    const existingEdge = this.findEdge(sourceId, targetId, type);

    if (existingEdge) {
      existingEdge.weight += 1;
      if (metadata) {
        existingEdge.metadata = { ...existingEdge.metadata, ...metadata };
      }
      if (metadata?.latencyMs !== undefined) {
        existingEdge.latencyMs =
          existingEdge.latencyMs !== undefined
            ? (existingEdge.latencyMs + (metadata.latencyMs as number)) / 2
            : (metadata.latencyMs as number);
      }
      this.graphUpdatedAt = now();

      this.emit({
        type: "edge_updated",
        data: { edgeId: existingEdge.id, sourceId, targetId, edgeType: type },
        timestamp: now(),
      });

      this.updateNodeMetricsForInteraction(sourceId, targetId, type);

      return existingEdge;
    }

    // Create new edge
    const edge: TopologyEdge = {
      id: `edge_${nanoid(21)}`,
      sourceId,
      targetId,
      type,
      weight: 1,
      latencyMs:
        metadata?.latencyMs !== undefined
          ? (metadata.latencyMs as number)
          : undefined,
      metadata,
    };

    this.edges.set(edge.id, edge);
    this.graphUpdatedAt = now();

    this.emit({
      type: "edge_added",
      data: { edgeId: edge.id, sourceId, targetId, edgeType: type },
      timestamp: now(),
    });

    this.emit({
      type: "interaction",
      data: { sourceId, targetId, edgeType: type, metadata: metadata ?? {} },
      timestamp: now(),
    });

    this.updateNodeMetricsForInteraction(sourceId, targetId, type);

    return edge;
  }

  /**
   * Retrieve an edge between two nodes (first matching edge, source -> target).
   */
  getEdge(sourceId: string, targetId: string): TopologyEdge | undefined {
    for (const edge of this.edges.values()) {
      if (edge.sourceId === sourceId && edge.targetId === targetId) {
        return edge;
      }
    }
    return undefined;
  }

  /**
   * Get all edges between two nodes in both directions.
   */
  getEdgesBetween(nodeId1: string, nodeId2: string): TopologyEdge[] {
    const results: TopologyEdge[] = [];
    for (const edge of this.edges.values()) {
      if (
        (edge.sourceId === nodeId1 && edge.targetId === nodeId2) ||
        (edge.sourceId === nodeId2 && edge.targetId === nodeId1)
      ) {
        results.push(edge);
      }
    }
    return results;
  }

  // ==========================================================================
  // Graph Access
  // ==========================================================================

  /**
   * Get the current topology graph.
   */
  getGraph(): TopologyGraph {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      metadata: this.buildGraphMetadata(),
    };
  }

  /**
   * Get a subgraph filtered to the specified node IDs.
   */
  getSubgraph(nodeIds: string[]): TopologyGraph {
    const nodeIdSet = new Set(nodeIds);
    const filteredNodes: TopologyNode[] = [];
    const filteredEdges: TopologyEdge[] = [];

    for (const node of this.nodes.values()) {
      if (nodeIdSet.has(node.id)) {
        filteredNodes.push(node);
      }
    }

    for (const edge of this.edges.values()) {
      if (nodeIdSet.has(edge.sourceId) && nodeIdSet.has(edge.targetId)) {
        filteredEdges.push(edge);
      }
    }

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      metadata: this.buildGraphMetadata(),
    };
  }

  /**
   * Get neighboring nodes connected to the given node.
   */
  getNeighbors(
    nodeId: string,
    direction: "in" | "out" | "both" = "both",
  ): TopologyNode[] {
    const neighborIds = new Set<string>();

    for (const edge of this.edges.values()) {
      if (direction === "out" || direction === "both") {
        if (edge.sourceId === nodeId) {
          neighborIds.add(edge.targetId);
        }
      }
      if (direction === "in" || direction === "both") {
        if (edge.targetId === nodeId) {
          neighborIds.add(edge.sourceId);
        }
      }
    }

    const neighbors: TopologyNode[] = [];
    for (const nid of neighborIds) {
      const node = this.nodes.get(nid);
      if (node) {
        neighbors.push(node);
      }
    }

    return neighbors;
  }

  // ==========================================================================
  // Analysis
  // ==========================================================================

  /**
   * Detect communication patterns in the current graph topology.
   * Uses simple heuristics to classify the observed pattern.
   */
  detectPatterns(): CommunicationPattern[] {
    const patterns: CommunicationPattern[] = [];
    const nodeCount = this.nodes.size;
    const edgeCount = this.edges.size;

    if (nodeCount < 2 || edgeCount === 0) return patterns;

    // Build adjacency data
    const outDegree = new Map<string, number>();
    const inDegree = new Map<string, number>();
    for (const node of this.nodes.values()) {
      outDegree.set(node.id, 0);
      inDegree.set(node.id, 0);
    }

    for (const edge of this.edges.values()) {
      outDegree.set(
        edge.sourceId,
        (outDegree.get(edge.sourceId) ?? 0) + edge.weight,
      );
      inDegree.set(
        edge.targetId,
        (inDegree.get(edge.targetId) ?? 0) + edge.weight,
      );
    }

    const totalWeight = Array.from(this.edges.values()).reduce(
      (sum, e) => sum + e.weight,
      0,
    );

    // Hub-spoke: one node has >60% of all edges
    for (const [nodeId, degree] of outDegree) {
      const inDeg = inDegree.get(nodeId) ?? 0;
      const totalDeg = degree + inDeg;
      if (totalDeg > totalWeight * 0.6) {
        const nodeName = this.nodes.get(nodeId)?.name ?? nodeId;
        patterns.push({
          type: "hub_spoke",
          confidence: Math.min(1, totalDeg / totalWeight),
          description: `Node "${nodeName}" acts as a hub with ${Math.round((totalDeg / totalWeight) * 100)}% of all interactions`,
        });
        break;
      }
    }

    // Broadcast: one node sends to all other nodes
    for (const [nodeId] of outDegree) {
      const outTargets = new Set<string>();
      for (const edge of this.edges.values()) {
        if (edge.sourceId === nodeId) {
          outTargets.add(edge.targetId);
        }
      }
      if (outTargets.size >= nodeCount - 1 && nodeCount > 2) {
        const nodeName = this.nodes.get(nodeId)?.name ?? nodeId;
        const confidence = outTargets.size / (nodeCount - 1);
        patterns.push({
          type: "broadcast",
          confidence,
          description: `Node "${nodeName}" broadcasts to ${outTargets.size} of ${nodeCount - 1} other nodes`,
        });
        break;
      }
    }

    // Sequential: linear chain of nodes
    if (this.isSequentialChain(outDegree, inDegree)) {
      patterns.push({
        type: "sequential",
        confidence: 0.8,
        description: `Linear chain detected with ${nodeCount} nodes in sequence`,
      });
    }

    // Hierarchical: tree-like structure (no cycles, one root with in-degree 0)
    if (this.isHierarchical(outDegree, inDegree)) {
      patterns.push({
        type: "hierarchical",
        confidence: 0.75,
        description: `Tree-like hierarchy detected with ${nodeCount} nodes`,
      });
    }

    // Peer-to-peer: roughly equal edge distribution
    if (this.isPeerToPeer(outDegree, inDegree, totalWeight)) {
      patterns.push({
        type: "peer_to_peer",
        confidence: 0.7,
        description: `Roughly equal communication distribution across ${nodeCount} nodes`,
      });
    }

    return patterns;
  }

  /**
   * Find bottleneck nodes based on error rates, latency, and throughput.
   */
  findBottlenecks(thresholds?: {
    errorRate?: number;
    latencyMs?: number;
    throughput?: number;
  }): BottleneckAnalysis[] {
    const results: BottleneckAnalysis[] = [];
    const errorRateThreshold = thresholds?.errorRate ?? 0.1;
    const latencyThreshold = thresholds?.latencyMs ?? 1000;
    const throughputThreshold = thresholds?.throughput ?? 100;

    for (const node of this.nodes.values()) {
      const totalMessages =
        node.metrics.messagesSent + node.metrics.messagesReceived;

      // Error rate bottleneck
      if (totalMessages > 0) {
        const errorRate = node.metrics.errors / totalMessages;
        if (errorRate > errorRateThreshold) {
          results.push({
            nodeId: node.id,
            nodeName: node.name,
            type: "error_rate",
            severity: this.classifySeverity(
              errorRate,
              errorRateThreshold,
              [1.5, 3, 5],
            ),
            metric: errorRate,
            threshold: errorRateThreshold,
            recommendation: `Node "${node.name}" has an error rate of ${(errorRate * 100).toFixed(1)}%. Investigate error sources and add retry logic or fallback paths.`,
          });
        }
      }

      // Latency bottleneck
      if (node.metrics.avgResponseMs > latencyThreshold) {
        results.push({
          nodeId: node.id,
          nodeName: node.name,
          type: "latency",
          severity: this.classifySeverity(
            node.metrics.avgResponseMs,
            latencyThreshold,
            [1.5, 3, 5],
          ),
          metric: node.metrics.avgResponseMs,
          threshold: latencyThreshold,
          recommendation: `Node "${node.name}" has average response time of ${node.metrics.avgResponseMs.toFixed(0)}ms. Consider caching, parallelization, or model optimization.`,
        });
      }

      // Throughput bottleneck (node receiving too many messages)
      if (node.metrics.messagesReceived > throughputThreshold) {
        results.push({
          nodeId: node.id,
          nodeName: node.name,
          type: "throughput",
          severity: this.classifySeverity(
            node.metrics.messagesReceived,
            throughputThreshold,
            [1.5, 3, 5],
          ),
          metric: node.metrics.messagesReceived,
          threshold: throughputThreshold,
          recommendation: `Node "${node.name}" is receiving ${node.metrics.messagesReceived} messages. Consider load balancing or adding parallel workers.`,
        });
      }
    }

    return results;
  }

  /**
   * Find the critical path - the longest latency path through the graph.
   * Returns an ordered array of node IDs.
   */
  getCriticalPath(): string[] {
    if (this.nodes.size === 0) return [];

    // Find all root nodes (no incoming edges)
    const roots: string[] = [];
    const hasIncoming = new Set<string>();
    for (const edge of this.edges.values()) {
      hasIncoming.add(edge.targetId);
    }
    for (const nodeId of this.nodes.keys()) {
      if (!hasIncoming.has(nodeId)) {
        roots.push(nodeId);
      }
    }

    // If no roots found (cyclic graph), start from node with most outgoing
    if (roots.length === 0) {
      let maxOut = -1;
      let maxNode = "";
      for (const nodeId of this.nodes.keys()) {
        let outCount = 0;
        for (const edge of this.edges.values()) {
          if (edge.sourceId === nodeId) outCount += edge.latencyMs ?? 0;
        }
        if (outCount > maxOut) {
          maxOut = outCount;
          maxNode = nodeId;
        }
      }
      if (maxNode) roots.push(maxNode);
    }

    // DFS to find longest latency path
    let longestPath: string[] = [];
    let longestLatency = -1;

    for (const root of roots) {
      const visited = new Set<string>();
      this.dfsLongestPath(root, [root], 0, visited, (path, latency) => {
        if (latency > longestLatency) {
          longestLatency = latency;
          longestPath = [...path];
        }
      });
    }

    // If no latency info, fall back to longest hop path
    if (longestLatency === 0 && longestPath.length <= 1) {
      for (const root of roots) {
        const visited = new Set<string>();
        this.dfsLongestHops(root, [root], visited, (path) => {
          if (path.length > longestPath.length) {
            longestPath = [...path];
          }
        });
      }
    }

    return longestPath;
  }

  /**
   * Get top 5 hotspot nodes by the specified metric.
   */
  getHotspots(
    metric: "messages" | "errors" | "latency" = "messages",
  ): TopologyNode[] {
    const nodes = Array.from(this.nodes.values());

    nodes.sort((a, b) => {
      switch (metric) {
        case "messages":
          return (
            b.metrics.messagesSent +
            b.metrics.messagesReceived -
            (a.metrics.messagesSent + a.metrics.messagesReceived)
          );
        case "errors":
          return b.metrics.errors - a.metrics.errors;
        case "latency":
          return b.metrics.avgResponseMs - a.metrics.avgResponseMs;
      }
    });

    return nodes.slice(0, 5);
  }

  // ==========================================================================
  // Snapshots & Replay
  // ==========================================================================

  /**
   * Take a snapshot of the current graph state.
   */
  takeSnapshot(): TopologySnapshot {
    const snapshot: TopologySnapshot = {
      id: `snap_${nanoid(21)}`,
      timestamp: now(),
      graph: this.deepCloneGraph(this.getGraph()),
    };

    this.snapshots.push(snapshot);

    // Enforce max snapshots
    if (
      this.config.maxSnapshots !== undefined &&
      this.snapshots.length > this.config.maxSnapshots
    ) {
      this.snapshots = this.snapshots.slice(-this.config.maxSnapshots);
    }

    return snapshot;
  }

  /**
   * Get all stored snapshots.
   */
  getSnapshots(): TopologySnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Get a specific snapshot by index.
   */
  getSnapshotAt(index: number): TopologySnapshot | undefined {
    if (index < 0 || index >= this.snapshots.length) return undefined;
    return this.snapshots[index];
  }

  /**
   * Create a new replay state initialized to the beginning.
   */
  createReplayState(): ReplayState {
    return {
      currentIndex: 0,
      totalSnapshots: this.snapshots.length,
      playing: false,
      speed: 1,
      currentSnapshot: this.snapshots.length > 0 ? this.snapshots[0] : null,
    };
  }

  /**
   * Advance the replay state to the next snapshot.
   * Returns the updated state.
   */
  advanceReplay(state: ReplayState): ReplayState {
    const nextIndex = state.currentIndex + 1;

    if (nextIndex >= this.snapshots.length) {
      return {
        ...state,
        playing: false,
        totalSnapshots: this.snapshots.length,
      };
    }

    return {
      ...state,
      currentIndex: nextIndex,
      totalSnapshots: this.snapshots.length,
      currentSnapshot: this.snapshots[nextIndex],
    };
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Register a callback for topology events.
   */
  onEvent(callback: (event: TopologyEvent) => void): void {
    this.listeners.push(callback);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Reset all topology state.
   */
  reset(): void {
    this.nodes.clear();
    this.edges.clear();
    this.snapshots = [];
    this.listeners = [];
    this.graphStartedAt = now();
    this.graphUpdatedAt = this.graphStartedAt;
  }

  /**
   * Get summary statistics about the current topology.
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    snapshotCount: number;
    patterns: CommunicationPattern[];
  } {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      snapshotCount: this.snapshots.length,
      patterns: this.detectPatterns(),
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private emit(event: TopologyEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private findEdge(
    sourceId: string,
    targetId: string,
    type: TopologyEdge["type"],
  ): TopologyEdge | undefined {
    for (const edge of this.edges.values()) {
      if (
        edge.sourceId === sourceId &&
        edge.targetId === targetId &&
        edge.type === type
      ) {
        return edge;
      }
    }
    return undefined;
  }

  private updateNodeMetricsForInteraction(
    sourceId: string,
    targetId: string,
    type: TopologyEdge["type"],
  ): void {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);

    if (source) {
      source.metrics.messagesSent += 1;
      if (type === "tool_call") {
        source.metrics.toolCalls += 1;
      }
      if (type === "error") {
        source.metrics.errors += 1;
      }
    }

    if (target) {
      target.metrics.messagesReceived += 1;
      if (type === "error") {
        target.metrics.errors += 1;
      }
    }
  }

  private buildGraphMetadata(): GraphMetadata {
    let totalMessages = 0;
    let totalDelegations = 0;
    let totalErrors = 0;

    for (const edge of this.edges.values()) {
      if (edge.type === "message" || edge.type === "response") {
        totalMessages += edge.weight;
      }
      if (edge.type === "delegation") {
        totalDelegations += edge.weight;
      }
      if (edge.type === "error") {
        totalErrors += edge.weight;
      }
    }

    return {
      startedAt: this.graphStartedAt,
      updatedAt: this.graphUpdatedAt,
      totalMessages,
      totalDelegations,
      totalErrors,
    };
  }

  private deepCloneGraph(graph: TopologyGraph): TopologyGraph {
    return JSON.parse(JSON.stringify(graph)) as TopologyGraph;
  }

  private classifySeverity(
    value: number,
    threshold: number,
    multipliers: [number, number, number],
  ): BottleneckAnalysis["severity"] {
    if (value >= threshold * multipliers[2]) return "critical";
    if (value >= threshold * multipliers[1]) return "high";
    if (value >= threshold * multipliers[0]) return "medium";
    return "low";
  }

  /**
   * Check if the graph forms a sequential chain.
   * A sequential chain: each node (except endpoints) has exactly one
   * incoming and one outgoing edge direction.
   */
  private isSequentialChain(
    _outDegree: Map<string, number>,
    _inDegree: Map<string, number>,
  ): boolean {
    if (this.nodes.size < 3) return false;

    // Count unique edge directions per node
    const outTargets = new Map<string, Set<string>>();
    const inSources = new Map<string, Set<string>>();

    for (const node of this.nodes.values()) {
      outTargets.set(node.id, new Set());
      inSources.set(node.id, new Set());
    }

    for (const edge of this.edges.values()) {
      outTargets.get(edge.sourceId)?.add(edge.targetId);
      inSources.get(edge.targetId)?.add(edge.sourceId);
    }

    let startNodes = 0;
    let endNodes = 0;
    let middleNodes = 0;

    for (const nodeId of this.nodes.keys()) {
      const outCount = outTargets.get(nodeId)?.size ?? 0;
      const inCount = inSources.get(nodeId)?.size ?? 0;

      if (outCount === 1 && inCount === 0) {
        startNodes++;
      } else if (outCount === 0 && inCount === 1) {
        endNodes++;
      } else if (outCount === 1 && inCount === 1) {
        middleNodes++;
      } else {
        return false;
      }
    }

    return (
      startNodes === 1 && endNodes === 1 && middleNodes === this.nodes.size - 2
    );
  }

  /**
   * Check if the graph is hierarchical (tree-like).
   * A tree: exactly one root (in-degree 0), all other nodes have exactly
   * one parent, and there are no cycles.
   */
  private isHierarchical(
    _outDegree: Map<string, number>,
    _inDegree: Map<string, number>,
  ): boolean {
    if (this.nodes.size < 3) return false;

    const inSources = new Map<string, Set<string>>();
    for (const node of this.nodes.values()) {
      inSources.set(node.id, new Set());
    }
    for (const edge of this.edges.values()) {
      inSources.get(edge.targetId)?.add(edge.sourceId);
    }

    let roots = 0;
    for (const nodeId of this.nodes.keys()) {
      const inCount = inSources.get(nodeId)?.size ?? 0;
      if (inCount === 0) {
        roots++;
      } else if (inCount > 1) {
        // Multiple parents means not a tree
        return false;
      }
    }

    // Exactly one root for a tree
    return roots === 1;
  }

  /**
   * Check if the graph is peer-to-peer (roughly equal edge distribution).
   * All nodes have similar total degree (within 50% of the mean).
   */
  private isPeerToPeer(
    outDegree: Map<string, number>,
    inDegree: Map<string, number>,
    _totalWeight: number,
  ): boolean {
    if (this.nodes.size < 3) return false;

    const degrees: number[] = [];
    for (const nodeId of this.nodes.keys()) {
      const total = (outDegree.get(nodeId) ?? 0) + (inDegree.get(nodeId) ?? 0);
      degrees.push(total);
    }

    const mean = degrees.reduce((a, b) => a + b, 0) / degrees.length;
    if (mean === 0) return false;

    // Check that all nodes are within 50% of the mean
    const withinRange = degrees.every((d) => Math.abs(d - mean) / mean <= 0.5);

    return withinRange;
  }

  /**
   * DFS to find the path with the longest total latency.
   */
  private dfsLongestPath(
    nodeId: string,
    currentPath: string[],
    currentLatency: number,
    visited: Set<string>,
    onPath: (path: string[], latency: number) => void,
  ): void {
    visited.add(nodeId);
    let hasOutgoing = false;

    for (const edge of this.edges.values()) {
      if (edge.sourceId === nodeId && !visited.has(edge.targetId)) {
        hasOutgoing = true;
        const edgeLatency = edge.latencyMs ?? 0;
        currentPath.push(edge.targetId);
        this.dfsLongestPath(
          edge.targetId,
          currentPath,
          currentLatency + edgeLatency,
          visited,
          onPath,
        );
        currentPath.pop();
      }
    }

    if (!hasOutgoing) {
      onPath(currentPath, currentLatency);
    }

    visited.delete(nodeId);
  }

  /**
   * DFS to find the path with the most hops (fallback when no latency data).
   */
  private dfsLongestHops(
    nodeId: string,
    currentPath: string[],
    visited: Set<string>,
    onPath: (path: string[]) => void,
  ): void {
    visited.add(nodeId);
    let hasOutgoing = false;

    for (const edge of this.edges.values()) {
      if (edge.sourceId === nodeId && !visited.has(edge.targetId)) {
        hasOutgoing = true;
        currentPath.push(edge.targetId);
        this.dfsLongestHops(edge.targetId, currentPath, visited, onPath);
        currentPath.pop();
      }
    }

    if (!hasOutgoing) {
      onPath(currentPath);
    }

    visited.delete(nodeId);
  }
}
