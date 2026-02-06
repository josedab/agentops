/**
 * API Keys Router
 *
 * API endpoints for managing API keys.
 */

import { Hono } from "hono";
import type { Env, Variables } from "../index.js";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";

// Helper to omit keyHash from response
const omitKeyHash = <T extends { keyHash: string }>(
  obj: T,
): Omit<T, "keyHash"> => {
  const { keyHash: _, ...rest } = obj;
  void _;
  return rest;
};

// Schemas
const createKeySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  scopes: z
    .array(z.enum(["ingest", "read", "write", "admin"]))
    .min(1)
    .default(["ingest", "read"]),
  expiresAt: z.string().datetime().optional(),
  rateLimit: z
    .object({
      requestsPerMinute: z.number().min(1).max(10000).optional(),
      eventsPerMinute: z.number().min(1).max(100000).optional(),
    })
    .optional(),
  allowedIps: z.array(z.string()).optional(),
  allowedOrigins: z.array(z.string()).optional(),
});

const updateKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  scopes: z.array(z.enum(["ingest", "read", "write", "admin"])).optional(),
  rateLimit: z
    .object({
      requestsPerMinute: z.number().min(1).max(10000).optional(),
      eventsPerMinute: z.number().min(1).max(100000).optional(),
    })
    .optional(),
  allowedIps: z.array(z.string()).optional(),
  allowedOrigins: z.array(z.string()).optional(),
});

// API Key type definition
interface ApiKeyConfig {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  rateLimit: { requestsPerMinute: number; eventsPerMinute: number } | null;
  allowedIps: string[] | null;
  allowedOrigins: string[] | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  usageCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string;
}

// Mock data
const mockApiKeys: ApiKeyConfig[] = [
  {
    id: "key_001",
    projectId: "proj_1",
    name: "Production SDK",
    description: "Main production API key for SDK",
    keyPrefix: "ao_proj1_abc12345",
    keyHash: "hash_abc",
    scopes: ["ingest", "read"],
    rateLimit: { requestsPerMinute: 1000, eventsPerMinute: 10000 },
    allowedIps: null,
    allowedOrigins: ["https://app.company.com"],
    lastUsedAt: "2026-01-28T10:30:00Z",
    lastUsedIp: "203.0.113.42",
    usageCount: 15420,
    expiresAt: null,
    revokedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    createdBy: "user_admin",
  },
  {
    id: "key_002",
    projectId: "proj_1",
    name: "Development Key",
    description: "For local development and testing",
    keyPrefix: "ao_proj1_def67890",
    keyHash: "hash_def",
    scopes: ["ingest", "read", "write"],
    rateLimit: { requestsPerMinute: 100, eventsPerMinute: 1000 },
    allowedIps: ["127.0.0.1", "10.0.0.0/8"],
    allowedOrigins: ["http://localhost:3000"],
    lastUsedAt: "2026-01-27T15:30:00Z",
    lastUsedIp: "127.0.0.1",
    usageCount: 3245,
    expiresAt: "2026-12-31T23:59:59Z",
    revokedAt: null,
    createdAt: "2026-01-15T00:00:00Z",
    createdBy: "user_dev",
  },
  {
    id: "key_003",
    projectId: "proj_1",
    name: "CI/CD Pipeline",
    description: "Used by GitHub Actions",
    keyPrefix: "ao_proj1_ghi13579",
    keyHash: "hash_ghi",
    scopes: ["ingest"],
    rateLimit: { requestsPerMinute: 500, eventsPerMinute: 5000 },
    allowedIps: null,
    allowedOrigins: null,
    lastUsedAt: "2026-01-20T12:00:00Z",
    lastUsedIp: "140.82.121.4",
    usageCount: 892,
    expiresAt: null,
    revokedAt: "2026-01-20T14:00:00Z",
    createdAt: "2026-01-10T00:00:00Z",
    createdBy: "user_admin",
  },
];

