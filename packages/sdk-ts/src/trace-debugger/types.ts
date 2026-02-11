/**
 * AgentOps SDK - Streaming Trace Debugger Types
 *
 * Type definitions for the trace debugger module.
 */

import type { EventType } from "../types.js";

// ============================================================================
// Configuration
// ============================================================================

export interface DebuggerConfig {
  /** Enable the debugger */
  enabled: boolean;

  /** Maximum number of state snapshots to keep */
  maxSnapshots: number;

  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Debugger State
// ============================================================================

export interface DebuggerState {
  /** Current debugger status */
  status: "idle" | "playing" | "paused" | "stepping";

  /** Current step index */
  currentStepIndex: number;

  /** Total number of steps */
  totalSteps: number;

  /** Session being debugged */
  sessionId: string | null;

  /** Active breakpoints */
  breakpoints: Breakpoint[];
}

// ============================================================================
// Debug Steps & Snapshots
// ============================================================================

export interface DebugStep {
  /** Step index in the sequence */
  index: number;

  /** Original event ID */
  eventId: string;

  /** Event type */
  eventType: EventType;

  /** Event timestamp */
  timestamp: number;

  /** State snapshot at this step */
  snapshot: StateSnapshot;

  /** Parent event ID (for nested events) */
  parentEventId?: string;

  /** Event content */
  content: string;

  /** Model used */
  model?: string;

  /** Duration in milliseconds */
  durationMs?: number;

  /** Cost of this step */
  cost?: number;
}

export interface StateSnapshot {
  /** Step index this snapshot belongs to */
  stepIndex: number;

  /** Session ID */
  sessionId: string;

  /** Cumulative tokens used up to this step */
  cumulativeTokens: number;

  /** Cumulative cost up to this step */
  cumulativeCost: number;

  /** Cumulative errors up to this step */
  cumulativeErrors: number;

  /** Models actively used */
  activeModels: string[];

  /** Context window size estimate */
  contextSize: number;

  /** Stack of active tool calls */
  toolCallStack: string[];

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** Timestamp when snapshot was captured */
  capturedAt: number;
}

// ============================================================================
// Breakpoints
// ============================================================================

export interface Breakpoint {
  /** Unique breakpoint identifier */
  id: string;

  /** Breakpoint type */
  type:
    | "on_error"
    | "on_cost_threshold"
    | "on_pattern_match"
    | "on_tool_call"
    | "on_step_index"
    | "on_model_change";

  /** Condition value (depends on type) */
  condition: unknown;

  /** Whether breakpoint is active */
  enabled: boolean;

  /** Number of times this breakpoint has been hit */
  hitCount: number;
}

export interface BreakpointHit {
  /** The breakpoint that was triggered */
  breakpoint: Breakpoint;

  /** The step that triggered it */
  step: DebugStep;

  /** Human-readable reason */
  reason: string;
}

// ============================================================================
// Step Diffing
// ============================================================================

export interface StepDiff {
  /** Source step index */
  fromStep: number;

  /** Target step index */
  toStep: number;

  /** List of changes between steps */
  changes: { field: string; before: unknown; after: unknown }[];
}

// ============================================================================
// Rerun
// ============================================================================

export interface RerunConfig {
  /** Step index to rerun from */
  fromStepIndex: number;

  /** Modified context for the rerun */
  modifiedContext: Record<string, unknown>;

  /** Optional modified prompt */
  modifiedPrompt?: string;
}

export interface RerunResult {
  /** Steps from the original run */
  originalSteps: DebugStep[];

  /** Steps from the rerun */
  rerunSteps: DebugStep[];

  /** Index where results diverged (null if identical) */
  divergencePoint: number | null;

  /** Diffs between original and rerun steps */
  diffs: StepDiff[];
}

// ============================================================================
// Metrics
// ============================================================================

export interface DebuggerMetrics {
  /** Number of sessions debugged */
  sessionsDebugged: number;

  /** Total step-throughs performed */
  totalStepsThroughs: number;

  /** Total breakpoints hit */
  breakpointsHit: number;

  /** Total reruns executed */
  rerunsExecuted: number;

  /** Average steps per session */
  avgStepsPerSession: number;
}
