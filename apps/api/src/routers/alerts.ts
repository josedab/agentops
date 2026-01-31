/**
 * Alerts Router
 *
 * API endpoints for managing alerts and alert history.
 */

import { Hono } from "hono";
import { z } from "zod";

// Schemas
const createAlertSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  condition: z.object({
    metric: z.enum([
      "error_rate",
      "latency_p95",
      "latency_avg",
      "cost_hourly",
      "cost_daily",
      "token_usage",
      "session_count",
    ]),
    operator: z.enum(["gt", "gte", "lt", "lte", "eq"]),
    threshold: z.number(),
    window: z.enum(["1m", "5m", "15m", "30m", "1h", "6h", "24h"]).default("5m"),
  }),
  severity: z.enum(["info", "warning", "critical"]),
  channels: z
    .array(
      z.object({
        type: z.enum(["slack", "email", "pagerduty", "webhook", "sms"]),
        target: z.string(),
        config: z.record(z.unknown()).optional(),
      }),
    )
    .min(1),
  filters: z
    .object({
      features: z.array(z.string()).optional(),
      models: z.array(z.string()).optional(),
      users: z.array(z.string()).optional(),
    })
    .optional(),
  cooldownMinutes: z.number().min(1).max(1440).default(15),
  enabled: z.boolean().default(true),
});

const updateAlertSchema = createAlertSchema.partial();

