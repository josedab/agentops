/**
 * AgentOps SDK - MCP Tool Observability Types
 *
 * Type definitions for Model Context Protocol (MCP) tool observability,
 * including server registration, tool discovery, execution tracking,
 * health monitoring, and metrics collection.
 */

// ============================================================================
// Server & Tool Schema Types
// ============================================================================

/**
 * Information about a registered MCP server.
 */
export interface MCPServerInfo {
  /** Server display name */
  name: string;

  /** Server version string */
  version: string;

  /** Server capabilities (e.g., tool listing, resource access) */
  capabilities: string[];

  /** Server connection URL */
  url: string;
}

/**
 * Schema definition for an MCP tool.
 */
export interface MCPToolSchema {
  /** Tool name as exposed by the MCP server */
  name: string;

  /** Human-readable description of the tool */
  description: string;

  /** JSON Schema object describing the tool's input parameters */
  inputSchema: Record<string, unknown>;

  /** Name of the server that provides this tool */
  serverName: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event emitted when tools are discovered from an MCP server.
 */
export interface MCPToolDiscoveryEvent {
  /** Timestamp of the discovery event (ms since epoch) */
  timestamp: number;

  /** Server from which tools were discovered */
  server: MCPServerInfo;

  /** List of tools discovered */
  tools: MCPToolSchema[];
}

/**
 * Event emitted when a tool execution completes.
 */
export interface MCPToolExecutionEvent {
  /** Name of the executed tool */
  toolName: string;

  /** Name of the server that provided the tool */
  serverName: string;

  /** Input payload sent to the tool */
  input: unknown;

  /** Output returned by the tool */
  output: unknown;

  /** Execution status */
  status: "success" | "error";

  /** Duration of the execution in milliseconds */
  durationMs: number;

  /** Error message if status is 'error' */
  error?: string;
}

// ============================================================================
// Health & Metrics Types
// ============================================================================

/**
 * Health status for a registered MCP server.
 */
export interface MCPServerHealthStatus {
  /** Server name */
  serverName: string;

  /** Current health status */
  status: "healthy" | "degraded" | "unreachable";

  /** Latest measured latency in milliseconds */
  latencyMs: number;

  /** Timestamp of the last health check (ms since epoch) */
  lastChecked: number;

  /** Error rate as a fraction (0-1) */
  errorRate: number;

  /** Success rate as a fraction (0-1) */
  successRate: number;
}

/**
 * Aggregated metrics for a single MCP tool.
 */
export interface MCPToolMetrics {
  /** Tool name */
  toolName: string;

  /** Server that provides the tool */
  serverName: string;

  /** Total number of invocations */
  invocationCount: number;

  /** Number of successful invocations */
  successCount: number;

  /** Number of failed invocations */
  errorCount: number;

  /** Average execution duration in milliseconds */
  avgDurationMs: number;

  /** 50th percentile (median) execution duration */
  p50DurationMs: number;

  /** 95th percentile execution duration */
  p95DurationMs: number;

  /** 99th percentile execution duration */
  p99DurationMs: number;

  /** Timestamp of the last invocation (ms since epoch) */
  lastInvoked: number;
}

/**
 * Aggregated metrics for an MCP server, including per-tool breakdowns.
 */
export interface MCPServerMetrics {
  /** Server name */
  serverName: string;

  /** Number of tools registered on this server */
  toolCount: number;

  /** Total invocations across all tools on this server */
  totalInvocations: number;

  /** Current health status of the server */
  healthStatus: MCPServerHealthStatus;

  /** Per-tool metrics for all tools on this server */
  tools: MCPToolMetrics[];
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for MCP observability features.
 */
export interface MCPObservabilityConfig {
  /** Enable MCP observability */
  enabled: boolean;

  /** Track tool discovery events */
  trackDiscovery: boolean;

  /** Track tool execution events */
  trackExecution: boolean;

  /** Track server health status */
  trackHealth: boolean;

  /** Health check interval in milliseconds */
  healthCheckInterval?: number;

  /** How long to retain metrics data in milliseconds */
  metricsRetention?: number;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Result of validating tool input against its JSON Schema.
 */
export interface MCPSchemaValidationResult {
  /** Whether the input is valid according to the schema */
  valid: boolean;

  /** List of validation errors */
  errors: string[];

  /** List of validation warnings */
  warnings: string[];
}
