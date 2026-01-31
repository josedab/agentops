/**
 * Export Router
 *
 * API endpoints for data export functionality.
 */

import { Hono } from "hono";
import { z } from "zod";

// Schemas
const createExportSchema = z.object({
  type: z.enum(["sessions", "events", "metrics", "audit_log"]),
  format: z.enum(["json", "csv", "parquet", "ndjson"]).default("json"),
  compression: z.enum(["none", "gzip", "zstd"]).default("gzip"),
  filters: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    sessionIds: z.array(z.string()).optional(),
    userIds: z.array(z.string()).optional(),
    featureIds: z.array(z.string()).optional(),
    status: z.array(z.enum(["active", "completed", "error"])).optional(),
    tags: z.array(z.string()).optional(),
  }),
  fields: z.array(z.string()).optional(), // Specific fields to include
  includeEvents: z.boolean().default(false), // For sessions export
  callback: z
    .object({
      url: z.string().url(),
      headers: z.record(z.string()).optional(),
    })
    .optional(),
});

// Export job type definition
interface ExportJobConfig {
  id: string;
  projectId: string;
  type: string;
  format: string;
  compression: string;
  filters: Record<string, unknown>;
  fields: string[] | null;
  includeEvents: boolean;
  callback: { url: string } | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  rowCount: number | null;
  fileSize: number | null;
  downloadUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  createdBy: string;
}

// Mock data
const mockExportJobs: ExportJobConfig[] = [
  {
    id: "export_001",
    projectId: "proj_1",
    type: "sessions",
    format: "json",
    compression: "gzip",
    filters: {
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-01-28T23:59:59Z",
    },
    fields: null,
    includeEvents: true,
    callback: null,
    status: "completed",
    progress: 100,
    rowCount: 5420,
    fileSize: 2621440, // 2.5 MB
    downloadUrl: "https://exports.agentops.dev/export_001.json.gz",
    errorMessage: null,
    createdAt: "2026-01-28T08:00:00Z",
    startedAt: "2026-01-28T08:00:05Z",
    completedAt: "2026-01-28T08:02:30Z",
    expiresAt: "2027-01-29T08:02:30Z", // Far future expiry
    createdBy: "user_admin",
  },
  {
    id: "export_002",
    projectId: "proj_1",
    type: "events",
    format: "parquet",
    compression: "zstd",
    filters: {
      startDate: "2026-01-20T00:00:00Z",
      endDate: "2026-01-28T23:59:59Z",
      featureIds: ["chat-agent"],
    },
    fields: [
      "eventId",
      "sessionId",
      "type",
      "timestamp",
      "model",
      "tokens",
      "cost",
    ],
    includeEvents: false,
    callback: { url: "https://api.company.com/export-complete" },
    status: "processing",
    progress: 67,
    rowCount: null,
    fileSize: null,
    downloadUrl: null,
    errorMessage: null,
    createdAt: "2026-01-28T10:30:00Z",
    startedAt: "2026-01-28T10:30:05Z",
    completedAt: null,
    expiresAt: null,
    createdBy: "user_456",
  },
  {
    id: "export_003",
    projectId: "proj_1",
    type: "metrics",
    format: "csv",
    compression: "none",
    filters: {
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-01-15T23:59:59Z",
    },
    fields: null,
    includeEvents: false,
    callback: null,
    status: "failed",
    progress: 45,
    rowCount: null,
    fileSize: null,
    downloadUrl: null,
    errorMessage: "Query timeout: too much data requested",
    createdAt: "2026-01-27T14:00:00Z",
    startedAt: "2026-01-27T14:00:05Z",
    completedAt: null,
    expiresAt: null,
    createdBy: "user_789",
  },
];

// Router
const router = new Hono();

/**
 * GET / - List export jobs
 */
router.get("/", async (c) => {
  const projectId = c.get("projectId");
  const status = c.req.query("status");
  const type = c.req.query("type");
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  let jobs = mockExportJobs.filter(
    (j) => j.projectId === projectId || projectId === "proj_1",
  );

  if (status) {
    jobs = jobs.filter((j) => j.status === status);
  }
  if (type) {
    jobs = jobs.filter((j) => j.type === type);
  }

  // Sort by createdAt descending
  jobs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const total = jobs.length;
  const paginatedJobs = jobs.slice(offset, offset + limit);

  return c.json({
    data: paginatedJobs,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
    },
  });
});

/**
 * GET /:exportId - Get export job details
 */
router.get("/:exportId", async (c) => {
  const exportId = c.req.param("exportId");

  const job = mockExportJobs.find((j) => j.id === exportId);
  if (!job) {
    return c.json({ error: "Not Found", message: "Export job not found" }, 404);
  }

  return c.json({ data: job });
});

/**
 * POST / - Create export job
 */
