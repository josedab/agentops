import { z } from "zod";
import { router, publicProcedure } from "../trpc";

export const exportRouter = router({
  // Export sessions
  exportSessions: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        format: z.enum(["json", "csv", "parquet"]),
        filters: z
          .object({
            startDate: z.date().optional(),
            endDate: z.date().optional(),
            status: z.enum(["active", "completed", "error"]).optional(),
            userId: z.string().optional(),
            featureId: z.string().optional(),
          })
          .optional(),
        limit: z.number().min(1).max(100000).default(10000),
      }),
    )
    .mutation(async ({ input }) => {
      // In production, this would queue an export job
      const jobId = `export_${Date.now()}`;

      return {
        jobId,
        status: "queued",
        format: input.format,
        estimatedRows: Math.min(input.limit, 5000),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };
    }),

  // Export events
  exportEvents: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        format: z.enum(["json", "csv", "parquet"]),
        filters: z
          .object({
            sessionId: z.string().optional(),
            startDate: z.date().optional(),
            endDate: z.date().optional(),
            eventTypes: z.array(z.string()).optional(),
          })
          .optional(),
        limit: z.number().min(1).max(1000000).default(100000),
      }),
    )
    .mutation(async ({ input }) => {
      const jobId = `export_${Date.now()}`;

      return {
        jobId,
        status: "queued",
        format: input.format,
        estimatedRows: Math.min(input.limit, 50000),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
    }),

  // Export metrics
  exportMetrics: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        format: z.enum(["json", "csv"]),
        metrics: z.array(
          z.enum(["sessions", "events", "cost", "tokens", "latency", "errors"]),
        ),
        granularity: z.enum(["minute", "hour", "day"]),
        startDate: z.date(),
        endDate: z.date(),
      }),
    )
    .mutation(async ({ input }) => {
      const jobId = `export_${Date.now()}`;

      return {
        jobId,
        status: "queued",
        format: input.format,
        metrics: input.metrics,
        granularity: input.granularity,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
    }),

  // Check export job status
  getExportStatus: publicProcedure
    .input(
      z.object({
        jobId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      // Simulate job completion
      const createdAt = parseInt(input.jobId.split("_")[1] ?? "0");
      const elapsed = Date.now() - createdAt;

      if (elapsed < 5000) {
        return {
          jobId: input.jobId,
          status: "processing" as const,
          progress: Math.min(95, Math.floor(elapsed / 50)),
        };
      }

      return {
        jobId: input.jobId,
        status: "completed" as const,
        progress: 100,
        downloadUrl: `https://exports.agentops.dev/${input.jobId}.zip`,
        fileSize: 1024 * 1024 * 2.5, // 2.5 MB
        rowCount: 5000,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
    }),

  // List recent exports
  listExports: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input }) => {
      // Mock recent exports
      return [
        {
          jobId: "export_1706500000000",
          type: "sessions",
          format: "csv",
          status: "completed" as const,
          rowCount: 5000,
          fileSize: 1024 * 1024 * 2.5,
          createdAt: new Date("2026-01-28T10:00:00Z"),
          expiresAt: new Date("2026-01-29T10:00:00Z"),
          downloadUrl: "https://exports.agentops.dev/export_1.zip",
        },
        {
          jobId: "export_1706400000000",
          type: "events",
          format: "json",
          status: "completed" as const,
          rowCount: 50000,
          fileSize: 1024 * 1024 * 15,
          createdAt: new Date("2026-01-27T10:00:00Z"),
          expiresAt: new Date("2026-01-28T10:00:00Z"),
          downloadUrl: "https://exports.agentops.dev/export_2.zip",
        },
      ].slice(0, input.limit);
    }),
});
