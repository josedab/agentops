/**
 * AgentOps SDK - Root Cause Analysis Engine
 *
 * ML-powered failure pattern detection, causal analysis,
 * and automated remediation recommendations.
 *
 * This module is structured as a facade that orchestrates:
 * - PatternDetector: Detects patterns in failure events
 * - RootCauseEngine: Analyzes root causes of patterns
 * - RemediationEngine: Suggests remediations for root causes
 * - RCAReportGenerator: Generates comprehensive reports
 */

import { now, generateEventId } from "../utils.js";
import { PatternDetector } from "./pattern-detector.js";
import { RootCauseEngine } from "./root-cause-engine.js";
import { RemediationEngine } from "./remediation-engine.js";
import { RCAReportGenerator } from "./report-generator.js";

// Re-export types from types.ts for backward compatibility
export type {
  RCAConfig,
  ResolvedRCAConfig,
  FailureEvent,
  FailurePattern,
  PatternType,
  PatternAttribute,
  RootCauseAnalysis,
  RootCause,
  CauseCategory,
  Evidence,
  ContributingFactor,
  TimelineEvent,
  Remediation,
  RemediationType,
  RemediationStep,
  RCAReport,
} from "./types.js";

import type {
  RCAConfig,
  ResolvedRCAConfig,
  FailureEvent,
  FailurePattern,
  PatternType,
  RootCauseAnalysis,
  RootCause,
  Remediation,
  RCAReport,
} from "./types.js";

// ============================================================================
// Root Cause Analysis Engine (Facade)
// ============================================================================

/**
 * Root Cause Analyzer - Facade for failure analysis components.
 *
 * Provides a unified API for:
 * - Recording and querying failure events
 * - Detecting patterns in failure data
 * - Analyzing root causes of patterns
 * - Suggesting and managing remediations
 * - Generating comprehensive reports
 */
export class RootCauseAnalyzer {
  private readonly config: ResolvedRCAConfig;
  private events: FailureEvent[] = [];
  private patterns: Map<string, FailurePattern> = new Map();
  private analyses: Map<string, RootCauseAnalysis> = new Map();
  private remediations: Map<string, Remediation> = new Map();
  private eventClusters: Map<string, string[]> = new Map();

  // Delegate components
  private patternDetector!: PatternDetector;
  private rootCauseEngine!: RootCauseEngine;
  private remediationEngine!: RemediationEngine;

  constructor(config: RCAConfig) {
    this.config = {
      enabled: config.enabled,
      minSamplesForPattern: config.minSamplesForPattern ?? 5,
      similarityThreshold: config.similarityThreshold ?? 0.7,
      maxEventAge: config.maxEventAge ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      autoSuggestRemediation: config.autoSuggestRemediation ?? true,
      onPatternDetected: config.onPatternDetected,
      onRootCauseIdentified: config.onRootCauseIdentified,
    };
    this.initializeComponents();
  }

  private initializeComponents(): void {
    // Pass getter functions to components so they always get the current events array
    const getEvents = () => this.events;

    this.patternDetector = new PatternDetector(
      this.config,
      getEvents,
      this.patterns,
      this.eventClusters,
    );
    this.rootCauseEngine = new RootCauseEngine(
      this.config,
      getEvents,
      this.patterns,
      this.eventClusters,
    );
    this.remediationEngine = new RemediationEngine(this.config, this.patterns);
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): RCAConfig {
    return { ...this.config };
  }

  // =========================================================================
  // Event Recording
  // =========================================================================

  /**
   * Record a failure event
   */
  recordFailure(event: Omit<FailureEvent, "id" | "timestamp">): FailureEvent {
    const fullEvent: FailureEvent = {
      ...event,
      id: generateEventId(),
      timestamp: now(),
    };

    this.events.push(fullEvent);
    this.pruneOldEvents();

    // Analyze new event for pattern matching
    this.patternDetector.analyzeNewEvent(fullEvent);

    return fullEvent;
  }

  /**
   * Bulk import failure events
   */
  importEvents(events: FailureEvent[]): void {
    this.events.push(...events);
    this.pruneOldEvents();
    this.detectPatterns(); // Re-analyze all patterns
  }

