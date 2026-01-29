"""Model pricing data."""

from dataclasses import dataclass
from typing import Dict


@dataclass
class ModelPricing:
    """Pricing information for a model."""
    
    input_cost_per_1k: float  # Cost per 1000 input tokens
    output_cost_per_1k: float  # Cost per 1000 output tokens


# Model pricing as of 2026-01
# Prices in USD per 1000 tokens
MODEL_PRICING: Dict[str, ModelPricing] = {
    # OpenAI
    "gpt-4o": ModelPricing(0.005, 0.015),
    "gpt-4o-mini": ModelPricing(0.00015, 0.0006),
    "gpt-4-turbo": ModelPricing(0.01, 0.03),
    "gpt-4": ModelPricing(0.03, 0.06),
    "gpt-4-32k": ModelPricing(0.06, 0.12),
    "gpt-3.5-turbo": ModelPricing(0.0005, 0.0015),
    "gpt-3.5-turbo-16k": ModelPricing(0.003, 0.004),
    "o1": ModelPricing(0.015, 0.06),
    "o1-mini": ModelPricing(0.003, 0.012),
    "o1-preview": ModelPricing(0.015, 0.06),
    
    # Anthropic
    "claude-3-5-sonnet-20241022": ModelPricing(0.003, 0.015),
    "claude-3-5-haiku-20241022": ModelPricing(0.001, 0.005),
    "claude-3-opus-20240229": ModelPricing(0.015, 0.075),
    "claude-3-sonnet-20240229": ModelPricing(0.003, 0.015),
    "claude-3-haiku-20240307": ModelPricing(0.00025, 0.00125),
    
    # Aliases
    "claude-3-5-sonnet": ModelPricing(0.003, 0.015),
    "claude-3-5-haiku": ModelPricing(0.001, 0.005),
    "claude-3-opus": ModelPricing(0.015, 0.075),
    "claude-3-sonnet": ModelPricing(0.003, 0.015),
    "claude-3-haiku": ModelPricing(0.00025, 0.00125),
    
    # Google
    "gemini-1.5-pro": ModelPricing(0.00125, 0.005),
    "gemini-1.5-flash": ModelPricing(0.000075, 0.0003),
    "gemini-1.0-pro": ModelPricing(0.0005, 0.0015),
    
    # Mistral
    "mistral-large": ModelPricing(0.004, 0.012),
    "mistral-medium": ModelPricing(0.0027, 0.0081),
    "mistral-small": ModelPricing(0.001, 0.003),
    "mistral-tiny": ModelPricing(0.00025, 0.00025),
    
    # Meta Llama (via various providers)
    "llama-3.1-405b": ModelPricing(0.003, 0.003),
    "llama-3.1-70b": ModelPricing(0.0009, 0.0009),
    "llama-3.1-8b": ModelPricing(0.0002, 0.0002),
}


def calculate_cost(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> float:
    """Calculate the cost for a model invocation.
    
    Args:
        model: The model name.
        prompt_tokens: Number of input tokens.
        completion_tokens: Number of output tokens.
    
    Returns:
        The total cost in USD.
    """
    pricing = MODEL_PRICING.get(model)
    
    if not pricing:
        # Try to match by prefix
        for model_name, model_pricing in MODEL_PRICING.items():
            if model.startswith(model_name) or model_name.startswith(model):
                pricing = model_pricing
                break
    
    if not pricing:
        # Unknown model, return 0
        return 0.0
    
    input_cost = (prompt_tokens / 1000) * pricing.input_cost_per_1k
    output_cost = (completion_tokens / 1000) * pricing.output_cost_per_1k
    
    return input_cost + output_cost
