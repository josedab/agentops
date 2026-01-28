"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatNumber, formatDuration, cn } from "@/lib/utils";
import { 
  ArrowLeft, 
  Clock, 
  DollarSign, 
  Zap, 
  User, 
  Tag,
  MessageSquare,
  Bot,
  Wrench,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useState } from "react";

function EventIcon({ type }: { type: string }) {
  switch (type) {
    case "session_start":
    case "session_end":
      return <Clock className="h-4 w-4" />;
    case "prompt":
      return <MessageSquare className="h-4 w-4" />;
    case "response":
      return <Bot className="h-4 w-4" />;
    case "tool_call":
    case "tool_result":
      return <Wrench className="h-4 w-4" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Zap className="h-4 w-4" />;
  }
}

function EventCard({ event, isExpanded, onToggle }: { 
  event: any; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasContent = event.content || event.toolInput || event.toolOutput;
  
  return (
    <div className="border rounded-lg">
      <div 
        className={cn(
          "flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors",
          hasContent && "cursor-pointer"
        )}
        onClick={hasContent ? onToggle : undefined}
      >
        <div className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center",
          event.type === "error" ? "bg-red-100" :
          event.type === "response" ? "bg-green-100" :
          event.type === "tool_call" || event.type === "tool_result" ? "bg-blue-100" :
          "bg-muted"
        )}>
          <EventIcon type={event.type} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm capitalize">
              {event.type.replace(/_/g, " ")}
            </span>
            {event.role && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                {event.role}
              </span>
            )}
            {event.toolName && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {event.toolName}
              </span>
            )}
            {event.status === "success" && (
              <CheckCircle className="h-3 w-3 text-green-500" />
            )}
            {event.status === "error" && (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {new Date(event.timestamp).toLocaleTimeString([], { 
              hour: "2-digit", 
              minute: "2-digit",
              second: "2-digit",
              fractionalSecondDigits: 3,
            })}
            {event.durationMs > 0 && ` • ${formatDuration(event.durationMs)}`}
            {event.tokens && ` • ${formatNumber(event.tokens.totalTokens)} tokens`}
            {event.cost && ` • ${formatCurrency(event.cost)}`}
          </div>
        </div>
        
        {hasContent && (
          isExpanded ? 
            <ChevronDown className="h-4 w-4 text-muted-foreground" /> :
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      
      {isExpanded && hasContent && (
        <div className="border-t p-3 bg-muted/30">
          {event.content && (
            <pre className="text-sm whitespace-pre-wrap font-mono bg-background p-3 rounded border overflow-auto max-h-96">
              {typeof event.content === "string" ? event.content : JSON.stringify(event.content, null, 2)}
            </pre>
          )}
          {event.toolInput && (
            <div className="mb-2">
              <div className="text-xs font-medium text-muted-foreground mb-1">Input</div>
              <pre className="text-sm whitespace-pre-wrap font-mono bg-background p-3 rounded border">
                {JSON.stringify(event.toolInput, null, 2)}
              </pre>
            </div>
          )}
          {event.toolOutput && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Output</div>
              <pre className="text-sm whitespace-pre-wrap font-mono bg-background p-3 rounded border">
                {JSON.stringify(event.toolOutput, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  
  const { data: session, isLoading } = trpc.sessions.get.useQuery({ sessionId });
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const toggleEvent = (eventId: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (session?.events) {
      setExpandedEvents(new Set(session.events.map((e: any) => e.id)));
    }
  };

  const collapseAll = () => {
    setExpandedEvents(new Set());
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading session...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="text-muted-foreground">Session not found</div>
        <Link href="/dashboard/sessions">
          <Button variant="outline">Back to Sessions</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/sessions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">{session.id}</h1>
            <div className={cn(
              "px-2 py-1 rounded-full text-xs font-medium",
              session.status === "completed" ? "bg-green-100 text-green-700" :
              session.status === "error" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
            )}>
              {session.status}
            </div>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {new Date(session.startedAt).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Clock className="h-4 w-4" />
              Duration
            </div>
            <div className="text-2xl font-bold">{formatDuration(session.durationMs)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="h-4 w-4" />
              Cost
            </div>
            <div className="text-2xl font-bold">{formatCurrency(session.totalCost)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Zap className="h-4 w-4" />
              Tokens
            </div>
            <div className="text-2xl font-bold">
              {formatNumber(session.promptTokens + session.completionTokens)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatNumber(session.promptTokens)} in / {formatNumber(session.completionTokens)} out
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Zap className="h-4 w-4" />
              Events
            </div>
            <div className="text-2xl font-bold">{session.eventCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Session Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">User:</span>
              <span className="text-sm font-medium">{session.userId || "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Feature:</span>
              <span className="text-sm font-medium">{session.featureId || "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Model:</span>
              <span className="text-sm font-medium">{session.model}</span>
            </div>
          </div>
          {session.errorMessage && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
                <AlertCircle className="h-4 w-4" />
                Error
              </div>
              <div className="mt-1 text-sm text-red-600">{session.errorMessage}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events Timeline */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Event Timeline</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {session.events?.map((event: any) => (
              <EventCard
                key={event.id}
                event={event}
                isExpanded={expandedEvents.has(event.id)}
                onToggle={() => toggleEvent(event.id)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
