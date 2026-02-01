/**
 * Alert Feedback System
 *
 * Tracks alert effectiveness, learns from user feedback,
 * and improves parsing accuracy over time.
 */

import { now, generateEventId } from "../utils.js";
import type {
  AlertFeedback,
  RuleEffectiveness,
  AlertRuleConfig,
} from "./types.js";

// ============================================================================
// Types
// ============================================================================

export interface FeedbackSystemConfig {
  /** Enable feedback collection */
  enabled?: boolean;

  /** Minimum feedback samples for analysis */
  minSamplesForAnalysis?: number;

  /** Learning rate for threshold adjustments */
  learningRate?: number;

  /** Enable automatic rule tuning */
  autoTuning?: boolean;

  /** Callback when rule improvement is suggested */
  onSuggestion?: (ruleId: string, suggestion: RuleSuggestion) => void;
}

export interface RuleSuggestion {
  type:
    | "threshold_adjustment"
    | "severity_change"
    | "filter_addition"
    | "consolidation"
    | "disable";
  description: string;
  confidence: number;
  suggestedChange?: Partial<AlertRuleConfig>;
  reason: string;
}

export interface FeedbackAnalysis {
  ruleId: string;
  period: { start: number; end: number };
  metrics: FeedbackMetrics;
  patterns: FeedbackPattern[];
  suggestions: RuleSuggestion[];
  trend: "improving" | "stable" | "degrading";
}

export interface FeedbackMetrics {
  totalAlerts: number;
  helpfulRate: number;
  falsePositiveRate: number;
  responseTime: {
    avg: number;
    p50: number;
    p90: number;
  };
  alertsPerDay: number;
}

export interface FeedbackPattern {
  type: string;
  description: string;
  frequency: number;
  examples: string[];
}

export interface ParseCorrection {
  id: string;
  originalQuery: string;
  originalParse: Partial<AlertRuleConfig>;
  correctedParse: Partial<AlertRuleConfig>;
  correctionType: "metric" | "threshold" | "filter" | "severity" | "other";
  timestamp: number;
}

// ============================================================================
// Feedback Collector
// ============================================================================

export class FeedbackCollector {
  private readonly config: Required<
    Omit<FeedbackSystemConfig, "onSuggestion">
  > & {
    onSuggestion?: FeedbackSystemConfig["onSuggestion"];
  };

  private feedback: Map<string, AlertFeedback[]> = new Map();
  private corrections: ParseCorrection[] = [];
  private analysisCache: Map<string, FeedbackAnalysis> = new Map();

