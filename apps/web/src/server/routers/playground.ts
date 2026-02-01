import { z } from "zod";
import { router, publicProcedure } from "../trpc";

// Mock LLM completion (in production, use actual API calls)
async function mockCompletion(
  prompt: string,
  model: string,
  params: { temperature?: number; maxTokens?: number; topP?: number },
): Promise<{
  response: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latency: number;
  finishReason: string;
}> {
  const startTime = Date.now();

  // Simulate API latency
  await new Promise((resolve) =>
    setTimeout(resolve, 500 + Math.random() * 1000),
  );

  const responses = [
    "I understand you're asking about this topic. Let me help explain...",
    "Based on the information provided, here's my analysis...",
    "That's a great question! Here's what I think...",
    "Let me break this down for you step by step...",
  ];

  const response =
    responses[Math.floor(Math.random() * responses.length)] +
    ` Your prompt was "${prompt.slice(0, 50)}..." processed with ${model}.`;

  const promptTokens = Math.ceil(prompt.length / 4);
  const completionTokens = Math.ceil(response.length / 4);

  return {
    response,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    latency: Date.now() - startTime,
    finishReason: "stop",
  };
}

// Available models for playground
const PLAYGROUND_MODELS = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    inputCost: 0.005,
    outputCost: 0.015,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    inputCost: 0.00015,
    outputCost: 0.0006,
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    inputCost: 0.01,
    outputCost: 0.03,
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    inputCost: 0.003,
    outputCost: 0.015,
  },
  {
    id: "claude-3-opus",
    name: "Claude 3 Opus",
    provider: "anthropic",
    inputCost: 0.015,
    outputCost: 0.075,
  },
  {
    id: "claude-3-haiku",
    name: "Claude 3 Haiku",
    provider: "anthropic",
    inputCost: 0.00025,
    outputCost: 0.00125,
  },
];

