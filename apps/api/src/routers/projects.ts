/**
 * Projects Router
 *
 * API endpoints for managing projects and settings.
 */

import { Hono } from "hono";
import type { Env, Variables } from "../index.js";
import { z } from "zod";

// Schemas
const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  settings: z
    .object({
      defaultRetention: z
        .enum(["7d", "30d", "90d", "365d", "unlimited"])
        .optional(),
      samplingRate: z.number().min(0).max(100).optional(),
      piiRedaction: z.boolean().optional(),
      costAlerts: z
        .object({
          dailyLimit: z.number().optional(),
          monthlyLimit: z.number().optional(),
        })
        .optional(),
      notifications: z
        .object({
          email: z.boolean().optional(),
          slack: z.boolean().optional(),
          digest: z.enum(["realtime", "hourly", "daily"]).optional(),
        })
        .optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["viewer", "member", "admin", "owner"]),
});

const updateMemberSchema = z.object({
  role: z.enum(["viewer", "member", "admin", "owner"]),
});

// Mock data
const mockProject = {
  id: "proj_1",
  name: "Production AI",
  description: "Main production AI agent system",
  organizationId: "org_1",
  settings: {
    defaultRetention: "30d",
    samplingRate: 100,
    piiRedaction: true,
    costAlerts: {
      dailyLimit: 100,
      monthlyLimit: 2500,
    },
    notifications: {
      email: true,
      slack: true,
      digest: "hourly",
    },
  },
  metadata: {
    environment: "production",
    region: "us-east-1",
  },
  usage: {
    currentPeriod: {
      events: 1250000,
      sessions: 45000,
      cost: 1245.67,
    },
    limits: {
      events: 5000000,
      sessions: 200000,
    },
  },
  plan: "pro",
  createdAt: "2025-12-01T00:00:00Z",
  updatedAt: "2026-01-25T10:30:00Z",
};

const mockMembers = [
  {
    id: "member_001",
    userId: "user_admin",
    email: "admin@company.com",
    name: "Admin User",
    role: "owner",
    joinedAt: "2025-12-01T00:00:00Z",
    lastActiveAt: "2026-01-28T10:30:00Z",
  },
  {
    id: "member_002",
    userId: "user_456",
    email: "developer@company.com",
    name: "Developer One",
    role: "admin",
    joinedAt: "2026-01-01T00:00:00Z",
    lastActiveAt: "2026-01-28T09:15:00Z",
  },
  {
    id: "member_003",
    userId: "user_789",
    email: "analyst@company.com",
    name: "Data Analyst",
    role: "member",
    joinedAt: "2026-01-15T00:00:00Z",
    lastActiveAt: "2026-01-27T14:30:00Z",
  },
];

const mockInvites = [
  {
    id: "invite_001",
    email: "newuser@company.com",
    role: "member",
    invitedBy: "user_admin",
    createdAt: "2026-01-27T10:00:00Z",
    expiresAt: "2026-02-03T10:00:00Z",
    status: "pending",
  },
];

// Router
const router = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /current - Get current project
 */
router.get("/current", async (c) => {
  c.get("projectId"); // Used for auth validation

  // In production, fetch from database
  return c.json({ data: mockProject });
});

/**
 * PATCH /current - Update current project
 */
router.patch("/current", async (c) => {
  const body = await c.req.json();

  const validated = updateProjectSchema.parse(body);

  // Apply updates
  if (validated.name) mockProject.name = validated.name;
  if (validated.description) mockProject.description = validated.description;
  if (validated.settings) {
    mockProject.settings = {
      ...mockProject.settings,
      ...validated.settings,
      costAlerts: {
        ...mockProject.settings.costAlerts,
        ...validated.settings?.costAlerts,
      },
      notifications: {
        ...mockProject.settings.notifications,
        ...validated.settings?.notifications,
      },
    };
  }
  if (validated.metadata) {
    mockProject.metadata = { ...mockProject.metadata, ...validated.metadata };
  }
  mockProject.updatedAt = new Date().toISOString();

  return c.json({ data: mockProject });
});

/**
 * GET /current/usage - Get usage statistics
 */
router.get("/current/usage", async (c) => {
  const range = c.req.query("range") || "30d";

  const usage = {
    period: range,
    current: {
      events: 1250000,
      sessions: 45000,
      cost: 1245.67,
      promptTokens: 85000000,
      completionTokens: 62000000,
      totalTokens: 147000000,
    },
    limits: {
      events: 5000000,
      sessions: 200000,
      eventsUsagePercent: 25,
      sessionsUsagePercent: 22.5,
    },
    timeSeries: [
      { date: "2026-01-22", events: 42000, sessions: 1500, cost: 42.5 },
      { date: "2026-01-23", events: 45000, sessions: 1620, cost: 45.8 },
      { date: "2026-01-24", events: 43500, sessions: 1580, cost: 44.2 },
      { date: "2026-01-25", events: 48000, sessions: 1720, cost: 48.5 },
      { date: "2026-01-26", events: 41000, sessions: 1480, cost: 41.2 },
      { date: "2026-01-27", events: 44000, sessions: 1590, cost: 44.8 },
      { date: "2026-01-28", events: 32000, sessions: 1150, cost: 32.5 },
    ],
    billing: {
      currentInvoice: 1245.67,
      nextBillingDate: "2026-02-01",
      plan: "pro",
      planLimit: 5000000,
    },
  };

  return c.json({ data: usage });
});

