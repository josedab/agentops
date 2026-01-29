"""AgentOps - AI Agent Observability SDK"""

from agentops.client import AgentOps
from agentops.config import Config
from agentops.session import Session
from agentops.types import Event, EventType

# Quality scoring
from agentops.quality import (
    QualityEvaluator,
    QualityCriterion,
    QualityRubric,
    QualityScore,
    QualityConfig,
)

# Multi-agent correlation
from agentops.correlation import (
    TraceManager,
    TraceContext,
    SpanInfo,
    AgentInfo,
    CorrelationConfig,
)

# Prompt optimization
from agentops.prompts import (
    PromptRegistry,
    PromptTemplate,
    PromptExperiment,
)

# Anomaly detection
from agentops.anomaly import (
    AnomalyDetector,
    AnomalyConfig,
    MetricSnapshot,
    DetectedAnomaly,
    AnomalyType,
    AnomalySeverity,
)

# Replay & simulation
from agentops.replay import (
    ReplayEngine,
    ReplayConfig,
    CapturedSession,
    CapturedEvent,
    SimulationResult,
    ReplayMode,
)

# Context window analysis
from agentops.context import (
    ContextWindowAnalyzer,
    ContextConfig,
    ContextAnalysis,
    ContextSegment,
    ContextSuggestion,
)

# Team collaboration
from agentops.collaboration import (
    CollaborationHub,
    CollaborationConfig,
    TeamMember,
    Investigation,
    Annotation,
)

# Compliance & audit
from agentops.compliance import (
    ComplianceManager,
    ComplianceConfig,
    PIIDetectionResult,
    PIIType,
    AuditLogEntry,
)

# Budget & cost management
from agentops.budget import (
    BudgetManager,
    BudgetConfig,
    Budget,
    BudgetPeriod,
    CostForecast,
)

# Streaming trace visualization
from agentops.streaming import (
    StreamingClient,
    StreamingConfig,
    StreamingEvent,
    StreamingEventType,
    StreamingFilters,
    StreamingHandlers,
    StreamingError,
    Subscription,
    TokenChunk,
    ConnectionState,
    ConnectionInfo,
    create_streaming_client,
)

# Regression testing
from agentops.regression import (
    TestRunner,
    TestRunnerConfig,
    TestRunnerOptions,
    TestCase,
    TestSuite,
    TestResult,
    TestSuiteResult,
    TestStatus,
    Assertion,
    AssertionType,
    AssertionResult,
    LLMClient,
    LLMResponse,
    create_test_runner,
    parse_test_file,
    parse_test_suite,
    GitHubIntegration,
    GitHubIntegrationConfig,
)

# Natural language alerts
from agentops.nl_alerts import (
    NLAlertParser,
    NLParserConfig,
    NLRuleEngine,
    RuleEngineConfig,
    FeedbackCollector,
    AlertMetric,
    AlertCondition,
    AlertTimeWindow,
    AlertSeverity,
    AlertChannel,
    AlertRuleConfig,
    ParsedAlertRule,
    AlertEvent,
    AlertFeedback,
    FeedbackStats,
    create_parser,
    create_rule_engine,
    create_feedback_collector,
)

