/**
 * AgentOps SDK
 * 
 * AI-native observability for agent applications.
 * 
 * @packageDocumentation
 */

// Main client
export { AgentOps } from './client.js';

// Session tracking
export { TrackedSession, SessionContext } from './session.js';

// Types
export type {
  // Configuration
  AgentOpsConfig,
  ResolvedConfig,
  
  // Events
  EventType,
  BaseEvent,
  SessionStartEvent,
  SessionEndEvent,
  PromptEvent,
  ResponseEvent,
  ToolCallEvent,
  ToolResultEvent,
  ErrorEvent,
  CustomEvent,
  AgentEvent,
  
  // Token & Cost
  TokenUsage,
  CostInfo,
  
  // Session
  SessionMetadata,
  SessionStats,
  
  // API
  BatchPayload,
  ApiResponse,
  ApiError,
  
  // Transport
  TransportConfig,
  FlushResult,
} from './types.js';

// Utilities (for advanced use cases)
export {
  generateSessionId,
  generateEventId,
  serializeError,
  extractTokenUsage,
  extractModel,
} from './utils.js';

// ============================================================================
// Singleton API
// ============================================================================

import { AgentOps } from './client.js';
import type { AgentOpsConfig, SessionMetadata, AgentEvent } from './types.js';
import type { TrackedSession } from './session.js';

let defaultClient: AgentOps | null = null;

/**
 * Initialize the default AgentOps client.
 * 
 * @example
 * ```typescript
 * import { init, wrap, startSession } from '@agentops/sdk';
 * 
 * // Initialize once at startup
 * init({ apiKey: process.env.AGENTOPS_API_KEY });
 * 
 * // Then use convenience functions
 * const client = wrap(yourLLMClient);
 * const session = startSession({ userId: 'user123' });
 * ```
 */
export function init(config: AgentOpsConfig): AgentOps {
  defaultClient = new AgentOps(config);
  return defaultClient;
}

/**
 * Get the default AgentOps client.
 * 
 * @throws Error if init() hasn't been called
 */
export function getClient(): AgentOps {
  if (!defaultClient) {
    throw new Error(
      'AgentOps not initialized. Call init({ apiKey: "..." }) first, ' +
      'or create an instance with new AgentOps({ apiKey: "..." })'
    );
  }
  return defaultClient;
}

/**
 * Wrap an LLM client for automatic instrumentation using the default client.
 */
export function wrap<T extends object>(client: T, metadata?: SessionMetadata): T {
  return getClient().wrap(client, metadata);
}

/**
 * Start a new session using the default client.
 */
export function startSession(metadata?: SessionMetadata): TrackedSession {
  return getClient().startSession(metadata);
}

/**
 * Track a custom event using the default client.
 */
export function trackEvent(event: Omit<AgentEvent, 'eventId' | 'timestamp'>): void {
  getClient().trackEvent(event);
}

/**
 * Flush events using the default client.
 */
export async function flush(): Promise<void> {
  await getClient().flush();
}

/**
 * Shutdown the default client.
 */
export async function shutdown(): Promise<void> {
  if (defaultClient) {
    await defaultClient.shutdown();
    defaultClient = null;
  }
}