export const playgroundRouter = router({
  // Get available models
  getModels: publicProcedure.query(async () => {
    return PLAYGROUND_MODELS;
  }),

  // Execute a single prompt
  execute: publicProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(100000),
        model: z.string(),
        systemPrompt: z.string().optional(),
        temperature: z.number().min(0).max(2).default(0.7),
        maxTokens: z.number().min(1).max(4096).default(1024),
        topP: z.number().min(0).max(1).default(1),
        frequencyPenalty: z.number().min(-2).max(2).default(0),
        presencePenalty: z.number().min(-2).max(2).default(0),
        stopSequences: z.array(z.string()).optional(),
        enableCache: z.boolean().default(false),
        enableQualityScoring: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await mockCompletion(input.prompt, input.model, {
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        topP: input.topP,
      });

      const modelInfo = PLAYGROUND_MODELS.find((m) => m.id === input.model);
      const cost = modelInfo
        ? (result.usage.promptTokens / 1000) * modelInfo.inputCost +
          (result.usage.completionTokens / 1000) * modelInfo.outputCost
        : 0;

      // Mock quality score if enabled
      const qualityScore = input.enableQualityScoring
        ? {
            overall: 7.5 + Math.random() * 2,
            dimensions: { relevance: 8, coherence: 7.5, accuracy: 7 },
          }
        : undefined;

      return {
        id: `exec_${Date.now()}`,
        response: result.response,
        usage: result.usage,
        latency: result.latency,
        cost: Math.round(cost * 1000000) / 1000000,
        finishReason: result.finishReason,
        model: input.model,
        cached: false,
        qualityScore,
        timestamp: new Date(),
      };
    }),

  // Compare multiple models with same prompt
  compare: publicProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(100000),
        models: z.array(z.string()).min(2).max(5),
        systemPrompt: z.string().optional(),
        temperature: z.number().min(0).max(2).default(0.7),
        maxTokens: z.number().min(1).max(4096).default(1024),
      }),
    )
    .mutation(async ({ input }) => {
      const results = await Promise.all(
        input.models.map(async (model) => {
          const result = await mockCompletion(input.prompt, model, {
            temperature: input.temperature,
            maxTokens: input.maxTokens,
          });

          const modelInfo = PLAYGROUND_MODELS.find((m) => m.id === model);
          const cost = modelInfo
            ? (result.usage.promptTokens / 1000) * modelInfo.inputCost +
              (result.usage.completionTokens / 1000) * modelInfo.outputCost
            : 0;

          return {
            model,
            response: result.response,
            usage: result.usage,
            latency: result.latency,
            cost: Math.round(cost * 1000000) / 1000000,
            finishReason: result.finishReason,
          };
        }),
      );

      return {
        comparisonId: `cmp_${Date.now()}`,
        prompt: input.prompt,
        results,
        fastest: results.reduce((a, b) => (a.latency < b.latency ? a : b))
          .model,
        cheapest: results.reduce((a, b) => (a.cost < b.cost ? a : b)).model,
        timestamp: new Date(),
      };
    }),

  // Stream response (mock for now)
  stream: publicProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(100000),
        model: z.string(),
        systemPrompt: z.string().optional(),
        temperature: z.number().min(0).max(2).default(0.7),
        maxTokens: z.number().min(1).max(4096).default(1024),
      }),
    )
    .mutation(async ({ input }) => {
      // In production, this would return a stream
      const result = await mockCompletion(input.prompt, input.model, {
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });

      return {
        streamId: `stream_${Date.now()}`,
        model: input.model,
        response: result.response,
        usage: result.usage,
        latency: result.latency,
      };
    }),

  // Save prompt template
  saveTemplate: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        prompt: z.string(),
        systemPrompt: z.string().optional(),
        model: z.string(),
        parameters: z
          .object({
            temperature: z.number().optional(),
            maxTokens: z.number().optional(),
            topP: z.number().optional(),
          })
          .optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return {
        id: `tmpl_${Date.now()}`,
        name: input.name,
        description: input.description,
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        model: input.model,
        parameters: input.parameters,
        tags: input.tags,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),

  // List saved templates
  listTemplates: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        tags: z.array(z.string()).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async () => {
      // Mock templates
      return {
        templates: [
          {
            id: "tmpl_1",
            name: "Code Review",
            description: "Review code for bugs and improvements",
            prompt:
              "Review the following code and identify any bugs, security issues, or improvements:\n\n{{code}}",
            model: "gpt-4o",
            tags: ["code", "review"],
            createdAt: new Date(Date.now() - 86400000),
          },
          {
            id: "tmpl_2",
            name: "Summarize",
            description: "Summarize long text",
            prompt:
              "Summarize the following text in 3-5 bullet points:\n\n{{text}}",
            model: "gpt-4o-mini",
            tags: ["summary", "text"],
            createdAt: new Date(Date.now() - 172800000),
          },
        ],
        total: 2,
      };
    }),

  // Get execution history
  getHistory: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async () => {
      // Mock history
      return {
        executions: [
          {
            id: "exec_1",
            prompt: "What is the capital of France?",
            response: "The capital of France is Paris.",
            model: "gpt-4o-mini",
            latency: 523,
            cost: 0.000045,
            timestamp: new Date(Date.now() - 60000),
          },
          {
            id: "exec_2",
            prompt: "Explain quantum computing in simple terms.",
            response:
              "Quantum computing uses quantum bits (qubits) that can exist in multiple states simultaneously...",
            model: "gpt-4o",
            latency: 1234,
            cost: 0.00089,
            timestamp: new Date(Date.now() - 120000),
          },
        ],
        total: 2,
        hasMore: false,
      };
    }),

  // Get suggested prompts for testing
  getSuggestions: publicProcedure.query(async () => {
    return {
      categories: [
        {
          name: "General",
          prompts: [
            "Explain the concept of machine learning in simple terms.",
            "What are the benefits and risks of artificial intelligence?",
            "Compare and contrast Python and JavaScript for web development.",
          ],
        },
        {
          name: "Code",
          prompts: [
            "Write a function to reverse a string in JavaScript.",
            "How do I implement a binary search tree in Python?",
            "Explain the SOLID principles with examples.",
          ],
        },
        {
          name: "Creative",
          prompts: [
            "Write a short poem about technology and nature.",
            "Create a product description for a smart water bottle.",
            "Generate 5 creative names for a coffee shop.",
          ],
        },
      ],
    };
  }),
});
