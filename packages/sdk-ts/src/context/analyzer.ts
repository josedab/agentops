/**
 * AgentOps SDK - Context Window Analyzer
 *
 * Visualizes and optimizes context window usage.
 */

import { now, generateEventId } from "../utils.js";

// Model context limits (in tokens)
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4": 8192,
  "gpt-4-32k": 32768,
  "gpt-4-turbo": 128000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-5": 256000,
  "gpt-5-mini": 128000,
  "claude-3-opus": 200000,
  "claude-3-sonnet": 200000,
  "claude-3-haiku": 200000,
  "claude-sonnet-4": 200000,
  "claude-haiku-4": 200000,
  unknown: 8192,
};

// Rough token estimation
const CHARS_PER_TOKEN = 4;

export interface ContextSegment {
  id: string;
  type: "system" | "user" | "assistant" | "tool_result" | "context";
  label: string;
  content: string;
  estimatedTokens: number;
  percentage: number;
  startIndex: number;
  endIndex: number;
  metadata?: Record<string, unknown>;
}

export interface ContextAnalysis {
  /** Total estimated tokens */
  totalTokens: number;

  /** Model context limit */
  contextLimit: number;

  /** Usage percentage */
  usagePercent: number;

  /** Whether context is near limit (>80%) */
  isNearLimit: boolean;

  /** Whether context has overflowed */
  hasOverflowed: boolean;

  /** Tokens remaining */
  tokensRemaining: number;

  /** Breakdown by segment */
  segments: ContextSegment[];

  /** Waste analysis */
  waste: {
    duplicateContent: number;
    excessiveWhitespace: number;
    redundantInstructions: number;
    total: number;
    percentage: number;
  };

  /** Optimization suggestions */
  suggestions: ContextSuggestion[];

  /** Analysis timestamp */
  analyzedAt: number;
}

export interface ContextSuggestion {
  type: "compress" | "remove" | "summarize" | "truncate" | "restructure";
  priority: "high" | "medium" | "low";
  description: string;
  potentialSavings: number;
  targetSegmentId?: string;
}

export interface ContextOverflowEvent {
  eventId: string;
  sessionId: string;
  model: string;
  attemptedTokens: number;
  contextLimit: number;
  overflowAmount: number;
  timestamp: number;
}

export interface ContextConfig {
  /** Enable context analysis */
  enabled: boolean;

  /** Warning threshold (percentage, default: 80) */
  warningThreshold?: number;

  /** Critical threshold (percentage, default: 95) */
  criticalThreshold?: number;

  /** Track overflow events */
  trackOverflows?: boolean;

  /** Callback when context approaches limit */
  onWarning?: (analysis: ContextAnalysis) => void;

  /** Callback on overflow */
  onOverflow?: (event: ContextOverflowEvent) => void;
}

export class ContextWindowAnalyzer {
  private readonly config: Required<
    Omit<ContextConfig, "onWarning" | "onOverflow">
  > & {
    onWarning?: (analysis: ContextAnalysis) => void;
    onOverflow?: (event: ContextOverflowEvent) => void;
  };
  private overflowHistory: ContextOverflowEvent[] = [];

  constructor(config?: ContextConfig) {
    this.config = {
      enabled: config?.enabled ?? true,
      warningThreshold: config?.warningThreshold ?? 80,
      criticalThreshold: config?.criticalThreshold ?? 95,
      trackOverflows: config?.trackOverflows ?? true,
      onWarning: config?.onWarning,
      onOverflow: config?.onOverflow,
    };
  }

  /**
   * Analyze context window usage for a set of messages
   */
  analyze(
    messages: Array<{
      role: "system" | "user" | "assistant" | "tool";
      content: string;
      name?: string;
    }>,
    model: string = "gpt-4",
  ): ContextAnalysis {
    const contextLimit = this.getContextLimit(model);
    const segments: ContextSegment[] = [];
    let totalTokens = 0;
    let currentIndex = 0;

    // Analyze each message
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const tokens = this.estimateTokens(msg.content);
      const percentage = (tokens / contextLimit) * 100;

      segments.push({
        id: `seg_${i}`,
        type: msg.role === "tool" ? "tool_result" : msg.role,
        label: msg.name || `${msg.role} message ${i + 1}`,
        content: msg.content,
        estimatedTokens: tokens,
        percentage,
        startIndex: currentIndex,
        endIndex: currentIndex + msg.content.length,
      });

      totalTokens += tokens;
      currentIndex += msg.content.length;
    }

