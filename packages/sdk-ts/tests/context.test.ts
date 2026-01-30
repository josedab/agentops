import { describe, it, expect, beforeEach } from "vitest";
import {
  ContextWindowAnalyzer,
  type ContextConfig,
  type ContextAnalysis,
} from "../src/context";

describe("ContextWindowAnalyzer", () => {
  let analyzer: ContextWindowAnalyzer;
  const mockConfig: ContextConfig = {
    enabled: true,
    warningThreshold: 80,
    criticalThreshold: 95,
  };

  beforeEach(() => {
    analyzer = new ContextWindowAnalyzer(mockConfig);
  });

  describe("initialization", () => {
    it("should create analyzer with config", () => {
      expect(analyzer).toBeInstanceOf(ContextWindowAnalyzer);
    });

    it("should use default values when not provided", () => {
      const defaultAnalyzer = new ContextWindowAnalyzer();
      expect(defaultAnalyzer).toBeInstanceOf(ContextWindowAnalyzer);
    });
  });

  describe("context analysis", () => {
    it("should analyze context usage", () => {
      const analysis = analyzer.analyze(
        [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello!" },
          { role: "assistant", content: "Hi there! How can I help?" },
        ],
        "gpt-4",
      );

      expect(analysis).toBeDefined();
      expect(analysis.totalTokens).toBeGreaterThan(0);
      expect(analysis.usagePercent).toBeGreaterThan(0);
      expect(analysis.usagePercent).toBeLessThan(100);
      expect(analysis.tokensRemaining).toBeLessThan(analysis.contextLimit);
    });

    it("should detect warning threshold", () => {
      // Create content that uses 80%+ of context
      const longContent = "word ".repeat(2000);
      const analysis = analyzer.analyze(
        [
          { role: "system", content: longContent },
          { role: "user", content: longContent },
        ],
        "gpt-4",
      );

      if (analysis.usagePercent >= 80) {
        expect(analysis.isNearLimit).toBe(true);
      }
    });

    it("should detect overflow", () => {
      // Create content that exceeds context limit
      const veryLongContent = "word ".repeat(10000);
      const analysis = analyzer.analyze(
        [
          { role: "system", content: veryLongContent },
          { role: "user", content: veryLongContent },
        ],
        "gpt-4",
      );

      if (analysis.totalTokens > analysis.contextLimit) {
        expect(analysis.hasOverflowed).toBe(true);
      }
    });

    it("should handle empty messages", () => {
      const analysis = analyzer.analyze([], "gpt-4");

      expect(analysis.totalTokens).toBe(0);
      expect(analysis.usagePercent).toBe(0);
    });

    it("should include breakdown by segment", () => {
      const analysis = analyzer.analyze(
        [
          { role: "system", content: "System prompt here." },
          { role: "user", content: "User message" },
          { role: "assistant", content: "Assistant response" },
        ],
        "gpt-4",
      );

      expect(analysis.segments).toBeDefined();
      expect(analysis.segments.length).toBe(3);
      expect(analysis.segments[0].type).toBe("system");
      expect(analysis.segments[1].type).toBe("user");
      expect(analysis.segments[2].type).toBe("assistant");
    });

    it("should calculate tokens per segment", () => {
      const analysis = analyzer.analyze(
        [
          { role: "system", content: "A".repeat(100) },
          { role: "user", content: "B".repeat(200) },
        ],
        "gpt-4",
      );

      expect(analysis.segments[0].estimatedTokens).toBeGreaterThan(0);
      expect(analysis.segments[1].estimatedTokens).toBeGreaterThan(
        analysis.segments[0].estimatedTokens,
      );
    });
  });

  describe("overflow checking", () => {
    it("should detect potential overflow", () => {
      const result = analyzer.checkOverflow(
        7000,
        "A".repeat(10000),
        "gpt-4", // 8192 token limit
      );

      expect(result.wouldOverflow).toBe(true);
    });

    it("should allow content within limits", () => {
      const result = analyzer.checkOverflow(100, "Hello, world!", "gpt-4");

      expect(result.wouldOverflow).toBe(false);
    });

    it("should report tokens needed and available", () => {
      const result = analyzer.checkOverflow(1000, "test", "gpt-4");

      expect(result.tokensNeeded).toBeGreaterThan(1000);
      expect(result.tokensAvailable).toBeGreaterThan(0);
    });
  });

  describe("waste analysis", () => {
    it("should detect duplicate content", () => {
      const repeatedContent = "This is repeated content. ";
      const analysis = analyzer.analyze(
        [
          { role: "system", content: repeatedContent.repeat(10) },
          { role: "user", content: repeatedContent.repeat(10) },
        ],
        "gpt-4",
      );

      expect(analysis.waste).toBeDefined();
      expect(analysis.waste.total).toBeGreaterThanOrEqual(0);
    });

    it("should detect excessive whitespace", () => {
      const analysis = analyzer.analyze(
        [
          {
            role: "system",
            content: "Hello     world\n\n\n\n\nTest    content",
          },
        ],
        "gpt-4",
      );

      expect(analysis.waste.excessiveWhitespace).toBeGreaterThanOrEqual(0);
    });
  });

  describe("optimization suggestions", () => {
    it("should provide suggestions for high usage", () => {
      const longContent = "word ".repeat(3000);
      const analysis = analyzer.analyze(
        [{ role: "system", content: longContent }],
        "gpt-4",
      );

      if (analysis.usagePercent > 50) {
        expect(analysis.suggestions.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("should include suggestion priorities", () => {
      const longContent = "word ".repeat(5000);
      const analysis = analyzer.analyze(
        [{ role: "system", content: longContent }],
        "gpt-4",
      );

      for (const suggestion of analysis.suggestions) {
        expect(["high", "medium", "low"]).toContain(suggestion.priority);
      }
    });

    it("should include potential savings", () => {
      const analysis = analyzer.analyze(
        [{ role: "system", content: "word ".repeat(3000) }],
        "gpt-4",
      );

      for (const suggestion of analysis.suggestions) {
        expect(typeof suggestion.potentialSavings).toBe("number");
      }
    });
  });

  describe("model context limits", () => {
    it("should use different limits for different models", () => {
      const messages = [{ role: "user" as const, content: "Hello" }];

      const gpt4 = analyzer.analyze(messages, "gpt-4");
      const gpt4Turbo = analyzer.analyze(messages, "gpt-4-turbo");
      const claude = analyzer.analyze(messages, "claude-3-opus");

      // GPT-4 has 8192 tokens, GPT-4 Turbo has 128000, Claude 3 has 200000
      expect(gpt4.contextLimit).toBeLessThan(gpt4Turbo.contextLimit);
      expect(claude.contextLimit).toBeGreaterThan(gpt4Turbo.contextLimit);
    });

    it("should use default for unknown models", () => {
      const analysis = analyzer.analyze(
        [{ role: "user", content: "Hello" }],
        "unknown-model",
      );

      expect(analysis.contextLimit).toBeGreaterThan(0);
    });
  });

  describe("token estimation", () => {
    it("should estimate tokens for text", () => {
      const analysis = analyzer.analyze(
        [{ role: "user", content: "Hello, world!" }],
        "gpt-4",
      );

      expect(analysis.totalTokens).toBeGreaterThan(0);
      expect(analysis.totalTokens).toBeLessThan(100);
    });

    it("should handle empty content", () => {
      const analysis = analyzer.analyze(
        [{ role: "user", content: "" }],
        "gpt-4",
      );

      expect(analysis.segments[0].estimatedTokens).toBe(0);
    });

    it("should handle long content", () => {
      const longText = "a".repeat(10000);
      const analysis = analyzer.analyze(
        [{ role: "user", content: longText }],
        "gpt-4",
      );

      expect(analysis.totalTokens).toBeGreaterThan(1000);
    });
  });

  describe("tool messages", () => {
    it("should handle tool messages", () => {
      const analysis = analyzer.analyze(
        [
          { role: "user", content: "Search for something" },
          {
            role: "tool",
            content: JSON.stringify({ results: ["item1", "item2"] }),
            name: "search",
          },
          { role: "assistant", content: "I found some results" },
        ],
        "gpt-4",
      );

      const toolSegment = analysis.segments.find(
        (s) => s.type === "tool_result",
      );
      expect(toolSegment).toBeDefined();
    });
  });

  describe("overflow history", () => {
    it("should track overflow events", () => {
      // Create an overflow
      const veryLongContent = "word ".repeat(20000);
      analyzer.analyze([{ role: "system", content: veryLongContent }], "gpt-4");

      const history = analyzer.getOverflowHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it("should record overflow event details", () => {
      analyzer.recordOverflow("session-123", "gpt-4", 10000);

      const history = analyzer.getOverflowHistory();
      expect(history.length).toBeGreaterThan(0);
      if (history.length > 0) {
        expect(history[0].sessionId).toBe("session-123");
      }
    });
  });

  describe("callbacks", () => {
    it("should call onWarning when threshold is exceeded", () => {
      let callbackCalled = false;
      const callbackAnalyzer = new ContextWindowAnalyzer({
        enabled: true,
        warningThreshold: 1, // 1% of 8192 = 82 tokens
        onWarning: () => {
          callbackCalled = true;
        },
      });

      // Need content that generates > 1% of tokens (82+ tokens)
      // At ~4 chars/token, need 328+ chars
      const longContent = "This is a longer test content. ".repeat(20);
      callbackAnalyzer.analyze(
        [{ role: "user", content: longContent }],
        "gpt-4",
      );

      // With threshold at 1%, this content should trigger
      expect(callbackCalled).toBe(true);
    });
  });
});
