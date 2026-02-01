/**
 * Streaming Transport
 *
 * Transport layer that publishes events in real-time via WebSocket
 * in addition to (or instead of) HTTP batch transport.
 */

import type { AgentEvent, FlushResult } from "../types.js";
import type {
  StreamingConfig,
  ResolvedStreamingConfig,
  StreamingEvent,
  StreamingEventType,
  TokenChunkMessage,
} from "./types.js";

const DEFAULT_CONFIG: Omit<ResolvedStreamingConfig, "endpoint" | "apiKey"> = {
  autoReconnect: true,
  maxReconnectAttempts: 10,
  reconnectBaseDelay: 1000,
  reconnectMaxDelay: 30000,
  heartbeatInterval: 30000,
  connectionTimeout: 10000,
  debug: false,
  offlineBufferSize: 1000,
};

/**
 * Generate unique ID for messages
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Convert AgentEvent to StreamingEvent format
 */
function toStreamingEvent(event: AgentEvent): StreamingEvent {
  const data: StreamingEvent["data"] = {
    metadata: event.metadata,
  };

  switch (event.type) {
    case "session_start":
      data.userId = event.userId;
      data.featureId = event.featureId;
      data.status = "active";
      break;
    case "session_end":
      data.status = event.status === "completed" ? "completed" : "error";
      if (event.errorMessage) {
        data.errorMessage = event.errorMessage;
      }
      break;
    case "prompt":
      data.content =
        typeof event.content === "string"
          ? event.content
          : JSON.stringify(event.content);
      data.model = event.model;
      break;
    case "response":
      data.content =
        typeof event.content === "string"
          ? event.content
          : JSON.stringify(event.content);
      data.model = event.model;
      data.durationMs = event.durationMs;
      if (event.tokens) {
        data.tokens = event.tokens;
      }
      break;
    case "tool_call":
      data.toolName = event.toolName;
      data.toolInput = event.toolInput;
      data.toolStatus = "pending";
      break;
    case "tool_result":
      data.toolName = event.toolName;
      data.toolOutput = event.toolOutput;
      data.toolStatus = event.status === "success" ? "success" : "error";
      data.durationMs = event.durationMs;
      if (event.errorMessage) {
        data.errorMessage = event.errorMessage;
      }
      break;
    case "error":
      data.errorType = event.errorType;
      data.errorMessage = event.errorMessage;
      data.stackTrace = event.stackTrace;
      data.durationMs = event.durationMs;
      break;
    case "custom":
      data.content = event.name;
      data.metadata = { ...data.metadata, customData: event.data };
      break;
  }

  return {
    eventId: event.eventId,
    sessionId: event.sessionId,
    parentEventId: event.parentEventId,
    type: event.type as StreamingEventType,
    timestamp: event.timestamp,
    data,
  };
}

/**
 * StreamingTransport publishes events in real-time via WebSocket.
 *
 * This can be used alongside the HTTP transport for real-time dashboards
 * while maintaining reliable batch delivery for persistence.
 *
 * @example
 * ```typescript
 * const transport = new StreamingTransport({
 *   endpoint: 'wss://stream.agentops.dev',
 *   apiKey: process.env.AGENTOPS_API_KEY,
 * });
 *
 * await transport.connect();
 *
 * // Send events in real-time
 * transport.publish(event);
 *
 * // Stream token chunks for real-time response rendering
 * transport.publishChunk(sessionId, eventId, 'Hello', 0, false);
 * transport.publishChunk(sessionId, eventId, ' world!', 1, true);
 * ```
 */
export class StreamingTransport {
  private readonly config: ResolvedStreamingConfig;
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private offlineBuffer: unknown[] = [];
  private chunkBuffers: Map<string, string[]> = new Map();

