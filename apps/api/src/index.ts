/**
 * AgentOps API Server
 *
 * REST API for querying session data, metrics, and managing configurations.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { sessionsRouter } from "./routers/sessions.js";
import { metricsRouter } from "./routers/metrics.js";
import { alertsRouter } from "./routers/alerts.js";
import { apiKeysRouter } from "./routers/apiKeys.js";
import { webhooksRouter } from "./routers/webhooks.js";
import { exportRouter } from "./routers/export.js";
import { projectsRouter } from "./routers/projects.js";

// Types
export interface Env {
  CLICKHOUSE_URL: string;
  CLICKHOUSE_PASSWORD: string;
  DATABASE_URL: string;
  API_SECRET: string;
}

export interface Variables {
  projectId: string;
  userId?: string;
}

// Create app
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    maxAge: 86400,
  }),
);

// Health check endpoints
app.get("/health", (c) =>
  c.json({
    status: "ok",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  }),
);

app.get("/ready", (c) =>
  c.json({
    status: "ready",
    services: {
      database: "ok",
      clickhouse: "ok",
    },
  }),
);

// API info
app.get("/", (c) =>
  c.json({
    name: "AgentOps API",
    version: "0.1.0",
    documentation: "https://docs.agentops.dev/api",
    endpoints: {
      sessions: "/v1/sessions",
      metrics: "/v1/metrics",
      alerts: "/v1/alerts",
      apiKeys: "/v1/api-keys",
      webhooks: "/v1/webhooks",
      export: "/v1/export",
      projects: "/v1/projects",
    },
  }),
);

// Auth middleware for API routes
const authMiddleware = async (
  c: {
    req: { header: (name: string) => string | undefined };
    json: (body: object, status?: number) => Response;
    set: (key: string, value: string) => void;
  },
  next: () => Promise<void>,
) => {
  const authHeader = c.req.header("Authorization");
  const apiKey = c.req.header("X-API-Key");

  const key =
    apiKey || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

  if (!key) {
    return c.json(
      {
        error: "Unauthorized",
        message:
          "Missing API key. Provide via Authorization header or X-API-Key header.",
      },
      401,
    );
  }

  // Validate API key format
  if (!key.startsWith("ao_") || key.length < 32) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Invalid API key format.",
      },
      401,
    );
  }

  // Extract project ID from key (format: ao_<projectId>_<secret>)
  const parts = key.split("_");
  const projectId = parts.length >= 2 ? parts[1] : "default";

  // TODO: Validate key against database
  c.set("projectId", projectId);

  await next();
};

// Apply auth to all /v1 routes
app.use("/v1/*", authMiddleware);

// Mount routers
app.route("/v1/sessions", sessionsRouter);
app.route("/v1/metrics", metricsRouter);
app.route("/v1/alerts", alertsRouter);
app.route("/v1/api-keys", apiKeysRouter);
app.route("/v1/webhooks", webhooksRouter);
app.route("/v1/export", exportRouter);
app.route("/v1/projects", projectsRouter);

// 404 handler
app.notFound((c) =>
  c.json(
    {
      error: "Not Found",
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404,
  ),
);

// Error handler
app.onError((err, c) => {
  console.error("API Error:", err);

  return c.json(
    {
      error: "Internal Server Error",
      message:
        process.env.NODE_ENV === "development"
          ? err.message
          : "An unexpected error occurred",
    },
    500,
  );
});

// Start server
const port = parseInt(process.env.PORT || "3001", 10);

console.log(`🚀 AgentOps API server starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
