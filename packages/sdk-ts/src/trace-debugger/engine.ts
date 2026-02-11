/**
 * AgentOps SDK - Trace Debugger Engine
 *
 * Step-through debugger for agent traces with breakpoints, snapshots, and rerun.
 */

import type {
  AgentEvent,
  ResponseEvent,
  ToolCallEvent,
  ErrorEvent,
} from "../types.js";
import type {
  DebuggerConfig,
  DebuggerState,
  DebugStep,
  StateSnapshot,
  Breakpoint,
  BreakpointHit,
  StepDiff,
  RerunConfig,
  RerunResult,
  DebuggerMetrics,
} from "./types.js";
import { generateEventId } from "../utils.js";

export class TraceDebuggerEngine {
  private config: DebuggerConfig;
  private steps: DebugStep[] = [];
  private snapshots: StateSnapshot[] = [];
  private breakpoints: Breakpoint[] = [];
  private state: DebuggerState;
  private metrics: DebuggerMetrics;
  private previousModel: string | null = null;

  constructor(config: DebuggerConfig) {
    this.config = config;
    this.state = {
      status: "idle",
      currentStepIndex: -1,
      totalSteps: 0,
      sessionId: null,
      breakpoints: this.breakpoints,
    };
    this.metrics = {
      sessionsDebugged: 0,
      totalStepsThroughs: 0,
      breakpointsHit: 0,
      rerunsExecuted: 0,
      avgStepsPerSession: 0,
    };
  }

  /**
   * Load session events into the debugger, creating steps and snapshots.
   */
  loadSession(events: AgentEvent[]): void {
    this.steps = [];
    this.snapshots = [];
    this.previousModel = null;

    let cumulativeTokens = 0;
    const cumulativeCost = 0;
    let cumulativeErrors = 0;
    let contextSize = 0;
    const activeModels: Set<string> = new Set();
    const toolCallStack: string[] = [];
    const sessionId = events.length > 0 ? events[0].sessionId : "";

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      let content = "";
      let model: string | undefined;
      let durationMs: number | undefined;
      let cost: number | undefined;

      switch (event.type) {
        case "prompt": {
          content =
            typeof event.content === "string"
              ? event.content
              : JSON.stringify(event.content);
          model = event.model;
          if (model) activeModels.add(model);
          contextSize += content.length;
          break;
        }
        case "response": {
          const resp = event as ResponseEvent;
          content =
            typeof resp.content === "string"
              ? resp.content
              : JSON.stringify(resp.content);
          model = resp.model;
          durationMs = resp.durationMs;
          if (model) activeModels.add(model);
          if (resp.tokens) {
            cumulativeTokens += resp.tokens.totalTokens;
          }
          contextSize += content.length;
          break;
        }
        case "tool_call": {
          const tc = event as ToolCallEvent;
          content = tc.toolName;
          toolCallStack.push(tc.toolName);
          break;
        }
        case "tool_result": {
          content = event.toolName;
          const idx = toolCallStack.indexOf(event.toolName);
          if (idx !== -1) toolCallStack.splice(idx, 1);
          durationMs = event.durationMs;
          break;
        }
        case "error": {
          const err = event as ErrorEvent;
          content = err.errorMessage;
          cumulativeErrors++;
          durationMs = err.durationMs;
          break;
        }
        case "session_start": {
          content = "Session started";
          break;
        }
        case "session_end": {
          content = `Session ended: ${event.status}`;
          break;
        }
        case "custom": {
          content = event.name;
          break;
        }
      }

      const snapshot: StateSnapshot = {
        stepIndex: i,
        sessionId,
        cumulativeTokens,
        cumulativeCost,
        cumulativeErrors,
        activeModels: Array.from(activeModels),
        contextSize,
        toolCallStack: [...toolCallStack],
        metadata: event.metadata ?? {},
        capturedAt: event.timestamp,
      };

      // Enforce maxSnapshots
      if (this.snapshots.length >= this.config.maxSnapshots) {
        this.snapshots.shift();
      }
      this.snapshots.push(snapshot);

      const step: DebugStep = {
        index: i,
        eventId: event.eventId,
        eventType: event.type,
        timestamp: event.timestamp,
        snapshot,
        parentEventId: event.parentEventId,
        content,
        model,
        durationMs,
        cost,
      };

      this.steps.push(step);
    }

    this.state.sessionId = sessionId;
    this.state.totalSteps = this.steps.length;
    this.state.currentStepIndex = -1;
    this.state.status = "paused";

