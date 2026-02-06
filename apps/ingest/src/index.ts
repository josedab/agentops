/**
 * AgentOps Ingestion API
 *
 * Edge-deployed event ingestion service using Hono on Cloudflare Workers.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bearerAuth } from "hono/bearer-auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { calculateCost, EVENT_TYPES } from "@agentops/shared";

// Types for Cloudflare Workers environment
interface Env {
  ENVIRONMENT: string;
  CLICKHOUSE_URL?: string;
  CLICKHOUSE_PASSWORD?: string;
  API_KEY_SECRET?: string;
}

interface Variables {
  projectId: string;
}

type AppEnv = { Bindings: Env; Variables: Variables };

// Event schema validation
const EventSchema = z.object({
  eventId: z.string(),
  sessionId: z.string(),
  parentEventId: z.string().optional(),
  type: z.enum(EVENT_TYPES),
  timestamp: z.number(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),

  // Session events
  userId: z.string().optional(),
  featureId: z.string().optional(),
  status: z.enum(["completed", "error"]).optional(),
  errorMessage: z.string().optional(),

  // Prompt/Response events
  role: z.enum(["user", "system", "assistant"]).optional(),
  content: z.union([z.string(), z.array(z.unknown())]).optional(),
  model: z.string().optional(),
  durationMs: z.number().optional(),
  tokens: z
    .object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
    })
    .optional(),
  finishReason: z.string().optional(),

  // Tool events
  toolName: z.string().optional(),
  toolInput: z.unknown().optional(),
  toolOutput: z.unknown().optional(),
  mcpServer: z.string().optional(),

  // Error events
  errorType: z.string().optional(),
  stackTrace: z.string().optional(),

  // Custom events
  name: z.string().optional(),
  data: z.unknown().optional(),
});

const BatchSchema = z.object({
  events: z.array(EventSchema).min(1).max(1000),
  sdkVersion: z.string(),
  timestamp: z.number(),
});

type Event = z.infer<typeof EventSchema>;
type Batch = z.infer<typeof BatchSchema>;

// Create Hono app
const app = new Hono<AppEnv>();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-AgentOps-SDK-Version"],
    maxAge: 86400,
  }),
);

// Health check (no auth required)
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "0.1.0",
    environment: c.env.ENVIRONMENT,
  });
});

// Ready check
app.get("/ready", (c) => {
  // Check if required services are available
  const ready = !!c.env.CLICKHOUSE_URL;

  if (!ready) {
    return c.json(
      { status: "not_ready", reason: "Missing ClickHouse configuration" },
      503,
    );
  }

  return c.json({ status: "ready" });
});

// API routes with authentication
const api = new Hono<AppEnv>();

// Simple API key validation (in production, validate against database)
api.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      { success: false, message: "Missing or invalid Authorization header" },
      401,
    );
  }

  const apiKey = authHeader.slice(7);

  // Basic validation: API keys should start with 'ao_' and be at least 32 chars
  if (!apiKey.startsWith("ao_") || apiKey.length < 32) {
    return c.json({ success: false, message: "Invalid API key format" }, 401);
  }

  // In production, validate against database
  // For now, accept any well-formed key

  // Store project info in context for later use
  c.set("projectId", extractProjectId(apiKey));

  await next();
});

/**
 * POST /v1/events - Batch event ingestion
 */
api.post("/v1/events", zValidator("json", BatchSchema), async (c) => {
  const batch = c.req.valid("json") as Batch;
  const projectId = (c.get("projectId") as string) ?? "default";

  try {
    // Enrich events with project ID and calculate costs
    const enrichedEvents = batch.events.map((event) =>
      enrichEvent(event, projectId),
    );

    // Write to ClickHouse
    if (c.env.CLICKHOUSE_URL) {
      await writeToClickHouse(
        enrichedEvents,
        c.env.CLICKHOUSE_URL,
        c.env.CLICKHOUSE_PASSWORD ?? "",
      );
    } else {
      // Development mode: just log
      console.log(
        `[DEV] Received ${enrichedEvents.length} events for project ${projectId}`,
      );
    }

    return c.json({
      success: true,
      eventCount: batch.events.length,
      message: "Events ingested successfully",
    });
  } catch (error) {
    console.error("Failed to ingest events:", error);

    return c.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      500,
    );
  }
});

/**
 * GET /v1/status - Check API status and usage
 */
api.get("/v1/status", async (c) => {
  const projectId = (c.get("projectId") as string) ?? "default";

  return c.json({
    success: true,
    projectId,
    status: "active",
    usage: {
      eventsThisMonth: 0, // TODO: Query from ClickHouse
      limit: 100000,
    },
  });
});

// Mount API routes
app.route("/", api);

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, message: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);

  return c.json(
    {
      success: false,
      message:
        c.env.ENVIRONMENT === "production"
          ? "Internal server error"
          : err.message,
    },
    500,
  );
});

// ============================================================================
// Helper Functions
// ============================================================================

function extractProjectId(apiKey: string): string {
  // API key format: ao_<projectId>_<secret>
  const parts = apiKey.split("_");
  if (parts.length >= 2) {
    return parts[1];
  }
  return "default";
}

interface EnrichedEvent extends Event {
  projectId: string;
  cost?: number;
  receivedAt: number;
}

function enrichEvent(event: Event, projectId: string): EnrichedEvent {
  const enriched: EnrichedEvent = {
    ...event,
    projectId,
    receivedAt: Date.now(),
  };

  // Calculate cost for response events
  if (event.type === "response" && event.tokens && event.model) {
    const { totalCost } = calculateCost(
      event.model,
      event.tokens.promptTokens,
      event.tokens.completionTokens,
    );
    enriched.cost = totalCost;
  }

  return enriched;
}

async function writeToClickHouse(
  events: EnrichedEvent[],
  url: string,
  password: string,
): Promise<void> {
  // Convert events to ClickHouse JSON format
  const rows = events.map((event) => ({
    event_id: event.eventId,
    session_id: event.sessionId,
    project_id: event.projectId,
    parent_event_id: event.parentEventId ?? null,
    event_type: event.type,
    user_id: event.userId ?? null,
    feature_id: event.featureId ?? null,
    model: event.model ?? null,
    content:
      typeof event.content === "string"
        ? event.content
        : JSON.stringify(event.content ?? null),
    prompt_tokens: event.tokens?.promptTokens ?? 0,
    completion_tokens: event.tokens?.completionTokens ?? 0,
    total_tokens: event.tokens?.totalTokens ?? 0,
    cost: event.cost ?? 0,
    duration_ms: event.durationMs ?? 0,
    tool_name: event.toolName ?? null,
    tool_status:
      event.type === "tool_result" ? (event.status ?? "success") : null,
    metadata: JSON.stringify(event.metadata ?? {}),
    tags: event.tags ?? [],
    timestamp: new Date(event.timestamp).toISOString(),
  }));

  const ndjson = rows.map((row) => JSON.stringify(row)).join("\n");

  const response = await fetch(
    `${url}/?query=INSERT INTO events FORMAT JSONEachRow`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-ndjson",
        "X-ClickHouse-User": "default",
        "X-ClickHouse-Key": password,
      },
      body: ndjson,
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ClickHouse error: ${error}`);
  }
}

export default app;
