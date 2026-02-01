"""Natural language parser for alert configuration."""

import logging
import re
from typing import Any

from .types import (
    AlertCondition,
    AlertMetric,
    AlertRuleConfig,
    AlertSeverity,
    AlertTimeWindow,
    AlertRuleValidation,
    NLParserConfig,
    ParsedAlertRule,
    ParserCallbacks,
)


logger = logging.getLogger(__name__)


# Common patterns for NL parsing
METRIC_PATTERNS = {
    AlertMetric.COST: [
        r"\bcost[s]?\b",
        r"\bspend(?:ing)?\b",
        r"\bexpense[s]?\b",
        r"\$",
        r"\bdollar[s]?\b",
    ],
    AlertMetric.LATENCY: [
        r"\blatenc(?:y|ies)\b",
        r"\bresponse\s+time[s]?\b",
        r"\bdelay[s]?\b",
        r"\bslow(?:ness)?\b",
        r"\b(?:milli)?second[s]?\b",
    ],
    AlertMetric.ERROR_RATE: [
        r"\berror[s]?\s+rate\b",
        r"\bfailure[s]?\s+rate\b",
        r"\berror[s]?\s+percentage\b",
        r"\bfail(?:ure)?[s]?\b",
    ],
    AlertMetric.TOKEN_USAGE: [
        r"\btoken[s]?\b",
        r"\btoken\s+usage\b",
        r"\btoken\s+count\b",
    ],
    AlertMetric.REQUEST_COUNT: [
        r"\brequest[s]?\s+count\b",
        r"\bapi\s+call[s]?\b",
        r"\bnumber\s+of\s+request[s]?\b",
    ],
    AlertMetric.SUCCESS_RATE: [
        r"\bsuccess\s+rate\b",
        r"\bcompletion\s+rate\b",
    ],
    AlertMetric.THROUGHPUT: [
        r"\bthroughput\b",
        r"\brequests?\s+per\s+(?:second|minute|hour)\b",
    ],
    AlertMetric.QUALITY_SCORE: [
        r"\bquality\b",
        r"\bscore\b",
        r"\brating\b",
    ],
}

CONDITION_PATTERNS = {
    AlertCondition.EXCEEDS: [
        r"\bexceed[s]?\b",
        r"\bgreater\s+than\b",
        r"\babove\b",
        r"\bover\b",
        r"\bmore\s+than\b",
        r"\b>\b",
    ],
    AlertCondition.FALLS_BELOW: [
        r"\bfall[s]?\s+below\b",
        r"\bless\s+than\b",
        r"\bbelow\b",
        r"\bunder\b",
        r"\b<\b",
    ],
    AlertCondition.CHANGES_BY: [
        r"\bchange[s]?\s+by\b",
        r"\bincreas(?:e[s]?|ing)\s+by\b",
        r"\bdecreas(?:e[s]?|ing)\s+by\b",
        r"\bspike[s]?\b",
        r"\bdrop[s]?\b",
    ],
    AlertCondition.ANOMALY: [
        r"\banomal(?:y|ies|ous)\b",
        r"\bunusual\b",
        r"\babnormal\b",
    ],
}

TIME_WINDOW_PATTERNS = {
    AlertTimeWindow.MINUTE: [r"\bminut(?:e[s]?|ely)\b"],
    AlertTimeWindow.HOUR: [r"\bhour(?:s|ly)?\b"],
    AlertTimeWindow.DAY: [r"\bday(?:s|ily)?\b"],
    AlertTimeWindow.WEEK: [r"\bweek(?:s|ly)?\b"],
    AlertTimeWindow.MONTH: [r"\bmonth(?:s|ly)?\b"],
}

SEVERITY_PATTERNS = {
    AlertSeverity.CRITICAL: [r"\bcritical\b", r"\bsever[e]?\b", r"\bblock(?:ing)?\b", r"\bprod(?:uction)?\b"],
    AlertSeverity.HIGH: [r"\bhigh\b", r"\burgent\b", r"\bimportant\b"],
    AlertSeverity.MEDIUM: [r"\bmedium\b", r"\bmoderate\b"],
    AlertSeverity.LOW: [r"\blow\b", r"\bminor\b"],
}


