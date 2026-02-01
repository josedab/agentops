import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { randomBytes, createHash } from "crypto";

// Mock API keys
const mockApiKeys = [
  {
    id: "key_1",
    projectId: "proj_1",
    name: "Production Key",
    keyPrefix: "ao_proj1_abc",
    keyHash: "hash1",
    scopes: ["ingest", "read"],
    lastUsedAt: new Date("2026-01-28T10:00:00Z"),
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "key_2",
    projectId: "proj_1",
    name: "Development Key",
    keyPrefix: "ao_proj1_def",
    keyHash: "hash2",
    scopes: ["ingest", "read"],
    lastUsedAt: new Date("2026-01-27T15:30:00Z"),
    expiresAt: new Date("2026-12-31T23:59:59Z"),
    revokedAt: null,
    createdAt: new Date("2026-01-15T00:00:00Z"),
  },
  {
    id: "key_3",
    projectId: "proj_1",
    name: "CI/CD Key",
    keyPrefix: "ao_proj1_ghi",
    keyHash: "hash3",
    scopes: ["ingest"],
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: new Date("2026-01-20T00:00:00Z"),
    createdAt: new Date("2026-01-10T00:00:00Z"),
  },
];

function generateApiKey(projectId: string): {
  key: string;
  prefix: string;
  hash: string;
} {
  const randomPart = randomBytes(24).toString("base64url");
  const key = `ao_${projectId}_${randomPart}`;
  const prefix = `ao_${projectId}_${randomPart.slice(0, 8)}`;
  const hash = createHash("sha256").update(key).digest("hex");
  return { key, prefix, hash };
}

export const apiKeysRouter = router({
  // List API keys for a project
  list: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        includeRevoked: z.boolean().default(false),
      }),
    )
    .query(async ({ input }) => {
      let keys = [...mockApiKeys];
      if (!input.includeRevoked) {
        keys = keys.filter((k) => !k.revokedAt);
      }
      return keys.map((k) => ({
        ...k,
        // Never return the actual hash in list
        keyHash: undefined,
      }));
    }),

  // Create a new API key
  create: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(255),
        scopes: z
          .array(z.enum(["ingest", "read", "write", "admin"]))
          .default(["ingest", "read"]),
        expiresAt: z.date().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { key, prefix, hash } = generateApiKey(input.projectId);

      const newKey = {
        id: `key_${Date.now()}`,
        projectId: input.projectId,
        name: input.name,
        keyPrefix: prefix,
        keyHash: hash,
        scopes: input.scopes,
        lastUsedAt: null as Date | null,
        expiresAt: input.expiresAt ?? null,
        revokedAt: null as Date | null,
        createdAt: new Date(),
      };

      mockApiKeys.push(newKey as any);

      // Return the full key only on creation (never stored/returned again)
      return {
        ...newKey,
        key, // Full key - only returned once!
      };
    }),

  // Revoke an API key
  revoke: publicProcedure
    .input(
      z.object({
        keyId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const key = mockApiKeys.find((k) => k.id === input.keyId);
      if (!key) return null;

      key.revokedAt = new Date();
      return { success: true };
    }),

  // Delete an API key permanently
  delete: publicProcedure
    .input(
      z.object({
        keyId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const index = mockApiKeys.findIndex((k) => k.id === input.keyId);
      if (index === -1) return { success: false };

      mockApiKeys.splice(index, 1);
      return { success: true };
    }),

  // Update API key name
  update: publicProcedure
    .input(
      z.object({
        keyId: z.string(),
        name: z.string().min(1).max(255).optional(),
        scopes: z
          .array(z.enum(["ingest", "read", "write", "admin"]))
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const key = mockApiKeys.find((k) => k.id === input.keyId);
      if (!key) return null;

      if (input.name) key.name = input.name;
      if (input.scopes) key.scopes = input.scopes;

      return key;
    }),
});
