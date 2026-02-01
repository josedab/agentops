"""Test runner for prompt regression testing."""

import asyncio
import logging
import re
from datetime import datetime
from typing import Any

from .types import (
    Assertion,
    AssertionResult,
    AssertionType,
    LLMClient,
    LLMResponse,
    TestCallbacks,
    TestCase,
    TestError,
    TestResult,
    TestRunnerConfig,
    TestRunnerOptions,
    TestRunSummary,
    TestStatus,
    TestSuite,
    TestSuiteResult,
)


logger = logging.getLogger(__name__)


class TestRunner:
    """Test runner for executing prompt regression tests."""

    def __init__(self, options: TestRunnerOptions):
        """
        Initialize the test runner.

        Args:
            options: Test runner options including LLM client and config
        """
        self._llm_client = options.llm_client
        self._config = options.config
        self._callbacks = options.callbacks

    async def run_suite(self, suite: TestSuite) -> TestSuiteResult:
        """
        Run a test suite.

        Args:
            suite: Test suite to run

        Returns:
            Test suite result
        """
        result = TestSuiteResult(
            suite=suite,
            status=TestStatus.RUNNING,
            started_at=datetime.now().timestamp() * 1000,
        )

        if self._callbacks.on_suite_start:
            self._callbacks.on_suite_start(suite)

        # Run setup if defined
        if suite.setup:
            try:
                suite.setup()
            except Exception as e:
                logger.error(f"Suite setup failed: {e}")
                result.status = TestStatus.ERROR
                return result

        try:
            if self._config.parallel:
                # Run tests in parallel
                semaphore = asyncio.Semaphore(self._config.max_parallel)

                async def run_with_semaphore(test: TestCase) -> TestResult:
                    async with semaphore:
                        return await self._run_test(test, suite.config)

                tasks = [run_with_semaphore(test) for test in suite.tests]
                test_results = await asyncio.gather(*tasks, return_exceptions=True)

                for i, tr in enumerate(test_results):
                    if isinstance(tr, Exception):
                        result.results.append(TestResult(
                            test_case=suite.tests[i],
                            status=TestStatus.ERROR,
                            error=TestError(
                                type=type(tr).__name__,
                                message=str(tr),
                            ),
                        ))
                    else:
                        result.results.append(tr)
            else:
                # Run tests sequentially
                for test in suite.tests:
                    test_result = await self._run_test(test, suite.config)
                    result.results.append(test_result)

                    if self._config.fail_fast and test_result.status == TestStatus.FAILED:
                        break

        except Exception as e:
            logger.error(f"Suite execution failed: {e}")
            result.status = TestStatus.ERROR

        finally:
            # Run teardown if defined
            if suite.teardown:
                try:
                    suite.teardown()
                except Exception as e:
                    logger.error(f"Suite teardown failed: {e}")

        # Calculate summary
        result.summary = self._calculate_summary(result.results)
        result.completed_at = datetime.now().timestamp() * 1000
        result.summary.duration_ms = result.completed_at - result.started_at

        # Determine overall status
        if result.summary.errors > 0:
            result.status = TestStatus.ERROR
        elif result.summary.failed > 0:
            result.status = TestStatus.FAILED
        else:
            result.status = TestStatus.PASSED

        if self._callbacks.on_suite_complete:
            self._callbacks.on_suite_complete(result)

        return result

    async def run_test(self, test: TestCase, config: dict[str, Any] | None = None) -> TestResult:
        """
        Run a single test case.

        Args:
            test: Test case to run
            config: Optional configuration

        Returns:
            Test result
        """
        return await self._run_test(test, config or {})

    async def _run_test(self, test: TestCase, suite_config: dict[str, Any]) -> TestResult:
        """Run a single test case."""
        result = TestResult(
            test_case=test,
            status=TestStatus.RUNNING,
            started_at=datetime.now().timestamp() * 1000,
        )

        if self._callbacks.on_test_start:
            self._callbacks.on_test_start(test)

        retries = test.retries if self._config.retry_failed else 0
        timeout_ms = test.timeout_ms or self._config.timeout_ms

        for attempt in range(retries + 1):
            try:
                # Get LLM response
                response = await asyncio.wait_for(
                    self._llm_client.complete(
                        prompt=test.prompt,
                        context=test.context,
                        **suite_config,
                    ),
                    timeout=timeout_ms / 1000,
                )

                result.response = response.content
                result.metadata = {
                    "model": response.model,
                    "usage": response.usage,
                    "latency_ms": response.latency_ms,
                    "finish_reason": response.finish_reason,
                }

                # Evaluate assertions
                for assertion in test.assertions:
                    assertion_result = self._evaluate_assertion(
                        assertion,
                        response,
                    )
                    result.assertion_results.append(assertion_result)

                    if self._callbacks.on_assertion:
                        self._callbacks.on_assertion(assertion_result)

                # Determine test status
                all_passed = all(ar.passed for ar in result.assertion_results)
                result.status = TestStatus.PASSED if all_passed else TestStatus.FAILED

                if result.status == TestStatus.PASSED or attempt == retries:
                    break

            except asyncio.TimeoutError:
                result.status = TestStatus.ERROR
                result.error = TestError(
                    type="TimeoutError",
                    message=f"Test timed out after {timeout_ms}ms",
                )
                if attempt < retries:
                    continue
                break

            except Exception as e:
                result.status = TestStatus.ERROR
                result.error = TestError(
                    type=type(e).__name__,
                    message=str(e),
                )
                if attempt < retries:
                    continue
                break

        result.completed_at = datetime.now().timestamp() * 1000
        result.duration_ms = result.completed_at - result.started_at

        if self._callbacks.on_test_complete:
            self._callbacks.on_test_complete(result)

        return result

    def _evaluate_assertion(
        self,
        assertion: Assertion,
        response: LLMResponse,
    ) -> AssertionResult:
        """Evaluate a single assertion against the response."""
        actual_value = self._get_field_value(assertion.field, response)
        expected_value = assertion.value
        passed = False
        message = None

        try:
            assertion_type = (
                assertion.type if isinstance(assertion.type, AssertionType)
                else AssertionType(assertion.type)
            )

            if assertion_type == AssertionType.EQUALS:
                passed = actual_value == expected_value

            elif assertion_type == AssertionType.CONTAINS:
                if isinstance(actual_value, str) and isinstance(expected_value, str):
                    passed = expected_value.lower() in actual_value.lower()
                elif isinstance(actual_value, (list, tuple)):
                    passed = expected_value in actual_value
                else:
                    passed = str(expected_value) in str(actual_value)

            elif assertion_type == AssertionType.NOT_CONTAINS:
                if isinstance(actual_value, str) and isinstance(expected_value, str):
                    passed = expected_value.lower() not in actual_value.lower()
                elif isinstance(actual_value, (list, tuple)):
                    passed = expected_value not in actual_value
                else:
                    passed = str(expected_value) not in str(actual_value)

            elif assertion_type == AssertionType.MATCHES:
                if isinstance(actual_value, str) and isinstance(expected_value, str):
                    passed = bool(re.search(expected_value, actual_value))
                else:
                    passed = False
                    message = "Matches assertion requires string values"

            elif assertion_type == AssertionType.GREATER_THAN:
                passed = float(actual_value) > float(expected_value)

            elif assertion_type == AssertionType.LESS_THAN:
                passed = float(actual_value) < float(expected_value)

            elif assertion_type == AssertionType.BETWEEN:
                if isinstance(expected_value, (list, tuple)) and len(expected_value) >= 2:
                    passed = expected_value[0] <= float(actual_value) <= expected_value[1]
                else:
                    passed = False
                    message = "Between assertion requires [min, max] value"

            elif assertion_type == AssertionType.SIMILARITY:
                # Simple similarity check - can be enhanced with embeddings
                if isinstance(actual_value, str) and isinstance(expected_value, str):
                    tolerance = assertion.tolerance or 0.8
                    similarity = self._calculate_similarity(actual_value, expected_value)
                    passed = similarity >= tolerance
                    message = f"Similarity: {similarity:.2f}"
                else:
                    passed = False
                    message = "Similarity assertion requires string values"

            elif assertion_type == AssertionType.CUSTOM:
                if assertion.custom_validator:
                    passed = assertion.custom_validator(actual_value, expected_value)
                else:
                    passed = False
                    message = "Custom assertion requires custom_validator function"

        except Exception as e:
            passed = False
            message = str(e)

        return AssertionResult(
            assertion=assertion,
            passed=passed,
            actual_value=actual_value,
            expected_value=expected_value,
            message=message or assertion.message,
        )

    def _get_field_value(self, field: str, response: LLMResponse) -> Any:
        """Get a field value from the response."""
        if field == "content":
            return response.content
        elif field == "model":
            return response.model
        elif field == "latency_ms":
            return response.latency_ms
        elif field == "finish_reason":
            return response.finish_reason
        elif field.startswith("usage."):
            usage_field = field[6:]
            return response.usage.get(usage_field)
        elif field.startswith("metadata."):
            metadata_field = field[9:]
            return response.metadata.get(metadata_field)
        else:
            # Try to access as attribute or dict key
            if hasattr(response, field):
                return getattr(response, field)
            return None

    def _calculate_similarity(self, a: str, b: str) -> float:
        """Calculate simple similarity between two strings (Jaccard)."""
        if not a or not b:
            return 0.0

        words_a = set(a.lower().split())
        words_b = set(b.lower().split())

        intersection = words_a & words_b
        union = words_a | words_b

        if not union:
            return 0.0

        return len(intersection) / len(union)

    def _calculate_summary(self, results: list[TestResult]) -> TestRunSummary:
        """Calculate summary statistics from test results."""
        summary = TestRunSummary(total=len(results))

        for result in results:
            if result.status == TestStatus.PASSED:
                summary.passed += 1
            elif result.status == TestStatus.FAILED:
                summary.failed += 1
            elif result.status == TestStatus.ERROR:
                summary.errors += 1
            elif result.status == TestStatus.SKIPPED:
                summary.skipped += 1

        return summary


def create_test_runner(
    llm_client: LLMClient,
    config: TestRunnerConfig | None = None,
    callbacks: TestCallbacks | None = None,
) -> TestRunner:
    """
    Create a test runner.

    Args:
        llm_client: LLM client for generating completions
        config: Optional test runner configuration
        callbacks: Optional callbacks for test events

    Returns:
        TestRunner instance
    """
    options = TestRunnerOptions(
        llm_client=llm_client,
        config=config or TestRunnerConfig(),
        callbacks=callbacks or TestCallbacks(),
    )
    return TestRunner(options)
