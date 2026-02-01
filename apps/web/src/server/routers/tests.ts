import { z } from "zod";
import { router, publicProcedure } from "../trpc";

// Types for test suites
type TestSuiteStatus = "passing" | "failing" | "unknown";
type TestRunStatus = "pending" | "running" | "completed" | "failed";
type TestResultStatus = "passed" | "failed" | "skipped";

interface TestSuite {
  id: string;
  name: string;
  description: string;
  testCases: number;
  passingTests: number;
  failingTests: number;
  lastRunAt: Date | null;
  status: TestSuiteStatus;
  createdAt: Date;
}

interface TestRun {
  id: string;
  suiteId: string;
  suiteName: string;
  status: TestRunStatus;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  startedAt: Date;
  completedAt: Date | null;
  triggeredBy: string;
  commit: string;
  branch: string;
}

// Mock data for test suites and runs
const mockTestSuites: TestSuite[] = [
  {
    id: "suite_1",
    name: "Core Agent Tests",
    description: "Regression tests for core agent functionality",
    testCases: 15,
    passingTests: 14,
    failingTests: 1,
    lastRunAt: new Date("2026-01-30T10:00:00Z"),
    status: "failing",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "suite_2",
    name: "RAG Pipeline Tests",
    description: "Tests for retrieval and generation quality",
    testCases: 8,
    passingTests: 8,
    failingTests: 0,
    lastRunAt: new Date("2026-01-30T09:30:00Z"),
    status: "passing",
    createdAt: new Date("2026-01-10T00:00:00Z"),
  },
  {
    id: "suite_3",
    name: "Tool Calling Tests",
    description: "Verify tool selection and parameter extraction",
    testCases: 12,
    passingTests: 11,
    failingTests: 1,
    lastRunAt: new Date("2026-01-29T16:00:00Z"),
    status: "failing",
    createdAt: new Date("2026-01-15T00:00:00Z"),
  },
];

const mockTestRuns: TestRun[] = [
  {
    id: "run_1",
    suiteId: "suite_1",
    suiteName: "Core Agent Tests",
    status: "completed",
    passed: 14,
    failed: 1,
    skipped: 0,
    duration: 45000,
    startedAt: new Date("2026-01-30T10:00:00Z"),
    completedAt: new Date("2026-01-30T10:00:45Z"),
    triggeredBy: "ci",
    commit: "abc123",
    branch: "main",
  },
  {
    id: "run_2",
    suiteId: "suite_1",
    suiteName: "Core Agent Tests",
    status: "completed",
    passed: 15,
    failed: 0,
    skipped: 0,
    duration: 42000,
    startedAt: new Date("2026-01-29T10:00:00Z"),
    completedAt: new Date("2026-01-29T10:00:42Z"),
    triggeredBy: "ci",
    commit: "def456",
    branch: "main",
  },
];

interface TestResult {
  id: string;
  runId: string;
  testCaseId: string;
  testCaseName: string;
  status: TestResultStatus;
  duration: number;
  response: string;
  error?: string;
  assertions: Array<{
    type: string;
    passed: boolean;
    expected: unknown;
    actual: unknown;
  }>;
}

const mockTestResults: TestResult[] = [
  {
    id: "result_1",
    runId: "run_1",
    testCaseId: "tc_greeting",
    testCaseName: "Agent responds to greetings",
    status: "passed",
    duration: 1200,
    response: "Hello! How can I help you today?",
    assertions: [
      {
        type: "contains",
        passed: true,
        expected: "hello",
        actual: "Hello! How can I help you today?",
      },
      { type: "latency", passed: true, expected: 5000, actual: 1200 },
    ],
  },
  {
    id: "result_2",
    runId: "run_1",
    testCaseId: "tc_calculation",
    testCaseName: "Agent performs calculations",
    status: "failed",
    duration: 2500,
    response: "I think 2+2 is 5",
    error: "Response does not contain expected value",
    assertions: [
      {
        type: "contains",
        passed: false,
        expected: "4",
        actual: "I think 2+2 is 5",
      },
    ],
  },
];

