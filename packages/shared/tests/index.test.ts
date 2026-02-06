import { describe, it, expect } from "vitest";
import {
  MODEL_PRICING,
  DEFAULT_MODEL_PRICING,
  normalizeModelName,
  getModelPricing,
  hasKnownPricing,
  calculateCost,
  EVENT_TYPES,
  API_VERSION,
  SDK_VERSION,
  sleep,
  calculateBackoff,
} from "../src/index.js";

// ============================================================================
// Pricing Data
// ============================================================================

describe("MODEL_PRICING", () => {
  it("contains pricing for major model families", () => {
    expect(MODEL_PRICING["gpt-4o"]).toBeDefined();
    expect(MODEL_PRICING["claude-3-5-sonnet"]).toBeDefined();
    expect(MODEL_PRICING["gemini-1.5-pro"]).toBeDefined();
  });

  it("has positive input and output costs for all models", () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.input, `${model} input`).toBeGreaterThan(0);
      expect(pricing.output, `${model} output`).toBeGreaterThan(0);
    }
  });

  it("has output cost >= input cost for all models", () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.output, `${model} output >= input`).toBeGreaterThanOrEqual(
        pricing.input,
      );
    }
  });
});

// ============================================================================
// normalizeModelName
// ============================================================================

describe("normalizeModelName", () => {
  it("returns known models unchanged", () => {
    expect(normalizeModelName("gpt-4o")).toBe("gpt-4o");
    expect(normalizeModelName("claude-3-5-sonnet")).toBe("claude-3-5-sonnet");
  });

  it("resolves aliases", () => {
    expect(normalizeModelName("gpt-4-1106-preview")).toBe(
      "gpt-4-turbo-preview",
    );
    expect(normalizeModelName("gpt-4-0125-preview")).toBe(
      "gpt-4-turbo-preview",
    );
  });

  it("strips date suffixes to match base models", () => {
    // claude-3-opus-20240229 is in the table, but test with a model whose
    // dated version is NOT in the table so the date-strip logic is exercised
    expect(normalizeModelName("gemini-1.5-pro-20250101")).toBe(
      "gemini-1.5-pro",
    );
  });

  it("returns unknown models unchanged", () => {
    expect(normalizeModelName("some-future-model")).toBe("some-future-model");
  });

  it("matches prefix-based models", () => {
    expect(normalizeModelName("gpt-4o-2025-01-01")).toBe("gpt-4o");
  });
});

// ============================================================================
// getModelPricing
// ============================================================================

describe("getModelPricing", () => {
  it("returns correct pricing for known models", () => {
    const pricing = getModelPricing("gpt-4o");
    expect(pricing).toEqual(MODEL_PRICING["gpt-4o"]);
  });

  it("returns default pricing for unknown models", () => {
    const pricing = getModelPricing("unknown-model-xyz");
    expect(pricing).toEqual(DEFAULT_MODEL_PRICING);
  });

  it("normalizes before lookup", () => {
    const pricing = getModelPricing("gpt-4-1106-preview");
    expect(pricing).toEqual(MODEL_PRICING["gpt-4-turbo-preview"]);
  });
});

// ============================================================================
// hasKnownPricing
// ============================================================================

describe("hasKnownPricing", () => {
  it("returns true for known models", () => {
    expect(hasKnownPricing("gpt-4o")).toBe(true);
    expect(hasKnownPricing("claude-3-5-sonnet")).toBe(true);
  });

  it("returns true for models resolved via aliases", () => {
    expect(hasKnownPricing("gpt-4-1106-preview")).toBe(true);
  });

  it("returns false for unknown models", () => {
    expect(hasKnownPricing("unknown-model-xyz")).toBe(false);
  });
});

// ============================================================================
// calculateCost
// ============================================================================

describe("calculateCost", () => {
  it("calculates cost correctly for known models", () => {
    const result = calculateCost("gpt-4o", 1000, 500);
    const pricing = MODEL_PRICING["gpt-4o"];
    expect(result.inputCost).toBeCloseTo(pricing.input);
    expect(result.outputCost).toBeCloseTo((500 / 1000) * pricing.output);
    expect(result.totalCost).toBeCloseTo(result.inputCost + result.outputCost);
  });

  it("returns zero costs for zero tokens", () => {
    const result = calculateCost("gpt-4o", 0, 0);
    expect(result.inputCost).toBe(0);
    expect(result.outputCost).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it("uses default pricing for unknown models", () => {
    const result = calculateCost("unknown-model", 1000, 1000);
    expect(result.inputCost).toBeCloseTo(DEFAULT_MODEL_PRICING.input);
    expect(result.outputCost).toBeCloseTo(DEFAULT_MODEL_PRICING.output);
  });

  it("totalCost equals inputCost + outputCost", () => {
    const result = calculateCost("gpt-4", 2500, 750);
    expect(result.totalCost).toBeCloseTo(result.inputCost + result.outputCost);
  });
});

// ============================================================================
// Constants
// ============================================================================

describe("constants", () => {
  it("EVENT_TYPES contains all expected types", () => {
    expect(EVENT_TYPES).toContain("session_start");
    expect(EVENT_TYPES).toContain("session_end");
    expect(EVENT_TYPES).toContain("prompt");
    expect(EVENT_TYPES).toContain("response");
    expect(EVENT_TYPES).toContain("tool_call");
    expect(EVENT_TYPES).toContain("tool_result");
    expect(EVENT_TYPES).toContain("error");
    expect(EVENT_TYPES).toContain("custom");
    expect(EVENT_TYPES).toHaveLength(8);
  });

  it("API_VERSION is a version string", () => {
    expect(API_VERSION).toMatch(/^v\d+$/);
  });

  it("SDK_VERSION is a semver string", () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ============================================================================
// Utility Functions
// ============================================================================

describe("sleep", () => {
  it("resolves after approximately the specified duration", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(200);
  });
});

describe("calculateBackoff", () => {
  it("returns baseDelay for attempt 0 (within jitter)", () => {
    const delay = calculateBackoff(0, 1000, 30000);
    expect(delay).toBeGreaterThanOrEqual(750);
    expect(delay).toBeLessThanOrEqual(1250);
  });

  it("doubles delay with each attempt", () => {
    const delays = Array.from({ length: 5 }, (_, i) =>
      calculateBackoff(i, 1000, 100000),
    );
    // Each base should roughly double; check midpoints
    for (let i = 1; i < delays.length; i++) {
      const expectedBase = 1000 * Math.pow(2, i);
      expect(delays[i]).toBeGreaterThanOrEqual(expectedBase * 0.75);
      expect(delays[i]).toBeLessThanOrEqual(expectedBase * 1.25);
    }
  });

  it("caps at maxDelay", () => {
    const delay = calculateBackoff(20, 1000, 5000);
    expect(delay).toBeLessThanOrEqual(6250); // 5000 + 25% jitter
  });

  it("uses default parameters", () => {
    const delay = calculateBackoff(0);
    expect(delay).toBeGreaterThanOrEqual(750);
    expect(delay).toBeLessThanOrEqual(1250);
  });
});
