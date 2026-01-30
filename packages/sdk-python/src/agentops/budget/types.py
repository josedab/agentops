"""
Type definitions for budget module.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, List, Any, Callable
import time


class BudgetPeriod(str, Enum):
    """Budget period types."""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class AlertSeverity(str, Enum):
    """Alert severity levels."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class Budget:
    """A budget definition."""
    id: str
    name: str
    amount: float
    period: BudgetPeriod
    spent: float = 0.0
    remaining: float = 0.0
    usage_percent: float = 0.0
    start_date: int = field(default_factory=lambda: int(time.time() * 1000))
    end_date: Optional[int] = None
    tags: List[str] = field(default_factory=list)
    model_filter: Optional[List[str]] = None
    is_active: bool = True
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class BudgetAlert:
    """A budget alert."""
    id: str
    budget_id: str
    budget_name: str
    threshold_percent: float
    current_percent: float
    severity: AlertSeverity
    message: str
    triggered_at: int = field(default_factory=lambda: int(time.time() * 1000))
    acknowledged: bool = False


@dataclass
class CostForecast:
    """Cost forecast result."""
    current_spend: float
    projected_spend: float
    projected_end_date: int
    daily_average: float
    trend: str  # increasing, stable, decreasing
    confidence: float  # 0.0 to 1.0
    forecast_period_days: int
    data_points_used: int
    generated_at: int = field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class SpendingBreakdown:
    """Spending breakdown by category."""
    total: float
    by_model: Dict[str, float] = field(default_factory=dict)
    by_operation: Dict[str, float] = field(default_factory=dict)
    by_session: Dict[str, float] = field(default_factory=dict)
    by_day: List[Dict[str, Any]] = field(default_factory=list)
    period_start: int = 0
    period_end: int = 0


@dataclass
class BudgetConfig:
    """Configuration for budget management."""
    enabled: bool = True
    default_currency: str = "USD"
    alert_thresholds: List[float] = field(default_factory=lambda: [50.0, 75.0, 90.0, 100.0])
    on_alert: Optional[Callable[["BudgetAlert"], None]] = None
    on_budget_exceeded: Optional[Callable[["Budget"], None]] = None