export const testsRouter = router({
  // List test suites
  suites: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        status: z.enum(["passing", "failing", "unknown"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      let filtered = [...mockTestSuites];
      if (input.status) {
        filtered = filtered.filter((s) => s.status === input.status);
      }
      return filtered;
    }),

  // Get single test suite
  getSuite: publicProcedure
    .input(
      z.object({
        suiteId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return mockTestSuites.find((s) => s.id === input.suiteId) ?? null;
    }),

  // Create test suite
  createSuite: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        description: z.string().optional(),
        yaml: z.string(), // YAML content for test cases
      }),
    )
    .mutation(async ({ input }) => {
      const newSuite = {
        id: `suite_${Date.now()}`,
        name: input.name,
        description: input.description ?? "",
        testCases: 0,
        passingTests: 0,
        failingTests: 0,
        lastRunAt: null as Date | null,
        status: "unknown" as const,
        createdAt: new Date(),
      };
      mockTestSuites.push(newSuite);
      return newSuite;
    }),

  // Update test suite
  updateSuite: publicProcedure
    .input(
      z.object({
        suiteId: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        yaml: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const suite = mockTestSuites.find((s) => s.id === input.suiteId);
      if (!suite) return null;

      if (input.name) suite.name = input.name;
      if (input.description) suite.description = input.description;

      return suite;
    }),

  // Delete test suite
  deleteSuite: publicProcedure
    .input(
      z.object({
        suiteId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const index = mockTestSuites.findIndex((s) => s.id === input.suiteId);
      if (index === -1) return false;
      mockTestSuites.splice(index, 1);
      return true;
    }),

  // List test runs
  runs: publicProcedure
    .input(
      z.object({
        suiteId: z.string().optional(),
        status: z
          .enum(["pending", "running", "completed", "failed"])
          .optional(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      let filtered = [...mockTestRuns];
      if (input.suiteId) {
        filtered = filtered.filter((r) => r.suiteId === input.suiteId);
      }
      if (input.status) {
        filtered = filtered.filter((r) => r.status === input.status);
      }
      return filtered.slice(0, input.limit);
    }),

  // Get single test run
  getRun: publicProcedure
    .input(
      z.object({
        runId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return mockTestRuns.find((r) => r.id === input.runId) ?? null;
    }),

  // Start a new test run
  startRun: publicProcedure
    .input(
      z.object({
        suiteId: z.string(),
        triggeredBy: z.enum(["manual", "ci", "schedule"]).default("manual"),
        commit: z.string().optional(),
        branch: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const suite = mockTestSuites.find((s) => s.id === input.suiteId);
      if (!suite) return null;

      const newRun = {
        id: `run_${Date.now()}`,
        suiteId: input.suiteId,
        suiteName: suite.name,
        status: "running" as const,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        startedAt: new Date(),
        completedAt: null as Date | null,
        triggeredBy: input.triggeredBy,
        commit: input.commit ?? "HEAD",
        branch: input.branch ?? "main",
      };

      mockTestRuns.unshift(newRun as any);
      return newRun;
    }),

  // Get test results for a run
  results: publicProcedure
    .input(
      z.object({
        runId: z.string(),
        status: z.enum(["passed", "failed", "skipped"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      let filtered = mockTestResults.filter((r) => r.runId === input.runId);
      if (input.status) {
        filtered = filtered.filter((r) => r.status === input.status);
      }
      return filtered;
    }),

  // Get test result details
  getResult: publicProcedure
    .input(
      z.object({
        resultId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return mockTestResults.find((r) => r.id === input.resultId) ?? null;
    }),

  // Compare two test runs
  compare: publicProcedure
    .input(
      z.object({
        baseRunId: z.string(),
        compareRunId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const baseRun = mockTestRuns.find((r) => r.id === input.baseRunId);
      const compareRun = mockTestRuns.find((r) => r.id === input.compareRunId);

      if (!baseRun || !compareRun) return null;

      return {
        base: baseRun,
        compare: compareRun,
        diff: {
          passedDelta: compareRun.passed - baseRun.passed,
          failedDelta: compareRun.failed - baseRun.failed,
          durationDelta: compareRun.duration - baseRun.duration,
        },
        regressions: [],
        improvements: [],
      };
    }),
});
