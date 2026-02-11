import { describe, it, expect, beforeEach } from "vitest";
import { TraceDebuggerEngine } from "../src/trace-debugger";
import type {
  DebuggerConfig,
  DebugStep,
  StateSnapshot,
} from "../src/trace-debugger";
import type { AgentEvent } from "../src/types";

function makeEvents(sessionId = "sess-1"): AgentEvent[] {
  return [
    {
      eventId: "e1",
      sessionId,
      type: "session_start",
      timestamp: 1000,
    } as AgentEvent,
    {
      eventId: "e2",
      sessionId,
      type: "prompt",
      timestamp: 1001,
      role: "user",
      content: "Hello, world!",
      model: "gpt-4",
    } as AgentEvent,
    {
      eventId: "e3",
      sessionId,
      type: "response",
      timestamp: 1002,
      content: "Hi there!",
      model: "gpt-4",
      durationMs: 200,
      tokens: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    } as AgentEvent,
    {
      eventId: "e4",
      sessionId,
      type: "tool_call",
      timestamp: 1003,
      toolName: "search",
      toolInput: { query: "test" },
    } as AgentEvent,
    {
      eventId: "e5",
      sessionId,
      type: "tool_result",
      timestamp: 1004,
      toolName: "search",
      toolOutput: { results: [] },
      status: "success",
      durationMs: 100,
    } as AgentEvent,
    {
      eventId: "e6",
      sessionId,
      type: "error",
      timestamp: 1005,
      errorType: "RuntimeError",
      errorMessage: "Something went wrong",
    } as AgentEvent,
    {
      eventId: "e7",
      sessionId,
      type: "response",
      timestamp: 1006,
      content: "Recovery response",
      model: "gpt-3.5-turbo",
      durationMs: 150,
      tokens: { promptTokens: 8, completionTokens: 4, totalTokens: 12 },
    } as AgentEvent,
    {
      eventId: "e8",
      sessionId,
      type: "session_end",
      timestamp: 1007,
      status: "completed",
    } as AgentEvent,
  ];
}

const defaultConfig: DebuggerConfig = {
  enabled: true,
  maxSnapshots: 100,
  debug: false,
};

