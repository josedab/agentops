"""YAML test file parser for regression testing."""

import logging
from pathlib import Path
from typing import Any

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False
    yaml = None

from .types import (
    Assertion,
    AssertionType,
    TestCase,
    TestSuite,
)


logger = logging.getLogger(__name__)


class YAMLParseError(Exception):
    """Error parsing YAML test file."""
    pass


def parse_test_file(file_path: str | Path) -> TestSuite:
    """
    Parse a YAML test file into a TestSuite.

    Args:
        file_path: Path to the YAML file

    Returns:
        Parsed TestSuite

    Raises:
        YAMLParseError: If parsing fails
    """
    if not HAS_YAML:
        raise ImportError(
            "PyYAML is required for YAML parsing. "
            "Install it with: pip install agentops[testing]"
        )

    path = Path(file_path)
    if not path.exists():
        raise YAMLParseError(f"Test file not found: {file_path}")

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise YAMLParseError(f"Invalid YAML: {e}")

    return parse_test_suite(data, source=str(file_path))


def parse_test_suite(data: dict[str, Any], source: str | None = None) -> TestSuite:
    """
    Parse a dictionary into a TestSuite.

    Args:
        data: Dictionary with test suite data
        source: Optional source identifier

    Returns:
        Parsed TestSuite

    Raises:
        YAMLParseError: If parsing fails
    """
    if not isinstance(data, dict):
        raise YAMLParseError("Test suite must be a dictionary")

    # Validate required fields
    if "name" not in data:
        raise YAMLParseError("Test suite must have a 'name' field")

    version = data.get("version", "1.0")
    if isinstance(version, (int, float)):
        version = str(version)

    # Parse test cases
    tests_data = data.get("tests", data.get("testCases", []))
    if not isinstance(tests_data, list):
        raise YAMLParseError("'tests' must be a list")

    tests = []
    for i, test_data in enumerate(tests_data):
        try:
            test = parse_test_case(test_data)
            tests.append(test)
        except YAMLParseError as e:
            raise YAMLParseError(f"Error parsing test case {i + 1}: {e}")

    return TestSuite(
        name=data["name"],
        version=version,
        tests=tests,
        description=data.get("description"),
        config=data.get("config", {}),
    )


def parse_test_case(data: dict[str, Any]) -> TestCase:
    """
    Parse a dictionary into a TestCase.

    Args:
        data: Dictionary with test case data

    Returns:
        Parsed TestCase

    Raises:
        YAMLParseError: If parsing fails
    """
    if not isinstance(data, dict):
        raise YAMLParseError("Test case must be a dictionary")

    if "name" not in data:
        raise YAMLParseError("Test case must have a 'name' field")
    if "prompt" not in data:
        raise YAMLParseError("Test case must have a 'prompt' field")

    # Parse assertions
    assertions_data = data.get("assertions", [])
    if not isinstance(assertions_data, list):
        raise YAMLParseError("'assertions' must be a list")

    assertions = []
    for j, assertion_data in enumerate(assertions_data):
        try:
            assertion = parse_assertion(assertion_data)
            assertions.append(assertion)
        except YAMLParseError as e:
            raise YAMLParseError(f"Error parsing assertion {j + 1}: {e}")

    return TestCase(
        name=data["name"],
        prompt=data["prompt"],
        assertions=assertions,
        context=data.get("context", {}),
        metadata=data.get("metadata", {}),
        timeout_ms=data.get("timeout_ms") or data.get("timeoutMs"),
        retries=data.get("retries", 0),
        tags=data.get("tags", []),
    )


def parse_assertion(data: dict[str, Any]) -> Assertion:
    """
    Parse a dictionary into an Assertion.

    Args:
        data: Dictionary with assertion data

    Returns:
        Parsed Assertion

    Raises:
        YAMLParseError: If parsing fails
    """
    if not isinstance(data, dict):
        raise YAMLParseError("Assertion must be a dictionary")

    if "type" not in data:
        raise YAMLParseError("Assertion must have a 'type' field")
    if "field" not in data:
        raise YAMLParseError("Assertion must have a 'field' field")
    if "value" not in data and "expected" not in data:
        raise YAMLParseError("Assertion must have a 'value' or 'expected' field")

    # Normalize assertion type
    assertion_type = data["type"]
    try:
        if isinstance(assertion_type, str):
            assertion_type = AssertionType(assertion_type.lower().replace("-", "_"))
    except ValueError:
        # Allow custom assertion types
        pass

    return Assertion(
        type=assertion_type,
        field=data["field"],
        value=data.get("value", data.get("expected")),
        tolerance=data.get("tolerance"),
        message=data.get("message"),
    )


def dump_test_suite(suite: TestSuite) -> str:
    """
    Dump a TestSuite to YAML string.

    Args:
        suite: TestSuite to dump

    Returns:
        YAML string
    """
    if not HAS_YAML:
        raise ImportError(
            "PyYAML is required for YAML dumping. "
            "Install it with: pip install agentops[testing]"
        )

    data = {
        "name": suite.name,
        "version": suite.version,
        "description": suite.description,
        "tests": [
            {
                "name": test.name,
                "prompt": test.prompt,
                "assertions": [
                    {
                        "type": (
                            a.type.value if isinstance(a.type, AssertionType)
                            else a.type
                        ),
                        "field": a.field,
                        "value": a.value,
                        **({"tolerance": a.tolerance} if a.tolerance else {}),
                        **({"message": a.message} if a.message else {}),
                    }
                    for a in test.assertions
                ],
                **({"context": test.context} if test.context else {}),
                **({"metadata": test.metadata} if test.metadata else {}),
                **({"timeout_ms": test.timeout_ms} if test.timeout_ms else {}),
                **({"retries": test.retries} if test.retries else {}),
                **({"tags": test.tags} if test.tags else {}),
            }
            for test in suite.tests
        ],
        **({"config": suite.config} if suite.config else {}),
    }

    # Remove None values
    data = {k: v for k, v in data.items() if v is not None}

    return yaml.dump(data, default_flow_style=False, sort_keys=False)


def validate_test_file(file_path: str | Path) -> list[str]:
    """
    Validate a YAML test file.

    Args:
        file_path: Path to the YAML file

    Returns:
        List of validation errors (empty if valid)
    """
    errors = []

    try:
        suite = parse_test_file(file_path)

        if not suite.tests:
            errors.append("Test suite has no test cases")

        for i, test in enumerate(suite.tests):
            if not test.prompt.strip():
                errors.append(f"Test case {i + 1} '{test.name}' has empty prompt")

            if not test.assertions:
                errors.append(f"Test case {i + 1} '{test.name}' has no assertions")

    except YAMLParseError as e:
        errors.append(str(e))

    return errors
