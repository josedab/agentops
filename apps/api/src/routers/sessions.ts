/**
 * Sessions Router
 *
 * API endpoints for querying and managing agent sessions.
 */

import { Hono } from "hono";
import { z } from "zod";

// Schemas
const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  status: z.enum(["active", "completed", "error"]).optional(),
  userId: z.string().optional(),
  featureId: z.string().optional(),
  model: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  tags: z.string().optional(), // comma-separated
  sortBy: z
    .enum(["startedAt", "endedAt", "cost", "duration", "tokens"])
    .default("startedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// Mock data store (in production, query ClickHouse)
const mockSessions = [
  {
    sessionId: "sess_abc123def456",
    projectId: "proj_1",
    userId: "user_456",
    featureId: "chat-agent",
    status: "completed" as const,
    models: ["gpt-5"],
    eventCount: 12,
    promptTokens: 450,
    completionTokens: 380,
    totalTokens: 830,
    totalCost: 0.0234,
    durationMs: 4200,
    toolsUsed: ["web_search", "calculator"],
    tags: ["production", "v2"],
    metadata: { source: "web", version: "2.0.0" },
    errorMessage: null,
    startedAt: "2026-01-28T10:30:00.000Z",
    endedAt: "2026-01-28T10:30:04.200Z",
  },
  {
    sessionId: "sess_ghi789jkl012",
    projectId: "proj_1",
    userId: "user_789",
    featureId: "code-review",
    status: "completed" as const,
    models: ["claude-sonnet-4"],
    eventCount: 8,
    promptTokens: 1200,
    completionTokens: 850,
    totalTokens: 2050,
    totalCost: 0.0567,
    durationMs: 6800,
    toolsUsed: ["file_read", "code_search"],
    tags: ["production"],
    metadata: { source: "github-action" },
    errorMessage: null,
    startedAt: "2026-01-28T10:25:00.000Z",
    endedAt: "2026-01-28T10:25:06.800Z",
  },
  {
    sessionId: "sess_mno345pqr678",
    projectId: "proj_1",
    userId: "user_456",
    featureId: "chat-agent",
    status: "error" as const,
    models: ["gpt-5"],
    eventCount: 5,
    promptTokens: 200,
    completionTokens: 0,
    totalTokens: 200,
    totalCost: 0.001,
    durationMs: 1500,
    toolsUsed: [],
    tags: ["production"],
    metadata: {},
    errorMessage: "Rate limit exceeded",
    startedAt: "2026-01-28T10:20:00.000Z",
    endedAt: "2026-01-28T10:20:01.500Z",
  },
];

const mockEvents = [
  {
    eventId: "evt_001",
    sessionId: "sess_abc123def456",
    parentEventId: null,
    type: "session_start",
    timestamp: "2026-01-28T10:30:00.000Z",
    model: null,
    role: null,
    content: null,
    tokens: null,
    cost: null,
    durationMs: 0,
    toolName: null,
    toolInput: null,
    toolOutput: null,
    toolStatus: null,
    errorType: null,
    errorMessage: null,
    metadata: { userId: "user_456", featureId: "chat-agent" },
  },
  {
    eventId: "evt_002",
    sessionId: "sess_abc123def456",
    parentEventId: null,
    type: "prompt",
    timestamp: "2026-01-28T10:30:00.050Z",
    model: "gpt-5",
    role: "system",
    content: "You are a helpful assistant that provides concise answers.",
    tokens: { promptTokens: 15, completionTokens: 0, totalTokens: 15 },
    cost: 0.0001,
    durationMs: 0,
    toolName: null,
    toolInput: null,
    toolOutput: null,
    toolStatus: null,
    errorType: null,
    errorMessage: null,
    metadata: {},
  },
  {
    eventId: "evt_003",
    sessionId: "sess_abc123def456",
    parentEventId: null,
    type: "prompt",
    timestamp: "2026-01-28T10:30:00.100Z",
    model: "gpt-5",
    role: "user",
    content: "What is the capital of France?",
    tokens: { promptTokens: 8, completionTokens: 0, totalTokens: 8 },
    cost: 0.0001,
    durationMs: 0,
    toolName: null,
    toolInput: null,
    toolOutput: null,
    toolStatus: null,
    errorType: null,
    errorMessage: null,
    metadata: {},
  },
  {
    eventId: "evt_004",
    sessionId: "sess_abc123def456",
    parentEventId: "evt_003",
    type: "response",
    timestamp: "2026-01-28T10:30:00.600Z",
    model: "gpt-5",
    role: "assistant",
    content:
      "The capital of France is Paris. It is the largest city in France and serves as the country's political, economic, and cultural center.",
    tokens: { promptTokens: 0, completionTokens: 32, totalTokens: 32 },
    cost: 0.0024,
    durationMs: 500,
    toolName: null,
    toolInput: null,
    toolOutput: null,
    toolStatus: null,
    errorType: null,
    errorMessage: null,
    metadata: { finishReason: "stop" },
  },
  {
    eventId: "evt_005",
    sessionId: "sess_abc123def456",
    parentEventId: null,
    type: "tool_call",
    timestamp: "2026-01-28T10:30:01.000Z",
    model: "gpt-5",
    role: null,
    content: null,
    tokens: null,
    cost: null,
    durationMs: 0,
    toolName: "web_search",
    toolInput: { query: "Paris population 2026" },
    toolOutput: null,
    toolStatus: null,
    errorType: null,
    errorMessage: null,
    metadata: {},
  },
  {
    eventId: "evt_006",
    sessionId: "sess_abc123def456",
    parentEventId: "evt_005",
    type: "tool_result",
    timestamp: "2026-01-28T10:30:01.500Z",
    model: null,
    role: null,
    content: null,
    tokens: null,
    cost: null,
    durationMs: 500,
    toolName: "web_search",
    toolInput: null,
    toolOutput: {
      results: [
        { title: "Paris Population", snippet: "2.1 million in city proper" },
      ],
    },
    toolStatus: "success",
    errorType: null,
    errorMessage: null,
    metadata: {},
  },
  {
    eventId: "evt_007",
    sessionId: "sess_abc123def456",
    parentEventId: null,
    type: "session_end",
    timestamp: "2026-01-28T10:30:04.200Z",
    model: null,
    role: null,
    content: null,
    tokens: null,
    cost: null,
    durationMs: 4200,
    toolName: null,
    toolInput: null,
    toolOutput: null,
    toolStatus: null,
    errorType: null,
    errorMessage: null,
    metadata: { status: "completed" },
  },
];

// Router
const router = new Hono();

/**
 * GET / - List sessions
 */
router.get("/", async (c) => {
  const query = c.req.query();
  const params = listQuerySchema.parse(query);
  const projectId = c.get("projectId");

  let filtered = mockSessions.filter(
    (s) => s.projectId === projectId || projectId === "proj_1",
  );

  // Apply filters
  if (params.status) {
    filtered = filtered.filter((s) => s.status === params.status);
  }
  if (params.userId) {
    filtered = filtered.filter((s) => s.userId === params.userId);
  }
  if (params.featureId) {
    filtered = filtered.filter((s) => s.featureId === params.featureId);
  }
  if (params.model) {
    filtered = filtered.filter((s) => s.models.includes(params.model!));
  }
  if (params.tags) {
    const requestedTags = params.tags.split(",");
    filtered = filtered.filter((s) =>
      requestedTags.some((tag) => s.tags.includes(tag)),
    );
  }

  // Sort
  filtered.sort((a, b) => {
    let aVal: string | number, bVal: string | number;
    switch (params.sortBy) {
      case "cost":
        aVal = a.totalCost;
        bVal = b.totalCost;
        break;
      case "duration":
        aVal = a.durationMs;
        bVal = b.durationMs;
        break;
      case "tokens":
        aVal = a.totalTokens;
        bVal = b.totalTokens;
        break;
      case "endedAt":
        aVal = a.endedAt;
        bVal = b.endedAt;
        break;
      default:
        aVal = a.startedAt;
        bVal = b.startedAt;
    }
    return params.sortOrder === "asc"
      ? aVal > bVal
        ? 1
        : -1
      : aVal < bVal
        ? 1
        : -1;
  });

  const total = filtered.length;
  const sessions = filtered.slice(params.offset, params.offset + params.limit);

  return c.json({
    data: sessions,
    pagination: {
      limit: params.limit,
      offset: params.offset,
      total,
      hasMore: params.offset + params.limit < total,
    },
  });
});

/**
 * GET /:sessionId - Get session details
 */
router.get("/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const projectId = c.get("projectId");

  const session = mockSessions.find(
    (s) =>
      s.sessionId === sessionId &&
      (s.projectId === projectId || projectId === "proj_1"),
  );

  if (!session) {
    return c.json({ error: "Not Found", message: "Session not found" }, 404);
  }

  return c.json({ data: session });
});

