"""Prompt optimization types for AgentOps Python SDK."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PromptTemplate:
    """A versioned prompt template."""
    
    id: str
    name: str
    template: str
    variables: list[str]
    version: str = "1.0.0"
    description: str | None = None
    tags: list[str] = field(default_factory=list)
    target_model: str | None = None
    created_at: int = 0
    updated_at: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class PromptVersion:
    """A specific version of a prompt."""
    
    version: str
    template: str
    created_at: int
    change_description: str | None = None
    author: str | None = None


@dataclass
class ExperimentVariant:
    """A variant in a prompt experiment."""
    
    id: str
    name: str
    prompt_template_id: str
    traffic_allocation: float
    is_control: bool = False


@dataclass
class PromptExperiment:
    """A/B test for prompt optimization."""
    
    id: str
    name: str
    variants: list[ExperimentVariant]
    status: str = "draft"  # draft, running, paused, completed
    primary_metric: str = "quality_score"
    custom_metric_name: str | None = None
    min_sample_size: int = 100
    significance_threshold: float = 0.95
    started_at: int | None = None
    ended_at: int | None = None
    winner_variant_id: str | None = None
    created_at: int = 0
    description: str | None = None


@dataclass
class VariantMetrics:
    """Metrics for an experiment variant."""
    
    variant_id: str
    sample_size: int
    mean: float
    std_dev: float
    confidence_interval: tuple[float, float]
    metric_breakdown: dict[str, dict[str, float]] = field(default_factory=dict)


@dataclass
class VariantComparison:
    """Statistical comparison between variants."""
    
    control_id: str
    treatment_id: str
    p_value: float
    effect_size: float
    is_significant: bool
    relative_improvement: float


@dataclass
class ExperimentResults:
    """Complete results of a prompt experiment."""
    
    experiment_id: str
    variant_metrics: list[VariantMetrics]
    comparisons: list[VariantComparison]
    is_significant: bool
    recommended_winner: str | None = None
    improvement_percent: float | None = None
    analyzed_at: int = 0


@dataclass
class TokenAnalysis:
    """Analysis of token usage in a prompt."""
    
    total_tokens: int
    section_breakdown: list[dict[str, Any]]
    redundancies: list[dict[str, Any]]
    suggestions: list[dict[str, Any]]


@dataclass
class OptimizationSuggestion:
    """A suggestion for prompt optimization."""
    
    type: str  # token_reduction, clarity, structure, specificity
    description: str
    original_text: str
    suggested_text: str
    token_savings: int
    confidence: float
