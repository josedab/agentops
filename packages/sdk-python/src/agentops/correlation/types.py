"""Multi-agent correlation types for AgentOps Python SDK."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class TraceContext:
    """Trace context for distributed tracing."""
    
    trace_id: str
    span_id: str
    parent_span_id: str | None = None
    sampled: bool = True
    flags: int | None = None
    baggage: dict[str, str] = field(default_factory=dict)


@dataclass
class SpanInfo:
    """Information about a single span."""
    
    span_id: str
    trace_id: str
    name: str
    agent_id: str
    start_time: int
    parent_span_id: str | None = None
    end_time: int | None = None
    duration_ms: int | None = None
    status: str = "in_progress"  # ok, error, in_progress
    error_message: str | None = None
    attributes: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentInfo:
    """Information about an agent."""
    
    agent_id: str
    name: str
    type: str | None = None
    version: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class CorrelationConfig:
    """Configuration for multi-agent correlation."""
    
    enabled: bool = False
    agent: AgentInfo | None = None
    sampling_rate: float = 1.0
    propagate_baggage: bool = True
    max_baggage_items: int = 64
    propagation_headers: dict[str, str] = field(default_factory=lambda: {
        "trace_id": "x-agentops-trace-id",
        "span_id": "x-agentops-span-id",
        "parent_span_id": "x-agentops-parent-span-id",
        "sampled": "x-agentops-sampled",
        "baggage": "x-agentops-baggage",
    })


@dataclass
class TraceStats:
    """Statistics for a complete trace."""
    
    span_count: int = 0
    agent_count: int = 0
    total_duration_ms: int = 0
    critical_path_ms: int = 0
    error_count: int = 0
    agent_stats: dict[str, dict[str, int]] = field(default_factory=dict)
