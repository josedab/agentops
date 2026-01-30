/**
 * AgentOps SDK - Experiment Manager
 *
 * A/B testing framework for prompt optimization.
 */

import type {
  PromptExperiment,
  ExperimentVariant,
  VariantMetrics,
  ExperimentResults,
  VariantComparison,
} from "./types.js";
import { now } from "../utils.js";
import { nanoid } from "nanoid";

interface MetricSample {
  variantId: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export class ExperimentManager {
  private experiments: Map<string, PromptExperiment> = new Map();
  private samples: Map<string, MetricSample[]> = new Map();
  private userAssignments: Map<string, Map<string, string>> = new Map();

  /**
   * Create a new experiment
   */
  createExperiment(
    name: string,
    variants: Array<{
      name: string;
      promptTemplateId: string;
      trafficAllocation: number;
      isControl?: boolean;
    }>,
    options?: {
      description?: string;
      primaryMetric?: PromptExperiment["primaryMetric"];
      customMetricName?: string;
      minSampleSize?: number;
      significanceThreshold?: number;
    },
  ): PromptExperiment {
    const id = `exp_${nanoid(12)}`;

    // Normalize traffic allocations
    const totalAllocation = variants.reduce(
      (sum, v) => sum + v.trafficAllocation,
      0,
    );

    const experimentVariants: ExperimentVariant[] = variants.map((v, i) => ({
      id: `var_${nanoid(8)}`,
      name: v.name,
      promptTemplateId: v.promptTemplateId,
      trafficAllocation: v.trafficAllocation / totalAllocation,
      isControl: v.isControl ?? i === 0,
    }));

    const experiment: PromptExperiment = {
      id,
      name,
      description: options?.description,
      variants: experimentVariants,
      status: "draft",
      primaryMetric: options?.primaryMetric ?? "quality_score",
      customMetricName: options?.customMetricName,
      minSampleSize: options?.minSampleSize ?? 100,
      significanceThreshold: options?.significanceThreshold ?? 0.95,
      createdAt: now(),
    };

    this.experiments.set(id, experiment);
    this.samples.set(id, []);
    this.userAssignments.set(id, new Map());

    return experiment;
  }

  /**
   * Get an experiment by ID
   */
  getExperiment(id: string): PromptExperiment | undefined {
    return this.experiments.get(id);
  }

  /**
   * Start an experiment
   */
  startExperiment(id: string): PromptExperiment | null {
    const experiment = this.experiments.get(id);
    if (!experiment || experiment.status !== "draft") {
      return null;
    }

    experiment.status = "running";
    experiment.startedAt = now();
    return experiment;
  }

  /**
   * Pause an experiment
   */
  pauseExperiment(id: string): PromptExperiment | null {
    const experiment = this.experiments.get(id);
    if (!experiment || experiment.status !== "running") {
      return null;
    }

    experiment.status = "paused";
    return experiment;
  }

  /**
   * Complete an experiment
   */
  completeExperiment(
    id: string,
    winnerVariantId?: string,
  ): PromptExperiment | null {
    const experiment = this.experiments.get(id);
    if (!experiment) {
      return null;
    }

    experiment.status = "completed";
    experiment.endedAt = now();

    if (winnerVariantId) {
      experiment.winnerVariantId = winnerVariantId;
    } else {
      // Auto-determine winner
      const results = this.analyzeResults(id);
      if (results?.recommendedWinner) {
        experiment.winnerVariantId = results.recommendedWinner;
      }
    }

    return experiment;
  }

  /**
   * Get variant assignment for a user
   */
  getVariantForUser(
    experimentId: string,
    userId: string,
  ): ExperimentVariant | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== "running") {
      return null;
    }

    const assignments = this.userAssignments.get(experimentId)!;

    // Check existing assignment
    const existingVariantId = assignments.get(userId);
    if (existingVariantId) {
      return (
        experiment.variants.find((v) => v.id === existingVariantId) ?? null
      );
    }

    // Assign based on traffic allocation
    const random = this.hashUserId(userId, experimentId);
    let cumulative = 0;

    for (const variant of experiment.variants) {
      cumulative += variant.trafficAllocation;
      if (random < cumulative) {
        assignments.set(userId, variant.id);
        return variant;
      }
    }

