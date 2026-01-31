/**
 * AgentOps SDK - Pattern Detection
 *
 * Single-responsibility class for detecting patterns in failure events.
 * Extracted from RootCauseAnalyzer for better maintainability.
 */

import { now, generateEventId } from "../utils.js";
import {
  FailureEvent,
  FailurePattern,
  PatternType,
  PatternAttribute,
  ResolvedRCAConfig,
} from "./types.js";

/** Function to get the current events array */
export type EventsProvider = () => FailureEvent[];

/**
 * Detects patterns in failure events using clustering and similarity analysis.
 */
export class PatternDetector {
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
   * Detect patterns in failure events
   */
  detectPatterns(): FailurePattern[] {
    const detectedPatterns: FailurePattern[] = [];

    // Group events by error type
    const byErrorType = this.groupBy(this.events, "errorType");

    for (const [errorType, events] of Object.entries(byErrorType)) {
      if (events.length < this.config.minSamplesForPattern) continue;

      const clusters = this.clusterEvents(events);

      for (const cluster of clusters) {
        if (cluster.length < this.config.minSamplesForPattern) continue;

        const pattern = this.createPatternFromCluster(cluster, errorType);
        detectedPatterns.push(pattern);
        this.patterns.set(pattern.id, pattern);

        if (this.config.onPatternDetected) {
          this.config.onPatternDetected(pattern);
        }
      }
    }

    // Detect rate limit patterns
    detectedPatterns.push(...this.detectRateLimitPatterns());

    // Detect timeout patterns
    detectedPatterns.push(...this.detectTimeoutPatterns());

    // Detect tool failure patterns
    detectedPatterns.push(...this.detectToolFailurePatterns());

    return detectedPatterns;
  }

  /**
   * Analyze a new event and match/create patterns
   */
  analyzeNewEvent(event: FailureEvent): void {
    // Check if event matches existing patterns
    for (const pattern of this.patterns.values()) {
      if (this.eventMatchesPattern(event, pattern)) {
        this.updatePattern(pattern, event);
        return;
      }
    }

    // Check if we should create a new pattern
    const similarEvents = this.findSimilarEvents(event);
    if (similarEvents.length >= this.config.minSamplesForPattern) {
      const pattern = this.createPatternFromCluster(
        [event, ...similarEvents],
        event.errorType,
      );
      this.patterns.set(pattern.id, pattern);

      if (this.config.onPatternDetected) {
        this.config.onPatternDetected(pattern);
      }
    }
  }

