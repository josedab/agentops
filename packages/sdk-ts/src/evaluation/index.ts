/**
 * AgentOps SDK - Evaluation & Benchmark Suite
 *
 * Provides a comprehensive evaluation framework for LLM outputs including:
 * - Built-in evaluators (faithfulness, relevance, toxicity, hallucination, coherence, completeness)
 * - Dataset management for repeatable benchmarks
 * - Evaluation run orchestration with concurrency control
 * - CI quality gates for pipeline integration
 * - Production-to-eval conversion from trace data
 */

import { nanoid } from "nanoid";
import type { AgentEvent } from "../types.js";
import type {
  EvaluatorConfig,
  EvaluationInput,
  EvaluationScore,
  EvaluationResult,
  EvalDataset,
  EvalSample,
  EvalRunConfig,
  EvalRun,
  EvalRunSummary,
  CIGateConfig,
  CIGateResult,
  LLMJudgeConfig,
} from "./types.js";

// Re-export all types
export type {
  EvaluatorType,
  EvaluatorConfig,
  EvaluationInput,
  EvaluationScore,
  EvaluationResult,
  EvalDataset,
  EvalSample,
  EvalRunConfig,
  EvalRun,
  EvalRunSummary,
  CIGateConfig,
  CIGateResult,
  LLMJudgeConfig,
} from "./types.js";

// ============================================================================
// Toxic Patterns
// ============================================================================

const TOXIC_PATTERNS: RegExp[] = [
  /\b(hate|hatred|hating)\b/i,
  /\b(kill|murder|slaughter)\b/i,
  /\b(stupid|idiot|moron|dumb)\b/i,
  /\b(racist|sexist|bigot)\b/i,
  /\b(slur|derogatory|offensive)\b/i,
  /\b(violent|violence|abuse|abusive)\b/i,
  /\b(threat|threaten|threatening)\b/i,
  /\b(harass|harassment)\b/i,
  /\b(discriminat\w*)\b/i,
  /\b(obscen\w*|profan\w*)\b/i,
];

// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Extract keywords from text by splitting on non-word characters,
 * lowercasing, and filtering out short/stop words.
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "shall",
    "can",
    "need",
    "must",
    "ought",
    "i",
    "me",
    "my",
    "we",
    "our",
    "you",
    "your",
    "he",
    "him",
    "his",
    "she",
    "her",
    "it",
    "its",
    "they",
    "them",
    "their",
    "this",
    "that",
    "these",
    "those",
    "what",
    "which",
    "who",
    "whom",
    "where",
    "when",
    "how",
    "why",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "not",
    "only",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "because",
    "as",
    "until",
    "while",
    "of",
    "at",
    "by",
    "for",
    "with",
    "about",
    "against",
    "between",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "to",
    "from",
    "up",
    "down",
    "in",
    "out",
    "on",
    "off",
    "over",
    "under",
    "again",
    "further",
    "then",
    "once",
    "and",
    "but",
    "or",
    "nor",
    "if",
    "yet",
    "also",
  ]);

  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Compute keyword overlap ratio between two keyword arrays.
 * Returns a value between 0 and 1.
 */
function keywordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const matches = a.filter((word) => setB.has(word)).length;
  return matches / Math.max(a.length, 1);
}

/**
 * Split text into sentences using common sentence-ending punctuation.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Clamp a value between 0 and 1.
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ============================================================================
// Evaluator Class
// ============================================================================

/**
 * Evaluates LLM outputs using built-in heuristic scoring for standard
 * evaluator types or custom prompt-based scoring.
 *
 * @example
 * ```typescript
 * const evaluator = new Evaluator({
 *   type: 'relevance',
 *   name: 'Response Relevance',
 *   threshold: 0.7,
 * });
 *
 * const score = await evaluator.evaluate({
 *   prompt: 'What is TypeScript?',
 *   response: 'TypeScript is a typed superset of JavaScript.',
 * });
 * ```
 */
export class Evaluator {
  readonly config: EvaluatorConfig;
  readonly judgeConfig?: LLMJudgeConfig;

  constructor(config: EvaluatorConfig, judgeConfig?: LLMJudgeConfig) {
    this.config = config;
    this.judgeConfig = judgeConfig;
  }

