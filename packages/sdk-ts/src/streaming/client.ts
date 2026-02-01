/**
 * Streaming Trace Client
 *
 * WebSocket client for real-time event streaming with automatic reconnection,
 * heartbeat management, and offline event buffering.
 */

import { calculateBackoff } from "@agentops/shared";
import {
  StreamingConfig,
  ResolvedStreamingConfig,
  StreamingMessage,
  StreamingServerMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  HeartbeatMessage,
  EventMessage,
  TokenChunkMessage,
  ConnectionState,
  ConnectionInfo,
  StreamingHandlers,
  StreamingFilters,
  Subscription,
  StreamingError,
  StreamingEvent,
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
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * StreamingClient provides real-time WebSocket-based event streaming
 * with automatic reconnection and subscription management.
 *
 * @example
 * ```typescript
 * const client = new StreamingClient({
 *   endpoint: 'wss://stream.agentops.dev',
 *   apiKey: process.env.AGENTOPS_API_KEY,
 * });
 *
 * // Connect and subscribe to a session
 * await client.connect();
 *
 * const subscription = client.subscribe({
 *   sessionId: 'sess_123',
 *   onEvent: (event) => console.log('Event:', event),
 *   onTokenChunk: (chunk) => process.stdout.write(chunk.chunk),
 * });
 *
 * // Later: unsubscribe and disconnect
 * client.unsubscribe(subscription.id);
 * await client.disconnect();
 * ```
 */
export class StreamingClient {
  private readonly config: ResolvedStreamingConfig;
  private ws: WebSocket | null = null;
  private connectionInfo: ConnectionInfo;
  private subscriptions: Map<string, Subscription> = new Map();
  private pendingAcks: Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  > = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private offlineBuffer: StreamingMessage[] = [];
  private globalHandlers: StreamingHandlers = {};

  constructor(config: StreamingConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      debug: config.debug ?? false,
    };

    this.connectionInfo = {
      state: "disconnected",
      reconnectAttempts: 0,
      subscriptions: new Set(),
    };
  }

  /**
   * Get current connection state
   */
  get state(): ConnectionState {
    return this.connectionInfo.state;
  }

  /**
   * Get connection information
   */
  get connection(): Readonly<ConnectionInfo> {
    return { ...this.connectionInfo };
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.connectionInfo.state === "connected";
  }

  /**
   * Set global event handlers
   */
  setHandlers(handlers: StreamingHandlers): void {
    this.globalHandlers = handlers;
  }

  /**
   * Connect to the streaming server
   */
  async connect(): Promise<void> {
    if (this.connectionInfo.state === "connected") {
      return;
    }

    if (this.connectionInfo.state === "connecting") {
      // Wait for existing connection attempt
      return new Promise((resolve, reject) => {
        const checkConnection = setInterval(() => {
          if (this.connectionInfo.state === "connected") {
            clearInterval(checkConnection);
            resolve();
          } else if (
            this.connectionInfo.state === "disconnected" ||
            this.connectionInfo.state === "error"
          ) {
            clearInterval(checkConnection);
            reject(new Error("Connection failed"));
          }
        }, 100);
      });
    }

    this.updateState("connecting");

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error("Connection timeout"));
      }, this.config.connectionTimeout);

      try {
        // Build WebSocket URL with auth
        const url = new URL(this.config.endpoint);
        url.searchParams.set("apiKey", this.config.apiKey);

        this.ws = new WebSocket(url.toString());

        this.ws.onopen = () => {
          this.debug("WebSocket connected");
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(
              event.data as string,
            ) as StreamingServerMessage;
            this.handleMessage(message);

            // Resolve connection on 'connected' message
            if (message.type === "connected") {
              clearTimeout(timeout);
              this.connectionInfo.connectionId = message.connectionId;
              this.connectionInfo.connectedAt = Date.now();
              this.connectionInfo.reconnectAttempts = 0;
              this.updateState("connected");
              this.startHeartbeat();
              this.resubscribeAll();
              this.flushOfflineBuffer();
              resolve();
            }
          } catch (err) {
            this.debug("Failed to parse message:", err);
          }
        };

        this.ws.onerror = (error) => {
          this.debug("WebSocket error:", error);
          clearTimeout(timeout);
          this.updateState("error");
          reject(new Error("WebSocket connection error"));
        };

        this.ws.onclose = (event) => {
          this.debug("WebSocket closed:", event.code, event.reason);
          clearTimeout(timeout);
          this.stopHeartbeat();

          if (
            this.config.autoReconnect &&
            this.connectionInfo.state !== "disconnected"
          ) {
            this.scheduleReconnect();
          } else {
            this.updateState("disconnected");
          }
        };
      } catch (error) {
        clearTimeout(timeout);
        this.updateState("error");
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

    this.updateState("disconnected");
    this.subscriptions.clear();
    this.connectionInfo.subscriptions.clear();
    this.pendingAcks.clear();
  }

  /**
   * Subscribe to events for a session, user, or feature
   */
  subscribe(options: {
    sessionId?: string;
    userId?: string;
    featureId?: string;
    filters?: StreamingFilters;
    handlers?: StreamingHandlers;
  }): Subscription {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const subscription: Subscription = {
      id: subscriptionId,
      sessionId: options.sessionId,
      userId: options.userId,
      featureId: options.featureId,
      filters: options.filters,
      createdAt: Date.now(),
      handlers: options.handlers ?? {},
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.connectionInfo.subscriptions.add(subscriptionId);

    // Send subscribe message if connected
    if (this.isConnected) {
      this.sendSubscribe(subscription);
    }

    return subscription;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    this.subscriptions.delete(subscriptionId);
    this.connectionInfo.subscriptions.delete(subscriptionId);

    if (this.isConnected) {
      const message: UnsubscribeMessage = {
        type: "unsubscribe",
        subscriptionId,
        messageId: generateMessageId(),
        timestamp: Date.now(),
      };
      this.send(message);
    }
  }

  /**
   * Subscribe to a specific session with simplified API
   */
  subscribeToSession(
    sessionId: string,
    handlers: StreamingHandlers,
  ): Subscription {
    return this.subscribe({
      sessionId,
      handlers,
    });
  }

  /**
   * Subscribe to all sessions for a user
   */
  subscribeToUser(userId: string, handlers: StreamingHandlers): Subscription {
    return this.subscribe({
      userId,
      handlers,
    });
  }

  /**
   * Subscribe to all sessions for a feature
   */
  subscribeToFeature(
    featureId: string,
    handlers: StreamingHandlers,
  ): Subscription {
    return this.subscribe({
      featureId,
      handlers,
    });
  }

  // =========================================================================
  // Internal Methods
  // =========================================================================

  private handleMessage(message: StreamingServerMessage): void {
    this.debug("Received message:", message.type);

    switch (message.type) {
      case "event":
        this.handleEventMessage(message as EventMessage);
        break;
      case "event_batch":
        for (const event of message.events) {
          this.handleEventMessage(event);
        }
        break;
      case "token_chunk":
        this.handleTokenChunk(message as TokenChunkMessage);
        break;
      case "heartbeat":
        this.connectionInfo.lastHeartbeat = Date.now();
        break;
      case "ack":
        this.handleAck(message);
        break;
      case "error":
        this.handleError(message);
        break;
      case "connected":
        // Handled in connect()
        break;
    }
  }

  private handleEventMessage(message: EventMessage): void {
    const event = message.event;

    // Notify global handlers
    this.globalHandlers.onEvent?.(event);

    // Special handling for session lifecycle events
    if (event.type === "session_start") {
      this.globalHandlers.onSessionStart?.(event.sessionId, event);
    } else if (event.type === "session_end") {
      this.globalHandlers.onSessionEnd?.(event.sessionId, event);
    }

    // Notify subscription-specific handlers
    for (const subscription of this.subscriptions.values()) {
      if (this.matchesSubscription(event, subscription)) {
        subscription.handlers.onEvent?.(event);

        if (event.type === "session_start") {
          subscription.handlers.onSessionStart?.(event.sessionId, event);
        } else if (event.type === "session_end") {
          subscription.handlers.onSessionEnd?.(event.sessionId, event);
        }
      }
    }
  }

  private handleTokenChunk(message: TokenChunkMessage): void {
    // Notify global handlers
    this.globalHandlers.onTokenChunk?.(message);

    // Notify subscription-specific handlers
    for (const subscription of this.subscriptions.values()) {
      if (
        !subscription.sessionId ||
        subscription.sessionId === message.sessionId
      ) {
        if (subscription.filters?.includeChunks !== false) {
          subscription.handlers.onTokenChunk?.(message);
        }
      }
    }
  }

  private handleAck(message: { originalMessageId: string }): void {
    const pending = this.pendingAcks.get(message.originalMessageId);
    if (pending) {
      pending.resolve(message);
      this.pendingAcks.delete(message.originalMessageId);
    }
  }

  private handleError(message: {
    code: string;
    message: string;
    originalMessageId?: string;
  }): void {
    const error = new StreamingError(
      message.code as StreamingError["code"],
      message.message,
      message.originalMessageId,
    );

    // Reject pending ack if this is a response to a message
    if (message.originalMessageId) {
      const pending = this.pendingAcks.get(message.originalMessageId);
      if (pending) {
        pending.reject(error);
        this.pendingAcks.delete(message.originalMessageId);
      }
    }

    // Notify handlers
    this.globalHandlers.onError?.(error);
    for (const subscription of this.subscriptions.values()) {
      subscription.handlers.onError?.(error);
    }
  }

  private matchesSubscription(
    event: StreamingEvent,
    subscription: Subscription,
  ): boolean {
    // Check session filter
    if (subscription.sessionId && event.sessionId !== subscription.sessionId) {
      return false;
    }

    // Check user filter
    if (subscription.userId && event.data.userId !== subscription.userId) {
      return false;
    }

    // Check feature filter
    if (
      subscription.featureId &&
      event.data.featureId !== subscription.featureId
    ) {
      return false;
    }

    // Check event type filter
    if (
      subscription.filters?.eventTypes &&
      !subscription.filters.eventTypes.includes(event.type)
    ) {
      return false;
    }

    // Check model filter
    if (
      subscription.filters?.models &&
      event.data.model &&
      !subscription.filters.models.includes(event.data.model)
    ) {
      return false;
    }

    // Check tool filter
    if (
      subscription.filters?.tools &&
      event.data.toolName &&
      !subscription.filters.tools.includes(event.data.toolName)
    ) {
      return false;
    }

    // Check cost filter
    if (subscription.filters?.minCost !== undefined && event.data.cost) {
      if (event.data.cost.totalCost < subscription.filters.minCost) {
        return false;
      }
    }

    if (subscription.filters?.maxCost !== undefined && event.data.cost) {
      if (event.data.cost.totalCost > subscription.filters.maxCost) {
        return false;
      }
    }

    return true;
  }

  private sendSubscribe(subscription: Subscription): void {
    const message: SubscribeMessage = {
      type: "subscribe",
      sessionId: subscription.sessionId,
      userId: subscription.userId,
      featureId: subscription.featureId,
      filters: subscription.filters,
      messageId: generateMessageId(),
      timestamp: Date.now(),
    };

    this.send(message);
  }

  private send(message: StreamingMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Buffer message for later
      if (this.offlineBuffer.length < this.config.offlineBufferSize) {
        this.offlineBuffer.push(message);
      }
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      this.debug("Failed to send message:", error);
    }
  }

  private resubscribeAll(): void {
    for (const subscription of this.subscriptions.values()) {
      this.sendSubscribe(subscription);
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
      if (this.isConnected) {
        const heartbeat: HeartbeatMessage = {
          type: "heartbeat",
          messageId: generateMessageId(),
          timestamp: Date.now(),
        };
        this.send(heartbeat);
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
    if (
      this.connectionInfo.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      this.debug("Max reconnection attempts reached");
      this.updateState("error");
      return;
    }

    this.updateState("reconnecting");
    this.connectionInfo.reconnectAttempts++;

    const delay = calculateBackoff(
      this.connectionInfo.reconnectAttempts,
      this.config.reconnectBaseDelay,
      this.config.reconnectMaxDelay,
    );

    this.debug(
      `Reconnecting in ${delay}ms (attempt ${this.connectionInfo.reconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        this.debug("Reconnection failed:", err);
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private updateState(state: ConnectionState): void {
    const prevState = this.connectionInfo.state;
    this.connectionInfo.state = state;

    if (prevState !== state) {
      this.debug(`Connection state: ${prevState} -> ${state}`);
      this.globalHandlers.onConnectionChange?.(state, this.connectionInfo);

      for (const subscription of this.subscriptions.values()) {
        subscription.handlers.onConnectionChange?.(state, this.connectionInfo);
      }
    }
  }

  private debug(...args: unknown[]): void {
    if (this.config.debug) {
      console.log("[StreamingClient]", ...args);
    }
  }
}
