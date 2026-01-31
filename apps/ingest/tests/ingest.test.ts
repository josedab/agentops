/**
 * Integration tests for the AgentOps Ingest API
 *
 * Tests event ingestion, validation, and error handling.
 */

import { describe, it, expect, beforeAll } from "vitest";
import app from "../src/index";

// Test environment bindings
const testEnv = {
  ENVIRONMENT: "test",
  CLICKHOUSE_URL: undefined, // Will log to console in test mode
  CLICKHOUSE_PASSWORD: undefined,
  API_KEY_SECRET: "test-secret",
};

// Helper to make requests to the app
async function request(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = new URL(path, "http://localhost");
  const req = new Request(url.toString(), options);
  return app.fetch(req, testEnv);
}

// Valid API key format: ao_<projectId>_<secret>
const VALID_API_KEY = "ao_proj123_secretkey12345678901234567890";
const INVALID_API_KEY = "invalid_key";

// Helper to create auth headers
function authHeaders(apiKey: string = VALID_API_KEY): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// Sample valid event
function createValidEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    sessionId: "sess_test_12345",
    type: "prompt",
    timestamp: Date.now(),
    ...overrides,
  };
}

// Sample valid batch
function createValidBatch(events: unknown[] = [createValidEvent()]) {
  return {
    events,
    sdkVersion: "1.0.0",
    timestamp: Date.now(),
  };
}

describe("Health Endpoints", () => {
  it("GET /health returns ok status", async () => {
    const res = await request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
    expect(body.environment).toBe("test");
  });

  it("GET /ready returns not_ready without ClickHouse", async () => {
    const res = await request("/ready");
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("not_ready");
  });

  it("GET /ready returns ready with ClickHouse configured", async () => {
    const envWithClickHouse = {
      ...testEnv,
      CLICKHOUSE_URL: "http://localhost:8123",
    };

    const url = new URL("/ready", "http://localhost");
    const req = new Request(url.toString());
    const res = await app.fetch(req, envWithClickHouse);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
  });
});

