import { describe, it, expect, beforeEach } from "vitest";
import {
  TraceManager,
  ContextPropagator,
  generateTraceId,
  generateSpanId,
  isValidTraceId,
  isValidSpanId,
  type CorrelationConfig,
  type SpanInfo,
} from "../src/correlation";

describe("TraceManager", () => {
  let manager: TraceManager;
  const mockConfig: CorrelationConfig = {
    enabled: true,
    agent: {
      agentId: "test-agent-123",
      name: "test-agent",
    },
    samplingRate: 1.0,
  };

  beforeEach(() => {
    manager = new TraceManager(mockConfig);
  });

  describe("initialization", () => {
    it("should create manager with config", () => {
      expect(manager).toBeInstanceOf(TraceManager);
    });

    it("should expose enabled status", () => {
      expect(manager.isEnabled).toBe(true);
    });

    it("should expose agent info", () => {
      expect(manager.agent.agentId).toBe("test-agent-123");
      expect(manager.agent.name).toBe("test-agent");
    });
  });

  describe("trace management", () => {
    it("should start a new trace", () => {
      const span = manager.startTrace("test-trace", { test: true });

      expect(span).toBeDefined();
      expect(span.spanId).toBeDefined();
      expect(span.traceId).toBeDefined();
      expect(span.name).toBe("test-trace");
    });

    it("should generate valid trace and span IDs", () => {
      const span = manager.startTrace("test-trace");

      expect(isValidTraceId(span.traceId)).toBe(true);
      expect(isValidSpanId(span.spanId)).toBe(true);
    });

    it("should create span with attributes", () => {
      const span = manager.startTrace("test-trace", {
        userId: "user-123",
        operation: "test",
      });

      expect(span.attributes).toBeDefined();
      expect(span.attributes?.userId).toBe("user-123");
    });
  });

  describe("span management", () => {
    it("should start a child span", () => {
      const rootSpan = manager.startTrace("parent-trace");
      const childSpan = manager.startSpan("child-span", { operation: "test" });

      expect(childSpan).toBeDefined();
      expect(childSpan.traceId).toBe(rootSpan.traceId);
    });

    it("should end a span", () => {
      const span = manager.startTrace("test-trace");
      const ended = manager.endSpan(span.spanId, "ok");

      expect(ended).toBeDefined();
      expect(ended?.status).toBe("ok");
    });

    it("should end span with error status", () => {
      const span = manager.startTrace("test-trace");
      const ended = manager.endSpan(span.spanId, "error", "Test error");

      expect(ended).toBeDefined();
      expect(ended?.status).toBe("error");
      expect(ended?.errorMessage).toBe("Test error");
    });
  });

  describe("context propagation", () => {
    it("should get current context", () => {
      manager.startTrace("test-trace");
      const context = manager.getCurrentContext();

      expect(context).toBeDefined();
      expect(context?.traceId).toBeDefined();
      expect(context?.spanId).toBeDefined();
    });

    it("should inject context into headers", () => {
      manager.startTrace("test-trace");
      const headers = manager.injectContext({});

      expect(Object.keys(headers).length).toBeGreaterThan(0);
    });

    it("should extract context from headers", () => {
      const traceId = generateTraceId();
      const spanId = generateSpanId();
      const headers = {
        "x-agentops-trace-id": traceId,
        "x-agentops-span-id": spanId,
        "x-agentops-sampled": "true",
      };

      const context = manager.extractContext(headers);
      expect(context).toBeDefined();
      expect(context?.traceId).toBe(traceId);
    });

    it("should return null for missing context headers", () => {
      const context = manager.extractContext({});
      expect(context).toBeNull();
    });
  });

  describe("trace statistics", () => {
    it("should get trace stats after completing spans", () => {
      const span = manager.startTrace("stats-trace");
      const child1 = manager.startSpan("child-1");
      const child2 = manager.startSpan("child-2");

      // End spans to move them to completed
      manager.endSpan(child2.spanId, "ok");
      manager.endSpan(child1.spanId, "ok");
      manager.endSpan(span.spanId, "ok");

      const stats = manager.getTraceStats(span.traceId);
      expect(stats).toBeDefined();
      expect(stats?.spanCount).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("ContextPropagator", () => {
  let propagator: ContextPropagator;
  const mockConfig = {
    enabled: true,
    agent: { agentId: "test-agent", name: "test" },
    samplingRate: 1.0,
    propagateBaggage: true,
    maxBaggageItems: 64,
    propagationHeaders: {
      traceId: "x-agentops-trace-id",
      spanId: "x-agentops-span-id",
      parentSpanId: "x-agentops-parent-span-id",
      sampled: "x-agentops-sampled",
      baggage: "x-agentops-baggage",
    },
  };

  beforeEach(() => {
    propagator = new ContextPropagator(mockConfig);
  });

  describe("context creation", () => {
    it("should create root context", () => {
      const context = propagator.createRootContext();

      expect(context).toBeDefined();
      expect(context.traceId).toBeDefined();
      expect(context.spanId).toBeDefined();
      expect(isValidTraceId(context.traceId)).toBe(true);
      expect(isValidSpanId(context.spanId)).toBe(true);
    });

    it("should create child context from parent", () => {
      const parent = propagator.createRootContext();
      const child = propagator.createChildContext(parent);

      expect(child.traceId).toBe(parent.traceId);
      expect(child.parentSpanId).toBe(parent.spanId);
      expect(child.spanId).not.toBe(parent.spanId);
    });

    it("should inherit sampling decision", () => {
      const parent = propagator.createRootContext();
      const child = propagator.createChildContext(parent);

      expect(child.sampled).toBe(parent.sampled);
    });
  });

  describe("context injection", () => {
    it("should inject context into headers", () => {
      const context = propagator.createRootContext();
      const headers = propagator.inject(context, {});

      expect(headers["x-agentops-trace-id"]).toBe(context.traceId);
      expect(headers["x-agentops-span-id"]).toBe(context.spanId);
    });

    it("should preserve existing headers", () => {
      const context = propagator.createRootContext();
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };

      const result = propagator.inject(context, headers);

      expect(result["content-type"]).toBe("application/json");
      expect(result["x-agentops-trace-id"]).toBeDefined();
    });
  });

  describe("context extraction", () => {
    it("should extract context from headers", () => {
      const traceId = generateTraceId();
      const spanId = generateSpanId();
      const headers = {
        "x-agentops-trace-id": traceId,
        "x-agentops-span-id": spanId,
        "x-agentops-sampled": "1",
      };

      const context = propagator.extract(headers);

      expect(context).toBeDefined();
      expect(context?.traceId).toBe(traceId);
      expect(context?.spanId).toBe(spanId);
    });

    it("should return null for missing headers", () => {
      const context = propagator.extract({});
      expect(context).toBeNull();
    });

    it("should extract baggage", () => {
      const traceId = generateTraceId();
      const spanId = generateSpanId();
      const headers = {
        "x-agentops-trace-id": traceId,
        "x-agentops-span-id": spanId,
        "x-agentops-sampled": "1",
        "x-agentops-baggage": "key1=value1,key2=value2",
      };

      const context = propagator.extract(headers);
      expect(context?.baggage).toBeDefined();
    });
  });
});

describe("Utility functions", () => {
  it("should generate valid trace ID", () => {
    const traceId = generateTraceId();
    expect(traceId).toBeDefined();
    expect(isValidTraceId(traceId)).toBe(true);
  });

  it("should generate valid span ID", () => {
    const spanId = generateSpanId();
    expect(spanId).toBeDefined();
    expect(isValidSpanId(spanId)).toBe(true);
  });

  it("should reject invalid trace ID", () => {
    expect(isValidTraceId("invalid")).toBe(false);
    expect(isValidTraceId("")).toBe(false);
  });

  it("should reject invalid span ID", () => {
    expect(isValidSpanId("invalid")).toBe(false);
    expect(isValidSpanId("")).toBe(false);
  });
});
