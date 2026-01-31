/**
 * AgentOps SDK - Semantic Diff Engine
 *
 * Compare agent behavior across versions, deployments, and time periods.
 * Detect meaningful changes and filter out noise.
 */

import { generateEventId, now } from "../utils.js";
import {
  SemanticDiffConfig,
  ResolvedSemanticDiffConfig,
  Cohort,
  CohortType,
  CohortFilter,
  CohortSession,
  CohortStats,
  ComparisonRequest,
  MetricType,
  DimensionType,
  DiffResult,
  DiffSummary,
  MetricDiff,
  DimensionalDiff,
  DimensionalBreakdown,
  BehavioralChange,
  BehavioralChangeType,
  StatisticalAnalysis,
  StatisticalTest,
  SignificantChange,
  DiffRecommendation,
  VersionMarker,
  VersionType,
  DeploymentMarker,
  PromptVersionMarker,
} from "./types.js";

// ============================================================================
// Session Store Interface
// ============================================================================

export interface DiffSessionStore {
  getSessions(filter: CohortFilter): Promise<CohortSession[]>;
  getSessionCount(filter: CohortFilter): Promise<number>;
}

// ============================================================================
// In-Memory Session Store
// ============================================================================

export class InMemoryDiffSessionStore implements DiffSessionStore {
  private sessions: Map<string, CohortSession> = new Map();

  addSession(session: CohortSession): void {
    this.sessions.set(session.sessionId, session);
  }

  addSessions(sessions: CohortSession[]): void {
    for (const session of sessions) {
      this.sessions.set(session.sessionId, session);
    }
  }

  async getSessions(filter: CohortFilter): Promise<CohortSession[]> {
    let results = Array.from(this.sessions.values());
    results = this.applyFilter(results, filter);
    return results;
  }

  async getSessionCount(filter: CohortFilter): Promise<number> {
    const sessions = await this.getSessions(filter);
    return sessions.length;
  }

  clear(): void {
    this.sessions.clear();
  }

  private applyFilter(
    sessions: CohortSession[],
    filter: CohortFilter,
  ): CohortSession[] {
    return sessions.filter((session) => {
      if (filter.timeRange) {
        if (
          session.startTime < filter.timeRange.start ||
          session.startTime > filter.timeRange.end
        ) {
          return false;
        }
      }

      if (
        filter.promptVersion &&
        session.promptVersion !== filter.promptVersion
      ) {
        return false;
      }

      if (filter.model && session.model !== filter.model) {
        return false;
      }

      if (filter.deploymentId && session.deploymentId !== filter.deploymentId) {
        return false;
      }

      if (filter.featureId && session.featureId !== filter.featureId) {
        return false;
      }

      if (filter.userId && session.userId !== filter.userId) {
        return false;
      }

      if (filter.tags && filter.tags.length > 0) {
        const sessionTags = new Set(session.tags || []);
        if (!filter.tags.some((t) => sessionTags.has(t))) {
          return false;
        }
      }

      if (filter.customFilter && !filter.customFilter(session)) {
        return false;
      }

      return true;
    });
  }
}

// ============================================================================
// Semantic Diff Engine
// ============================================================================

const DEFAULT_CONFIG: ResolvedSemanticDiffConfig = {
  enabled: true,
  minSampleSize: 30,
  significanceThreshold: 0.05,
  maxSessionsPerCohort: 10000,
  autoTrackVersions: true,
};

const ALL_METRICS: MetricType[] = [
  "success_rate",
  "error_rate",
  "latency_p50",
  "latency_p95",
  "latency_p99",
  "avg_latency",
  "total_cost",
  "avg_cost",
  "avg_tokens",
  "tool_success_rate",
  "tool_usage_rate",
  "events_per_session",
];

export class SemanticDiffEngine {
  private config: ResolvedSemanticDiffConfig;
  private sessionStore: DiffSessionStore;
  private versionMarkers: Map<string, VersionMarker> = new Map();

