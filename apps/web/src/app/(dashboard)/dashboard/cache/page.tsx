"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function CachePage() {
  const [configEnabled, setConfigEnabled] = useState(true);
  const [threshold, setThreshold] = useState(0.95);

  const { data: stats, refetch: refetchStats } = trpc.cache.getStats.useQuery({
    timeRange: "24h",
  });

  const { data: entries, refetch: refetchEntries } = trpc.cache.list.useQuery({
    limit: 20,
    sortBy: "hitCount",
    sortOrder: "desc",
  });

  const invalidateMutation = trpc.cache.invalidate.useMutation({
    onSuccess: () => {
      refetchStats();
      refetchEntries();
    },
  });

  const updateConfigMutation = trpc.cache.updateConfig.useMutation();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Semantic Cache</h1>
          <p className="text-muted-foreground">
            Reduce costs and latency with intelligent prompt caching
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => invalidateMutation.mutate({})}
          disabled={invalidateMutation.isPending}
        >
          Clear All Cache
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cache Entries</CardDescription>
            <CardTitle className="text-3xl">
              {stats?.totalEntries?.toLocaleString() || "0"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Active cached responses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Hits</CardDescription>
            <CardTitle className="text-3xl">
              {stats?.totalHits?.toLocaleString() || "0"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Requests served from cache
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Hit Rate</CardDescription>
            <CardTitle className="text-3xl">
              {stats?.hitRate?.toFixed(1) || "0"}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Cache efficiency</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Estimated Savings</CardDescription>
            <CardTitle className="text-3xl text-green-500">
              ${stats?.estimatedSavings?.cost?.toFixed(2) || "0"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {stats?.estimatedSavings?.tokens?.toLocaleString() || "0"} tokens
              saved
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Cache settings for this project</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Cache Enabled</span>
              <Button
                variant={configEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setConfigEnabled(!configEnabled);
                  updateConfigMutation.mutate({
                    projectId: "default",
                    enabled: !configEnabled,
                  });
                }}
              >
                {configEnabled ? "Enabled" : "Disabled"}
              </Button>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">
                Similarity Threshold: {threshold}
              </label>
              <input
                type="range"
                min="0.8"
                max="1"
                step="0.01"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Higher = stricter matching, fewer hits but more accurate
              </p>
            </div>

            <div className="pt-2">
              <Button
                className="w-full"
                onClick={() => {
                  updateConfigMutation.mutate({
                    projectId: "default",
                    similarityThreshold: threshold,
                  });
                }}
              >
                Save Configuration
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Top Cached Prompts */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top Cached Prompts</CardTitle>
            <CardDescription>Most frequently hit cache entries</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.topPrompts?.length ? (
                stats.topPrompts.map((prompt, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between p-3 bg-muted rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{prompt.promptPreview}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Model: {prompt.model}
                      </p>
                    </div>
                    <div className="ml-4 text-right">
                      <p className="font-semibold">{prompt.hitCount}</p>
                      <p className="text-xs text-muted-foreground">hits</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No cached prompts yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cache by Model */}
        <Card>
          <CardHeader>
            <CardTitle>Cache by Model</CardTitle>
            <CardDescription>Distribution of cached responses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.byModel && Object.entries(stats.byModel).length > 0 ? (
                Object.entries(stats.byModel).map(([model, count]) => (
                  <div
                    key={model}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm">{model}</span>
                    <span className="font-semibold">{count as number}</span>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  No data yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Cache Entries */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Cache Entries</CardTitle>
            <CardDescription>Latest cached responses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Prompt</th>
                    <th className="text-left py-2 px-2">Model</th>
                    <th className="text-right py-2 px-2">Hits</th>
                    <th className="text-right py-2 px-2">Last Access</th>
                  </tr>
                </thead>
                <tbody>
                  {entries?.entries?.length ? (
                    entries.entries.map((entry) => (
                      <tr key={entry.id} className="border-b">
                        <td className="py-2 px-2">
                          <p className="truncate max-w-[200px]">
                            {entry.promptPreview}
                          </p>
                        </td>
                        <td className="py-2 px-2">{entry.model}</td>
                        <td className="py-2 px-2 text-right">
                          {entry.hitCount}
                        </td>
                        <td className="py-2 px-2 text-right text-muted-foreground">
                          {new Date(entry.lastAccessedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No cache entries yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
