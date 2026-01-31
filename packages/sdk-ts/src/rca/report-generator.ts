/**
 * AgentOps SDK - RCA Report Generator
 *
 * Single-responsibility class for generating RCA reports.
 * Extracted from RootCauseAnalyzer for better maintainability.
 */

import { now, generateEventId } from "../utils.js";
import {
  FailureEvent,
  FailurePattern,
  RootCauseAnalysis,
  Remediation,
  RCAReport,
} from "./types.js";

/**
 * Generates comprehensive RCA reports.
 */
export class RCAReportGenerator {
  constructor(
    private readonly events: FailureEvent[],
    private readonly patterns: Map<string, FailurePattern>,
    private readonly rootCauses: Map<string, RootCauseAnalysis>,
    private readonly remediations: Map<string, Remediation>,
  ) {}

  /**
   * Generate an RCA report for a time period
   */
  generateReport(startTime?: number, endTime?: number): RCAReport {
    const start = startTime ?? now() - 7 * 24 * 60 * 60 * 1000; // Default: last 7 days
    const end = endTime ?? now();

    const periodEvents = this.events.filter(
      (e) => e.timestamp >= start && e.timestamp <= end,
    );

    const periodPatterns = Array.from(this.patterns.values()).filter(
      (p) => p.lastSeen >= start,
    );

    const allRootCauses = Array.from(this.rootCauses.values());
    const allRemediations = Array.from(this.remediations.values());

    const activeRootCauses = allRootCauses
      .flatMap((a) => a.rootCauses)
      .filter((c) => c.probability > 0.5);

    const suggestedRemediations = allRemediations.filter(
      (r) => r.status === "suggested",
    );

    return {
      id: generateEventId(),
      period: { start, end },
      summary: {
        totalFailures: periodEvents.length,
        uniquePatterns: periodPatterns.length,
        identifiedRootCauses: activeRootCauses.length,
        suggestedRemediations: suggestedRemediations.length,
        mttr: this.calculateMTTR(periodPatterns),
      },
      topPatterns: this.getTopPatterns(periodPatterns, 5),
      activeRootCauses: activeRootCauses.slice(0, 5),
      recommendedActions: this.prioritizeRemediations(suggestedRemediations, 5),
      healthScore: this.calculateHealthScore(periodEvents, periodPatterns),
      generatedAt: now(),
    };
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private getTopPatterns(
    patterns: FailurePattern[],
    limit: number,
  ): FailurePattern[] {
    return [...patterns]
      .sort((a, b) => {
        // Sort by severity first, then by occurrence count
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const severityDiff =
          severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.occurrenceCount - a.occurrenceCount;
      })
      .slice(0, limit);
  }

  private prioritizeRemediations(
    remediations: Remediation[],
    limit: number,
  ): Remediation[] {
    return [...remediations]
      .sort((a, b) => {
        // Sort by priority first, then by ease of implementation
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const priorityDiff =
          priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        // Prefer automated solutions
        if (a.canAutomate !== b.canAutomate) {
          return a.canAutomate ? -1 : 1;
        }

        // Prefer lower effort
        const effortOrder = { minutes: 0, hours: 1, days: 2, weeks: 3 };
        return effortOrder[a.estimatedEffort] - effortOrder[b.estimatedEffort];
      })
      .slice(0, limit);
  }

  private calculateHealthScore(
    events: FailureEvent[],
    patterns: FailurePattern[],
  ): number {
    if (events.length === 0) return 100;

    let score = 100;

    // Deduct for number of failures
    score -= Math.min(events.length * 0.5, 30);

    // Deduct for critical patterns
    const criticalPatterns = patterns.filter((p) => p.severity === "critical");
    score -= criticalPatterns.length * 10;

    // Deduct for increasing trends
    const increasingPatterns = patterns.filter((p) => p.trend === "increasing");
    score -= increasingPatterns.length * 5;

    // Deduct for active patterns
    const activePatterns = patterns.filter((p) => p.isActive);
    score -= activePatterns.length * 2;

    return Math.max(0, Math.round(score));
  }

  private calculateMTTR(patterns: FailurePattern[]): number {
    // Mean time to resolution (simplified - time from first to last occurrence)
    const resolvedPatterns = patterns.filter((p) => !p.isActive);
    if (resolvedPatterns.length === 0) return 0;

    const ttrs = resolvedPatterns.map((p) => p.lastSeen - p.firstSeen);
    return ttrs.reduce((sum, ttr) => sum + ttr, 0) / ttrs.length;
  }
}
