"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronDown,
  MessageSquare,
  Bot,
  Wrench,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Play,
  Pause,
} from "lucide-react";
import {
  StreamingText,
  TokenCounter,
  CostTicker,
  DurationTimer,
} from "./streaming-text";
import type { StreamingEvent, SessionTreeNode } from "./use-streaming";

// ============================================================================
// Event Node Component
// ============================================================================

interface EventNodeProps {
  node: SessionTreeNode;
  depth?: number;
  isStreaming?: boolean;
  streamingContent?: string;
  onSelect?: (event: StreamingEvent) => void;
  selectedEventId?: string;
}

function EventNode({
  node,
  depth = 0,
  isStreaming,
  streamingContent,
  onSelect,
  selectedEventId,
}: EventNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const { event, children } = node;
  const hasChildren = children.length > 0;
  const isSelected = selectedEventId === event.eventId;

  const icon = useMemo(() => {
    switch (event.type) {
      case "prompt":
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case "response":
      case "response_chunk":
        return <Bot className="h-4 w-4 text-green-500" />;
      case "tool_call":
        return <Wrench className="h-4 w-4 text-purple-500" />;
      case "tool_result":
        return event.data.toolStatus === "success" ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <AlertCircle className="h-4 w-4 text-red-500" />
        );
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "thinking":
        return <Zap className="h-4 w-4 text-yellow-500 animate-pulse" />;
      case "session_start":
        return <Play className="h-4 w-4 text-blue-500" />;
      case "session_end":
        return <Pause className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  }, [event.type, event.data.toolStatus]);

  const summary = useMemo(() => {
    switch (event.type) {
      case "prompt": {
        const content = event.data.content ?? "";
        return content.length > 100 ? content.slice(0, 100) + "..." : content;
      }
      case "response": {
        const responseContent = streamingContent ?? event.data.content ?? "";
        return responseContent.length > 100
          ? responseContent.slice(0, 100) + "..."
          : responseContent;
      }
      case "tool_call":
        return `${event.data.toolName}(${JSON.stringify(event.data.toolInput).slice(0, 50)}...)`;
      case "tool_result":
        return `${event.data.toolName}: ${event.data.toolStatus}`;
      case "error":
        return event.data.errorMessage ?? "Unknown error";
      case "session_start":
        return `Session started${event.data.userId ? ` (${event.data.userId})` : ""}`;
      case "session_end":
        return `Session ended: ${event.data.status}`;
      default:
        return event.type;
    }
  }, [event, streamingContent]);

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors",
          isSelected ? "bg-primary/10" : "hover:bg-muted/50",
          isStreaming && "border-l-2 border-primary animate-pulse",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect?.(event)}
      >
        {/* Expand/Collapse toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-muted rounded"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Icon */}
        {icon}

        {/* Event type label */}
        <span className="text-xs font-medium text-muted-foreground uppercase w-20">
          {event.type.replace("_", " ")}
        </span>

        {/* Summary */}
        <span className="flex-1 text-sm truncate">
          {isStreaming && event.type === "response" ? (
            <StreamingText
              content={streamingContent ?? event.data.content ?? ""}
              isStreaming={isStreaming}
            />
          ) : (
            summary
          )}
        </span>

        {/* Duration */}
        {event.data.durationMs !== undefined && (
          <span className="text-xs text-muted-foreground font-mono">
            {event.data.durationMs}ms
          </span>
        )}

        {/* Tokens */}
        {event.data.tokens && (
          <span className="text-xs text-muted-foreground font-mono">
            {event.data.tokens.totalTokens} tok
          </span>
        )}

        {/* Cost */}
        {event.data.cost && (
          <span className="text-xs text-green-600 font-mono">
            ${event.data.cost.totalCost.toFixed(4)}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <EventNode
              key={child.event.eventId}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedEventId={selectedEventId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Live Trace Tree Component
// ============================================================================

interface LiveTraceTreeProps {
  events: StreamingEvent[];
  eventTree: SessionTreeNode[];
  streamingChunks: Map<string, string>;
  sessionId: string;
  isConnected: boolean;
  onEventSelect?: (event: StreamingEvent) => void;
  selectedEventId?: string;
  className?: string;
}

/**
 * LiveTraceTree renders a real-time decision tree visualization
 * of agent events as they stream in.
 */
export function LiveTraceTree({
  events,
  eventTree,
  streamingChunks,
  sessionId,
  isConnected,
  onEventSelect,
  selectedEventId,
  className,
}: LiveTraceTreeProps) {
  // Find currently streaming event (response without completion)
  const streamingEventId = useMemo(() => {
    const responseEvents = events.filter((e) => e.type === "response");
    const lastResponse = responseEvents[responseEvents.length - 1];
    if (
      lastResponse &&
      streamingChunks.has(`${sessionId}:${lastResponse.eventId}`)
    ) {
      return lastResponse.eventId;
    }
    return null;
  }, [events, streamingChunks, sessionId]);

  if (eventTree.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center p-8 text-muted-foreground",
          className,
        )}
      >
        {isConnected ? (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span>Waiting for events...</span>
          </div>
        ) : (
          <span>Not connected</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("font-mono text-sm", className)}>
      {eventTree.map((node) => (
        <EventNode
          key={node.event.eventId}
          node={node}
          isStreaming={node.event.eventId === streamingEventId}
          streamingContent={streamingChunks.get(
            `${sessionId}:${node.event.eventId}`,
          )}
          onSelect={onEventSelect}
          selectedEventId={selectedEventId}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Session Stats Bar Component
// ============================================================================

interface SessionStatsBarProps {
  stats: {
    eventCount: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalCost: number;
    toolCalls: number;
    errors: number;
    models: string[];
    tools: string[];
    durationMs: number;
  };
  isStreaming?: boolean;
  startTime?: number;
  className?: string;
}

/**
 * SessionStatsBar displays real-time session statistics.
 */
export function SessionStatsBar({
  stats,
  isStreaming,
  startTime,
  className,
}: SessionStatsBarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-6 p-3 bg-muted/30 rounded-lg text-sm",
        className,
      )}
    >
      {/* Connection indicator */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            isStreaming ? "bg-green-500 animate-pulse" : "bg-gray-400",
          )}
        />
        <span className="text-muted-foreground">
          {isStreaming ? "Live" : "Ended"}
        </span>
      </div>

      {/* Duration */}
      {startTime && (
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <DurationTimer
            startTime={startTime}
            endTime={isStreaming ? undefined : startTime + stats.durationMs}
          />
        </div>
      )}

      {/* Events */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Events:</span>
        <span className="font-mono font-medium">{stats.eventCount}</span>
      </div>

      {/* Tokens */}
      <TokenCounter
        promptTokens={stats.promptTokens}
        completionTokens={stats.completionTokens}
        isStreaming={isStreaming}
      />

      {/* Cost */}
      <CostTicker cost={stats.totalCost} isStreaming={isStreaming} />

      {/* Tool calls */}
      {stats.toolCalls > 0 && (
        <div className="flex items-center gap-1">
          <Wrench className="h-4 w-4 text-purple-500" />
          <span className="font-mono">{stats.toolCalls}</span>
        </div>
      )}

      {/* Errors */}
      {stats.errors > 0 && (
        <div className="flex items-center gap-1 text-red-500">
          <AlertCircle className="h-4 w-4" />
          <span className="font-mono">{stats.errors}</span>
        </div>
      )}

      {/* Models */}
      {stats.models.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Model:</span>
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
            {stats.models[0]}
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Connection Status Component
// ============================================================================

interface ConnectionStatusProps {
  status:
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "error";
  connectionId?: string;
  reconnectAttempts?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  className?: string;
}

/**
 * ConnectionStatus displays WebSocket connection state with controls.
 */
export function ConnectionStatus({
  status,
  connectionId,
  reconnectAttempts,
  onConnect,
  onDisconnect,
  className,
}: ConnectionStatusProps) {
  const statusConfig = {
    disconnected: { color: "bg-gray-400", label: "Disconnected" },
    connecting: {
      color: "bg-yellow-500 animate-pulse",
      label: "Connecting...",
    },
    connected: { color: "bg-green-500", label: "Connected" },
    reconnecting: {
      color: "bg-yellow-500 animate-pulse",
      label: `Reconnecting (${reconnectAttempts})...`,
    },
    error: { color: "bg-red-500", label: "Error" },
  };

  const config = statusConfig[status];

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex items-center gap-2">
        <div className={cn("h-2 w-2 rounded-full", config.color)} />
        <span className="text-sm">{config.label}</span>
      </div>

      {connectionId && status === "connected" && (
        <span className="text-xs text-muted-foreground font-mono">
          {connectionId.slice(0, 8)}...
        </span>
      )}

      {status === "disconnected" && onConnect && (
        <button
          onClick={onConnect}
          className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          Connect
        </button>
      )}

      {status === "connected" && onDisconnect && (
        <button
          onClick={onDisconnect}
          className="text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded"
        >
          Disconnect
        </button>
      )}
    </div>
  );
}
