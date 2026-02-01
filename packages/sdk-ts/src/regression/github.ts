/**
 * Prompt Regression Testing - GitHub Integration
 *
 * GitHub Actions integration for CI/CD prompt regression testing.
 */

import type { TestRun } from "./types.js";

// ============================================================================
// GitHub Actions Types
// ============================================================================

export interface GitHubContext {
  owner: string;
  repo: string;
  sha: string;
  ref: string;
  prNumber?: number;
  actor: string;
  runId: number;
  runNumber: number;
  workflow: string;
  job: string;
}

export interface CheckRunOutput {
  title: string;
  summary: string;
  text?: string;
  annotations?: CheckRunAnnotation[];
}

export interface CheckRunAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "notice" | "warning" | "failure";
  message: string;
  title?: string;
}

export interface PRComment {
  body: string;
}

// ============================================================================
// GitHub Reporter
// ============================================================================

export interface GitHubReporterOptions {
  token: string;
  context: GitHubContext;
  checkName?: string;
  createComment?: boolean;
  failOnRegression?: boolean;
}

/**
 * GitHubReporter integrates with GitHub Actions to report test results.
 */
export class GitHubReporter {
  private readonly options: Required<GitHubReporterOptions>;

  constructor(options: GitHubReporterOptions) {
    this.options = {
      checkName: "AgentOps Prompt Regression",
      createComment: true,
      failOnRegression: true,
      ...options,
    };
  }

  /**
   * Report test run results to GitHub
   */
  async report(run: TestRun): Promise<void> {
    // Create check run
    const checkOutput = this.generateCheckOutput(run);
    await this.createCheckRun(run, checkOutput);

    // Create PR comment if in PR context
    if (this.options.context.prNumber && this.options.createComment) {
      const comment = this.generatePRComment(run);
      await this.createOrUpdatePRComment(comment);
    }
  }

