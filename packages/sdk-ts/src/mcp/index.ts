/**
 * AgentOps SDK - MCP Tool Observability Module
 *
 * Provides comprehensive observability for Model Context Protocol (MCP) tools,
 * including server registration, tool discovery tracking, execution monitoring,
 * health checks, schema validation, and metrics aggregation.
 */

import { nanoid } from "nanoid";
import type {
  MCPServerInfo,
  MCPToolSchema,
  MCPToolDiscoveryEvent,
  MCPToolExecutionEvent,
  MCPServerHealthStatus,
  MCPToolMetrics,
  MCPServerMetrics,
  MCPObservabilityConfig,
  MCPSchemaValidationResult,
} from "./types.js";

// Re-export all types
export type {
  MCPServerInfo,
  MCPToolSchema,
  MCPToolDiscoveryEvent,
  MCPToolExecutionEvent,
  MCPServerHealthStatus,
  MCPToolMetrics,
  MCPServerMetrics,
  MCPObservabilityConfig,
  MCPSchemaValidationResult,
} from "./types.js";

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Tracks an in-flight tool execution before it completes.
 */
interface PendingExecution {
  /** Unique execution identifier */
  executionId: string;

  /** Name of the server hosting the tool */
  serverName: string;

  /** Name of the tool being executed */
  toolName: string;

  /** Input sent to the tool */
  input: unknown;

  /** High-resolution start time (ms since epoch) */
  startTime: number;
}

/**
 * Internal record of a completed tool execution, used for metrics computation.
 */
interface ExecutionRecord {
  /** Name of the server hosting the tool */
  serverName: string;

  /** Name of the executed tool */
  toolName: string;

  /** Execution status */
  status: "success" | "error";

  /** Duration in milliseconds */
  durationMs: number;

  /** Timestamp when the execution completed */
  timestamp: number;
}

/**
 * Internal record of a single health check result.
 */
interface HealthCheckRecord {
  /** Latency in milliseconds */
  latencyMs: number;

  /** Whether the check was successful */
  success: boolean;

  /** Timestamp of the health check */
  timestamp: number;
}

// ============================================================================
// MCPObserver
// ============================================================================

/**
 * Observer for MCP tool operations.
 *
 * Provides a centralized hub for registering MCP servers, tracking tool
 * discovery and execution, validating inputs against tool schemas, monitoring
 * server health, and computing aggregated metrics.
 *
 * @example
 * ```typescript
 * const observer = new MCPObserver({
 *   enabled: true,
 *   trackDiscovery: true,
 *   trackExecution: true,
 *   trackHealth: true,
 * });
 *
 * // Register a server
 * observer.registerServer({
 *   name: 'weather-server',
 *   version: '1.0.0',
 *   capabilities: ['tools'],
 *   url: 'http://localhost:3001',
 * });
 *
 * // Record tool discovery
 * observer.recordToolDiscovery('weather-server', [
 *   { name: 'getWeather', description: 'Get weather data', inputSchema: {}, serverName: 'weather-server' },
 * ]);
 *
 * // Track an execution
 * const exec = observer.startToolExecution('weather-server', 'getWeather', { city: 'NYC' });
 * const event = observer.endToolExecution(exec.executionId, { output: { temp: 72 }, status: 'success' });
 *
 * // Query metrics
 * const metrics = observer.getToolMetrics('weather-server');
 * ```
 */
export class MCPObserver {
  /** Observability configuration */
  private readonly config: MCPObservabilityConfig;

  /** Registered servers keyed by server name */
  private readonly servers: Map<string, MCPServerInfo> = new Map();

  /** Discovered tools keyed by server name */
  private readonly discoveredTools: Map<string, MCPToolSchema[]> = new Map();

  /** Discovery events in chronological order */
  private readonly discoveryEvents: MCPToolDiscoveryEvent[] = [];

  /** In-flight executions keyed by execution ID */
  private readonly pendingExecutions: Map<string, PendingExecution> = new Map();

  /** Completed execution records for metrics computation */
  private readonly executionRecords: ExecutionRecord[] = [];

  /** Health check records keyed by server name */
  private readonly healthRecords: Map<string, HealthCheckRecord[]> = new Map();

  /** Duration arrays keyed by `serverName:toolName` for percentile computation */
  private readonly durationsByTool: Map<string, number[]> = new Map();

  constructor(config: MCPObservabilityConfig) {
    this.config = config;
  }

  // ==========================================================================
  // Server Registration
  // ==========================================================================

