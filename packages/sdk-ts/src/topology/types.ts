/**
 * AgentOps SDK - Multi-Agent Topology Visualizer Types
 *
 * Type definitions for multi-agent topology tracking and visualization.
 */

// ============================================================================
// Node Types
// ============================================================================

/** Metrics tracked per node in the topology */
export interface NodeMetrics {
  /** Total messages sent by this node */
  messagesSent: number;

  /** Total messages received by this node */
  messagesReceived: number;

  /** Total tool calls made by this node */
  toolCalls: number;

  /** Total errors produced by this node */
  errors: number;

  /** Average response time in milliseconds */
  avgResponseMs: number;

  /** Total tokens consumed by this node */
  totalTokens: number;

  /** Total cost incurred by this node */
  totalCost: number;
}

/** A node in the topology graph representing an agent, tool, service, or user */
export interface TopologyNode {
  /** Unique identifier for this node */
  id: string;

  /** Type of entity this node represents */
  type: "agent" | "tool" | "service" | "user";

  /** Human-readable name */
  name: string;

  /** Optional metadata associated with this node */
  metadata?: Record<string, unknown>;

  /** Current status of this node */
  status: "active" | "idle" | "error" | "completed";

  /** Performance metrics for this node */
  metrics: NodeMetrics;
}

// ============================================================================
// Edge Types
// ============================================================================

/** An edge in the topology graph representing a connection between nodes */
export interface TopologyEdge {
  /** Unique identifier for this edge */
  id: string;

  /** ID of the source node */
  sourceId: string;

  /** ID of the target node */
  targetId: string;

  /** Type of interaction this edge represents */
  type: "message" | "delegation" | "tool_call" | "response" | "error";

  /** Optional label for the edge */
  label?: string;

  /** Number of interactions along this edge */
  weight: number;

  /** Average latency in milliseconds for this edge */
  latencyMs?: number;

  /** Optional metadata associated with this edge */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Graph Types
// ============================================================================

/** Metadata about the overall topology graph */
export interface GraphMetadata {
  /** Associated session ID */
  sessionId?: string;

  /** Associated trace ID */
  traceId?: string;

  /** When the graph was first created */
  startedAt: number;

  /** When the graph was last updated */
  updatedAt: number;

  /** Total messages across all edges */
  totalMessages: number;

  /** Total delegations across all edges */
  totalDelegations: number;

  /** Total errors across all nodes */
  totalErrors: number;
}

/** The complete topology graph */
export interface TopologyGraph {
  /** All nodes in the graph */
  nodes: TopologyNode[];

  /** All edges in the graph */
  edges: TopologyEdge[];

  /** Graph-level metadata */
  metadata: GraphMetadata;
}

// ============================================================================
// Snapshot & Replay Types
// ============================================================================

/** A point-in-time snapshot of the topology graph */
export interface TopologySnapshot {
  /** Unique identifier for this snapshot */
  id: string;

  /** Timestamp when the snapshot was taken */
  timestamp: number;

  /** The graph state at this point in time */
  graph: TopologyGraph;
}

/** An event emitted by the topology tracker */
export interface TopologyEvent {
  /** Type of topology event */
  type:
    | "node_added"
    | "node_updated"
    | "node_removed"
    | "edge_added"
    | "edge_updated"
    | "interaction";

  /** Event data payload */
  data: Record<string, unknown>;

  /** Timestamp when the event occurred */
  timestamp: number;
}

/** State for replaying topology snapshots */
export interface ReplayState {
  /** Current snapshot index */
  currentIndex: number;

  /** Total number of available snapshots */
  totalSnapshots: number;

  /** Whether replay is currently playing */
  playing: boolean;

  /** Playback speed multiplier */
  speed: number;

  /** The current snapshot being viewed, or null if none */
  currentSnapshot: TopologySnapshot | null;
}

// ============================================================================
// Analysis Types
// ============================================================================

/** A detected communication pattern in the topology */
export interface CommunicationPattern {
  /** Type of communication pattern */
  type:
    | "broadcast"
    | "sequential"
    | "hierarchical"
    | "peer_to_peer"
    | "hub_spoke";

  /** Confidence score for this detection (0-1) */
  confidence: number;

  /** Human-readable description of the pattern */
  description: string;
}

/** A detected bottleneck in the topology */
export interface BottleneckAnalysis {
  /** ID of the bottleneck node */
  nodeId: string;

  /** Name of the bottleneck node */
  nodeName: string;

  /** Type of bottleneck */
  type: "throughput" | "latency" | "error_rate";

  /** Severity of the bottleneck */
  severity: "low" | "medium" | "high" | "critical";

  /** The metric value that triggered the bottleneck detection */
  metric: number;

  /** The threshold that was exceeded */
  threshold: number;

  /** Recommended action to address the bottleneck */
  recommendation: string;
}

// ============================================================================
// Configuration
// ============================================================================

/** Configuration for the topology tracker */
export interface TopologyConfig {
  /** Whether to track message interactions */
  trackMessages: boolean;

  /** Whether to track delegation interactions */
  trackDelegations: boolean;

  /** Whether to track tool call interactions */
  trackToolCalls: boolean;

  /** Interval in milliseconds for automatic snapshots */
  snapshotInterval?: number;

  /** Maximum number of snapshots to retain */
  maxSnapshots?: number;

  /** Whether to run pattern analysis automatically */
  analyzePatterns?: boolean;
}
