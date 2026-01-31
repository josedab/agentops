import { Hono } from "hono";
import { cors } from "hono/cors";
import { bearerAuth } from "hono/bearer-auth";
import { validator } from "hono/validator";
import { z } from "zod";

type Bindings = {
  CLICKHOUSE_URL: string;
  CLICKHOUSE_PASSWORD: string;
  API_KEYS: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS
app.use("/*", cors());

// Public health check
app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

// API version info
app.get("/v1", (c) =>
  c.json({
    version: "1.0.0",
    endpoints: [
      "GET /v1/sessions",
      "GET /v1/sessions/:sessionId",
      "GET /v1/sessions/:sessionId/events",
      "GET /v1/metrics",
      "GET /v1/metrics/cost",
      "GET /v1/metrics/tokens",
      "GET /v1/metrics/latency",
    ],
  }),
);

// Validate API key middleware
const apiKeyAuth = async (c: any, next: any) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const apiKey = authHeader.slice(7);
  // In production, validate against KV/DB
  if (!apiKey.startsWith("ao_")) {
    return c.json({ error: "Invalid API key format" }, 401);
  }

  // TODO: Validate key against database and get project_id
  c.set("projectId", "proj_1");
  await next();
};

// Apply auth to all /v1/* routes except root
app.use("/v1/*", apiKeyAuth);

// Schemas
const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const timeRangeSchema = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  range: z.enum(["1h", "6h", "24h", "7d", "30d"]).optional(),
});

// ============ Sessions API ============

// List sessions
app.get("/v1/sessions", async (c) => {
  const { limit, offset } = paginationSchema.parse(c.req.query());
  const { start, end, range } = timeRangeSchema.parse(c.req.query());
  const status = c.req.query("status");
  const userId = c.req.query("userId");
  const featureId = c.req.query("featureId");

  // Mock response - in production, query ClickHouse
  const sessions = [
    {
      sessionId: "sess_abc123",
      projectId: "proj_1",
      userId: "user_1",
      featureId: "chat",
      status: "completed",
      eventCount: 15,
      totalTokens: 2500,
      totalCost: 0.0125,
      durationMs: 3500,
      models: ["gpt-4o"],
      tools: ["web_search", "calculator"],
      startedAt: "2026-01-28T10:00:00Z",
      endedAt: "2026-01-28T10:00:03.5Z",
    },
    {
      sessionId: "sess_def456",
      projectId: "proj_1",
      userId: "user_2",
      featureId: "code_review",
      status: "completed",
      eventCount: 8,
      totalTokens: 1200,
      totalCost: 0.006,
      durationMs: 2100,
      models: ["claude-3-5-sonnet"],
      tools: ["file_read"],
      startedAt: "2026-01-28T09:55:00Z",
      endedAt: "2026-01-28T09:55:02.1Z",
    },
  ];

  return c.json({
    data: sessions,
    pagination: {
      limit,
      offset,
      total: sessions.length,
      hasMore: false,
    },
  });
});

// Get session by ID
app.get("/v1/sessions/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");

  return c.json({
    sessionId,
    projectId: "proj_1",
    userId: "user_1",
    featureId: "chat",
    status: "completed",
    eventCount: 15,
    totalTokens: 2500,
    totalCost: 0.0125,
    durationMs: 3500,
    models: ["gpt-4o"],
    tools: ["web_search", "calculator"],
    tags: ["production", "v2"],
    metadata: { version: "1.0.0" },
    startedAt: "2026-01-28T10:00:00Z",
    endedAt: "2026-01-28T10:00:03.5Z",
  });
});

// Get session events
app.get("/v1/sessions/:sessionId/events", async (c) => {
  const sessionId = c.req.param("sessionId");
  const { limit, offset } = paginationSchema.parse(c.req.query());
  const eventType = c.req.query("type");

  const events = [
    {
      eventId: "evt_1",
      sessionId,
      eventType: "prompt",
      timestamp: "2026-01-28T10:00:00Z",
      model: "gpt-4o",
      content: { messages: [{ role: "user", content: "Hello!" }] },
      tokens: null,
      cost: null,
      durationMs: null,
    },
    {
      eventId: "evt_2",
      sessionId,
      parentEventId: "evt_1",
      eventType: "response",
      timestamp: "2026-01-28T10:00:01.5Z",
      model: "gpt-4o",
      content: { content: "Hi! How can I help you today?" },
      tokens: { prompt: 10, completion: 15, total: 25 },
      cost: 0.000125,
      durationMs: 1500,
    },
  ];

  return c.json({
    data: events,
    pagination: {
      limit,
      offset,
      total: events.length,
      hasMore: false,
    },
  });
});

// ============ Metrics API ============

