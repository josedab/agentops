"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";

export default function ExportPage() {
  const [exportType, setExportType] = useState<
    "sessions" | "events" | "metrics"
  >("sessions");
  const [format, setFormat] = useState<"json" | "csv" | "parquet">("csv");
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  });
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    "sessions",
    "cost",
    "tokens",
  ]);
  const [granularity, setGranularity] = useState<"minute" | "hour" | "day">(
    "hour",
  );
  const [exporting, setExporting] = useState(false);

  const { data: recentExports, refetch } = trpc.export.listExports.useQuery({});
  const exportSessionsMutation = trpc.export.exportSessions.useMutation({
    onSuccess: () => {
      setExporting(false);
      refetch();
    },
  });
  const exportEventsMutation = trpc.export.exportEvents.useMutation({
    onSuccess: () => {
      setExporting(false);
      refetch();
    },
  });
  const exportMetricsMutation = trpc.export.exportMetrics.useMutation({
    onSuccess: () => {
      setExporting(false);
      refetch();
    },
  });

  const handleExport = () => {
    setExporting(true);
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);

    if (exportType === "sessions") {
      exportSessionsMutation.mutate({
        projectId: "proj_1",
        format: format as "json" | "csv" | "parquet",
        filters: { startDate, endDate },
      });
    } else if (exportType === "events") {
      exportEventsMutation.mutate({
        projectId: "proj_1",
        format: format as "json" | "csv" | "parquet",
        filters: { startDate, endDate },
      });
    } else {
      exportMetricsMutation.mutate({
        projectId: "proj_1",
        format: format as "json" | "csv",
        metrics: selectedMetrics as (
          | "sessions"
          | "events"
          | "cost"
          | "tokens"
          | "latency"
          | "errors"
        )[],
        granularity,
        startDate,
        endDate,
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Data Export
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Export your data in various formats for analysis or backup
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            New Export
          </h2>

          <div className="space-y-4">
            {/* Export Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Data Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["sessions", "events", "metrics"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setExportType(type)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      exportType === type
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Format */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Format
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["csv", "json", "parquet"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    disabled={exportType === "metrics" && f === "parquet"}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      format === f
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, start: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, end: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Metrics Options */}
            {exportType === "metrics" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Metrics to Include
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      "sessions",
                      "events",
                      "cost",
                      "tokens",
                      "latency",
                      "errors",
                    ].map((metric) => (
                      <label key={metric} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedMetrics.includes(metric)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMetrics([...selectedMetrics, metric]);
                            } else {
                              setSelectedMetrics(
                                selectedMetrics.filter((m) => m !== metric),
                              );
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                          {metric}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Granularity
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["minute", "hour", "day"] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => setGranularity(g)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          granularity === g
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? "Creating Export..." : "Start Export"}
            </button>
          </div>
        </div>

        {/* Recent Exports */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Recent Exports
            </h2>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[500px] overflow-y-auto">
            {recentExports?.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No exports yet
              </div>
            ) : (
              recentExports?.map((exportJob) => (
                <div key={exportJob.jobId} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          exportJob.status === "completed"
                            ? "bg-green-500"
                            : exportJob.status === "processing"
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        }`}
                      />
                      <span className="font-medium text-gray-900 dark:text-white capitalize">
                        {exportJob.type}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded uppercase">
                        {exportJob.format}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {formatDistanceToNow(new Date(exportJob.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-gray-500">
                    <span>
                      {exportJob.rowCount?.toLocaleString()} rows •{" "}
                      {formatFileSize(exportJob.fileSize ?? 0)}
                    </span>
                    {exportJob.status === "completed" &&
                      exportJob.downloadUrl && (
                        <a
                          href={exportJob.downloadUrl}
                          className="text-blue-600 hover:text-blue-800"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Download
                        </a>
                      )}
                  </div>
                  {exportJob.expiresAt && (
                    <div className="mt-1 text-xs text-gray-400">
                      Expires{" "}
                      {formatDistanceToNow(new Date(exportJob.expiresAt), {
                        addSuffix: true,
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Export Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
          Export Information
        </h3>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>
            • Exports are processed in the background and available for download
            for 24 hours
          </li>
          <li>
            • CSV format is best for spreadsheet applications (Excel, Google
            Sheets)
          </li>
          <li>
            • JSON format preserves nested data structures and is best for
            programmatic access
          </li>
          <li>
            • Parquet format is compressed and optimized for data analysis tools
            (Pandas, DuckDB)
          </li>
          <li>• Large exports may take several minutes to complete</li>
        </ul>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
