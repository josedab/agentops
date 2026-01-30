"""
Type definitions for anomaly detection.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, List, Callable, Any
import time


class AnomalyType(str, Enum):
    """Types of anomalies that can be detected."""
    LATENCY_SPIKE = "latency_spike"
    TOKEN_EXPLOSION = "token_explosion"
    ERROR_RATE_INCREASE = "error_rate_increase"
    COST_SURGE = "cost_surge"
    QUALITY_DEGRADATION = "quality_degradation"
    PATTERN_CHANGE = "pattern_change"


class AnomalySeverity(str, Enum):
    """Severity levels for detected anomalies."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class AnomalyConfig:
    """Configuration for anomaly detection."""
    enabled: bool = True
    sensitivity: float = 0.8  # 0.0 to 1.0
    latency_threshold_ms: float = 5000.0
    token_threshold: int = 10000
    error_rate_threshold: float = 0.1
    cost_threshold: float = 1.0
    baseline_window_size: int = 100
    on_anomaly: Optional[Callable[["DetectedAnomaly"], None]] = None


@dataclass
class MetricSnapshot:
    """A point-in-time snapshot of metrics."""
    timestamp: int = field(default_factory=lambda: int(time.time() * 1000))
    latency_ms: Optional[float] = None
    tokens_input: Optional[int] = None
    tokens_output: Optional[int] = None
    error_occurred: bool = False
    cost: Optional[float] = None
    quality_score: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DetectedAnomaly:
    """Represents a detected anomaly."""
    id: str
    type: AnomalyType
    severity: AnomalySeverity
    metric_name: str
    observed_value: float
    expected_value: float
    deviation: float
    z_score: Optional[float] = None
    detected_at: int = field(default_factory=lambda: int(time.time() * 1000))
    resolved_at: Optional[int] = None
    is_active: bool = True
    description: str = ""
    suggested_action: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MetricTimeSeries:
    """Time series data for a metric."""
    metric_name: str
    data_points: List[Dict[str, Any]] = field(default_factory=list)
    statistics: Dict[str, float] = field(default_factory=dict)