  /**
   * Evaluate a single input and produce a score.
   */
  async evaluate(input: EvaluationInput): Promise<EvaluationScore> {
    switch (this.config.type) {
      case "faithfulness":
        return this.evaluateFaithfulness(input);
      case "relevance":
        return this.evaluateRelevance(input);
      case "toxicity":
        return this.evaluateToxicity(input);
      case "hallucination":
        return this.evaluateHallucination(input);
      case "coherence":
        return this.evaluateCoherence(input);
      case "completeness":
        return this.evaluateCompleteness(input);
      case "custom":
        return this.evaluateCustom(input);
      default: {
        const _exhaustive: never = this.config.type;
        throw new Error(`Unknown evaluator type: ${_exhaustive}`);
      }
    }
  }

  /**
   * Faithfulness: checks that the response references the provided context.
   * Scores by keyword overlap ratio between response and context.
   */
  private evaluateFaithfulness(input: EvaluationInput): EvaluationScore {
    const responseKeywords = extractKeywords(input.response);

    if (!input.context || input.context.length === 0) {
      return this.buildScore(
        0.5,
        "No context provided; faithfulness cannot be fully assessed.",
        { contextProvided: false },
      );
    }

    const contextText = input.context.join(" ");
    const contextKeywords = extractKeywords(contextText);
    const overlap = keywordOverlap(responseKeywords, contextKeywords);
    const score = clamp01(overlap);

    const reasoning =
      score >= this.config.threshold
        ? `Response shows strong alignment with context (${(score * 100).toFixed(1)}% keyword overlap).`
        : `Response has limited alignment with context (${(score * 100).toFixed(1)}% keyword overlap).`;

    return this.buildScore(score, reasoning, {
      keywordOverlap: overlap,
      responseKeywordCount: responseKeywords.length,
      contextKeywordCount: contextKeywords.length,
    });
  }

  /**
   * Relevance: checks that the response relates to the prompt via keyword matching.
   */
  private evaluateRelevance(input: EvaluationInput): EvaluationScore {
    const promptKeywords = extractKeywords(input.prompt);
    const responseKeywords = extractKeywords(input.response);

    if (promptKeywords.length === 0) {
      return this.buildScore(
        0.5,
        "Prompt contains insufficient keywords for relevance analysis.",
        { promptKeywordCount: 0 },
      );
    }

    const overlap = keywordOverlap(promptKeywords, responseKeywords);
    // Also check if response keywords appear in prompt (bidirectional relevance)
    const reverseOverlap = keywordOverlap(responseKeywords, promptKeywords);
    const score = clamp01((overlap + reverseOverlap) / 2);

    const reasoning =
      score >= this.config.threshold
        ? `Response is relevant to the prompt (${(score * 100).toFixed(1)}% bidirectional keyword relevance).`
        : `Response shows limited relevance to the prompt (${(score * 100).toFixed(1)}% bidirectional keyword relevance).`;

    return this.buildScore(score, reasoning, {
      promptToResponseOverlap: overlap,
      responseToPromptOverlap: reverseOverlap,
    });
  }

  /**
   * Toxicity: checks for harmful/toxic patterns in the response.
   * Score is inverted: 1.0 = completely safe, 0.0 = highly toxic.
   */
  private evaluateToxicity(input: EvaluationInput): EvaluationScore {
    const matches: string[] = [];

    for (const pattern of TOXIC_PATTERNS) {
      const found = input.response.match(pattern);
      if (found) {
        matches.push(found[0]);
      }
    }

    // Compute toxic density: ratio of toxic matches to total word count
    const wordCount = input.response.split(/\s+/).length;
    const toxicDensity = matches.length / Math.max(wordCount, 1);

    // Invert: 1.0 = safe, 0.0 = toxic
    const score = clamp01(1.0 - toxicDensity * 10);

    const reasoning =
      matches.length === 0
        ? "No toxic patterns detected in response."
        : `Found ${matches.length} potentially toxic pattern(s): ${matches.join(", ")}.`;

    return this.buildScore(score, reasoning, {
      toxicMatches: matches,
      toxicMatchCount: matches.length,
      wordCount,
      toxicDensity,
    });
  }