/**
 * GET /:sessionId/events - Get session events
 */
router.get("/:sessionId/events", async (c) => {
  const sessionId = c.req.param("sessionId");
  const limit = parseInt(c.req.query("limit") || "100", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const type = c.req.query("type");

  let events = mockEvents.filter((e) => e.sessionId === sessionId);

  if (type) {
    events = events.filter((e) => e.type === type);
  }

  const total = events.length;
  const paginatedEvents = events.slice(offset, offset + limit);

  return c.json({
    data: paginatedEvents,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
    },
  });
});

/**
 * GET /:sessionId/trace - Get session trace tree
 */
router.get("/:sessionId/trace", async (c) => {
  const sessionId = c.req.param("sessionId");

  const events = mockEvents.filter((e) => e.sessionId === sessionId);

  // Build tree structure
  const rootEvents = events.filter((e) => !e.parentEventId);
  const childMap = new Map<string, typeof events>();

  events.forEach((e) => {
    if (e.parentEventId) {
      const children = childMap.get(e.parentEventId) || [];
      children.push(e);
      childMap.set(e.parentEventId, children);
    }
  });

  type EventBase = (typeof events)[0];
  type EventTreeNode = EventBase & {
    children: EventTreeNode[];
  };

  const buildTree = (event: EventBase): EventTreeNode => ({
    ...event,
    children: (childMap.get(event.eventId) || []).map(buildTree),
  });

  const trace = rootEvents.map(buildTree);

  return c.json({ data: trace });
});

