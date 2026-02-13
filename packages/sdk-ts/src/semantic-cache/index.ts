/**
 * Semantic Cache - Intelligent Caching Layer
 *
 * Reduces redundant LLM calls through exact, fuzzy, and semantic matching.
 *
 * @packageDocumentation
 */

export { SemanticCacheEngine } from "./engine.js";

export type {
  SemanticCacheConfig,
  ResolvedSemanticCacheConfig,
  CacheEntry,
  CacheLookupResult,
  CacheSetResult,
  CacheStats,
  CacheROI,
} from "./types.js";
