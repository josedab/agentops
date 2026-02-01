import { z } from "zod";
import { router, publicProcedure } from "../trpc";

// Mock project settings
const mockProject = {
  id: "proj_1",
  organizationId: "org_1",
  name: "My AI Project",
  slug: "my-ai-project",
  settings: {
    dataRetentionDays: 30,
    piiRedaction: true,
    webhookUrl: "https://hooks.example.com/agentops",
    alertEmail: "alerts@example.com",
    costBudget: {
      daily: 100,
      monthly: 2500,
      alertThreshold: 80, // percentage
    },
    qualityThreshold: 6.0,
  },
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-25T00:00:00Z"),
};

const mockOrganization = {
  id: "org_1",
  name: "Acme Corp",
  slug: "acme-corp",
  plan: "team",
  settings: {
    ssoEnabled: false,
    ssoProvider: null,
    allowedDomains: ["acme.com"],
    defaultRole: "member",
  },
  members: [
    {
      userId: "user_1",
      email: "admin@acme.com",
      role: "owner",
      joinedAt: new Date("2026-01-01"),
    },
    {
      userId: "user_2",
      email: "dev@acme.com",
      role: "admin",
      joinedAt: new Date("2026-01-05"),
    },
    {
      userId: "user_3",
      email: "viewer@acme.com",
      role: "member",
      joinedAt: new Date("2026-01-10"),
    },
  ],
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const mockAuditLogs = [
  {
    id: "audit_1",
    organizationId: "org_1",
    userId: "user_1",
    userEmail: "admin@acme.com",
    action: "api_key.created",
    resource: "api_key",
    resourceId: "key_1",
    details: { name: "Production Key" },
    ipAddress: "192.168.1.1",
    timestamp: new Date("2026-01-28T10:00:00Z"),
  },
  {
    id: "audit_2",
    organizationId: "org_1",
    userId: "user_2",
    userEmail: "dev@acme.com",
    action: "alert.created",
    resource: "alert",
    resourceId: "alert_1",
    details: { name: "High Error Rate" },
    ipAddress: "192.168.1.2",
    timestamp: new Date("2026-01-27T15:30:00Z"),
  },
  {
    id: "audit_3",
    organizationId: "org_1",
    userId: "user_1",
    userEmail: "admin@acme.com",
    action: "member.invited",
    resource: "organization",
    resourceId: "org_1",
    details: { email: "viewer@acme.com", role: "member" },
    ipAddress: "192.168.1.1",
    timestamp: new Date("2026-01-10T09:00:00Z"),
  },
];

export const settingsRouter = router({
  // Get project settings
  getProject: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
      }),
    )
    .query(async () => {
      return mockProject;
    }),

  // Update project settings
  updateProject: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().optional(),
        settings: z
          .object({
            dataRetentionDays: z.number().min(1).max(365).optional(),
            piiRedaction: z.boolean().optional(),
            webhookUrl: z.string().url().optional().nullable(),
            alertEmail: z.string().email().optional().nullable(),
            costBudget: z
              .object({
                daily: z.number().optional(),
                monthly: z.number().optional(),
                alertThreshold: z.number().min(0).max(100).optional(),
              })
              .optional(),
            qualityThreshold: z.number().min(0).max(10).optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.name) mockProject.name = input.name;
      if (input.settings) {
        Object.assign(mockProject.settings, input.settings);
      }
      mockProject.updatedAt = new Date();
      return mockProject;
    }),

  // Get organization settings
  getOrganization: publicProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
      }),
    )
    .query(async () => {
      return mockOrganization;
    }),

  // Update organization settings
  updateOrganization: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        name: z.string().optional(),
        settings: z
          .object({
            ssoEnabled: z.boolean().optional(),
            ssoProvider: z
              .enum(["okta", "azure", "google", "onelogin"])
              .optional()
              .nullable(),
            allowedDomains: z.array(z.string()).optional(),
            defaultRole: z.enum(["member", "viewer"]).optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.name) mockOrganization.name = input.name;
      if (input.settings) {
        Object.assign(mockOrganization.settings, input.settings);
      }
      return mockOrganization;
    }),

  // Invite member
  inviteMember: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        email: z.string().email(),
        role: z.enum(["admin", "member", "viewer"]),
      }),
    )
    .mutation(async ({ input }) => {
      const newMember = {
        userId: `user_${Date.now()}`,
        email: input.email,
        role: input.role,
        joinedAt: new Date(),
      };
      mockOrganization.members.push(newMember);
      return newMember;
    }),

  // Update member role
  updateMemberRole: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        userId: z.string(),
        role: z.enum(["admin", "member", "viewer"]),
      }),
    )
    .mutation(async ({ input }) => {
      const member = mockOrganization.members.find(
        (m) => m.userId === input.userId,
      );
      if (!member) return null;
      member.role = input.role;
      return member;
    }),

  // Remove member
  removeMember: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const index = mockOrganization.members.findIndex(
        (m) => m.userId === input.userId,
      );
      if (index === -1) return { success: false };
      mockOrganization.members.splice(index, 1);
      return { success: true };
    }),

  // Get audit logs
  getAuditLogs: publicProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        action: z.string().optional(),
        userId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ input }) => {
      let logs = [...mockAuditLogs];
      if (input.action) {
        logs = logs.filter((l) => l.action === input.action);
      }
      if (input.userId) {
        logs = logs.filter((l) => l.userId === input.userId);
      }
      return logs.slice(0, input.limit);
    }),

  // Get usage/billing info
  getUsage: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        timeRange: z.enum(["current", "30d", "90d"]).default("current"),
      }),
    )
    .query(async () => {
      return {
        plan: "team",
        billingPeriod: {
          start: new Date("2026-01-01"),
          end: new Date("2026-01-31"),
        },
        usage: {
          events: {
            used: 1_234_567,
            limit: 2_000_000,
            percentage: 62,
          },
          storage: {
            used: 4.5, // GB
            limit: 10,
            percentage: 45,
          },
          apiCalls: {
            used: 45_678,
            limit: 100_000,
            percentage: 46,
          },
        },
        cost: {
          baseFee: 199,
          overage: 0,
          total: 199,
        },
      };
    }),
});
