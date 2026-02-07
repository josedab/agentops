/**
 * AgentOps SDK - Agent Framework Auto-Instrumentor Types
 *
 * Type definitions for framework-specific auto-instrumentation.
 * Supports CrewAI, LangGraph, OpenAI Agents, AutoGen, LlamaIndex, and more.
 *
 * @packageDocumentation
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for a framework instrumentor.
 */
export interface InstrumentorConfig {
  /** Whether the instrumentor is enabled */
  enabled: boolean;

  /** Whether to capture input data sent to the framework */
  captureInputs: boolean;

  /** Whether to capture output data returned by the framework */
  captureOutputs: boolean;

  /** Whether to capture internal steps (e.g., intermediate agent reasoning) */
  captureInternalSteps: boolean;

  /** Maximum content length before truncation (in characters) */
  maxContentLength?: number;

  /** Additional metadata to attach to all captured events */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Framework Detection
// ============================================================================

/**
 * Information about a detected agent framework.
 */
export interface FrameworkInfo {
  /** Framework name identifier (e.g., 'crewai', 'langgraph') */
  name: string;

  /** Detected framework version, if available */
  version?: string;

  /** Whether the framework was detected in the environment */
  detected: boolean;
}

// ============================================================================
// Instrumentor Status
// ============================================================================

/**
 * Runtime status of an instrumentor instance.
 */
export interface InstrumentorStatus {
  /** Information about the instrumented framework */
  framework: FrameworkInfo;

  /** Whether the instrumentor is currently active */
  active: boolean;

  /** Number of events captured since activation */
  eventsCaptured: number;

  /** Number of errors encountered during instrumentation */
  errors: number;

  /** Timestamp when the instrumentor was started */
  startedAt?: number;
}

// ============================================================================
// Instrumented Calls
// ============================================================================

/**
 * Represents a single instrumented call to a framework method.
 */
export interface InstrumentedCall {
  /** Unique identifier for this call */
  callId: string;

  /** Framework that produced this call */
  framework: string;

  /** Operation name (e.g., 'kickoff', 'invoke', 'run', 'query') */
  operation: string;

  /** Timestamp when the call started */
  startTime: number;

  /** Timestamp when the call completed */
  endTime?: number;

  /** Input data passed to the operation */
  input?: unknown;

  /** Output data returned by the operation */
  output?: unknown;

  /** Current status of the call */
  status: "pending" | "success" | "error";

  /** Error information if the call failed */
  error?: unknown;

  /** Additional metadata attached to this call */
  metadata?: Record<string, unknown>;

  /** Parent call ID for nested/delegated operations */
  parentCallId?: string;
}

// ============================================================================
// Agent Steps & Tool Calls
// ============================================================================

/**
 * Represents a single step within an agent's execution.
 */
export interface AgentStep {
  /** Unique identifier for this step */
  stepId: string;

  /** Name of the agent performing this step */
  agentName: string;

  /** Action being performed (e.g., 'think', 'act', 'delegate') */
  action: string;

  /** Input to this step */
  input?: unknown;

  /** Output from this step */
  output?: unknown;

  /** Tool calls made during this step */
  toolCalls: ToolCallRecord[];

  /** Duration of the step in milliseconds */
  durationMs: number;

  /** Status of the step */
  status: "pending" | "success" | "error";
}

/**
 * Record of a single tool invocation within an agent step.
 */
export interface ToolCallRecord {
  /** Name of the tool that was called */
  name: string;

  /** Input passed to the tool */
  input: unknown;

  /** Output returned by the tool */
  output: unknown;

  /** Duration of the tool call in milliseconds */
  durationMs: number;

  /** Status of the tool call */
  status: "pending" | "success" | "error";
}

// ============================================================================
// Framework Events
// ============================================================================

/**
 * Event emitted by an instrumentor during framework execution.
 */
export interface FrameworkEvent {
  /** Type of framework event */
  type:
    | "agent_start"
    | "agent_step"
    | "agent_end"
    | "tool_call"
    | "tool_result"
    | "delegation"
    | "error";

  /** Framework that produced this event */
  framework: string;

  /** Event-specific data payload */
  data: Record<string, unknown>;

  /** Timestamp when the event occurred */
  timestamp: number;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Callback hooks for instrumentor event handling.
 */
export interface InstrumentorHooks {
  /** Called when a framework event is emitted */
  onEvent?: (event: FrameworkEvent) => void;

  /** Called when an error occurs during instrumentation */
  onError?: (error: Error) => void;
}
