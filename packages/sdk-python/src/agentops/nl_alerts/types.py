"""Natural language alert configuration types."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable


class AlertMetric(str, Enum):
    """Metrics that can be monitored."""
    COST = "cost"
    LATENCY = "latency"
    ERROR_RATE = "error_rate"
    TOKEN_USAGE = "token_usage"
    REQUEST_COUNT = "request_count"
    SUCCESS_RATE = "success_rate"
    THROUGHPUT = "throughput"
    QUALITY_SCORE = "quality_score"


class AlertCondition(str, Enum):
    """Conditions for triggering alerts."""
    EXCEEDS = "exceeds"
    FALLS_BELOW = "falls_below"
    EQUALS = "equals"
    CHANGES_BY = "changes_by"
    ANOMALY = "anomaly"


class AlertTimeWindow(str, Enum):
    """Time windows for aggregation."""
    MINUTE = "minute"
    HOUR = "hour"
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


class AlertSeverity(str, Enum):
    """Alert severity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertChannel(str, Enum):
    """Notification channels."""
    EMAIL = "email"
    SLACK = "slack"
    WEBHOOK = "webhook"
    PAGERDUTY = "pagerduty"
    SMS = "sms"


@dataclass
class AlertRuleConfig:
    """Configuration for an alert rule."""
    metric: AlertMetric | str
    condition: AlertCondition | str
    threshold: float
    time_window: AlertTimeWindow | str = AlertTimeWindow.HOUR
    severity: AlertSeverity | str = AlertSeverity.MEDIUM
    # Filters
    user_id: str | None = None
    feature_id: str | None = None
    model: str | None = None
    session_tag: str | None = None
    # Notification
    channels: list[AlertChannel | str] = field(default_factory=lambda: [AlertChannel.EMAIL])
    notification_cooldown_minutes: int = 60
    # Metadata
    name: str | None = None
    description: str | None = None
    enabled: bool = True
    created_at: float = field(default_factory=lambda: datetime.now().timestamp() * 1000)


@dataclass
class ParsedAlertRule:
    """Result of parsing a natural language alert query."""
    rule: AlertRuleConfig
    confidence: float
    original_query: str
    ambiguities: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)


@dataclass
class AlertRuleValidation:
    """Result of validating an alert rule."""
    valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class AlertEvent:
    """An alert event that was triggered."""
    rule_id: str
    rule_config: AlertRuleConfig
    triggered_at: float
    metric_value: float
    threshold: float
    message: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AlertFeedback:
    """User feedback on an alert."""
    alert_id: str
    rule_id: str
    helpful: bool
    feedback_type: str | None = None  # "false_positive", "too_sensitive", "missed_issue", etc.
    comment: str | None = None
    timestamp: float = field(default_factory=lambda: datetime.now().timestamp() * 1000)


@dataclass
class FeedbackStats:
    """Statistics on alert feedback."""
    total_feedback: int = 0
    helpful_count: int = 0
    not_helpful_count: int = 0
    false_positive_count: int = 0
    too_sensitive_count: int = 0
    missed_issue_count: int = 0
    helpfulness_rate: float = 0.0


# Pattern definitions for NL parsing

@dataclass
class ParsePattern:
    """A pattern for matching natural language queries."""
    pattern: str
    metric: AlertMetric
    condition: AlertCondition | None = None
    extract_threshold: Callable[[Any], float | None] | None = None
    extract_time_window: Callable[[Any], AlertTimeWindow | None] | None = None
    priority: int = 0


# Callback types

@dataclass
class ParserCallbacks:
    """Callbacks for parser events."""
    on_parse_start: Callable[[str], None] | None = None
    on_parse_complete: Callable[[ParsedAlertRule], None] | None = None
    on_ambiguity: Callable[[str, list[str]], None] | None = None
    on_llm_fallback: Callable[[str], None] | None = None


@dataclass
class RuleEngineCallbacks:
    """Callbacks for rule engine events."""
    on_rule_added: Callable[[str, AlertRuleConfig], None] | None = None
    on_rule_removed: Callable[[str], None] | None = None
    on_rule_triggered: Callable[[AlertEvent], None] | None = None
    on_alert_sent: Callable[[AlertEvent, AlertChannel], None] | None = None


@dataclass
class NLParserConfig:
    """Configuration for the NL alert parser."""
    use_llm_fallback: bool = True
    llm_model: str | None = None
    confidence_threshold: float = 0.7
    max_suggestions: int = 3
    debug: bool = False


@dataclass
class RuleEngineConfig:
    """Configuration for the rule engine."""
    max_rules_per_org: int = 100
    evaluation_interval_seconds: float = 60.0
    enable_notifications: bool = True
    default_channels: list[AlertChannel | str] = field(default_factory=lambda: [AlertChannel.EMAIL])
