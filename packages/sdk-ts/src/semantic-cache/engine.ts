/**
 * Semantic Cache Engine
 *
 * Intelligent caching layer that reduces redundant LLM calls
 * via exact, fuzzy, and semantic matching strategies.
 */

import { generateEventId, now } from "../utils.js";
import type {
  SemanticCacheConfig,
  ResolvedSemanticCacheConfig,
  CacheEntry,
  CacheLookupResult,
  CacheSetResult,
  CacheStats,
  CacheROI,
} from "./types.js";

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: ResolvedSemanticCacheConfig = {
  enabled: true,
  maxEntries: 1000,
  defaultTTLMs: 3_600_000, // 1 hour
  similarityThreshold: 0.85,
  matchMode: "fuzzy",
  qualityThreshold: 0.7,
  evictionPolicy: "lru",
  trackMetrics: true,
  debug: false,
};

// ============================================================================
// Engine
// ============================================================================

export class SemanticCacheEngine {
  private readonly config: ResolvedSemanticCacheConfig;

  private readonly entries: Map<string, CacheEntry> = new Map();
  private readonly hashIndex: Map<string, string> = new Map(); // hash → entryId

  // Metrics
  private totalHits = 0;
  private totalMisses = 0;
  private evictionCount = 0;
  private totalLookupDurationMs = 0;
  private totalLookups = 0;
  private totalCostSaved = 0;
  private totalTokensSaved = 0;

  // ROI tracking
  private totalCostRecorded = 0;
  private totalTokensRecorded = 0;