    // Fallback to last variant
    const lastVariant = experiment.variants[experiment.variants.length - 1];
    assignments.set(userId, lastVariant.id);
    return lastVariant;
  }

  /**
   * Record a metric sample for a variant
   */
  recordSample(
    experimentId: string,
    variantId: string,
    value: number,
    metadata?: Record<string, unknown>,
  ): void {
    const samples = this.samples.get(experimentId);
    if (!samples) return;

    samples.push({
      variantId,
      value,
      timestamp: now(),
      metadata,
    });
  }

  /**
   * Get metrics for all variants
   */
  getVariantMetrics(experimentId: string): VariantMetrics[] {
    const experiment = this.experiments.get(experimentId);
    const samples = this.samples.get(experimentId);
    if (!experiment || !samples) {
      return [];
    }

    return experiment.variants.map((variant) => {
      const variantSamples = samples.filter((s) => s.variantId === variant.id);
      const values = variantSamples.map((s) => s.value);

      const mean = this.calculateMean(values);
      const stdDev = this.calculateStdDev(values, mean);
      const confidenceInterval = this.calculateConfidenceInterval(
        mean,
        stdDev,
        values.length,
      );

      return {
        variantId: variant.id,
        sampleSize: values.length,
        mean,
        stdDev,
        confidenceInterval,
        metricBreakdown: {}, // Could be extended with more detailed metrics
      };
    });
  }

  /**
   * Analyze experiment results
   */
  analyzeResults(experimentId: string): ExperimentResults | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      return null;
    }

    const variantMetrics = this.getVariantMetrics(experimentId);
    const comparisons = this.performStatisticalTests(
      experiment,
      variantMetrics,
    );

    // Find control variant
    const control = experiment.variants.find((v) => v.isControl);
    const controlMetrics = variantMetrics.find(
      (m) => m.variantId === control?.id,
    );

    // Determine winner
    let recommendedWinner: string | undefined;
    let improvementPercent: number | undefined;
    let isSignificant = false;

    if (controlMetrics) {
      const significantImprovements = comparisons.filter(
        (c) => c.isSignificant && c.relativeImprovement > 0,
      );

      if (significantImprovements.length > 0) {
        const best = significantImprovements.reduce((a, b) =>
          a.relativeImprovement > b.relativeImprovement ? a : b,
        );
        recommendedWinner = best.treatmentId;
        improvementPercent = best.relativeImprovement * 100;
        isSignificant = true;
      }
    }

    return {
      experimentId,
      variantMetrics,
      comparisons,
      isSignificant,
      recommendedWinner,
      improvementPercent,
      analyzedAt: now(),
    };
  }

  /**
   * List all experiments
   */
  listExperiments(status?: PromptExperiment["status"]): PromptExperiment[] {
    let experiments = Array.from(this.experiments.values());

    if (status) {
      experiments = experiments.filter((e) => e.status === status);
    }

    return experiments;
  }

  private performStatisticalTests(
    experiment: PromptExperiment,
    metrics: VariantMetrics[],
  ): VariantComparison[] {
    const comparisons: VariantComparison[] = [];
    const control = experiment.variants.find((v) => v.isControl);

    if (!control) return comparisons;

    const controlMetrics = metrics.find((m) => m.variantId === control.id);
    if (!controlMetrics || controlMetrics.sampleSize < 2) return comparisons;

    for (const variant of experiment.variants) {
      if (variant.isControl) continue;

      const treatmentMetrics = metrics.find((m) => m.variantId === variant.id);
      if (!treatmentMetrics || treatmentMetrics.sampleSize < 2) continue;

      // Welch's t-test
      const { pValue } = this.welchTTest(
        controlMetrics.mean,
        controlMetrics.stdDev,
        controlMetrics.sampleSize,
        treatmentMetrics.mean,
        treatmentMetrics.stdDev,
        treatmentMetrics.sampleSize,
      );

      const effectSize = this.cohensD(
        controlMetrics.mean,
        treatmentMetrics.mean,
        controlMetrics.stdDev,
        treatmentMetrics.stdDev,
      );

      const relativeImprovement =
        controlMetrics.mean !== 0
          ? (treatmentMetrics.mean - controlMetrics.mean) / controlMetrics.mean
          : 0;

      comparisons.push({
        controlId: control.id,
        treatmentId: variant.id,
        pValue,
        effectSize,
        isSignificant: pValue < 1 - experiment.significanceThreshold,
        relativeImprovement,
      });
    }

    return comparisons;
  }

  private welchTTest(
    mean1: number,
    std1: number,
    n1: number,
    mean2: number,
    std2: number,
    n2: number,
  ): { tStat: number; pValue: number } {
    const var1 = std1 * std1;
    const var2 = std2 * std2;

    const tStat = (mean2 - mean1) / Math.sqrt(var1 / n1 + var2 / n2);

    // Approximate p-value using normal distribution for large samples
    const pValue = 2 * (1 - this.normalCDF(Math.abs(tStat)));

    return { tStat, pValue };
  }

  private cohensD(
    mean1: number,
    mean2: number,
    std1: number,
    std2: number,
  ): number {
    const pooledStd = Math.sqrt((std1 * std1 + std2 * std2) / 2);
    return pooledStd > 0 ? (mean2 - mean1) / pooledStd : 0;
  }

  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp((-x * x) / 2);
    const p =
      d *
      t *
      (0.3193815 +
        t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculateStdDev(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(
      squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1),
    );
  }

  private calculateConfidenceInterval(
    mean: number,
    stdDev: number,
    n: number,
  ): [number, number] {
    if (n < 2) return [mean, mean];
    const z = 1.96; // 95% confidence
    const margin = z * (stdDev / Math.sqrt(n));
    return [mean - margin, mean + margin];
  }

  private hashUserId(userId: string, experimentId: string): number {
    // Simple hash for deterministic assignment
    const str = `${userId}:${experimentId}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash % 1000) / 1000;
  }
}