  /**
   * Calculate similarity between two events
   */
  calculateSimilarity(a: FailureEvent, b: FailureEvent): number {
    let matches = 0;
    let total = 0;

    // Error type match
    if (a.errorType === b.errorType) matches++;
    total++;

    // Feature match
    if (a.featureId && b.featureId) {
      if (a.featureId === b.featureId) matches++;
      total++;
    }

    // Model match
    if (a.model && b.model) {
      if (a.model === b.model) matches++;
      total++;
    }

    // Tool match
    if (a.toolName && b.toolName) {
      if (a.toolName === b.toolName) matches++;
      total++;
    }

    // Error message similarity
    if (a.errorMessage && b.errorMessage) {
      const msgSimilarity = this.stringSimilarity(
        a.errorMessage,
        b.errorMessage,
      );
      matches += msgSimilarity;
      total++;
    }

    return total > 0 ? matches / total : 0;
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private eventMatchesPattern(
    event: FailureEvent,
    pattern: FailurePattern,
  ): boolean {
    for (const attr of pattern.commonAttributes) {
      const eventValue = this.getEventAttribute(event, attr.name);
      if (attr.value !== eventValue && attr.correlation > 0.8) {
        return false;
      }
    }
    return true;
  }

  private findSimilarEvents(event: FailureEvent): FailureEvent[] {
    return this.events.filter((e) => {
      if (e.id === event.id) return false;
      return (
        this.calculateSimilarity(event, e) >= this.config.similarityThreshold
      );
    });
  }

  private stringSimilarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/));
    const bWords = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...aWords].filter((x) => bWords.has(x)));
    const union = new Set([...aWords, ...bWords]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private clusterEvents(events: FailureEvent[]): FailureEvent[][] {
    if (events.length === 0) return [];

    const clusters: FailureEvent[][] = [];
    const assigned = new Set<string>();

    for (const event of events) {
      if (assigned.has(event.id)) continue;

      const cluster = [event];
      assigned.add(event.id);

      for (const other of events) {
        if (assigned.has(other.id)) continue;
        if (
          this.calculateSimilarity(event, other) >=
          this.config.similarityThreshold
        ) {
          cluster.push(other);
          assigned.add(other.id);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  private createPatternFromCluster(
    events: FailureEvent[],
    errorType: string,
  ): FailurePattern {
    const timestamps = events.map((e) => e.timestamp);
    const commonAttributes = this.extractCommonAttributes(events);
    const type = this.determinePatternType(events, errorType);
    const severity = this.calculatePatternSeverity(events);
    const trend = this.calculateTrend(timestamps);

    const pattern: FailurePattern = {
      id: generateEventId(),
      name: this.generatePatternName(type, commonAttributes),
      description: this.generatePatternDescription(
        type,
        events,
        commonAttributes,
      ),
      type,
      occurrenceCount: events.length,
      prevalence:
        this.events.length > 0 ? (events.length / this.events.length) * 100 : 0,
      firstSeen: Math.min(...timestamps),
      lastSeen: Math.max(...timestamps),
      commonAttributes,
      sampleEventIds: events.slice(0, 10).map((e) => e.id),
      severity,
      trend,
      isActive: now() - Math.max(...timestamps) < 24 * 60 * 60 * 1000,
      createdAt: now(),
    };

    this.eventClusters.set(
      pattern.id,
      events.map((e) => e.id),
    );

    return pattern;
  }

  private extractCommonAttributes(events: FailureEvent[]): PatternAttribute[] {
    const attributes: PatternAttribute[] = [];
    const attributeNames = ["featureId", "model", "toolName", "errorType"];

    for (const name of attributeNames) {
      const values = new Map<string, number>();

      for (const event of events) {
        const value = this.getEventAttribute(event, name);
        if (value !== undefined) {
          values.set(String(value), (values.get(String(value)) ?? 0) + 1);
        }
      }

      let maxCount = 0;
      let mostCommon: string | undefined;
      for (const [value, count] of values) {
        if (count > maxCount) {
          maxCount = count;
          mostCommon = value;
        }
      }

      if (mostCommon && maxCount >= events.length * 0.5) {
        attributes.push({
          name,
          value: mostCommon,
          frequency: maxCount / events.length,
          correlation: maxCount / events.length,
        });
      }
    }

    return attributes;
  }

  private getEventAttribute(event: FailureEvent, name: string): unknown {
    return (event as unknown as Record<string, unknown>)[name];
  }

  private determinePatternType(
    events: FailureEvent[],
    errorType: string,
  ): PatternType {
    const lowerError = errorType.toLowerCase();

    if (
      lowerError.includes("rate") ||
      lowerError.includes("limit") ||
      lowerError.includes("429")
    ) {
      return "rate_limit";
    }
    if (lowerError.includes("timeout") || lowerError.includes("deadline")) {
      return "timeout";
    }
    if (events.some((e) => e.toolName)) {
      return "tool_failure";
    }
    if (lowerError.includes("context") || lowerError.includes("token")) {
      return "context_overflow";
    }
    if (lowerError.includes("model") || lowerError.includes("api")) {
      return "model_issue";
    }

    return "error_cluster";
  }

  private calculatePatternSeverity(
    events: FailureEvent[],
  ): "low" | "medium" | "high" | "critical" {
    const count = events.length;
    const recentEvents = events.filter(
      (e) => e.timestamp > now() - 60 * 60 * 1000,
    ).length;

    if (recentEvents > 10 || count > 100) return "critical";
    if (recentEvents > 5 || count > 50) return "high";
    if (recentEvents > 2 || count > 20) return "medium";
    return "low";
  }

  private calculateTrend(
    timestamps: number[],
  ): "increasing" | "stable" | "decreasing" {
    if (timestamps.length < 5) return "stable";

    const sorted = [...timestamps].sort((a, b) => a - b);
    const midpoint = Math.floor(sorted.length / 2);

    const firstHalfAvgInterval = this.calculateAvgInterval(
      sorted.slice(0, midpoint),
    );
    const secondHalfAvgInterval = this.calculateAvgInterval(
      sorted.slice(midpoint),
    );

    if (secondHalfAvgInterval < firstHalfAvgInterval * 0.7) return "increasing";
    if (secondHalfAvgInterval > firstHalfAvgInterval * 1.3) return "decreasing";
    return "stable";
  }

  private calculateAvgInterval(timestamps: number[]): number {
    if (timestamps.length < 2) return Infinity;
    let totalInterval = 0;
    for (let i = 1; i < timestamps.length; i++) {
      totalInterval += timestamps[i] - timestamps[i - 1];
    }
    return totalInterval / (timestamps.length - 1);
  }

  private generatePatternName(
    type: PatternType,
    attributes: PatternAttribute[],
  ): string {
    const featureAttr = attributes.find((a) => a.name === "featureId");
    const modelAttr = attributes.find((a) => a.name === "model");

    let name = type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    if (featureAttr) {
      name += ` in ${featureAttr.value}`;
    }
    if (modelAttr) {
      name += ` (${modelAttr.value})`;
    }

    return name;
  }

  private generatePatternDescription(
    type: PatternType,
    events: FailureEvent[],
    attributes: PatternAttribute[],
  ): string {
    const count = events.length;
    const timeSpan =
      Math.max(...events.map((e) => e.timestamp)) -
      Math.min(...events.map((e) => e.timestamp));
    const hours = Math.round(timeSpan / (60 * 60 * 1000));

    let desc = `Detected ${count} occurrences of ${type.replace(/_/g, " ")} over ${hours} hours.`;

    if (attributes.length > 0) {
      desc += ` Common factors: ${attributes.map((a) => `${a.name}=${a.value}`).join(", ")}.`;
    }

    return desc;
  }

  private updatePattern(pattern: FailurePattern, event: FailureEvent): void {
    pattern.occurrenceCount++;
    pattern.lastSeen = event.timestamp;
    pattern.prevalence =
      this.events.length > 0
        ? (pattern.occurrenceCount / this.events.length) * 100
        : 0;
    pattern.isActive = true;

    const timestamps = (this.eventClusters.get(pattern.id) ?? [])
      .map((id) => this.events.find((e) => e.id === id)?.timestamp)
      .filter((t): t is number => t !== undefined);
    timestamps.push(event.timestamp);
    pattern.trend = this.calculateTrend(timestamps);

    pattern.severity = this.calculatePatternSeverity(
      (this.eventClusters.get(pattern.id) ?? [])
        .map((id) => this.events.find((e) => e.id === id))
        .filter((e): e is FailureEvent => e !== undefined),
    );
  }

  private detectRateLimitPatterns(): FailurePattern[] {
    const rateLimitEvents = this.events.filter(
      (e) =>
        e.errorType.toLowerCase().includes("rate") ||
        e.errorType.toLowerCase().includes("429") ||
        e.errorMessage.toLowerCase().includes("rate limit"),
    );

    if (rateLimitEvents.length < this.config.minSamplesForPattern) return [];

    const pattern = this.createPatternFromCluster(
      rateLimitEvents,
      "rate_limit",
    );
    pattern.type = "rate_limit";
    this.patterns.set(pattern.id, pattern);

    return [pattern];
  }

  private detectTimeoutPatterns(): FailurePattern[] {
    const timeoutEvents = this.events.filter(
      (e) =>
        e.errorType.toLowerCase().includes("timeout") ||
        e.errorMessage.toLowerCase().includes("timeout") ||
        (e.durationMs && e.durationMs > 30000),
    );

    if (timeoutEvents.length < this.config.minSamplesForPattern) return [];

    const pattern = this.createPatternFromCluster(timeoutEvents, "timeout");
    pattern.type = "timeout";
    this.patterns.set(pattern.id, pattern);

    return [pattern];
  }

  private detectToolFailurePatterns(): FailurePattern[] {
    const patterns: FailurePattern[] = [];
    const toolEvents = this.events.filter((e) => e.toolName);
    const byTool = this.groupBy(toolEvents, "toolName");

    for (const [toolName, events] of Object.entries(byTool)) {
      if (events.length < this.config.minSamplesForPattern) continue;

      const pattern = this.createPatternFromCluster(events, "tool_failure");
      pattern.type = "tool_failure";
      pattern.name = `Tool Failure: ${toolName}`;
      this.patterns.set(pattern.id, pattern);
      patterns.push(pattern);
    }

    return patterns;
  }

  private groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {
    const groups: Record<string, T[]> = {};
    for (const item of items) {
      const value = String(item[key] ?? "undefined");
      if (!groups[value]) {
        groups[value] = [];
      }
      groups[value].push(item);
    }
    return groups;
  }
}
