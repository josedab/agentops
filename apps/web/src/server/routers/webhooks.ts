import { z } from "zod";
import { router, publicProcedure } from "../trpc";

// Mock webhooks
const mockWebhooks = [
  {
    id: "wh_1",
    projectId: "proj_1",
    name: "Slack Notifications",
    url: "https://hooks.slack.com/services/xxx/yyy/zzz",
    events: ["session.error", "alert.triggered"],
    secret: "whsec_xxx",
    enabled: true,
    lastDeliveryAt: new Date("2026-01-28T10:00:00Z"),
    lastDeliveryStatus: "success" as const,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "wh_2",
    projectId: "proj_1",
    name: "Analytics Pipeline",
    url: "https://analytics.example.com/webhook",
    events: ["session.completed"],
    secret: "whsec_yyy",
    enabled: true,
    lastDeliveryAt: new Date("2026-01-28T09:55:00Z"),
    lastDeliveryStatus: "success" as const,
    createdAt: new Date("2026-01-15T00:00:00Z"),
  },
];

const mockWebhookDeliveries = [
  {
    id: "whd_1",
    webhookId: "wh_1",
    event: "alert.triggered",
    payload: { alertId: "alert_1", severity: "critical" },
    status: "success" as const,
    responseCode: 200,
    responseTime: 234,
    attemptCount: 1,
    deliveredAt: new Date("2026-01-28T10:00:00Z"),
  },
  {
    id: "whd_2",
    webhookId: "wh_1",
    event: "session.error",
    payload: { sessionId: "sess_123", error: "Rate limit exceeded" },
    status: "success" as const,
    responseCode: 200,
    responseTime: 189,
    attemptCount: 1,
    deliveredAt: new Date("2026-01-28T09:30:00Z"),
  },
  {
    id: "whd_3",
    webhookId: "wh_2",
    event: "session.completed",
    payload: { sessionId: "sess_456", cost: 0.023 },
    status: "failed" as const,
    responseCode: 500,
    responseTime: 5000,
    attemptCount: 3,
    deliveredAt: new Date("2026-01-27T15:00:00Z"),
  },
];

export const webhooksRouter = router({
  // List webhooks
  list: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
      }),
    )
    .query(async () => {
      return mockWebhooks.map((w) => ({
        ...w,
        secret: undefined, // Don't expose secret in list
      }));
    }),

  // Get webhook with secret (for editing)
  get: publicProcedure
    .input(
      z.object({
        webhookId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const webhook = mockWebhooks.find((w) => w.id === input.webhookId);
      return webhook ?? null;
    }),

  // Create webhook
  create: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(255),
        url: z.string().url(),
        events: z.array(
          z.enum([
            "session.started",
            "session.completed",
            "session.error",
            "alert.triggered",
            "alert.resolved",
            "cost.threshold",
          ]),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      const secret = `whsec_${Math.random().toString(36).slice(2)}`;
      const webhook = {
        id: `wh_${Date.now()}`,
        ...input,
        secret,
        enabled: true,
        lastDeliveryAt: null as Date | null,
        lastDeliveryStatus: null as "success" | "failed" | null,
        createdAt: new Date(),
      };
      mockWebhooks.push(webhook as any);
      return webhook;
    }),

  // Update webhook
  update: publicProcedure
    .input(
      z.object({
        webhookId: z.string(),
        name: z.string().optional(),
        url: z.string().url().optional(),
        events: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const webhook = mockWebhooks.find((w) => w.id === input.webhookId);
      if (!webhook) return null;

      if (input.name) webhook.name = input.name;
      if (input.url) webhook.url = input.url;
      if (input.events) webhook.events = input.events;
      if (input.enabled !== undefined) webhook.enabled = input.enabled;

      return webhook;
    }),

  // Rotate webhook secret
  rotateSecret: publicProcedure
    .input(
      z.object({
        webhookId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const webhook = mockWebhooks.find((w) => w.id === input.webhookId);
      if (!webhook) return null;

      webhook.secret = `whsec_${Math.random().toString(36).slice(2)}`;
      return { secret: webhook.secret };
    }),

  // Delete webhook
  delete: publicProcedure
    .input(
      z.object({
        webhookId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const index = mockWebhooks.findIndex((w) => w.id === input.webhookId);
      if (index === -1) return { success: false };
      mockWebhooks.splice(index, 1);
      return { success: true };
    }),

  // Test webhook
  test: publicProcedure
    .input(
      z.object({
        webhookId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const webhook = mockWebhooks.find((w) => w.id === input.webhookId);
      if (!webhook) return null;

      // Simulate test delivery
      return {
        success: true,
        responseCode: 200,
        responseTime: 150 + Math.random() * 100,
        message: "Test webhook delivered successfully",
      };
    }),

  // Get delivery history
  getDeliveries: publicProcedure
    .input(
      z.object({
        webhookId: z.string(),
        status: z.enum(["success", "failed"]).optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ input }) => {
      let deliveries = mockWebhookDeliveries.filter(
        (d) => d.webhookId === input.webhookId,
      );
      if (input.status) {
        deliveries = deliveries.filter((d) => d.status === input.status);
      }
      return deliveries.slice(0, input.limit);
    }),

  // Retry failed delivery
  retryDelivery: publicProcedure
    .input(
      z.object({
        deliveryId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const delivery = mockWebhookDeliveries.find(
        (d) => d.id === input.deliveryId,
      );
      if (!delivery) return null;

      // Simulate retry
      delivery.status = "success";
      delivery.responseCode = 200;
      delivery.attemptCount += 1;
      delivery.deliveredAt = new Date();

      return delivery;
    }),
});