// Helper to generate API key
function generateApiKey(projectId: string): {
  key: string;
  prefix: string;
  hash: string;
} {
  const randomPart = randomBytes(24)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 32);
  const key = `ao_${projectId}_${randomPart}`;
  const prefix = `ao_${projectId}_${randomPart.slice(0, 8)}`;
  const hash = createHash("sha256").update(key).digest("hex");
  return { key, prefix, hash };
}

// Router
const router = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET / - List API keys
 */
router.get("/", async (c) => {
  const projectId = c.get("projectId");
  const includeRevoked = c.req.query("includeRevoked") === "true";

  let keys = mockApiKeys.filter(
    (k) => k.projectId === projectId || projectId === "proj_1",
  );

  if (!includeRevoked) {
    keys = keys.filter((k) => !k.revokedAt);
  }

  // Never return the hash in list view
  const sanitizedKeys = keys.map((k) => omitKeyHash(k));

  return c.json({ data: sanitizedKeys });
});

/**
 * GET /:keyId - Get API key details
 */
router.get("/:keyId", async (c) => {
  const keyId = c.req.param("keyId");

  const key = mockApiKeys.find((k) => k.id === keyId);
  if (!key) {
    return c.json({ error: "Not Found", message: "API key not found" }, 404);
  }

  // Never return the hash
  const sanitizedKey = omitKeyHash(key);

  return c.json({ data: sanitizedKey });
});

/**
 * POST / - Create new API key
 */
router.post("/", async (c) => {
  const body = await c.req.json();
  const projectId = c.get("projectId") ?? "proj_1";

  const validated = createKeySchema.parse(body);

  const { key, prefix, hash } = generateApiKey(projectId);

  const newKey = {
    id: `key_${Date.now()}`,
    projectId,
    name: validated.name,
    description: validated.description ?? null,
    keyPrefix: prefix,
    keyHash: hash,
    scopes: validated.scopes,
    rateLimit: validated.rateLimit ?? {
      requestsPerMinute: 1000,
      eventsPerMinute: 10000,
    },
    allowedIps: validated.allowedIps ?? null,
    allowedOrigins: validated.allowedOrigins ?? null,
    lastUsedAt: null,
    lastUsedIp: null,
    usageCount: 0,
    expiresAt: validated.expiresAt ?? null,
    revokedAt: null,
    createdAt: new Date().toISOString(),
    createdBy: "current_user",
  };

  mockApiKeys.push(newKey as ApiKeyConfig);

  // Return the full key only on creation - this is the only time it's visible
  return c.json(
    {
      data: {
        ...newKey,
        key, // Full API key - ONLY shown once, never stored or returned again
        keyHash: undefined,
      },
      warning: "Save this API key now. It will not be shown again.",
    },
    201,
  );
});

/**
 * PATCH /:keyId - Update API key
 */
router.patch("/:keyId", async (c) => {
  const keyId = c.req.param("keyId");
  const body = await c.req.json();

  const key = mockApiKeys.find((k) => k.id === keyId);
  if (!key) {
    return c.json({ error: "Not Found", message: "API key not found" }, 404);
  }

  if (key.revokedAt) {
    return c.json(
      { error: "Bad Request", message: "Cannot update a revoked key" },
      400,
    );
  }

  const validated = updateKeySchema.parse(body);
  Object.assign(key, validated);

  const sanitizedKey = omitKeyHash(key);

  return c.json({ data: sanitizedKey });
});

/**
 * POST /:keyId/revoke - Revoke API key
 */
router.post("/:keyId/revoke", async (c) => {
  const keyId = c.req.param("keyId");

  const key = mockApiKeys.find((k) => k.id === keyId);
  if (!key) {
    return c.json({ error: "Not Found", message: "API key not found" }, 404);
  }

  if (key.revokedAt) {
    return c.json(
      { error: "Bad Request", message: "Key is already revoked" },
      400,
    );
  }

  key.revokedAt = new Date().toISOString();

  return c.json({
    data: {
      success: true,
      message: "API key revoked",
      revokedAt: key.revokedAt,
    },
  });
});