  /**
   * Hallucination: checks response doesn't contain claims not found in reference/context.
   * If no reference or context is provided, returns a neutral score.
   */
  private evaluateHallucination(input: EvaluationInput): EvaluationScore {
    const hasReference = input.reference && input.reference.length > 0;
    const hasContext = input.context && input.context.length > 0;

    if (!hasReference && !hasContext) {
      return this.buildScore(
        0.5,
        "No reference or context provided; hallucination cannot be assessed.",
        { referenceProvided: false, contextProvided: false },
      );
    }

    const groundTruthText = [
      input.reference ?? "",
      ...(input.context ?? []),
    ].join(" ");
    const groundTruthKeywords = new Set(extractKeywords(groundTruthText));
    const responseKeywords = extractKeywords(input.response);

    if (responseKeywords.length === 0) {
      return this.buildScore(
        1.0,
        "Response contains no substantive claims to hallucinate.",
        {
          responseKeywordCount: 0,
        },
      );
    }

    // Count response keywords NOT found in ground truth
    const unsupportedKeywords = responseKeywords.filter(
      (kw) => !groundTruthKeywords.has(kw),
    );
    const hallucinationRatio =
      unsupportedKeywords.length / responseKeywords.length;

    // Invert: 1.0 = no hallucination, 0.0 = fully hallucinated
    const score = clamp01(1.0 - hallucinationRatio);

    const reasoning =
      score >= this.config.threshold
        ? `Response is well-grounded (${(score * 100).toFixed(1)}% of claims supported by reference/context).`
        : `Response may contain hallucinations (${((1.0 - score) * 100).toFixed(1)}% of claims unsupported).`;

    return this.buildScore(score, reasoning, {
      totalResponseKeywords: responseKeywords.length,
      unsupportedKeywords: unsupportedKeywords.length,
      hallucinationRatio,
      sampleUnsupported: unsupportedKeywords.slice(0, 10),
    });
  }

  /**
   * Coherence: checks sentence structure, length, and repetition.
   */
  private evaluateCoherence(input: EvaluationInput): EvaluationScore {
    const sentences = splitSentences(input.response);
    const wordCount = input.response
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    // Factor 1: Sentence count (at least a few sentences indicates structure)
    const sentenceScore = clamp01(sentences.length / 3);

    // Factor 2: Average sentence length (5-25 words is ideal)
    const avgSentenceLength =
      sentences.length > 0 ? wordCount / sentences.length : 0;
    let lengthScore: number;
    if (avgSentenceLength >= 5 && avgSentenceLength <= 25) {
      lengthScore = 1.0;
    } else if (avgSentenceLength < 5) {
      lengthScore = avgSentenceLength / 5;
    } else {
      lengthScore = clamp01(25 / avgSentenceLength);
    }

    // Factor 3: Repetition (check for duplicate sentences)
    const uniqueSentences = new Set(
      sentences.map((s) => s.toLowerCase().trim()),
    );
    const repetitionScore =
      sentences.length > 0 ? uniqueSentences.size / sentences.length : 1.0;

    // Factor 4: Response is not empty
    const nonEmptyScore = wordCount > 0 ? 1.0 : 0.0;

    const score = clamp01(
      sentenceScore * 0.25 +
        lengthScore * 0.3 +
        repetitionScore * 0.25 +
        nonEmptyScore * 0.2,
    );

    const reasoning =
      score >= this.config.threshold
        ? `Response demonstrates good coherence (${sentences.length} sentences, avg ${avgSentenceLength.toFixed(1)} words/sentence).`
        : `Response has coherence issues (${sentences.length} sentences, avg ${avgSentenceLength.toFixed(1)} words/sentence).`;

    return this.buildScore(score, reasoning, {
      sentenceCount: sentences.length,
      wordCount,
      avgSentenceLength,
      uniqueSentenceRatio: repetitionScore,
      componentScores: {
        sentenceScore,
        lengthScore,
        repetitionScore,
        nonEmptyScore,
      },
    });
  }