// Alert type definition
interface AlertConfig {
  id: string;
  projectId: string;
  name: string;
  description: string;
  condition: {
    metric: string;
    operator: string;
    threshold: number;
    window: string;
  };
  severity: string;
  channels: Array<{
    type: string;
    target: string;
    config?: Record<string, unknown>;
  }>;
  filters: { features?: string[]; models?: string[]; users?: string[] } | null;
  cooldownMinutes: number;
  enabled: boolean;
  lastTriggeredAt: string | null;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

// Mock data
const mockAlerts: AlertConfig[] = [
  {
    id: "alert_001",
    projectId: "proj_1",
    name: "High Error Rate",
    description: "Triggers when error rate exceeds 5% over 5 minutes",
    condition: {
      metric: "error_rate",
      operator: "gt",
      threshold: 5,
      window: "5m",
    },
    severity: "critical",
    channels: [
      {
        type: "slack",
        target: "#alerts-critical",
        config: { mentions: ["@oncall"] },
      },
      { type: "email", target: "oncall@company.com" },
    ],
    filters: null,
    cooldownMinutes: 15,
    enabled: true,
    lastTriggeredAt: "2026-01-28T09:15:00Z",
    triggerCount: 3,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-25T10:30:00Z",
  },
  {
    id: "alert_002",
    projectId: "proj_1",
    name: "Cost Budget Warning",
    description: "Triggers when daily cost exceeds $100",
    condition: {
      metric: "cost_daily",
      operator: "gt",
      threshold: 100,
      window: "24h",
    },
    severity: "warning",
    channels: [{ type: "email", target: "team@company.com" }],
    filters: null,
    cooldownMinutes: 60,
    enabled: true,
    lastTriggeredAt: null,
    triggerCount: 0,
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
  },
  {
    id: "alert_003",
    projectId: "proj_1",
    name: "High Latency - Code Review",
    description: "Triggers when p95 latency exceeds 5s for code-review feature",
    condition: {
      metric: "latency_p95",
      operator: "gt",
      threshold: 5000,
      window: "15m",
    },
    severity: "warning",
    channels: [{ type: "slack", target: "#code-review-team" }],
    filters: {
      features: ["code-review"],
    },
    cooldownMinutes: 30,
    enabled: false,
    lastTriggeredAt: "2026-01-27T14:30:00Z",
    triggerCount: 2,
    createdAt: "2026-01-10T00:00:00Z",
    updatedAt: "2026-01-28T08:00:00Z",
  },
];

// Alert history event type
interface AlertHistoryEvent {
  id: string;
  alertId: string;
  alertName: string;
  projectId: string;
  severity: string;
  status: string;
  triggeredAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  value: number;
  threshold: number;
  details: Record<string, unknown>;
}

const mockAlertHistory: AlertHistoryEvent[] = [
  {
    id: "event_001",
    alertId: "alert_001",
    alertName: "High Error Rate",
    projectId: "proj_1",
    severity: "critical",
    status: "resolved",
    triggeredAt: "2026-01-28T09:15:00Z",
    resolvedAt: "2026-01-28T09:28:00Z",
    acknowledgedAt: "2026-01-28T09:17:00Z",
    acknowledgedBy: "user_456",
    value: 7.2,
    threshold: 5,
    details: {
      affectedSessions: 8,
      topError: "rate_limit",
      features: ["chat-agent"],
    },
  },
  {
    id: "event_002",
    alertId: "alert_003",
    alertName: "High Latency - Code Review",
    projectId: "proj_1",
    severity: "warning",
    status: "acknowledged",
    triggeredAt: "2026-01-27T14:30:00Z",
    resolvedAt: null,
    acknowledgedAt: "2026-01-27T14:45:00Z",
    acknowledgedBy: "user_789",
    value: 6234,
    threshold: 5000,
    details: {
      p95Latency: 6234,
      avgLatency: 4520,
      sampleSize: 45,
    },
  },
  {
    id: "event_003",
    alertId: "alert_001",
    alertName: "High Error Rate",
    projectId: "proj_1",
    severity: "critical",
    status: "resolved",
    triggeredAt: "2026-01-26T15:00:00Z",
    resolvedAt: "2026-01-26T15:12:00Z",
    acknowledgedAt: null,
    acknowledgedBy: null,
    value: 8.5,
    threshold: 5,
    details: {
      affectedSessions: 12,
      topError: "timeout",
      features: ["chat-agent", "code-review"],
    },
  },
];

// Router
const router = new Hono();

/**
 * GET / - List all alerts
 */
router.get("/", async (c) => {
  const projectId = c.get("projectId");
  const enabled = c.req.query("enabled");
  const severity = c.req.query("severity");

  let alerts = mockAlerts.filter(
    (a) => a.projectId === projectId || projectId === "proj_1",
  );

  if (enabled !== undefined) {
    alerts = alerts.filter((a) => a.enabled === (enabled === "true"));
  }
  if (severity) {
    alerts = alerts.filter((a) => a.severity === severity);
  }

  return c.json({ data: alerts });
});

/**
 * GET /:alertId - Get alert details
 */
router.get("/:alertId", async (c) => {
  const alertId = c.req.param("alertId");

  const alert = mockAlerts.find((a) => a.id === alertId);
  if (!alert) {
    return c.json({ error: "Not Found", message: "Alert not found" }, 404);
  }

  return c.json({ data: alert });
});

/**
 * POST / - Create new alert
 */
router.post("/", async (c) => {
  const body = await c.req.json();
  const projectId = c.get("projectId");

  const validated = createAlertSchema.parse(body);

  const newAlert = {
    id: `alert_${Date.now()}`,
    projectId,
    ...validated,
    filters: validated.filters ?? null,
    lastTriggeredAt: null,
    triggerCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  mockAlerts.push(newAlert as AlertConfig);

  return c.json({ data: newAlert }, 201);
});

/**
 * PATCH /:alertId - Update alert
 */
router.patch("/:alertId", async (c) => {
  const alertId = c.req.param("alertId");
  const body = await c.req.json();

  const alert = mockAlerts.find((a) => a.id === alertId);
  if (!alert) {
    return c.json({ error: "Not Found", message: "Alert not found" }, 404);
  }

  const validated = updateAlertSchema.parse(body);
  Object.assign(alert, validated, { updatedAt: new Date().toISOString() });

  return c.json({ data: alert });
});

/**
 * DELETE /:alertId - Delete alert
 */
router.delete("/:alertId", async (c) => {
  const alertId = c.req.param("alertId");

  const index = mockAlerts.findIndex((a) => a.id === alertId);
  if (index === -1) {
    return c.json({ error: "Not Found", message: "Alert not found" }, 404);
  }

  mockAlerts.splice(index, 1);

  return c.json({ data: { success: true, message: "Alert deleted" } });
});

/**
 * POST /:alertId/test - Test alert (trigger a test notification)
 */
router.post("/:alertId/test", async (c) => {
  const alertId = c.req.param("alertId");

  const alert = mockAlerts.find((a) => a.id === alertId);
  if (!alert) {
    return c.json({ error: "Not Found", message: "Alert not found" }, 404);
  }

  // In production: send test notifications to all channels

  return c.json({
    data: {
      success: true,
      message: "Test notification sent to all channels",
      channels: alert.channels.map((ch) => ch.type),
    },
  });
});

/**
 * GET /history - Get alert history/events
 */
router.get("/history/list", async (c) => {
  const projectId = c.get("projectId");
  const alertId = c.req.query("alertId");
  const status = c.req.query("status");
  const severity = c.req.query("severity");
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  let history = mockAlertHistory.filter(
    (h) => h.projectId === projectId || projectId === "proj_1",
  );

  if (alertId) {
    history = history.filter((h) => h.alertId === alertId);
  }
  if (status) {
    history = history.filter((h) => h.status === status);
  }
  if (severity) {
    history = history.filter((h) => h.severity === severity);
  }

  const total = history.length;
  const events = history.slice(offset, offset + limit);

  return c.json({
    data: events,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
    },
  });
});

/**
 * POST /history/:eventId/acknowledge - Acknowledge alert event
 */
router.post("/history/:eventId/acknowledge", async (c) => {
  const eventId = c.req.param("eventId");

  const event = mockAlertHistory.find((h) => h.id === eventId);
  if (!event) {
    return c.json(
      { error: "Not Found", message: "Alert event not found" },
      404,
    );
  }

  event.status = "acknowledged";
  event.acknowledgedAt = new Date().toISOString();
  event.acknowledgedBy = "current_user"; // Would come from auth context

  return c.json({ data: event });
});

/**
 * POST /history/:eventId/resolve - Resolve alert event
 */
router.post("/history/:eventId/resolve", async (c) => {
  const eventId = c.req.param("eventId");
  const body = await c.req.json().catch(() => ({}));

  const event = mockAlertHistory.find((h) => h.id === eventId);
  if (!event) {
    return c.json(
      { error: "Not Found", message: "Alert event not found" },
      404,
    );
  }

  event.status = "resolved";
  event.resolvedAt = new Date().toISOString();
  if (body.note) {
    (event.details as Record<string, unknown>).resolutionNote = body.note;
  }

  return c.json({ data: event });
});

export { router as alertsRouter };