describe("TraceDebuggerEngine", () => {
  let engine: TraceDebuggerEngine;

  beforeEach(() => {
    engine = new TraceDebuggerEngine(defaultConfig);
  });

  describe("loadSession", () => {
    it("should load session events and create steps", () => {
      const events = makeEvents();
      engine.loadSession(events);

      const state = engine.getState();
      expect(state.totalSteps).toBe(events.length);
      expect(state.sessionId).toBe("sess-1");
      expect(state.status).toBe("paused");
      expect(state.currentStepIndex).toBe(-1);
    });

    it("should create correct steps from events", () => {
      engine.loadSession(makeEvents());

      // Step forward to first event
      const step = engine.stepForward();
      expect(step).not.toBeNull();
      expect(step!.eventId).toBe("e1");
      expect(step!.eventType).toBe("session_start");
    });
  });

  describe("step navigation", () => {
    beforeEach(() => {
      engine.loadSession(makeEvents());
    });

    it("should step forward through events", () => {
      const step1 = engine.stepForward();
      expect(step1).not.toBeNull();
      expect(step1!.index).toBe(0);

      const step2 = engine.stepForward();
      expect(step2).not.toBeNull();
      expect(step2!.index).toBe(1);
      expect(step2!.eventType).toBe("prompt");
    });

    it("should return null when stepping past the end", () => {
      for (let i = 0; i < 8; i++) {
        engine.stepForward();
      }
      const step = engine.stepForward();
      expect(step).toBeNull();
    });

    it("should step backward through events", () => {
      engine.stepForward(); // index 0
      engine.stepForward(); // index 1
      engine.stepForward(); // index 2

      const step = engine.stepBackward();
      expect(step).not.toBeNull();
      expect(step!.index).toBe(1);
    });

    it("should return null when stepping before the beginning", () => {
      const step = engine.stepBackward();
      expect(step).toBeNull();
    });

    it("should seek to a specific step", () => {
      const step = engine.seekToStep(4);
      expect(step).not.toBeNull();
      expect(step!.index).toBe(4);
      expect(step!.eventId).toBe("e5");
    });

    it("should return null for invalid seek index", () => {
      expect(engine.seekToStep(-1)).toBeNull();
      expect(engine.seekToStep(100)).toBeNull();
    });

    it("should get current step", () => {
      expect(engine.getCurrentStep()).toBeNull();

      engine.stepForward();
      const current = engine.getCurrentStep();
      expect(current).not.toBeNull();
      expect(current!.index).toBe(0);
    });
  });

  describe("state snapshots", () => {
    beforeEach(() => {
      engine.loadSession(makeEvents());
    });

    it("should track cumulative tokens", () => {
      // After response event (index 2): 15 tokens
      const snapshot2 = engine.getSnapshot(2);
      expect(snapshot2).not.toBeNull();
      expect(snapshot2!.cumulativeTokens).toBe(15);

      // After second response event (index 6): 15 + 12 = 27 tokens
      const snapshot6 = engine.getSnapshot(6);
      expect(snapshot6).not.toBeNull();
      expect(snapshot6!.cumulativeTokens).toBe(27);
    });

    it("should track cumulative errors", () => {
      // Before error (index 4): 0 errors
      const snapshot4 = engine.getSnapshot(4);
      expect(snapshot4!.cumulativeErrors).toBe(0);

      // After error event (index 5): 1 error
      const snapshot5 = engine.getSnapshot(5);
      expect(snapshot5!.cumulativeErrors).toBe(1);
    });

    it("should track active models", () => {
      const snapshot2 = engine.getSnapshot(2);
      expect(snapshot2!.activeModels).toContain("gpt-4");

      const snapshot6 = engine.getSnapshot(6);
      expect(snapshot6!.activeModels).toContain("gpt-4");
      expect(snapshot6!.activeModels).toContain("gpt-3.5-turbo");
    });

    it("should track tool call stack", () => {
      // After tool_call (index 3): search in stack
      const snapshot3 = engine.getSnapshot(3);
      expect(snapshot3!.toolCallStack).toContain("search");

      // After tool_result (index 4): search removed from stack
      const snapshot4 = engine.getSnapshot(4);
      expect(snapshot4!.toolCallStack).not.toContain("search");
    });

    it("should return null for non-existent snapshot", () => {
      expect(engine.getSnapshot(999)).toBeNull();
    });
  });

  describe("breakpoints", () => {
    beforeEach(() => {
      engine.loadSession(makeEvents());
    });

    it("should add and retrieve breakpoints", () => {
      const bp = engine.addBreakpoint({
        type: "on_error",
        condition: null,
        enabled: true,
      });

      expect(bp.id).toBeDefined();
      expect(bp.hitCount).toBe(0);

      const breakpoints = engine.getBreakpoints();
      expect(breakpoints).toHaveLength(1);
    });

    it("should remove breakpoints", () => {
      const bp = engine.addBreakpoint({
        type: "on_error",
        condition: null,
        enabled: true,
      });

      expect(engine.removeBreakpoint(bp.id)).toBe(true);
      expect(engine.getBreakpoints()).toHaveLength(0);
    });

    it("should return false when removing non-existent breakpoint", () => {
      expect(engine.removeBreakpoint("non-existent")).toBe(false);
    });

    it("should trigger breakpoint on error events", () => {
      engine.addBreakpoint({
        type: "on_error",
        condition: null,
        enabled: true,
      });

      // Step to error event (index 5)
      const errorStep = engine.seekToStep(5);
      expect(errorStep).not.toBeNull();

      const hit = engine.checkBreakpoints(errorStep!);
      expect(hit).not.toBeNull();
      expect(hit!.reason).toContain("Error event");
    });

    it("should not trigger disabled breakpoints", () => {
      engine.addBreakpoint({
        type: "on_error",
        condition: null,
        enabled: false,
      });

      const errorStep = engine.seekToStep(5);
      const hit = engine.checkBreakpoints(errorStep!);
      expect(hit).toBeNull();
    });

    it("should trigger breakpoint on cost threshold", () => {
      // Manually set cost on a snapshot for testing
      engine.loadSession([
        {
          eventId: "e1",
          sessionId: "s1",
          type: "response",
          timestamp: 1000,
          content: "test",
          model: "gpt-4",
          durationMs: 100,
          tokens: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        } as AgentEvent,
      ]);

      engine.addBreakpoint({
        type: "on_cost_threshold",
        condition: 0, // threshold of 0 means any cost triggers it
        enabled: true,
      });

      const step = engine.seekToStep(0);
      // cumulativeCost is 0 by default (no pricing), so threshold 0 triggers
      const hit = engine.checkBreakpoints(step!);
      expect(hit).not.toBeNull();
      expect(hit!.reason).toContain("Cost threshold");
    });

    it("should trigger breakpoint on tool call", () => {
      engine.addBreakpoint({
        type: "on_tool_call",
        condition: "search",
        enabled: true,
      });

      const toolStep = engine.seekToStep(3);
      const hit = engine.checkBreakpoints(toolStep!);
      expect(hit).not.toBeNull();
      expect(hit!.reason).toContain("Tool call: search");
    });

    it("should trigger breakpoint on step index", () => {
      engine.addBreakpoint({
        type: "on_step_index",
        condition: 2,
        enabled: true,
      });

      const step = engine.seekToStep(2);
      const hit = engine.checkBreakpoints(step!);
      expect(hit).not.toBeNull();
      expect(hit!.reason).toContain("Step index: 2");
    });

    it("should increment hit count on breakpoint trigger", () => {
      const bp = engine.addBreakpoint({
        type: "on_error",
        condition: null,
        enabled: true,
      });

      const errorStep = engine.seekToStep(5);
      engine.checkBreakpoints(errorStep!);

      const breakpoints = engine.getBreakpoints();
      const updated = breakpoints.find((b) => b.id === bp.id);
      expect(updated!.hitCount).toBe(1);
    });
  });

  describe("step diffing", () => {
    beforeEach(() => {
      engine.loadSession(makeEvents());
    });

    it("should diff two steps", () => {
      const diff = engine.diffSteps(1, 2);
      expect(diff.fromStep).toBe(1);
      expect(diff.toStep).toBe(2);
      expect(diff.changes.length).toBeGreaterThan(0);
    });

    it("should detect token changes between steps", () => {
      const diff = engine.diffSteps(1, 2);
      const tokenChange = diff.changes.find(
        (c) => c.field === "cumulativeTokens",
      );
      expect(tokenChange).toBeDefined();
      expect(tokenChange!.before).toBe(0);
      expect(tokenChange!.after).toBe(15);
    });

    it("should return empty changes for same step", () => {
      const diff = engine.diffSteps(0, 0);
      expect(diff.changes).toHaveLength(0);
    });
  });

  describe("rerun from step", () => {
    beforeEach(() => {
      engine.loadSession(makeEvents());
    });

    it("should rerun from a step with modified context", () => {
      const result = engine.rerunFromStep(
        {
          fromStepIndex: 2,
          modifiedContext: { temperature: 0.5 },
        },
        (step, context) => {
          // Simulate a rerun that produces different output
          return [
            {
              ...step,
              content: "Modified response",
              snapshot: {
                ...step.snapshot,
                cumulativeTokens: 20,
              },
            },
          ];
        },
      );

      expect(result.originalSteps.length).toBeGreaterThan(0);
      expect(result.rerunSteps).toHaveLength(1);
      expect(result.rerunSteps[0].content).toBe("Modified response");
    });

    it("should detect divergence point", () => {
      const result = engine.rerunFromStep(
        {
          fromStepIndex: 0,
          modifiedContext: {},
        },
        (step) => {
          return [
            { ...step, content: step.content },
            { ...step, index: 1, content: "different content" },
          ];
        },
      );

      // Original starts from index 0, has 8 steps
      // Rerun has 2 steps, second one differs
      expect(result.divergencePoint).toBe(1);
    });

    it("should increment rerun metrics", () => {
      engine.rerunFromStep(
        { fromStepIndex: 0, modifiedContext: {} },
        (step) => [step],
      );

      const metrics = engine.getMetrics();
      expect(metrics.rerunsExecuted).toBe(1);
    });
  });

  describe("play/pause state transitions", () => {
    beforeEach(() => {
      engine.loadSession(makeEvents());
    });

    it("should transition to playing", () => {
      engine.play();
      expect(engine.getState().status).toBe("playing");
    });

    it("should transition to paused", () => {
      engine.play();
      engine.pause();
      expect(engine.getState().status).toBe("paused");
    });

    it("should be stepping after stepForward", () => {
      engine.stepForward();
      expect(engine.getState().status).toBe("stepping");
    });

    it("should start as idle before loading", () => {
      const freshEngine = new TraceDebuggerEngine(defaultConfig);
      expect(freshEngine.getState().status).toBe("idle");
    });
  });

  describe("metrics tracking", () => {
    it("should track sessions debugged", () => {
      engine.loadSession(makeEvents());
      expect(engine.getMetrics().sessionsDebugged).toBe(1);

      engine.loadSession(makeEvents("sess-2"));
      expect(engine.getMetrics().sessionsDebugged).toBe(2);
    });

    it("should track total step-throughs", () => {
      engine.loadSession(makeEvents());
      engine.stepForward();
      engine.stepForward();
      engine.stepBackward();

      expect(engine.getMetrics().totalStepsThroughs).toBe(3);
    });

    it("should track breakpoints hit", () => {
      engine.loadSession(makeEvents());
      engine.addBreakpoint({
        type: "on_error",
        condition: null,
        enabled: true,
      });

      const errorStep = engine.seekToStep(5);
      engine.checkBreakpoints(errorStep!);

      expect(engine.getMetrics().breakpointsHit).toBe(1);
    });

    it("should track average steps per session", () => {
      engine.loadSession(makeEvents());
      expect(engine.getMetrics().avgStepsPerSession).toBe(8);
    });
  });

  describe("reset", () => {
    it("should clear all state", () => {
      engine.loadSession(makeEvents());
      engine.addBreakpoint({
        type: "on_error",
        condition: null,
        enabled: true,
      });
      engine.stepForward();

      engine.reset();

      const state = engine.getState();
      expect(state.status).toBe("idle");
      expect(state.totalSteps).toBe(0);
      expect(state.sessionId).toBeNull();
      expect(state.currentStepIndex).toBe(-1);
      expect(state.breakpoints).toHaveLength(0);
      expect(engine.getCurrentStep()).toBeNull();
      expect(engine.getBreakpoints()).toHaveLength(0);
    });
  });
});