    const usagePercent = (totalTokens / contextLimit) * 100;
    const isNearLimit = usagePercent >= this.config.warningThreshold;
    const hasOverflowed = totalTokens > contextLimit;
    const tokensRemaining = Math.max(0, contextLimit - totalTokens);

    // Analyze waste
    const waste = this.analyzeWaste(messages);

    // Generate suggestions
    const suggestions = this.generateSuggestions(
      segments,
      waste,
      usagePercent,
      contextLimit,
    );

    const analysis: ContextAnalysis = {
      totalTokens,
      contextLimit,
      usagePercent,
      isNearLimit,
      hasOverflowed,
      tokensRemaining,
      segments,
      waste,
      suggestions,
      analyzedAt: now(),
    };

    // Trigger callbacks
    if (isNearLimit && this.config.onWarning) {
      this.config.onWarning(analysis);
    }

    return analysis;
  }

  /**
   * Check if adding content would overflow the context
   */
  checkOverflow(
    currentTokens: number,
    additionalContent: string,
    model: string = "gpt-4",
  ): { wouldOverflow: boolean; tokensNeeded: number; tokensAvailable: number } {
    const limit = this.getContextLimit(model);
    const additionalTokens = this.estimateTokens(additionalContent);
    const totalNeeded = currentTokens + additionalTokens;

    return {
      wouldOverflow: totalNeeded > limit,
      tokensNeeded: totalNeeded,
      tokensAvailable: limit - currentTokens,
    };
  }

  /**
   * Record a context overflow event
   */
  recordOverflow(
    sessionId: string,
    model: string,
    attemptedTokens: number,
  ): ContextOverflowEvent {
    const contextLimit = this.getContextLimit(model);
    const event: ContextOverflowEvent = {
      eventId: generateEventId(),
      sessionId,
      model,
      attemptedTokens,
      contextLimit,
      overflowAmount: attemptedTokens - contextLimit,
      timestamp: now(),
    };

    if (this.config.trackOverflows) {
      this.overflowHistory.push(event);
    }

    if (this.config.onOverflow) {
      this.config.onOverflow(event);
    }

    return event;
  }

  /**
   * Get overflow history
   */
  getOverflowHistory(): ContextOverflowEvent[] {
    return [...this.overflowHistory];
  }

  /**
   * Estimate tokens for text
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Get context limit for a model
   */
  getContextLimit(model: string): number {
    // Try exact match first
    if (MODEL_CONTEXT_LIMITS[model]) {
      return MODEL_CONTEXT_LIMITS[model];
    }

    // Try partial match
    for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
      if (model.toLowerCase().includes(key.toLowerCase())) {
        return limit;
      }
    }

    return MODEL_CONTEXT_LIMITS["unknown"];
  }

  /**
   * Suggest compression for content
   */
  suggestCompression(
    content: string,
    targetReduction: number = 0.3,
  ): { compressed: string; tokensSaved: number; techniques: string[] } {
    let compressed = content;
    const techniques: string[] = [];
    const originalTokens = this.estimateTokens(content);

    // Remove excessive whitespace
    const beforeWhitespace = compressed;
    compressed = compressed.replace(/\n{3,}/g, "\n\n");
    compressed = compressed.replace(/[ \t]{2,}/g, " ");
    if (compressed !== beforeWhitespace) {
      techniques.push("Removed excessive whitespace");
    }

    // Remove common filler phrases
    const fillers = [
      /\bplease note that\b/gi,
      /\bit is important to note that\b/gi,
      /\bas mentioned (earlier|above|before)\b/gi,
      /\bin order to\b/gi,
    ];

    for (const filler of fillers) {
      if (filler.test(compressed)) {
        compressed = compressed.replace(filler, "");
        techniques.push(`Removed filler: ${filler.source}`);
      }
    }

    // Truncate very long sections if needed
    const currentReduction =
      1 - this.estimateTokens(compressed) / originalTokens;
    if (currentReduction < targetReduction) {
      const lines = compressed.split("\n");
      const longLines = lines.filter((l) => l.length > 500);
      if (longLines.length > 0) {
        compressed = lines
          .map((l) => (l.length > 500 ? l.substring(0, 500) + "..." : l))
          .join("\n");
        techniques.push("Truncated very long lines");
      }
    }

    return {
      compressed,
      tokensSaved: originalTokens - this.estimateTokens(compressed),
      techniques,
    };
  }

  private analyzeWaste(
    messages: Array<{ role: string; content: string }>,
  ): ContextAnalysis["waste"] {
    let duplicateContent = 0;
    let excessiveWhitespace = 0;
    let redundantInstructions = 0;

    const contentHashes = new Set<string>();
    const instructionPatterns = [
      /^please\s/i,
      /^remember to\s/i,
      /^make sure to\s/i,
      /^always\s/i,
      /^never\s/i,
    ];

    for (const msg of messages) {
      // Check for duplicates
      const hash = this.simpleHash(msg.content.toLowerCase().trim());
      if (contentHashes.has(hash)) {
        duplicateContent += this.estimateTokens(msg.content);
      }
      contentHashes.add(hash);

      // Check for excessive whitespace
      const trimmed = msg.content.replace(/\s+/g, " ");
      const whitespaceWaste =
        this.estimateTokens(msg.content) - this.estimateTokens(trimmed);
      excessiveWhitespace += whitespaceWaste;

      // Check for redundant instructions
      const lines = msg.content.split("\n");
      for (const line of lines) {
        if (instructionPatterns.some((p) => p.test(line.trim()))) {
          const seen = lines.filter(
            (l) => l.toLowerCase().trim() === line.toLowerCase().trim(),
          ).length;
          if (seen > 1) {
            redundantInstructions += this.estimateTokens(line) * (seen - 1);
          }
        }
      }
    }

    const total =
      duplicateContent + excessiveWhitespace + redundantInstructions;
    const allContent = messages.map((m) => m.content).join("");
    const totalTokens = this.estimateTokens(allContent);

    return {
      duplicateContent,
      excessiveWhitespace,
      redundantInstructions,
      total,
      percentage: totalTokens > 0 ? (total / totalTokens) * 100 : 0,
    };
  }

  private generateSuggestions(
    segments: ContextSegment[],
    waste: ContextAnalysis["waste"],
    usagePercent: number,
    contextLimit: number,
  ): ContextSuggestion[] {
    const suggestions: ContextSuggestion[] = [];

    // High priority: address waste
    if (waste.duplicateContent > 100) {
      suggestions.push({
        type: "remove",
        priority: "high",
        description: `Remove duplicate content (~${waste.duplicateContent} tokens)`,
        potentialSavings: waste.duplicateContent,
      });
    }

    if (waste.excessiveWhitespace > 50) {
      suggestions.push({
        type: "compress",
        priority: "medium",
        description: `Compress whitespace (~${waste.excessiveWhitespace} tokens)`,
        potentialSavings: waste.excessiveWhitespace,
      });
    }

    // Check for large segments
    const largeSegments = segments.filter((s) => s.percentage > 30);
    for (const seg of largeSegments) {
      suggestions.push({
        type: "summarize",
        priority: usagePercent > 90 ? "high" : "medium",
        description: `Consider summarizing "${seg.label}" (${seg.estimatedTokens} tokens, ${seg.percentage.toFixed(1)}% of context)`,
        potentialSavings: Math.floor(seg.estimatedTokens * 0.5),
        targetSegmentId: seg.id,
      });
    }

    // If near limit, suggest truncation
    if (usagePercent > this.config.criticalThreshold) {
      const tokensToFree = Math.ceil(
        ((usagePercent - 80) / 100) * contextLimit,
      );
      suggestions.push({
        type: "truncate",
        priority: "high",
        description: `Free up ~${tokensToFree} tokens to get below 80% usage`,
        potentialSavings: tokensToFree,
      });
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}
