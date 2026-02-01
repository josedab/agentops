import { z } from "zod";
import { router, publicProcedure } from "../trpc";

// Semantic cache configuration
interface CacheEntry {
  id: string;
  promptHash: string;
  promptEmbedding: number[];
  prompt: string;
  response: string;
  model: string;
  createdAt: Date;
  lastAccessedAt: Date;
  hitCount: number;
  ttlSeconds: number;
  metadata?: Record<string, unknown>;
}

// Mock in-memory cache (in production, use Redis + Vector DB)
const cacheStore = new Map<string, CacheEntry>();

// Cosine similarity for vector comparison
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Generate mock embedding (in production, use OpenAI/Cohere embeddings)
function generateEmbedding(text: string): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < 256; i++) {
    const charSum = text.split("").reduce((sum, char, idx) => {
      return sum + char.charCodeAt(0) * ((idx + i) % 100);
    }, 0);
    embedding.push(Math.sin(charSum) * 0.5 + 0.5);
  }
  return embedding;
}

// Simple hash function
function hashPrompt(prompt: string): string {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export const cacheRouter = router({
  // Lookup cache by semantic similarity
  lookup: publicProcedure
    .input(
      z.object({
        prompt: z.string(),
        model: z.string().optional(),
        similarityThreshold: z.number().min(0).max(1).default(0.95),
        projectId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const queryEmbedding = generateEmbedding(input.prompt);
      let bestMatch: CacheEntry | null = null;
      let bestSimilarity = 0;

      for (const entry of cacheStore.values()) {
        if (input.model && entry.model !== input.model) continue;

        const similarity = cosineSimilarity(
          queryEmbedding,
          entry.promptEmbedding,
        );
        if (
          similarity >= input.similarityThreshold &&
          similarity > bestSimilarity
        ) {
          bestMatch = entry;
          bestSimilarity = similarity;
        }
      }

      if (bestMatch) {
        // Update access stats
        bestMatch.hitCount++;
        bestMatch.lastAccessedAt = new Date();

        return {
          hit: true,
          cacheId: bestMatch.id,
          response: bestMatch.response,
          similarity: bestSimilarity,
          savedTokens: bestMatch.response.length / 4, // Rough estimate
          originalPrompt: bestMatch.prompt,
        };
      }

      return {
        hit: false,
        similarity: bestSimilarity,
      };
    }),

  // Store response in cache
  store: publicProcedure
    .input(
      z.object({
        prompt: z.string(),
        response: z.string(),
        model: z.string(),
        ttlSeconds: z.number().default(3600),
        projectId: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const id = `cache_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const embedding = generateEmbedding(input.prompt);

      const entry: CacheEntry = {
        id,
        promptHash: hashPrompt(input.prompt),
        promptEmbedding: embedding,
        prompt: input.prompt,
        response: input.response,
        model: input.model,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        hitCount: 0,
        ttlSeconds: input.ttlSeconds,
        metadata: input.metadata,
      };

      cacheStore.set(id, entry);

      return {
        cacheId: id,
        stored: true,
        expiresAt: new Date(Date.now() + input.ttlSeconds * 1000),
      };
    }),

  // Invalidate cache entries
  invalidate: publicProcedure
    .input(
      z.object({
        cacheIds: z.array(z.string()).optional(),
        prompt: z.string().optional(),
        model: z.string().optional(),
        olderThan: z.date().optional(),
        projectId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      let invalidatedCount = 0;

      if (input.cacheIds) {
        for (const id of input.cacheIds) {
          if (cacheStore.delete(id)) {
            invalidatedCount++;
          }
        }
      } else {
        // Invalidate by criteria
        for (const [id, entry] of cacheStore.entries()) {
          let shouldInvalidate = false;

          if (input.model && entry.model === input.model) {
            shouldInvalidate = true;
          }
          if (input.olderThan && entry.createdAt < input.olderThan) {
            shouldInvalidate = true;
          }

          if (shouldInvalidate) {
            cacheStore.delete(id);
            invalidatedCount++;
          }
        }
      }

      return {
        invalidatedCount,
        remainingEntries: cacheStore.size,
      };
    }),

  // Get cache statistics
  getStats: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        timeRange: z.enum(["1h", "24h", "7d", "30d"]).default("24h"),
      }),
    )
    .query(async () => {
      const entries = Array.from(cacheStore.values());
      const totalHits = entries.reduce((sum, e) => sum + e.hitCount, 0);
      const totalEntries = entries.length;

      return {
        totalEntries,
        totalHits,
        hitRate:
          totalEntries > 0 ? (totalHits / (totalHits + totalEntries)) * 100 : 0,
        avgResponseSize:
          entries.length > 0
            ? entries.reduce((sum, e) => sum + e.response.length, 0) /
              entries.length
            : 0,
        estimatedSavings: {
          tokens: totalHits * 500, // Avg tokens saved per hit
          cost: totalHits * 0.002, // Avg cost saved per hit
          latency: totalHits * 800, // Avg ms saved per hit
        },
        topPrompts: entries
          .sort((a, b) => b.hitCount - a.hitCount)
          .slice(0, 10)
          .map((e) => ({
            promptPreview: e.prompt.slice(0, 100),
            hitCount: e.hitCount,
            model: e.model,
          })),
        byModel: entries.reduce(
          (acc, e) => {
            acc[e.model] = (acc[e.model] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      };
    }),

  // List cache entries with filtering
  list: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        model: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        sortBy: z
          .enum(["createdAt", "lastAccessedAt", "hitCount"])
          .default("lastAccessedAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      }),
    )
    .query(async ({ input }) => {
      let entries = Array.from(cacheStore.values());

      if (input.model) {
        entries = entries.filter((e) => e.model === input.model);
      }

      entries.sort((a, b) => {
        const aVal =
          a[input.sortBy] instanceof Date
            ? (a[input.sortBy] as Date).getTime()
            : (a[input.sortBy] as number);
        const bVal =
          b[input.sortBy] instanceof Date
            ? (b[input.sortBy] as Date).getTime()
            : (b[input.sortBy] as number);
        return input.sortOrder === "desc" ? bVal - aVal : aVal - bVal;
      });

      const total = entries.length;
      entries = entries.slice(input.offset, input.offset + input.limit);

      return {
        entries: entries.map((e) => ({
          id: e.id,
          promptPreview: e.prompt.slice(0, 200),
          responsePreview: e.response.slice(0, 200),
          model: e.model,
          hitCount: e.hitCount,
          createdAt: e.createdAt,
          lastAccessedAt: e.lastAccessedAt,
        })),
        total,
        hasMore: input.offset + input.limit < total,
      };
    }),

  // Get single cache entry details
  get: publicProcedure
    .input(
      z.object({
        cacheId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const entry = cacheStore.get(input.cacheId);
      if (!entry) {
        throw new Error("Cache entry not found");
      }

      return {
        id: entry.id,
        prompt: entry.prompt,
        response: entry.response,
        model: entry.model,
        hitCount: entry.hitCount,
        createdAt: entry.createdAt,
        lastAccessedAt: entry.lastAccessedAt,
        ttlSeconds: entry.ttlSeconds,
        metadata: entry.metadata,
      };
    }),

  // Configure cache settings
  updateConfig: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        enabled: z.boolean().optional(),
        defaultTtlSeconds: z
          .number()
          .min(60)
          .max(86400 * 30)
          .optional(),
        similarityThreshold: z.number().min(0.8).max(1).optional(),
        maxEntries: z.number().min(100).max(100000).optional(),
        excludeModels: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // In production, save to database
      return {
        success: true,
        config: {
          projectId: input.projectId,
          enabled: input.enabled ?? true,
          defaultTtlSeconds: input.defaultTtlSeconds ?? 3600,
          similarityThreshold: input.similarityThreshold ?? 0.95,
          maxEntries: input.maxEntries ?? 10000,
          excludeModels: input.excludeModels ?? [],
        },
      };
    }),

  // Get cache configuration
  getConfig: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return {
        projectId: input.projectId,
        enabled: true,
        defaultTtlSeconds: 3600,
        similarityThreshold: 0.95,
        maxEntries: 10000,
        excludeModels: [],
        currentUsage: cacheStore.size,
      };
    }),
});
