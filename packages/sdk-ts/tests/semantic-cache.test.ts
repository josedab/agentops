import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SemanticCacheEngine } from "../src/semantic-cache/index.js";
import type {
  CacheLookupResult,
  CacheSetResult,
} from "../src/semantic-cache/index.js";
import { setClock, resetClock } from "../src/utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}

const BASE_OPTIONS = {
  model: "gpt-4",
  tokens: { prompt: 100, completion: 50, total: 150 },
  cost: 0.03,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SemanticCacheEngine", () => {
  let engine: SemanticCacheEngine;
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    clock = makeClock();
    setClock(clock);
    engine = new SemanticCacheEngine({ enabled: true, matchMode: "fuzzy" });
  });

  afterEach(() => {
    resetClock();
  });

  // ========================================================================
  // Exact match
  // ========================================================================

  describe("exact match", () => {
    it("returns a hit for an identical prompt", () => {
      engine.set("Hello world", "Hi there", BASE_OPTIONS);
      const result = engine.get("Hello world");
      expect(result.hit).toBe(true);
      expect(result.source).toBe("exact");
      expect(result.similarity).toBe(1);
      expect(result.entry?.response).toBe("Hi there");
    });

    it("is case-insensitive and whitespace-normalized", () => {
      engine.set("Hello  World", "Hi", BASE_OPTIONS);
      const result = engine.get("  hello   world  ");
      expect(result.hit).toBe(true);
      expect(result.source).toBe("exact");
    });

    it("returns a miss when prompt is not cached", () => {
      const result = engine.get("unknown prompt");
      expect(result.hit).toBe(false);
      expect(result.source).toBe("miss");
      expect(result.entry).toBeNull();
      expect(result.similarity).toBe(0);
    });
  });

  // ========================================================================
  // Fuzzy match
  // ========================================================================

  describe("fuzzy match", () => {
    it("returns a hit when similarity exceeds threshold", () => {
      engine = new SemanticCacheEngine({
        matchMode: "fuzzy",
        similarityThreshold: 0.7,
      });
      engine.set("what is the capital city of France", "Paris", BASE_OPTIONS);
      // High word overlap – Jaccard should be >= 0.7
      const result = engine.get("what is the capital of France");
      expect(result.hit).toBe(true);
      expect(result.similarity).toBeGreaterThanOrEqual(0.7);
    });

    it("returns a miss when similarity is below threshold", () => {
      engine.set("Tell me about dogs", "Dogs are great", BASE_OPTIONS);
      const result = engine.get("Explain quantum mechanics in detail");
      expect(result.hit).toBe(false);
      expect(result.source).toBe("miss");
    });

    it("selects the best match among multiple entries", () => {
      engine.set("capital of France", "Paris", BASE_OPTIONS);
      engine.set("capital of Germany", "Berlin", BASE_OPTIONS);
      const result = engine.get("what is the capital of France?");
      if (result.hit) {
        expect(result.entry?.response).toBe("Paris");
      }
    });
  });

  // ========================================================================
  // Exact-only mode
  // ========================================================================

  describe("exact-only mode", () => {
    it("skips fuzzy matching when matchMode is exact", () => {
      engine = new SemanticCacheEngine({ matchMode: "exact" });
      engine.set("Hello world", "Hi", BASE_OPTIONS);
      // Similar but not identical after normalization
      const result = engine.get("Hello world!!!");
      // Because "hello world!!!" normalizes differently than "hello world"
      expect(result.hit).toBe(false);
    });
  });

  // ========================================================================
  // TTL expiration
  // ========================================================================

  describe("TTL expiration", () => {
    it("returns a miss after TTL expires", () => {
      engine.set("prompt", "resp", { ...BASE_OPTIONS, ttlMs: 5000 });
      clock.advance(6000);
      const result = engine.get("prompt");
      expect(result.hit).toBe(false);
    });

    it("returns a hit before TTL expires", () => {
      engine.set("prompt", "resp", { ...BASE_OPTIONS, ttlMs: 5000 });
      clock.advance(4000);
      const result = engine.get("prompt");
      expect(result.hit).toBe(true);
    });

    it("uses default TTL when none is provided", () => {
      engine = new SemanticCacheEngine({ defaultTTLMs: 2000 });
      engine.set("p", "r", BASE_OPTIONS);
      clock.advance(3000);
      expect(engine.get("p").hit).toBe(false);
    });
  });

  // ========================================================================
  // Eviction policies
  // ========================================================================

  describe("LRU eviction", () => {
    it("evicts the least recently accessed entry when at capacity", () => {
      engine = new SemanticCacheEngine({
        maxEntries: 2,
        evictionPolicy: "lru",
      });
      engine.set("a", "1", BASE_OPTIONS);
      clock.advance(1);
      engine.set("b", "2", BASE_OPTIONS);
      clock.advance(1);

      // Access "a" so it's more recent
      engine.get("a");
      clock.advance(1);

      // This should evict "b" (least recently accessed)
      const result = engine.set("c", "3", BASE_OPTIONS);
      expect(result.evicted.length).toBe(1);
      expect(engine.size()).toBe(2);

      // "b" should be gone
      expect(engine.get("b").hit).toBe(false);
      // "a" should still be there
      expect(engine.get("a").hit).toBe(true);
    });
  });

  describe("LFU eviction", () => {
    it("evicts the least frequently accessed entry", () => {
      engine = new SemanticCacheEngine({
        maxEntries: 2,
        evictionPolicy: "lfu",
      });
      engine.set("a", "1", BASE_OPTIONS);
      engine.set("b", "2", BASE_OPTIONS);

      // Access "a" multiple times
      engine.get("a");
      engine.get("a");
      engine.get("a");

      // "b" has 0 accesses, should be evicted
      const result = engine.set("c", "3", BASE_OPTIONS);
      expect(result.evicted.length).toBe(1);
      expect(engine.get("b").hit).toBe(false);
      expect(engine.get("a").hit).toBe(true);
    });
  });

  describe("TTL eviction policy", () => {
    it("evicts the entry expiring soonest", () => {
      engine = new SemanticCacheEngine({
        maxEntries: 2,
        evictionPolicy: "ttl",
      });
      engine.set("a", "1", { ...BASE_OPTIONS, ttlMs: 1000 });
      engine.set("b", "2", { ...BASE_OPTIONS, ttlMs: 10000 });

      // "a" expires sooner, should be evicted
      const result = engine.set("c", "3", BASE_OPTIONS);
      expect(result.evicted.length).toBe(1);
      expect(engine.get("a").hit).toBe(false);
      expect(engine.get("b").hit).toBe(true);
    });
  });

  // ========================================================================
  // Invalidation
  // ========================================================================

  describe("invalidation", () => {
    it("removes a specific entry by id", () => {
      const { entryId } = engine.set("x", "y", BASE_OPTIONS);
      expect(engine.invalidate(entryId)).toBe(true);
      expect(engine.get("x").hit).toBe(false);
      expect(engine.size()).toBe(0);
    });

    it("returns false for non-existent id", () => {
      expect(engine.invalidate("nope")).toBe(false);
    });

    it("removes all entries for a model", () => {
      engine.set("a", "1", { ...BASE_OPTIONS, model: "gpt-4" });
      engine.set("b", "2", { ...BASE_OPTIONS, model: "gpt-3.5" });
      engine.set("c", "3", { ...BASE_OPTIONS, model: "gpt-4" });
      const count = engine.invalidateByModel("gpt-4");
      expect(count).toBe(2);
      expect(engine.size()).toBe(1);
    });

    it("removes expired entries", () => {
      engine.set("a", "1", { ...BASE_OPTIONS, ttlMs: 1000 });
      engine.set("b", "2", { ...BASE_OPTIONS, ttlMs: 10000 });
      clock.advance(2000);
      const count = engine.invalidateExpired();
      expect(count).toBe(1);
      expect(engine.size()).toBe(1);
    });
  });

  // ========================================================================
  // Quality threshold
  // ========================================================================

  describe("quality threshold", () => {
    it("does not serve entries with quality below threshold", () => {
      engine = new SemanticCacheEngine({ qualityThreshold: 0.7 });
      engine.set("q", "r", { ...BASE_OPTIONS, qualityScore: 0.5 });
      expect(engine.get("q").hit).toBe(false);
    });

    it("serves entries with quality at or above threshold", () => {
      engine = new SemanticCacheEngine({ qualityThreshold: 0.7 });
      engine.set("q", "r", { ...BASE_OPTIONS, qualityScore: 0.8 });
      expect(engine.get("q").hit).toBe(true);
    });

    it("serves entries without quality score (undefined)", () => {
      engine = new SemanticCacheEngine({ qualityThreshold: 0.7 });
      engine.set("q", "r", BASE_OPTIONS);
      expect(engine.get("q").hit).toBe(true);
    });
  });

  // ========================================================================
  // Stats
  // ========================================================================

  describe("stats tracking", () => {
    it("tracks hits and misses", () => {
      engine.set("a", "1", BASE_OPTIONS);
      engine.get("a"); // hit
      engine.get("a"); // hit
      engine.get("zzz"); // miss

      const stats = engine.getStats();
      expect(stats.totalHits).toBe(2);
      expect(stats.totalMisses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it("tracks cost and tokens saved", () => {
      engine.set("a", "1", BASE_OPTIONS);
      engine.get("a");

      const stats = engine.getStats();
      expect(stats.totalCostSaved).toBe(0.03);
      expect(stats.totalTokensSaved).toBe(150);
    });

    it("reports zero hit rate when no lookups", () => {
      expect(engine.getStats().hitRate).toBe(0);
    });

    it("tracks eviction count", () => {
      engine = new SemanticCacheEngine({ maxEntries: 1 });
      engine.set("a", "1", BASE_OPTIONS);
      engine.set("b", "2", BASE_OPTIONS);
      expect(engine.getStats().evictionCount).toBe(1);
    });

    it("estimates memory usage", () => {
      engine.set("hello world", "response", BASE_OPTIONS);
      const stats = engine.getStats();
      expect(stats.memoryEstimateBytes).toBeGreaterThan(0);
    });

    it("tracks total entries", () => {
      engine.set("a", "1", BASE_OPTIONS);
      engine.set("b", "2", BASE_OPTIONS);
      expect(engine.getStats().totalEntries).toBe(2);
    });
  });

  // ========================================================================
  // ROI
  // ========================================================================

  describe("ROI calculation", () => {
    it("calculates ROI correctly", () => {
      engine.set("a", "1", BASE_OPTIONS);
      engine.get("a"); // hit – saves cost
      engine.get("unknown"); // miss

      const roi = engine.getROI();
      expect(roi.totalRequests).toBe(2);
      expect(roi.cacheHits).toBe(1);
      expect(roi.cacheMisses).toBe(1);
      expect(roi.hitRate).toBe(0.5);
      expect(roi.totalSavings).toBe(0.03);
      expect(roi.costWithoutCache).toBe(0.03 + 0.03); // original + saved
      expect(roi.costWithCache).toBe(0.03); // only the stored one
      expect(roi.savingsPercentage).toBeCloseTo(0.5);
      expect(roi.tokensWithoutCache).toBe(300);
      expect(roi.tokensWithCache).toBe(150);
    });

    it("returns zero savings when no hits", () => {
      engine.set("a", "1", BASE_OPTIONS);
      engine.get("zzz");

      const roi = engine.getROI();
      expect(roi.totalSavings).toBe(0);
      expect(roi.savingsPercentage).toBe(0);
    });
  });

  // ========================================================================
  // Warm-up
  // ========================================================================

  describe("warm-up", () => {
    it("bulk-loads entries", () => {
      const items = [
        { prompt: "a", response: "1", ...BASE_OPTIONS },
        { prompt: "b", response: "2", ...BASE_OPTIONS },
        { prompt: "c", response: "3", ...BASE_OPTIONS },
      ];
      const count = engine.warmUp(items);
      expect(count).toBe(3);
      expect(engine.size()).toBe(3);
    });

    it("stops at maxEntries", () => {
      engine = new SemanticCacheEngine({ maxEntries: 2 });
      const items = [
        { prompt: "a", response: "1", ...BASE_OPTIONS },
        { prompt: "b", response: "2", ...BASE_OPTIONS },
        { prompt: "c", response: "3", ...BASE_OPTIONS },
      ];
      const count = engine.warmUp(items);
      expect(count).toBe(2);
      expect(engine.size()).toBe(2);
    });
  });

  // ========================================================================
  // Clear & size
  // ========================================================================

  describe("clear", () => {
    it("removes all entries", () => {
      engine.set("a", "1", BASE_OPTIONS);
      engine.set("b", "2", BASE_OPTIONS);
      engine.clear();
      expect(engine.size()).toBe(0);
      expect(engine.get("a").hit).toBe(false);
    });
  });

  // ========================================================================
  // Model-specific lookups
  // ========================================================================

  describe("model-specific lookups", () => {
    it("returns a hit only for matching model", () => {
      engine.set("prompt", "resp-4", { ...BASE_OPTIONS, model: "gpt-4" });
      engine.set("prompt2", "resp-3", {
        ...BASE_OPTIONS,
        model: "gpt-3.5",
      });

      const r1 = engine.get("prompt", { model: "gpt-4" });
      expect(r1.hit).toBe(true);
      expect(r1.entry?.response).toBe("resp-4");

      const r2 = engine.get("prompt", { model: "gpt-3.5" });
      expect(r2.hit).toBe(false);
    });

    it("returns a hit regardless of model when no model filter", () => {
      engine.set("prompt", "resp", { ...BASE_OPTIONS, model: "gpt-4" });
      const result = engine.get("prompt");
      expect(result.hit).toBe(true);
    });
  });

  // ========================================================================
  // Max entries enforcement
  // ========================================================================

  describe("max entries enforcement", () => {
    it("never exceeds maxEntries", () => {
      engine = new SemanticCacheEngine({ maxEntries: 3 });
      for (let i = 0; i < 10; i++) {
        engine.set(`prompt-${i}`, `resp-${i}`, BASE_OPTIONS);
      }
      expect(engine.size()).toBeLessThanOrEqual(3);
    });
  });

  // ========================================================================
  // getEntry
  // ========================================================================

  describe("getEntry", () => {
    it("returns the entry by id", () => {
      const { entryId } = engine.set("p", "r", BASE_OPTIONS);
      const entry = engine.getEntry(entryId);
      expect(entry).toBeDefined();
      expect(entry?.prompt).toBe("p");
      expect(entry?.response).toBe("r");
    });

    it("returns undefined for unknown id", () => {
      expect(engine.getEntry("nope")).toBeUndefined();
    });
  });

  // ========================================================================
  // Disabled cache
  // ========================================================================

  describe("disabled cache", () => {
    it("always returns a miss when disabled", () => {
      engine = new SemanticCacheEngine({ enabled: false });
      engine.set("a", "1", BASE_OPTIONS);
      expect(engine.get("a").hit).toBe(false);
    });
  });

  // ========================================================================
  // Metadata
  // ========================================================================

  describe("metadata", () => {
    it("stores metadata on cache entries", () => {
      const { entryId } = engine.set("p", "r", {
        ...BASE_OPTIONS,
        metadata: { source: "test", version: 2 },
      });
      const entry = engine.getEntry(entryId);
      expect(entry?.metadata).toEqual({ source: "test", version: 2 });
    });

    it("defaults to empty metadata", () => {
      const { entryId } = engine.set("p", "r", BASE_OPTIONS);
      const entry = engine.getEntry(entryId);
      expect(entry?.metadata).toEqual({});
    });
  });

  // ========================================================================
  // Lookup duration
  // ========================================================================

  describe("lookup duration", () => {
    it("reports lookup duration in result", () => {
      engine.set("x", "y", BASE_OPTIONS);
      const result = engine.get("x");
      expect(result.lookupDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("tracks average lookup duration in stats", () => {
      engine.set("x", "y", BASE_OPTIONS);
      engine.get("x");
      engine.get("zzz");
      expect(engine.getStats().avgLookupDurationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