  /**
   * Get event by ID
   */
  getEvent(id: string): FailureEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  /**
   * List recent events with optional filtering
   */
  listEvents(options?: {
    limit?: number;
    featureId?: string;
    errorType?: string;
    startTime?: number;
    endTime?: number;
  }): FailureEvent[] {
    let filtered = [...this.events];

    if (options?.featureId) {
      filtered = filtered.filter((e) => e.featureId === options.featureId);
    }

    if (options?.errorType) {
      filtered = filtered.filter((e) => e.errorType === options.errorType);
    }

    if (options?.startTime) {
      filtered = filtered.filter((e) => e.timestamp >= options.startTime!);
    }

    if (options?.endTime) {
      filtered = filtered.filter((e) => e.timestamp <= options.endTime!);
    }

    filtered.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  // =========================================================================
  // Pattern Detection (delegated to PatternDetector)
  // =========================================================================

  /**
   * Detect patterns in failure events
   */
  detectPatterns(): FailurePattern[] {
    return this.patternDetector.detectPatterns();
  }

  /**
   * Get pattern by ID
   */
  getPattern(id: string): FailurePattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * List all patterns with optional filtering
   */
  listPatterns(options?: {
    type?: PatternType;
    severity?: FailurePattern["severity"];
    isActive?: boolean;
  }): FailurePattern[] {
    let patterns = Array.from(this.patterns.values());

    if (options?.type) {
      patterns = patterns.filter((p) => p.type === options.type);
    }

    if (options?.severity) {
      patterns = patterns.filter((p) => p.severity === options.severity);
    }

    if (options?.isActive !== undefined) {
      patterns = patterns.filter((p) => p.isActive === options.isActive);
    }

    return patterns.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  }

  /**
   * Calculate similarity between two events
   */
  calculateSimilarity(a: FailureEvent, b: FailureEvent): number {
    return this.patternDetector.calculateSimilarity(a, b);
  }

  // =========================================================================
  // Root Cause Analysis (delegated to RootCauseEngine)
  // =========================================================================

  /**
   * Analyze root cause for a pattern
   */
  analyzeRootCause(patternId: string): RootCauseAnalysis | null {
    const analysis = this.rootCauseEngine.analyzeRootCause(patternId);

    if (analysis) {
      this.analyses.set(analysis.id, analysis);

      // Auto-suggest remediations
      if (this.config.autoSuggestRemediation) {
        const remediations =
          this.remediationEngine.suggestRemediations(analysis);
        for (const r of remediations) {
          this.remediations.set(r.id, r);
        }
      }
    }

    return analysis;
  }

  /**
   * Get analysis by ID
   */
  getAnalysis(id: string): RootCauseAnalysis | undefined {
    return this.analyses.get(id) ?? this.rootCauseEngine.getAnalysis(id);
  }

  /**
   * Get analysis for a pattern
   */
  getAnalysisForPattern(patternId: string): RootCauseAnalysis | undefined {
    for (const analysis of this.analyses.values()) {
      if (analysis.patternId === patternId) {
        return analysis;
      }
    }
    return undefined;
  }

  // =========================================================================
  // Remediation (delegated to RemediationEngine)
  // =========================================================================

  /**
   * Get suggested remediations
   */
  getRemediations(options?: {
    patternId?: string;
    status?: Remediation["status"];
    priority?: Remediation["priority"];
  }): Remediation[] {
    let remediations = Array.from(this.remediations.values());

    if (options?.patternId) {
      remediations = remediations.filter(
        (r) => r.patternId === options.patternId,
      );
    }

    if (options?.status) {
      remediations = remediations.filter((r) => r.status === options.status);
    }

    if (options?.priority) {
      remediations = remediations.filter(
        (r) => r.priority === options.priority,
      );
    }

    return remediations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Update remediation status
   */
  updateRemediationStatus(id: string, status: Remediation["status"]): boolean {
    const remediation = this.remediations.get(id);
    if (!remediation) return false;
    remediation.status = status;
    return true;
  }

  /**
   * Execute automated remediation
   */
  executeRemediation(id: string): { success: boolean; message: string } {
    const remediation = this.remediations.get(id);
    if (!remediation) {
      return { success: false, message: "Remediation not found" };
    }

    if (!remediation.canAutomate) {
      return {
        success: false,
        message: "This remediation cannot be automated",
      };
    }

    // In a real implementation, this would execute the remediation steps
    // For now, we just mark it as completed
    remediation.status = "completed";

    return {
      success: true,
      message: `Remediation "${remediation.title}" executed successfully`,
    };
  }

  // =========================================================================
  // Reporting
  // =========================================================================

  /**
   * Generate RCA report
   */
  generateReport(startTime?: number, endTime?: number): RCAReport {
    const end = endTime ?? now();
    const start = startTime ?? end - 7 * 24 * 60 * 60 * 1000;

    // Re-detect patterns for the period
    this.detectPatterns();

    const activePatterns = this.listPatterns({ isActive: true });
    const topPatterns = activePatterns.slice(0, 5);

    // Analyze top patterns
    const activeRootCauses: RootCause[] = [];
    for (const pattern of topPatterns) {
      const analysis = this.analyzeRootCause(pattern.id);
      if (analysis && analysis.rootCauses.length > 0) {
        activeRootCauses.push(analysis.rootCauses[0]);
      }
    }

    const remediations = this.getRemediations({ status: "suggested" });
    const periodEvents = this.events.filter(
      (e) => e.timestamp >= start && e.timestamp <= end,
    );

    // Use report generator for metrics
    const reportGenerator = new RCAReportGenerator(
      this.events,
      this.patterns,
      this.analyses,
      this.remediations,
    );

    const baseReport = reportGenerator.generateReport(start, end);

    return {
      ...baseReport,
      topPatterns,
      activeRootCauses,
      recommendedActions: remediations.slice(0, 5),
      summary: {
        ...baseReport.summary,
        totalFailures: periodEvents.length,
        uniquePatterns: activePatterns.length,
        identifiedRootCauses: activeRootCauses.length,
        suggestedRemediations: remediations.length,
      },
    };
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private pruneOldEvents(): void {
    const cutoff = now() - this.config.maxEventAge;
    this.events = this.events.filter((e) => e.timestamp >= cutoff);
  }
}