router.post("/", async (c) => {
  const body = await c.req.json();
  const projectId = c.get("projectId") ?? "proj_1";

  const validated = createExportSchema.parse(body);

  // Estimate row count and time
  const startDate = new Date(validated.filters.startDate);
  const endDate = new Date(validated.filters.endDate);
  const daysDiff = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const estimatedRows = daysDiff * 150; // Rough estimate
  const estimatedTimeSeconds = Math.ceil(estimatedRows / 1000) * 5;

  const newJob = {
    id: `export_${Date.now()}`,
    projectId,
    type: validated.type,
    format: validated.format,
    compression: validated.compression,
    filters: validated.filters,
    fields: validated.fields ?? null,
    includeEvents: validated.includeEvents,
    callback: validated.callback ?? null,
    status: "queued" as const,
    progress: 0,
    rowCount: null,
    fileSize: null,
    downloadUrl: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    expiresAt: null,
    createdBy: "current_user",
  };

  mockExportJobs.push(newJob as ExportJobConfig);

  return c.json(
    {
      data: {
        ...newJob,
        estimate: {
          rows: estimatedRows,
          timeSeconds: estimatedTimeSeconds,
        },
      },
    },
    202,
  );
});

/**
 * DELETE /:exportId - Cancel export job
 */
router.delete("/:exportId", async (c) => {
  const exportId = c.req.param("exportId");

  const job = mockExportJobs.find((j) => j.id === exportId);
  if (!job) {
    return c.json({ error: "Not Found", message: "Export job not found" }, 404);
  }

  if (job.status === "completed" || job.status === "failed") {
    // Remove the job from list
    const index = mockExportJobs.indexOf(job);
    mockExportJobs.splice(index, 1);
    return c.json({ data: { success: true, message: "Export job deleted" } });
  }

  // Cancel in-progress job
  job.status = "cancelled";
  job.errorMessage = "Cancelled by user";

  return c.json({ data: { success: true, message: "Export job cancelled" } });
});

/**
 * GET /:exportId/download - Get download URL
 */
router.get("/:exportId/download", async (c) => {
  const exportId = c.req.param("exportId");

  const job = mockExportJobs.find((j) => j.id === exportId);
  if (!job) {
    return c.json({ error: "Not Found", message: "Export job not found" }, 404);
  }

  if (job.status !== "completed") {
    return c.json(
      {
        error: "Bad Request",
        message: `Export is not ready. Current status: ${job.status}`,
      },
      400,
    );
  }

  if (job.expiresAt && new Date(job.expiresAt) < new Date()) {
    return c.json({ error: "Gone", message: "Export file has expired" }, 410);
  }

  // Generate signed URL (in production, use cloud storage signed URLs)
  const signedUrl = `${job.downloadUrl}?token=signed_${Date.now()}&expires=${Date.now() + 3600000}`;

  return c.json({
    data: {
      downloadUrl: signedUrl,
      fileSize: job.fileSize,
      format: job.format,
      compression: job.compression,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // URL valid for 1 hour
    },
  });
});

/**
 * POST /estimate - Estimate export size and time
 */
router.post("/estimate", async (c) => {
  const body = await c.req.json();

  const validated = createExportSchema.parse(body);

  // Calculate estimate
  const startDate = new Date(validated.filters.startDate);
  const endDate = new Date(validated.filters.endDate);
  const daysDiff = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  let baseRowsPerDay = 150;
  if (validated.type === "events") baseRowsPerDay = 1500;
  if (validated.type === "metrics") baseRowsPerDay = 24; // hourly

  let estimatedRows = daysDiff * baseRowsPerDay;

  // Apply filters
  if (validated.filters.featureIds?.length) {
    estimatedRows = Math.ceil(estimatedRows / 3);
  }
  if (validated.filters.userIds?.length) {
    estimatedRows = Math.ceil(estimatedRows / 10);
  }

  // Events included multiplier
  if (validated.includeEvents && validated.type === "sessions") {
    estimatedRows *= 10;
  }

  // Size estimates
  let bytesPerRow = 500; // JSON
  if (validated.format === "csv") bytesPerRow = 200;
  if (validated.format === "parquet") bytesPerRow = 100;

  let estimatedSize = estimatedRows * bytesPerRow;
  if (validated.compression === "gzip")
    estimatedSize = Math.ceil(estimatedSize * 0.15);
  if (validated.compression === "zstd")
    estimatedSize = Math.ceil(estimatedSize * 0.12);

  const estimatedTimeSeconds = Math.ceil(estimatedRows / 1000) * 5;

  return c.json({
    data: {
      estimatedRows,
      estimatedSize,
      estimatedSizeHuman: formatBytes(estimatedSize),
      estimatedTimeSeconds,
      estimatedTimeHuman: formatDuration(estimatedTimeSeconds),
    },
  });
});

// Helper functions
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutes`;
  return `${(seconds / 3600).toFixed(1)} hours`;
}

export { router as exportRouter };