  /**
   * Register an MCP server for observability tracking.
   *
   * @param server - Server info to register
   */
  registerServer(server: MCPServerInfo): void {
    this.servers.set(server.name, server);
  }

  /**
   * Unregister an MCP server, removing all associated tracking data.
   *
   * @param serverName - Name of the server to unregister
   */
  unregisterServer(serverName: string): void {
    this.servers.delete(serverName);
    this.discoveredTools.delete(serverName);
    this.healthRecords.delete(serverName);

    // Remove execution records for this server
    for (let i = this.executionRecords.length - 1; i >= 0; i--) {
      if (this.executionRecords[i].serverName === serverName) {
        this.executionRecords.splice(i, 1);
      }
    }

    // Remove duration entries for tools on this server
    for (const key of this.durationsByTool.keys()) {
      if (key.startsWith(`${serverName}:`)) {
        this.durationsByTool.delete(key);
      }
    }

    // Remove pending executions for this server
    for (const [id, pending] of this.pendingExecutions.entries()) {
      if (pending.serverName === serverName) {
        this.pendingExecutions.delete(id);
      }
    }
  }

  /**
   * Get all currently registered servers.
   *
   * @returns Array of registered server info objects
   */
  getRegisteredServers(): MCPServerInfo[] {
    return Array.from(this.servers.values());
  }

  // ==========================================================================
  // Tool Discovery Tracking
  // ==========================================================================

  /**
   * Record a tool discovery event from an MCP server.
   *
   * @param serverName - Name of the server where tools were discovered
   * @param tools - Array of tool schemas that were discovered
   * @returns The recorded discovery event
   * @throws Error if the server is not registered
   */
  recordToolDiscovery(
    serverName: string,
    tools: MCPToolSchema[],
  ): MCPToolDiscoveryEvent {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(
        `Server "${serverName}" is not registered. Call registerServer() first.`,
      );
    }

    // Store discovered tools for this server
    this.discoveredTools.set(serverName, tools);

    const event: MCPToolDiscoveryEvent = {
      timestamp: Date.now(),
      server,
      tools,
    };

    if (this.config.trackDiscovery) {
      this.discoveryEvents.push(event);
    }