  constructor(config: SemanticCacheConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  get(prompt: string, options?: { model?: string }): CacheLookupResult {
    const start = now();

    if (!this.config.enabled) {
      return this.miss(start);
    }

    const normalizedKey = this.normalizeKey(prompt);
    const hash = this.hash(normalizedKey);

    // 1. Exact match
    const exactId = this.hashIndex.get(hash);
    if (exactId) {
      const entry = this.entries.get(exactId);
      if (entry && !this.isExpired(entry)) {
        if (options?.model && entry.model !== options.model) {
          // Model mismatch – skip
        } else if (!this.meetsQuality(entry)) {
          // Quality too low
        } else {
          this.recordHit(entry);
          return this.hit(entry, 1, "exact", start);
        }
      }
    }

    // 2. Fuzzy / semantic match (skip for exact-only mode)
    if (this.config.matchMode !== "exact") {
      let bestEntry: CacheEntry | null = null;
      let bestSimilarity = 0;

      for (const entry of this.entries.values()) {
        if (this.isExpired(entry)) continue;
        if (options?.model && entry.model !== options.model) continue;
        if (!this.meetsQuality(entry)) continue;

        const similarity = this.similarity(normalizedKey, entry.key);
        if (
          similarity >= this.config.similarityThreshold &&
          similarity > bestSimilarity
        ) {
          bestSimilarity = similarity;
          bestEntry = entry;
        }
      }

      if (bestEntry) {
        this.recordHit(bestEntry);
        return this.hit(bestEntry, bestSimilarity, "fuzzy", start);
      }
    }

    // 3. Miss
    this.totalMisses++;
    return this.miss(start);
  }

  set(
    prompt: string,
    response: string,
    options: {
      model: string;
      tokens: { prompt: number; completion: number; total: number };
      cost: number;
      qualityScore?: number;
      ttlMs?: number;
      metadata?: Record<string, unknown>;
    },
  ): CacheSetResult {
    const normalizedKey = this.normalizeKey(prompt);
    const hash = this.hash(normalizedKey);
    const id = generateEventId();
    const timestamp = now();
    const ttl = options.ttlMs ?? this.config.defaultTTLMs;

    const evicted: string[] = [];

    // Evict if at capacity
    while (this.entries.size >= this.config.maxEntries) {
      const evictedId = this.evictOne();
      if (evictedId) {
        evicted.push(evictedId);
      } else {
        break;
      }
    }

    const entry: CacheEntry = {
      id,
      key: normalizedKey,
      keyHash: hash,
      prompt,
      response,
      model: options.model,
      tokens: { ...options.tokens },
      cost: options.cost,
      qualityScore: options.qualityScore,
      createdAt: timestamp,
      expiresAt: timestamp + ttl,
      lastAccessedAt: timestamp,
      accessCount: 0,
      metadata: options.metadata ? { ...options.metadata } : {},
    };

    this.entries.set(id, entry);
    this.hashIndex.set(hash, id);

    // Track total cost/tokens for ROI
    this.totalCostRecorded += options.cost;
    this.totalTokensRecorded += options.tokens.total;

    return { stored: true, entryId: id, evicted };
  }

  invalidate(entryId: string): boolean {
    const entry = this.entries.get(entryId);
    if (!entry) return false;
    this.hashIndex.delete(entry.keyHash);
    this.entries.delete(entryId);
    return true;
  }

  invalidateByModel(model: string): number {
    let count = 0;
    for (const [id, entry] of this.entries) {
      if (entry.model === model) {
        this.hashIndex.delete(entry.keyHash);
        this.entries.delete(id);
        count++;
      }
    }
    return count;
  }

  invalidateExpired(): number {
    let count = 0;
    const timestamp = now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= timestamp) {
        this.hashIndex.delete(entry.keyHash);
        this.entries.delete(id);
        count++;
      }
    }
    return count;
  }

  getEntry(id: string): CacheEntry | undefined {
    return this.entries.get(id);
  }

  getStats(): CacheStats {
    const total = this.totalHits + this.totalMisses;
    return {
      totalEntries: this.entries.size,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      hitRate: total > 0 ? this.totalHits / total : 0,
      totalCostSaved: this.totalCostSaved,
      totalTokensSaved: this.totalTokensSaved,
      avgLookupDurationMs:
        this.totalLookups > 0
          ? this.totalLookupDurationMs / this.totalLookups
          : 0,
      evictionCount: this.evictionCount,
      memoryEstimateBytes: this.estimateMemory(),
    };
  }

  getROI(): CacheROI {
    const totalRequests = this.totalHits + this.totalMisses;
    const costWithoutCache = this.totalCostRecorded + this.totalCostSaved;
    const tokensWithoutCache = this.totalTokensRecorded + this.totalTokensSaved;
    const hitRate = totalRequests > 0 ? this.totalHits / totalRequests : 0;
    const totalSavings = this.totalCostSaved;
    const savingsPercentage =
      costWithoutCache > 0 ? totalSavings / costWithoutCache : 0;

    return {
      totalRequests,
      cacheHits: this.totalHits,
      cacheMisses: this.totalMisses,
      hitRate,
      costWithoutCache,
      costWithCache: this.totalCostRecorded,
      totalSavings,
      savingsPercentage,
      tokensWithoutCache,
      tokensWithCache: this.totalTokensRecorded,
    };
  }

  warmUp(
    entries: Array<{
      prompt: string;
      response: string;
      model: string;
      tokens: { prompt: number; completion: number; total: number };
      cost: number;
    }>,
  ): number {
    let count = 0;
    for (const e of entries) {
      if (this.entries.size >= this.config.maxEntries) break;
      this.set(e.prompt, e.response, {
        model: e.model,
        tokens: e.tokens,
        cost: e.cost,
      });
      count++;
    }
    return count;
  }

  clear(): void {
    this.entries.clear();
    this.hashIndex.clear();
  }

  size(): number {
    return this.entries.size;
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  private normalizeKey(prompt: string): string {
    return prompt.trim().toLowerCase().replace(/\s+/g, " ");
  }

  /** djb2 string hash */
  private hash(str: string): string {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return `h_${(h >>> 0).toString(36)}`;
  }

  /** Normalized Jaccard similarity on word sets */
  private similarity(a: string, b: string): number {
    const setA = new Set(a.split(" "));
    const setB = new Set(b.split(" "));
    let intersection = 0;
    for (const w of setA) {
      if (setB.has(w)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 1 : intersection / union;
  }

  private isExpired(entry: CacheEntry): boolean {
    return now() >= entry.expiresAt;
  }

  private meetsQuality(entry: CacheEntry): boolean {
    if (entry.qualityScore === undefined) return true;
    return entry.qualityScore >= this.config.qualityThreshold;
  }

  private recordHit(entry: CacheEntry): void {
    entry.lastAccessedAt = now();
    entry.accessCount++;
    this.totalHits++;
    if (this.config.trackMetrics) {
      this.totalCostSaved += entry.cost;
      this.totalTokensSaved += entry.tokens.total;
    }
  }

  private hit(
    entry: CacheEntry,
    similarity: number,
    source: "exact" | "fuzzy",
    startTime: number,
  ): CacheLookupResult {
    const duration = now() - startTime;
    this.totalLookupDurationMs += duration;
    this.totalLookups++;
    return {
      hit: true,
      entry,
      similarity,
      source,
      lookupDurationMs: duration,
    };
  }

  private miss(startTime: number): CacheLookupResult {
    const duration = now() - startTime;
    this.totalLookupDurationMs += duration;
    this.totalLookups++;
    return {
      hit: false,
      entry: null,
      similarity: 0,
      source: "miss",
      lookupDurationMs: duration,
    };
  }

  /** Evict one entry according to eviction policy. Returns evicted ID or null. */
  private evictOne(): string | null {
    if (this.entries.size === 0) return null;

    let victimId: string | null = null;

    switch (this.config.evictionPolicy) {
      case "lru": {
        let oldest = Infinity;
        for (const [id, entry] of this.entries) {
          if (entry.lastAccessedAt < oldest) {
            oldest = entry.lastAccessedAt;
            victimId = id;
          }
        }
        break;
      }
      case "lfu": {
        let leastAccess = Infinity;
        for (const [id, entry] of this.entries) {
          if (entry.accessCount < leastAccess) {
            leastAccess = entry.accessCount;
            victimId = id;
          }
        }
        break;
      }
      case "ttl": {
        let soonest = Infinity;
        for (const [id, entry] of this.entries) {
          if (entry.expiresAt < soonest) {
            soonest = entry.expiresAt;
            victimId = id;
          }
        }
        break;
      }
    }

    if (victimId) {
      const entry = this.entries.get(victimId)!;
      this.hashIndex.delete(entry.keyHash);
      this.entries.delete(victimId);
      this.evictionCount++;
    }

    return victimId;
  }

  private estimateMemory(): number {
    let bytes = 0;
    for (const entry of this.entries.values()) {
      bytes +=
        entry.prompt.length * 2 +
        entry.response.length * 2 +
        entry.key.length * 2 +
        entry.model.length * 2 +
        200; // overhead for numbers, metadata pointers, etc.
    }
    return bytes;
  }
}
