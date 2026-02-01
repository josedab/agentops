"use client";

import { useState, useCallback } from "react";
import {
  useStreaming,
  LiveTraceTree,
  SessionStatsBar,
  ConnectionStatus,
  StreamingText,
  type StreamingEvent,
  type SessionTreeNode,
} from "@/components/streaming";
import { cn } from "@/lib/utils";
import {
  Trash2,
  Filter,
  Maximize2,
  Minimize2,
  Copy,
  Download,
} from "lucide-react";

// Build event tree from flat events
function buildEventTree(events: StreamingEvent[]): SessionTreeNode[] {
  const nodeMap = new Map<string, SessionTreeNode>();
  const roots: SessionTreeNode[] = [];

  for (const event of events) {
    nodeMap.set(event.eventId, { event, children: [] });
  }

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

// Calculate session stats
function calculateStats(events: StreamingEvent[]) {
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

export default function LiveSessionsPage() {
  const [selectedEvent, setSelectedEvent] = useState<StreamingEvent | null>(
    null,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [filterSessionId, setFilterSessionId] = useState<string>("");

  // Use environment variables or defaults for demo
  const endpoint =
    process.env.NEXT_PUBLIC_STREAMING_ENDPOINT ?? "wss://stream.agentops.dev";
  const apiKey = process.env.NEXT_PUBLIC_AGENTOPS_API_KEY ?? "demo_key";

  const {
    connectionState,
    events,
    chunks,
    connect,
    disconnect,
    clearEvents,
    isConnected,
  } = useStreaming({
    endpoint,
    apiKey,
    autoConnect: false,
    onEvent: (event) => {
      console.log("[LivePage] Event received:", event.type);
    },
  });

  // Filter events by session if specified
  const filteredEvents = filterSessionId
    ? events.filter((e) => e.sessionId.includes(filterSessionId))
    : events;

  const eventTree = buildEventTree(filteredEvents);
  const stats = calculateStats(filteredEvents);
  const startTime = filteredEvents[0]?.timestamp;

  // Check if there's active streaming
  const isStreaming =
    isConnected &&
    filteredEvents.length > 0 &&
    filteredEvents[filteredEvents.length - 1]?.type !== "session_end";

  const handleEventSelect = useCallback((event: StreamingEvent) => {
    setSelectedEvent(event);
  }, []);

  const handleCopyEvent = useCallback(() => {
    if (selectedEvent) {
      navigator.clipboard.writeText(JSON.stringify(selectedEvent, null, 2));
    }
  }, [selectedEvent]);

  const handleExportEvents = useCallback(() => {
    const data = JSON.stringify(filteredEvents, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agentops-live-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEvents]);

  return (
    <div
      className={cn(
        "h-full flex flex-col",
        isFullscreen && "fixed inset-0 z-50 bg-background",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Live Sessions</h1>
          <p className="text-muted-foreground">
            Real-time streaming view of agent sessions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ConnectionStatus
            status={connectionState.status}
            connectionId={connectionState.connectionId}
            reconnectAttempts={connectionState.reconnectAttempts}
            onConnect={connect}
            onDisconnect={disconnect}
          />

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 hover:bg-muted rounded-md"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by session ID..."
            value={filterSessionId}
            onChange={(e) => setFilterSessionId(e.target.value)}
            className="h-8 px-3 text-sm border rounded-md bg-background w-48"
          />
        </div>

        <div className="flex-1" />

        <button
          onClick={clearEvents}
          disabled={events.length === 0}
          className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </button>

        <button
          onClick={handleExportEvents}
          disabled={filteredEvents.length === 0}
          className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      {/* Stats bar */}
      {filteredEvents.length > 0 && (
        <SessionStatsBar
          stats={stats}
          isStreaming={isStreaming}
          startTime={startTime}
          className="mb-4"
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Event tree */}
        <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
          <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
            <span className="font-medium">Event Stream</span>
            <span className="text-sm text-muted-foreground">
              {filteredEvents.length} events
            </span>
          </div>

          <div className="flex-1 overflow-auto p-2">
            <LiveTraceTree
              events={filteredEvents}
              eventTree={eventTree}
              streamingChunks={chunks}
              sessionId={filteredEvents[0]?.sessionId ?? ""}
              isConnected={isConnected}
              onEventSelect={handleEventSelect}
              selectedEventId={selectedEvent?.eventId}
            />
          </div>
        </div>

        {/* Event detail panel */}
        <div className="w-96 border rounded-lg overflow-hidden flex flex-col">
          <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
            <span className="font-medium">Event Details</span>
            {selectedEvent && (
              <button
                onClick={handleCopyEvent}
                className="p-1 hover:bg-muted rounded"
                title="Copy JSON"
              >
                <Copy className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {selectedEvent ? (
              <EventDetailPanel event={selectedEvent} chunks={chunks} />
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Select an event to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Event detail panel component
function EventDetailPanel({
  event,
  chunks,
}: {
  event: StreamingEvent;
  chunks: Map<string, string>;
}) {
  const streamingContent = chunks.get(`${event.sessionId}:${event.eventId}`);

  return (
    <div className="space-y-4 text-sm">
      {/* Event metadata */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Event ID</span>
          <span className="font-mono text-xs">{event.eventId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Type</span>
          <span className="font-medium">{event.type}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Timestamp</span>
          <span className="font-mono text-xs">
            {new Date(event.timestamp).toISOString()}
          </span>
        </div>
        {event.parentEventId && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Parent</span>
            <span className="font-mono text-xs">{event.parentEventId}</span>
          </div>
        )}
      </div>

      {/* Content */}
      {(event.data.content || streamingContent) && (
        <div className="space-y-1">
          <span className="text-muted-foreground">Content</span>
          <div className="p-3 bg-muted/30 rounded-md whitespace-pre-wrap font-mono text-xs max-h-48 overflow-auto">
            {streamingContent ? (
              <StreamingText content={streamingContent} isStreaming={true} />
            ) : (
              event.data.content
            )}
          </div>
        </div>
      )}

      {/* Tokens */}
      {event.data.tokens && (
        <div className="space-y-1">
          <span className="text-muted-foreground">Token Usage</span>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-muted/30 rounded">
              <div className="text-xs text-muted-foreground">Prompt</div>
              <div className="font-mono">
                {event.data.tokens.promptTokens.toLocaleString()}
              </div>
            </div>
            <div className="p-2 bg-muted/30 rounded">
              <div className="text-xs text-muted-foreground">Completion</div>
              <div className="font-mono">
                {event.data.tokens.completionTokens.toLocaleString()}
              </div>
            </div>
            <div className="p-2 bg-muted/30 rounded">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="font-mono font-medium">
                {event.data.tokens.totalTokens.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cost */}
      {event.data.cost && (
        <div className="space-y-1">
          <span className="text-muted-foreground">Cost</span>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-muted/30 rounded">
              <div className="text-xs text-muted-foreground">Input</div>
              <div className="font-mono text-green-600">
                ${event.data.cost.inputCost.toFixed(4)}
              </div>
            </div>
            <div className="p-2 bg-muted/30 rounded">
              <div className="text-xs text-muted-foreground">Output</div>
              <div className="font-mono text-green-600">
                ${event.data.cost.outputCost.toFixed(4)}
              </div>
            </div>
            <div className="p-2 bg-muted/30 rounded">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="font-mono font-medium text-green-600">
                ${event.data.cost.totalCost.toFixed(4)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tool info */}
      {event.data.toolName && (
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tool</span>
            <span className="font-medium">{event.data.toolName}</span>
          </div>
          {event.data.toolInput !== undefined && (
            <div className="space-y-1">
              <span className="text-muted-foreground">Input</span>
              <pre className="p-2 bg-muted/30 rounded text-xs overflow-auto max-h-32">
                {JSON.stringify(event.data.toolInput, null, 2)}
              </pre>
            </div>
          )}
          {event.data.toolOutput !== undefined && (
            <div className="space-y-1">
              <span className="text-muted-foreground">Output</span>
              <pre className="p-2 bg-muted/30 rounded text-xs overflow-auto max-h-32">
                {JSON.stringify(event.data.toolOutput, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Error info */}
      {event.data.errorMessage && (
        <div className="space-y-1">
          <span className="text-muted-foreground">Error</span>
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md">
            <div className="font-medium text-red-600">
              {event.data.errorType}
            </div>
            <div className="text-red-600/80">{event.data.errorMessage}</div>
          </div>
        </div>
      )}

      {/* Model */}
      {event.data.model && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Model</span>
          <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
            {event.data.model}
          </span>
        </div>
      )}

      {/* Duration */}
      {event.data.durationMs !== undefined && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Duration</span>
          <span className="font-mono">{event.data.durationMs}ms</span>
        </div>
      )}

      {/* Metadata */}
      {event.data.metadata && Object.keys(event.data.metadata).length > 0 && (
        <div className="space-y-1">
          <span className="text-muted-foreground">Metadata</span>
          <pre className="p-2 bg-muted/30 rounded text-xs overflow-auto max-h-32">
            {JSON.stringify(event.data.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