    return event;
  }

  /**
   * Get all discovered tools, optionally filtered by server name.
   *
   * @param serverName - Optional server name to filter by
   * @returns Array of discovered tool schemas
   */
  getDiscoveredTools(serverName?: string): MCPToolSchema[] {
    if (serverName) {
      return this.discoveredTools.get(serverName) ?? [];
    }

    const allTools: MCPToolSchema[] = [];
    for (const tools of this.discoveredTools.values()) {
      allTools.push(...tools);
    }
    return allTools;
  }

  // ==========================================================================
  // Tool Execution Tracking
  // ==========================================================================

  /**
   * Start tracking a tool execution.
   *
   * Call this before invoking the tool, then call {@link endToolExecution}
   * when the execution completes.
   *
   * @param serverName - Name of the server hosting the tool
   * @param toolName - Name of the tool being executed
   * @param input - Input payload for the tool
   * @returns An object containing the execution ID and start time
   */
  startToolExecution(
    serverName: string,
    toolName: string,
    input: unknown,
  ): { executionId: string; startTime: number } {
    const executionId = `mcp_exec_${nanoid(21)}`;
    const startTime = Date.now();

    this.pendingExecutions.set(executionId, {
      executionId,
      serverName,
      toolName,
      input,
      startTime,
    });

    return { executionId, startTime };
  }

  /**
   * Complete a tracked tool execution and record the result.
   *
   * @param executionId - The execution ID returned by {@link startToolExecution}
   * @param result - The execution result including output, status, and optional error
   * @returns The recorded execution event
   * @throws Error if the execution ID is not found
   */
  endToolExecution(
    executionId: string,
    result: { output?: unknown; status: "success" | "error"; error?: string },
  ): MCPToolExecutionEvent {
    const pending = this.pendingExecutions.get(executionId);
    if (!pending) {
      throw new Error(
        `Execution "${executionId}" not found. It may have already been completed or was never started.`,
      );
    }

    this.pendingExecutions.delete(executionId);

    const durationMs = Date.now() - pending.startTime;

    const event: MCPToolExecutionEvent = {
      toolName: pending.toolName,
      serverName: pending.serverName,
      input: pending.input,
      output: result.output,
      status: result.status,
      durationMs,
      error: result.error,
    };

    if (this.config.trackExecution) {
      // Store execution record for metrics
      this.executionRecords.push({
        serverName: pending.serverName,
        toolName: pending.toolName,
        status: result.status,
        durationMs,
        timestamp: Date.now(),
      });

      // Store duration for percentile calculations
      const toolKey = `${pending.serverName}:${pending.toolName}`;
      let durations = this.durationsByTool.get(toolKey);
      if (!durations) {
        durations = [];
        this.durationsByTool.set(toolKey, durations);
      }
      durations.push(durationMs);
    }

    return event;
  }

  // ==========================================================================
  // Schema Validation
  // ==========================================================================

  /**
   * Validate tool input against the tool's registered JSON Schema.
   *
   * Performs lightweight structural validation checking required properties
   * and types defined in the schema. This is not a full JSON Schema validator
   * but covers the most common validation scenarios.
   *
   * @param serverName - Name of the server hosting the tool
   * @param toolName - Name of the tool to validate input for
   * @param input - The input payload to validate
   * @returns Validation result with errors and warnings
   */
  validateToolInput(
    serverName: string,
    toolName: string,
    input: unknown,
  ): MCPSchemaValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Find the tool schema
    const tools = this.discoveredTools.get(serverName);
    if (!tools) {
      errors.push(`Server "${serverName}" has no discovered tools.`);
      return { valid: false, errors, warnings };
    }

    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      errors.push(`Tool "${toolName}" not found on server "${serverName}".`);
      return { valid: false, errors, warnings };
    }

    const schema = tool.inputSchema;

    // If the schema is empty, accept any input with a warning
    if (Object.keys(schema).length === 0) {
      warnings.push("Tool has an empty input schema; skipping validation.");
      return { valid: true, errors, warnings };
    }

    // Check that input is an object when schema expects object type
    const schemaType = schema["type"] as string | undefined;
    if (schemaType === "object") {
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        errors.push(`Expected input to be an object, got ${typeof input}.`);
        return { valid: false, errors, warnings };
      }

      // Check required properties
      const required = schema["required"] as string[] | undefined;
      if (required && Array.isArray(required)) {
        const inputObj = input as Record<string, unknown>;
        for (const prop of required) {
          if (!(prop in inputObj)) {
            errors.push(`Missing required property: "${prop}".`);
          }
        }
      }

      // Check property types if schema defines them
      const properties = schema["properties"] as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (properties && typeof input === "object" && input !== null) {
        const inputObj = input as Record<string, unknown>;
        for (const [propName, propSchema] of Object.entries(properties)) {
          if (propName in inputObj) {
            const expectedType = propSchema["type"] as string | undefined;
            if (expectedType) {
              const actualType = Array.isArray(inputObj[propName])
                ? "array"
                : typeof inputObj[propName];
              if (actualType !== expectedType) {
                errors.push(
                  `Property "${propName}" expected type "${expectedType}", got "${actualType}".`,
                );
              }
            }
          }
        }

        // Warn about additional properties not in schema
        for (const propName of Object.keys(inputObj)) {
          if (!(propName in properties)) {
            warnings.push(
              `Property "${propName}" is not defined in the tool schema.`,
            );
          }
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  /**
   * Get tool-level metrics, optionally filtered by server and/or tool name.
   *
   * @param serverName - Optional server name to filter by
   * @param toolName - Optional tool name to filter by
   * @returns Array of tool metrics
   */
  getToolMetrics(serverName?: string, toolName?: string): MCPToolMetrics[] {
    // Build a map of unique tool keys to their records
    const toolRecords = new Map<string, ExecutionRecord[]>();

    for (const record of this.executionRecords) {
      if (serverName && record.serverName !== serverName) continue;
      if (toolName && record.toolName !== toolName) continue;

      const key = `${record.serverName}:${record.toolName}`;
      let records = toolRecords.get(key);
      if (!records) {
        records = [];
        toolRecords.set(key, records);
      }
      records.push(record);
    }

    const metrics: MCPToolMetrics[] = [];

    for (const [key, records] of toolRecords.entries()) {
      const [sName, tName] = key.split(":");
      const durations = this.durationsByTool.get(key) ?? [];
      const sortedDurations = [...durations].sort((a, b) => a - b);

      const successCount = records.filter((r) => r.status === "success").length;
      const errorCount = records.filter((r) => r.status === "error").length;
      const totalDuration = durations.reduce((sum, d) => sum + d, 0);
      const lastRecord = records[records.length - 1];

      metrics.push({
        toolName: tName,
        serverName: sName,
        invocationCount: records.length,
        successCount,
        errorCount,
        avgDurationMs:
          durations.length > 0 ? totalDuration / durations.length : 0,
        p50DurationMs: this.calculatePercentile(sortedDurations, 50),
        p95DurationMs: this.calculatePercentile(sortedDurations, 95),
        p99DurationMs: this.calculatePercentile(sortedDurations, 99),
        lastInvoked: lastRecord ? lastRecord.timestamp : 0,
      });
    }

    return metrics;
  }

  /**
   * Get server-level metrics, optionally filtered by server name.
   *
   * @param serverName - Optional server name to filter by
   * @returns Array of server metrics
   */
  getServerMetrics(serverName?: string): MCPServerMetrics[] {
    const servers = serverName
      ? ([this.servers.get(serverName)].filter(Boolean) as MCPServerInfo[])
      : Array.from(this.servers.values());

    return servers.map((server) => {
      const toolMetrics = this.getToolMetrics(server.name);
      const tools = this.discoveredTools.get(server.name) ?? [];
      const totalInvocations = toolMetrics.reduce(
        (sum, t) => sum + t.invocationCount,
        0,
      );
      const healthStatus = this.getServerHealth(server.name);

      return {
        serverName: server.name,
        toolCount: tools.length,
        totalInvocations,
        healthStatus,
        tools: toolMetrics,
      };
    });
  }

  /**
   * Get the current health status for a registered server.
   *
   * Health status is determined by the recent health check history:
   * - "healthy": error rate <= 5%
   * - "degraded": error rate > 5% and <= 50%
   * - "unreachable": error rate > 50% or no health checks recorded
   *
   * @param serverName - Name of the server
   * @returns Current health status
   */
  getServerHealth(serverName: string): MCPServerHealthStatus {
    const records = this.healthRecords.get(serverName) ?? [];

    if (records.length === 0) {
      return {
        serverName,
        status: "unreachable",
        latencyMs: 0,
        lastChecked: 0,
        errorRate: 1,
        successRate: 0,
      };
    }

    const lastRecord = records[records.length - 1];
    const totalChecks = records.length;
    const successChecks = records.filter((r) => r.success).length;
    const errorRate = (totalChecks - successChecks) / totalChecks;
    const successRate = successChecks / totalChecks;

    let status: "healthy" | "degraded" | "unreachable";
    if (errorRate > 0.5) {
      status = "unreachable";
    } else if (errorRate > 0.05) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    return {
      serverName,
      status,
      latencyMs: lastRecord.latencyMs,
      lastChecked: lastRecord.timestamp,
      errorRate,
      successRate,
    };
  }

  // ==========================================================================
  // Health Monitoring
  // ==========================================================================

  /**
   * Record a health check result for a server.
   *
   * @param serverName - Name of the server
   * @param latencyMs - Measured latency in milliseconds
   * @param success - Whether the health check succeeded
   */
  recordHealthCheck(
    serverName: string,
    latencyMs: number,
    success: boolean,
  ): void {
    if (!this.config.trackHealth) return;

    let records = this.healthRecords.get(serverName);
    if (!records) {
      records = [];
      this.healthRecords.set(serverName, records);
    }

    records.push({
      latencyMs,
      success,
      timestamp: Date.now(),
    });

    // Trim old records based on retention config
    if (this.config.metricsRetention) {
      const cutoff = Date.now() - this.config.metricsRetention;
      while (records.length > 0 && records[0].timestamp < cutoff) {
        records.shift();
      }
    }
  }

  // ==========================================================================
  // Percentile Calculations (Internal)
  // ==========================================================================

  /**
   * Calculate a percentile value from a sorted array of numbers.
   *
   * Uses linear interpolation between adjacent values when the percentile
   * index falls between two data points.
   *
   * @param values - Sorted array of numeric values
   * @param percentile - Percentile to calculate (0-100)
   * @returns The calculated percentile value
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];

    const index = (percentile / 100) * (values.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) return values[lower];

    // Linear interpolation
    return values[lower] + (values[upper] - values[lower]) * (index - lower);
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Reset all internal state, clearing servers, tools, executions,
   * health records, and metrics.
   */
  reset(): void {
    this.servers.clear();
    this.discoveredTools.clear();
    this.discoveryEvents.length = 0;
    this.pendingExecutions.clear();
    this.executionRecords.length = 0;
    this.healthRecords.clear();
    this.durationsByTool.clear();
  }
}
