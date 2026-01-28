/**
 * Shared types and constants for AgentOps
 */

// Model pricing (USD per 1K tokens)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'gpt-5': { input: 0.005, output: 0.015 },
  'gpt-5-mini': { input: 0.001, output: 0.003 },
  
  // Anthropic
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku-20241022': { input: 0.001, output: 0.005 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  'claude-sonnet-4': { input: 0.003, output: 0.015 },
  'claude-haiku-4': { input: 0.0008, output: 0.004 },
  'claude-opus-4': { input: 0.015, output: 0.075 },
  
  // Default fallback
  'unknown': { input: 0.001, output: 0.002 },
};

/**
 * Calculate cost from token usage
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): { inputCost: number; outputCost: number; totalCost: number } {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['unknown'];
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
  'session_start',
  'session_end', 
  'prompt',
  'response',
  'tool_call',
  'tool_result',
  'error',
  'custom',
] as const;

export type EventType = typeof EVENT_TYPES[number];

// API constants
export const API_VERSION = 'v1';
export const SDK_VERSION = '0.1.0';