describe("Authentication", () => {
  it("rejects requests without Authorization header", async () => {
    const res = await request("/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createValidBatch()),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("Authorization");
  });

  it("rejects requests with invalid Authorization format", async () => {
    const res = await request("/v1/events", {
      method: "POST",
      headers: {
        Authorization: "Basic invalid",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createValidBatch()),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("rejects requests with invalid API key format", async () => {
    const res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(INVALID_API_KEY),
      body: JSON.stringify(createValidBatch()),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("Invalid API key");
  });

  it("rejects API keys that are too short", async () => {
    const res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders("ao_proj_short"),
      body: JSON.stringify(createValidBatch()),
    });

    expect(res.status).toBe(401);
  });

  it("accepts valid API key format", async () => {
    const res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(createValidBatch()),
    });

    expect(res.status).toBe(200);
  });
});

describe("Event Ingestion - POST /v1/events", () => {
  describe("Successful ingestion", () => {
    it("accepts a single valid event", async () => {
      const batch = createValidBatch([createValidEvent()]);

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(batch),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.eventCount).toBe(1);
    });

    it("accepts multiple events in a batch", async () => {
      const events = [
        createValidEvent({ type: "session_start" }),
        createValidEvent({ type: "prompt", content: "Hello" }),
        createValidEvent({ type: "response", content: "Hi there!" }),
        createValidEvent({ type: "session_end", status: "completed" }),
      ];
      const batch = createValidBatch(events);

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(batch),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.eventCount).toBe(4);
    });

    it("accepts all valid event types", async () => {
      const eventTypes = [
        "session_start",
        "session_end",
        "prompt",
        "response",
        "tool_call",
        "tool_result",
        "error",
        "custom",
      ];

      for (const type of eventTypes) {
        const batch = createValidBatch([createValidEvent({ type })]);

        const res = await request("/v1/events", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(batch),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      }
    });
  });

  describe("Event types and fields", () => {
    it("accepts prompt event with all fields", async () => {
      const event = createValidEvent({
        type: "prompt",
        role: "user",
        content: "What is the weather today?",
        model: "gpt-4o",
        tags: ["test", "weather"],
        metadata: { source: "cli" },
      });

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(createValidBatch([event])),
      });

      expect(res.status).toBe(200);
    });

    it("accepts response event with tokens", async () => {
      const event = createValidEvent({
        type: "response",
        role: "assistant",
        content: "The weather is sunny.",
        model: "gpt-4o",
        durationMs: 250,
        tokens: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        finishReason: "stop",
      });

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(createValidBatch([event])),
      });

      expect(res.status).toBe(200);
    });

    it("accepts tool_call event", async () => {
      const event = createValidEvent({
        type: "tool_call",
        toolName: "web_search",
        toolInput: { query: "weather today" },
        mcpServer: "brave-search",
      });

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(createValidBatch([event])),
      });

      expect(res.status).toBe(200);
    });

    it("accepts tool_result event", async () => {
      const event = createValidEvent({
        type: "tool_result",
        toolName: "web_search",
        toolOutput: { results: ["sunny", "warm"] },
        durationMs: 350,
        parentEventId: "evt_parent_123",
      });

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(createValidBatch([event])),
      });

      expect(res.status).toBe(200);
    });

    it("accepts error event", async () => {
      const event = createValidEvent({
        type: "error",
        errorType: "RateLimitError",
        errorMessage: "Rate limit exceeded",
        stackTrace: "Error: Rate limit exceeded\n    at ...",
      });

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(createValidBatch([event])),
      });

      expect(res.status).toBe(200);
    });

    it("accepts custom event", async () => {
      const event = createValidEvent({
        type: "custom",
        name: "user_feedback",
        data: { rating: 5, comment: "Great response!" },
      });

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(createValidBatch([event])),
      });

      expect(res.status).toBe(200);
    });
  });

  describe("Validation errors", () => {
    it("rejects empty events array", async () => {
      const batch = createValidBatch([]);

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(batch),
      });

      expect(res.status).toBe(400);
    });

    it("rejects events array exceeding limit (1000)", async () => {
      const events = Array(1001)
        .fill(null)
        .map(() => createValidEvent());
      const batch = createValidBatch(events);

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(batch),
      });

      expect(res.status).toBe(400);
    });

    it("rejects event without eventId", async () => {
      const event = createValidEvent();
      delete (event as Record<string, unknown>).eventId;

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(createValidBatch([event])),
      });

      expect(res.status).toBe(400);
    });

    it("rejects event without sessionId", async () => {
      const event = createValidEvent();
      delete (event as Record<string, unknown>).sessionId;

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(createValidBatch([event])),
      });

      expect(res.status).toBe(400);
    });

    it("rejects event with invalid type", async () => {
      const event = createValidEvent({ type: "invalid_type" });

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(createValidBatch([event])),
      });

      expect(res.status).toBe(400);
    });

    it("rejects batch without sdkVersion", async () => {
      const batch = {
        events: [createValidEvent()],
        timestamp: Date.now(),
      };

      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(batch),
      });

      expect(res.status).toBe(400);
    });

    it("handles malformed JSON gracefully", async () => {
      const res = await request("/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: "not valid json",
      });

      // Malformed JSON is caught by error handler, returns non-200
      expect(res.status).toBeGreaterThanOrEqual(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });
});

