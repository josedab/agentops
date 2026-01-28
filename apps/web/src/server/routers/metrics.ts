import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

// Mock metrics data
const generateMockMetrics = () => {
  const now = new Date();
  const metrics = [];
  
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    metrics.push({
      timestamp: time,
      sessions: Math.floor(Math.random() * 100) + 50,
      events: Math.floor(Math.random() * 1000) + 500,
      errors: Math.floor(Math.random() * 10),
      cost: Math.random() * 50 + 10,
      promptTokens: Math.floor(Math.random() * 50000) + 10000,
      completionTokens: Math.floor(Math.random() * 30000) + 5000,
      avgLatency: Math.floor(Math.random() * 500) + 200,
    });
  }
  
  return metrics;
};

const mockCostByFeature = [
  { featureId: 'chat-agent', cost: 1234.56, percentage: 45 },
  { featureId: 'code-review', cost: 789.12, percentage: 28 },
  { featureId: 'doc-generator', cost: 456.78, percentage: 17 },
  { featureId: 'other', cost: 280.54, percentage: 10 },
];

const mockCostByModel = [
  { model: 'gpt-5', cost: 1567.89, percentage: 62 },
  { model: 'claude-sonnet-4', cost: 634.22, percentage: 25 },
  { model: 'gpt-4o-mini', cost: 328.89, percentage: 13 },
];

const mockTopUsers = [
  { userId: 'user_456', sessions: 245, cost: 567.89, tokens: 1234567 },
  { userId: 'user_789', sessions: 189, cost: 432.10, tokens: 987654 },
  { userId: 'user_123', sessions: 156, cost: 321.45, tokens: 765432 },
  { userId: 'user_012', sessions: 98, cost: 198.76, tokens: 543210 },
];

export const metricsRouter = router({
  // Dashboard overview metrics
  overview: publicProcedure
    .input(z.object({
      projectId: z.string().optional(),
      timeRange: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
    }))
    .query(async ({ input }) => {
      return {
        totalSessions: 12456,
        totalSessionsChange: 12.5,
        totalEvents: 1234567,
        totalEventsChange: 8.3,
        totalCost: 2761.00,
        totalCostChange: -5.2,
        errorRate: 2.3,
        errorRateChange: -0.5,
        avgLatency: 342,
        avgLatencyChange: -12,
        totalTokens: 45678901,
      };
    }),

  // Time series metrics for charts
  timeSeries: publicProcedure
    .input(z.object({
      projectId: z.string().optional(),
      timeRange: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
      metrics: z.array(z.enum(['sessions', 'events', 'errors', 'cost', 'tokens', 'latency'])).default(['sessions', 'cost']),
    }))
    .query(async ({ input }) => {
      return generateMockMetrics();
    }),

  // Cost breakdown
  costBreakdown: publicProcedure
    .input(z.object({
      projectId: z.string().optional(),
      timeRange: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
      groupBy: z.enum(['feature', 'model', 'user']).default('feature'),
    }))
    .query(async ({ input }) => {
      if (input.groupBy === 'model') {
        return mockCostByModel;
      }
      return mockCostByFeature;
    }),

  // Top users by usage
  topUsers: publicProcedure
    .input(z.object({
      projectId: z.string().optional(),
      timeRange: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
      limit: z.number().min(1).max(100).default(10),
    }))
    .query(async ({ input }) => {
      return mockTopUsers.slice(0, input.limit);
    }),

  // Real-time stats (for live updates)
  realtime: publicProcedure
    .input(z.object({
      projectId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return {
        activeSession: Math.floor(Math.random() * 50) + 10,
        eventsPerMinute: Math.floor(Math.random() * 200) + 100,
        costPerMinute: Math.random() * 2 + 0.5,
        errorRate: Math.random() * 5,
        timestamp: new Date(),
      };
    }),
});
