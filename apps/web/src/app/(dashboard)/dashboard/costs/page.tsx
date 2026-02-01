"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

export default function CostsPage() {
  const { data: overview } = trpc.metrics.overview.useQuery({
    timeRange: "24h",
  });
  const { data: timeSeries } = trpc.metrics.timeSeries.useQuery({
    timeRange: "24h",
    metrics: ["cost"],
  });
  const { data: costByFeature } = trpc.metrics.costBreakdown.useQuery({
    timeRange: "24h",
    groupBy: "feature",
  });
  const { data: costByModel } = trpc.metrics.costBreakdown.useQuery({
    timeRange: "24h",
    groupBy: "model",
  });
  const { data: topUsers } = trpc.metrics.topUsers.useQuery({
    timeRange: "24h",
    limit: 10,
  });

  const chartData =
    timeSeries?.map((d) => ({
      time: new Date(d.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      cost: d.cost,
      tokens: d.promptTokens + d.completionTokens,
    })) ?? [];

  const featureData =
    costByFeature?.map((d) => ({
      name: "featureId" in d ? d.featureId : d.model,
      value: d.cost,
    })) ?? [];

  const modelData =
    costByModel?.map((d) => ({
      name:
        "model" in d
          ? d.model
          : ((d as { featureId?: string }).featureId ?? "unknown"),
      value: d.cost,
    })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cost Analytics</h1>
        <p className="text-muted-foreground">
          Track and optimize your AI spending
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Cost (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatCurrency(overview?.totalCost ?? 0)}
            </div>
            <div
              className={`text-xs mt-1 ${
                (overview?.totalCostChange ?? 0) <= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {(overview?.totalCostChange ?? 0) <= 0 ? "↓" : "↑"}{" "}
              {Math.abs(overview?.totalCostChange ?? 0).toFixed(1)}% vs
              yesterday
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Tokens (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatNumber(overview?.totalTokens ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              ~{formatCurrency((overview?.totalTokens ?? 0) * 0.00001)} at avg
              rate
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cost per Session
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatCurrency(
                (overview?.totalCost ?? 0) / (overview?.totalSessions ?? 1),
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Average across {formatNumber(overview?.totalSessions ?? 0)}{" "}
              sessions
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Projected Monthly
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatCurrency((overview?.totalCost ?? 0) * 30)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Based on current rate
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cost by Feature</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={featureData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {featureData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelData} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `$${v}`}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    width={100}
                  />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Bar
                    dataKey="value"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Users */}
      <Card>
        <CardHeader>
          <CardTitle>Top Users by Cost</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topUsers?.map((user, index) => (
              <div key={user.userId} className="flex items-center gap-4">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{user.userId}</span>
                    <span className="font-bold">
                      {formatCurrency(user.cost)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{user.sessions} sessions</span>
                    <span>{formatNumber(user.tokens)} tokens</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
