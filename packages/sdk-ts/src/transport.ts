/**
 * AgentOps SDK - HTTP Transport
 * 
 * Handles reliable delivery of events to the AgentOps backend.
 */

import type { 
  AgentEvent, 
  TransportConfig, 
  BatchPayload, 
  ApiResponse,
  FlushResult 
} from './types.js';
import { calculateBackoff, sleep } from './utils.js';

const SDK_VERSION = '0.1.0';

export class HttpTransport {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(config: TransportConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
  }

  /**
   * Send a batch of events to the backend
   */
  async send(events: AgentEvent[]): Promise<FlushResult> {
    if (events.length === 0) {
      return { success: true, eventCount: 0 };
    }

    const payload: BatchPayload = {
      events,
      sdkVersion: SDK_VERSION,
      timestamp: Date.now(),
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.doRequest(payload);
        
        if (response.success) {
          return {
            success: true,
            eventCount: events.length,
          };
        }

        // Non-retryable API error
        return {
          success: false,
          eventCount: events.length,
          error: new Error(response.message ?? 'Unknown API error'),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on final attempt
        if (attempt < this.maxRetries) {
          const backoff = calculateBackoff(attempt);
          await sleep(backoff);
        }
      }
    }

    return {
      success: false,
      eventCount: events.length,
      error: lastError ?? new Error('Max retries exceeded'),
    };
  }

  private async doRequest(payload: BatchPayload): Promise<ApiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.endpoint}/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-AgentOps-SDK-Version': SDK_VERSION,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Check if retryable (5xx errors, rate limits)
        if (response.status >= 500 || response.status === 429) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Non-retryable client error
        const body = await response.text();
        return {
          success: false,
          message: `HTTP ${response.status}: ${body}`,
        };
      }

      return await response.json() as ApiResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