class NLAlertParser:
    """Parser for natural language alert queries."""

    def __init__(
        self,
        config: NLParserConfig | None = None,
        callbacks: ParserCallbacks | None = None,
    ):
        """
        Initialize the NL alert parser.

        Args:
            config: Parser configuration
            callbacks: Optional callbacks for parser events
        """
        self._config = config or NLParserConfig()
        self._callbacks = callbacks or ParserCallbacks()

    def parse(self, query: str) -> ParsedAlertRule:
        """
        Parse a natural language query into an alert rule.

        Args:
            query: Natural language query describing the alert

        Returns:
            ParsedAlertRule with the parsed rule and metadata
        """
        if self._callbacks.on_parse_start:
            self._callbacks.on_parse_start(query)

        query_lower = query.lower().strip()
        ambiguities: list[str] = []
        suggestions: list[str] = []
        confidence = 1.0

        # Extract metric
        metric, metric_confidence = self._extract_metric(query_lower)
        if metric is None:
            ambiguities.append("Could not determine metric to monitor")
            metric = AlertMetric.COST  # Default
            confidence *= 0.5

        confidence *= metric_confidence

        # Extract condition
        condition, condition_confidence = self._extract_condition(query_lower)
        if condition is None:
            ambiguities.append("Could not determine alert condition")
            condition = AlertCondition.EXCEEDS  # Default
            confidence *= 0.7

        confidence *= condition_confidence

        # Extract threshold
        threshold, threshold_confidence = self._extract_threshold(query_lower, metric)
        if threshold is None:
            ambiguities.append("Could not determine threshold value")
            threshold = 100.0  # Default
            suggestions.append("Please specify a threshold value (e.g., '$10', '500ms', '5%')")
            confidence *= 0.5

        confidence *= threshold_confidence

        # Extract time window
        time_window = self._extract_time_window(query_lower)

        # Extract severity
        severity = self._extract_severity(query_lower)

        # Extract filters
        user_id = self._extract_user_filter(query_lower)
        feature_id = self._extract_feature_filter(query_lower)
        model = self._extract_model_filter(query_lower)

        # Build rule config
        rule = AlertRuleConfig(
            metric=metric,
            condition=condition,
            threshold=threshold,
            time_window=time_window,
            severity=severity,
            user_id=user_id,
            feature_id=feature_id,
            model=model,
        )

        # Generate suggestions if low confidence
        if confidence < self._config.confidence_threshold:
            suggestions.extend(self._generate_suggestions(rule))

        result = ParsedAlertRule(
            rule=rule,
            confidence=confidence,
            original_query=query,
            ambiguities=ambiguities[:self._config.max_suggestions],
            suggestions=suggestions[:self._config.max_suggestions],
        )

        if self._callbacks.on_parse_complete:
            self._callbacks.on_parse_complete(result)

        if ambiguities and self._callbacks.on_ambiguity:
            self._callbacks.on_ambiguity(query, ambiguities)

        return result

    def validate_rule(self, rule: AlertRuleConfig) -> AlertRuleValidation:
        """
        Validate an alert rule configuration.

        Args:
            rule: Rule to validate

        Returns:
            Validation result with errors and warnings
        """
        errors: list[str] = []
        warnings: list[str] = []

        # Validate metric
        if isinstance(rule.metric, str):
            try:
                AlertMetric(rule.metric)
            except ValueError:
                errors.append(f"Invalid metric: {rule.metric}")

        # Validate condition
        if isinstance(rule.condition, str):
            try:
                AlertCondition(rule.condition)
            except ValueError:
                errors.append(f"Invalid condition: {rule.condition}")

        # Validate threshold
        if rule.threshold < 0:
            errors.append("Threshold must be non-negative")

        if rule.metric == AlertMetric.ERROR_RATE and rule.threshold > 100:
            warnings.append("Error rate threshold seems high (>100%)")

        # Validate time window
        if isinstance(rule.time_window, str):
            try:
                AlertTimeWindow(rule.time_window)
            except ValueError:
                errors.append(f"Invalid time window: {rule.time_window}")

        # Validate cooldown
        if rule.notification_cooldown_minutes < 1:
            warnings.append("Notification cooldown is very short (<1 minute)")

        return AlertRuleValidation(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )

    def _extract_metric(self, query: str) -> tuple[AlertMetric | None, float]:
        """Extract metric from query."""
        matches: list[tuple[AlertMetric, int]] = []

        for metric, patterns in METRIC_PATTERNS.items():
            count = 0
            for pattern in patterns:
                if re.search(pattern, query, re.IGNORECASE):
                    count += 1
            if count > 0:
                matches.append((metric, count))

        if not matches:
            return None, 0.5

        # Return the metric with most matches
        matches.sort(key=lambda x: x[1], reverse=True)
        best_match = matches[0]

        # Higher confidence if clearly matched
        confidence = min(0.6 + (best_match[1] * 0.15), 1.0)
        return best_match[0], confidence

    def _extract_condition(self, query: str) -> tuple[AlertCondition | None, float]:
        """Extract condition from query."""
        for condition, patterns in CONDITION_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, query, re.IGNORECASE):
                    return condition, 0.9

        return None, 0.5

    def _extract_threshold(
        self, query: str, metric: AlertMetric | None
    ) -> tuple[float | None, float]:
        """Extract threshold value from query."""
        # Dollar amounts
        dollar_match = re.search(r'\$\s*([\d,]+(?:\.\d+)?)', query)
        if dollar_match:
            value = float(dollar_match.group(1).replace(',', ''))
            return value, 0.95

        # Percentages
        percent_match = re.search(r'([\d.]+)\s*%', query)
        if percent_match:
            value = float(percent_match.group(1))
            return value, 0.95

        # Time values (ms, seconds)
        time_match = re.search(r'([\d.]+)\s*(?:ms|millisecond[s]?)', query, re.IGNORECASE)
        if time_match:
            return float(time_match.group(1)), 0.95

        second_match = re.search(r'([\d.]+)\s*(?:s|second[s]?)', query, re.IGNORECASE)
        if second_match:
            return float(second_match.group(1)) * 1000, 0.95  # Convert to ms

        # Generic numbers
        number_match = re.search(r'(?:^|[^\d])([\d,]+(?:\.\d+)?)(?:[^\d]|$)', query)
        if number_match:
            value = float(number_match.group(1).replace(',', ''))
            return value, 0.7

        return None, 0.3

    def _extract_time_window(self, query: str) -> AlertTimeWindow:
        """Extract time window from query."""
        for window, patterns in TIME_WINDOW_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, query, re.IGNORECASE):
                    return window

        return AlertTimeWindow.HOUR  # Default

    def _extract_severity(self, query: str) -> AlertSeverity:
        """Extract severity from query."""
        for severity, patterns in SEVERITY_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, query, re.IGNORECASE):
                    return severity

        return AlertSeverity.MEDIUM  # Default

    def _extract_user_filter(self, query: str) -> str | None:
        """Extract user filter from query."""
        # Look for "user X", "user:X", "for user X"
        user_match = re.search(
            r'(?:for\s+)?user[:\s]+([a-zA-Z0-9_@.-]+)',
            query,
            re.IGNORECASE
        )
        if user_match:
            return user_match.group(1)
        return None

    def _extract_feature_filter(self, query: str) -> str | None:
        """Extract feature filter from query."""
        # Look for "feature X", "feature:X"
        feature_match = re.search(
            r'(?:for\s+)?feature[:\s]+([a-zA-Z0-9_-]+)',
            query,
            re.IGNORECASE
        )
        if feature_match:
            return feature_match.group(1)
        return None

    def _extract_model_filter(self, query: str) -> str | None:
        """Extract model filter from query."""
        # Look for common model names
        models = [
            "gpt-4", "gpt-4-turbo", "gpt-4o", "gpt-3.5-turbo",
            "claude-3", "claude-2", "claude-instant",
            "gemini", "gemini-pro",
        ]
        for model in models:
            if model in query.lower():
                return model
        return None

    def _generate_suggestions(self, rule: AlertRuleConfig) -> list[str]:
        """Generate suggestions for improving the rule."""
        suggestions: list[str] = []

        metric_name = rule.metric.value if isinstance(rule.metric, AlertMetric) else rule.metric
        condition_name = rule.condition.value if isinstance(rule.condition, AlertCondition) else rule.condition

        suggestions.append(
            f"Did you mean: Alert when {metric_name} {condition_name} {rule.threshold}?"
        )

        if not rule.user_id and not rule.feature_id:
            suggestions.append(
                "Tip: Add filters like 'for user X' or 'for feature Y' to narrow the scope"
            )

        return suggestions


def create_parser(
    config: NLParserConfig | None = None,
    callbacks: ParserCallbacks | None = None,
) -> NLAlertParser:
    """
    Create an NL alert parser.

    Args:
        config: Parser configuration
        callbacks: Optional callbacks

    Returns:
        NLAlertParser instance
    """
    return NLAlertParser(config=config, callbacks=callbacks)
