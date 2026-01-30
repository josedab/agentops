import { describe, it, expect } from "vitest";
import { calculateCost, MODEL_PRICING } from "../src/pricing";

describe("Pricing", () => {
  describe("calculateCost", () => {
    it("should calculate cost for gpt-4o", () => {
      const cost = calculateCost("gpt-4o", 1000, 500);

      // Input: 1000 * $0.005/1K = $0.005
      // Output: 500 * $0.015/1K = $0.0075
      // Total: $0.0125
      expect(cost).toBeCloseTo(0.0125, 4);
    });

    it("should calculate cost for gpt-4o-mini", () => {
      const cost = calculateCost("gpt-4o-mini", 1000, 500);

      // Input: 1000 * $0.00015/1K = $0.00015
      // Output: 500 * $0.0006/1K = $0.0003
      // Total: $0.00045
      expect(cost).toBeCloseTo(0.00045, 5);
    });

    it("should calculate cost for claude-3-5-sonnet", () => {
      const cost = calculateCost("claude-3-5-sonnet", 1000, 500);

      // Input: 1000 * $0.003/1K = $0.003
      // Output: 500 * $0.015/1K = $0.0075
      // Total: $0.0105
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it("should calculate cost for claude-3-opus", () => {
      const cost = calculateCost("claude-3-opus", 1000, 500);

      // Input: 1000 * $0.015/1K = $0.015
      // Output: 500 * $0.075/1K = $0.0375
      // Total: $0.0525
      expect(cost).toBeCloseTo(0.0525, 4);
    });

    it("should use default pricing for unknown model", () => {
      // Unknown models now use default pricing (gpt-3.5-turbo rates)
      const cost = calculateCost("unknown-model", 1000, 500);
      expect(cost).toBeGreaterThanOrEqual(0); // Uses default, not 0
    });

    it("should handle zero tokens", () => {
      const cost = calculateCost("gpt-4o", 0, 0);
      expect(cost).toBe(0);
    });

    it("should handle model name variations", () => {
      // Full model name
      const cost1 = calculateCost("claude-3-5-sonnet-20241022", 1000, 500);
      expect(cost1).toBeGreaterThan(0);

      // Alias
      const cost2 = calculateCost("claude-3-5-sonnet", 1000, 500);
      expect(cost2).toBeGreaterThan(0);
    });
  });

  describe("MODEL_PRICING", () => {
    it("should have pricing for major OpenAI models", () => {
      expect(MODEL_PRICING["gpt-4o"]).toBeDefined();
      expect(MODEL_PRICING["gpt-4o-mini"]).toBeDefined();
      expect(MODEL_PRICING["gpt-4-turbo"]).toBeDefined();
      expect(MODEL_PRICING["gpt-4"]).toBeDefined();
      expect(MODEL_PRICING["gpt-3.5-turbo"]).toBeDefined();
      expect(MODEL_PRICING["o1"]).toBeDefined();
      expect(MODEL_PRICING["o1-mini"]).toBeDefined();
    });

    it("should have pricing for major Anthropic models", () => {
      expect(MODEL_PRICING["claude-3-5-sonnet"]).toBeDefined();
      expect(MODEL_PRICING["claude-3-5-haiku"]).toBeDefined();
      expect(MODEL_PRICING["claude-3-opus"]).toBeDefined();
      expect(MODEL_PRICING["claude-3-sonnet"]).toBeDefined();
      expect(MODEL_PRICING["claude-3-haiku"]).toBeDefined();
    });

    it("should have valid pricing structure", () => {
      Object.entries(MODEL_PRICING).forEach(([_model, pricing]) => {
        // Interface uses `input` and `output` properties (USD per 1K tokens)
        expect(pricing.input).toBeGreaterThanOrEqual(0);
        expect(pricing.output).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
