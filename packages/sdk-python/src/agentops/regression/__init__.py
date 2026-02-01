"""Regression testing module for prompt quality assurance."""

from .types import (
    # Assertion types
    Assertion,
    AssertionResult,
    AssertionType,
    # Test types
    TestCase,
    TestSuite,
    TestResult,
    TestRunSummary,
    TestSuiteResult,
    TestStatus,
    TestError,
    # LLM types
    LLMClient,
    LLMResponse,
    # Config types
    TestRunnerConfig,
    TestRunnerOptions,
    TestCallbacks,
    # GitHub types
    GitHubIntegrationConfig,
    GitHubCheckRun,
    CheckStatus,
    CheckConclusion,
    CheckAnnotation,
    CheckOutput,
    PRComment,
    # Baseline types
    BaselineComparison,
)
from .runner import TestRunner, create_test_runner
from .parser import (
    parse_test_file,
    parse_test_suite,
    parse_test_case,
    parse_assertion,
    dump_test_suite,
    validate_test_file,
    YAMLParseError,
)
from .github import GitHubIntegration, run_github_ci_tests

__all__ = [
    # Assertion types
    "Assertion",
    "AssertionResult",
    "AssertionType",
    # Test types
    "TestCase",
    "TestSuite",
    "TestResult",
    "TestRunSummary",
    "TestSuiteResult",
    "TestStatus",
    "TestError",
    # LLM types
    "LLMClient",
    "LLMResponse",
    # Config types
    "TestRunnerConfig",
    "TestRunnerOptions",
    "TestCallbacks",
    # GitHub types
    "GitHubIntegrationConfig",
    "GitHubCheckRun",
    "CheckStatus",
    "CheckConclusion",
    "CheckAnnotation",
    "CheckOutput",
    "PRComment",
    # Baseline types
    "BaselineComparison",
    # Runner
    "TestRunner",
    "create_test_runner",
    # Parser
    "parse_test_file",
    "parse_test_suite",
    "parse_test_case",
    "parse_assertion",
    "dump_test_suite",
    "validate_test_file",
    "YAMLParseError",
    # GitHub
    "GitHubIntegration",
    "run_github_ci_tests",
]
