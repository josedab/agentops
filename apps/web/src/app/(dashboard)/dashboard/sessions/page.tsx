"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatNumber, formatDuration, formatRelativeTime } from "@/lib/utils";
import { Search, Filter, ChevronRight } from "lucide-react";

export default function SessionsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  
  const { data, isLoading } = trpc.sessions.list.useQuery({
    status: statusFilter as "active" | "completed" | "error" | undefined,
    limit: 50,
  });

  const filteredSessions = data?.sessions.filter((session) => {
    if (!search) return true;
    return (
      session.id.toLowerCase().includes(search.toLowerCase()) ||
      session.userId?.toLowerCase().includes(search.toLowerCase()) ||
      session.featureId?.toLowerCase().includes(search.toLowerCase())
    );
  }) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Sessions</h1>
          <p className="text-muted-foreground">View and debug agent sessions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={statusFilter === undefined ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(undefined)}
          >
            All
          </Button>
          <Button
            variant={statusFilter === "completed" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("completed")}
          >
            Completed
          </Button>
          <Button
            variant={statusFilter === "error" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("error")}
          >
            Errors
          </Button>
        </div>
      </div>

      {/* Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {data?.total ?? 0} Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No sessions found</div>
          ) : (
            <div className="divide-y">
              {filteredSessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/dashboard/sessions/${session.id}`}
                  className="flex items-center justify-between py-4 hover:bg-muted/50 -mx-4 px-4 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-3 w-3 rounded-full ${
                      session.status === "completed" ? "bg-green-500" :
                      session.status === "error" ? "bg-red-500" : "bg-yellow-500"
                    }`} />
                    <div>
                      <div className="font-mono text-sm">{session.id}</div>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        <span>{session.featureId}</span>
                        <span>{session.userId}</span>
                        <span>{session.model}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <div className="text-sm font-medium">{formatCurrency(session.totalCost)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(session.promptTokens + session.completionTokens)} tokens
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">{formatDuration(session.durationMs)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatRelativeTime(session.startedAt)}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