// Get aggregated metrics
app.get("/v1/metrics", async (c) => {
  const { start, end, range } = timeRangeSchema.parse(c.req.query());
  const granularity = c.req.query("granularity") || "hour"; // minute, hour, day
  const groupBy = c.req.query("groupBy"); // model, feature, user

  return c.json({
    range: range || "custom",
    granularity,
    data: [
      {
        timestamp: "2026-01-28T10:00:00Z",
        sessions: 45,
        events: 320,
        errors: 2,
        totalTokens: 125000,
        totalCost: 0.625,
        avgLatencyMs: 850,
        p95LatencyMs: 1200,
      },
      {
        timestamp: "2026-01-28T11:00:00Z",
        sessions: 52,
        events: 380,
        errors: 1,
        totalTokens: 142000,
        totalCost: 0.71,
        avgLatencyMs: 780,
        p95LatencyMs: 1100,
      },
    ],
    totals: {
      sessions: 97,
      events: 700,
      errors: 3,
      totalTokens: 267000,
      totalCost: 1.335,
      avgLatencyMs: 815,
    },
  });
});

// Get cost metrics
app.get("/v1/metrics/cost", async (c) => {
  const { range } = timeRangeSchema.parse(c.req.query());
  const groupBy = c.req.query("groupBy") || "model";

  return c.json({
    range: range || "24h",
    groupBy,
    data: [
      { group: "gpt-4o", cost: 0.85, tokens: 170000, percentage: 63.7 },
      {
        group: "claude-3-5-sonnet",
        cost: 0.35,
        tokens: 70000,
        percentage: 26.2,
      },
      { group: "gpt-4o-mini", cost: 0.135, tokens: 27000, percentage: 10.1 },
    ],
    total: 1.335,
  });
});

// Get token metrics
app.get("/v1/metrics/tokens", async (c) => {
  const { range } = timeRangeSchema.parse(c.req.query());
  const groupBy = c.req.query("groupBy") || "model";

  return c.json({
    range: range || "24h",
    groupBy,
    data: [
      {
        group: "gpt-4o",
        promptTokens: 100000,
        completionTokens: 70000,
        total: 170000,
      },
      {
        group: "claude-3-5-sonnet",
        promptTokens: 45000,
        completionTokens: 25000,
        total: 70000,
      },
      {
        group: "gpt-4o-mini",
        promptTokens: 18000,
        completionTokens: 9000,
        total: 27000,
      },
    ],
    totals: {
      promptTokens: 163000,
      completionTokens: 104000,
      total: 267000,
    },
  });
});

// Get latency metrics
app.get("/v1/metrics/latency", async (c) => {
  const { range } = timeRangeSchema.parse(c.req.query());
  const groupBy = c.req.query("groupBy") || "model";

  return c.json({
    range: range || "24h",
    groupBy,
    data: [
      { group: "gpt-4o", p50: 650, p75: 850, p95: 1200, p99: 1800, avg: 750 },
      {
        group: "claude-3-5-sonnet",
        p50: 580,
        p75: 720,
        p95: 1050,
        p99: 1500,
        avg: 680,
      },
      {
        group: "gpt-4o-mini",
        p50: 180,
        p75: 250,
        p95: 400,
        p99: 600,
        avg: 220,
      },
    ],
    overall: {
      p50: 550,
      p75: 750,
      p95: 1100,
      p99: 1650,
      avg: 650,
    },
  });
});

// ============ Export API ============

// Request data export
app.post("/v1/export", async (c) => {
  const body = await c.req.json();

  const jobId = `export_${Date.now()}`;

  return c.json(
    {
      jobId,
      status: "queued",
      type: body.type || "sessions",
      format: body.format || "json",
      createdAt: new Date().toISOString(),
      estimatedCompletionAt: new Date(Date.now() + 60000).toISOString(),
    },
    202,
  );
});

// Get export status
app.get("/v1/export/:jobId", async (c) => {
  const jobId = c.req.param("jobId");

  return c.json({
    jobId,
    status: "completed",
    type: "sessions",
    format: "json",
    downloadUrl: `https://exports.agentops.dev/${jobId}.json.gz`,
    fileSize: 1024 * 1024 * 2.5,
    rowCount: 5000,
    createdAt: new Date(Date.now() - 60000).toISOString(),
    completedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
});

// ============ Alerts API ============

// List alerts
app.get("/v1/alerts", async (c) => {
  return c.json({
    data: [
      {
        id: "alert_1",
        name: "High Error Rate",
        condition: { metric: "error_rate", operator: "gt", threshold: 5 },
        severity: "critical",
        enabled: true,
        channels: ["slack", "email"],
        lastTriggeredAt: "2026-01-28T09:00:00Z",
      },
      {
        id: "alert_2",
        name: "Cost Budget Warning",
        condition: { metric: "daily_cost", operator: "gt", threshold: 80 },
        severity: "warning",
        enabled: true,
        channels: ["email"],
        lastTriggeredAt: null,
      },
    ],
  });
});

// Get alert history
app.get("/v1/alerts/history", async (c) => {
  const { limit, offset } = paginationSchema.parse(c.req.query());

  return c.json({
    data: [
      {
        id: "event_1",
        alertId: "alert_1",
        alertName: "High Error Rate",
        severity: "critical",
        triggeredAt: "2026-01-28T09:00:00Z",
        resolvedAt: "2026-01-28T09:15:00Z",
        value: 7.5,
        threshold: 5,
      },
    ],
    pagination: { limit, offset, total: 1, hasMore: false },
  });
});

export default app;