/**
 * GET /:sessionId/replay - Get session replay data
 */
router.get("/:sessionId/replay", async (c) => {
  const sessionId = c.req.param("sessionId");

  const session = mockSessions.find((s) => s.sessionId === sessionId);
  const events = mockEvents.filter((e) => e.sessionId === sessionId);

  if (!session) {
    return c.json({ error: "Not Found", message: "Session not found" }, 404);
  }

  return c.json({
    data: {
      session,
      events,
      timeline: events.map((e) => ({
        eventId: e.eventId,
        type: e.type,
        timestamp: e.timestamp,
        relativeTimeMs:
          new Date(e.timestamp).getTime() -
          new Date(session.startedAt).getTime(),
        durationMs: e.durationMs,
      })),
    },
  });
});

/**
 * DELETE /:sessionId - Delete a session (for compliance/GDPR)
 */
router.delete("/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");

  const index = mockSessions.findIndex((s) => s.sessionId === sessionId);
  if (index === -1) {
    return c.json({ error: "Not Found", message: "Session not found" }, 404);
  }

  // In production: soft delete or queue for deletion
  mockSessions.splice(index, 1);

  return c.json({
    data: {
      success: true,
      message: "Session scheduled for deletion",
      sessionId,
    },
  });
});

export { router as sessionsRouter };