  /**
   * Completeness: checks if the response addresses key aspects of the prompt.
   */
  private evaluateCompleteness(input: EvaluationInput): EvaluationScore {
    const promptKeywords = extractKeywords(input.prompt);
    const responseKeywords = new Set(extractKeywords(input.response));

    if (promptKeywords.length === 0) {
      return this.buildScore(
        0.5,
        "Prompt contains insufficient keywords to assess completeness.",
        { promptKeywordCount: 0 },
      );
    }

    // Check how many prompt keywords appear in the response
    const addressedKeywords = promptKeywords.filter((kw) =>
      responseKeywords.has(kw),
    );
    const coverageRatio = addressedKeywords.length / promptKeywords.length;

    // Also factor in response length relative to prompt length
    const responseLengthRatio =
      Math.min(input.response.length / Math.max(input.prompt.length, 1), 3.0) /
      3.0;

    const score = clamp01(coverageRatio * 0.7 + responseLengthRatio * 0.3);

    const missedKeywords = promptKeywords.filter(
      (kw) => !responseKeywords.has(kw),
    );

    const reasoning =
      score >= this.config.threshold
        ? `Response addresses ${addressedKeywords.length}/${promptKeywords.length} key prompt aspects (${(coverageRatio * 100).toFixed(1)}% coverage).`
        : `Response misses ${missedKeywords.length}/${promptKeywords.length} key prompt aspects (${(coverageRatio * 100).toFixed(1)}% coverage).`;

    return this.buildScore(score, reasoning, {
      promptKeywordCount: promptKeywords.length,
      addressedCount: addressedKeywords.length,
      missedKeywords: missedKeywords.slice(0, 10),
      coverageRatio,
      responseLengthRatio,
    });
  }

  /**
   * Custom: uses a customPrompt template with simple keyword-based scoring.
   * The customPrompt can reference {prompt}, {response}, {context}, {reference}.
   */
  private evaluateCustom(input: EvaluationInput): EvaluationScore {
    const template = this.config.customPrompt;

    if (!template) {
      return this.buildScore(
        0.0,
        "No customPrompt provided for custom evaluator.",
        { error: "missing_custom_prompt" },
      );
    }

    // Expand template placeholders
    const expanded = template
      .replace(/\{prompt\}/g, input.prompt)
      .replace(/\{response\}/g, input.response)
      .replace(/\{context\}/g, (input.context ?? []).join(" "))
      .replace(/\{reference\}/g, input.reference ?? "");

    // Simple heuristic: extract expected keywords from the expanded template
    // and check how many appear in the response
    const templateKeywords = extractKeywords(expanded);
    const responseKeywords = new Set(extractKeywords(input.response));

    if (templateKeywords.length === 0) {
      return this.buildScore(
        0.5,
        "Custom prompt template expanded but contained no evaluable keywords.",
        { expandedTemplate: expanded.substring(0, 200) },
      );
    }

    const matches = templateKeywords.filter((kw) => responseKeywords.has(kw));
    const score = clamp01(matches.length / templateKeywords.length);

    const reasoning = `Custom evaluation: ${matches.length}/${templateKeywords.length} template keywords found in response (${(score * 100).toFixed(1)}% match).`;

    return this.buildScore(score, reasoning, {
      templateKeywordCount: templateKeywords.length,
      matchCount: matches.length,
      expandedTemplatePreview: expanded.substring(0, 200),
    });
  }

  /**
   * Build an EvaluationScore from computed values.
   */
  private buildScore(
    score: number,
    reasoning: string,
    details?: Record<string, unknown>,
  ): EvaluationScore {
    return {
      evaluator: this.config.name,
      score,
      passed: score >= this.config.threshold,
      reasoning,
      details,
    };
  }
}

// ============================================================================
// EvaluationRunner Class
// ============================================================================

/**
 * Orchestrates evaluation runs over datasets or ad-hoc inputs.
 * Manages datasets and run history in memory.
 *
 * @example
 * ```typescript
 * const runner = new EvaluationRunner();
 *
 * const dataset = runner.createDataset('QA Pairs', [
 *   { id: '1', input: { prompt: 'What is TS?', response: 'A typed JS superset.' } },
 * ]);
 *
 * const run = await runner.runEvaluation({
 *   datasetId: dataset.id,
 *   evaluators: [
 *     { type: 'relevance', name: 'Relevance', threshold: 0.7 },
 *     { type: 'coherence', name: 'Coherence', threshold: 0.6 },
 *   ],
 * });
 * ```
 */
