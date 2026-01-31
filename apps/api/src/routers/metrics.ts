/**
 * Metrics Router
 *
 * API endpoints for querying aggregated metrics and analytics.
 */

import { Hono } from "hono";
import { z } from "zod";

// Schemas
const timeRangeSchema = z.object({
  range: z.enum(["1h", "6h", "24h", "7d", "30d", "90d"]).default("24h"),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  granularity: z.enum(["minute", "hour", "day", "week"]).default("hour"),
});

const groupBySchema = z.object({
  groupBy: z.enum(["model", "feature", "user", "tag", "status"]).optional(),
});

// Router
const router = new Hono();

/**
 * GET / - Get overview metrics
 */
router.get("/", async (c) => {
  const query = c.req.query();
  const { range, granularity } = timeRangeSchema.parse(query);
  groupBySchema.parse(query); // Validate but unused in mock

  // Mock time series data
  const timeSeries = [
    {
      timestamp: "2026-01-28T08:00:00Z",
      sessions: 42,
      events: 310,
      errors: 2,
      promptTokens: 45000,
      completionTokens: 32000,
      totalTokens: 77000,
      totalCost: 0.385,
      avgLatencyMs: 780,
      p95LatencyMs: 1250,
    },
    {
      timestamp: "2026-01-28T09:00:00Z",
      sessions: 56,
      events: 420,
      errors: 1,
      promptTokens: 62000,
      completionTokens: 45000,
      totalTokens: 107000,
      totalCost: 0.535,
      avgLatencyMs: 720,
      p95LatencyMs: 1180,
    },
    {
      timestamp: "2026-01-28T10:00:00Z",
      sessions: 48,
      events: 365,
      errors: 3,
      promptTokens: 51000,
      completionTokens: 38000,
      totalTokens: 89000,
      totalCost: 0.445,
      avgLatencyMs: 850,
      p95LatencyMs: 1420,
    },
  ];

  const totals = {
    sessions: 146,
    events: 1095,
    errors: 6,
    errorRate: 4.1,
    promptTokens: 158000,
    completionTokens: 115000,
    totalTokens: 273000,
    totalCost: 1.365,
    avgLatencyMs: 783,
    p50LatencyMs: 650,
    p95LatencyMs: 1280,
    p99LatencyMs: 1850,
  };

  return c.json({
    data: {
      range,
      granularity,
      timeSeries,
      totals,
    },
  });
});

/**
 * GET /cost - Get cost breakdown
 */
router.get("/cost", async (c) => {
  const query = c.req.query();
  const { range } = timeRangeSchema.parse(query);
  const groupBy = c.req.query("groupBy") || "model";

  const byModel = [
    {
      group: "gpt-5",
      cost: 0.78,
      tokens: 156000,
      sessions: 85,
      percentage: 57.1,
    },
    {
      group: "claude-sonnet-4",
      cost: 0.42,
      tokens: 84000,
      sessions: 45,
      percentage: 30.8,
    },
    {
      group: "gpt-4o-mini",
      cost: 0.165,
      tokens: 33000,
      sessions: 16,
      percentage: 12.1,
    },
  ];

  const byFeature = [
    {
      group: "chat-agent",
      cost: 0.65,
      tokens: 130000,
      sessions: 72,
      percentage: 47.6,
    },
    {
      group: "code-review",
      cost: 0.45,
      tokens: 90000,
      sessions: 48,
      percentage: 33.0,
    },
    {
      group: "doc-generator",
      cost: 0.265,
      tokens: 53000,
      sessions: 26,
      percentage: 19.4,
    },
  ];

  const breakdown = groupBy === "feature" ? byFeature : byModel;

  return c.json({
    data: {
      range,
      groupBy,
      breakdown,
      total: {
        cost: 1.365,
        tokens: 273000,
        sessions: 146,
      },
      comparison: {
        previousPeriod: {
          cost: 1.245,
          changePercent: 9.6,
        },
      },
    },
  });
});

/**
 * GET /tokens - Get token usage breakdown
 */
router.get("/tokens", async (c) => {
  const query = c.req.query();
  const { range } = timeRangeSchema.parse(query);
  const groupBy = c.req.query("groupBy") || "model";

  const byModel = [
    {
      group: "gpt-5",
      promptTokens: 95000,
      completionTokens: 61000,
      total: 156000,
      avgPromptTokens: 1118,
      avgCompletionTokens: 718,
    },
    {
      group: "claude-sonnet-4",
      promptTokens: 48000,
      completionTokens: 36000,
      total: 84000,
      avgPromptTokens: 1067,
      avgCompletionTokens: 800,
    },
    {
      group: "gpt-4o-mini",
      promptTokens: 15000,
      completionTokens: 18000,
      total: 33000,
      avgPromptTokens: 938,
      avgCompletionTokens: 1125,
    },
  ];

  return c.json({
    data: {
      range,
      groupBy,
      breakdown: byModel,
      totals: {
        promptTokens: 158000,
        completionTokens: 115000,
        total: 273000,
        avgPromptTokens: 1082,
        avgCompletionTokens: 788,
      },
    },
  });
});

/**
 * GET /latency - Get latency metrics
 */
