/**
 * OpenTelemetry Integration Tests
 *
 * Tests for OTel semantic conventions, OTLP export, and bidirectional bridging.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import {
  // Propagator
  W3CTraceContextPropagator,
  W3CBaggagePropagator,
  CompositePropagator,
  generateTraceId,
  generateSpanId,
  isValidTraceId,
  isValidSpanId,
  parseTraceparent,
  formatTraceparent,
  parseBaggage,
  formatBaggage,
  TRACE_FLAGS,
  // Types
  MapContextCarrier,
  GEN_AI_ATTRIBUTES,
} from "../src/otel/index";
import { OTelExporter } from "../src/otel/exporter";
import { OTelBridge, createOTelMiddleware } from "../src/otel/bridge";
import type { AgentEvent, ResponseEvent } from "../src/types";
import type { OTelTraceContext, OTelSpan } from "../src/otel/types";

// Store original fetch and create a stable mock
const originalFetch = globalThis.fetch;

// Create a single mock function that we'll reset before each test
const mockFetch = vi.fn();

// Setup: replace global fetch once
beforeAll(() => {
  globalThis.fetch = mockFetch;
});

// Before each test: reset the mock to success state
beforeEach(() => {
  // Clear any previous mock state completely
  mockFetch.mockReset();
  // Set default success implementation
  mockFetch.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      text: () => Promise.resolve(""),
    }),
  );
});

// Teardown: restore original fetch
afterAll(() => {
  globalThis.fetch = originalFetch;
});

// ============================================================================
// Propagator Tests
// ============================================================================

describe("W3CTraceContextPropagator", () => {
  describe("generateTraceId", () => {
    it("should generate valid 32-character hex trace IDs", () => {
      const traceId = generateTraceId();
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(isValidTraceId(traceId)).toBe(true);
    });

    it("should generate unique trace IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("generateSpanId", () => {
    it("should generate valid 16-character hex span IDs", () => {
      const spanId = generateSpanId();
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(isValidSpanId(spanId)).toBe(true);
    });

    it("should generate unique span IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSpanId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("isValidTraceId", () => {
    it("should accept valid trace IDs", () => {
      expect(isValidTraceId("4bf92f3577b34da6a3ce929d0e0e4736")).toBe(true);
      expect(isValidTraceId("0123456789abcdef0123456789abcdef")).toBe(true);
    });

    it("should reject invalid trace IDs", () => {
      expect(isValidTraceId("")).toBe(false);
      expect(isValidTraceId("too-short")).toBe(false);
      expect(isValidTraceId("00000000000000000000000000000000")).toBe(false); // all zeros
      expect(isValidTraceId("not-hex-characters-here-1234567")).toBe(false);
    });
  });

  describe("isValidSpanId", () => {
    it("should accept valid span IDs", () => {
      expect(isValidSpanId("00f067aa0ba902b7")).toBe(true);
      expect(isValidSpanId("0123456789abcdef")).toBe(true);
    });

    it("should reject invalid span IDs", () => {
      expect(isValidSpanId("")).toBe(false);
      expect(isValidSpanId("too-short")).toBe(false);
      expect(isValidSpanId("0000000000000000")).toBe(false); // all zeros
      expect(isValidSpanId("not-hex-chars!!")).toBe(false);
    });
  });

  describe("parseTraceparent", () => {
    it("should parse valid traceparent header", () => {
      const result = parseTraceparent(
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      );
      expect(result).toEqual({
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        traceFlags: 1,
        sampled: true,
      });
    });

    it("should parse unsampled trace", () => {
      const result = parseTraceparent(
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00",
      );
      expect(result?.sampled).toBe(false);
      expect(result?.traceFlags).toBe(0);
    });

    it("should handle whitespace", () => {
      const result = parseTraceparent(
        "  00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01  ",
      );
      expect(result).not.toBeNull();
      expect(result?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    });

    it("should return null for invalid format", () => {
      expect(parseTraceparent("invalid")).toBeNull();
      expect(parseTraceparent("00-invalid-trace-id")).toBeNull();
      expect(parseTraceparent("")).toBeNull();
    });

    it("should return null for all-zeros trace ID", () => {
      const result = parseTraceparent(
        "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
      );
      expect(result).toBeNull();
    });

    it("should return null for all-zeros span ID", () => {
      const result = parseTraceparent(
        "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01",
      );
      expect(result).toBeNull();
    });
  });

  describe("formatTraceparent", () => {
    it("should format trace context to traceparent header", () => {
      const context: OTelTraceContext = {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        traceFlags: 1,
        sampled: true,
      };
      expect(formatTraceparent(context)).toBe(
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      );
    });

    it("should handle unsampled flag", () => {
      const context: OTelTraceContext = {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        traceFlags: 0,
        sampled: false,
      };
      expect(formatTraceparent(context)).toBe(
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00",
      );
    });
  });

  describe("W3CTraceContextPropagator class", () => {
    let propagator: W3CTraceContextPropagator;

    beforeEach(() => {
      propagator = new W3CTraceContextPropagator();
    });

    it("should extract context from carrier", () => {
      const carrier = new MapContextCarrier({
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      });

      const context = propagator.extract(carrier);
      expect(context).not.toBeNull();
      expect(context?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
      expect(context?.spanId).toBe("00f067aa0ba902b7");
    });

    it("should inject context into carrier", () => {
      const context: OTelTraceContext = {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        traceFlags: 1,
        sampled: true,
      };
      const carrier = new MapContextCarrier();

      propagator.inject(context, carrier);

      expect(carrier.get("traceparent")).toBe(
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      );
    });

    it("should extract tracestate if present", () => {
      const carrier = new MapContextCarrier({
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        tracestate: "vendor1=value1,vendor2=value2",
      });

      const context = propagator.extract(carrier);
      expect(context?.traceState).toBe("vendor1=value1,vendor2=value2");
    });

    it("should create child context", () => {
      const parent: OTelTraceContext = {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        traceFlags: 1,
        sampled: true,
      };

      const child = propagator.createChildContext(parent);

      expect(child.traceId).toBe(parent.traceId);
      expect(child.parentSpanId).toBe(parent.spanId);
      expect(child.spanId).not.toBe(parent.spanId);
      expect(child.traceFlags).toBe(parent.traceFlags);
    });

    it("should create root context", () => {
      const context = propagator.createRootContext(true);

      expect(isValidTraceId(context.traceId)).toBe(true);
      expect(isValidSpanId(context.spanId)).toBe(true);
      expect(context.sampled).toBe(true);
      expect(context.traceFlags).toBe(TRACE_FLAGS.SAMPLED);
    });
  });
});

describe("W3CBaggagePropagator", () => {
  describe("parseBaggage", () => {
    it("should parse simple baggage", () => {
      const result = parseBaggage("key1=value1,key2=value2");
      expect(result).toEqual({
        key1: "value1",
        key2: "value2",
      });
    });

    it("should handle URL-encoded values", () => {
      const result = parseBaggage("key=hello%20world");
      expect(result.key).toBe("hello world");
    });

    it("should handle metadata after semicolon", () => {
      const result = parseBaggage("key=value;property=x");
      expect(result.key).toBe("value");
    });

    it("should handle empty string", () => {
      const result = parseBaggage("");
      expect(result).toEqual({});
    });
  });

  describe("formatBaggage", () => {
    it("should format baggage to header", () => {
      const result = formatBaggage({ key1: "value1", key2: "value2" });
      expect(result).toContain("key1=value1");
      expect(result).toContain("key2=value2");
    });

    it("should URL-encode special characters", () => {
      const result = formatBaggage({ key: "hello world" });
      expect(result).toBe("key=hello%20world");
    });
  });

  describe("W3CBaggagePropagator class", () => {
    let propagator: W3CBaggagePropagator;

    beforeEach(() => {
      propagator = new W3CBaggagePropagator();
    });

    it("should extract baggage from carrier", () => {
      const carrier = new MapContextCarrier({
        baggage: "userId=123,featureId=chat",
      });

      const baggage = propagator.extract(carrier);
      expect(baggage).toEqual({
        userId: "123",
        featureId: "chat",
      });
    });

    it("should inject baggage into carrier", () => {
      const carrier = new MapContextCarrier();

      propagator.inject({ userId: "123", featureId: "chat" }, carrier);

      const result = carrier.get("baggage");
      expect(result).toContain("userId=123");
      expect(result).toContain("featureId=chat");
    });
  });
});

describe("CompositePropagator", () => {
  let propagator: CompositePropagator;

  beforeEach(() => {
    propagator = new CompositePropagator();
  });

  it("should extract both context and baggage", () => {
    const carrier = new MapContextCarrier({
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      baggage: "userId=123",
    });

    const { context, baggage } = propagator.extract(carrier);

    expect(context?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(baggage).toEqual({ userId: "123" });
  });

  it("should inject both context and baggage", () => {
    const context: OTelTraceContext = {
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
      traceFlags: 1,
      sampled: true,
    };
    const baggage = { userId: "123" };
    const carrier = new MapContextCarrier();

    propagator.inject(context, baggage, carrier);

    expect(carrier.get("traceparent")).toBeTruthy();
    expect(carrier.get("baggage")).toContain("userId=123");
  });
});

// ============================================================================
// Exporter Tests
// ============================================================================

describe("OTelExporter", () => {
  let exporter: OTelExporter;

  beforeEach(() => {
    exporter = new OTelExporter({
      enabled: true,
      endpoint: "http://localhost:4318/v1/traces",
      exportInterval: 0, // Disable auto-export for tests
    });
  });

  // Note: We don't call exporter.shutdown() in afterEach because:
  // 1. shutdown() calls flush() which makes a fetch call
  // 2. The mock may be reset by the next test's beforeEach before shutdown completes
  // 3. Since exportInterval: 0, there's no timer to clean up
  // 4. Each test creates a new exporter anyway

  describe("eventToSpan", () => {
    it("should convert prompt event to span", () => {
      const event: AgentEvent = {
        eventId: "evt-1",
        sessionId: "sess-1",
        type: "prompt",
        role: "user",
        content: "Hello, world!",
        model: "gpt-4",
        timestamp: Date.now(),
      };

      const span = exporter.eventToSpan(event);

      expect(span.name).toBe("gen_ai.prompt");
      expect(span.kind).toBe("CLIENT");
      expect(span.attributes[GEN_AI_ATTRIBUTES.REQUEST_MODEL]).toBe("gpt-4");
      expect(span.attributes[GEN_AI_ATTRIBUTES.SYSTEM]).toBe("openai");
    });

    it("should convert response event to span with tokens", () => {
      const event: ResponseEvent = {
        eventId: "evt-2",
        sessionId: "sess-1",
        type: "response",
        content: "Hello!",
        model: "claude-3-sonnet",
        durationMs: 500,
        tokens: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
        timestamp: Date.now(),
      };

      const span = exporter.eventToSpan(event);

      expect(span.name).toBe("gen_ai.claude-3-sonnet.chat");
      expect(span.attributes[GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS]).toBe(10);
      expect(span.attributes[GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS]).toBe(5);
      expect(span.attributes[GEN_AI_ATTRIBUTES.SYSTEM]).toBe("anthropic");
    });

    it("should convert tool_call event to span", () => {
      const event: AgentEvent = {
        eventId: "evt-3",
        sessionId: "sess-1",
        type: "tool_call",
        toolName: "get_weather",
        toolInput: { city: "Seattle" },
        timestamp: Date.now(),
      };

      const span = exporter.eventToSpan(event);

      expect(span.name).toBe("gen_ai.tool.get_weather");
      expect(span.attributes[GEN_AI_ATTRIBUTES.TOOL_NAME]).toBe("get_weather");
    });

    it("should convert error event to span with error status", () => {
      const event: AgentEvent = {
        eventId: "evt-4",
        sessionId: "sess-1",
        type: "error",
        errorType: "RateLimitError",
        errorMessage: "Too many requests",
        timestamp: Date.now(),
      };

      const span = exporter.eventToSpan(event);

      expect(span.name).toBe("error.RateLimitError");
      expect(span.status.code).toBe("ERROR");
      expect(span.status.message).toBe("Too many requests");
    });

    it("should maintain trace ID for same session", () => {
      const event1: AgentEvent = {
        eventId: "evt-1",
        sessionId: "sess-1",
        type: "prompt",
        role: "user",
        content: "First",
        timestamp: Date.now(),
      };
      const event2: AgentEvent = {
        eventId: "evt-2",
        sessionId: "sess-1",
        type: "prompt",
        role: "user",
        content: "Second",
        timestamp: Date.now(),
      };

      const span1 = exporter.eventToSpan(event1);
      const span2 = exporter.eventToSpan(event2);

      expect(span1.traceId).toBe(span2.traceId);
    });

    it("should use different trace IDs for different sessions", () => {
      const event1: AgentEvent = {
        eventId: "evt-1",
        sessionId: "sess-1",
        type: "prompt",
        role: "user",
        content: "Hello",
        timestamp: Date.now(),
      };
      const event2: AgentEvent = {
        eventId: "evt-2",
        sessionId: "sess-2",
        type: "prompt",
        role: "user",
        content: "Hello",
        timestamp: Date.now(),
      };

      const span1 = exporter.eventToSpan(event1);
      const span2 = exporter.eventToSpan(event2);

      expect(span1.traceId).not.toBe(span2.traceId);
    });
  });

  describe("addEvent and flush", () => {
    it("should add events and flush to endpoint", async () => {
      const event: AgentEvent = {
        eventId: "evt-1",
        sessionId: "sess-1",
        type: "prompt",
        role: "user",
        content: "Test",
        timestamp: Date.now(),
      };

      exporter.addEvent(event);
      const result = await exporter.flush();

      expect(result.success).toBe(true);
      expect(result.spanCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should batch multiple events", async () => {
      const events: AgentEvent[] = [
        {
          eventId: "evt-1",
          sessionId: "sess-1",
          type: "prompt",
          role: "user",
          content: "Test 1",
          timestamp: Date.now(),
        },
        {
          eventId: "evt-2",
          sessionId: "sess-1",
          type: "response",
          content: "Response",
          model: "gpt-4",
          durationMs: 100,
          timestamp: Date.now(),
        },
      ];

      exporter.addEvents(events);
      const result = await exporter.flush();

      expect(result.success).toBe(true);
      expect(result.spanCount).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should not send if no events", async () => {
      const result = await exporter.flush();

      expect(result.success).toBe(true);
      expect(result.spanCount).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle export failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const event: AgentEvent = {
        eventId: "evt-1",
        sessionId: "sess-1",
        type: "prompt",
        role: "user",
        content: "Test",
        timestamp: Date.now(),
      };

      exporter.addEvent(event);
      const result = await exporter.flush();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("getStats", () => {
    it("should track export statistics", async () => {
      const event: AgentEvent = {
        eventId: "evt-1",
        sessionId: "sess-1",
        type: "prompt",
        role: "user",
        content: "Test",
        timestamp: Date.now(),
      };

      exporter.addEvent(event);
      await exporter.flush();

      const stats = exporter.getStats();
      expect(stats.totalSpansExported).toBe(1);
      expect(stats.totalExports).toBe(1);
      expect(stats.failedExports).toBe(0);
    });
  });

  describe("disabled exporter", () => {
    it("should not export when disabled", async () => {
      const disabledExporter = new OTelExporter({
        enabled: false,
        endpoint: "http://localhost:4318/v1/traces",
      });

      const event: AgentEvent = {
        eventId: "evt-1",
        sessionId: "sess-1",
        type: "prompt",
        role: "user",
        content: "Test",
        timestamp: Date.now(),
      };

      disabledExporter.addEvent(event);
      await disabledExporter.flush();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Bridge Tests
// ============================================================================

describe("OTelBridge", () => {
  let bridge: OTelBridge;

  beforeEach(() => {
    bridge = new OTelBridge({
      enabled: true,
      acceptIncoming: true,
      exportOutgoing: true,
      exporter: {
        enabled: true,
        endpoint: "http://localhost:4318/v1/traces",
        exportInterval: 0,
      },
    });
  });

  // Note: We don't call bridge.shutdown() in afterEach because shutdown
  // calls the exporter's flush(), and the mock may be reset before it completes

  describe("context propagation", () => {
    it("should extract context from headers", () => {
      const headers = {
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      };

      const context = bridge.extractFromHeaders(headers);

      expect(context).not.toBeNull();
      expect(context?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    });

    it("should inject context into headers", () => {
      const context: OTelTraceContext = {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        traceFlags: 1,
        sampled: true,
      };

      const headers = bridge.injectIntoHeaders(context, {});

      expect(headers.traceparent).toBe(
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      );
    });

    it("should create new trace context", () => {
      const context = bridge.createTraceContext("sess-1");

      expect(isValidTraceId(context.traceId)).toBe(true);
      expect(isValidSpanId(context.spanId)).toBe(true);
    });
  });

  describe("incoming trace handling", () => {
    it("should start incoming trace and create session", () => {
      const incomingContext: OTelTraceContext = {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        traceFlags: 1,
        sampled: true,
      };

      const { sessionId, traceContext } = bridge.startIncomingTrace(
        incomingContext,
        { userId: "user-123" },
      );

      expect(sessionId).toBeTruthy();
      expect(traceContext.traceId).toBe(incomingContext.traceId);
      expect(traceContext.parentSpanId).toBe(incomingContext.spanId);
    });

    it("should correlate session with trace", () => {
      const incomingContext: OTelTraceContext = {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        traceFlags: 1,
        sampled: true,
      };

      const { sessionId } = bridge.startIncomingTrace(incomingContext);
      const traceId = bridge.getTraceIdForSession(sessionId);

      expect(traceId).toBe(incomingContext.traceId);
    });

    it("should emit events via callback", () => {
      const events: AgentEvent[] = [];
      bridge.setEventCallback((event) => events.push(event));

      const incomingContext: OTelTraceContext = {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        traceFlags: 1,
        sampled: true,
      };

      bridge.startIncomingTrace(incomingContext);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("session_start");
    });
  });

  describe("span to event conversion", () => {
    it("should convert chat span to response event", () => {
      const span: OTelSpan = {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        name: "gen_ai.gpt-4.chat",
        kind: "CLIENT",
        startTimeUnixNano: Date.now() * 1_000_000,
        endTimeUnixNano: (Date.now() + 500) * 1_000_000,
        attributes: {
          [GEN_AI_ATTRIBUTES.OPERATION_NAME]: "chat",
          [GEN_AI_ATTRIBUTES.RESPONSE_MODEL]: "gpt-4",
          [GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS]: 10,
          [GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS]: 20,
          [GEN_AI_ATTRIBUTES.USAGE_TOTAL_TOKENS]: 30,
        },
        status: { code: "OK" },
      };

      const events = bridge.spanToEvents(span, "sess-1");

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("response");
      expect((events[0] as ResponseEvent).model).toBe("gpt-4");
      expect((events[0] as ResponseEvent).tokens?.totalTokens).toBe(30);
    });

    it("should convert error span to error event", () => {
      const span: OTelSpan = {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        name: "gen_ai.chat",
        kind: "CLIENT",
        startTimeUnixNano: Date.now() * 1_000_000,
        endTimeUnixNano: Date.now() * 1_000_000,
        attributes: {
          "exception.type": "RateLimitError",
          "exception.message": "Too many requests",
        },
        status: { code: "ERROR", message: "Too many requests" },
      };

      const events = bridge.spanToEvents(span);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("error");
    });
  });

  describe("export functionality", () => {
    it("should export events", async () => {
      const event: AgentEvent = {
        eventId: "evt-1",
        sessionId: "sess-1",
        type: "prompt",
        role: "user",
        content: "Test",
        timestamp: Date.now(),
      };

      bridge.exportEvent(event);
      const result = await bridge.flush();

      expect(result?.success).toBe(true);
    });
  });

  describe("statistics", () => {
    it("should report bridge stats", () => {
      const incomingContext: OTelTraceContext = {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        traceFlags: 1,
        sampled: true,
      };

      bridge.startIncomingTrace(incomingContext);
      const stats = bridge.getStats();

      expect(stats.activeTraces).toBe(1);
      expect(stats.correlatedSessions).toBe(1);
    });
  });
});

describe("createOTelMiddleware", () => {
  let bridge: OTelBridge;
  let middleware: ReturnType<typeof createOTelMiddleware>;

  beforeEach(() => {
    bridge = new OTelBridge({
      enabled: true,
      acceptIncoming: true,
      exportOutgoing: false, // No exporter, so no fetch calls
    });
    middleware = createOTelMiddleware(bridge);
  });

  // No need for afterEach since exportOutgoing is false (no exporter created)

  it("should extract context from request headers", () => {
    const headers = {
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    };

    const context = middleware.extractFromRequest(headers);

    expect(context).not.toBeNull();
    expect(context?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });

  it("should start trace from request", () => {
    const headers = {
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    };

    const result = middleware.startTrace(headers, { userId: "user-123" });

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBeTruthy();
  });

  it("should inject context into outgoing request", () => {
    const headers = {
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    };

    const { sessionId } = middleware.startTrace(headers)!;
    const outHeaders = middleware.injectIntoRequest(sessionId, {});

    expect(outHeaders.traceparent).toBeTruthy();
  });
});

// ============================================================================
// MapContextCarrier Tests
// ============================================================================

describe("MapContextCarrier", () => {
  it("should store and retrieve values case-insensitively", () => {
    const carrier = new MapContextCarrier();

    carrier.set("Content-Type", "application/json");
    expect(carrier.get("content-type")).toBe("application/json");
    expect(carrier.get("CONTENT-TYPE")).toBe("application/json");
  });

  it("should initialize from object", () => {
    const carrier = new MapContextCarrier({
      "X-Custom": "value",
    });

    expect(carrier.get("x-custom")).toBe("value");
  });

  it("should convert to object", () => {
    const carrier = new MapContextCarrier();
    carrier.set("key1", "value1");
    carrier.set("key2", "value2");

    const obj = carrier.toObject();

    expect(obj).toEqual({
      key1: "value1",
      key2: "value2",
    });
  });

  it("should list keys", () => {
    const carrier = new MapContextCarrier({
      key1: "value1",
      key2: "value2",
    });

    expect(carrier.keys()).toContain("key1");
    expect(carrier.keys()).toContain("key2");
  });
});

// ============================================================================
// GEN_AI_ATTRIBUTES Tests
// ============================================================================

describe("GEN_AI_ATTRIBUTES", () => {
  it("should have standard Gen AI attribute names", () => {
    expect(GEN_AI_ATTRIBUTES.SYSTEM).toBe("gen_ai.system");
    expect(GEN_AI_ATTRIBUTES.REQUEST_MODEL).toBe("gen_ai.request.model");
    expect(GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS).toBe(
      "gen_ai.usage.input_tokens",
    );
    expect(GEN_AI_ATTRIBUTES.TOOL_NAME).toBe("gen_ai.tool.name");
  });

  it("should have AgentOps-specific extensions", () => {
    expect(GEN_AI_ATTRIBUTES.AGENTOPS_SESSION_ID).toBe("agentops.session.id");
    expect(GEN_AI_ATTRIBUTES.COST_TOTAL).toBe("gen_ai.cost.total");
  });
});
