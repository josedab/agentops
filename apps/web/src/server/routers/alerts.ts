import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

const mockAlerts = [
  {
    id: 'alert_1',
    name: 'High Error Rate',
    description: 'Triggers when error rate exceeds 5%',
    condition: { metric: 'error_rate', operator: '>', threshold: 5, window: '5m' },
    severity: 'critical' as const,
    enabled: true,
    channels: [{ type: 'slack', webhook: 'https://...' }],
    lastTriggeredAt: new Date('2026-01-28T09:15:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'alert_2',
    name: 'Cost Anomaly',
    description: 'Triggers when hourly cost is 2x the 7-day average',
    condition: { metric: 'hourly_cost', operator: '>', threshold: '2x_7d_avg' },
    severity: 'warning' as const,
    enabled: true,
    channels: [{ type: 'email', address: 'team@company.com' }],
    lastTriggeredAt: null,
    createdAt: new Date('2026-01-15T00:00:00Z'),
  },
  {
    id: 'alert_3',
    name: 'High Latency',
    description: 'Triggers when p95 latency exceeds 5 seconds',
    condition: { metric: 'latency_p95', operator: '>', threshold: 5000, window: '10m' },
    severity: 'warning' as const,
    enabled: false,
    channels: [{ type: 'slack', webhook: 'https://...' }],
    lastTriggeredAt: new Date('2026-01-27T14:30:00Z'),
    createdAt: new Date('2026-01-10T00:00:00Z'),
  },
];

const mockAlertEvents = [
  {
    id: 'ae_1',
    alertId: 'alert_1',
    alertName: 'High Error Rate',
    severity: 'critical' as const,
    status: 'resolved' as const,
    triggeredAt: new Date('2026-01-28T09:15:00Z'),
    resolvedAt: new Date('2026-01-28T09:25:00Z'),
    details: { errorRate: 7.2, threshold: 5 },
  },
  {
    id: 'ae_2',
    alertId: 'alert_3',
    alertName: 'High Latency',
    severity: 'warning' as const,
    status: 'acknowledged' as const,
    triggeredAt: new Date('2026-01-27T14:30:00Z'),
    resolvedAt: null,
    details: { latencyP95: 6234, threshold: 5000 },
  },
];

export const alertsRouter = router({
  // List alert configurations
  list: publicProcedure
    .input(z.object({
      projectId: z.string().optional(),
      enabled: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      let filtered = [...mockAlerts];
      if (input.enabled !== undefined) {
        filtered = filtered.filter(a => a.enabled === input.enabled);
      }
      return filtered;
    }),

  // Get single alert
  get: publicProcedure
    .input(z.object({
      alertId: z.string(),
    }))
    .query(async ({ input }) => {
      return mockAlerts.find(a => a.id === input.alertId) ?? null;
    }),

  // Create alert
  create: publicProcedure
    .input(z.object({
      projectId: z.string(),
      name: z.string(),
      description: z.string().optional(),
      condition: z.object({
        metric: z.string(),
        operator: z.enum(['>', '<', '>=', '<=', '==']),
        threshold: z.union([z.number(), z.string()]),
        window: z.string().optional(),
      }),
      severity: z.enum(['info', 'warning', 'critical']),
      channels: z.array(z.object({
        type: z.enum(['slack', 'email', 'pagerduty', 'webhook']),
        webhook: z.string().optional(),
        address: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const newAlert = {
        id: `alert_${Date.now()}`,
        ...input,
        description: input.description ?? '',
        enabled: true,
        lastTriggeredAt: null as Date | null,
        createdAt: new Date(),
      };
      mockAlerts.push(newAlert as any);
      return newAlert;
    }),

  // Update alert
  update: publicProcedure
    .input(z.object({
      alertId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      condition: z.object({
        metric: z.string(),
        operator: z.enum(['>', '<', '>=', '<=', '==']),
        threshold: z.union([z.number(), z.string()]),
        window: z.string().optional(),
      }).optional(),
      severity: z.enum(['info', 'warning', 'critical']).optional(),
      enabled: z.boolean().optional(),
      channels: z.array(z.object({
        type: z.enum(['slack', 'email', 'pagerduty', 'webhook']),
        webhook: z.string().optional(),
        address: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const alert = mockAlerts.find(a => a.id === input.alertId);
      if (!alert) return null;
      
      Object.assign(alert, input);
      return alert;
    }),

  // Delete alert
  delete: publicProcedure
    .input(z.object({
      alertId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const index = mockAlerts.findIndex(a => a.id === input.alertId);
      if (index === -1) return false;
      mockAlerts.splice(index, 1);
      return true;
    }),

  // List alert events/history
  events: publicProcedure
    .input(z.object({
      projectId: z.string().optional(),
      alertId: z.string().optional(),
      status: z.enum(['triggered', 'acknowledged', 'resolved']).optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      let filtered = [...mockAlertEvents];
      if (input.alertId) {
        filtered = filtered.filter(e => e.alertId === input.alertId);
      }
      if (input.status) {
        filtered = filtered.filter(e => e.status === input.status);
      }
      return filtered.slice(0, input.limit);
    }),

  // Acknowledge alert event
  acknowledge: publicProcedure
    .input(z.object({
      eventId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const event = mockAlertEvents.find(e => e.id === input.eventId);
      if (!event) return null;
      event.status = 'acknowledged';
      return event;
    }),
});
