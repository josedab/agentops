"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  GitBranch,
  GitCommit,
  BarChart3,
  Download,
  Plus,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  FileText,
  Settings,
} from "lucide-react";

// Mock data for demo
const mockTestRuns = [
  {
    id: "run_001",
    suiteId: "suite_core",
    suiteName: "Core Agent Tests",
    status: "passed" as const,
    startedAt: Date.now() - 3600000,
    durationMs: 45000,
    commitSha: "abc1234",
    branch: "main",
    prNumber: undefined,
    summary: {
      total: 24,
      passed: 24,
      failed: 0,
      warnings: 2,
      skipped: 0,
      errors: 0,
      passRate: 1.0,
      averageScore: 0.95,
      totalLatencyMs: 32000,
      totalTokens: 15420,
      totalCost: 0.0234,
      regressionCount: 0,
    },
  },
  {
    id: "run_002",
    suiteId: "suite_core",
    suiteName: "Core Agent Tests",
    status: "failed" as const,
    startedAt: Date.now() - 7200000,
    durationMs: 52000,
    commitSha: "def5678",
    branch: "feature/new-prompt",
    prNumber: 42,
    summary: {
      total: 24,
      passed: 21,
      failed: 3,
      warnings: 1,
      skipped: 0,
      errors: 0,
      passRate: 0.875,
      averageScore: 0.82,
      totalLatencyMs: 38000,
      totalTokens: 18200,
      totalCost: 0.0312,
      regressionCount: 2,
    },
  },
  {
    id: "run_003",
    suiteId: "suite_tools",
    suiteName: "Tool Usage Tests",
    status: "warning" as const,
    startedAt: Date.now() - 86400000,
    durationMs: 28000,
    commitSha: "ghi9012",
    branch: "main",
    prNumber: undefined,
    summary: {
      total: 12,
      passed: 11,
      failed: 0,
      warnings: 1,
      skipped: 1,
      errors: 0,
      passRate: 0.917,
      averageScore: 0.89,
      totalLatencyMs: 18000,
      totalTokens: 8500,
      totalCost: 0.0145,
      regressionCount: 1,
    },
  },
];

const mockTestSuites = [
  {
    id: "suite_core",
    name: "Core Agent Tests",
    description: "Regression tests for core agent functionality",
    testCount: 24,
    lastRun: Date.now() - 3600000,
    lastStatus: "passed" as const,
    avgPassRate: 0.96,
  },
  {
    id: "suite_tools",
    name: "Tool Usage Tests",
    description: "Tests for tool calling and MCP integration",
    testCount: 12,
    lastRun: Date.now() - 86400000,
    lastStatus: "warning" as const,
    avgPassRate: 0.91,
  },
  {
    id: "suite_safety",
    name: "Safety & Guardrails",
    description: "Tests for content safety and cost guardrails",
    testCount: 18,
    lastRun: Date.now() - 172800000,
    lastStatus: "passed" as const,
    avgPassRate: 0.98,
  },
];

