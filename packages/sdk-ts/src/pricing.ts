/**
 * AgentOps SDK - Model Pricing
 *
 * Cost estimation for various LLM models.
 * Re-exports canonical pricing from @agentops/shared.
 */

// Re-export canonical pricing data from shared package
export {
  MODEL_PRICING,
  DEFAULT_MODEL_PRICING,
  normalizeModelName,
  getModelPricing,
  hasKnownPricing,
} from "@agentops/shared";
export type { ModelPricing } from "@agentops/shared";

// Import for local use
import { getModelPricing as getSharedPricing } from "@agentops/shared";

/**
 * Calculate the cost for a given model and token usage.
 *
 * @param model - The model name (e.g., 'gpt-4o', 'claude-3-5-sonnet')
 * @param inputTokens - Number of input/prompt tokens
 * @param outputTokens - Number of output/completion tokens
 * @returns Total cost in USD, or 0 if model is unknown
 *
 * @example
 * ```typescript
 * const cost = calculateCost('gpt-4o', 1000, 500);
 * // Returns 0.0125 ($0.005 for input + $0.0075 for output)
 * ```
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getSharedPricing(model);
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return inputCost + outputCost;
}