describe("Status Endpoint - GET /v1/status", () => {
  it("returns project status with valid API key", async () => {
    const res = await request("/v1/status", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.projectId).toBe("proj123");
    expect(body.status).toBe("active");
    expect(body.usage).toBeDefined();
  });

  it("extracts correct projectId from API key", async () => {
    const res = await request("/v1/status", {
      method: "GET",
      headers: authHeaders("ao_myproject_secretkey12345678901234567890"),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectId).toBe("myproject");
  });

  it("requires authentication", async () => {
    const res = await request("/v1/status", {
      method: "GET",
    });

    expect(res.status).toBe(401);
  });
});

describe("Error Handling", () => {
  it("returns 401 for unknown routes without auth", async () => {
    // All routes (even unknown ones) get processed through auth middleware via app.route('/', api)
    // This is expected behavior - auth runs first, then 404 would be returned if auth passes
    const res = await request("/v1/unknown/route", {
      method: "GET",
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 404 for unknown routes with auth", async () => {
    // With valid auth, unknown routes return 404
    const res = await request("/v1/nonexistent", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("handles OPTIONS requests for CORS", async () => {
    const res = await request("/v1/events", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
      },
    });

    // CORS preflight should return 2xx
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("End-to-End Session Flow", () => {
  it("tracks a complete agent session", async () => {
    const sessionId = `sess_e2e_${Date.now()}`;

    // 1. Session start
    const startBatch = createValidBatch([
      {
        eventId: `evt_start_${Date.now()}`,
        sessionId,
        type: "session_start",
        timestamp: Date.now(),
        userId: "user_123",
        featureId: "chat",
        tags: ["e2e-test"],
      },
    ]);

    let res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(startBatch),
    });
    expect(res.status).toBe(200);

    // 2. User prompt
    const promptBatch = createValidBatch([
      {
        eventId: `evt_prompt_${Date.now()}`,
        sessionId,
        type: "prompt",
        timestamp: Date.now(),
        role: "user",
        content: "What is the capital of France?",
        model: "gpt-4o",
      },
    ]);

    res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(promptBatch),
    });
    expect(res.status).toBe(200);

    // 3. Tool call
    const toolCallBatch = createValidBatch([
      {
        eventId: `evt_tool_${Date.now()}`,
        sessionId,
        type: "tool_call",
        timestamp: Date.now(),
        toolName: "web_search",
        toolInput: { query: "capital of France" },
      },
    ]);

    res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(toolCallBatch),
    });
    expect(res.status).toBe(200);

    // 4. Tool result
    const toolResultBatch = createValidBatch([
      {
        eventId: `evt_result_${Date.now()}`,
        sessionId,
        type: "tool_result",
        timestamp: Date.now(),
        toolName: "web_search",
        toolOutput: { answer: "Paris" },
        durationMs: 150,
      },
    ]);

    res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(toolResultBatch),
    });
    expect(res.status).toBe(200);

    // 5. Assistant response
    const responseBatch = createValidBatch([
      {
        eventId: `evt_response_${Date.now()}`,
        sessionId,
        type: "response",
        timestamp: Date.now(),
        role: "assistant",
        content: "The capital of France is Paris.",
        model: "gpt-4o",
        tokens: {
          promptTokens: 50,
          completionTokens: 10,
          totalTokens: 60,
        },
        durationMs: 250,
        finishReason: "stop",
      },
    ]);

    res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(responseBatch),
    });
    expect(res.status).toBe(200);

    // 6. Session end
    const endBatch = createValidBatch([
      {
        eventId: `evt_end_${Date.now()}`,
        sessionId,
        type: "session_end",
        timestamp: Date.now(),
        status: "completed",
      },
    ]);

    res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(endBatch),
    });
    expect(res.status).toBe(200);
  });

  it("tracks a session with error", async () => {
    const sessionId = `sess_error_${Date.now()}`;

    // 1. Session start
    let res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(
        createValidBatch([
          {
            eventId: `evt_start_${Date.now()}`,
            sessionId,
            type: "session_start",
            timestamp: Date.now(),
          },
        ]),
      ),
    });
    expect(res.status).toBe(200);

    // 2. Error occurs
    res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(
        createValidBatch([
          {
            eventId: `evt_error_${Date.now()}`,
            sessionId,
            type: "error",
            timestamp: Date.now(),
            errorType: "APIError",
            errorMessage: "Rate limit exceeded",
            stackTrace: "Error: Rate limit exceeded\n    at api.call()",
          },
        ]),
      ),
    });
    expect(res.status).toBe(200);

    // 3. Session ends with error status
    res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(
        createValidBatch([
          {
            eventId: `evt_end_${Date.now()}`,
            sessionId,
            type: "session_end",
            timestamp: Date.now(),
            status: "error",
            errorMessage: "Session ended due to error",
          },
        ]),
      ),
    });
    expect(res.status).toBe(200);
  });
});

describe("Performance and Limits", () => {
  it("handles maximum batch size (1000 events)", async () => {
    const events = Array(1000)
      .fill(null)
      .map((_, i) =>
        createValidEvent({ type: i % 2 === 0 ? "prompt" : "response" }),
      );
    const batch = createValidBatch(events);

    const res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(batch),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eventCount).toBe(1000);
  });

  it("handles large content fields", async () => {
    const largeContent = "a".repeat(100000); // 100KB of content
    const event = createValidEvent({
      type: "response",
      content: largeContent,
    });

    const res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(createValidBatch([event])),
    });

    expect(res.status).toBe(200);
  });

  it("handles complex metadata", async () => {
    const event = createValidEvent({
      type: "custom",
      metadata: {
        nested: {
          deeply: {
            value: [1, 2, { more: "data" }],
          },
        },
        array: [1, "two", { three: 3 }],
        nullValue: null,
        unicode: "你好世界 🌍",
      },
    });

    const res = await request("/v1/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(createValidBatch([event])),
    });

    expect(res.status).toBe(200);
  });
});
