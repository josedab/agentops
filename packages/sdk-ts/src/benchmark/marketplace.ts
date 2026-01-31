/**
 * AgentOps SDK - Benchmark Marketplace
 *
 * Community-driven prompt benchmarks, evaluation datasets,
 * and quality rubrics with leaderboards.
 */

import { now, generateEventId } from "../utils.js";

// ============================================================================
// Types
// ============================================================================

export interface BenchmarkConfig {
  enabled: boolean;
  apiBaseUrl?: string;
  cacheResults?: boolean;
  cacheDuration?: number;
}

export interface Benchmark {
  id: string;
  name: string;
  description: string;
  category: BenchmarkCategory;
  author: BenchmarkAuthor;
  dataset: Dataset;
  evaluationCriteria: EvaluationCriterion[];
  stats: BenchmarkStats;
  tags: string[];
  visibility: "public" | "private" | "organization";
  createdAt: number;
  updatedAt: number;
}

export type BenchmarkCategory =
  | "reasoning"
  | "coding"
  | "creative"
  | "factual"
  | "conversation"
  | "tool_use"
  | "safety"
  | "custom";

export interface BenchmarkAuthor {
  id: string;
  name: string;
  organization?: string;
  verified: boolean;
}

export interface Dataset {
  id: string;
  name: string;
  size: number;
  samples: DatasetSample[];
  format: "json" | "csv" | "parquet";
  schema?: Record<string, string>;
}

export interface DatasetSample {
  id: string;
  input: string;
  expectedOutput?: string;
  metadata?: Record<string, unknown>;
  difficulty?: "easy" | "medium" | "hard";
}

export interface EvaluationCriterion {
  id: string;
  name: string;
  type: "llm_judge" | "exact_match" | "semantic" | "regex" | "custom";
  weight: number;
  config?: Record<string, unknown>;
}

export interface BenchmarkStats {
  totalRuns: number;
  avgScore: number;
  topScore: number;
  participantCount: number;
  lastRun?: number;
}

export interface BenchmarkRun {
  id: string;
  benchmarkId: string;
  participantId: string;
  model: string;
  promptTemplate?: string;
  results: RunResult[];
  aggregateScore: number;
  metrics: RunMetrics;
  timestamp: number;
  duration: number;
}

export interface RunResult {
  sampleId: string;
  output: string;
  scores: Record<string, number>;
  overallScore: number;
  latency: number;
  tokens: number;
}

export interface RunMetrics {
  avgLatency: number;
  avgScore: number;
  totalTokens: number;
  totalCost: number;
  passRate: number;
}

export interface LeaderboardEntry {
  rank: number;
  participantId: string;
  participantName: string;
  model: string;
  score: number;
  runId: string;
  timestamp: number;
}

export interface Rubric {
  id: string;
  name: string;
  description: string;
  author: BenchmarkAuthor;
  criteria: RubricCriterion[];
  scoringScale: ScoringScale;
  tags: string[];
  usageCount: number;
  rating: number;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  levels: { score: number; description: string }[];
}

export interface ScoringScale {
  min: number;
  max: number;
  step: number;
  labels?: Record<number, string>;
}

// ============================================================================
// Benchmark Marketplace
// ============================================================================

export class BenchmarkMarketplace {
  private readonly config: Required<BenchmarkConfig>;
  private benchmarks: Map<string, Benchmark> = new Map();
  private rubrics: Map<string, Rubric> = new Map();
  private runs: Map<string, BenchmarkRun> = new Map();
  private leaderboards: Map<string, LeaderboardEntry[]> = new Map();

