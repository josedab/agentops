import { z } from "zod";
import { router, publicProcedure } from "../trpc";

// Mock prompts/templates data
const mockPrompts = [
  {
    id: "prompt_1",
    projectId: "proj_1",
    name: "Chat System Prompt",
    template:
      "You are a helpful assistant that provides concise and accurate answers.",
    version: 3,
    isActive: true,
    metrics: {
      usageCount: 12456,
      avgQualityScore: 8.2,
      avgTokens: 245,
      avgLatency: 450,
      avgCost: 0.0023,
    },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-25T00:00:00Z"),
  },
  {
    id: "prompt_2",
    projectId: "proj_1",
    name: "Code Review Prompt",
    template:
      "You are an expert code reviewer. Analyze the following code for bugs, security issues, and best practices.",
    version: 5,
    isActive: true,
    metrics: {
      usageCount: 5678,
      avgQualityScore: 7.8,
      avgTokens: 890,
      avgLatency: 1200,
      avgCost: 0.0089,
    },
    createdAt: new Date("2026-01-05T00:00:00Z"),
    updatedAt: new Date("2026-01-27T00:00:00Z"),
  },
  {
    id: "prompt_3",
    projectId: "proj_1",
    name: "Summarization Prompt",
    template:
      "Summarize the following text in 3 bullet points, focusing on the key insights.",
    version: 2,
    isActive: false,
    metrics: {
      usageCount: 2341,
      avgQualityScore: 7.2,
      avgTokens: 156,
      avgLatency: 320,
      avgCost: 0.0015,
    },
    createdAt: new Date("2026-01-10T00:00:00Z"),
    updatedAt: new Date("2026-01-20T00:00:00Z"),
  },
];

const mockPromptVersions = [
  {
    id: "pv_1",
    promptId: "prompt_1",
    version: 1,
    template: "You are a helpful assistant.",
    metrics: { usageCount: 3000, avgQualityScore: 7.5 },
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "pv_2",
    promptId: "prompt_1",
    version: 2,
    template: "You are a helpful assistant that provides concise answers.",
    metrics: { usageCount: 5000, avgQualityScore: 7.9 },
    createdAt: new Date("2026-01-15T00:00:00Z"),
  },
  {
    id: "pv_3",
    promptId: "prompt_1",
    version: 3,
    template:
      "You are a helpful assistant that provides concise and accurate answers.",
    metrics: { usageCount: 4456, avgQualityScore: 8.2 },
    createdAt: new Date("2026-01-25T00:00:00Z"),
  },
];

export const promptsRouter = router({
  // List prompts
  list: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      let prompts = [...mockPrompts];
      if (input.isActive !== undefined) {
        prompts = prompts.filter((p) => p.isActive === input.isActive);
      }
      return prompts;
    }),

  // Get single prompt with versions
  get: publicProcedure
    .input(
      z.object({
        promptId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const prompt = mockPrompts.find((p) => p.id === input.promptId);
      if (!prompt) return null;

      const versions = mockPromptVersions.filter(
        (v) => v.promptId === input.promptId,
      );
      return { ...prompt, versions };
    }),

  // Create new prompt
  create: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(255),
        template: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const newPrompt = {
        id: `prompt_${Date.now()}`,
        projectId: input.projectId,
        name: input.name,
        template: input.template,
        version: 1,
        isActive: true,
        metrics: {
          usageCount: 0,
          avgQualityScore: 0,
          avgTokens: 0,
          avgLatency: 0,
          avgCost: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrompts.push(newPrompt);
      return newPrompt;
    }),

  // Update prompt (creates new version)
  update: publicProcedure
    .input(
      z.object({
        promptId: z.string(),
        template: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const prompt = mockPrompts.find((p) => p.id === input.promptId);
      if (!prompt) return null;

      // Create new version
      const newVersion = {
        id: `pv_${Date.now()}`,
        promptId: input.promptId,
        version: prompt.version,
        template: prompt.template,
        metrics: { usageCount: 0, avgQualityScore: 0 },
        createdAt: new Date(),
      };
      mockPromptVersions.push(newVersion);

      // Update prompt
      prompt.version += 1;
      prompt.template = input.template;
      prompt.updatedAt = new Date();

      return prompt;
    }),

  // Compare two versions
  compare: publicProcedure
    .input(
      z.object({
        promptId: z.string(),
        versionA: z.number(),
        versionB: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const versions = mockPromptVersions.filter(
        (v) => v.promptId === input.promptId,
      );
      const versionA = versions.find((v) => v.version === input.versionA);
      const versionB = versions.find((v) => v.version === input.versionB);

      if (!versionA || !versionB) return null;

      return {
        versionA,
        versionB,
        comparison: {
          qualityDiff:
            (versionB.metrics.avgQualityScore ?? 0) -
            (versionA.metrics.avgQualityScore ?? 0),
          usageDiff:
            (versionB.metrics.usageCount ?? 0) -
            (versionA.metrics.usageCount ?? 0),
        },
      };
    }),

  // Analytics for a prompt
  analytics: publicProcedure
    .input(
      z.object({
        promptId: z.string(),
        timeRange: z.enum(["24h", "7d", "30d"]).default("7d"),
      }),
    )
    .query(async ({ input }) => {
      // Generate mock time series data
      const data = [];
      const days =
        input.timeRange === "24h" ? 24 : input.timeRange === "7d" ? 7 : 30;

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        data.push({
          date: date.toISOString().split("T")[0],
          usageCount: Math.floor(Math.random() * 500) + 100,
          avgQualityScore: 7 + Math.random() * 2,
          avgLatency: 300 + Math.random() * 300,
          avgCost: 0.001 + Math.random() * 0.005,
        });
      }

      return data;
    }),
});
