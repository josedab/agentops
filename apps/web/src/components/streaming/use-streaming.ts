"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

export interface StreamingEvent {
  eventId: string;
  sessionId: string;
  parentEventId?: string;
  type: string;
  timestamp: number;
  data: {
    content?: string;
    model?: string;
    durationMs?: number;
    userId?: string;
    featureId?: string;
    status?: string;
    tokens?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    cost?: {
      inputCost: number;
      outputCost: number;
      totalCost: number;
    };
    toolName?: string;
    toolInput?: unknown;
    toolOutput?: unknown;
    toolStatus?: string;
    errorType?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface TokenChunk {
  sessionId: string;
  eventId: string;
  chunk: string;
  index: number;
  isComplete: boolean;
}

export interface ConnectionState {
  status:
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "error";
  connectionId?: string;
  lastHeartbeat?: number;
  reconnectAttempts: number;
}

export interface UseStreamingOptions {
  endpoint: string;
  apiKey: string;
  sessionId?: string;
  userId?: string;
  featureId?: string;
  autoConnect?: boolean;
  onEvent?: (event: StreamingEvent) => void;
  onChunk?: (chunk: TokenChunk) => void;
  onConnectionChange?: (state: ConnectionState) => void;
}

// ============================================================================
// Hook: useStreaming
// ============================================================================

export function useStreaming(options: UseStreamingOptions) {
  const {
    endpoint,
    apiKey,
    sessionId,
    userId,
    featureId,
    autoConnect = true,
    onEvent,
    onChunk,
    onConnectionChange,
  } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: "disconnected",
    reconnectAttempts: 0,
  });
  const [events, setEvents] = useState<StreamingEvent[]>([]);
  const [chunks, setChunks] = useState<Map<string, string>>(new Map());

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateConnectionState = useCallback(
    (update: Partial<ConnectionState>) => {
      setConnectionState((prev) => {
        const newState = { ...prev, ...update };
        onConnectionChange?.(newState);
        return newState;
      });
    },
    [onConnectionChange],
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    updateConnectionState({ status: "connecting" });

    try {
      const url = new URL(endpoint);
      url.searchParams.set("apiKey", apiKey);

      const ws = new WebSocket(url.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        updateConnectionState({
          status: "connected",
          reconnectAttempts: 0,
        });

        // Send subscription message
        const subscribeMsg = {
          type: "subscribe",
          messageId: `msg_${Date.now()}`,
          timestamp: Date.now(),
          sessionId,
          userId,
          featureId,
        };
        ws.send(JSON.stringify(subscribeMsg));

        // Start heartbeat
        heartbeatTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "heartbeat",
                messageId: `msg_${Date.now()}`,
                timestamp: Date.now(),
              }),
            );
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case "connected":
              updateConnectionState({ connectionId: message.connectionId });
              break;
            case "event": {
              const streamingEvent = message.event as StreamingEvent;
              setEvents((prev) => [...prev, streamingEvent]);
              onEvent?.(streamingEvent);
              break;
            }
            case "event_batch": {
              const batchEvents = message.events.map(
                (e: { event: StreamingEvent }) => e.event,
              );
              setEvents((prev) => [...prev, ...batchEvents]);
              batchEvents.forEach((e: StreamingEvent) => onEvent?.(e));
              break;
            }
            case "token_chunk": {
              const chunk = message as TokenChunk;
              setChunks((prev) => {
                const key = `${chunk.sessionId}:${chunk.eventId}`;
                const current = prev.get(key) ?? "";
                const newMap = new Map(prev);
                newMap.set(key, current + chunk.chunk);
                return newMap;
              });
              onChunk?.(chunk);
              break;
            }
            case "heartbeat":
              updateConnectionState({ lastHeartbeat: Date.now() });
              break;
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onerror = () => {
        updateConnectionState({ status: "error" });
      };

      ws.onclose = () => {
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current);
        }

        // Schedule reconnect
        const { reconnectAttempts } = connectionState;
        if (reconnectAttempts < 10) {
          updateConnectionState({ status: "reconnecting" });
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          reconnectTimerRef.current = setTimeout(() => {
            updateConnectionState({ reconnectAttempts: reconnectAttempts + 1 });
            connect();
          }, delay);
        } else {
          updateConnectionState({ status: "error" });
        }
      };
    } catch {
      updateConnectionState({ status: "error" });
    }
  }, [
    endpoint,
    apiKey,
    sessionId,
    userId,
    featureId,
    connectionState.reconnectAttempts,
    updateConnectionState,
    onEvent,
    onChunk,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnected");
      wsRef.current = null;
    }
    updateConnectionState({ status: "disconnected", reconnectAttempts: 0 });
  }, [updateConnectionState]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const clearChunks = useCallback(() => {
    setChunks(new Map());
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect]);

  return {
    connectionState,
    events,
    chunks,
    connect,
    disconnect,
    clearEvents,
    clearChunks,
    isConnected: connectionState.status === "connected",
  };
}

// ============================================================================
// Hook: useStreamingSession
// ============================================================================

export interface SessionTreeNode {
  event: StreamingEvent;
  children: SessionTreeNode[];
}

export function useStreamingSession(
  sessionId: string,
  options: Omit<UseStreamingOptions, "sessionId">,
) {
  const streaming = useStreaming({ ...options, sessionId });

  // Build event tree from flat events
  const eventTree = buildEventTree(streaming.events);

  // Calculate session stats
  const stats = calculateSessionStats(streaming.events);

  // Get accumulated response content for streaming responses
  const getResponseContent = useCallback(
    (eventId: string) => {
      return streaming.chunks.get(`${sessionId}:${eventId}`) ?? "";
    },
    [sessionId, streaming.chunks],
  );

  return {
    ...streaming,
    eventTree,
    stats,
    getResponseContent,
  };
}

function buildEventTree(events: StreamingEvent[]): SessionTreeNode[] {
  const nodeMap = new Map<string, SessionTreeNode>();
  const roots: SessionTreeNode[] = [];

  // Create nodes
  for (const event of events) {
    nodeMap.set(event.eventId, { event, children: [] });
  }

  // Build tree structure
  for (const event of events) {
    const node = nodeMap.get(event.eventId)!;
    if (event.parentEventId && nodeMap.has(event.parentEventId)) {
      nodeMap.get(event.parentEventId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function calculateSessionStats(events: StreamingEvent[]) {
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalCost = 0;
  let toolCalls = 0;
  let errors = 0;
  const models = new Set<string>();
  const tools = new Set<string>();

  for (const event of events) {
    if (event.data.tokens) {
      totalTokens += event.data.tokens.totalTokens;
      promptTokens += event.data.tokens.promptTokens;
      completionTokens += event.data.tokens.completionTokens;
    }
    if (event.data.cost) {
      totalCost += event.data.cost.totalCost;
    }
    if (event.data.model) {
      models.add(event.data.model);
    }
    if (event.type === "tool_call") {
      toolCalls++;
      if (event.data.toolName) {
        tools.add(event.data.toolName);
      }
    }
    if (event.type === "error") {
      errors++;
    }
  }

  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  const durationMs =
    lastEvent && firstEvent ? lastEvent.timestamp - firstEvent.timestamp : 0;

  return {
    eventCount: events.length,
    totalTokens,
    promptTokens,
    completionTokens,
    totalCost,
    toolCalls,
    errors,
    models: Array.from(models),
    tools: Array.from(tools),
    durationMs,
  };
}