    this.metrics.sessionsDebugged++;
    this.updateAvgSteps();
  }

  /** Get current debugger state */
  getState(): DebuggerState {
    return { ...this.state, breakpoints: [...this.breakpoints] };
  }

  /** Set status to playing */
  play(): void {
    this.state.status = "playing";
  }

  /** Set status to paused */
  pause(): void {
    this.state.status = "paused";
  }

  /** Step forward to the next event */
  stepForward(): DebugStep | null {
    const nextIndex = this.state.currentStepIndex + 1;
    if (nextIndex >= this.steps.length) return null;

    this.state.currentStepIndex = nextIndex;
    this.state.status = "stepping";
    this.metrics.totalStepsThroughs++;
    return this.steps[nextIndex];
  }

  /** Step backward to the previous event */
  stepBackward(): DebugStep | null {
    const prevIndex = this.state.currentStepIndex - 1;
    if (prevIndex < 0) return null;

    this.state.currentStepIndex = prevIndex;
    this.state.status = "stepping";
    this.metrics.totalStepsThroughs++;
    return this.steps[prevIndex];
  }

  /** Jump to a specific step */
  seekToStep(index: number): DebugStep | null {
    if (index < 0 || index >= this.steps.length) return null;

    this.state.currentStepIndex = index;
    this.state.status = "stepping";
    return this.steps[index];
  }

  /** Get the current step */
  getCurrentStep(): DebugStep | null {
    if (
      this.state.currentStepIndex < 0 ||
      this.state.currentStepIndex >= this.steps.length
    ) {
      return null;
    }
    return this.steps[this.state.currentStepIndex];
  }

  /** Get state snapshot at a given step */
  getSnapshot(stepIndex: number): StateSnapshot | null {
    const snapshot = this.snapshots.find((s) => s.stepIndex === stepIndex);
    return snapshot ?? null;
  }

  /** Add a breakpoint */
  addBreakpoint(bp: Omit<Breakpoint, "id" | "hitCount">): Breakpoint {
    const breakpoint: Breakpoint = {
      ...bp,
      id: generateEventId(),
      hitCount: 0,
    };
    this.breakpoints.push(breakpoint);
    return breakpoint;
  }

  /** Remove a breakpoint by ID */
  removeBreakpoint(id: string): boolean {
    const idx = this.breakpoints.findIndex((bp) => bp.id === id);
    if (idx === -1) return false;
    this.breakpoints.splice(idx, 1);
    return true;
  }

  /** Get all breakpoints */
  getBreakpoints(): Breakpoint[] {
    return [...this.breakpoints];
  }

  /** Check if a step triggers any enabled breakpoint */
  checkBreakpoints(step: DebugStep): BreakpointHit | null {
    for (const bp of this.breakpoints) {
      if (!bp.enabled) continue;

      const hit = this.evaluateBreakpoint(bp, step);
      if (hit) {
        bp.hitCount++;
        this.metrics.breakpointsHit++;
        return hit;
      }
    }
    return null;
  }

  /** Compare two step snapshots */
  diffSteps(fromIndex: number, toIndex: number): StepDiff {
    const fromStep = this.steps[fromIndex];
    const toStep = this.steps[toIndex];

    const changes: { field: string; before: unknown; after: unknown }[] = [];

    if (!fromStep || !toStep) {
      return { fromStep: fromIndex, toStep: toIndex, changes };
    }

    const fromSnap = fromStep.snapshot;
    const toSnap = toStep.snapshot;

    const fields: (keyof StateSnapshot)[] = [
      "cumulativeTokens",
      "cumulativeCost",
      "cumulativeErrors",
      "contextSize",
    ];

    for (const field of fields) {
      if (fromSnap[field] !== toSnap[field]) {
        changes.push({ field, before: fromSnap[field], after: toSnap[field] });
      }
    }

    // Compare activeModels
    const fromModels = fromSnap.activeModels.join(",");
    const toModels = toSnap.activeModels.join(",");
    if (fromModels !== toModels) {
      changes.push({
        field: "activeModels",
        before: fromSnap.activeModels,
        after: toSnap.activeModels,
      });
    }

    // Compare toolCallStack
    const fromTools = fromSnap.toolCallStack.join(",");
    const toTools = toSnap.toolCallStack.join(",");
    if (fromTools !== toTools) {
      changes.push({
        field: "toolCallStack",
        before: fromSnap.toolCallStack,
        after: toSnap.toolCallStack,
      });
    }

    return { fromStep: fromIndex, toStep: toIndex, changes };
  }

  /** Rerun from a step with modifications */
  rerunFromStep(
    config: RerunConfig,
    executor: (
      step: DebugStep,
      context: Record<string, unknown>,
    ) => DebugStep[],
  ): RerunResult {
    const originalSteps = this.steps.slice(config.fromStepIndex);
    const startStep = this.steps[config.fromStepIndex];

    if (!startStep) {
      return {
        originalSteps: [],
        rerunSteps: [],
        divergencePoint: null,
        diffs: [],
      };
    }

    const rerunSteps = executor(startStep, config.modifiedContext);
    this.metrics.rerunsExecuted++;

    // Find divergence point
    let divergencePoint: number | null = null;
    const minLen = Math.min(originalSteps.length, rerunSteps.length);
    for (let i = 0; i < minLen; i++) {
      if (originalSteps[i].content !== rerunSteps[i].content) {
        divergencePoint = i;
        break;
      }
    }
    if (
      divergencePoint === null &&
      originalSteps.length !== rerunSteps.length
    ) {
      divergencePoint = minLen;
    }

    // Compute diffs
    const diffs: StepDiff[] = [];
    for (let i = 0; i < minLen; i++) {
      const diff = this.diffSnapshots(
        originalSteps[i].snapshot,
        rerunSteps[i].snapshot,
        i,
        i,
      );
      if (diff.changes.length > 0) {
        diffs.push(diff);
      }
    }

    return { originalSteps, rerunSteps, divergencePoint, diffs };
  }

  /** Get debugger metrics */
  getMetrics(): DebuggerMetrics {
    return { ...this.metrics };
  }

  /** Clear debugger state */
  reset(): void {
    this.steps = [];
    this.snapshots = [];
    this.breakpoints = [];
    this.previousModel = null;
    this.state = {
      status: "idle",
      currentStepIndex: -1,
      totalSteps: 0,
      sessionId: null,
      breakpoints: this.breakpoints,
    };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private evaluateBreakpoint(
    bp: Breakpoint,
    step: DebugStep,
  ): BreakpointHit | null {
    switch (bp.type) {
      case "on_error":
        if (step.eventType === "error") {
          return {
            breakpoint: bp,
            step,
            reason: `Error event: ${step.content}`,
          };
        }
        break;

      case "on_cost_threshold": {
        const threshold = bp.condition as number;
        if (step.snapshot.cumulativeCost >= threshold) {
          return {
            breakpoint: bp,
            step,
            reason: `Cost threshold ${threshold} reached: ${step.snapshot.cumulativeCost}`,
          };
        }
        break;
      }

      case "on_pattern_match": {
        const pattern = bp.condition as string;
        if (step.content.includes(pattern)) {
          return {
            breakpoint: bp,
            step,
            reason: `Pattern matched: "${pattern}"`,
          };
        }
        break;
      }

      case "on_tool_call": {
        const toolName = bp.condition as string;
        if (step.eventType === "tool_call" && step.content === toolName) {
          return { breakpoint: bp, step, reason: `Tool call: ${toolName}` };
        }
        break;
      }

      case "on_step_index": {
        const targetIndex = bp.condition as number;
        if (step.index === targetIndex) {
          return { breakpoint: bp, step, reason: `Step index: ${targetIndex}` };
        }
        break;
      }

      case "on_model_change": {
        if (
          step.model &&
          step.model !== this.previousModel &&
          this.previousModel !== null
        ) {
          const reason = `Model changed from ${this.previousModel} to ${step.model}`;
          this.previousModel = step.model;
          return { breakpoint: bp, step, reason };
        }
        if (step.model) {
          this.previousModel = step.model;
        }
        break;
      }
    }
    return null;
  }

  private diffSnapshots(
    from: StateSnapshot,
    to: StateSnapshot,
    fromIndex: number,
    toIndex: number,
  ): StepDiff {
    const changes: { field: string; before: unknown; after: unknown }[] = [];

    const fields: (keyof StateSnapshot)[] = [
      "cumulativeTokens",
      "cumulativeCost",
      "cumulativeErrors",
      "contextSize",
    ];

    for (const field of fields) {
      if (from[field] !== to[field]) {
        changes.push({ field, before: from[field], after: to[field] });
      }
    }

    return { fromStep: fromIndex, toStep: toIndex, changes };
  }

  private updateAvgSteps(): void {
    if (this.metrics.sessionsDebugged > 0) {
      // Running average: accumulate total steps across sessions
      const totalPrev =
        this.metrics.avgStepsPerSession * (this.metrics.sessionsDebugged - 1);
      this.metrics.avgStepsPerSession =
        (totalPrev + this.steps.length) / this.metrics.sessionsDebugged;
    }
  }
}
