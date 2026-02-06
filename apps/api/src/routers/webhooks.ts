/**
 * Webhooks Router
 *
 * API endpoints for managing webhook configurations.
 */

import { Hono } from "hono";
import type { Env, Variables } from "../index.js";
import { z } from "zod";
import { randomBytes } from "crypto";

// Schemas
const createWebhookSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  events: z
    .array(
      z.enum([
        "session.started",
        "session.ended",
        "session.error",
        "alert.triggered",
        "alert.resolved",
        "budget.warning",
        "budget.exceeded",
        "anomaly.detected",
      ]),
    )
    .min(1),
  headers: z.record(z.string()).optional(),
  filters: z
    .object({
      features: z.array(z.string()).optional(),
      severities: z.array(z.enum(["info", "warning", "critical"])).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  enabled: z.boolean().default(true),
  retryPolicy: z
    .object({
      maxRetries: z.number().min(0).max(10).default(3),
      retryDelayMs: z.number().min(1000).max(60000).default(5000),
    })
    .optional(),
});

const updateWebhookSchema = createWebhookSchema.partial();

// Webhook type definition
interface WebhookConfig {
  id: string;
  projectId: string;
  name: string;
  url: string;
  events: string[];
  headers: Record<string, string>;
  secret: string;
  filters: Record<string, unknown> | null;
  enabled: boolean;
  retryPolicy: { maxRetries: number; retryDelayMs: number };
  lastDeliveryAt: string | null;
  lastDeliveryStatus: string | null;
  deliveryCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

// Mock data
const mockWebhooks: WebhookConfig[] = [
  {
    id: "webhook_001",
    projectId: "proj_1",
    name: "Slack Notifications",
    url: "https://hooks.slack.com/services/T00000/B00000/XXXXXXXXXX",
    events: ["alert.triggered", "alert.resolved", "session.error"],
    headers: {},
    secret: "whsec_abc123def456",
    filters: { severities: ["warning", "critical"] },
    enabled: true,
    retryPolicy: { maxRetries: 3, retryDelayMs: 5000 },
    lastDeliveryAt: "2026-01-28T09:15:00Z",
    lastDeliveryStatus: "success",
    deliveryCount: 45,
    failureCount: 2,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-25T10:30:00Z",
  },
  {
    id: "webhook_002",
    projectId: "proj_1",
    name: "Analytics Pipeline",
    url: "https://api.analytics.company.com/webhooks/agentops",
    events: ["session.started", "session.ended"],
    headers: { "X-Source": "agentops", "X-Environment": "production" },
    secret: "whsec_ghi789jkl012",
    filters: null,
    enabled: true,
    retryPolicy: { maxRetries: 5, retryDelayMs: 10000 },
    lastDeliveryAt: "2026-01-28T10:30:04Z",
    lastDeliveryStatus: "success",
    deliveryCount: 1250,
    failureCount: 8,
    createdAt: "2026-01-10T00:00:00Z",
    updatedAt: "2026-01-10T00:00:00Z",
  },
  {
    id: "webhook_003",
    projectId: "proj_1",
    name: "Budget Monitor",
    url: "https://internal.company.com/budget-alerts",
    events: ["budget.warning", "budget.exceeded"],
    headers: {},
    secret: "whsec_mno345pqr678",
    filters: null,
    enabled: false,
    retryPolicy: { maxRetries: 3, retryDelayMs: 5000 },
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    deliveryCount: 0,
    failureCount: 0,
    createdAt: "2026-01-20T00:00:00Z",
    updatedAt: "2026-01-28T08:00:00Z",
  },
];

const mockDeliveryLogs = [
  {
    id: "delivery_001",
    webhookId: "webhook_001",
    event: "alert.triggered",
    status: "success",
    statusCode: 200,
    requestBody: {
      event: "alert.triggered",
      alertId: "alert_001",
      severity: "critical",
    },
    responseBody: { ok: true },
    durationMs: 245,
    attemptNumber: 1,
    createdAt: "2026-01-28T09:15:00Z",
  },
  {
    id: "delivery_002",
    webhookId: "webhook_002",
    event: "session.ended",
    status: "success",
    statusCode: 200,
    requestBody: { event: "session.ended", sessionId: "sess_abc123" },
    responseBody: { received: true },
    durationMs: 180,
    attemptNumber: 1,
    createdAt: "2026-01-28T10:30:04Z",
  },
  {
    id: "delivery_003",
    webhookId: "webhook_001",
    event: "session.error",
    status: "failed",
    statusCode: 500,
    requestBody: { event: "session.error", sessionId: "sess_xyz789" },
    responseBody: { error: "Internal server error" },
    durationMs: 5420,
    attemptNumber: 3,
    errorMessage: "Max retries exceeded",
    createdAt: "2026-01-27T14:30:00Z",
  },
];

// Helper to generate webhook secret
function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

// Router
const router = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET / - List webhooks
 */
router.get("/", async (c) => {
  const projectId = c.get("projectId");
  const enabled = c.req.query("enabled");

  let webhooks = mockWebhooks.filter(
    (w) => w.projectId === projectId || projectId === "proj_1",
  );

  if (enabled !== undefined) {
    webhooks = webhooks.filter((w) => w.enabled === (enabled === "true"));
  }

  // Don't expose secrets in list view
  const sanitized = webhooks.map(({ secret, ...rest }) => ({
    ...rest,
    hasSecret: !!secret,
  }));

  return c.json({ data: sanitized });
});

/**
 * GET /:webhookId - Get webhook details
 */
router.get("/:webhookId", async (c) => {
  const webhookId = c.req.param("webhookId");

  const webhook = mockWebhooks.find((w) => w.id === webhookId);
  if (!webhook) {
    return c.json({ error: "Not Found", message: "Webhook not found" }, 404);
  }

  // Don't expose secret
  const { secret, ...sanitized } = webhook;

  return c.json({
    data: {
      ...sanitized,
      hasSecret: !!secret,
    },
  });
});

/**
 * POST / - Create webhook
 */
router.post("/", async (c) => {
  const body = await c.req.json();
  const projectId = c.get("projectId") ?? "proj_1";

  const validated = createWebhookSchema.parse(body);
  const secret = generateWebhookSecret();

  const newWebhook = {
    id: `webhook_${Date.now()}`,
    projectId,
    name: validated.name,
    url: validated.url,
    events: validated.events,
    headers: validated.headers ?? {},
    secret,
    filters: validated.filters ?? null,
    enabled: validated.enabled,
    retryPolicy: validated.retryPolicy ?? { maxRetries: 3, retryDelayMs: 5000 },
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    deliveryCount: 0,
    failureCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  mockWebhooks.push(newWebhook as WebhookConfig);

  // Return secret only on creation
  return c.json(
    {
      data: newWebhook,
      warning: "Save the webhook secret now. It will not be shown again.",
    },
    201,
  );
});

/**
 * PATCH /:webhookId - Update webhook
 */
router.patch("/:webhookId", async (c) => {
  const webhookId = c.req.param("webhookId");
  const body = await c.req.json();

  const webhook = mockWebhooks.find((w) => w.id === webhookId);
  if (!webhook) {
    return c.json({ error: "Not Found", message: "Webhook not found" }, 404);
  }

  const validated = updateWebhookSchema.parse(body);
  Object.assign(webhook, validated, { updatedAt: new Date().toISOString() });

  const { secret, ...sanitized } = webhook;

  return c.json({
    data: {
      ...sanitized,
      hasSecret: !!secret,
    },
  });
});

/**
 * DELETE /:webhookId - Delete webhook
 */
router.delete("/:webhookId", async (c) => {
  const webhookId = c.req.param("webhookId");

  const index = mockWebhooks.findIndex((w) => w.id === webhookId);
  if (index === -1) {
    return c.json({ error: "Not Found", message: "Webhook not found" }, 404);
  }

  mockWebhooks.splice(index, 1);

  return c.json({ data: { success: true, message: "Webhook deleted" } });
});

/**
 * POST /:webhookId/test - Test webhook
 */
router.post("/:webhookId/test", async (c) => {
  const webhookId = c.req.param("webhookId");

  const webhook = mockWebhooks.find((w) => w.id === webhookId);
  if (!webhook) {
    return c.json({ error: "Not Found", message: "Webhook not found" }, 404);
  }

  // In production: send test event to webhook URL
  const testPayload = {
    event: "test",
    webhookId: webhook.id,
    timestamp: new Date().toISOString(),
    message: "This is a test delivery from AgentOps",
  };

  // Mock successful test
  return c.json({
    data: {
      success: true,
      message: "Test webhook delivered successfully",
      statusCode: 200,
      durationMs: 156,
      payload: testPayload,
    },
  });
});

/**
 * POST /:webhookId/rotate-secret - Rotate webhook secret
 */
router.post("/:webhookId/rotate-secret", async (c) => {
  const webhookId = c.req.param("webhookId");

  const webhook = mockWebhooks.find((w) => w.id === webhookId);
  if (!webhook) {
    return c.json({ error: "Not Found", message: "Webhook not found" }, 404);
  }

  const newSecret = generateWebhookSecret();
  webhook.secret = newSecret;
  webhook.updatedAt = new Date().toISOString();

  return c.json({
    data: {
      webhookId,
      secret: newSecret,
      rotatedAt: webhook.updatedAt,
    },
    warning: "Save the new webhook secret now. It will not be shown again.",
  });
});

/**
 * GET /:webhookId/deliveries - Get delivery logs
 */
router.get("/:webhookId/deliveries", async (c) => {
  const webhookId = c.req.param("webhookId");
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  let deliveries = mockDeliveryLogs.filter((d) => d.webhookId === webhookId);

  if (status) {
    deliveries = deliveries.filter((d) => d.status === status);
  }

  const total = deliveries.length;
  const logs = deliveries.slice(offset, offset + limit);

  return c.json({
    data: logs,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
    },
  });
});

/**
 * POST /:webhookId/deliveries/:deliveryId/retry - Retry failed delivery
 */
router.post("/:webhookId/deliveries/:deliveryId/retry", async (c) => {
  const webhookId = c.req.param("webhookId");
  const deliveryId = c.req.param("deliveryId");

  const delivery = mockDeliveryLogs.find(
    (d) => d.id === deliveryId && d.webhookId === webhookId,
  );

  if (!delivery) {
    return c.json(
      { error: "Not Found", message: "Delivery log not found" },
      404,
    );
  }

  if (delivery.status === "success") {
    return c.json(
      { error: "Bad Request", message: "Cannot retry successful delivery" },
      400,
    );
  }

  // In production: actually retry the webhook

  return c.json({
    data: {
      success: true,
      message: "Delivery retry queued",
      originalDeliveryId: deliveryId,
      retryDeliveryId: `delivery_retry_${Date.now()}`,
    },
  });
});

export { router as webhooksRouter };