router.get("/latency", async (c) => {
  const query = c.req.query();
  const { range, granularity } = timeRangeSchema.parse(query);
  const groupBy = c.req.query("groupBy") || "model";

  const byModel = [
    {
      group: "gpt-5",
      p50: 720,
      p75: 950,
      p95: 1350,
      p99: 1920,
      avg: 850,
      min: 180,
      max: 2450,
    },
    {
      group: "claude-sonnet-4",
      p50: 650,
      p75: 880,
      p95: 1280,
      p99: 1780,
      avg: 780,
      min: 150,
      max: 2200,
    },
    {
      group: "gpt-4o-mini",
      p50: 220,
      p75: 320,
      p95: 520,
      p99: 750,
      avg: 280,
      min: 80,
      max: 950,
    },
  ];

  const timeSeries = [
    { timestamp: "2026-01-28T08:00:00Z", p50: 680, p95: 1220, avg: 780 },
    { timestamp: "2026-01-28T09:00:00Z", p50: 650, p95: 1180, avg: 720 },
    { timestamp: "2026-01-28T10:00:00Z", p50: 720, p95: 1420, avg: 850 },
  ];

  return c.json({
    data: {
      range,
      granularity,
      groupBy,
      breakdown: byModel,
      timeSeries,
      overall: {
        p50: 650,
        p75: 850,
        p95: 1280,
        p99: 1850,
        avg: 783,
        min: 80,
        max: 2450,
      },
    },
  });
});

/**
 * GET /errors - Get error metrics
 */
router.get("/errors", async (c) => {
  const query = c.req.query();
  const { range, granularity } = timeRangeSchema.parse(query);

  const byType = [
    { type: "rate_limit", count: 8, percentage: 44.4 },
    { type: "timeout", count: 5, percentage: 27.8 },
    { type: "invalid_request", count: 3, percentage: 16.7 },
    { type: "server_error", count: 2, percentage: 11.1 },
  ];

  const byModel = [
    { model: "gpt-5", count: 12, rate: 4.8 },
    { model: "claude-sonnet-4", count: 4, rate: 2.1 },
    { model: "gpt-4o-mini", count: 2, rate: 1.5 },
  ];

  const timeSeries = [
    {
      timestamp: "2026-01-28T08:00:00Z",
      errors: 2,
      sessions: 42,
      errorRate: 4.8,
    },
    {
      timestamp: "2026-01-28T09:00:00Z",
      errors: 1,
      sessions: 56,
      errorRate: 1.8,
    },
    {
      timestamp: "2026-01-28T10:00:00Z",
      errors: 3,
      sessions: 48,
      errorRate: 6.3,
    },
  ];

  return c.json({
    data: {
      range,
      granularity,
      byType,
      byModel,
      timeSeries,
      totals: {
        errors: 18,
        sessions: 440,
        errorRate: 4.1,
      },
    },
  });
});

/**
 * GET /tools - Get tool usage metrics
 */
router.get("/tools", async (c) => {
  const query = c.req.query();
  const { range } = timeRangeSchema.parse(query);

  const tools = [
    {
      tool: "web_search",
      calls: 245,
      successRate: 96.3,
      avgDurationMs: 450,
      p95DurationMs: 850,
      errorRate: 3.7,
    },
    {
      tool: "code_search",
      calls: 180,
      successRate: 98.9,
      avgDurationMs: 320,
      p95DurationMs: 620,
      errorRate: 1.1,
    },
    {
      tool: "file_read",
      calls: 156,
      successRate: 99.4,
      avgDurationMs: 85,
      p95DurationMs: 180,
      errorRate: 0.6,
    },
    {
      tool: "calculator",
      calls: 89,
      successRate: 100,
      avgDurationMs: 12,
      p95DurationMs: 28,
      errorRate: 0,
    },
  ];

  return c.json({
    data: {
      range,
      tools,
      totals: {
        calls: 670,
        uniqueTools: 4,
        avgSuccessRate: 98.6,
        avgDurationMs: 217,
      },
    },
  });
});

/**
 * GET /users - Get per-user metrics
 */
router.get("/users", async (c) => {
  const query = c.req.query();
  const { range } = timeRangeSchema.parse(query);
  const limit = parseInt(c.req.query("limit") || "20", 10);

  const users = [
    {
      userId: "user_456",
      sessions: 45,
      totalCost: 0.48,
      totalTokens: 96000,
      avgSessionDuration: 4200,
      errorRate: 2.2,
      topFeature: "chat-agent",
    },
    {
      userId: "user_789",
      sessions: 38,
      totalCost: 0.42,
      totalTokens: 84000,
      avgSessionDuration: 5100,
      errorRate: 5.3,
      topFeature: "code-review",
    },
    {
      userId: "user_123",
      sessions: 32,
      totalCost: 0.35,
      totalTokens: 70000,
      avgSessionDuration: 3800,
      errorRate: 0,
      topFeature: "chat-agent",
    },
  ];

  return c.json({
    data: {
      range,
      users: users.slice(0, limit),
      totals: {
        uniqueUsers: 28,
        avgSessionsPerUser: 5.2,
        avgCostPerUser: 0.049,
      },
    },
  });
});

/**
 * GET /features - Get per-feature metrics
 */
router.get("/features", async (c) => {
  const query = c.req.query();
  const { range } = timeRangeSchema.parse(query);

  const features = [
    {
      featureId: "chat-agent",
      sessions: 72,
      totalCost: 0.65,
      totalTokens: 130000,
      avgLatencyMs: 820,
      errorRate: 2.8,
      uniqueUsers: 18,
      topModel: "gpt-5",
    },
    {
      featureId: "code-review",
      sessions: 48,
      totalCost: 0.45,
      totalTokens: 90000,
      avgLatencyMs: 1050,
      errorRate: 4.2,
      uniqueUsers: 12,
      topModel: "claude-sonnet-4",
    },
    {
      featureId: "doc-generator",
      sessions: 26,
      totalCost: 0.265,
      totalTokens: 53000,
      avgLatencyMs: 680,
      errorRate: 0,
      uniqueUsers: 8,
      topModel: "gpt-5",
    },
  ];

  return c.json({
    data: {
      range,
      features,
      totals: {
        uniqueFeatures: 3,
        totalSessions: 146,
        totalCost: 1.365,
      },
    },
  });
});

export { router as metricsRouter };
