import { z } from "zod";
import { router, publicProcedure } from "../trpc";

// Types for NL alert rules
type NLRuleSeverity = "info" | "warning" | "critical";
type NLRuleStatus = "active" | "paused" | "pending_review";
type NotificationChannel = "email" | "slack" | "dashboard";

interface NLRule {
  id: string;
  orgId: string;
  name: string;
  originalQuery: string;
  parsedRule: {
    metric: { type: string; name: string; unit: string };
    condition: { type: string; operator: string; value: number };
    severity: NLRuleSeverity;
    notifications: Array<{ channel: NotificationChannel }>;
    filters: Array<{ field: string; operator: string; value: string }>;
  };
  confidence: number;
  status: NLRuleStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Mock data for NL-configured alert rules
const mockNLRules: NLRule[] = [
  {
    id: "nl_rule_1",
    orgId: "org_1",
    name: "High Cost Alert",
    originalQuery: "Alert me when costs exceed $100 per day",
    parsedRule: {
      metric: { type: "cost", name: "cost", unit: "USD" },
      condition: { type: "threshold", operator: "gt", value: 100 },
      severity: "critical",
      notifications: [{ channel: "email" }],
      filters: [],
    },
    confidence: 0.95,
    status: "active",
    createdAt: new Date("2026-01-25T10:00:00Z"),
    updatedAt: new Date("2026-01-25T10:00:00Z"),
  },
  {
    id: "nl_rule_2",
    orgId: "org_1",
    name: "Latency Warning",
    originalQuery:
      "Warn me via Slack when latency goes above 2 seconds in production",
    parsedRule: {
      metric: { type: "latency", name: "latency", unit: "ms" },
      condition: { type: "threshold", operator: "gt", value: 2000 },
      severity: "warning",
      notifications: [{ channel: "slack" }],
      filters: [{ field: "environment", operator: "eq", value: "production" }],
    },
    confidence: 0.88,
    status: "active",
    createdAt: new Date("2026-01-26T14:00:00Z"),
    updatedAt: new Date("2026-01-26T14:00:00Z"),
  },
  {
    id: "nl_rule_3",
    orgId: "org_1",
    name: "Error Rate Alert",
    originalQuery: "Email me if error rate exceeds 5%",
    parsedRule: {
      metric: { type: "error_rate", name: "error_rate", unit: "percent" },
      condition: { type: "threshold", operator: "gt", value: 5 },
      severity: "critical",
      notifications: [{ channel: "email" }],
      filters: [],
    },
    confidence: 0.92,
    status: "pending_review",
    createdAt: new Date("2026-01-28T09:00:00Z"),
    updatedAt: new Date("2026-01-28T09:00:00Z"),
  },
];

const mockFeedback = [
  {
    ruleId: "nl_rule_1",
    helpful: true,
    timestamp: new Date("2026-01-27T10:00:00Z"),
  },
  {
    ruleId: "nl_rule_1",
    helpful: true,
    timestamp: new Date("2026-01-28T10:00:00Z"),
  },
  {
    ruleId: "nl_rule_2",
    helpful: false,
    timestamp: new Date("2026-01-27T12:00:00Z"),
  },
];

export const nlAlertsRouter = router({
  // Parse a natural language query into an alert rule
  parse: publicProcedure
    .input(
      z.object({
        query: z.string().min(5).max(500),
      }),
    )
    .mutation(async ({ input }) => {
      // Simulate NL parsing
      const result: {
        rule: {
          name: string;
          metric: { type: string; name: string; unit: string };
          condition: { type: string; operator: string; value: number };
          severity: "info" | "warning" | "critical";
          notifications: Array<{ channel: "email" | "slack" | "dashboard" }>;
          filters: Array<{ field: string; operator: string; value: string }>;
        };
        confidence: number;
        ambiguities: Array<{
          type: string;
          options: Array<{ value: string; label: string }>;
        }>;
        suggestions: string[];
      } = {
        rule: {
          name: "Parsed Alert",
          metric: { type: "cost", name: "cost", unit: "USD" },
          condition: { type: "threshold", operator: "gt", value: 10 },
          severity: "warning",
          notifications: [{ channel: "dashboard" }],
          filters: [],
        },
        confidence: 0.85,
        ambiguities: [],
        suggestions: [
          'Consider specifying a time window (e.g., "per hour")',
          'You can add filters like "for user X" or "in production"',
        ],
      };

      // Extract some basic patterns
      if (input.query.toLowerCase().includes("cost")) {
        result.rule.metric.type = "cost";
        result.confidence += 0.05;
      }
      if (input.query.toLowerCase().includes("latency")) {
        result.rule.metric = { type: "latency", name: "latency", unit: "ms" };
      }
      if (input.query.toLowerCase().includes("error")) {
        result.rule.metric = {
          type: "error_rate",
          name: "error_rate",
          unit: "percent",
        };
      }
      if (
        input.query.toLowerCase().includes("critical") ||
        input.query.toLowerCase().includes("alert")
      ) {
        result.rule.severity = "critical";
      }
      if (input.query.toLowerCase().includes("slack")) {
        result.rule.notifications = [{ channel: "slack" }];
      }
      if (input.query.toLowerCase().includes("email")) {
        result.rule.notifications = [{ channel: "email" }];
      }

      // Extract threshold values
      const dollarMatch = input.query.match(/\$(\d+)/);
      if (dollarMatch) {
        result.rule.condition.value = parseInt(dollarMatch[1]);
      }
      const percentMatch = input.query.match(/(\d+)%/);
      if (percentMatch) {
        result.rule.condition.value = parseInt(percentMatch[1]);
      }
      const secondsMatch = input.query.match(/(\d+)\s*(?:seconds?|s\b)/i);
      if (secondsMatch) {
        result.rule.condition.value = parseInt(secondsMatch[1]) * 1000;
      }

      return result;
    }),

  // List all NL-configured alert rules
  list: publicProcedure
    .input(
      z.object({
        orgId: z.string().optional(),
        status: z.enum(["active", "paused", "pending_review"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      let filtered = [...mockNLRules];
      if (input.orgId) {
        filtered = filtered.filter((r) => r.orgId === input.orgId);
      }
      if (input.status) {
        filtered = filtered.filter((r) => r.status === input.status);
      }
      return filtered;
    }),

  // Get a single NL rule
  get: publicProcedure
    .input(
      z.object({
        ruleId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return mockNLRules.find((r) => r.id === input.ruleId) ?? null;
    }),

  // Create a new NL-configured rule
  create: publicProcedure
    .input(
      z.object({
        orgId: z.string(),
        query: z.string(),
        name: z.string().optional(),
        autoActivate: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const newRule = {
        id: `nl_rule_${Date.now()}`,
        orgId: input.orgId,
        name: input.name ?? "New Alert Rule",
        originalQuery: input.query,
        parsedRule: {
          metric: { type: "cost" as const, name: "cost", unit: "USD" },
          condition: {
            type: "threshold" as const,
            operator: "gt" as const,
            value: 10,
          },
          severity: "warning" as const,
          notifications: [{ channel: "dashboard" as const }],
          filters: [],
        },
        confidence: 0.85,
        status: (input.autoActivate ? "active" : "pending_review") as
          | "active"
          | "paused"
          | "pending_review",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockNLRules.push(newRule);
      return newRule;
    }),

  // Update rule status
  updateStatus: publicProcedure
    .input(
      z.object({
        ruleId: z.string(),
        status: z.enum(["active", "paused", "pending_review"]),
      }),
    )
    .mutation(async ({ input }) => {
      const rule = mockNLRules.find((r) => r.id === input.ruleId);
      if (!rule) return null;

      rule.status = input.status;
      rule.updatedAt = new Date();
      return rule;
    }),

  // Activate a pending rule
  activate: publicProcedure
    .input(
      z.object({
        ruleId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const rule = mockNLRules.find((r) => r.id === input.ruleId);
      if (!rule) return null;

      rule.status = "active";
      rule.updatedAt = new Date();
      return rule;
    }),

  // Pause an active rule
  pause: publicProcedure
    .input(
      z.object({
        ruleId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const rule = mockNLRules.find((r) => r.id === input.ruleId);
      if (!rule) return null;

      rule.status = "paused";
      rule.updatedAt = new Date();
      return rule;
    }),

  // Delete a rule
  delete: publicProcedure
    .input(
      z.object({
        ruleId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const index = mockNLRules.findIndex((r) => r.id === input.ruleId);
      if (index === -1) return false;
      mockNLRules.splice(index, 1);
      return true;
    }),

  // Resolve ambiguity in a parsed rule
  resolveAmbiguity: publicProcedure
    .input(
      z.object({
        ruleId: z.string(),
        ambiguityType: z.string(),
        selectedValue: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const rule = mockNLRules.find((r) => r.id === input.ruleId);
      if (!rule) return null;

      // Apply the resolution
      rule.confidence = Math.min(1, rule.confidence + 0.1);
      rule.updatedAt = new Date();
      return rule;
    }),

  // Submit feedback on a rule
  feedback: publicProcedure
    .input(
      z.object({
        ruleId: z.string(),
        helpful: z.boolean(),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      mockFeedback.push({
        ruleId: input.ruleId,
        helpful: input.helpful,
        timestamp: new Date(),
      });
      return { success: true };
    }),

  // Get feedback stats for a rule
  feedbackStats: publicProcedure
    .input(
      z.object({
        ruleId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const ruleFeedback = mockFeedback.filter(
        (f) => f.ruleId === input.ruleId,
      );
      const helpful = ruleFeedback.filter((f) => f.helpful).length;
      const total = ruleFeedback.length;

      return {
        totalFeedback: total,
        helpfulCount: helpful,
        unhelpfulCount: total - helpful,
        effectivenessScore: total > 0 ? helpful / total : 0,
      };
    }),
});