/**
 * GET /current/members - List project members
 */
router.get("/current/members", async (c) => {
  return c.json({ data: mockMembers });
});

/**
 * POST /current/members - Add project member
 */
router.post("/current/members", async (c) => {
  const body = await c.req.json();

  const validated = addMemberSchema.parse(body);

  // Check if already a member
  const existing = mockMembers.find((m) => m.email === validated.email);
  if (existing) {
    return c.json(
      { error: "Conflict", message: "User is already a member" },
      409,
    );
  }

  // Check for pending invite
  const existingInvite = mockInvites.find((i) => i.email === validated.email);
  if (existingInvite) {
    return c.json(
      { error: "Conflict", message: "User already has a pending invite" },
      409,
    );
  }

  // Create invite
  const newInvite = {
    id: `invite_${Date.now()}`,
    email: validated.email,
    role: validated.role,
    invitedBy: "current_user",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: "pending",
  };

  mockInvites.push(newInvite);

  return c.json(
    {
      data: {
        invite: newInvite,
        message: "Invitation sent",
      },
    },
    201,
  );
});

/**
 * PATCH /current/members/:memberId - Update member role
 */
router.patch("/current/members/:memberId", async (c) => {
  const memberId = c.req.param("memberId");
  const body = await c.req.json();

  const member = mockMembers.find((m) => m.id === memberId);
  if (!member) {
    return c.json({ error: "Not Found", message: "Member not found" }, 404);
  }

  if (member.role === "owner") {
    return c.json(
      { error: "Bad Request", message: "Cannot change owner role" },
      400,
    );
  }

  const validated = updateMemberSchema.parse(body);
  member.role = validated.role;

  return c.json({ data: member });
});

/**
 * DELETE /current/members/:memberId - Remove member
 */
router.delete("/current/members/:memberId", async (c) => {
  const memberId = c.req.param("memberId");

  const index = mockMembers.findIndex((m) => m.id === memberId);
  if (index === -1) {
    return c.json({ error: "Not Found", message: "Member not found" }, 404);
  }

  if (mockMembers[index].role === "owner") {
    return c.json(
      { error: "Bad Request", message: "Cannot remove project owner" },
      400,
    );
  }

  mockMembers.splice(index, 1);

  return c.json({ data: { success: true, message: "Member removed" } });
});

/**
 * GET /current/invites - List pending invites
 */
router.get("/current/invites", async (c) => {
  const pending = mockInvites.filter((i) => i.status === "pending");
  return c.json({ data: pending });
});

/**
 * DELETE /current/invites/:inviteId - Cancel invite
 */
router.delete("/current/invites/:inviteId", async (c) => {
  const inviteId = c.req.param("inviteId");

  const index = mockInvites.findIndex((i) => i.id === inviteId);
  if (index === -1) {
    return c.json({ error: "Not Found", message: "Invite not found" }, 404);
  }

  mockInvites.splice(index, 1);

  return c.json({ data: { success: true, message: "Invite cancelled" } });
});

/**
 * GET /current/audit-log - Get project audit log
 */
router.get("/current/audit-log", async (c) => {
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const action = c.req.query("action");

  const auditLog = [
    {
      id: "audit_001",
      action: "api_key.created",
      actor: "user_admin",
      actorEmail: "admin@company.com",
      resource: "key_001",
      details: { name: "Production SDK" },
      ip: "203.0.113.42",
      userAgent: "Mozilla/5.0...",
      timestamp: "2026-01-28T10:30:00Z",
    },
    {
      id: "audit_002",
      action: "alert.created",
      actor: "user_456",
      actorEmail: "developer@company.com",
      resource: "alert_001",
      details: { name: "High Error Rate", severity: "critical" },
      ip: "198.51.100.23",
      userAgent: "Mozilla/5.0...",
      timestamp: "2026-01-28T09:15:00Z",
    },
    {
      id: "audit_003",
      action: "member.invited",
      actor: "user_admin",
      actorEmail: "admin@company.com",
      resource: "invite_001",
      details: { email: "newuser@company.com", role: "member" },
      ip: "203.0.113.42",
      userAgent: "Mozilla/5.0...",
      timestamp: "2026-01-27T10:00:00Z",
    },
    {
      id: "audit_004",
      action: "settings.updated",
      actor: "user_admin",
      actorEmail: "admin@company.com",
      resource: "proj_1",
      details: { changes: { piiRedaction: { from: false, to: true } } },
      ip: "203.0.113.42",
      userAgent: "Mozilla/5.0...",
      timestamp: "2026-01-25T10:30:00Z",
    },
  ];

  let filtered = auditLog;
  if (action) {
    filtered = filtered.filter((a) => a.action.startsWith(action));
  }

  const total = filtered.length;
  const logs = filtered.slice(offset, offset + limit);

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

export { router as projectsRouter };