  constructor(config: SemanticDiffConfig, sessionStore?: DiffSessionStore) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionStore = sessionStore ?? new InMemoryDiffSessionStore();
  }

  /**
   * Compare two cohorts and generate a diff
   */
  async compare(request: ComparisonRequest): Promise<DiffResult> {
    if (!this.config.enabled) {
      throw new Error("Semantic diff is disabled");
    }

    // Resolve cohorts
    const baselineCohort = await this.resolveCohort(
      request.baseline,
      "baseline",
    );
    const comparisonCohort = await this.resolveCohort(
      request.comparison,
      "comparison",
    );

    // Get sessions for each cohort
    const baselineSessions = await this.sessionStore.getSessions(
      baselineCohort.filter,
    );
    const comparisonSessions = await this.sessionStore.getSessions(
      comparisonCohort.filter,
    );

    // Limit sessions
    const limitedBaseline = baselineSessions.slice(
      0,
      this.config.maxSessionsPerCohort,
    );
    const limitedComparison = comparisonSessions.slice(
      0,
      this.config.maxSessionsPerCohort,
    );

    // Calculate stats for each cohort
    const baselineStats = this.calculateCohortStats(limitedBaseline);
    const comparisonStats = this.calculateCohortStats(limitedComparison);

    // Determine metrics to compare
    const metrics = request.metrics ?? ALL_METRICS;
    const dimensions = request.dimensions ?? ["model", "feature", "error_type"];

    // Calculate metric diffs
    const metricDiffs = this.calculateMetricDiffs(
      baselineStats,
      comparisonStats,
      metrics,
    );

    // Calculate dimensional diffs
    const dimensionalDiffs = this.calculateDimensionalDiffs(
      limitedBaseline,
      limitedComparison,
      dimensions,
    );

    // Detect behavioral changes
    const behavioralChanges = this.detectBehavioralChanges(
      limitedBaseline,
      limitedComparison,
      baselineStats,
      comparisonStats,
    );

    // Statistical analysis
    const statistics = this.performStatisticalAnalysis(
      limitedBaseline,
      limitedComparison,
      metricDiffs,
    );

    // Identify significant changes
    const significantChanges = this.identifySignificantChanges(
      metricDiffs,
      behavioralChanges,
      statistics,
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      metricDiffs,
      behavioralChanges,
      significantChanges,
    );

    // Generate summary
    const summary = this.generateSummary(
      metricDiffs,
      behavioralChanges,
      significantChanges,
      statistics,
    );

    // Notify of significant changes
    for (const change of significantChanges) {
      this.config.onSignificantChange?.(change);
    }

    return {
      id: generateEventId(),
      request,
      summary,
      metricDiffs,
      dimensionalDiffs,
      behavioralChanges,
      statistics,
      significantChanges,
      recommendations,
      generatedAt: now(),
    };
  }

  /**
   * Create a time-based comparison (before vs after a timestamp)
   */
  async compareTimePeriods(
    pivotTimestamp: number,
    options: {
      beforeDurationMs?: number;
      afterDurationMs?: number;
      filter?: Partial<CohortFilter>;
    } = {},
  ): Promise<DiffResult> {
    const beforeDuration = options.beforeDurationMs ?? 24 * 60 * 60 * 1000; // 24 hours
    const afterDuration = options.afterDurationMs ?? 24 * 60 * 60 * 1000;

    const baselineFilter: CohortFilter = {
      ...options.filter,
      timeRange: {
        start: pivotTimestamp - beforeDuration,
        end: pivotTimestamp,
      },
    };

    const comparisonFilter: CohortFilter = {
      ...options.filter,
      timeRange: {
        start: pivotTimestamp,
        end: pivotTimestamp + afterDuration,
      },
    };

    return this.compare({
      baseline: baselineFilter,
      comparison: comparisonFilter,
      includeStatistics: true,
    });
  }

  /**
   * Compare two prompt versions
   */
  async comparePromptVersions(
    baselineVersion: string,
    comparisonVersion: string,
    filter?: Partial<CohortFilter>,
  ): Promise<DiffResult> {
    return this.compare({
      baseline: { ...filter, promptVersion: baselineVersion },
      comparison: { ...filter, promptVersion: comparisonVersion },
      includeStatistics: true,
    });
  }

  /**
   * Compare two deployments
   */
  async compareDeployments(
    baselineDeploymentId: string,
    comparisonDeploymentId: string,
    filter?: Partial<CohortFilter>,
  ): Promise<DiffResult> {
    return this.compare({
      baseline: { ...filter, deploymentId: baselineDeploymentId },
      comparison: { ...filter, deploymentId: comparisonDeploymentId },
      includeStatistics: true,
    });
  }

  /**
   * Compare two models
   */
  async compareModels(
    baselineModel: string,
    comparisonModel: string,
    filter?: Partial<CohortFilter>,
  ): Promise<DiffResult> {
    return this.compare({
      baseline: { ...filter, model: baselineModel },
      comparison: { ...filter, model: comparisonModel },
      includeStatistics: true,
    });
  }

  /**
   * Record a version marker
   */
  recordVersionMarker(marker: VersionMarker): void {
    this.versionMarkers.set(marker.id, marker);
  }

  /**
   * Record a deployment
   */
  recordDeployment(
    deployment: Omit<DeploymentMarker, "id" | "type" | "timestamp">,
  ): string {
    const id = generateEventId();
    const marker: DeploymentMarker = {
      id,
      type: "deployment",
      timestamp: now(),
      ...deployment,
    };
    this.versionMarkers.set(id, marker);
    return id;
  }

  /**
   * Record a prompt version
   */
  recordPromptVersion(
    prompt: Omit<PromptVersionMarker, "id" | "type" | "timestamp">,
  ): string {
    const id = generateEventId();
    const marker: PromptVersionMarker = {
      id,
      type: "prompt",
      timestamp: now(),
      ...prompt,
    };
    this.versionMarkers.set(id, marker);
    return id;
  }

  /**
   * Get version markers
   */
  getVersionMarkers(type?: VersionType): VersionMarker[] {
    const markers = Array.from(this.versionMarkers.values());
    if (type) {
      return markers.filter((m) => m.type === type);
    }
    return markers;
  }

  /**
   * Get the underlying session store
   */
  getSessionStore(): DiffSessionStore {
    return this.sessionStore;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async resolveCohort(
    input: Cohort | CohortFilter,
    name: string,
  ): Promise<Cohort> {
    if ("filter" in input && "sessionIds" in input) {
      return input as Cohort;
    }

    const filter = input as CohortFilter;
    const sessions = await this.sessionStore.getSessions(filter);

    return {
      id: generateEventId(),
      name,
      type: this.inferCohortType(filter),
      filter,
      sessionIds: sessions.map((s) => s.sessionId),
      sampleSize: sessions.length,
      timeRange: this.calculateTimeRange(sessions),
      metadata: {},
    };
  }

  private inferCohortType(filter: CohortFilter): CohortType {
    if (filter.timeRange) return "time_period";
    if (filter.promptVersion) return "prompt_version";
    if (filter.model) return "model_version";
    if (filter.deploymentId) return "deployment";
    if (filter.featureFlag) return "feature_flag";
    return "custom";
  }

  private calculateTimeRange(sessions: CohortSession[]): {
    start: number;
    end: number;
  } {
    if (sessions.length === 0) {
      return { start: now(), end: now() };
    }

    const times = sessions.map((s) => s.startTime);
    return {
      start: Math.min(...times),
      end: Math.max(...times),
    };
  }

  private calculateCohortStats(sessions: CohortSession[]): CohortStats {
    if (sessions.length === 0) {
      return this.emptyCohortStats();
    }

    const successCount = sessions.filter((s) => s.status === "success").length;
    const errorCount = sessions.filter((s) => s.status === "error").length;
    const latencies = sessions.map((s) => s.durationMs);
    const costs = sessions.map((s) => s.totalCost);
    const tokens = sessions.map((s) => s.totalTokens);

    // Error breakdown
    const errorBreakdown: Record<string, number> = {};
    // Model breakdown
    const modelBreakdown: Record<string, number> = {};

    let totalToolCalls = 0;
    let totalToolSuccesses = 0;
    const toolsUsed = new Set<string>();

    for (const session of sessions) {
      if (session.model) {
        modelBreakdown[session.model] =
          (modelBreakdown[session.model] || 0) + 1;
      }
      totalToolCalls += session.toolCalls;
      totalToolSuccesses += session.toolSuccesses;
    }

    return {
      sessionCount: sessions.length,
      successCount,
      errorCount,
      successRate: sessions.length > 0 ? successCount / sessions.length : 0,
      latency: {
        min: Math.min(...latencies),
        max: Math.max(...latencies),
        avg: this.average(latencies),
        p50: this.percentile(latencies, 50),
        p95: this.percentile(latencies, 95),
        p99: this.percentile(latencies, 99),
        stdDev: this.standardDeviation(latencies),
      },
      cost: {
        total: this.sum(costs),
        avg: this.average(costs),
        min: Math.min(...costs),
        max: Math.max(...costs),
        stdDev: this.standardDeviation(costs),
      },
      tokens: {
        total: this.sum(tokens),
        avg: this.average(tokens),
        min: Math.min(...tokens),
        max: Math.max(...tokens),
      },
      tools: {
        totalCalls: totalToolCalls,
        successRate:
          totalToolCalls > 0 ? totalToolSuccesses / totalToolCalls : 1,
        uniqueTools: toolsUsed.size,
        callsPerSession:
          sessions.length > 0 ? totalToolCalls / sessions.length : 0,
      },
      errorBreakdown,
      modelBreakdown,
    };
  }

  private emptyCohortStats(): CohortStats {
    return {
      sessionCount: 0,
      successCount: 0,
      errorCount: 0,
      successRate: 0,
      latency: { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0, stdDev: 0 },
      cost: { total: 0, avg: 0, min: 0, max: 0, stdDev: 0 },
      tokens: { total: 0, avg: 0, min: 0, max: 0 },
      tools: {
        totalCalls: 0,
        successRate: 1,
        uniqueTools: 0,
        callsPerSession: 0,
      },
      errorBreakdown: {},
      modelBreakdown: {},
    };
  }

  private calculateMetricDiffs(
    baseline: CohortStats,
    comparison: CohortStats,
    metrics: MetricType[],
  ): MetricDiff[] {
    const diffs: MetricDiff[] = [];

    for (const metric of metrics) {
      const baselineValue = this.getMetricValue(baseline, metric);
      const comparisonValue = this.getMetricValue(comparison, metric);
      const absoluteChange = comparisonValue - baselineValue;
      const percentageChange =
        baselineValue !== 0
          ? ((comparisonValue - baselineValue) / baselineValue) * 100
          : comparisonValue !== 0
            ? 100
            : 0;

      const direction =
        absoluteChange > 0.001
          ? "increase"
          : absoluteChange < -0.001
            ? "decrease"
            : "no_change";

      const isSignificant = Math.abs(percentageChange) >= 5; // Simple threshold
      const impact = this.assessMetricImpact(
        metric,
        direction,
        percentageChange,
      );

      diffs.push({
        metric,
        baselineValue,
        comparisonValue,
        absoluteChange,
        percentageChange,
        direction,
        isSignificant,
        impact,
      });
    }

    return diffs;
  }

  private getMetricValue(stats: CohortStats, metric: MetricType): number {
    switch (metric) {
      case "success_rate":
        return stats.successRate;
      case "error_rate":
        return 1 - stats.successRate;
      case "latency_p50":
        return stats.latency.p50;
      case "latency_p95":
        return stats.latency.p95;
      case "latency_p99":
        return stats.latency.p99;
      case "avg_latency":
        return stats.latency.avg;
      case "total_cost":
        return stats.cost.total;
      case "avg_cost":
        return stats.cost.avg;
      case "avg_tokens":
        return stats.tokens.avg;
      case "tool_success_rate":
        return stats.tools.successRate;
      case "tool_usage_rate":
        return stats.tools.callsPerSession;
      case "events_per_session":
        return stats.sessionCount > 0 ? stats.sessionCount : 0;
      default:
        return 0;
    }
  }

  private assessMetricImpact(
    metric: MetricType,
    direction: "increase" | "decrease" | "no_change",
    percentageChange: number,
  ): "positive" | "negative" | "neutral" {
    if (direction === "no_change") return "neutral";

    // Define which direction is good for each metric
    const higherIsBetter = ["success_rate", "tool_success_rate"];
    const lowerIsBetter = [
      "error_rate",
      "latency_p50",
      "latency_p95",
      "latency_p99",
      "avg_latency",
      "avg_cost",
    ];

    if (higherIsBetter.includes(metric)) {
      return direction === "increase" ? "positive" : "negative";
    }
    if (lowerIsBetter.includes(metric)) {
      return direction === "decrease" ? "positive" : "negative";
    }

    // For neutral metrics (like tokens), assess based on magnitude
    return Math.abs(percentageChange) < 10 ? "neutral" : "negative";
  }

  private calculateDimensionalDiffs(
    baseline: CohortSession[],
    comparison: CohortSession[],
    dimensions: DimensionType[],
  ): DimensionalDiff[] {
    const diffs: DimensionalDiff[] = [];

    for (const dimension of dimensions) {
      const breakdown = this.calculateDimensionalBreakdown(
        baseline,
        comparison,
        dimension,
      );
      diffs.push({
        dimension,
        breakdown,
      });
    }

    return diffs;
  }

  private calculateDimensionalBreakdown(
    baseline: CohortSession[],
    comparison: CohortSession[],
    dimension: DimensionType,
  ): DimensionalBreakdown[] {
    const baselineGroups = this.groupByDimension(baseline, dimension);
    const comparisonGroups = this.groupByDimension(comparison, dimension);

    const allValues = new Set([
      ...Object.keys(baselineGroups),
      ...Object.keys(comparisonGroups),
    ]);

    const breakdowns: DimensionalBreakdown[] = [];

    for (const value of allValues) {
      const baselineCount = baselineGroups[value]?.length ?? 0;
      const comparisonCount = comparisonGroups[value]?.length ?? 0;
      const baselinePercentage =
        baseline.length > 0 ? (baselineCount / baseline.length) * 100 : 0;
      const comparisonPercentage =
        comparison.length > 0 ? (comparisonCount / comparison.length) * 100 : 0;

      breakdowns.push({
        value,
        baseline: {
          count: baselineCount,
          percentage: baselinePercentage,
        },
        comparison: {
          count: comparisonCount,
          percentage: comparisonPercentage,
        },
        change: {
          countChange: comparisonCount - baselineCount,
          percentagePointChange: comparisonPercentage - baselinePercentage,
        },
        isSignificant: Math.abs(comparisonPercentage - baselinePercentage) >= 5,
      });
    }

    return breakdowns.sort(
      (a, b) =>
        Math.abs(b.change.percentagePointChange) -
        Math.abs(a.change.percentagePointChange),
    );
  }

  private groupByDimension(
    sessions: CohortSession[],
    dimension: DimensionType,
  ): Record<string, CohortSession[]> {
    const groups: Record<string, CohortSession[]> = {};

    for (const session of sessions) {
      const value = this.getDimensionValue(session, dimension);
      if (value) {
        if (!groups[value]) groups[value] = [];
        groups[value].push(session);
      }
    }

    return groups;
  }

  private getDimensionValue(
    session: CohortSession,
    dimension: DimensionType,
  ): string | null {
    switch (dimension) {
      case "model":
        return session.model ?? null;
      case "feature":
        return session.featureId ?? null;
      case "user":
        return session.userId ?? null;
      case "hour_of_day":
        return new Date(session.startTime).getHours().toString();
      case "day_of_week":
        return new Date(session.startTime).getDay().toString();
      case "error_type":
        return session.status === "error" ? "error" : "success";
      default:
        return null;
    }
  }

  private detectBehavioralChanges(
    _baseline: CohortSession[],
    _comparison: CohortSession[],
    baselineStats: CohortStats,
    comparisonStats: CohortStats,
  ): BehavioralChange[] {
    const changes: BehavioralChange[] = [];

    // Detect new error patterns
    const baselineErrorRate =
      baselineStats.successRate < 1 ? 1 - baselineStats.successRate : 0;
    const comparisonErrorRate =
      comparisonStats.successRate < 1 ? 1 - comparisonStats.successRate : 0;

    if (comparisonErrorRate > baselineErrorRate + 0.05) {
      changes.push({
        id: generateEventId(),
        type: "new_error_pattern",
        description: `Error rate increased from ${(baselineErrorRate * 100).toFixed(1)}% to ${(comparisonErrorRate * 100).toFixed(1)}%`,
        severity: comparisonErrorRate > 0.1 ? "high" : "medium",
        evidence: [
          {
            type: "metric_change",
            description: "Error rate comparison",
            data: {
              baseline: baselineErrorRate,
              comparison: comparisonErrorRate,
            },
          },
        ],
        confidence: 0.85,
      });
    }

    // Detect error resolution
    if (
      baselineErrorRate > 0.05 &&
      comparisonErrorRate < baselineErrorRate * 0.5
    ) {
      changes.push({
        id: generateEventId(),
        type: "error_pattern_resolved",
        description: `Error rate decreased significantly from ${(baselineErrorRate * 100).toFixed(1)}% to ${(comparisonErrorRate * 100).toFixed(1)}%`,
        severity: "low",
        evidence: [
          {
            type: "metric_change",
            description: "Error rate improvement",
            data: {
              baseline: baselineErrorRate,
              comparison: comparisonErrorRate,
            },
          },
        ],
        confidence: 0.9,
      });
    }

    // Detect latency pattern changes
    const latencyIncrease =
      comparisonStats.latency.p95 / baselineStats.latency.p95;
    if (latencyIncrease > 1.5 && baselineStats.latency.p95 > 0) {
      changes.push({
        id: generateEventId(),
        type: "latency_pattern_change",
        description: `P95 latency increased ${((latencyIncrease - 1) * 100).toFixed(0)}% from ${baselineStats.latency.p95.toFixed(0)}ms to ${comparisonStats.latency.p95.toFixed(0)}ms`,
        severity: latencyIncrease > 2 ? "high" : "medium",
        evidence: [
          {
            type: "metric_change",
            description: "Latency comparison",
            data: {
              baseline: baselineStats.latency.p95,
              comparison: comparisonStats.latency.p95,
            },
          },
        ],
        confidence: 0.8,
      });
    }

    // Detect cost pattern changes
    const costChange = comparisonStats.cost.avg / baselineStats.cost.avg;
    if (costChange > 1.3 && baselineStats.cost.avg > 0) {
      changes.push({
        id: generateEventId(),
        type: "cost_pattern_change",
        description: `Average cost per session increased ${((costChange - 1) * 100).toFixed(0)}% from $${baselineStats.cost.avg.toFixed(4)} to $${comparisonStats.cost.avg.toFixed(4)}`,
        severity: costChange > 1.5 ? "high" : "medium",
        evidence: [
          {
            type: "metric_change",
            description: "Cost comparison",
            data: {
              baseline: baselineStats.cost.avg,
              comparison: comparisonStats.cost.avg,
            },
          },
        ],
        confidence: 0.85,
      });
    }

    // Detect tool usage changes
    const toolUsageChange = Math.abs(
      comparisonStats.tools.callsPerSession -
        baselineStats.tools.callsPerSession,
    );
    if (toolUsageChange > 2) {
      changes.push({
        id: generateEventId(),
        type: "tool_usage_change",
        description: `Tool calls per session changed from ${baselineStats.tools.callsPerSession.toFixed(1)} to ${comparisonStats.tools.callsPerSession.toFixed(1)}`,
        severity: "medium",
        evidence: [
          {
            type: "metric_change",
            description: "Tool usage comparison",
            data: {
              baseline: baselineStats.tools.callsPerSession,
              comparison: comparisonStats.tools.callsPerSession,
            },
          },
        ],
        confidence: 0.75,
      });
    }

    return changes;
  }

  private performStatisticalAnalysis(
    baseline: CohortSession[],
    comparison: CohortSession[],
    metricDiffs: MetricDiff[],
  ): StatisticalAnalysis {
    const testsPerformed: StatisticalTest[] = [];
    const warnings: string[] = [];

    // Check sample sizes
    if (baseline.length < this.config.minSampleSize) {
      warnings.push(
        `Baseline sample size (${baseline.length}) is below minimum (${this.config.minSampleSize})`,
      );
    }
    if (comparison.length < this.config.minSampleSize) {
      warnings.push(
        `Comparison sample size (${comparison.length}) is below minimum (${this.config.minSampleSize})`,
      );
    }

    // Perform t-tests for continuous metrics
    for (const diff of metricDiffs) {
      if (
        [
          "avg_latency",
          "latency_p50",
          "latency_p95",
          "avg_cost",
          "avg_tokens",
        ].includes(diff.metric)
      ) {
        const baselineValues = baseline.map((s) =>
          this.getSessionMetricValue(s, diff.metric),
        );
        const comparisonValues = comparison.map((s) =>
          this.getSessionMetricValue(s, diff.metric),
        );

        const tTest = this.performTTest(baselineValues, comparisonValues);

        testsPerformed.push({
          name: "Two-sample t-test",
          metric: diff.metric,
          statistic: tTest.tStatistic,
          pValue: tTest.pValue,
          isSignificant: tTest.pValue < this.config.significanceThreshold,
          effectSize: tTest.effectSize,
        });

        // Update metric diff with statistical results
        diff.pValue = tTest.pValue;
        diff.isSignificant = tTest.pValue < this.config.significanceThreshold;
      }
    }

    // Calculate power
    const power = this.calculateStatisticalPower(
      baseline.length,
      comparison.length,
    );
    const mde = this.calculateMDE(baseline.length, comparison.length);

    return {
      sampleSizes: {
        baseline: baseline.length,
        comparison: comparison.length,
      },
      power,
      mde,
      testsPerformed,
      isValid: warnings.length === 0,
      warnings,
    };
  }

  private getSessionMetricValue(
    session: CohortSession,
    metric: MetricType,
  ): number {
    switch (metric) {
      case "avg_latency":
      case "latency_p50":
      case "latency_p95":
      case "latency_p99":
        return session.durationMs;
      case "avg_cost":
      case "total_cost":
        return session.totalCost;
      case "avg_tokens":
        return session.totalTokens;
      case "success_rate":
        return session.status === "success" ? 1 : 0;
      case "error_rate":
        return session.status === "error" ? 1 : 0;
      default:
        return 0;
    }
  }

  private performTTest(
    group1: number[],
    group2: number[],
  ): { tStatistic: number; pValue: number; effectSize: number } {
    // Simple two-sample t-test implementation
    const n1 = group1.length;
    const n2 = group2.length;

    if (n1 < 2 || n2 < 2) {
      return { tStatistic: 0, pValue: 1, effectSize: 0 };
    }

    const mean1 = this.average(group1);
    const mean2 = this.average(group2);
    const var1 = this.variance(group1);
    const var2 = this.variance(group2);

    // Pooled standard error
    const se = Math.sqrt(var1 / n1 + var2 / n2);

    if (se === 0) {
      return { tStatistic: 0, pValue: 1, effectSize: 0 };
    }

    const tStatistic = (mean1 - mean2) / se;

    // Approximate p-value using normal distribution (valid for large samples)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(tStatistic)));

    // Cohen's d effect size
    const pooledStd = Math.sqrt(
      ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2),
    );
    const effectSize = pooledStd > 0 ? Math.abs(mean1 - mean2) / pooledStd : 0;

    return { tStatistic, pValue, effectSize };
  }

  private normalCDF(x: number): number {
    // Approximation of standard normal CDF
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  private calculateStatisticalPower(n1: number, n2: number): number {
    // Simplified power calculation
    const minN = Math.min(n1, n2);
    if (minN < 10) return 0.2;
    if (minN < 30) return 0.5;
    if (minN < 100) return 0.7;
    if (minN < 500) return 0.85;
    return 0.95;
  }

  private calculateMDE(n1: number, n2: number): number {
    // Minimum detectable effect (as percentage)
    const minN = Math.min(n1, n2);
    if (minN < 10) return 50;
    if (minN < 30) return 30;
    if (minN < 100) return 15;
    if (minN < 500) return 7;
    return 3;
  }

  private identifySignificantChanges(
    metricDiffs: MetricDiff[],
    behavioralChanges: BehavioralChange[],
    _statistics: StatisticalAnalysis,
  ): SignificantChange[] {
    const changes: SignificantChange[] = [];

    // Add significant metric changes
    for (const diff of metricDiffs.filter((d) => d.isSignificant)) {
      changes.push({
        id: generateEventId(),
        affected: diff.metric,
        type: "metric",
        before: this.formatMetricValue(diff.metric, diff.baselineValue),
        after: this.formatMetricValue(diff.metric, diff.comparisonValue),
        impact: diff.impact,
        severity: this.metricChangeToSeverity(diff),
        recommendedAction: this.getRecommendedAction(diff),
      });
    }

    // Add behavioral changes
    for (const change of behavioralChanges) {
      changes.push({
        id: change.id,
        affected: change.type,
        type: "behavioral",
        before: "Previous behavior",
        after: change.description,
        impact: change.severity === "high" ? "negative" : "neutral",
        severity: change.severity,
        recommendedAction: this.getBehavioralRecommendation(change.type),
      });
    }

    return changes.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  private formatMetricValue(metric: MetricType, value: number): string {
    if (metric.includes("rate")) return `${(value * 100).toFixed(1)}%`;
    if (metric.includes("latency")) return `${value.toFixed(0)}ms`;
    if (metric.includes("cost")) return `$${value.toFixed(4)}`;
    if (metric.includes("tokens")) return value.toFixed(0);
    return value.toFixed(2);
  }

  private metricChangeToSeverity(
    diff: MetricDiff,
  ): "low" | "medium" | "high" | "critical" {
    const absChange = Math.abs(diff.percentageChange);

    if (diff.impact === "negative") {
      if (absChange > 50) return "critical";
      if (absChange > 25) return "high";
      if (absChange > 10) return "medium";
    }
    return "low";
  }

  private getRecommendedAction(diff: MetricDiff): string {
    if (diff.impact === "positive") {
      return "Continue monitoring to ensure improvement is sustained";
    }

    switch (diff.metric) {
      case "error_rate":
        return "Investigate new errors and consider rollback if critical";
      case "success_rate":
        return "Review failed sessions for common patterns";
      case "latency_p95":
      case "latency_p99":
        return "Check for slow operations or model changes";
      case "avg_cost":
        return "Review token usage and model selection";
      default:
        return "Investigate the change and assess impact";
    }
  }

  private getBehavioralRecommendation(type: BehavioralChangeType): string {
    switch (type) {
      case "new_error_pattern":
        return "Investigate new error types and implement fixes";
      case "error_pattern_resolved":
        return "Verify fix is working as expected";
      case "tool_usage_change":
        return "Review tool configurations and usage patterns";
      case "latency_pattern_change":
        return "Profile session performance to identify bottlenecks";
      case "cost_pattern_change":
        return "Analyze cost drivers and optimize if necessary";
      default:
        return "Monitor and assess impact";
    }
  }

  private generateRecommendations(
    metricDiffs: MetricDiff[],
    _behavioralChanges: BehavioralChange[],
    significantChanges: SignificantChange[],
  ): DiffRecommendation[] {
    const recommendations: DiffRecommendation[] = [];

    // Check for critical regressions
    const criticalChanges = significantChanges.filter(
      (c) => c.severity === "critical",
    );
    if (criticalChanges.length > 0) {
      recommendations.push({
        id: generateEventId(),
        title: "Consider Rollback",
        description: `${criticalChanges.length} critical regression(s) detected. Consider rolling back to the previous version.`,
        priority: "critical",
        category: "rollback",
        basedOn: criticalChanges.map((c) => c.id),
      });
    }

    // Check for high severity changes
    const highSeverityChanges = significantChanges.filter(
      (c) => c.severity === "high",
    );
    if (highSeverityChanges.length > 0 && criticalChanges.length === 0) {
      recommendations.push({
        id: generateEventId(),
        title: "Investigate High-Impact Changes",
        description: `${highSeverityChanges.length} high-impact change(s) detected. Investigate before proceeding.`,
        priority: "high",
        category: "investigate",
        basedOn: highSeverityChanges.map((c) => c.id),
      });
    }

    // Check for all improvements
    const improvements = metricDiffs.filter(
      (d) => d.isSignificant && d.impact === "positive",
    );
    if (
      improvements.length > 0 &&
      criticalChanges.length === 0 &&
      highSeverityChanges.length === 0
    ) {
      recommendations.push({
        id: generateEventId(),
        title: "Approve Changes",
        description: `${improvements.length} improvement(s) detected with no significant regressions. Safe to proceed.`,
        priority: "low",
        category: "approve",
        basedOn: [],
      });
    }

    // If no significant changes
    if (significantChanges.length === 0) {
      recommendations.push({
        id: generateEventId(),
        title: "No Significant Changes Detected",
        description:
          "The comparison shows no statistically significant differences. Continue monitoring.",
        priority: "low",
        category: "monitor",
        basedOn: [],
      });
    }

    return recommendations;
  }

  private generateSummary(
    metricDiffs: MetricDiff[],
    behavioralChanges: BehavioralChange[],
    significantChanges: SignificantChange[],
    statistics: StatisticalAnalysis,
  ): DiffSummary {
    // Determine overall assessment
    const positiveChanges = metricDiffs.filter(
      (d) => d.isSignificant && d.impact === "positive",
    ).length;
    const negativeChanges = metricDiffs.filter(
      (d) => d.isSignificant && d.impact === "negative",
    ).length;
    const criticalChanges = significantChanges.filter(
      (c) => c.severity === "critical" || c.severity === "high",
    ).length;

    let assessment: "improved" | "degraded" | "neutral" | "mixed";
    if (criticalChanges > 0) {
      assessment = "degraded";
    } else if (positiveChanges > 0 && negativeChanges === 0) {
      assessment = "improved";
    } else if (negativeChanges > 0 && positiveChanges === 0) {
      assessment = "degraded";
    } else if (positiveChanges > 0 && negativeChanges > 0) {
      assessment = "mixed";
    } else {
      assessment = "neutral";
    }

    // Key findings
    const keyFindings: string[] = [];

    for (const diff of metricDiffs.filter((d) => d.isSignificant).slice(0, 3)) {
      const direction =
        diff.direction === "increase" ? "increased" : "decreased";
      keyFindings.push(
        `${diff.metric.replace(/_/g, " ")} ${direction} by ${Math.abs(diff.percentageChange).toFixed(1)}%`,
      );
    }

    for (const change of behavioralChanges.slice(0, 2)) {
      keyFindings.push(change.description);
    }

    // Determine risk level
    let riskLevel: "low" | "medium" | "high";
    if (criticalChanges > 0) {
      riskLevel = "high";
    } else if (
      negativeChanges > 2 ||
      behavioralChanges.some((c) => c.severity === "high")
    ) {
      riskLevel = "medium";
    } else {
      riskLevel = "low";
    }

    return {
      assessment,
      confidence: statistics.power,
      keyFindings,
      significantChangeCount: significantChanges.length,
      riskLevel,
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private sum(values: number[]): number {
    return values.reduce((a, b) => a + b, 0);
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return this.sum(values) / values.length;
  }

  private variance(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.average(values);
    const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
    return this.sum(squaredDiffs) / (values.length - 1);
  }

  private standardDeviation(values: number[]): number {
    return Math.sqrt(this.variance(values));
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
