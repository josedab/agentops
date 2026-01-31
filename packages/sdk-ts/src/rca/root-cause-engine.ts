/**
 * AgentOps SDK - Root Cause Analysis Engine
 *
 * Single-responsibility class for analyzing root causes of failure patterns.
 * Extracted from RootCauseAnalyzer for better maintainability.
 */

import { now, generateEventId } from "../utils.js";
import {
  FailureEvent,
  FailurePattern,
  RootCauseAnalysis,
  RootCause,
  Evidence,
  ContributingFactor,
  TimelineEvent,
  ResolvedRCAConfig,
} from "./types.js";

/** Function to get the current events array */
export type EventsProvider = () => FailureEvent[];

/**
 * Analyzes failure patterns to identify root causes.
 */
export class RootCauseEngine {
  private rootCauses = new Map<string, RootCauseAnalysis>();

  constructor(
    private readonly config: ResolvedRCAConfig,
    private readonly getEvents: EventsProvider,
    private readonly patterns: Map<string, FailurePattern>,
    private readonly eventClusters: Map<string, string[]>,
  ) {}

  private get events(): FailureEvent[] {
    return this.getEvents();
  }

  /**
   * Analyze root causes for a pattern
   */
  analyzeRootCause(patternId: string): RootCauseAnalysis | null {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return null;

    const patternEvents = this.getPatternEvents(patternId);
    const rootCauses = this.identifyRootCauses(pattern, patternEvents);
    const evidence = this.gatherEvidence(pattern, patternEvents);
    const contributingFactors = this.identifyContributingFactors(
      pattern,
      patternEvents,
    );
    const timeline = this.buildTimeline(patternEvents);

    const analysis: RootCauseAnalysis = {
      id: generateEventId(),
      patternId,
      rootCauses,
      confidence: this.calculateConfidence(rootCauses, evidence),
      evidence,
      contributingFactors,
      timeline,
      analyzedAt: now(),
    };

    this.rootCauses.set(analysis.id, analysis);

    if (this.config.onRootCauseIdentified) {
      this.config.onRootCauseIdentified(analysis);
    }

    return analysis;
  }

  /**
   * Get a root cause analysis by ID
   */
  getAnalysis(analysisId: string): RootCauseAnalysis | undefined {
    return this.rootCauses.get(analysisId);
  }

