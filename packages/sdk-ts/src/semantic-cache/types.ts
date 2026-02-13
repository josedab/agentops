/**
 * Semantic Cache - Type Definitions
 *
 * Types for the intelligent caching layer that reduces redundant LLM calls.
 */

// ============================================================================
// Configuration
// ============================================================================

/** User-provided cache configuration (all fields optional). */
export interface SemanticCacheConfig {
  enabled?: boolean;
  maxEntries?: number;
  defaultTTLMs?: number;
  similarityThreshold?: number;
  matchMode?: "exact" | "fuzzy" | "semantic";
  qualityThreshold?: number;
  evictionPolicy?: "lru" | "lfu" | "ttl";
  trackMetrics?: boolean;
  debug?: boolean;
}

/** Fully resolved configuration with all defaults applied. */
export interface ResolvedSemanticCacheConfig {
  enabled: boolean;
  maxEntries: number;
  defaultTTLMs: number;
  similarityThreshold: number;
  matchMode: "exact" | "fuzzy" | "semantic";
  qualityThreshold: number;
  evictionPolicy: "lru" | "lfu" | "ttl";
  trackMetrics: boolean;
  debug: boolean;
}

// ============================================================================
// Cache Entry
// ============================================================================

export interface CacheEntry {
  id: string;
  key: string;
  keyHash: string;
  prompt: string;
  response: string;
  model: string;
  tokens: { prompt: number; completion: number; total: number };
  cost: number;
  qualityScore?: number;
  createdAt: number;
  expiresAt: number;
  lastAccessedAt: number;
  accessCount: number;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Lookup & Storage Results
// ============================================================================

export interface CacheLookupResult {
  hit: boolean;
  entry: CacheEntry | null;
  similarity: number;
  source: "exact" | "fuzzy" | "miss";
  lookupDurationMs: number;
}

export interface CacheSetResult {
  stored: boolean;
  entryId: string;
  evicted: string[];
}

// ============================================================================
// Metrics
// ============================================================================

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  totalCostSaved: number;
  totalTokensSaved: number;
  avgLookupDurationMs: number;
  evictionCount: number;
  memoryEstimateBytes: number;
}

export interface CacheROI {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  costWithoutCache: number;
  costWithCache: number;
  totalSavings: number;
  savingsPercentage: number;
  tokensWithoutCache: number;
  tokensWithCache: number;
}
