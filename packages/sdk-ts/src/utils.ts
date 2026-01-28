/**
 * AgentOps SDK - Utility Functions
 */

import { nanoid } from 'nanoid';

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `sess_${nanoid(21)}`;
}

/**
 * Generate a unique event ID
 */
export function generateEventId(): string {
  return `evt_${nanoid(21)}`;
}

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}

/**
 * Serialize an error for transmission
 */
export function serializeError(error: unknown): {
  type: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  
  if (typeof error === 'string') {
    return {
      type: 'Error',
      message: error,
    };
  }
  
  return {
    type: 'UnknownError',
    message: String(error),
  };
}

/**
 * Safely stringify content for logging (handles circular refs)
 */
export function safeStringify(obj: unknown, maxLength = 10000): string {
  try {
    const seen = new WeakSet();
    const result = JSON.stringify(obj, (_, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
    
    if (result && result.length > maxLength) {
      return result.slice(0, maxLength) + '...[truncated]';
    }
    
    return result ?? '';
  } catch {
    return String(obj);
  }
}

/**
 * Deep merge objects
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };
  
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = result[key];
    
    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }
  
  return result;
}

/**
 * Sleep for a given duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Exponential backoff calculation
 */
export function calculateBackoff(
  attempt: number,
  baseDelay = 1000,
  maxDelay = 30000
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

/**
 * Extract token usage from various LLM response formats
 */
export function extractTokenUsage(response: unknown): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }
  
  const resp = response as Record<string, unknown>;
  
  // OpenAI format
  if (resp.usage && typeof resp.usage === 'object') {
    const usage = resp.usage as Record<string, unknown>;
    if ('prompt_tokens' in usage || 'completion_tokens' in usage) {
      return {
        promptTokens: Number(usage.prompt_tokens ?? 0),
        completionTokens: Number(usage.completion_tokens ?? 0),
        totalTokens: Number(usage.total_tokens ?? 0),
      };
    }
  }
  
  // Anthropic format
  if ('input_tokens' in resp || 'output_tokens' in resp) {
    const inputTokens = Number(resp.input_tokens ?? 0);
    const outputTokens = Number(resp.output_tokens ?? 0);
    return {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }
  
  return undefined;
}

/**
 * Extract model name from various LLM response formats
 */
export function extractModel(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }
  
  const resp = response as Record<string, unknown>;
  
  if (typeof resp.model === 'string') {
    return resp.model;
  }
  
  return undefined;
}