  /**
   * Get all root cause analyses
   */
  getAllAnalyses(): RootCauseAnalysis[] {
    return Array.from(this.rootCauses.values());
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private getPatternEvents(patternId: string): FailureEvent[] {
    const eventIds = this.eventClusters.get(patternId) ?? [];
    return eventIds
      .map((id) => this.events.find((e) => e.id === id))
      .filter((e): e is FailureEvent => e !== undefined);
  }

  private identifyRootCauses(
    pattern: FailurePattern,
    events: FailureEvent[],
  ): RootCause[] {
    const causes: RootCause[] = [];

    // Analyze based on pattern type
    switch (pattern.type) {
      case "rate_limit":
        causes.push(this.createRateLimitCause(events));
        break;
      case "timeout":
        causes.push(this.createTimeoutCause(events));
        break;
      case "tool_failure":
        causes.push(this.createToolFailureCause(events));
        break;
      case "context_overflow":
        causes.push(this.createContextOverflowCause(events));
        break;
      case "model_issue":
        causes.push(this.createModelIssueCause(events));
        break;
      default:
        causes.push(this.createGenericCause(pattern, events));
    }

    // Check for common additional causes
    causes.push(...this.checkCommonCauses(events));

    // Sort by probability
    causes.sort((a, b) => b.probability - a.probability);

    return causes.slice(0, 5); // Top 5 causes
  }

  private createRateLimitCause(events: FailureEvent[]): RootCause {
    const models = new Set(events.map((e) => e.model).filter(Boolean));
    const avgInterval = this.calculateAvgInterval(
      events.map((e) => e.timestamp),
    );

    return {
      id: generateEventId(),
      description:
        "Request rate exceeds provider limits for model(s): " +
        Array.from(models).join(", "),
      category: "rate_limiting",
      probability: 0.9,
      reasoning: `High frequency requests (avg interval: ${Math.round(avgInterval / 1000)}s) triggering rate limits`,
      affectedComponents: ["api_client", "request_scheduler"],
      impact: "high",
    };
  }

  private createTimeoutCause(events: FailureEvent[]): RootCause {
    const avgDuration =
      events.reduce((sum, e) => sum + (e.durationMs ?? 0), 0) / events.length;
    const hasLongPrompts = events.some((e) => (e.prompt?.length ?? 0) > 10000);

    return {
      id: generateEventId(),
      description: hasLongPrompts
        ? "Request timeouts due to large prompt sizes"
        : "Request timeouts due to slow model responses",
      category: hasLongPrompts ? "prompt_design" : "model_provider",
      probability: hasLongPrompts ? 0.85 : 0.7,
      reasoning: `Average request duration: ${Math.round(avgDuration)}ms. ${hasLongPrompts ? "Large prompts detected." : ""}`,
      affectedComponents: hasLongPrompts
        ? ["prompt_builder", "context_manager"]
        : ["api_client"],
      impact: "medium",
    };
  }

  private createToolFailureCause(events: FailureEvent[]): RootCause {
    const tools = new Set(events.map((e) => e.toolName).filter(Boolean));
    const errorTypes = new Set(events.map((e) => e.errorType));

    return {
      id: generateEventId(),
      description: `Tool execution failures in: ${Array.from(tools).join(", ")}`,
      category: "tool_configuration",
      probability: 0.8,
      reasoning: `Error types observed: ${Array.from(errorTypes).join(", ")}`,
      affectedComponents: Array.from(tools) as string[],
      impact: "medium",
    };
  }

  private createContextOverflowCause(events: FailureEvent[]): RootCause {
    const avgTokens =
      events.reduce((sum, e) => sum + (e.tokenCount ?? 0), 0) / events.length;

    return {
      id: generateEventId(),
      description: "Context window exceeded for model",
      category: "context_management",
      probability: 0.85,
      reasoning: `Average token count at failure: ${Math.round(avgTokens)}`,
      affectedComponents: ["context_manager", "prompt_builder"],
      impact: "high",
    };
  }

  private createModelIssueCause(events: FailureEvent[]): RootCause {
    const models = new Set(events.map((e) => e.model).filter(Boolean));

    return {
      id: generateEventId(),
      description: `Model API issues with: ${Array.from(models).join(", ")}`,
      category: "model_provider",
      probability: 0.75,
      reasoning: "Errors originating from model API layer",
      affectedComponents: ["api_client", "model_adapter"],
      impact: "high",
    };
  }

  private createGenericCause(
    pattern: FailurePattern,
    events: FailureEvent[],
  ): RootCause {
    const errorTypes = new Set(events.map((e) => e.errorType));

    return {
      id: generateEventId(),
      description: `Recurring error pattern: ${pattern.name}`,
      category: "unknown",
      probability: 0.5,
      reasoning: `Error types: ${Array.from(errorTypes).join(", ")}. Further investigation needed.`,
      affectedComponents: [],
      impact: pattern.severity,
    };
  }

  private checkCommonCauses(events: FailureEvent[]): RootCause[] {
    const causes: RootCause[] = [];

    // Check for time-based patterns (e.g., peak hours)
    const hours = events.map((e) => new Date(e.timestamp).getUTCHours());
    const hourCounts = new Map<number, number>();
    for (const h of hours) {
      hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
    }

    let peakHour = 0;
    let maxCount = 0;
    for (const [hour, count] of hourCounts) {
      if (count > maxCount) {
        maxCount = count;
        peakHour = hour;
      }
    }

    if (maxCount > events.length * 0.4) {
      causes.push({
        id: generateEventId(),
        description: `Failures concentrated during hour ${peakHour} UTC`,
        category: "infrastructure",
        probability: 0.6,
        reasoning: `${maxCount} of ${events.length} failures occurred during this hour`,
        affectedComponents: [],
        impact: "low",
      });
    }

    // Check for user-specific issues
    const users = new Set(events.map((e) => e.userId).filter(Boolean));
    if (users.size === 1) {
      causes.push({
        id: generateEventId(),
        description: `Failures isolated to single user: ${Array.from(users)[0]}`,
        category: "data_quality",
        probability: 0.65,
        reasoning:
          "All failures from one user may indicate user-specific issue",
        affectedComponents: [],
        impact: "low",
      });
    }

    return causes;
  }

  private gatherEvidence(
    pattern: FailurePattern,
    events: FailureEvent[],
  ): Evidence[] {
    const evidence: Evidence[] = [];

    // Statistical evidence
    evidence.push({
      type: "statistical",
      description: `${pattern.occurrenceCount} occurrences with ${pattern.prevalence.toFixed(1)}% prevalence`,
      strength: Math.min(pattern.occurrenceCount / 10, 1),
      data: {
        count: pattern.occurrenceCount,
        prevalence: pattern.prevalence,
      },
    });

    // Temporal evidence
    if (pattern.trend === "increasing") {
      evidence.push({
        type: "temporal",
        description: "Failure rate is increasing over time",
        strength: 0.8,
      });
    }

    // Pattern evidence
    if (pattern.commonAttributes.length > 0) {
      evidence.push({
        type: "pattern",
        description: `Common factors: ${pattern.commonAttributes.map((a) => `${a.name}=${a.value}`).join(", ")}`,
        strength: Math.max(
          ...pattern.commonAttributes.map((a) => a.correlation),
        ),
        data: pattern.commonAttributes,
      });
    }

    // Correlation evidence
    const correlations = this.findCorrelations(events);
    for (const corr of correlations) {
      evidence.push({
        type: "correlation",
        description: corr.description,
        strength: corr.strength,
        data: corr,
      });
    }

    return evidence;
  }

  private findCorrelations(
    events: FailureEvent[],
  ): Array<{ description: string; strength: number }> {
    const correlations: Array<{ description: string; strength: number }> = [];

    // Check model correlation
    const models = events.map((e) => e.model).filter(Boolean);
    if (models.length > 0) {
      const modelCounts = new Map<string, number>();
      for (const m of models) {
        if (m) modelCounts.set(m, (modelCounts.get(m) ?? 0) + 1);
      }

      for (const [model, count] of modelCounts) {
        const ratio = count / events.length;
        if (ratio > 0.5) {
          correlations.push({
            description: `Strong correlation with model ${model}`,
            strength: ratio,
          });
        }
      }
    }

    return correlations;
  }

  private identifyContributingFactors(
    _pattern: FailurePattern,
    events: FailureEvent[],
  ): ContributingFactor[] {
    const factors: ContributingFactor[] = [];

    // Check for large prompts
    const largePrompts = events.filter(
      (e) => (e.prompt?.length ?? 0) > 5000,
    ).length;
    if (largePrompts > events.length * 0.3) {
      factors.push({
        factor: "Large prompt sizes",
        contribution: largePrompts / events.length,
        isActionable: true,
      });
    }

    // Check for high token counts
    const highTokens = events.filter((e) => (e.tokenCount ?? 0) > 4000).length;
    if (highTokens > events.length * 0.3) {
      factors.push({
        factor: "High token counts",
        contribution: highTokens / events.length,
        isActionable: true,
      });
    }

    // Check for rapid requests
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    let rapidCount = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].timestamp - sorted[i - 1].timestamp < 1000) {
        rapidCount++;
      }
    }
    if (rapidCount > events.length * 0.2) {
      factors.push({
        factor: "Rapid sequential requests",
        contribution: rapidCount / events.length,
        isActionable: true,
      });
    }

    return factors;
  }

  private buildTimeline(events: FailureEvent[]): TimelineEvent[] {
    const timeline: TimelineEvent[] = [];

    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

    // Add first occurrence
    if (sorted.length > 0) {
      timeline.push({
        timestamp: sorted[0].timestamp,
        eventType: "failure",
        description: "First occurrence of pattern",
        relatedEventId: sorted[0].id,
      });
    }

    // Add spikes
    const hourBuckets = new Map<number, FailureEvent[]>();
    for (const event of sorted) {
      const hourKey = Math.floor(event.timestamp / (60 * 60 * 1000));
      if (!hourBuckets.has(hourKey)) {
        hourBuckets.set(hourKey, []);
      }
      hourBuckets.get(hourKey)!.push(event);
    }

    const avgPerHour = sorted.length / hourBuckets.size;
    for (const [hourKey, hourEvents] of hourBuckets) {
      if (hourEvents.length > avgPerHour * 2) {
        timeline.push({
          timestamp: hourKey * 60 * 60 * 1000,
          eventType: "spike",
          description: `Spike: ${hourEvents.length} failures this hour (${Math.round(avgPerHour)} avg)`,
        });
      }
    }

    // Add most recent
    if (sorted.length > 1) {
      const last = sorted[sorted.length - 1];
      timeline.push({
        timestamp: last.timestamp,
        eventType: "failure",
        description: "Most recent occurrence",
        relatedEventId: last.id,
      });
    }

    return timeline.sort((a, b) => a.timestamp - b.timestamp);
  }

  private calculateConfidence(
    rootCauses: RootCause[],
    evidence: Evidence[],
  ): number {
    if (rootCauses.length === 0) return 0;

    const topCauseProbability = rootCauses[0]?.probability ?? 0;
    const evidenceStrength =
      evidence.reduce((sum, e) => sum + e.strength, 0) / evidence.length;

    return (topCauseProbability + evidenceStrength) / 2;
  }

  private calculateAvgInterval(timestamps: number[]): number {
    if (timestamps.length < 2) return Infinity;
    const sorted = [...timestamps].sort((a, b) => a - b);
    let totalInterval = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalInterval += sorted[i] - sorted[i - 1];
    }
    return totalInterval / (sorted.length - 1);
  }
}
