/**
 * AgentOps SDK - Advanced A/B Testing
 *
 * Enhanced experimentation framework with Bayesian analysis,
 * multi-armed bandits, and automatic winner selection.
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

// ============================================================================
// Types
// ============================================================================

export interface AdvancedExperimentConfig {
  /** Experiment name */
  name: string;
  /** Optional description */
  description?: string;
  /** Variants to test */
  variants: VariantConfig[];
  /** Primary metric to optimize */
  primaryMetric: MetricType;
  /** Custom metric name (if primaryMetric is 'custom') */
  customMetricName?: string;
  /** Minimum sample size per variant before analysis */
  minSampleSize?: number;
  /** Statistical significance threshold (default: 0.95) */
  significanceThreshold?: number;
  /** Minimum detectable effect size (default: 0.05 = 5%) */
  minimumDetectableEffect?: number;
  /** Statistical power target (default: 0.8) */
  statisticalPower?: number;
  /** Whether to enable auto-winner selection */
  autoWinner?: boolean;
  /** Days to run before auto-completing (if autoWinner enabled) */
  maxRunDays?: number;
  /** Traffic allocation strategy */
  allocationStrategy?: "fixed" | "epsilon_greedy" | "thompson_sampling";
  /** Epsilon value for epsilon-greedy (default: 0.1) */
  epsilon?: number;
  /** Whether higher metric values are better (default: true) */
  higherIsBetter?: boolean;
}

export interface VariantConfig {
  name: string;
  promptTemplateId: string;
  trafficAllocation: number;
  isControl?: boolean;
}

export type MetricType =
  | "quality_score"
  | "latency"
  | "token_count"
  | "cost"
  | "custom";

export interface ExtendedVariantMetrics extends VariantMetrics {
  /** Minimum observed value */
  min: number;
  /** Maximum observed value */
  max: number;
  /** Median value */
  median: number;
  /** 95th percentile */
  p95: number;
  /** 99th percentile */
  p99: number;
  /** Bayesian posterior parameters */
  bayesian: {
    /** Beta distribution alpha parameter */
    alpha: number;
    /** Beta distribution beta parameter */
    beta: number;
    /** Probability of being best variant */
    probabilityOfBeingBest: number;
    /** Expected loss if choosing this variant */
    expectedLoss: number;
  };
  /** Sample rate metrics */
  samplesPerHour: number;
  /** Estimated time to significance */
  estimatedDaysToSignificance?: number;
}

export interface PowerAnalysis {
  /** Required sample size per variant */
  requiredSampleSize: number;
  /** Current statistical power */
  currentPower: number;
  /** Minimum detectable effect at current sample size */
  currentMDE: number;
  /** Estimated days to reach required sample */
  estimatedDaysToSignificance: number;
  /** Whether experiment is adequately powered */
  isAdequatelyPowered: boolean;
}

export interface BayesianAnalysis {
  /** Probability each variant is the best */
  probabilitiesOfBeingBest: Record<string, number>;
  /** Expected loss for choosing each variant */
  expectedLosses: Record<string, number>;
  /** Recommended action based on Bayesian analysis */
  recommendation: "continue" | "stop_winner" | "stop_no_difference";
  /** Confidence in recommendation */
  confidence: number;
}

export interface ExtendedExperimentResults extends ExperimentResults {
  /** Power analysis results */
  powerAnalysis: PowerAnalysis;
  /** Bayesian analysis results */
  bayesianAnalysis: BayesianAnalysis;
  /** Sequential analysis results (for early stopping) */
  sequentialAnalysis: {
    /** Whether to stop for efficacy */
    stopForEfficacy: boolean;
    /** Whether to stop for futility */
    stopForFutility: boolean;
    /** Current efficacy boundary */
    efficacyBoundary: number;
    /** Current futility boundary */
    futilityBoundary: number;
  };
  /** Summary statistics */
  summary: {
    totalSamples: number;
    experimentDurationHours: number;
    isStatisticallySignificant: boolean;
    isPracticallySignificant: boolean;
    recommendedAction: string;
  };
}

interface DetailedMetricSample {
  variantId: string;
  value: number;
  timestamp: number;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Advanced Experiment Manager
// ============================================================================

export class AdvancedExperimentManager {
  private experiments: Map<string, PromptExperiment> = new Map();
  private samples: Map<string, DetailedMetricSample[]> = new Map();
  private userAssignments: Map<string, Map<string, string>> = new Map();
  private configs: Map<string, AdvancedExperimentConfig> = new Map();
  private bayesianPriors: Map<
    string,
    Map<string, { alpha: number; beta: number }>
  > = new Map();

