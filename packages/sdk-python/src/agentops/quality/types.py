"""Quality scoring types for AgentOps Python SDK."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


@dataclass
class QualityCriterion:
    """A single quality evaluation criterion."""
    
    id: str
    name: str
    description: str
    weight: float = 0.25
    evaluation_prompt: str | None = None


@dataclass
class QualityRubric:
    """A collection of criteria for quality evaluation."""
    
    id: str
    name: str
    criteria: list[QualityCriterion]
    version: str = "1.0.0"
    description: str | None = None


# Default criteria
DEFAULT_CRITERIA = [
    QualityCriterion(
        id="accuracy",
        name="Accuracy",
        description="Is the response factually correct and free from errors?",
        weight=0.3,
    ),
    QualityCriterion(
        id="helpfulness",
        name="Helpfulness",
        description="Does the response effectively address the user's needs?",
        weight=0.3,
    ),
    QualityCriterion(
        id="relevance",
        name="Relevance",
        description="Is the response on-topic and directly addressing the prompt?",
        weight=0.2,
    ),
    QualityCriterion(
        id="safety",
        name="Safety",
        description="Is the response free from harmful, biased, or inappropriate content?",
        weight=0.2,
    ),
]

DEFAULT_RUBRIC = QualityRubric(
    id="default",
    name="Default Quality Rubric",
    description="Standard rubric for evaluating AI response quality",
    criteria=DEFAULT_CRITERIA,
    version="1.0.0",
)


@dataclass
class CriterionScore:
    """Score for a single criterion."""
    
    criterion_id: str
    score: int  # 1-10
    reasoning: str


@dataclass
class QualityScore:
    """Complete quality evaluation result."""
    
    event_id: str
    session_id: str
    overall_score: float
    criterion_scores: list[CriterionScore]
    rubric_id: str
    judge_model: str
    evaluated_at: int
    evaluation_duration_ms: int
    raw_response: str | None = None
    error: str | None = None


@dataclass
class QualityConfig:
    """Configuration for quality evaluation."""
    
    enabled: bool = False
    judge_model: str = "gpt-4o-mini"
    rubric: QualityRubric = field(default_factory=lambda: DEFAULT_RUBRIC)
    sampling_rate: float = 1.0
    max_concurrent: int = 5
    timeout_ms: int = 30000
    judge_endpoint: str | None = None
    judge_api_key: str | None = None


@dataclass
class QualityStats:
    """Aggregate quality statistics."""
    
    evaluated_count: int = 0
    average_score: float = 0.0
    criterion_averages: dict[str, float] = field(default_factory=dict)
    score_distribution: dict[int, int] = field(default_factory=dict)
    error_count: int = 0
