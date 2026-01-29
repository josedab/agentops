/**
 * Shared types and constants for AgentOps
 */

// ============================================================================
// Model Pricing - Single Source of Truth
// ============================================================================

export interface ModelPricing {
  /** Cost per 1K input/prompt tokens in USD */
  input: number;
  /** Cost per 1K output/completion tokens in USD */
  output: number;
}

/**
 * Pricing data for popular LLM models.
 * Prices are in USD per 1,000 tokens.
 * Last updated: January 2026
 *
 * NOTE: This is the canonical source for model pricing.
 * Do not duplicate this data elsewhere in the codebase.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI GPT-4o family
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4o-2024-05-13": { input: 0.005, output: 0.015 },
  "gpt-4o-2024-08-06": { input: 0.0025, output: 0.01 },

  // OpenAI GPT-4 Turbo
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-4-turbo-2024-04-09": { input: 0.01, output: 0.03 },
  "gpt-4-turbo-preview": { input: 0.01, output: 0.03 },

  // OpenAI GPT-4
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-4-32k": { input: 0.06, output: 0.12 },

  // OpenAI GPT-3.5 Turbo
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "gpt-3.5-turbo-0125": { input: 0.0005, output: 0.0015 },
  "gpt-3.5-turbo-1106": { input: 0.001, output: 0.002 },

  // OpenAI o1 (reasoning models)
  o1: { input: 0.015, output: 0.06 },
  "o1-preview": { input: 0.015, output: 0.06 },
  "o1-mini": { input: 0.003, output: 0.012 },

  // OpenAI GPT-5 family (estimated)
  "gpt-5": { input: 0.005, output: 0.015 },
  "gpt-5-mini": { input: 0.001, output: 0.003 },

  // Anthropic Claude 3.5
  "claude-3-5-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  "claude-3-5-sonnet-20240620": { input: 0.003, output: 0.015 },
  "claude-3-5-haiku": { input: 0.001, output: 0.005 },
  "claude-3-5-haiku-20241022": { input: 0.001, output: 0.005 },

  // Anthropic Claude 3
  "claude-3-opus": { input: 0.015, output: 0.075 },
  "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
  "claude-3-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-sonnet-20240229": { input: 0.003, output: 0.015 },
  "claude-3-haiku": { input: 0.00025, output: 0.00125 },
  "claude-3-haiku-20240307": { input: 0.00025, output: 0.00125 },

  // Anthropic Claude 4 family (estimated)
  "claude-sonnet-4": { input: 0.003, output: 0.015 },
  "claude-haiku-4": { input: 0.0008, output: 0.004 },
  "claude-opus-4": { input: 0.015, output: 0.075 },

  // Google Gemini
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
  "gemini-1.0-pro": { input: 0.0005, output: 0.0015 },
};

/** Default pricing for unknown models */
export const DEFAULT_MODEL_PRICING: ModelPricing = {
  input: 0.001,
  output: 0.002,
};

/**
 * Model name aliases for normalization
 */
const MODEL_ALIASES: Record<string, string> = {
  "gpt-4-1106-preview": "gpt-4-turbo-preview",
  "gpt-4-0125-preview": "gpt-4-turbo-preview",
  "gpt-4-vision-preview": "gpt-4-turbo",
};

/**
 * Normalize model name to match pricing table
 */
export function normalizeModelName(model: string): string {
  if (MODEL_PRICING[model]) {
    return model;
  }

  if (MODEL_ALIASES[model]) {
    return MODEL_ALIASES[model];
  }

  // Try stripping date suffix patterns (e.g., "claude-3-5-sonnet-20241022" -> "claude-3-5-sonnet")
  const datePattern = /-\d{8}$/;
  const strippedModel = model.replace(datePattern, "");
  if (MODEL_PRICING[strippedModel]) {
    return strippedModel;
  }

  // Check if it's a dated version of a known model
  const sortedModels = Object.keys(MODEL_PRICING).sort(
    (a, b) => b.length - a.length,
  );
  for (const knownModel of sortedModels) {
    if (model.startsWith(knownModel + "-")) {
      return knownModel;
    }
  }

  return model;
}

/**
 * Get pricing for a model (returns default if unknown)
 */
export function getModelPricing(model: string): ModelPricing {
  const normalized = normalizeModelName(model);
  return MODEL_PRICING[normalized] ?? DEFAULT_MODEL_PRICING;
}

/**
 * Check if a model has known pricing
 */
export function hasKnownPricing(model: string): boolean {
  const normalized = normalizeModelName(model);
  return normalized in MODEL_PRICING;
}

/**
 * Calculate cost from token usage
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): { inputCost: number; outputCost: number; totalCost: number } {
  const pricing = getModelPricing(model);
  const inputCost = (promptTokens / 1000) * pricing.input;
  const outputCost = (completionTokens / 1000) * pricing.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

// Event type enum
export const EVENT_TYPES = [
  "session_start",
  "session_end",
  "prompt",
  "response",
  "tool_call",
  "tool_result",
  "error",
  "custom",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// API constants
export const API_VERSION = "v1";
export const SDK_VERSION = "0.1.0";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for a given duration
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 *
 * @param attempt - Current attempt number (0-based)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @param maxDelay - Maximum delay cap in milliseconds (default: 30000)
 * @returns Delay in milliseconds with ±25% jitter
 *
 * @example
 * ```typescript
 * // First retry: ~1000ms, second: ~2000ms, third: ~4000ms, etc.
 * const delay = calculateBackoff(attempt);
 * await sleep(delay);
 * ```
 */
export function calculateBackoff(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000,
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

// Error hierarchy
export * from "./errors.js";
