import { describe, it, expect, beforeEach } from "vitest";
import { BenchmarkMarketplace } from "../src/benchmark/marketplace.js";
import type {
  Benchmark,
  Rubric,
  BenchmarkRun,
  DatasetSample,
} from "../src/benchmark/marketplace.js";

describe("BenchmarkMarketplace", () => {
  let marketplace: BenchmarkMarketplace;

  beforeEach(() => {
    marketplace = new BenchmarkMarketplace({
      enabled: true,
      cacheResults: true,
    });
  });

  describe("initialization", () => {
    it("should create marketplace with config", () => {
      expect(marketplace).toBeDefined();
      expect(marketplace.isEnabled).toBe(true);
    });

    it("should respect disabled state", () => {
      const disabled = new BenchmarkMarketplace({ enabled: false });
      expect(disabled.isEnabled).toBe(false);
    });
  });

  describe("benchmark management", () => {
    it("should create a benchmark", () => {
      const benchmark = marketplace.createBenchmark({
        name: "Reasoning Test",
        description: "Test logical reasoning capabilities",
        category: "reasoning",
        author: { id: "author-1", name: "Test Author", verified: false },
        dataset: {
          id: "dataset-1",
          name: "Reasoning Dataset",
          size: 100,
          samples: [
            { id: "s1", input: "What is 2+2?", expectedOutput: "4" },
            {
              id: "s2",
              input: "If A implies B, and A is true, what is B?",
              expectedOutput: "B is true",
            },
          ],
          format: "json",
        },
        evaluationCriteria: [
          {
            id: "accuracy",
            name: "Accuracy",
            type: "exact_match",
            weight: 1.0,
          },
        ],
        tags: ["reasoning", "logic"],
        visibility: "public",
      });

      expect(benchmark.id).toBeDefined();
      expect(benchmark.name).toBe("Reasoning Test");
      expect(benchmark.stats.totalRuns).toBe(0);
    });

    it("should get benchmark by id", () => {
      const created = marketplace.createBenchmark({
        name: "Test",
        description: "Test benchmark",
        category: "factual",
        author: { id: "a1", name: "Author", verified: true },
        dataset: {
          id: "d1",
          name: "Data",
          size: 10,
          samples: [],
          format: "json",
        },
        evaluationCriteria: [],
        tags: [],
        visibility: "public",
      });

      const retrieved = marketplace.getBenchmark(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("Test");
    });

    it("should list benchmarks", () => {
      marketplace.createBenchmark({
        name: "Benchmark 1",
        description: "First",
        category: "coding",
        author: { id: "a1", name: "Author", verified: false },
        dataset: {
          id: "d1",
          name: "Data",
          size: 5,
          samples: [],
          format: "json",
        },
        evaluationCriteria: [],
        tags: ["code"],
        visibility: "public",
      });

      marketplace.createBenchmark({
        name: "Benchmark 2",
        description: "Second",
        category: "reasoning",
        author: { id: "a2", name: "Author 2", verified: true },
        dataset: {
          id: "d2",
          name: "Data 2",
          size: 10,
          samples: [],
          format: "json",
        },
        evaluationCriteria: [],
        tags: ["logic"],
        visibility: "private",
      });

      const all = marketplace.listBenchmarks();
      expect(all).toHaveLength(2);

      const coding = marketplace.listBenchmarks({ category: "coding" });
      expect(coding).toHaveLength(1);

      const withTags = marketplace.listBenchmarks({ tags: ["logic"] });
      expect(withTags).toHaveLength(1);

      const searched = marketplace.listBenchmarks({ search: "First" });
      expect(searched).toHaveLength(1);

      const publicOnly = marketplace.listBenchmarks({ visibility: "public" });
      expect(publicOnly).toHaveLength(1);
    });
  });

  describe("benchmark execution", () => {
    let benchmark: Benchmark;

    beforeEach(() => {
      benchmark = marketplace.createBenchmark({
        name: "Math Test",
        description: "Basic math questions",
        category: "reasoning",
        author: { id: "a1", name: "Test", verified: true },
        dataset: {
          id: "d1",
          name: "Math Dataset",
          size: 3,
          samples: [
            { id: "s1", input: "2+2=?", expectedOutput: "4" },
            { id: "s2", input: "3*3=?", expectedOutput: "9" },
            { id: "s3", input: "10/2=?", expectedOutput: "5" },
          ],
          format: "json",
        },
        evaluationCriteria: [
          {
            id: "exact",
            name: "Exact Match",
            type: "exact_match",
            weight: 1.0,
          },
        ],
        tags: ["math"],
        visibility: "public",
      });
    });

    it("should run a benchmark", async () => {
      const run = await marketplace.runBenchmark(
        benchmark.id,
        "participant-1",
        "gpt-4",
        async (_sample: DatasetSample) => ({
          output: "4",
          latency: 100,
          tokens: 50,
        }),
      );

      expect(run.id).toBeDefined();
      expect(run.benchmarkId).toBe(benchmark.id);
      expect(run.results).toHaveLength(3);
      expect(run.aggregateScore).toBeGreaterThan(0);
      expect(run.metrics.avgLatency).toBe(100);
    });

    it("should handle executor errors gracefully", async () => {
      let callCount = 0;
      const run = await marketplace.runBenchmark(
        benchmark.id,
        "participant-1",
        "gpt-4",
        async (_sample: DatasetSample) => {
          callCount++;
          if (callCount === 2) throw new Error("API Error");
          return { output: "4", latency: 50, tokens: 25 };
        },
      );

      expect(run.results).toHaveLength(3);
      const failedResult = run.results[1];
      expect(failedResult.overallScore).toBe(0);
    });

    it("should reject for non-existent benchmark", async () => {
      await expect(
        marketplace.runBenchmark("non-existent", "p1", "gpt-4", async () => ({
          output: "test",
          latency: 0,
          tokens: 0,
        })),
      ).rejects.toThrow("Benchmark non-existent not found");
    });

    it("should update benchmark stats after run", async () => {
      await marketplace.runBenchmark(
        benchmark.id,
        "participant-1",
        "gpt-4",
        async () => ({ output: "4", latency: 100, tokens: 50 }),
      );

      const updated = marketplace.getBenchmark(benchmark.id);
      expect(updated?.stats.totalRuns).toBe(1);
      expect(updated?.stats.participantCount).toBe(1);
    });

    it("should get run by id", async () => {
      const run = await marketplace.runBenchmark(
        benchmark.id,
        "participant-1",
        "gpt-4",
        async () => ({ output: "4", latency: 100, tokens: 50 }),
      );

      const retrieved = marketplace.getRun(run.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(run.id);
    });

    it("should list runs for benchmark", async () => {
      await marketplace.runBenchmark(
        benchmark.id,
        "participant-1",
        "gpt-4",
        async () => ({ output: "4", latency: 100, tokens: 50 }),
      );

      await marketplace.runBenchmark(
        benchmark.id,
        "participant-2",
        "gpt-3.5-turbo",
        async () => ({ output: "4", latency: 50, tokens: 30 }),
      );

      const runs = marketplace.listRuns(benchmark.id);
      expect(runs).toHaveLength(2);

      const limited = marketplace.listRuns(benchmark.id, 1);
      expect(limited).toHaveLength(1);
    });
  });

  describe("leaderboards", () => {
    it("should update leaderboard after runs", async () => {
      const benchmark = marketplace.createBenchmark({
        name: "Competition",
        description: "Competition benchmark",
        category: "coding",
        author: { id: "a1", name: "Org", verified: true },
        dataset: {
          id: "d1",
          name: "Test",
          size: 1,
          samples: [{ id: "s1", input: "test", expectedOutput: "test" }],
          format: "json",
        },
        evaluationCriteria: [
          { id: "exact", name: "Exact", type: "exact_match", weight: 1.0 },
        ],
        tags: [],
        visibility: "public",
      });

      // Participant 1 gets perfect score
      await marketplace.runBenchmark(
        benchmark.id,
        "participant-1",
        "gpt-4",
        async () => ({ output: "test", latency: 100, tokens: 10 }),
      );

      // Participant 2 gets wrong answer
      await marketplace.runBenchmark(
        benchmark.id,
        "participant-2",
        "gpt-3.5",
        async () => ({ output: "wrong", latency: 50, tokens: 5 }),
      );

      const leaderboard = marketplace.getLeaderboard(benchmark.id);
      expect(leaderboard).toHaveLength(2);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].participantId).toBe("participant-1");
      expect(leaderboard[0].score).toBe(1);
      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[1].score).toBe(0);
    });

    it("should limit leaderboard results", async () => {
      const benchmark = marketplace.createBenchmark({
        name: "Big Competition",
        description: "Many participants",
        category: "reasoning",
        author: { id: "a1", name: "Org", verified: true },
        dataset: {
          id: "d1",
          name: "Test",
          size: 1,
          samples: [{ id: "s1", input: "test" }],
          format: "json",
        },
        evaluationCriteria: [],
        tags: [],
        visibility: "public",
      });

      for (let i = 0; i < 5; i++) {
        await marketplace.runBenchmark(
          benchmark.id,
          `participant-${i}`,
          "gpt-4",
          async () => ({ output: "test", latency: 100, tokens: 10 }),
        );
      }

      const top3 = marketplace.getLeaderboard(benchmark.id, 3);
      expect(top3).toHaveLength(3);
    });
  });

  describe("rubrics", () => {
    it("should create a rubric", () => {
      const rubric = marketplace.createRubric({
        name: "Code Quality Rubric",
        description: "Evaluate code generation quality",
        author: { id: "a1", name: "Expert", verified: true },
        criteria: [
          {
            id: "correctness",
            name: "Correctness",
            description: "Does the code work correctly?",
            weight: 0.5,
            levels: [
              { score: 0, description: "Does not compile" },
              { score: 1, description: "Compiles but wrong output" },
              { score: 2, description: "Mostly correct" },
              { score: 3, description: "Fully correct" },
            ],
          },
          {
            id: "style",
            name: "Code Style",
            description: "Is the code well-formatted?",
            weight: 0.3,
            levels: [
              { score: 0, description: "Poor formatting" },
              { score: 1, description: "Acceptable" },
              { score: 2, description: "Good" },
              { score: 3, description: "Excellent" },
            ],
          },
        ],
        scoringScale: { min: 0, max: 3, step: 1 },
        tags: ["code", "quality"],
      });

      expect(rubric.id).toBeDefined();
      expect(rubric.criteria).toHaveLength(2);
      expect(rubric.usageCount).toBe(0);
    });

    it("should get rubric by id", () => {
      const created = marketplace.createRubric({
        name: "Test Rubric",
        description: "Test",
        author: { id: "a1", name: "Author", verified: false },
        criteria: [],
        scoringScale: { min: 0, max: 5, step: 1 },
        tags: [],
      });

      const retrieved = marketplace.getRubric(created.id);
      expect(retrieved?.name).toBe("Test Rubric");
    });

    it("should list and filter rubrics", () => {
      marketplace.createRubric({
        name: "Safety Rubric",
        description: "Evaluate safety",
        author: { id: "a1", name: "Safety Expert", verified: true },
        criteria: [],
        scoringScale: { min: 0, max: 5, step: 1 },
        tags: ["safety"],
      });

      marketplace.createRubric({
        name: "Quality Rubric",
        description: "Evaluate quality",
        author: { id: "a2", name: "Quality Expert", verified: true },
        criteria: [],
        scoringScale: { min: 0, max: 10, step: 1 },
        tags: ["quality"],
      });

      const all = marketplace.listRubrics();
      expect(all).toHaveLength(2);

      const safety = marketplace.listRubrics({ tags: ["safety"] });
      expect(safety).toHaveLength(1);

      const searched = marketplace.listRubrics({ search: "Quality" });
      expect(searched).toHaveLength(1);
    });
  });

  describe("evaluation criteria types", () => {
    it("should evaluate exact match", async () => {
      const benchmark = marketplace.createBenchmark({
        name: "Exact Match Test",
        description: "Test exact matching",
        category: "factual",
        author: { id: "a1", name: "Test", verified: true },
        dataset: {
          id: "d1",
          name: "Data",
          size: 1,
          samples: [
            { id: "s1", input: "Capital of France?", expectedOutput: "Paris" },
          ],
          format: "json",
        },
        evaluationCriteria: [
          {
            id: "exact",
            name: "Exact Match",
            type: "exact_match",
            weight: 1.0,
          },
        ],
        tags: [],
        visibility: "public",
      });

      const perfectRun = await marketplace.runBenchmark(
        benchmark.id,
        "p1",
        "gpt-4",
        async () => ({ output: "Paris", latency: 100, tokens: 5 }),
      );
      expect(perfectRun.results[0].overallScore).toBe(1);

      const wrongRun = await marketplace.runBenchmark(
        benchmark.id,
        "p2",
        "gpt-4",
        async () => ({ output: "London", latency: 100, tokens: 5 }),
      );
      expect(wrongRun.results[0].overallScore).toBe(0);
    });

    it("should evaluate semantic similarity", async () => {
      const benchmark = marketplace.createBenchmark({
        name: "Semantic Test",
        description: "Test semantic matching",
        category: "factual",
        author: { id: "a1", name: "Test", verified: true },
        dataset: {
          id: "d1",
          name: "Data",
          size: 1,
          samples: [
            { id: "s1", input: "Test", expectedOutput: "hello world test" },
          ],
          format: "json",
        },
        evaluationCriteria: [
          { id: "semantic", name: "Semantic", type: "semantic", weight: 1.0 },
        ],
        tags: [],
        visibility: "public",
      });

      const run = await marketplace.runBenchmark(
        benchmark.id,
        "p1",
        "gpt-4",
        async () => ({ output: "hello world", latency: 100, tokens: 5 }),
      );

      expect(run.results[0].overallScore).toBeGreaterThan(0);
      expect(run.results[0].overallScore).toBeLessThan(1);
    });

    it("should evaluate regex patterns", async () => {
      const benchmark = marketplace.createBenchmark({
        name: "Regex Test",
        description: "Test regex matching",
        category: "coding",
        author: { id: "a1", name: "Test", verified: true },
        dataset: {
          id: "d1",
          name: "Data",
          size: 1,
          samples: [{ id: "s1", input: "Generate UUID" }],
          format: "json",
        },
        evaluationCriteria: [
          {
            id: "regex",
            name: "UUID Format",
            type: "regex",
            weight: 1.0,
            config: {
              pattern:
                "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            },
          },
        ],
        tags: [],
        visibility: "public",
      });

      const validRun = await marketplace.runBenchmark(
        benchmark.id,
        "p1",
        "gpt-4",
        async () => ({
          output: "123e4567-e89b-12d3-a456-426614174000",
          latency: 100,
          tokens: 10,
        }),
      );
      expect(validRun.results[0].overallScore).toBe(1);

      const invalidRun = await marketplace.runBenchmark(
        benchmark.id,
        "p2",
        "gpt-4",
        async () => ({
          output: "not-a-uuid",
          latency: 100,
          tokens: 5,
        }),
      );
      expect(invalidRun.results[0].overallScore).toBe(0);
    });
  });
});
