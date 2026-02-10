/**
 * AgentOps SDK - Agent Performance Profiler Types
 *
 * Type definitions for agent performance profiling and optimization.
 */

// ============================================================================
// Profile Node Types
// ============================================================================

export type ProfileNodeType =
  | "session"
  | "llm_call"
  | "tool_call"
  | "prompt"
  | "response"
  | "error"
  | "custom";

export interface ProfileNode {
  /** Unique node identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Type of profile node */
  type: ProfileNodeType;

  /** Parent node ID (null for root) */
  parentId: string | null;

  /** Child node IDs */
  children: string[];

  /** Start timestamp (ms) */
  startTime: number;

  /** End timestamp (ms), null if still running */
  endTime: number | null;

  /** Total duration in milliseconds */
  durationMs: number;

  /** Duration minus children's durations */
  selfDurationMs: number;

  /** Token usage */
  tokens: { prompt: number; completion: number; total: number };

  /** Cost in USD */
  cost: number;

  /** Model used (if applicable) */
  model: string | null;

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** Depth in the call tree */
  depth: number;
}

// ============================================================================
// Profile Session
// ============================================================================

export interface ProfileSession {
  /** Unique profile identifier */
  id: string;

  /** Associated session ID */
  sessionId: string;

  /** Root node ID */
  rootNodeId: string;

  /** All nodes by ID */
  nodes: Map<string, ProfileNode>;

  /** Profile start timestamp */
  startTime: number;

  /** Profile end timestamp */
  endTime: number | null;

  /** Total duration in milliseconds */
  totalDurationMs: number;

  /** Total tokens across all nodes */
  totalTokens: number;

  /** Total cost across all nodes in USD */
  totalCost: number;

  /** Total number of nodes */
  totalNodes: number;
}

// ============================================================================
// Flame Graph Types
// ============================================================================

export interface FlameGraphEntry {
  /** Node identifier */
  id: string;

  /** Node name */
  name: string;

  /** Node type */
  type: ProfileNodeType;

  /** Measured metric value */
  value: number;

  /** Child entries */
  children: FlameGraphEntry[];

  /** Depth in the tree */
  depth: number;

  /** Percentage of total value */
  percentage: number;
}

export interface FlameGraphData {
  /** Root entry */
  root: FlameGraphEntry;

  /** Metric used for values */
  metric: "duration" | "tokens" | "cost";

  /** Total value across all nodes */
  totalValue: number;

  /** Maximum depth in the tree */
  maxDepth: number;
}

// ============================================================================
// Bottleneck & Optimization Types
// ============================================================================

export interface Bottleneck {
  /** Node ID of the bottleneck */
  nodeId: string;

  /** Node name */
  nodeName: string;

  /** Node type */
  type: ProfileNodeType;

  /** Metric in which bottleneck was detected */
  metric: "duration" | "tokens" | "cost";

  /** Metric value */
  value: number;

  /** Percentage of total */
  percentage: number;

  /** Severity level */
  severity: "critical" | "high" | "medium" | "low";

  /** Actionable suggestion */
  suggestion: string;
}

export interface OptimizationRecommendation {
  /** Unique recommendation ID */
  id: string;

  /** Recommendation type */
  type:
    | "model_downgrade"
    | "reduce_context"
    | "cache_response"
    | "batch_calls"
    | "remove_redundant"
    | "parallelize";

  /** Short title */
  title: string;

  /** Detailed description */
  description: string;

  /** Estimated savings */
  estimatedSavings: { cost?: number; tokens?: number; latencyMs?: number };

  /** Impact score (0-1) */
  impactScore: number;

  /** IDs of affected nodes */
  affectedNodes: string[];
}

// ============================================================================
// Profiler Configuration
// ============================================================================

export interface ProfilerConfig {
  /** Enable profiling */
  enabled: boolean;

  /** Sampling rate (0-1, default 1.0) */
  samplingRate?: number;

  /** Maximum call tree depth (default 50) */
  maxDepth?: number;

  /** Track token usage (default true) */
  trackTokens?: boolean;

  /** Track cost (default true) */
  trackCost?: boolean;

  /** Track latency (default true) */
  trackLatency?: boolean;

  /** Enable debug logging */
  debug?: boolean;
}

export interface ResolvedProfilerConfig {
  enabled: boolean;
  samplingRate: number;
  maxDepth: number;
  trackTokens: boolean;
  trackCost: boolean;
  trackLatency: boolean;
  debug: boolean;
}

// ============================================================================
// Profiler Metrics
// ============================================================================

export interface ProfilerMetrics {
  /** Total profiles completed */
  totalProfiles: number;

  /** Average duration across profiles */
  avgDurationMs: number;

  /** Average tokens across profiles */
  avgTokens: number;

  /** Average cost across profiles */
  avgCost: number;

  /** Total optimizations found */
  totalOptimizationsFound: number;

  /** Total bottlenecks found */
  totalBottlenecksFound: number;
}