  constructor(config: BenchmarkConfig) {
    this.config = {
      enabled: config.enabled,
      apiBaseUrl: config.apiBaseUrl ?? "https://benchmarks.agentops.ai",
      cacheResults: config.cacheResults ?? true,
      cacheDuration: config.cacheDuration ?? 3600000,
    };
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  // =========================================================================
  // Benchmark Management
  // =========================================================================

  createBenchmark(
    params: Omit<Benchmark, "id" | "stats" | "createdAt" | "updatedAt">,
  ): Benchmark {
    const benchmark: Benchmark = {
      ...params,
      id: generateEventId(),
      stats: {
        totalRuns: 0,
        avgScore: 0,
        topScore: 0,
        participantCount: 0,
      },
      createdAt: now(),
      updatedAt: now(),
    };

    this.benchmarks.set(benchmark.id, benchmark);
    this.leaderboards.set(benchmark.id, []);
    return benchmark;
  }

  getBenchmark(id: string): Benchmark | undefined {
    return this.benchmarks.get(id);
  }

  listBenchmarks(filter?: {
    category?: BenchmarkCategory;
    tags?: string[];
    search?: string;
    visibility?: "public" | "private" | "organization";
  }): Benchmark[] {
    let results = Array.from(this.benchmarks.values());

    if (filter) {
      if (filter.category) {
        results = results.filter((b) => b.category === filter.category);
      }
      if (filter.tags && filter.tags.length > 0) {
        results = results.filter((b) =>
          filter.tags!.some((t) => b.tags.includes(t)),
        );
      }
      if (filter.search) {
        const search = filter.search.toLowerCase();
        results = results.filter(
          (b) =>
            b.name.toLowerCase().includes(search) ||
            b.description.toLowerCase().includes(search),
        );
      }
      if (filter.visibility) {
        results = results.filter((b) => b.visibility === filter.visibility);
      }
    }

    return results;
  }

  // =========================================================================
  // Benchmark Execution
  // =========================================================================

  runBenchmark(
    benchmarkId: string,
    participantId: string,
    model: string,
    executor: (
      sample: DatasetSample,
    ) => Promise<{ output: string; latency: number; tokens: number }>,
  ): Promise<BenchmarkRun> {
    return new Promise(async (resolve, reject) => {
      const benchmark = this.benchmarks.get(benchmarkId);
      if (!benchmark) {
        reject(new Error(`Benchmark ${benchmarkId} not found`));
        return;
      }

      const startTime = now();
      const results: RunResult[] = [];
      let totalTokens = 0;
      let totalLatency = 0;
      let totalScore = 0;

      for (const sample of benchmark.dataset.samples) {
        try {
          const { output, latency, tokens } = await executor(sample);

          // Evaluate output
          const scores = this.evaluateSample(
            output,
            sample,
            benchmark.evaluationCriteria,
          );
          const overallScore =
            Object.values(scores).reduce((a, b) => a + b, 0) /
            Object.keys(scores).length;

          results.push({
            sampleId: sample.id,
            output,
            scores,
            overallScore,
            latency,
            tokens,
          });

          totalTokens += tokens;
          totalLatency += latency;
          totalScore += overallScore;
        } catch (error) {
          results.push({
            sampleId: sample.id,
            output: "",
            scores: {},
            overallScore: 0,
            latency: 0,
            tokens: 0,
          });
        }
      }

      const duration = now() - startTime;
      const aggregateScore =
        results.length > 0 ? totalScore / results.length : 0;

      const run: BenchmarkRun = {
        id: generateEventId(),
        benchmarkId,
        participantId,
        model,
        results,
        aggregateScore,
        metrics: {
          avgLatency: results.length > 0 ? totalLatency / results.length : 0,
          avgScore: aggregateScore,
          totalTokens,
          totalCost: this.estimateCost(model, totalTokens),
          passRate:
            results.filter((r) => r.overallScore >= 0.5).length /
            results.length,
        },
        timestamp: now(),
        duration,
      };

      this.runs.set(run.id, run);
      this.updateLeaderboard(benchmarkId, run);
      this.updateBenchmarkStats(benchmarkId);

      resolve(run);
    });
  }

  getRun(id: string): BenchmarkRun | undefined {
    return this.runs.get(id);
  }

  listRuns(benchmarkId: string, limit?: number): BenchmarkRun[] {
    const runs = Array.from(this.runs.values())
      .filter((r) => r.benchmarkId === benchmarkId)
      .sort((a, b) => b.timestamp - a.timestamp);

    return limit ? runs.slice(0, limit) : runs;
  }

  // =========================================================================
  // Leaderboards
  // =========================================================================

  getLeaderboard(benchmarkId: string, limit: number = 10): LeaderboardEntry[] {
    const entries = this.leaderboards.get(benchmarkId) ?? [];
    return entries.slice(0, limit);
  }

  // =========================================================================
  // Rubrics
  // =========================================================================

  createRubric(params: Omit<Rubric, "id" | "usageCount" | "rating">): Rubric {
    const rubric: Rubric = {
      ...params,
      id: generateEventId(),
      usageCount: 0,
      rating: 0,
    };

    this.rubrics.set(rubric.id, rubric);
    return rubric;
  }

  getRubric(id: string): Rubric | undefined {
    return this.rubrics.get(id);
  }

  listRubrics(filter?: { tags?: string[]; search?: string }): Rubric[] {
    let results = Array.from(this.rubrics.values());

    if (filter) {
      if (filter.tags && filter.tags.length > 0) {
        results = results.filter((r) =>
          filter.tags!.some((t) => r.tags.includes(t)),
        );
      }
      if (filter.search) {
        const search = filter.search.toLowerCase();
        results = results.filter(
          (r) =>
            r.name.toLowerCase().includes(search) ||
            r.description.toLowerCase().includes(search),
        );
      }
    }

    return results.sort((a, b) => b.rating - a.rating);
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private evaluateSample(
    output: string,
    sample: DatasetSample,
    criteria: EvaluationCriterion[],
  ): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const criterion of criteria) {
      switch (criterion.type) {
        case "exact_match":
          scores[criterion.id] = output === sample.expectedOutput ? 1 : 0;
          break;
        case "semantic":
          scores[criterion.id] = this.semanticSimilarity(
            output,
            sample.expectedOutput ?? "",
          );
          break;
        case "regex":
          const pattern = criterion.config?.pattern as string;
          scores[criterion.id] =
            pattern && new RegExp(pattern).test(output) ? 1 : 0;
          break;
        default:
          scores[criterion.id] = 0.5;
      }
    }

    return scores;
  }