export class EvaluationRunner {
  private datasets: Map<string, EvalDataset> = new Map();
  private runs: Map<string, EvalRun> = new Map();

  /**
   * Create a new evaluation dataset.
   */
  createDataset(
    name: string,
    samples: EvalSample[],
    description?: string,
  ): EvalDataset {
    const dataset: EvalDataset = {
      id: nanoid(),
      name,
      description,
      samples,
      createdAt: new Date().toISOString(),
      version: "1.0.0",
    };
    this.datasets.set(dataset.id, dataset);
    return dataset;
  }

  /**
   * Retrieve a dataset by ID.
   */
  getDataset(datasetId: string): EvalDataset | undefined {
    return this.datasets.get(datasetId);
  }

  /**
   * List all stored datasets.
   */
  listDatasets(): EvalDataset[] {
    return Array.from(this.datasets.values());
  }

  /**
   * Run an evaluation using the provided configuration.
   * If inputs are given, they are used directly.
   * Otherwise, the dataset from config.datasetId is used.
   */
  async runEvaluation(
    config: EvalRunConfig,
    inputs?: EvaluationInput[],
  ): Promise<EvalRun> {
    const runId = nanoid();
    const startedAt = new Date().toISOString();

    // Resolve inputs from dataset if not provided
    let evaluationInputs: EvaluationInput[];
    if (inputs && inputs.length > 0) {
      evaluationInputs = inputs;
    } else if (config.datasetId) {
      const dataset = this.datasets.get(config.datasetId);
      if (!dataset) {
        throw new Error(`Dataset not found: ${config.datasetId}`);
      }
      evaluationInputs = dataset.samples.map((s) => s.input);
    } else {
      throw new Error("Either inputs or config.datasetId must be provided.");
    }

    // Create evaluator instances
    const evaluators = config.evaluators.map((ec) => new Evaluator(ec));

    // Initialize the run in "running" state
    const run: EvalRun = {
      id: runId,
      config,
      results: [],
      summary: {
        totalSamples: 0,
        passedSamples: 0,
        failedSamples: 0,
        averageScore: 0,
        scoresByEvaluator: {},
        durationMs: 0,
      },
      startedAt,
      status: "running",
    };
    this.runs.set(runId, run);

    const runStart = Date.now();

    try {
      // Process inputs with concurrency control
      const concurrency = config.concurrency ?? 5;
      const results: EvaluationResult[] = [];

      for (let i = 0; i < evaluationInputs.length; i += concurrency) {
        const batch = evaluationInputs.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map((input) => this.evaluateSingle(input, evaluators, config)),
        );
        results.push(...batchResults);
      }

      // Compute summary
      const summary = this.computeSummary(results);
      summary.durationMs = Date.now() - runStart;

      // Determine status
      const failed =
        config.failOnThreshold === true && summary.failedSamples > 0;

      run.results = results;
      run.summary = summary;
      run.completedAt = new Date().toISOString();
      run.status = failed ? "failed" : "completed";

      return run;
    } catch (error) {
      run.status = "failed";
      run.completedAt = new Date().toISOString();
      run.summary.durationMs = Date.now() - runStart;
      throw error;
    }
  }

  /**
   * Retrieve a run by ID.
   */
  getEvalRun(runId: string): EvalRun | undefined {
    return this.runs.get(runId);
  }

  /**
   * List runs, optionally filtering by status.
   */
  listRuns(filter?: {
    status?: "running" | "completed" | "failed";
  }): EvalRun[] {
    const allRuns = Array.from(this.runs.values());
    if (!filter?.status) return allRuns;
    return allRuns.filter((r) => r.status === filter.status);
  }

  /**
   * Compare two evaluation runs, reporting improvements and degradations
   * per evaluator.
   */
  compareRuns(
    runId1: string,
    runId2: string,
  ): {
    improved: string[];
    degraded: string[];
    unchanged: string[];
    diff: Record<string, number>;
  } {
    const run1 = this.runs.get(runId1);
    const run2 = this.runs.get(runId2);

    if (!run1) throw new Error(`Run not found: ${runId1}`);
    if (!run2) throw new Error(`Run not found: ${runId2}`);

    const improved: string[] = [];
    const degraded: string[] = [];
    const unchanged: string[] = [];
    const diff: Record<string, number> = {};

    // Collect all evaluator names from both runs
    const evaluatorNames = new Set([
      ...Object.keys(run1.summary.scoresByEvaluator),
      ...Object.keys(run2.summary.scoresByEvaluator),
    ]);

    const threshold = 0.01; // 1% change threshold for "unchanged"

    for (const evaluator of evaluatorNames) {
      const avg1 = run1.summary.scoresByEvaluator[evaluator]?.avg ?? 0;
      const avg2 = run2.summary.scoresByEvaluator[evaluator]?.avg ?? 0;
      const delta = avg2 - avg1;
      diff[evaluator] = delta;

      if (Math.abs(delta) < threshold) {
        unchanged.push(evaluator);
      } else if (delta > 0) {
        improved.push(evaluator);
      } else {
        degraded.push(evaluator);
      }
    }

    return { improved, degraded, unchanged, diff };
  }

  /**
   * Evaluate a single input against all evaluators.
   */
  private async evaluateSingle(
    input: EvaluationInput,
    evaluators: Evaluator[],
    config: EvalRunConfig,
  ): Promise<EvaluationResult> {
    const start = Date.now();

    const scores: EvaluationScore[] = await Promise.all(
      evaluators.map((ev) => ev.evaluate(input)),
    );

    // Compute weighted aggregate score
    const aggregateScore = this.computeAggregateScore(
      scores,
      config.evaluators,
    );
    const passed = scores.every((s) => s.passed);

    return {
      id: nanoid(),
      input,
      scores,
      aggregateScore,
      passed,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  /**
   * Compute the weighted aggregate score across all evaluator scores.
   */
  private computeAggregateScore(
    scores: EvaluationScore[],
    configs: EvaluatorConfig[],
  ): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (let i = 0; i < scores.length; i++) {
      const weight = configs[i]?.weight ?? 1;
      totalWeight += weight;
      weightedSum += scores[i].score * weight;
    }

    return totalWeight > 0 ? clamp01(weightedSum / totalWeight) : 0;
  }

  /**
   * Compute summary statistics from evaluation results.
   */
  private computeSummary(results: EvaluationResult[]): EvalRunSummary {
    const totalSamples = results.length;
    const passedSamples = results.filter((r) => r.passed).length;
    const failedSamples = totalSamples - passedSamples;

    const averageScore =
      totalSamples > 0
        ? results.reduce((sum, r) => sum + r.aggregateScore, 0) / totalSamples
        : 0;

    // Compute per-evaluator statistics
    const scoresByEvaluator: Record<
      string,
      { avg: number; min: number; max: number }
    > = {};

    if (results.length > 0) {
      // Collect all evaluator names
      const evaluatorNames = new Set<string>();
      for (const result of results) {
        for (const score of result.scores) {
          evaluatorNames.add(score.evaluator);
        }
      }

      for (const evalName of evaluatorNames) {
        const evalScores: number[] = [];
        for (const result of results) {
          const score = result.scores.find((s) => s.evaluator === evalName);
          if (score) {
            evalScores.push(score.score);
          }
        }

        if (evalScores.length > 0) {
          const avg =
            evalScores.reduce((sum, s) => sum + s, 0) / evalScores.length;
          const min = Math.min(...evalScores);
          const max = Math.max(...evalScores);
          scoresByEvaluator[evalName] = { avg, min, max };
        }
      }
    }

    return {
      totalSamples,
      passedSamples,
      failedSamples,
      averageScore,
      scoresByEvaluator,
      durationMs: 0, // Caller sets this
    };
  }
}