/**
 * DELETE /:keyId - Permanently delete API key
 */
router.delete("/:keyId", async (c) => {
  const keyId = c.req.param("keyId");

  const index = mockApiKeys.findIndex((k) => k.id === keyId);
  if (index === -1) {
    return c.json({ error: "Not Found", message: "API key not found" }, 404);
  }

  mockApiKeys.splice(index, 1);

  return c.json({
    data: { success: true, message: "API key deleted permanently" },
  });
});

/**
 * GET /:keyId/usage - Get API key usage statistics
 */
router.get("/:keyId/usage", async (c) => {
  const keyId = c.req.param("keyId");
  const range = c.req.query("range") || "7d";

  const key = mockApiKeys.find((k) => k.id === keyId);
  if (!key) {
    return c.json({ error: "Not Found", message: "API key not found" }, 404);
  }

  // Mock usage data
  const usage = {
    keyId,
    range,
    totalRequests: key.usageCount,
    totalEvents: key.usageCount * 5,
    timeSeries: [
      { date: "2026-01-22", requests: 1200, events: 6000 },
      { date: "2026-01-23", requests: 1450, events: 7250 },
      { date: "2026-01-24", requests: 1380, events: 6900 },
      { date: "2026-01-25", requests: 1520, events: 7600 },
      { date: "2026-01-26", requests: 1290, events: 6450 },
      { date: "2026-01-27", requests: 1350, events: 6750 },
      { date: "2026-01-28", requests: 890, events: 4450 },
    ],
    byEndpoint: [
      { endpoint: "POST /v1/events", count: key.usageCount * 0.9 },
      { endpoint: "GET /v1/sessions", count: key.usageCount * 0.08 },
      { endpoint: "GET /v1/metrics", count: key.usageCount * 0.02 },
    ],
    rateLimit: {
      currentUsage: 42,
      limit: key.rateLimit?.requestsPerMinute ?? 1000,
      percentUsed: 4.2,
    },
  };

  return c.json({ data: usage });
});

/**
 * POST /:keyId/rotate - Rotate API key (create new, revoke old)
 */
router.post("/:keyId/rotate", async (c) => {
  const keyId = c.req.param("keyId");
  const projectId = c.get("projectId") ?? "proj_1";

  const oldKey = mockApiKeys.find((k) => k.id === keyId);
  if (!oldKey) {
    return c.json({ error: "Not Found", message: "API key not found" }, 404);
  }

  if (oldKey.revokedAt) {
    return c.json(
      { error: "Bad Request", message: "Cannot rotate a revoked key" },
      400,
    );
  }

  // Generate new key
  const { key, prefix, hash } = generateApiKey(projectId);

  const newKey = {
    id: `key_${Date.now()}`,
    projectId,
    name: `${oldKey.name} (Rotated)`,
    description: oldKey.description,
    keyPrefix: prefix,
    keyHash: hash,
    scopes: oldKey.scopes,
    rateLimit: oldKey.rateLimit,
    allowedIps: oldKey.allowedIps,
    allowedOrigins: oldKey.allowedOrigins,
    lastUsedAt: null,
    lastUsedIp: null,
    usageCount: 0,
    expiresAt: oldKey.expiresAt,
    revokedAt: null,
    createdAt: new Date().toISOString(),
    createdBy: "current_user",
  };

  // Revoke old key
  oldKey.revokedAt = new Date().toISOString();

  // Add new key
  mockApiKeys.push(newKey as ApiKeyConfig);

  return c.json(
    {
      data: {
        newKey: {
          ...newKey,
          key, // Full API key - ONLY shown once
          keyHash: undefined,
        },
        oldKeyId: keyId,
        oldKeyRevokedAt: oldKey.revokedAt,
      },
      warning: "Save this new API key now. It will not be shown again.",
    },
    201,
  );
});

export { router as apiKeysRouter };