export default function TestsPage() {
  const [selectedTab, setSelectedTab] = useState<"runs" | "suites">("runs");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Prompt Regression Tests</h1>
          <p className="text-muted-foreground">
            Manage test suites and view regression test results
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            New Test Suite
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatsCard
          label="Test Suites"
          value={mockTestSuites.length}
          icon={FileText}
        />
        <StatsCard
          label="Total Tests"
          value={mockTestSuites.reduce((sum, s) => sum + s.testCount, 0)}
          icon={CheckCircle}
        />
        <StatsCard
          label="Avg Pass Rate"
          value={`${((mockTestSuites.reduce((sum, s) => sum + s.avgPassRate, 0) / mockTestSuites.length) * 100).toFixed(1)}%`}
          icon={BarChart3}
        />
        <StatsCard
          label="Runs (24h)"
          value={
            mockTestRuns.filter((r) => r.startedAt > Date.now() - 86400000)
              .length
          }
          icon={Play}
        />
      </div>

      {/* Tabs */}
      <div className="border-b mb-4">
        <div className="flex gap-4">
          <button
            onClick={() => setSelectedTab("runs")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
              selectedTab === "runs"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            Recent Runs
          </button>
          <button
            onClick={() => setSelectedTab("suites")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
              selectedTab === "suites"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            Test Suites
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {selectedTab === "runs" ? (
          <TestRunsList
            runs={mockTestRuns}
            expandedRun={expandedRun}
            onToggleExpand={(id) =>
              setExpandedRun(expandedRun === id ? null : id)
            }
          />
        ) : (
          <TestSuitesList suites={mockTestSuites} />
        )}
      </div>
    </div>
  );
}

function StatsCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <div className="p-4 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function TestRunsList({
  runs,
  expandedRun,
  onToggleExpand,
}: {
  runs: typeof mockTestRuns;
  expandedRun: string | null;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <div key={run.id} className="border rounded-lg overflow-hidden">
          {/* Run header */}
          <div
            className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50"
            onClick={() => onToggleExpand(run.id)}
          >
            <button className="p-0.5">
              {expandedRun === run.id ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            <StatusBadge status={run.status} />

            <div className="flex-1 min-w-0">
              <div className="font-medium">{run.suiteName}</div>
              <div className="text-sm text-muted-foreground flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  {run.branch}
                </span>
                <span className="flex items-center gap-1">
                  <GitCommit className="h-3 w-3" />
                  {run.commitSha.slice(0, 7)}
                </span>
                {run.prNumber && (
                  <span className="text-primary">PR #{run.prNumber}</span>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-medium">
                {run.summary.passed}/{run.summary.total} passed
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDuration(run.durationMs)}
              </div>
            </div>

            <div className="text-right text-sm">
              <div className="font-mono">
                ${run.summary.totalCost.toFixed(4)}
              </div>
              <div className="text-xs text-muted-foreground">
                {run.summary.totalTokens.toLocaleString()} tokens
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              {formatTimeAgo(run.startedAt)}
            </div>
          </div>

          {/* Expanded details */}
          {expandedRun === run.id && (
            <div className="border-t p-4 bg-muted/20">
              <div className="grid grid-cols-6 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Pass Rate</div>
                  <div className="font-medium">
                    {(run.summary.passRate * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Avg Score</div>
                  <div className="font-medium">
                    {(run.summary.averageScore * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Failed</div>
                  <div className="font-medium text-red-500">
                    {run.summary.failed}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Warnings</div>
                  <div className="font-medium text-yellow-500">
                    {run.summary.warnings}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Regressions</div>
                  <div className="font-medium text-orange-500">
                    {run.summary.regressionCount}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Total Latency</div>
                  <div className="font-medium">
                    {formatDuration(run.summary.totalLatencyMs)}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded hover:bg-muted">
                  <BarChart3 className="h-4 w-4" />
                  View Details
                </button>
                <button className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded hover:bg-muted">
                  <Download className="h-4 w-4" />
                  Download Report
                </button>
                <button className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded hover:bg-muted">
                  <RefreshCw className="h-4 w-4" />
                  Re-run
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TestSuitesList({ suites }: { suites: typeof mockTestSuites }) {
  return (
    <div className="grid gap-4">
      {suites.map((suite) => (
        <div
          key={suite.id}
          className="flex items-center gap-4 p-4 border rounded-lg hover:border-primary/50 cursor-pointer"
        >
          <FileText className="h-8 w-8 text-muted-foreground" />

          <div className="flex-1 min-w-0">
            <div className="font-medium">{suite.name}</div>
            <div className="text-sm text-muted-foreground">
              {suite.description}
            </div>
          </div>

          <div className="text-center">
            <div className="text-lg font-medium">{suite.testCount}</div>
            <div className="text-xs text-muted-foreground">tests</div>
          </div>

          <div className="text-center">
            <div className="text-lg font-medium">
              {(suite.avgPassRate * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">avg pass rate</div>
          </div>

          <StatusBadge status={suite.lastStatus} />

          <div className="text-right text-sm text-muted-foreground">
            <div>Last run</div>
            <div>{formatTimeAgo(suite.lastRun)}</div>
          </div>

          <div className="flex gap-1">
            <button className="p-2 hover:bg-muted rounded" title="Run tests">
              <Play className="h-4 w-4" />
            </button>
            <button className="p-2 hover:bg-muted rounded" title="Settings">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: "passed" | "failed" | "warning" }) {
  const config = {
    passed: {
      icon: CheckCircle,
      className: "bg-green-500/10 text-green-600 border-green-500/20",
      label: "Passed",
    },
    failed: {
      icon: XCircle,
      className: "bg-red-500/10 text-red-600 border-red-500/20",
      label: "Failed",
    },
    warning: {
      icon: AlertTriangle,
      className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
      label: "Warning",
    },
  };

  const { icon: Icon, className, label } = config[status];

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}