  /**
   * Create a new advanced experiment
   */
  createExperiment(config: AdvancedExperimentConfig): PromptExperiment {
    const id = `exp_${nanoid(12)}`;

    // Normalize traffic allocations
    const totalAllocation = config.variants.reduce(
      (sum, v) => sum + v.trafficAllocation,
      0,
    );

    const experimentVariants: ExperimentVariant[] = config.variants.map(
      (v, i) => ({
        id: `var_${nanoid(8)}`,
        name: v.name,
        promptTemplateId: v.promptTemplateId,
        trafficAllocation: v.trafficAllocation / totalAllocation,
        isControl: v.isControl ?? i === 0,
      }),
    );

    const experiment: PromptExperiment = {
      id,
      name: config.name,
      description: config.description,
      variants: experimentVariants,
      status: "draft",
      primaryMetric: config.primaryMetric,
      customMetricName: config.customMetricName,
      minSampleSize: config.minSampleSize ?? 100,
      significanceThreshold: config.significanceThreshold ?? 0.95,
      createdAt: now(),
    };

    this.experiments.set(id, experiment);
    this.samples.set(id, []);
    this.userAssignments.set(id, new Map());
    this.configs.set(id, config);

    // Initialize Bayesian priors (uniform prior)
    const priors = new Map<string, { alpha: number; beta: number }>();
    for (const variant of experimentVariants) {
      priors.set(variant.id, { alpha: 1, beta: 1 });
    }
    this.bayesianPriors.set(id, priors);

    return experiment;
  }

  /**
   * Get experiment by ID
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
   * Resume a paused experiment
   */
  resumeExperiment(id: string): PromptExperiment | null {
    const experiment = this.experiments.get(id);
    if (!experiment || experiment.status !== "paused") {
      return null;
    }

    experiment.status = "running";
    return experiment;
  }

  /**
   * Complete an experiment with optional winner
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
   * Get variant assignment for a user using configured strategy
   */
  getVariantForUser(
    experimentId: string,
    userId: string,
    options?: { forceReassign?: boolean },
  ): ExperimentVariant | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== "running") {
      return null;
    }

    const config = this.configs.get(experimentId);
    const assignments = this.userAssignments.get(experimentId)!;

    // Check existing assignment
    if (!options?.forceReassign) {
      const existingVariantId = assignments.get(userId);
      if (existingVariantId) {
        return (
          experiment.variants.find((v) => v.id === existingVariantId) ?? null
        );
      }
    }

    // Assign based on strategy
    let variant: ExperimentVariant;

    switch (config?.allocationStrategy) {
      case "epsilon_greedy":
        variant = this.epsilonGreedyAssignment(experiment, config);
        break;
      case "thompson_sampling":
        variant = this.thompsonSamplingAssignment(experimentId, experiment);
        break;
      default:
        variant = this.fixedAllocationAssignment(
          experiment,
          userId,
          experimentId,
        );
    }

