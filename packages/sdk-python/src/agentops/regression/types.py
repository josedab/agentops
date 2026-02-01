"""Regression testing module types."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable


class AssertionType(str, Enum):
    """Types of assertions for test cases."""
    EQUALS = "equals"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    MATCHES = "matches"
    GREATER_THAN = "greater_than"
    LESS_THAN = "less_than"
    BETWEEN = "between"
    SIMILARITY = "similarity"
    CUSTOM = "custom"


class TestStatus(str, Enum):
    """Status of a test run."""
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"
    SKIPPED = "skipped"


@dataclass
class Assertion:
    """An assertion to verify in a test case."""
    type: AssertionType | str
    field: str
    value: Any
    tolerance: float | None = None
    custom_validator: Callable[[Any, Any], bool] | None = None
    message: str | None = None


@dataclass
class TestCase:
    """A single test case."""
    name: str
    prompt: str
    assertions: list[Assertion] = field(default_factory=list)
    context: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)
    timeout_ms: int | None = None
    retries: int = 0
    tags: list[str] = field(default_factory=list)


@dataclass
class TestSuite:
    """A collection of test cases."""
    name: str
    version: str
    tests: list[TestCase] = field(default_factory=list)
    description: str | None = None
    setup: Callable[[], None] | None = None
    teardown: Callable[[], None] | None = None
    config: dict[str, Any] = field(default_factory=dict)


@dataclass
class AssertionResult:
    """Result of an assertion evaluation."""
    assertion: Assertion
    passed: bool
    actual_value: Any
    expected_value: Any
    message: str | None = None


@dataclass
class TestError:
    """Error that occurred during test execution."""
    type: str
    message: str
    stack: str | None = None


@dataclass
class TestResult:
    """Result of a single test case execution."""
    test_case: TestCase
    status: TestStatus
    assertion_results: list[AssertionResult] = field(default_factory=list)
    error: TestError | None = None
    response: str | None = None
    duration_ms: float = 0
    started_at: float = 0
    completed_at: float = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TestRunSummary:
    """Summary of a test suite run."""
    total: int = 0
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    duration_ms: float = 0


@dataclass
class TestSuiteResult:
    """Result of running a test suite."""
    suite: TestSuite
    results: list[TestResult] = field(default_factory=list)
    summary: TestRunSummary = field(default_factory=TestRunSummary)
    status: TestStatus = TestStatus.PENDING
    started_at: float = 0
    completed_at: float = 0


@dataclass
class BaselineComparison:
    """Comparison of test results to a baseline."""
    test_name: str
    current_result: TestResult
    baseline_result: TestResult | None
    regressions: list[str] = field(default_factory=list)
    improvements: list[str] = field(default_factory=list)


# GitHub integration types

class CheckStatus(str, Enum):
    """GitHub check status."""
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class CheckConclusion(str, Enum):
    """GitHub check conclusion."""
    SUCCESS = "success"
    FAILURE = "failure"
    NEUTRAL = "neutral"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"
    ACTION_REQUIRED = "action_required"
    SKIPPED = "skipped"


@dataclass
class AnnotationLevel:
    """Annotation severity level."""
    NOTICE: str = "notice"
    WARNING: str = "warning"
    FAILURE: str = "failure"


@dataclass
class CheckAnnotation:
    """A GitHub check annotation."""
    path: str
    start_line: int
    end_line: int
    message: str
    annotation_level: str = "failure"
    title: str | None = None
    raw_details: str | None = None


@dataclass
class CheckOutput:
    """Output for a GitHub check."""
    title: str
    summary: str
    text: str | None = None
    annotations: list[CheckAnnotation] = field(default_factory=list)


@dataclass
class GitHubCheckRun:
    """A GitHub check run."""
    name: str
    head_sha: str
    status: CheckStatus
    conclusion: CheckConclusion | None = None
    output: CheckOutput | None = None
    started_at: str | None = None
    completed_at: str | None = None


@dataclass
class PRComment:
    """A pull request comment."""
    body: str
    path: str | None = None
    line: int | None = None
    side: str | None = None


# Configuration types

@dataclass
class TestRunnerConfig:
    """Configuration for the test runner."""
    parallel: bool = False
    max_parallel: int = 5
    timeout_ms: int = 30000
    retry_failed: bool = False
    max_retries: int = 3
    fail_fast: bool = False
    baseline_path: str | None = None
    output_path: str | None = None
    verbose: bool = False


@dataclass
class GitHubIntegrationConfig:
    """Configuration for GitHub integration."""
    token: str
    owner: str
    repo: str
    base_ref: str = "main"
    pr_number: int | None = None
    commit_sha: str | None = None
    create_check: bool = True
    create_comment: bool = True
    block_on_regression: bool = True
    annotations_enabled: bool = True


# LLM Client types

@dataclass
class LLMResponse:
    """Response from an LLM client."""
    content: str
    model: str
    usage: dict[str, int] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)
    latency_ms: float = 0
    finish_reason: str | None = None


class LLMClient:
    """Interface for LLM clients used in regression testing."""

    async def complete(
        self,
        prompt: str,
        context: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        """
        Generate a completion for the given prompt.

        Args:
            prompt: The prompt to complete
            context: Optional context for the completion
            **kwargs: Additional arguments

        Returns:
            LLMResponse with the completion
        """
        raise NotImplementedError()


# Callback types

@dataclass
class TestCallbacks:
    """Callbacks for test execution events."""
    on_test_start: Callable[[TestCase], None] | None = None
    on_test_complete: Callable[[TestResult], None] | None = None
    on_suite_start: Callable[[TestSuite], None] | None = None
    on_suite_complete: Callable[[TestSuiteResult], None] | None = None
    on_assertion: Callable[[AssertionResult], None] | None = None


@dataclass
class TestRunnerOptions:
    """Options for creating a test runner."""
    llm_client: LLMClient
    config: TestRunnerConfig = field(default_factory=TestRunnerConfig)
    callbacks: TestCallbacks = field(default_factory=TestCallbacks)