  /**
   * Generate check run output
   */
  private generateCheckOutput(run: TestRun): CheckRunOutput {
    const { summary } = run;
    const statusEmoji = this.getStatusEmoji(run.status);

    const title = `${statusEmoji} ${summary.passed}/${summary.total} tests passed`;

    const summaryLines = [
      `## Prompt Regression Test Results`,
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Tests | ${summary.total} |`,
      `| Passed | ${summary.passed} ✅ |`,
      `| Failed | ${summary.failed} ❌ |`,
      `| Warnings | ${summary.warnings} ⚠️ |`,
      `| Errors | ${summary.errors} 🔥 |`,
      `| Pass Rate | ${(summary.passRate * 100).toFixed(1)}% |`,
      `| Avg Score | ${(summary.averageScore * 100).toFixed(1)}% |`,
      `| Regressions | ${summary.regressionCount} |`,
      "",
      `**Duration:** ${this.formatDuration(run.durationMs ?? 0)}`,
      `**Total Cost:** $${summary.totalCost.toFixed(4)}`,
      `**Total Tokens:** ${summary.totalTokens.toLocaleString()}`,
    ];

    // Add failed tests section
    const failedTests = run.results.filter((r) =>
      ["failed", "error"].includes(r.status),
    );
    if (failedTests.length > 0) {
      summaryLines.push("", "### Failed Tests", "");
      for (const test of failedTests) {
        summaryLines.push(`- **${test.testCaseName}** (${test.testCaseId})`);
        for (const assertion of test.assertionResults.filter(
          (a) => !a.passed,
        )) {
          summaryLines.push(
            `  - ❌ ${assertion.type}: ${assertion.message ?? "Failed"}`,
          );
        }
        if (test.error) {
          summaryLines.push(`  - 🔥 Error: ${test.error.message}`);
        }
      }
    }

    // Add regressions section
    const regressions = run.results.filter(
      (r) => r.baselineComparison?.isRegression,
    );
    if (regressions.length > 0) {
      summaryLines.push("", "### Regressions Detected", "");
      for (const test of regressions) {
        summaryLines.push(`- **${test.testCaseName}**`);
        for (const reg of test.baselineComparison!.regressions) {
          summaryLines.push(`  - ⚠️ ${reg.message}`);
        }
      }
    }

    // Generate annotations for IDE integration
    const annotations = this.generateAnnotations(run);

    return {
      title,
      summary: summaryLines.join("\n"),
      annotations,
    };
  }

  /**
   * Generate annotations for failed tests
   */
  private generateAnnotations(run: TestRun): CheckRunAnnotation[] {
    const annotations: CheckRunAnnotation[] = [];

    for (const result of run.results) {
      if (result.status === "passed") continue;

      // Create annotation for the test file (assuming test file path convention)
      const testFilePath = `tests/prompts/${result.testCaseId}.test.yaml`;

      for (const assertion of result.assertionResults.filter(
        (a) => !a.passed,
      )) {
        annotations.push({
          path: testFilePath,
          start_line: 1,
          end_line: 1,
          annotation_level:
            assertion.severity === "error" ? "failure" : "warning",
          title: `${assertion.type} assertion failed`,
          message:
            assertion.message ??
            `Expected: ${JSON.stringify(assertion.expected)}, Got: ${JSON.stringify(assertion.actual)}`,
        });
      }

      if (result.baselineComparison?.isRegression) {
        for (const regression of result.baselineComparison.regressions) {
          annotations.push({
            path: testFilePath,
            start_line: 1,
            end_line: 1,
            annotation_level:
              regression.severity === "error" ? "failure" : "warning",
            title: `${regression.type} regression`,
            message: regression.message,
          });
        }
      }

      if (result.error) {
        annotations.push({
          path: testFilePath,
          start_line: 1,
          end_line: 1,
          annotation_level: "failure",
          title: "Test Error",
          message: result.error.message,
        });
      }
    }

    return annotations;
  }

  /**
   * Generate PR comment body
   */
  private generatePRComment(run: TestRun): PRComment {
    const { summary } = run;
    const statusEmoji = this.getStatusEmoji(run.status);
    const statusText = this.getStatusText(run.status);

    const lines = [
      `## ${statusEmoji} AgentOps Prompt Regression Tests`,
      "",
      `**Status:** ${statusText}`,
      `**Commit:** \`${this.options.context.sha.slice(0, 7)}\``,
      "",
      "### Summary",
      "",
      "| Tests | Pass Rate | Regressions | Cost | Duration |",
      "|-------|-----------|-------------|------|----------|",
      `| ${summary.passed}/${summary.total} | ${(summary.passRate * 100).toFixed(1)}% | ${summary.regressionCount} | $${summary.totalCost.toFixed(4)} | ${this.formatDuration(run.durationMs ?? 0)} |`,
    ];

    // Results table
    if (run.results.length > 0) {
      lines.push("", "### Test Results", "");
      lines.push("| Test | Status | Score | Latency | Tokens | Cost |");
      lines.push("|------|--------|-------|---------|--------|------|");

      for (const result of run.results.slice(0, 20)) {
        const emoji = this.getStatusEmoji(result.status);
        const latency = result.response?.latencyMs ?? 0;
        const tokens = result.response?.totalTokens ?? 0;
        const cost = result.response?.cost ?? 0;

        lines.push(
          `| ${result.testCaseName} | ${emoji} | ${(result.score * 100).toFixed(0)}% | ${latency}ms | ${tokens} | $${cost.toFixed(4)} |`,
        );
      }

      if (run.results.length > 20) {
        lines.push(`| ... and ${run.results.length - 20} more | | | | | |`);
      }
    }

    // Regressions callout
    const regressions = run.results.filter(
      (r) => r.baselineComparison?.isRegression,
    );
    if (regressions.length > 0) {
      lines.push("", "### ⚠️ Regressions Detected", "");
      lines.push("<details>");
      lines.push("<summary>View regression details</summary>");
      lines.push("");

      for (const test of regressions) {
        lines.push(`**${test.testCaseName}**`);
        for (const reg of test.baselineComparison!.regressions) {
          const delta =
            reg.delta > 0
              ? `+${reg.delta.toFixed(1)}%`
              : `${reg.delta.toFixed(1)}%`;
          lines.push(
            `- ${reg.type}: ${reg.baseline} → ${reg.current} (${delta})`,
          );
        }
        lines.push("");
      }

      lines.push("</details>");
    }

    // Footer
    lines.push(
      "",
      "---",
      `<sub>Powered by [AgentOps](https://agentops.dev) • [View full report](https://app.agentops.dev/runs/${run.id})</sub>`,
    );

    return { body: lines.join("\n") };
  }