    assignments.set(userId, variant.id);
    return variant;
  }

  /**
   * Record a metric sample
   */
  recordSample(
    experimentId: string,
    variantId: string,
    value: number,
    options?: {
      userId?: string;
      sessionId?: string;
      metadata?: Record<string, unknown>;
    },
  ): void {
    const samples = this.samples.get(experimentId);
    if (!samples) return;

    const sample: DetailedMetricSample = {
      variantId,
      value,
      timestamp: now(),
      userId: options?.userId,
      sessionId: options?.sessionId,
      metadata: options?.metadata,
    };

    samples.push(sample);

    // Update Bayesian priors
    this.updateBayesianPriors(experimentId, variantId, value);

    // Check for auto-completion
    this.checkAutoCompletion(experimentId);
  }

  /**
   * Record a binary outcome (success/failure)
   */
  recordOutcome(
    experimentId: string,
    variantId: string,
    success: boolean,
    options?: {
      userId?: string;
      sessionId?: string;
    },
  ): void {
    this.recordSample(experimentId, variantId, success ? 1 : 0, options);
  }

  /**
   * Get extended metrics for all variants
   */
  getExtendedMetrics(experimentId: string): ExtendedVariantMetrics[] {
    const experiment = this.experiments.get(experimentId);
    const allSamples = this.samples.get(experimentId);
    const priors = this.bayesianPriors.get(experimentId);
    if (!experiment || !allSamples) {
      return [];
    }

    const metrics: ExtendedVariantMetrics[] = [];
    const hourMs = 60 * 60 * 1000;
    const experimentStarted = experiment.startedAt ?? experiment.createdAt;

    // Calculate probability of being best for each variant
    const probabilities = this.calculateProbabilitiesOfBeingBest(experimentId);

    for (const variant of experiment.variants) {
      const variantSamples = allSamples.filter(
        (s) => s.variantId === variant.id,
      );
      const values = variantSamples.map((s) => s.value);

      if (values.length === 0) {
        metrics.push(this.createEmptyMetrics(variant.id));
        continue;
      }

      const sorted = [...values].sort((a, b) => a - b);
      const mean = this.mean(values);
      const stdDev = this.stdDev(values, mean);
      const ci = this.confidenceInterval(mean, stdDev, values.length);

      // Calculate samples per hour
      const hoursElapsed = (now() - experimentStarted) / hourMs;
      const samplesPerHour =
        hoursElapsed > 0 ? values.length / hoursElapsed : 0;

      // Get Bayesian parameters
      const prior = priors?.get(variant.id) ?? { alpha: 1, beta: 1 };
      const probOfBest = probabilities[variant.id] ?? 0;
      const expectedLoss = this.calculateExpectedLoss(experimentId, variant.id);

      // Estimate days to significance
      const config = this.configs.get(experimentId);
      const requiredSamples = config?.minSampleSize ?? 100;
      const remainingSamples = Math.max(0, requiredSamples - values.length);
      const daysToSignificance =
        samplesPerHour > 0 ? remainingSamples / samplesPerHour / 24 : undefined;

      metrics.push({
        variantId: variant.id,
        sampleSize: values.length,
        mean,
        stdDev,
        confidenceInterval: ci,
        metricBreakdown: {},
        min: sorted[0],
        max: sorted[sorted.length - 1],
        median: this.percentile(sorted, 50),
        p95: this.percentile(sorted, 95),
        p99: this.percentile(sorted, 99),
        bayesian: {
          alpha: prior.alpha,
          beta: prior.beta,
          probabilityOfBeingBest: probOfBest,
          expectedLoss,
        },
        samplesPerHour,
        estimatedDaysToSignificance: daysToSignificance,
      });
    }

    return metrics;
  }

  /**
   * Perform comprehensive analysis
   */
  analyzeResults(experimentId: string): ExtendedExperimentResults | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      return null;
    }

    const config = this.configs.get(experimentId);
    const variantMetrics = this.getExtendedMetrics(experimentId);
    const comparisons = this.performStatisticalTests(
      experiment,
      variantMetrics,
    );

    // Find control variant
    const control = experiment.variants.find((v) => v.isControl);
    const controlMetrics = variantMetrics.find(
      (m) => m.variantId === control?.id,
    );

    // Determine winner using both frequentist and Bayesian approaches
    let recommendedWinner: string | undefined;
    let improvementPercent: number | undefined;
    let isSignificant = false;

    // Bayesian analysis
    const bayesianAnalysis = this.performBayesianAnalysis(experimentId);

    // Power analysis
    const powerAnalysis = this.performPowerAnalysis(experimentId);

    // Sequential analysis for early stopping
    const sequentialAnalysis = this.performSequentialAnalysis(experimentId);

    // Determine winner
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
      } else if (bayesianAnalysis.recommendation === "stop_winner") {
        // Use Bayesian winner if frequentist isn't significant
        const bestProb = Math.max(
          ...Object.values(bayesianAnalysis.probabilitiesOfBeingBest),
        );
        recommendedWinner = Object.entries(
          bayesianAnalysis.probabilitiesOfBeingBest,
        ).find(([, p]) => p === bestProb)?.[0];

        if (recommendedWinner && controlMetrics) {
          const winnerMetrics = variantMetrics.find(
            (m) => m.variantId === recommendedWinner,
          );
          if (winnerMetrics && controlMetrics.mean !== 0) {
            improvementPercent =
              ((winnerMetrics.mean - controlMetrics.mean) /
                controlMetrics.mean) *
              100;
          }
        }
      }
    }

    // Determine practical significance
    const mde = config?.minimumDetectableEffect ?? 0.05;
    const isPracticallySignificant =
      improvementPercent !== undefined &&
      Math.abs(improvementPercent) >= mde * 100;

    // Generate summary
    const totalSamples = variantMetrics.reduce(
      (sum, m) => sum + m.sampleSize,
      0,
    );
    const experimentStarted = experiment.startedAt ?? experiment.createdAt;
    const experimentDurationHours =
      (now() - experimentStarted) / (60 * 60 * 1000);

    let recommendedAction: string;
    if (sequentialAnalysis.stopForEfficacy) {
      recommendedAction = `Stop experiment - Clear winner: ${recommendedWinner}`;
    } else if (sequentialAnalysis.stopForFutility) {
      recommendedAction = "Stop experiment - No meaningful difference detected";
    } else if (!powerAnalysis.isAdequatelyPowered) {
      recommendedAction = `Continue - Need ${Math.ceil(powerAnalysis.estimatedDaysToSignificance)} more days for adequate power`;
    } else if (isSignificant && isPracticallySignificant) {
      recommendedAction = `Declare winner: ${recommendedWinner} (+${improvementPercent?.toFixed(1)}%)`;
    } else {
      recommendedAction = "Continue collecting data";
    }

    return {
      experimentId,
      variantMetrics,
      comparisons,
      isSignificant,
      recommendedWinner,
      improvementPercent,
      analyzedAt: now(),
      powerAnalysis,
      bayesianAnalysis,
      sequentialAnalysis,
      summary: {
        totalSamples,
        experimentDurationHours,
        isStatisticallySignificant: isSignificant,
        isPracticallySignificant,
        recommendedAction,
      },
    };
  }

  /**
   * Perform power analysis
   */
  performPowerAnalysis(experimentId: string): PowerAnalysis {
    const config = this.configs.get(experimentId);
    const metrics = this.getExtendedMetrics(experimentId);

    const mde = config?.minimumDetectableEffect ?? 0.05;
    const targetPower = config?.statisticalPower ?? 0.8;
    const alpha = 1 - (config?.significanceThreshold ?? 0.95);

    // Calculate pooled standard deviation
    const pooledStdDev = this.calculatePooledStdDev(metrics);

    // Effect size (Cohen's d)
    const effectSize = mde / (pooledStdDev || 1);

    // Required sample size per group (using normal approximation)
    const zAlpha = this.zScore(1 - alpha / 2);
    const zBeta = this.zScore(targetPower);
    const requiredSampleSize = Math.ceil(
      2 * Math.pow((zAlpha + zBeta) / effectSize, 2),
    );

    // Current sample sizes
    const currentSamples = metrics.map((m) => m.sampleSize);
    const minSamples = Math.min(...currentSamples);
    // Note: maxSamples could be used for imbalanced experiment detection

    // Current power (simplified calculation)
    const currentPower = this.calculatePower(minSamples, effectSize, alpha);

    // Current MDE
    const currentMDE =
      (pooledStdDev * (zAlpha + zBeta)) / Math.sqrt(minSamples / 2);

    // Estimate days to significance
    const avgSamplesPerHour =
      metrics.reduce((sum, m) => sum + m.samplesPerHour, 0) / metrics.length;
    const remainingSamples = Math.max(0, requiredSampleSize - minSamples);
    const estimatedDaysToSignificance =
      avgSamplesPerHour > 0 ? remainingSamples / avgSamplesPerHour / 24 : 999;

    return {
      requiredSampleSize,
      currentPower,
      currentMDE,
      estimatedDaysToSignificance,
      isAdequatelyPowered: currentPower >= targetPower,
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

  /**
   * Delete an experiment
   */
  deleteExperiment(id: string): boolean {
    this.experiments.delete(id);
    this.samples.delete(id);
    this.userAssignments.delete(id);
    this.configs.delete(id);
    this.bayesianPriors.delete(id);
    return true;
  }

  /**
   * Get raw samples for an experiment
   */
  getSamples(experimentId: string, variantId?: string): DetailedMetricSample[] {
    const samples = this.samples.get(experimentId) ?? [];
    if (variantId) {
      return samples.filter((s) => s.variantId === variantId);
    }
    return samples;
  }

  // =========================================================================
  // Private Methods - Allocation Strategies
  // =========================================================================

  private fixedAllocationAssignment(
    experiment: PromptExperiment,
    userId: string,
    experimentId: string,
  ): ExperimentVariant {
    const random = this.hashUserId(userId, experimentId);
    let cumulative = 0;

    for (const variant of experiment.variants) {
      cumulative += variant.trafficAllocation;
      if (random < cumulative) {
        return variant;
      }
    }

    return experiment.variants[experiment.variants.length - 1];
  }

  private epsilonGreedyAssignment(
    experiment: PromptExperiment,
    config: AdvancedExperimentConfig,
  ): ExperimentVariant {
    const epsilon = config.epsilon ?? 0.1;

    // With probability epsilon, explore (random assignment)
    if (Math.random() < epsilon) {
      const randomIndex = Math.floor(
        Math.random() * experiment.variants.length,
      );
      return experiment.variants[randomIndex];
    }

    // Otherwise, exploit (best performing variant)
    const metrics = this.getExtendedMetrics(experiment.id);
    const higherIsBetter = config.higherIsBetter ?? true;

    let bestVariant = experiment.variants[0];
    let bestMean = higherIsBetter ? -Infinity : Infinity;

    for (const metric of metrics) {
      const isBetter = higherIsBetter
        ? metric.mean > bestMean
        : metric.mean < bestMean;

      if (isBetter) {
        bestMean = metric.mean;
        bestVariant =
          experiment.variants.find((v) => v.id === metric.variantId) ??
          bestVariant;
      }
    }

    return bestVariant;
  }

  private thompsonSamplingAssignment(
    experimentId: string,
    experiment: PromptExperiment,
  ): ExperimentVariant {
    const priors = this.bayesianPriors.get(experimentId);
    if (!priors) {
      return experiment.variants[0];
    }

    // Sample from each variant's posterior and pick the highest
    let bestVariant = experiment.variants[0];
    let bestSample = -Infinity;

    for (const variant of experiment.variants) {
      const prior = priors.get(variant.id) ?? { alpha: 1, beta: 1 };
      const sample = this.sampleBeta(prior.alpha, prior.beta);

      if (sample > bestSample) {
        bestSample = sample;
        bestVariant = variant;
      }
    }

    return bestVariant;
  }

  // =========================================================================
  // Private Methods - Statistical Analysis
  // =========================================================================

  private performStatisticalTests(
    experiment: PromptExperiment,
    metrics: ExtendedVariantMetrics[],
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

  private performBayesianAnalysis(experimentId: string): BayesianAnalysis {
    const probabilities = this.calculateProbabilitiesOfBeingBest(experimentId);
    const expectedLosses: Record<string, number> = {};

    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      return {
        probabilitiesOfBeingBest: {},
        expectedLosses: {},
        recommendation: "continue",
        confidence: 0,
      };
    }

    for (const variant of experiment.variants) {
      expectedLosses[variant.id] = this.calculateExpectedLoss(
        experimentId,
        variant.id,
      );
    }

    // Determine recommendation
    const maxProb = Math.max(...Object.values(probabilities));
    const minLoss = Math.min(...Object.values(expectedLosses));

    let recommendation: BayesianAnalysis["recommendation"];
    let confidence: number;

    if (maxProb > 0.95) {
      recommendation = "stop_winner";
      confidence = maxProb;
    } else if (minLoss < 0.001) {
      recommendation = "stop_no_difference";
      confidence = 1 - minLoss;
    } else {
      recommendation = "continue";
      confidence = 1 - maxProb;
    }

    return {
      probabilitiesOfBeingBest: probabilities,
      expectedLosses,
      recommendation,
      confidence,
    };
  }

  private performSequentialAnalysis(experimentId: string): {
    stopForEfficacy: boolean;
    stopForFutility: boolean;
    efficacyBoundary: number;
    futilityBoundary: number;
  } {
    const experiment = this.experiments.get(experimentId);
    const config = this.configs.get(experimentId);
    if (!experiment || !config) {
      return {
        stopForEfficacy: false,
        stopForFutility: false,
        efficacyBoundary: 0.001,
        futilityBoundary: 0.2,
      };
    }

    const metrics = this.getExtendedMetrics(experimentId);
    const totalSamples = metrics.reduce((sum, m) => sum + m.sampleSize, 0);
    const requiredSamples =
      (config.minSampleSize ?? 100) * experiment.variants.length;
    const informationFraction = Math.min(1, totalSamples / requiredSamples);

    // O'Brien-Fleming boundaries (simplified)
    const alpha = 1 - (config.significanceThreshold ?? 0.95);
    const efficacyBoundary = alpha / Math.pow(informationFraction, 0.5);
    const futilityBoundary = 0.2 + 0.3 * (1 - informationFraction);

    // Check current p-values
    const comparisons = this.performStatisticalTests(experiment, metrics);
    const minPValue =
      comparisons.length > 0
        ? Math.min(...comparisons.map((c) => c.pValue))
        : 1;

    // Check Bayesian probability
    const bayesian = this.performBayesianAnalysis(experimentId);
    const maxProb = Math.max(
      ...Object.values(bayesian.probabilitiesOfBeingBest),
    );

    const stopForEfficacy = minPValue < efficacyBoundary || maxProb > 0.99;
    const stopForFutility =
      informationFraction > 0.5 &&
      maxProb < 1 / experiment.variants.length + 0.1;

    return {
      stopForEfficacy,
      stopForFutility,
      efficacyBoundary,
      futilityBoundary,
    };
  }

  private updateBayesianPriors(
    experimentId: string,
    variantId: string,
    value: number,
  ): void {
    const priors = this.bayesianPriors.get(experimentId);
    if (!priors) return;

    const prior = priors.get(variantId);
    if (!prior) return;

    // For binary outcomes (0 or 1), update Beta distribution
    // For continuous outcomes, we approximate with scaled values
    const normalizedValue = Math.min(1, Math.max(0, value));

    if (normalizedValue >= 0.5) {
      prior.alpha += normalizedValue;
    } else {
      prior.beta += 1 - normalizedValue;
    }
  }

  private calculateProbabilitiesOfBeingBest(
    experimentId: string,
  ): Record<string, number> {
    const experiment = this.experiments.get(experimentId);
    const priors = this.bayesianPriors.get(experimentId);
    if (!experiment || !priors) {
      return {};
    }

    const numSimulations = 10000;
    const winCounts: Record<string, number> = {};

    for (const variant of experiment.variants) {
      winCounts[variant.id] = 0;
    }

    // Monte Carlo simulation
    for (let i = 0; i < numSimulations; i++) {
      let bestVariantId = "";
      let bestSample = -Infinity;

      for (const variant of experiment.variants) {
        const prior = priors.get(variant.id) ?? { alpha: 1, beta: 1 };
        const sample = this.sampleBeta(prior.alpha, prior.beta);

        if (sample > bestSample) {
          bestSample = sample;
          bestVariantId = variant.id;
        }
      }

      if (bestVariantId) {
        winCounts[bestVariantId]++;
      }
    }

    const probabilities: Record<string, number> = {};
    for (const [variantId, count] of Object.entries(winCounts)) {
      probabilities[variantId] = count / numSimulations;
    }

    return probabilities;
  }

  private calculateExpectedLoss(
    experimentId: string,
    variantId: string,
  ): number {
    const priors = this.bayesianPriors.get(experimentId);
    const experiment = this.experiments.get(experimentId);
    if (!priors || !experiment) return 0;

    const numSimulations = 10000;
    let totalLoss = 0;

    const variantPrior = priors.get(variantId) ?? { alpha: 1, beta: 1 };

    for (let i = 0; i < numSimulations; i++) {
      const variantSample = this.sampleBeta(
        variantPrior.alpha,
        variantPrior.beta,
      );
      let maxOtherSample = 0;

      for (const variant of experiment.variants) {
        if (variant.id === variantId) continue;
        const prior = priors.get(variant.id) ?? { alpha: 1, beta: 1 };
        const sample = this.sampleBeta(prior.alpha, prior.beta);
        maxOtherSample = Math.max(maxOtherSample, sample);
      }

      totalLoss += Math.max(0, maxOtherSample - variantSample);
    }

    return totalLoss / numSimulations;
  }

  private checkAutoCompletion(experimentId: string): void {
    const config = this.configs.get(experimentId);
    const experiment = this.experiments.get(experimentId);
    if (!config?.autoWinner || !experiment || experiment.status !== "running") {
      return;
    }

    // Check max run days
    if (config.maxRunDays && experiment.startedAt) {
      const daysSinceStart =
        (now() - experiment.startedAt) / (24 * 60 * 60 * 1000);
      if (daysSinceStart >= config.maxRunDays) {
        const results = this.analyzeResults(experimentId);
        this.completeExperiment(experimentId, results?.recommendedWinner);
        return;
      }
    }

    // Check for early stopping
    const sequential = this.performSequentialAnalysis(experimentId);
    if (sequential.stopForEfficacy || sequential.stopForFutility) {
      const results = this.analyzeResults(experimentId);
      this.completeExperiment(experimentId, results?.recommendedWinner);
    }
  }

  // =========================================================================
  // Private Methods - Math Utilities
  // =========================================================================

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private stdDev(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(
      squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1),
    );
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = (p / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedValues[lower];
    return (
      sortedValues[lower] +
      (sortedValues[upper] - sortedValues[lower]) * (index - lower)
    );
  }

  private confidenceInterval(
    mean: number,
    stdDev: number,
    n: number,
  ): [number, number] {
    if (n < 2) return [mean, mean];
    const z = 1.96;
    const margin = z * (stdDev / Math.sqrt(n));
    return [mean - margin, mean + margin];
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

  private zScore(p: number): number {
    // Approximation of inverse normal CDF
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    const a1 = -3.969683028665376e1;
    const a2 = 2.209460984245205e2;
    const a3 = -2.759285104469687e2;
    const a4 = 1.38357751867269e2;
    const a5 = -3.066479806614716e1;
    const a6 = 2.506628277459239;

    const b1 = -5.447609879822406e1;
    const b2 = 1.615858368580409e2;
    const b3 = -1.556989798598866e2;
    const b4 = 6.680131188771972e1;
    const b5 = -1.328068155288572e1;

    const c1 = -7.784894002430293e-3;
    const c2 = -3.223964580411365e-1;
    const c3 = -2.400758277161838;
    const c4 = -2.549732539343734;
    const c5 = 4.374664141464968;
    const c6 = 2.938163982698783;

    const d1 = 7.784695709041462e-3;
    const d2 = 3.224671290700398e-1;
    const d3 = 2.445134137142996;
    const d4 = 3.754408661907416;

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    let q: number, r: number;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (
        (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
        ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
      );
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (
        ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
        (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
      );
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return (
        -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
        ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
      );
    }
  }

  private calculatePooledStdDev(metrics: ExtendedVariantMetrics[]): number {
    let totalVariance = 0;
    let totalDf = 0;

    for (const m of metrics) {
      if (m.sampleSize > 1) {
        totalVariance += (m.sampleSize - 1) * m.stdDev * m.stdDev;
        totalDf += m.sampleSize - 1;
      }
    }

    return totalDf > 0 ? Math.sqrt(totalVariance / totalDf) : 1;
  }

  private calculatePower(
    sampleSize: number,
    effectSize: number,
    alpha: number,
  ): number {
    const zAlpha = this.zScore(1 - alpha / 2);
    const zBeta = effectSize * Math.sqrt(sampleSize / 2) - zAlpha;
    return this.normalCDF(zBeta);
  }

  private sampleBeta(alpha: number, beta: number): number {
    // Simplified Beta sampling using the ratio of Gamma samples
    const gammaAlpha = this.sampleGamma(alpha);
    const gammaBeta = this.sampleGamma(beta);
    return gammaAlpha / (gammaAlpha + gammaBeta);
  }

  private sampleGamma(shape: number): number {
    // Marsaglia and Tsang's method
    if (shape < 1) {
      return this.sampleGamma(1 + shape) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number, v: number;
      do {
        x = this.sampleNormal();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  private sampleNormal(): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private hashUserId(userId: string, experimentId: string): number {
    const str = `${userId}:${experimentId}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash % 1000) / 1000;
  }

  private createEmptyMetrics(variantId: string): ExtendedVariantMetrics {
    return {
      variantId,
      sampleSize: 0,
      mean: 0,
      stdDev: 0,
      confidenceInterval: [0, 0],
      metricBreakdown: {},
      min: 0,
      max: 0,
      median: 0,
      p95: 0,
      p99: 0,
      bayesian: {
        alpha: 1,
        beta: 1,
        probabilityOfBeingBest: 0,
        expectedLoss: 0,
      },
      samplesPerHour: 0,
    };
  }
}