  constructor(config: FeedbackSystemConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      minSamplesForAnalysis: config.minSamplesForAnalysis ?? 10,
      learningRate: config.learningRate ?? 0.1,
      autoTuning: config.autoTuning ?? false,
      onSuggestion: config.onSuggestion,
    };
  }

  /**
   * Record feedback for an alert
   */
  recordFeedback(feedback: AlertFeedback): void {
    if (!this.config.enabled) return;

    if (!this.feedback.has(feedback.ruleId)) {
      this.feedback.set(feedback.ruleId, []);
    }

    this.feedback.get(feedback.ruleId)!.push(feedback);

    // Invalidate cache
    this.analysisCache.delete(feedback.ruleId);

    // Check if we should analyze
    const ruleFeedback = this.feedback.get(feedback.ruleId)!;
    if (ruleFeedback.length >= this.config.minSamplesForAnalysis) {
      this.analyzeAndSuggest(feedback.ruleId);
    }
  }

  /**
   * Record a parse correction (user modified the parsed rule)
   */
  recordCorrection(
    originalQuery: string,
    originalParse: Partial<AlertRuleConfig>,
    correctedParse: Partial<AlertRuleConfig>,
  ): void {
    if (!this.config.enabled) return;

    const correction: ParseCorrection = {
      id: generateEventId(),
      originalQuery,
      originalParse,
      correctedParse,
      correctionType: this.detectCorrectionType(originalParse, correctedParse),
      timestamp: now(),
    };

    this.corrections.push(correction);
  }

  /**
   * Analyze feedback for a rule
   */
  analyzeRule(ruleId: string): FeedbackAnalysis | undefined {
    // Check cache
    const cached = this.analysisCache.get(ruleId);
    if (cached && now() - cached.period.end < 3600000) {
      // 1 hour cache
      return cached;
    }

    const ruleFeedback = this.feedback.get(ruleId);
    if (
      !ruleFeedback ||
      ruleFeedback.length < this.config.minSamplesForAnalysis
    ) {
      return undefined;
    }

    const analysis = this.computeAnalysis(ruleId, ruleFeedback);
    this.analysisCache.set(ruleId, analysis);

    return analysis;
  }

  /**
   * Get rule effectiveness metrics
   */
  getEffectiveness(ruleId: string): RuleEffectiveness | undefined {
    const analysis = this.analyzeRule(ruleId);
    if (!analysis) return undefined;

    return {
      ruleId,
      totalAlerts: analysis.metrics.totalAlerts,
      acknowledgedAlerts: Math.round(
        analysis.metrics.totalAlerts * analysis.metrics.helpfulRate,
      ),
      falsePositives: Math.round(
        analysis.metrics.totalAlerts * analysis.metrics.falsePositiveRate,
      ),
      averageResponseTimeMs: analysis.metrics.responseTime.avg,
      feedbackScore: this.calculateFeedbackScore(analysis.metrics),
      recommendations: analysis.suggestions.map((s) => s.description),
    };
  }

  /**
   * Get parsing improvement suggestions based on corrections
   */
  getParserImprovements(): ParserImprovement[] {
    if (this.corrections.length < 5) return [];

    const improvements: ParserImprovement[] = [];

    // Group corrections by type
    const byType = new Map<string, ParseCorrection[]>();
    for (const c of this.corrections) {
      if (!byType.has(c.correctionType)) {
        byType.set(c.correctionType, []);
      }
      byType.get(c.correctionType)!.push(c);
    }

    // Analyze metric corrections
    const metricCorrections = byType.get("metric") || [];
    if (metricCorrections.length >= 3) {
      const patterns = this.findMetricPatterns(metricCorrections);
      improvements.push(...patterns);
    }

    // Analyze threshold corrections
    const thresholdCorrections = byType.get("threshold") || [];
    if (thresholdCorrections.length >= 3) {
      const patterns = this.findThresholdPatterns(thresholdCorrections);
      improvements.push(...patterns);
    }

    return improvements;
  }

  /**
   * Get all feedback for export
   */
  exportFeedback(): {
    feedback: Map<string, AlertFeedback[]>;
    corrections: ParseCorrection[];
  } {
    return {
      feedback: new Map(this.feedback),
      corrections: [...this.corrections],
    };
  }

  /**
   * Import historical feedback
   */
  importFeedback(data: {
    feedback: Record<string, AlertFeedback[]>;
    corrections: ParseCorrection[];
  }): void {
    for (const [ruleId, fb] of Object.entries(data.feedback)) {
      this.feedback.set(ruleId, fb);
    }
    this.corrections.push(...data.corrections);
  }

  // Private methods

  private detectCorrectionType(
    original: Partial<AlertRuleConfig>,
    corrected: Partial<AlertRuleConfig>,
  ): ParseCorrection["correctionType"] {
    if (original.metric?.type !== corrected.metric?.type) return "metric";
    if (original.condition?.value !== corrected.condition?.value)
      return "threshold";
    if (JSON.stringify(original.filters) !== JSON.stringify(corrected.filters))
      return "filter";
    if (original.severity !== corrected.severity) return "severity";
    return "other";
  }

  private computeAnalysis(
    ruleId: string,
    feedback: AlertFeedback[],
  ): FeedbackAnalysis {
    const now_ = now();
    const oneDayAgo = now_ - 86400000;

    // Calculate metrics
    const helpfulCount = feedback.filter((f) => f.type === "helpful").length;
    const falsePositiveCount = feedback.filter(
      (f) => f.type === "false_positive",
    ).length;
    const recentFeedback = feedback.filter((f) => f.timestamp > oneDayAgo);

    const metrics: FeedbackMetrics = {
      totalAlerts: feedback.length,
      helpfulRate: feedback.length > 0 ? helpfulCount / feedback.length : 0,
      falsePositiveRate:
        feedback.length > 0 ? falsePositiveCount / feedback.length : 0,
      responseTime: this.calculateResponseTimes(feedback),
      alertsPerDay: recentFeedback.length,
    };

    // Detect patterns
    const patterns = this.detectPatterns(feedback);

    // Generate suggestions
    const suggestions = this.generateSuggestions(metrics, patterns);

    // Determine trend
    const trend = this.determineTrend(feedback);

    return {
      ruleId,
      period: {
        start: Math.min(...feedback.map((f) => f.timestamp)),
        end: now_,
      },
      metrics,
      patterns,
      suggestions,
      trend,
    };
  }

  private calculateResponseTimes(
    feedback: AlertFeedback[],
  ): FeedbackMetrics["responseTime"] {
    // Mock implementation - in production this would use actual response times
    const times = feedback.map(() => Math.random() * 300000); // 0-5 minutes
    times.sort((a, b) => a - b);

    return {
      avg: times.reduce((a, b) => a + b, 0) / times.length || 0,
      p50: times[Math.floor(times.length * 0.5)] || 0,
      p90: times[Math.floor(times.length * 0.9)] || 0,
    };
  }

  private detectPatterns(feedback: AlertFeedback[]): FeedbackPattern[] {
    const patterns: FeedbackPattern[] = [];

    // Pattern: High false positive rate
    const fpRate =
      feedback.filter((f) => f.type === "false_positive").length /
      feedback.length;
    if (fpRate > 0.3) {
      patterns.push({
        type: "high_false_positives",
        description: `${Math.round(fpRate * 100)}% of alerts are marked as false positives`,
        frequency: fpRate,
        examples: feedback
          .filter((f) => f.type === "false_positive" && f.comment)
          .slice(0, 3)
          .map((f) => f.comment!),
      });
    }

    // Pattern: Alert fatigue (many not_helpful in a row)
    const notHelpful = feedback.filter((f) => f.type === "not_helpful").length;
    if (notHelpful > 10) {
      patterns.push({
        type: "alert_fatigue",
        description: "Users frequently mark alerts as not helpful",
        frequency: notHelpful / feedback.length,
        examples: [],
      });
    }

    // Pattern: Late alerts
    const lateAlerts = feedback.filter((f) => f.type === "too_late").length;
    if (lateAlerts > 3) {
      patterns.push({
        type: "late_detection",
        description: "Alerts are often triggered too late",
        frequency: lateAlerts / feedback.length,
        examples: [],
      });
    }

    return patterns;
  }

  private generateSuggestions(
    metrics: FeedbackMetrics,
    patterns: FeedbackPattern[],
  ): RuleSuggestion[] {
    const suggestions: RuleSuggestion[] = [];

    // High false positive rate
    if (metrics.falsePositiveRate > 0.3) {
      suggestions.push({
        type: "threshold_adjustment",
        description: "Increase threshold to reduce false positives",
        confidence: Math.min(0.9, metrics.falsePositiveRate + 0.3),
        reason: `${Math.round(metrics.falsePositiveRate * 100)}% false positive rate is above acceptable levels`,
      });
    }

    // Alert fatigue
    if (metrics.alertsPerDay > 20) {
      suggestions.push({
        type: "consolidation",
        description: "Consider consolidating alerts or adding cooldown",
        confidence: 0.7,
        reason: `${metrics.alertsPerDay} alerts per day may cause alert fatigue`,
      });
    }

    // Late detection pattern
    const latePattern = patterns.find((p) => p.type === "late_detection");
    if (latePattern) {
      suggestions.push({
        type: "threshold_adjustment",
        description: "Lower threshold for earlier detection",
        confidence: 0.6,
        reason: "Users report alerts are triggered too late",
      });
    }

    // Low helpful rate with many alerts
    if (metrics.helpfulRate < 0.2 && metrics.totalAlerts > 20) {
      suggestions.push({
        type: "disable",
        description: "Consider disabling this rule",
        confidence: 0.8,
        reason:
          "Only ${Math.round(metrics.helpfulRate * 100)}% of alerts are marked helpful",
      });
    }

    return suggestions;
  }

  private determineTrend(
    feedback: AlertFeedback[],
  ): "improving" | "stable" | "degrading" {
    if (feedback.length < 10) return "stable";

    // Compare recent vs older feedback
    const sorted = [...feedback].sort((a, b) => a.timestamp - b.timestamp);
    const half = Math.floor(sorted.length / 2);

    const olderHelpful =
      sorted.slice(0, half).filter((f) => f.type === "helpful").length / half;
    const recentHelpful =
      sorted.slice(half).filter((f) => f.type === "helpful").length /
      (sorted.length - half);

    if (recentHelpful > olderHelpful + 0.1) return "improving";
    if (recentHelpful < olderHelpful - 0.1) return "degrading";
    return "stable";
  }

  private calculateFeedbackScore(metrics: FeedbackMetrics): number {
    // Score from 0-10 based on metrics
    let score = 5;

    // Helpful rate impact (+2 to -2)
    score += (metrics.helpfulRate - 0.5) * 4;

    // False positive penalty (-3 max)
    score -= metrics.falsePositiveRate * 3;

    // Alert fatigue penalty
    if (metrics.alertsPerDay > 20) score -= 1;
    if (metrics.alertsPerDay > 50) score -= 1;

    return Math.max(0, Math.min(10, score));
  }

  private findMetricPatterns(
    corrections: ParseCorrection[],
  ): ParserImprovement[] {
    const improvements: ParserImprovement[] = [];

    // Find common metric mismatches
    const mismatches = new Map<string, { correct: string; count: number }>();

    for (const c of corrections) {
      const original = c.originalParse.metric?.name || "unknown";
      const correct = c.correctedParse.metric?.name || "unknown";

      if (original !== correct) {
        const key = original;
        const existing = mismatches.get(key);
        if (existing) {
          existing.count++;
        } else {
          mismatches.set(key, { correct, count: 1 });
        }
      }
    }

    for (const [parsed, { correct, count }] of mismatches) {
      if (count >= 2) {
        improvements.push({
          type: "metric_alias",
          description: `Add "${parsed}" as alias for "${correct}" metric`,
          confidence: count / corrections.length,
          examples: corrections
            .filter((c) => c.originalParse.metric?.name === parsed)
            .slice(0, 3)
            .map((c) => c.originalQuery),
        });
      }
    }

    return improvements;
  }

  private findThresholdPatterns(
    corrections: ParseCorrection[],
  ): ParserImprovement[] {
    const improvements: ParserImprovement[] = [];

    // Analyze threshold correction patterns
    const adjustments: number[] = [];

    for (const c of corrections) {
      const original = c.originalParse.condition?.value || 0;
      const corrected = c.correctedParse.condition?.value || 0;

      if (original > 0 && corrected > 0) {
        adjustments.push(corrected / original);
      }
    }

    if (adjustments.length >= 3) {
      const avgAdjustment =
        adjustments.reduce((a, b) => a + b, 0) / adjustments.length;

      if (avgAdjustment > 1.2) {
        improvements.push({
          type: "threshold_default",
          description: `Default thresholds may be too low (avg correction: ${avgAdjustment.toFixed(1)}x)`,
          confidence: 0.6,
          examples: [],
        });
      } else if (avgAdjustment < 0.8) {
        improvements.push({
          type: "threshold_default",
          description: `Default thresholds may be too high (avg correction: ${avgAdjustment.toFixed(1)}x)`,
          confidence: 0.6,
          examples: [],
        });
      }
    }

    return improvements;
  }

  private analyzeAndSuggest(ruleId: string): void {
    const analysis = this.analyzeRule(ruleId);
    if (!analysis) return;

    for (const suggestion of analysis.suggestions) {
      this.config.onSuggestion?.(ruleId, suggestion);
    }
  }
}

// ============================================================================
// Types for Parser Improvements
// ============================================================================

export interface ParserImprovement {
  type: "metric_alias" | "threshold_default" | "pattern_addition";
  description: string;
  confidence: number;
  examples: string[];
}
