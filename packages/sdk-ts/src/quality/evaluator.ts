/**
 * AgentOps SDK - Quality Evaluator
 *
 * LLM-as-judge evaluation engine for quality scoring.
 */

import type {
  QualityConfig,
  ResolvedQualityConfig,
  QualityScore,
  QualityRubric,
  CriterionScore,
} from "./types.js";
import { DEFAULT_RUBRIC } from "./types.js";
import { generateEventId, now } from "../utils.js";

const DEFAULT_QUALITY_CONFIG: ResolvedQualityConfig = {
  enabled: false,
  judgeModel: "gpt-4o-mini",
  rubric: DEFAULT_RUBRIC,
  samplingRate: 1.0,
  maxConcurrent: 5,
  timeoutMs: 30000,
};

interface EvaluationRequest {
  eventId: string;
  sessionId: string;
  prompt: string;
  response: string;
  context?: string;
}

interface JudgeResponse {
  scores: Array<{
    criterionId: string;
    score: number;
    reasoning: string;
  }>;
}

export class QualityEvaluator {
  private readonly config: ResolvedQualityConfig;
  private pendingEvaluations: Map<string, Promise<QualityScore>> = new Map();
  private evaluationQueue: EvaluationRequest[] = [];
  private isProcessing = false;

  constructor(config?: QualityConfig) {
    this.config = {
      ...DEFAULT_QUALITY_CONFIG,
      ...config,
      rubric: config?.rubric ?? DEFAULT_QUALITY_CONFIG.rubric,
    };
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Evaluate a response quality using LLM-as-judge
   */
  async evaluate(request: EvaluationRequest): Promise<QualityScore> {
    if (!this.config.enabled) {
      throw new Error("Quality evaluation is not enabled");
    }

    // Check sampling rate
    if (Math.random() > this.config.samplingRate) {
      return this.createSkippedScore(request, "Skipped due to sampling");
    }

    // Check if already evaluating
    const existingEvaluation = this.pendingEvaluations.get(request.eventId);
    if (existingEvaluation) {
      return existingEvaluation;
    }

    // Queue the evaluation
    const evaluationPromise = this.doEvaluate(request);
    this.pendingEvaluations.set(request.eventId, evaluationPromise);

    try {
      const result = await evaluationPromise;
      return result;
    } finally {
      this.pendingEvaluations.delete(request.eventId);
    }
  }

  /**
   * Queue an evaluation for async processing
   */
  queueEvaluation(request: EvaluationRequest): void {
    if (!this.config.enabled) return;

    // Check sampling rate
    if (Math.random() > this.config.samplingRate) return;

    this.evaluationQueue.push(request);
    this.processQueue();
  }

  /**
   * Get current rubric
   */
  getRubric(): QualityRubric {
    return this.config.rubric;
  }

  /**
   * Update rubric
   */
  setRubric(rubric: QualityRubric): void {
    (this.config as { rubric: QualityRubric }).rubric = rubric;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.evaluationQueue.length > 0) {
      // Process up to maxConcurrent evaluations
      const batch = this.evaluationQueue.splice(0, this.config.maxConcurrent);
      await Promise.allSettled(batch.map((request) => this.evaluate(request)));
    }

    this.isProcessing = false;
  }

  private async doEvaluate(request: EvaluationRequest): Promise<QualityScore> {
    const startTime = now();

    try {
      const prompt = this.buildEvaluationPrompt(request);
      const response = await this.callJudgeModel(prompt);
      const parsed = this.parseJudgeResponse(response);

      const overallScore = this.calculateOverallScore(parsed.scores);

      return {
        eventId: generateEventId(),
        sessionId: request.sessionId,
        overallScore,
        criterionScores: parsed.scores,
        rubricId: this.config.rubric.id,
        judgeModel: this.config.judgeModel,
        evaluatedAt: now(),
        evaluationDurationMs: now() - startTime,
        rawResponse: response,
      };
    } catch (error) {
      return this.createErrorScore(request, error, now() - startTime);
    }
  }

  private buildEvaluationPrompt(request: EvaluationRequest): string {
    const criteriaText = this.config.rubric.criteria
      .map((c) => `- ${c.name} (${c.id}): ${c.description}`)
      .join("\n");

    return `You are an AI response quality evaluator. Evaluate the following AI response based on the given criteria.

## Criteria
${criteriaText}

## User Prompt
${request.prompt}

${request.context ? `## Context\n${request.context}\n` : ""}
## AI Response
${request.response}

## Instructions
For each criterion, provide:
1. A score from 1-10 (1=very poor, 10=excellent)
2. A brief reasoning (1-2 sentences)

Respond in JSON format:
{
  "scores": [
    {"criterionId": "accuracy", "score": 8, "reasoning": "..."},
    {"criterionId": "helpfulness", "score": 7, "reasoning": "..."},
    ...
  ]
}`;
  }

  private async callJudgeModel(prompt: string): Promise<string> {
    const endpoint =
      this.config.judgeEndpoint ?? "https://api.openai.com/v1/chat/completions";

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs,
    );

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.judgeApiKey}`,
        },
        body: JSON.stringify({
          model: this.config.judgeModel,
          messages: [
            {
              role: "system",
              content:
                "You are a quality evaluation assistant. Always respond with valid JSON.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Judge API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices[0]?.message?.content ?? "";
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseJudgeResponse(response: string): JudgeResponse {
    try {
      const parsed = JSON.parse(response) as JudgeResponse;

      if (!Array.isArray(parsed.scores)) {
        throw new Error("Invalid response format: missing scores array");
      }

      // Validate and normalize scores
      const validatedScores: CriterionScore[] = parsed.scores.map((s) => ({
        criterionId: String(s.criterionId),
        score: Math.max(1, Math.min(10, Number(s.score) || 5)),
        reasoning: String(s.reasoning || "No reasoning provided"),
      }));

      return { scores: validatedScores };
    } catch (error) {
      // Return default scores on parse error
      return {
        scores: this.config.rubric.criteria.map((c) => ({
          criterionId: c.id,
          score: 5,
          reasoning: "Unable to parse evaluation response",
        })),
      };
    }
  }

  private calculateOverallScore(scores: CriterionScore[]): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const score of scores) {
      const criterion = this.config.rubric.criteria.find(
        (c) => c.id === score.criterionId,
      );
      const weight = criterion?.weight ?? 1 / scores.length;
      weightedSum += score.score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 10) / 10
      : 5;
  }

  private createSkippedScore(
    request: EvaluationRequest,
    reason: string,
  ): QualityScore {
    return {
      eventId: generateEventId(),
      sessionId: request.sessionId,
      overallScore: 0,
      criterionScores: [],
      rubricId: this.config.rubric.id,
      judgeModel: this.config.judgeModel,
      evaluatedAt: now(),
      evaluationDurationMs: 0,
      error: reason,
    };
  }

  private createErrorScore(
    request: EvaluationRequest,
    error: unknown,
    durationMs: number,
  ): QualityScore {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      eventId: generateEventId(),
      sessionId: request.sessionId,
      overallScore: 0,
      criterionScores: [],
      rubricId: this.config.rubric.id,
      judgeModel: this.config.judgeModel,
      evaluatedAt: now(),
      evaluationDurationMs: durationMs,
      error: errorMessage,
    };
  }
}