// ============================================================================
// CIGate Class
// ============================================================================

/**
 * Implements a CI quality gate that evaluates LLM outputs against
 * configurable thresholds and produces pass/fail decisions.
 *
 * @example
 * ```typescript
 * const gate = new CIGate({
 *   evaluators: [
 *     { type: 'relevance', name: 'Relevance', threshold: 0.7 },
 *     { type: 'toxicity', name: 'Safety', threshold: 0.9 },
 *   ],
 *   minAggregateScore: 0.75,
 *   minPassRate: 0.9,
 *   blockOnFailure: true,
 * });
 *
 * const result = await gate.check(inputs);
 * if (!result.passed) {
 *   console.log(gate.generateReport(result));
 * }
 * ```
 */
export class CIGate {
  readonly config: CIGateConfig;

  constructor(config: CIGateConfig) {
    this.config = config;
  }

  /**
   * Evaluate all inputs against the gate criteria.
   */
  async check(inputs: EvaluationInput[]): Promise<CIGateResult> {
    const evaluators = this.config.evaluators.map((ec) => new Evaluator(ec));

    const results: EvaluationResult[] = [];

    for (const input of inputs) {
      const start = Date.now();
      const scores: EvaluationScore[] = await Promise.all(
        evaluators.map((ev) => ev.evaluate(input)),
      );

      // Compute weighted aggregate
      let totalWeight = 0;
      let weightedSum = 0;
      for (let i = 0; i < scores.length; i++) {
        const weight = this.config.evaluators[i]?.weight ?? 1;
        totalWeight += weight;
        weightedSum += scores[i].score * weight;
      }
      const aggregateScore =
        totalWeight > 0 ? clamp01(weightedSum / totalWeight) : 0;
      const passed = scores.every((s) => s.passed);

      results.push({
        id: nanoid(),
        input,
        scores,
        aggregateScore,
        passed,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start,
      });
    }

    const totalPassed = results.filter((r) => r.passed).length;
    const passRate = results.length > 0 ? totalPassed / results.length : 0;
    const overallAggregate =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.aggregateScore, 0) / results.length
        : 0;

