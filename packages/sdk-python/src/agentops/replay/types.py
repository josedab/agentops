"""
Type definitions for replay & simulation.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, List, Any, Callable
import time


class ReplayMode(str, Enum):
    """Replay execution modes."""
    STEP_BY_STEP = "step_by_step"
    CONTINUOUS = "continuous"
    FAST_FORWARD = "fast_forward"


@dataclass
class ReplayConfig:
    """Configuration for replay engine."""
    enabled: bool = True
    capture_enabled: bool = True
    storage_limit: int = 1000  # Max sessions to store
    include_responses: bool = True
    include_metadata: bool = True
    on_replay_event: Optional[Callable[["CapturedEvent"], None]] = None


@dataclass
class CapturedEvent:
    """A captured event in a session."""
    id: str
    type: str  # prompt, response, tool_call, tool_result, error
    timestamp: int
    data: Dict[str, Any] = field(default_factory=dict)
    model: Optional[str] = None
    latency_ms: Optional[float] = None
    tokens_input: Optional[int] = None
    tokens_output: Optional[int] = None
    cost: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CapturedSession:
    """A captured session for replay."""
    id: str
    name: Optional[str] = None
    events: List[CapturedEvent] = field(default_factory=list)
    start_time: int = field(default_factory=lambda: int(time.time() * 1000))
    end_time: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)


@dataclass
class SimulationResult:
    """Result of a what-if simulation."""
    session_id: str
    original_cost: float
    simulated_cost: float
    original_latency_ms: float
    simulated_latency_ms: float
    original_tokens: int
    simulated_tokens: int
    events_replayed: int
    events_modified: int
    differences: List[Dict[str, Any]] = field(default_factory=list)
    completed_at: int = field(default_factory=lambda: int(time.time() * 1000))