  /**
   * Create a check run via GitHub API
   */
  private async createCheckRun(
    run: TestRun,
    output: CheckRunOutput,
  ): Promise<void> {
    const { context, token, checkName } = this.options;

    const conclusion =
      run.status === "passed"
        ? "success"
        : run.status === "warning"
          ? "neutral"
          : "failure";

    const response = await fetch(
      `https://api.github.com/repos/${context.owner}/${context.repo}/check-runs`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          name: checkName,
          head_sha: context.sha,
          status: "completed",
          conclusion,
          output,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create check run: ${error}`);
    }
  }

  /**
   * Create or update PR comment
   */
  private async createOrUpdatePRComment(comment: PRComment): Promise<void> {
    const { context, token } = this.options;
    if (!context.prNumber) return;

    const commentMarker = "<!-- agentops-regression-tests -->";
    const bodyWithMarker = `${commentMarker}\n${comment.body}`;

    // Find existing comment
    const commentsResponse = await fetch(
      `https://api.github.com/repos/${context.owner}/${context.repo}/issues/${context.prNumber}/comments`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!commentsResponse.ok) {
      throw new Error(
        `Failed to fetch comments: ${await commentsResponse.text()}`,
      );
    }

    const comments = (await commentsResponse.json()) as Array<{
      id: number;
      body: string;
    }>;
    const existingComment = comments.find((c) =>
      c.body.includes(commentMarker),
    );

    if (existingComment) {
      // Update existing comment
      await fetch(
        `https://api.github.com/repos/${context.owner}/${context.repo}/issues/comments/${existingComment.id}`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({ body: bodyWithMarker }),
        },
      );
    } else {
      // Create new comment
      await fetch(
        `https://api.github.com/repos/${context.owner}/${context.repo}/issues/${context.prNumber}/comments`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({ body: bodyWithMarker }),
        },
      );
    }
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case "passed":
        return "✅";
      case "failed":
        return "❌";
      case "warning":
        return "⚠️";
      case "error":
        return "🔥";
      case "skipped":
        return "⏭️";
      default:
        return "❓";
    }
  }

  private getStatusText(status: string): string {
    switch (status) {
      case "passed":
        return "All tests passed";
      case "failed":
        return "Some tests failed";
      case "warning":
        return "Tests passed with warnings";
      case "error":
        return "Test run had errors";
      default:
        return status;
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
}

// ============================================================================
// GitHub Actions Workflow Generator
// ============================================================================

export interface WorkflowOptions {
  name?: string;
  triggers?: {
    push?: { branches?: string[] };
    pullRequest?: { branches?: string[] };
    schedule?: string;
    workflowDispatch?: boolean;
  };
  testDir?: string;
  nodeVersion?: string;
  model?: string;
  failOnRegression?: boolean;
}

/**
 * Generate a GitHub Actions workflow file for prompt regression testing
 */
export function generateWorkflow(options: WorkflowOptions = {}): string {
  const {
    name = "Prompt Regression Tests",
    triggers = {
      push: { branches: ["main"] },
      pullRequest: { branches: ["main"] },
    },
    testDir = "tests/prompts",
    nodeVersion = "20",
    model = "gpt-4",
    failOnRegression = true,
  } = options;

  const workflow = `name: ${name}

on:
${triggers.push ? `  push:\n    branches: [${triggers.push.branches?.map((b) => `"${b}"`).join(", ") ?? '"main"'}]` : ""}
${triggers.pullRequest ? `  pull_request:\n    branches: [${triggers.pullRequest.branches?.map((b) => `"${b}"`).join(", ") ?? '"main"'}]` : ""}
${triggers.schedule ? `  schedule:\n    - cron: "${triggers.schedule}"` : ""}
${triggers.workflowDispatch ? "  workflow_dispatch:" : ""}

jobs:
  regression-tests:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      checks: write
      pull-requests: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "${nodeVersion}"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run prompt regression tests
        env:
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
          AGENTOPS_API_KEY: \${{ secrets.AGENTOPS_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          npx agentops-test run \\
            --test-dir "${testDir}" \\
            --model "${model}" \\
            --reporter github \\
            ${failOnRegression ? "--fail-on-regression" : ""}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: prompt-regression-results
          path: |
            ${testDir}/.results/
            ${testDir}/.baselines/
`;

  return workflow;
}

/**
 * Generate the agentops-test CLI configuration file
 */
export function generateTestConfig(options: {
  testDir?: string;
  model?: string;
  parallel?: boolean;
  timeout?: number;
  minPassRate?: number;
}): string {
  return JSON.stringify(
    {
      $schema: "https://agentops.dev/schemas/test-config.json",
      testDir: options.testDir ?? "tests/prompts",
      testPattern: "**/*.test.yaml",
      parallel: options.parallel ?? true,
      maxConcurrency: 5,
      timeout: options.timeout ?? 60000,
      minPassRate: options.minPassRate ?? 0.95,
      failOnWarning: false,
      autoUpdateBaselines: false,
      provider: {
        type: "openai",
        defaultModel: options.model ?? "gpt-4",
      },
      reporters: [
        { type: "console" },
        { type: "json", options: { output: ".results/report.json" } },
      ],
    },
    null,
    2,
  );
}