    const passedGate =
      overallAggregate >= this.config.minAggregateScore &&
      passRate >= this.config.minPassRate;

    const details = passedGate
      ? `CI gate PASSED: aggregate=${(overallAggregate * 100).toFixed(1)}% (min ${(this.config.minAggregateScore * 100).toFixed(1)}%), passRate=${(passRate * 100).toFixed(1)}% (min ${(this.config.minPassRate * 100).toFixed(1)}%).`
      : `CI gate FAILED: aggregate=${(overallAggregate * 100).toFixed(1)}% (min ${(this.config.minAggregateScore * 100).toFixed(1)}%), passRate=${(passRate * 100).toFixed(1)}% (min ${(this.config.minPassRate * 100).toFixed(1)}%).`;

    return {
      passed: passedGate,
      aggregateScore: overallAggregate,
      passRate,
      details,
      results,
    };
  }

  /**
   * Generate a markdown report suitable for PR comments.
   */
  generateReport(result: CIGateResult): string {
    const statusIcon = result.passed ? "PASSED" : "FAILED";
    const lines: string[] = [];

    lines.push(`# CI Quality Gate: ${statusIcon}`);
    lines.push("");
    lines.push(
      `**Aggregate Score:** ${(result.aggregateScore * 100).toFixed(1)}% (minimum: ${(this.config.minAggregateScore * 100).toFixed(1)}%)`,
    );
    lines.push(
      `**Pass Rate:** ${(result.passRate * 100).toFixed(1)}% (minimum: ${(this.config.minPassRate * 100).toFixed(1)}%)`,
    );
    lines.push(`**Samples Evaluated:** ${result.results.length}`);
    lines.push("");

    // Per-evaluator summary
    lines.push("## Evaluator Summary");
    lines.push("");
    lines.push("| Evaluator | Avg Score | Pass Rate |");
    lines.push("|-----------|-----------|-----------|");

    // Gather per-evaluator stats
    const evaluatorStats: Record<
      string,
      { total: number; passed: number; sumScore: number }
    > = {};

    for (const res of result.results) {
      for (const score of res.scores) {
        if (!evaluatorStats[score.evaluator]) {
          evaluatorStats[score.evaluator] = {
            total: 0,
            passed: 0,
            sumScore: 0,
          };
        }
        evaluatorStats[score.evaluator].total += 1;
        evaluatorStats[score.evaluator].sumScore += score.score;
        if (score.passed) {
          evaluatorStats[score.evaluator].passed += 1;
        }
      }
    }

    for (const [name, stats] of Object.entries(evaluatorStats)) {
      const avgScore = (stats.sumScore / stats.total) * 100;
      const evalPassRate = (stats.passed / stats.total) * 100;
      lines.push(
        `| ${name} | ${avgScore.toFixed(1)}% | ${evalPassRate.toFixed(1)}% |`,
      );
    }

    lines.push("");

    // Failed samples detail
    const failedResults = result.results.filter((r) => !r.passed);
    if (failedResults.length > 0) {
      lines.push("## Failed Samples");
      lines.push("");

      const maxDisplay = Math.min(failedResults.length, 10);
      for (let i = 0; i < maxDisplay; i++) {
        const failed = failedResults[i];
        lines.push(
          `### Sample ${i + 1} (score: ${(failed.aggregateScore * 100).toFixed(1)}%)`,
        );
        lines.push(
          `- **Prompt:** ${failed.input.prompt.substring(0, 100)}${failed.input.prompt.length > 100 ? "..." : ""}`,
        );
        for (const score of failed.scores) {
          if (!score.passed) {
            lines.push(
              `- **${score.evaluator}:** ${(score.score * 100).toFixed(1)}% - ${score.reasoning}`,
            );
          }
        }
        lines.push("");
      }

      if (failedResults.length > maxDisplay) {
        lines.push(
          `_...and ${failedResults.length - maxDisplay} more failed samples._`,
        );
        lines.push("");
      }
    }

    if (this.config.blockOnFailure && !result.passed) {
      lines.push("---");
      lines.push(
        "**This gate is configured to block on failure.** The pipeline will not proceed until quality thresholds are met.",
      );
    }

    return lines.join("\n");
  }
}

