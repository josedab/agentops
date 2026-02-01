"""GitHub Actions integration for prompt regression testing."""

import json
import logging
from typing import Any

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False
    httpx = None

from .types import (
    CheckAnnotation,
    CheckConclusion,
    CheckOutput,
    CheckStatus,
    GitHubCheckRun,
    GitHubIntegrationConfig,
    PRComment,
    TestResult,
    TestRunSummary,
    TestStatus,
    TestSuiteResult,
)


logger = logging.getLogger(__name__)


class GitHubIntegration:
    """Integration with GitHub Actions for CI/CD regression testing."""

    def __init__(self, config: GitHubIntegrationConfig):
        """
        Initialize GitHub integration.

        Args:
            config: GitHub integration configuration
        """
        if not HAS_HTTPX:
            raise ImportError(
                "httpx is required for GitHub integration. "
                "Install it with: pip install agentops[github]"
            )

        self._config = config
        self._base_url = "https://api.github.com"
        self._headers = {
            "Authorization": f"token {config.token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def create_check_run(
        self,
        name: str,
        head_sha: str | None = None,
    ) -> GitHubCheckRun:
        """
        Create a new check run.

        Args:
            name: Name of the check run
            head_sha: Commit SHA (uses config.commit_sha if not provided)

        Returns:
            Created check run
        """
        sha = head_sha or self._config.commit_sha
        if not sha:
            raise ValueError("commit_sha must be provided")

        url = f"{self._base_url}/repos/{self._config.owner}/{self._config.repo}/check-runs"
        payload = {
            "name": name,
            "head_sha": sha,
            "status": "in_progress",
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=self._headers, json=payload)
            response.raise_for_status()
            data = response.json()

        return GitHubCheckRun(
            name=data["name"],
            head_sha=data["head_sha"],
            status=CheckStatus.IN_PROGRESS,
        )

    async def update_check_run(
        self,
        check_run_id: int,
        status: CheckStatus,
        conclusion: CheckConclusion | None = None,
        output: CheckOutput | None = None,
    ) -> None:
        """
        Update an existing check run.

        Args:
            check_run_id: ID of the check run
            status: New status
            conclusion: Conclusion (required when status is completed)
            output: Output to display
        """
        url = f"{self._base_url}/repos/{self._config.owner}/{self._config.repo}/check-runs/{check_run_id}"

        payload: dict[str, Any] = {"status": status.value}

        if conclusion:
            payload["conclusion"] = conclusion.value

        if output:
            payload["output"] = {
                "title": output.title,
                "summary": output.summary,
            }
            if output.text:
                payload["output"]["text"] = output.text
            if output.annotations and self._config.annotations_enabled:
                payload["output"]["annotations"] = [
                    {
                        "path": a.path,
                        "start_line": a.start_line,
                        "end_line": a.end_line,
                        "message": a.message,
                        "annotation_level": a.annotation_level,
                        **({"title": a.title} if a.title else {}),
                        **({"raw_details": a.raw_details} if a.raw_details else {}),
                    }
                    for a in output.annotations
                ]

        async with httpx.AsyncClient() as client:
            response = await client.patch(url, headers=self._headers, json=payload)
            response.raise_for_status()

    async def create_pr_comment(self, comment: PRComment) -> None:
        """
        Create a comment on a pull request.

        Args:
            comment: Comment to create
        """
        if not self._config.pr_number:
            logger.warning("PR number not set, skipping comment creation")
            return

        if comment.path and comment.line:
            # Create a review comment on a specific line
            url = f"{self._base_url}/repos/{self._config.owner}/{self._config.repo}/pulls/{self._config.pr_number}/comments"
            payload = {
                "body": comment.body,
                "path": comment.path,
                "line": comment.line,
                "side": comment.side or "RIGHT",
            }
        else:
            # Create an issue comment
            url = f"{self._base_url}/repos/{self._config.owner}/{self._config.repo}/issues/{self._config.pr_number}/comments"
            payload = {"body": comment.body}

        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=self._headers, json=payload)
            response.raise_for_status()

    async def report_results(
        self,
        result: TestSuiteResult,
        check_run_id: int | None = None,
    ) -> None:
        """
        Report test results to GitHub.

        Args:
            result: Test suite results
            check_run_id: Optional check run ID to update
        """
        conclusion = self._determine_conclusion(result)
        output = self._build_output(result)

        if check_run_id and self._config.create_check:
            await self.update_check_run(
                check_run_id=check_run_id,
                status=CheckStatus.COMPLETED,
                conclusion=conclusion,
                output=output,
            )

        if self._config.create_comment and self._config.pr_number:
            comment_body = self._build_comment_body(result)
            await self.create_pr_comment(PRComment(body=comment_body))

    def _determine_conclusion(self, result: TestSuiteResult) -> CheckConclusion:
        """Determine check conclusion from test results."""
        if result.status == TestStatus.ERROR:
            return CheckConclusion.FAILURE
        elif result.status == TestStatus.FAILED:
            if self._config.block_on_regression:
                return CheckConclusion.FAILURE
            return CheckConclusion.NEUTRAL
        elif result.status == TestStatus.PASSED:
            return CheckConclusion.SUCCESS
        else:
            return CheckConclusion.NEUTRAL

    def _build_output(self, result: TestSuiteResult) -> CheckOutput:
        """Build check output from test results."""
        summary = result.summary

        summary_text = f"""
## Test Results

| Metric | Value |
|--------|-------|
| Total | {summary.total} |
| Passed | {summary.passed} |
| Failed | {summary.failed} |
| Errors | {summary.errors} |
| Skipped | {summary.skipped} |
| Duration | {summary.duration_ms:.2f}ms |
"""

        # Build detailed text
        details = []
        for tr in result.results:
            status_emoji = {
                TestStatus.PASSED: "✅",
                TestStatus.FAILED: "❌",
                TestStatus.ERROR: "⚠️",
                TestStatus.SKIPPED: "⏭️",
            }.get(tr.status, "❓")

            details.append(f"### {status_emoji} {tr.test_case.name}")
            details.append(f"**Status**: {tr.status.value}")
            details.append(f"**Duration**: {tr.duration_ms:.2f}ms")

            if tr.error:
                details.append(f"**Error**: {tr.error.message}")

            if tr.assertion_results:
                details.append("\n**Assertions**:")
                for ar in tr.assertion_results:
                    emoji = "✅" if ar.passed else "❌"
                    details.append(f"- {emoji} {ar.assertion.field} {ar.assertion.type}: "
                                   f"expected `{ar.expected_value}`, got `{ar.actual_value}`")

            details.append("")

        text = "\n".join(details)

        # Build annotations for failures
        annotations = []
        for tr in result.results:
            if tr.status in (TestStatus.FAILED, TestStatus.ERROR):
                annotations.append(CheckAnnotation(
                    path=".agentops/tests.yaml",  # Default path
                    start_line=1,
                    end_line=1,
                    message=f"Test '{tr.test_case.name}' {tr.status.value}: "
                            f"{tr.error.message if tr.error else 'Assertion failed'}",
                    annotation_level="failure" if tr.status == TestStatus.FAILED else "warning",
                    title=tr.test_case.name,
                ))

        title = f"Prompt Regression: {summary.passed}/{summary.total} passed"
        if summary.failed > 0:
            title += f" ({summary.failed} failed)"

        return CheckOutput(
            title=title,
            summary=summary_text,
            text=text,
            annotations=annotations,
        )

    def _build_comment_body(self, result: TestSuiteResult) -> str:
        """Build PR comment body from test results."""
        summary = result.summary

        # Status emoji
        if result.status == TestStatus.PASSED:
            status = "✅ **All tests passed**"
        elif result.status == TestStatus.FAILED:
            status = "❌ **Tests failed**"
        else:
            status = "⚠️ **Tests had errors**"

        body = f"""
## 🧪 Prompt Regression Test Results

{status}

| Metric | Value |
|--------|-------|
| ✅ Passed | {summary.passed} |
| ❌ Failed | {summary.failed} |
| ⚠️ Errors | {summary.errors} |
| ⏭️ Skipped | {summary.skipped} |
| **Total** | {summary.total} |
| ⏱️ Duration | {summary.duration_ms:.2f}ms |

"""

        # Add failed tests details
        failed_tests = [tr for tr in result.results if tr.status != TestStatus.PASSED]
        if failed_tests:
            body += "### Failed Tests\n\n"
            for tr in failed_tests:
                body += f"<details><summary>❌ {tr.test_case.name}</summary>\n\n"
                body += f"**Prompt**: `{tr.test_case.prompt[:100]}...`\n\n"
                if tr.error:
                    body += f"**Error**: {tr.error.message}\n\n"
                if tr.assertion_results:
                    body += "**Assertions**:\n"
                    for ar in tr.assertion_results:
                        emoji = "✅" if ar.passed else "❌"
                        body += f"- {emoji} `{ar.assertion.field}` {ar.assertion.type}\n"
                body += "</details>\n\n"

        body += "\n---\n*Generated by AgentOps Prompt Regression Testing*"

        return body


async def run_github_ci_tests(
    suite_result: TestSuiteResult,
    config: GitHubIntegrationConfig,
) -> None:
    """
    Run tests and report to GitHub CI.

    Args:
        suite_result: Test suite results
        config: GitHub integration configuration
    """
    integration = GitHubIntegration(config)

    # Create check run
    check_run = None
    if config.create_check:
        check_run = await integration.create_check_run(
            name="Prompt Regression Tests",
        )

    # Report results
    await integration.report_results(
        result=suite_result,
        check_run_id=check_run.head_sha if check_run else None,  # This should be ID
    )