  private semanticSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;

    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);

    return intersection.size / union.size;
  }

  private updateLeaderboard(benchmarkId: string, run: BenchmarkRun): void {
    const entries = this.leaderboards.get(benchmarkId) ?? [];

    entries.push({
      rank: 0,
      participantId: run.participantId,
      participantName: run.participantId,
      model: run.model,
      score: run.aggregateScore,
      runId: run.id,
      timestamp: run.timestamp,
    });

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, i) => (e.rank = i + 1));

    this.leaderboards.set(benchmarkId, entries.slice(0, 100));
  }

  private updateBenchmarkStats(benchmarkId: string): void {
    const benchmark = this.benchmarks.get(benchmarkId);
    if (!benchmark) return;

    const runs = this.listRuns(benchmarkId);
    const participants = new Set(runs.map((r) => r.participantId));

    benchmark.stats = {
      totalRuns: runs.length,
      avgScore:
        runs.length > 0
          ? runs.reduce((sum, r) => sum + r.aggregateScore, 0) / runs.length
          : 0,
      topScore:
        runs.length > 0 ? Math.max(...runs.map((r) => r.aggregateScore)) : 0,
      participantCount: participants.size,
      lastRun: runs[0]?.timestamp,
    };

    benchmark.updatedAt = now();
  }

  private estimateCost(model: string, tokens: number): number {
    const pricing: Record<string, number> = {
      "gpt-4": 0.06,
      "gpt-3.5-turbo": 0.002,
      "claude-3-opus": 0.075,
      "claude-3-sonnet": 0.015,
    };

    return (tokens / 1000) * (pricing[model] ?? 0.01);
  }
}
