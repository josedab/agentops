import { z } from "zod";
import { router, publicProcedure } from "../trpc";

// Quality scoring dimensions
const QUALITY_DIMENSIONS = [
  {
    id: "relevance",
    name: "Relevance",
    description: "How relevant is the response to the prompt",
  },
  {
    id: "coherence",
    name: "Coherence",
    description: "How logical and well-structured is the response",
  },
  {
    id: "accuracy",
    name: "Accuracy",
    description: "How factually accurate is the response",
  },
  {
    id: "helpfulness",
    name: "Helpfulness",
    description: "How helpful is the response for the user",
  },
  {
    id: "safety",
    name: "Safety",
    description: "Is the response safe and appropriate",
  },
] as const;

// System prompt for LLM-as-judge
const JUDGE_SYSTEM_PROMPT = `You are an expert AI quality evaluator. Your task is to evaluate AI responses based on specific quality dimensions.

For each dimension, provide:
1. A score from 1-10 (1=poor, 10=excellent)
2. A brief explanation for the score

Be objective and consistent in your evaluations. Consider the context and expectations for each interaction.`;

// Mock evaluation results (in production, call OpenAI/Anthropic)
const mockEvaluation = {
  overallScore: 7.8,
  dimensions: {
    relevance: {
      score: 8.5,
      explanation: "Response directly addresses the user question",
    },
    coherence: { score: 8.0, explanation: "Well-structured with logical flow" },
    accuracy: { score: 7.5, explanation: "Generally accurate with minor gaps" },
    helpfulness: { score: 8.0, explanation: "Provides actionable information" },
    safety: { score: 7.0, explanation: "No harmful content, appropriate tone" },
  },
  feedback:
    "Overall good response quality. Could improve accuracy with more specific details.",
};

export const qualityRouter = router({
  // Get quality dimensions configuration
  getDimensions: publicProcedure.query(async () => {
    return QUALITY_DIMENSIONS;
  }),

  // Evaluate a single response
  evaluate: publicProcedure
    .input(
      z.object({
        prompt: z.string(),
        response: z.string(),
        model: z.string().optional(),
        dimensions: z.array(z.string()).optional(),
        context: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // In production, call LLM API with JUDGE_SYSTEM_PROMPT
      // const evaluation = await callLLMJudge(input);

      // For now, return mock with slight randomization
      const scores: Record<string, { score: number; explanation: string }> = {};
      const selectedDimensions =
        input.dimensions || QUALITY_DIMENSIONS.map((d) => d.id);

      let totalScore = 0;
      for (const dim of selectedDimensions) {
        const baseScore = 7 + Math.random() * 2;
        scores[dim] = {
          score: Math.round(baseScore * 10) / 10,
          explanation:
            mockEvaluation.dimensions[
              dim as keyof typeof mockEvaluation.dimensions
            ]?.explanation || "Good quality",
        };
        totalScore += scores[dim].score;
      }

      return {
        overallScore:
          Math.round((totalScore / selectedDimensions.length) * 10) / 10,
        dimensions: scores,
        evaluatedAt: new Date(),
        model: "gpt-4o-mini", // Judge model used
      };
    }),

  // Batch evaluate multiple responses
  evaluateBatch: publicProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            id: z.string(),
            prompt: z.string(),
            response: z.string(),
          }),
        ),
        dimensions: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const results = input.items.map((item) => ({
        id: item.id,
        overallScore: 7 + Math.random() * 2,
        evaluatedAt: new Date(),
      }));

      return {
        results,
        averageScore:
          results.reduce((sum, r) => sum + r.overallScore, 0) / results.length,
        completedAt: new Date(),
      };
    }),

  // Get quality scores for a session
  getSessionQuality: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      // Mock session quality data
      return {
        sessionId: input.sessionId,
        overallScore: 7.8,
        responseCount: 5,
        evaluatedCount: 5,
        dimensions: {
          relevance: 8.2,
          coherence: 7.9,
          accuracy: 7.5,
          helpfulness: 8.0,
          safety: 7.4,
        },
        trend: [
          { timestamp: new Date(Date.now() - 4 * 60000), score: 7.5 },
          { timestamp: new Date(Date.now() - 3 * 60000), score: 7.8 },
          { timestamp: new Date(Date.now() - 2 * 60000), score: 8.0 },
          { timestamp: new Date(Date.now() - 60000), score: 7.6 },
          { timestamp: new Date(), score: 8.2 },
        ],
      };
    }),

  // Get quality metrics aggregated by time
  getQualityMetrics: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        granularity: z.enum(["hour", "day", "week"]).default("day"),
        groupBy: z.enum(["model", "feature", "prompt"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      // Mock time series data
      const data = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        data.push({
          timestamp: date,
          avgScore: 7.2 + Math.random() * 1.5,
          evaluationCount: Math.floor(100 + Math.random() * 200),
          dimensions: {
            relevance: 7.5 + Math.random(),
            coherence: 7.3 + Math.random(),
            accuracy: 7.0 + Math.random(),
            helpfulness: 7.8 + Math.random(),
            safety: 8.0 + Math.random() * 0.5,
          },
        });
      }

      return {
        data,
        summary: {
          avgScore: 7.8,
          totalEvaluations: 1234,
          improvementPercent: 5.2,
        },
      };
    }),

  // Get quality distribution
  getQualityDistribution: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        timeRange: z.enum(["24h", "7d", "30d"]).default("7d"),
      }),
    )
    .query(async () => {
      return {
        buckets: [
          { range: "1-2", count: 5, percentage: 0.5 },
          { range: "2-3", count: 10, percentage: 1.0 },
          { range: "3-4", count: 25, percentage: 2.5 },
          { range: "4-5", count: 50, percentage: 5.0 },
          { range: "5-6", count: 150, percentage: 15.0 },
          { range: "6-7", count: 250, percentage: 25.0 },
          { range: "7-8", count: 300, percentage: 30.0 },
          { range: "8-9", count: 180, percentage: 18.0 },
          { range: "9-10", count: 30, percentage: 3.0 },
        ],
        median: 7.2,
        mean: 7.1,
        stdDev: 1.2,
      };
    }),

  // Compare quality between models/prompts
  compareQuality: publicProcedure
    .input(
      z.object({
        compareType: z.enum(["model", "prompt", "version"]),
        items: z.array(z.string()).min(2).max(5),
        timeRange: z.enum(["24h", "7d", "30d"]).default("7d"),
      }),
    )
    .query(async ({ input }) => {
      return {
        comparison: input.items.map((item) => ({
          id: item,
          avgScore: 7 + Math.random() * 2,
          sampleSize: Math.floor(500 + Math.random() * 500),
          dimensions: {
            relevance: 7 + Math.random() * 2,
            coherence: 7 + Math.random() * 2,
            accuracy: 7 + Math.random() * 2,
            helpfulness: 7 + Math.random() * 2,
            safety: 8 + Math.random(),
          },
        })),
        winner: input.items[Math.floor(Math.random() * input.items.length)],
        statisticalSignificance: Math.random() > 0.3,
        pValue: Math.random() * 0.1,
      };
    }),
});