  constructor(config: StreamingConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      debug: config.debug ?? false,
    };
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Connect to the streaming server
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error("Connection timeout"));
      }, this.config.connectionTimeout);

      try {
        const url = new URL(this.config.endpoint);
        url.searchParams.set("apiKey", this.config.apiKey);
        url.searchParams.set("mode", "publish");

        this.ws = new WebSocket(url.toString());

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.connected = true;
          this.reconnecting = false;
          this.reconnectAttempts = 0;
          this.debug("Connected to streaming server");
          this.startHeartbeat();
          this.flushOfflineBuffer();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data as string);
            this.handleMessage(message);
          } catch (err) {
            this.debug("Failed to parse message:", err);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          this.debug("WebSocket error:", error);
          if (!this.connected) {
            reject(new Error("Connection failed"));
          }
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.stopHeartbeat();

          if (this.config.autoReconnect && !this.reconnecting) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the streaming server
   */
  async disconnect(): Promise<void> {
    this.config.autoReconnect = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, "Client disconnected");
      this.ws = null;
    }

    this.connected = false;
  }

  /**
   * Publish an event in real-time
   */
  publish(event: AgentEvent): void {
    const streamingEvent = toStreamingEvent(event);
    this.send({
      type: "event",
      messageId: generateId(),
      timestamp: Date.now(),
      sessionId: event.sessionId,
      event: streamingEvent,
    });
  }

  /**
   * Publish multiple events in a batch
   */
  publishBatch(events: AgentEvent[]): void {
    const streamingEvents = events.map((e) => ({
      type: "event" as const,
      messageId: generateId(),
      timestamp: Date.now(),
      sessionId: e.sessionId,
      event: toStreamingEvent(e),
    }));

    this.send({
      type: "event_batch",
      messageId: generateId(),
      timestamp: Date.now(),
      events: streamingEvents,
    });
  }

  /**
   * Publish a token chunk for streaming responses
   */
  publishChunk(
    sessionId: string,
    eventId: string,
    chunk: string,
    index: number,
    isComplete: boolean,
  ): void {
    const message: TokenChunkMessage = {
      type: "token_chunk",
      messageId: generateId(),
      timestamp: Date.now(),
      sessionId,
      eventId,
      chunk,
      index,
      isComplete,
    };

    this.send(message);

    // Track chunks for potential replay
    const key = `${sessionId}:${eventId}`;
    if (!this.chunkBuffers.has(key)) {
      this.chunkBuffers.set(key, []);
    }
    this.chunkBuffers.get(key)!.push(chunk);

    if (isComplete) {
      // Clean up chunk buffer after completion
      setTimeout(() => {
        this.chunkBuffers.delete(key);
      }, 60000);
    }
  }

  /**
   * Get accumulated chunks for an event
   */
  getAccumulatedChunks(sessionId: string, eventId: string): string {
    const key = `${sessionId}:${eventId}`;
    const chunks = this.chunkBuffers.get(key) ?? [];
    return chunks.join("");
  }

  /**
   * Send events via HTTP transport as well (for reliable delivery)
   */
  async sendWithFallback(
    events: AgentEvent[],
    httpSend: (events: AgentEvent[]) => Promise<FlushResult>,
  ): Promise<FlushResult> {
    // Publish via WebSocket for real-time
    if (this.connected) {
      this.publishBatch(events);
    }

    // Also send via HTTP for reliable persistence
    return httpSend(events);
  }

  // =========================================================================
  // Internal Methods
  // =========================================================================

  private handleMessage(message: { type: string }): void {
    switch (message.type) {
      case "ack":
        // Message acknowledged by server
        break;
      case "error":
        this.debug("Server error:", message);
        break;
      case "heartbeat":
        // Server heartbeat received
        break;
    }
  }

  private send(message: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.offlineBuffer.length < this.config.offlineBufferSize) {
        this.offlineBuffer.push(message);
      }
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      this.debug("Failed to send message:", error);
      if (this.offlineBuffer.length < this.config.offlineBufferSize) {
        this.offlineBuffer.push(message);
      }
    }
  }

  private flushOfflineBuffer(): void {
    const messages = this.offlineBuffer.splice(0);
    for (const message of messages) {
      this.send(message);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this.send({
          type: "heartbeat",
          messageId: generateId(),
          timestamp: Date.now(),
        });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.debug("Max reconnect attempts reached");
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;

    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectMaxDelay,
    );

    this.debug(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        this.debug("Reconnect failed:", err);
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private debug(...args: unknown[]): void {
    if (this.config.debug) {
      console.log("[StreamingTransport]", ...args);
    }
  }
}
