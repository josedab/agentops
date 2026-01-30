import { describe, it, expect, beforeEach } from "vitest";
import { QualityEvaluator, type QualityConfig } from "../src/quality";

describe("QualityEvaluator", () => {
  let evaluator: QualityEvaluator;
  const mockConfig: QualityConfig = {
    enabled: true,
    samplingRate: 1.0,
    judgeModel: "gpt-4o",
  };

  beforeEach(() => {
    evaluator = new QualityEvaluator(mockConfig);
  });

  describe("initialization", () => {
    it("should create evaluator with config", () => {
      expect(evaluator).toBeInstanceOf(QualityEvaluator);
    });

    it("should report enabled status", () => {
      expect(evaluator.isEnabled).toBe(true);
    });

    it("should be disabled by default when enabled is false", () => {
      const disabledEvaluator = new QualityEvaluator({ enabled: false });
      expect(disabledEvaluator.isEnabled).toBe(false);
    });

    it("should use default config values", () => {
      const defaultEvaluator = new QualityEvaluator({});
      expect(defaultEvaluator).toBeInstanceOf(QualityEvaluator);
    });
  });

  describe("evaluation", () => {
    it("should throw when evaluating with disabled evaluator", async () => {
      const disabled = new QualityEvaluator({ enabled: false });

      await expect(
        disabled.evaluate({
          eventId: "e1",
          sessionId: "s1",
          prompt: "test",
          response: "test",
        }),
      ).rejects.toThrow("not enabled");
    });
  });
});