__version__ = "0.1.0"
__all__ = [
    # Core
    "AgentOps",
    "Config",
    "Session",
    "Event",
    "EventType",
    "init",
    "wrap",
    "track",
    "flush",
    # Quality
    "QualityEvaluator",
    "QualityCriterion",
    "QualityRubric",
    "QualityScore",
    "QualityConfig",
    # Correlation
    "TraceManager",
    "TraceContext",
    "SpanInfo",
    "AgentInfo",
    "CorrelationConfig",
    # Prompts
    "PromptRegistry",
    "PromptTemplate",
    "PromptExperiment",
    # Anomaly
    "AnomalyDetector",
    "AnomalyConfig",
    "MetricSnapshot",
    "DetectedAnomaly",
    "AnomalyType",
    "AnomalySeverity",
    # Replay
    "ReplayEngine",
    "ReplayConfig",
    "CapturedSession",
    "CapturedEvent",
    "SimulationResult",
    "ReplayMode",
    # Context
    "ContextWindowAnalyzer",
    "ContextConfig",
    "ContextAnalysis",
    "ContextSegment",
    "ContextSuggestion",
    # Collaboration
    "CollaborationHub",
    "CollaborationConfig",
    "TeamMember",
    "Investigation",
    "Annotation",
    # Compliance
    "ComplianceManager",
    "ComplianceConfig",
    "PIIDetectionResult",
    "PIIType",
    "AuditLogEntry",
    # Budget
    "BudgetManager",
    "BudgetConfig",
    "Budget",
    "BudgetPeriod",
    "CostForecast",
    # Streaming
    "StreamingClient",
    "StreamingConfig",
    "StreamingEvent",
    "StreamingEventType",
    "StreamingFilters",
    "StreamingHandlers",
    "StreamingError",
    "Subscription",
    "TokenChunk",
    "ConnectionState",
    "ConnectionInfo",
    "create_streaming_client",
    # Regression Testing
    "TestRunner",
    "TestRunnerConfig",
    "TestRunnerOptions",
    "TestCase",
    "TestSuite",
    "TestResult",
    "TestSuiteResult",
    "TestStatus",
    "Assertion",
    "AssertionType",
    "AssertionResult",
    "LLMClient",
    "LLMResponse",
    "create_test_runner",
    "parse_test_file",
    "parse_test_suite",
    "GitHubIntegration",
    "GitHubIntegrationConfig",
    # NL Alerts
    "NLAlertParser",
    "NLParserConfig",
    "NLRuleEngine",
    "RuleEngineConfig",
    "FeedbackCollector",
    "AlertMetric",
    "AlertCondition",
    "AlertTimeWindow",
    "AlertSeverity",
    "AlertChannel",
    "AlertRuleConfig",
    "ParsedAlertRule",
    "AlertEvent",
    "AlertFeedback",
    "FeedbackStats",
    "create_parser",
    "create_rule_engine",
    "create_feedback_collector",
]

# Global client instance
_client: AgentOps | None = None


def init(
    api_key: str | None = None,
    endpoint: str = "https://ingest.agentops.dev",
    flush_interval: float = 1.0,
    max_batch_size: int = 100,
    disabled: bool = False,
    debug: bool = False,
) -> AgentOps:
    """Initialize the global AgentOps client.
    
    Args:
        api_key: Your AgentOps API key. Can also be set via AGENTOPS_API_KEY env var.
        endpoint: The ingestion endpoint URL.
        flush_interval: How often to flush events (in seconds).
        max_batch_size: Maximum events per batch.
        disabled: Disable all tracking.
        debug: Enable debug logging.
    
    Returns:
        The initialized AgentOps client.
    """
    global _client
    _client = AgentOps(
        api_key=api_key,
        endpoint=endpoint,
        flush_interval=flush_interval,
        max_batch_size=max_batch_size,
        disabled=disabled,
        debug=debug,
    )
    return _client


def get_client() -> AgentOps:
    """Get the global AgentOps client.
    
    Raises:
        RuntimeError: If init() hasn't been called.
    """
    if _client is None:
        raise RuntimeError("AgentOps not initialized. Call agentops.init() first.")
    return _client


def wrap(client: object, **kwargs: object) -> object:
    """Wrap an LLM client for automatic instrumentation.
    
    Args:
        client: The LLM client to wrap (OpenAI, Anthropic, etc.)
        **kwargs: Additional session metadata.
    
    Returns:
        The wrapped client.
    """
    return get_client().wrap(client, **kwargs)


def track(event: Event | dict) -> None:
    """Track a custom event.
    
    Args:
        event: The event to track.
    """
    get_client().track(event)


async def flush() -> None:
    """Flush all buffered events."""
    await get_client().flush()


async def shutdown() -> None:
    """Shutdown the client and flush remaining events."""
    if _client:
        await _client.shutdown()