// ============================================================================
// ProductionToEval Class
// ============================================================================

/**
 * Converts production trace events into evaluation samples and datasets
 * for regression testing and benchmarking.
 *
 * @example
 * ```typescript
 * const converter = new ProductionToEval();
 * const samples = converter.captureFromTrace(traceEvents);
 * const dataset = converter.createDatasetFromTraces('Production Q1', [trace1, trace2]);
 * ```
 */
export class ProductionToEval {
  /**
   * Convert a single trace (array of events) into evaluation samples.
   * Pairs prompt events with their subsequent response events.
   */
  captureFromTrace(events: AgentEvent[]): EvalSample[] {
    const samples: EvalSample[] = [];

    // Find prompt-response pairs
    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      if (event.type === "prompt" && event.role === "user") {
        // Look for the next response event
        const responseEvent = events
          .slice(i + 1)
          .find((e) => e.type === "response");

        if (responseEvent && responseEvent.type === "response") {
          const promptContent =
            typeof event.content === "string"
              ? event.content
              : JSON.stringify(event.content);
          const responseContent =
            typeof responseEvent.content === "string"
              ? responseEvent.content
              : JSON.stringify(responseEvent.content);

          // Gather context from system prompts
          const systemPrompts = events
            .filter(
              (e) =>
                e.type === "prompt" &&
                e.role === "system" &&
                e.timestamp <= event.timestamp,
            )
            .map((e) => {
              const pe = e as Extract<AgentEvent, { type: "prompt" }>;
              return typeof pe.content === "string"
                ? pe.content
                : JSON.stringify(pe.content);
            });

          const sample: EvalSample = {
            id: nanoid(),
            input: {
              prompt: promptContent,
              response: responseContent,
              context: systemPrompts.length > 0 ? systemPrompts : undefined,
              metadata: {
                sessionId: event.sessionId,
                model:
                  responseEvent.type === "response"
                    ? responseEvent.model
                    : undefined,
                timestamp: event.timestamp,
                durationMs:
                  responseEvent.type === "response"
                    ? responseEvent.durationMs
                    : undefined,
              },
            },
            tags: [`session:${event.sessionId}`, ...(event.tags ?? [])],
          };

          samples.push(sample);
        }
      }
    }

    return samples;
  }

  /**
   * Create a dataset from multiple production traces.
   */
  createDatasetFromTraces(name: string, traces: AgentEvent[][]): EvalDataset {
    const allSamples: EvalSample[] = [];

    for (const trace of traces) {
      const samples = this.captureFromTrace(trace);
      allSamples.push(...samples);
    }

    return {
      id: nanoid(),
      name,
      description: `Auto-generated from ${traces.length} production trace(s) with ${allSamples.length} sample(s).`,
      samples: allSamples,
      createdAt: new Date().toISOString(),
      version: "1.0.0",
    };
  }
}
