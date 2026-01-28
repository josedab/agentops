"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { 
  Activity, 
  DollarSign, 
  AlertTriangle, 
  Zap,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

function MetricCard({
  title,
  value,
  change,
  icon: Icon,
  format = "number",
}: {
  title: string;
  value: number;
  change?: number;
  icon: React.ElementType;
  format?: "number" | "currency" | "percent";
}) {
  const formattedValue = format === "currency" 
    ? formatCurrency(value)
    : format === "percent"
    ? `${value.toFixed(1)}%`
    : formatNumber(value);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formattedValue}</div>
        {change !== undefined && (
          <div className={`flex items-center text-xs mt-1 ${
            change >= 0 ? "text-green-600" : "text-red-600"
          }`}>
            {change >= 0 ? (
              <TrendingUp className="h-3 w-3 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" />
            )}
            {Math.abs(change).toFixed(1)}% from last period
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: overview } = trpc.metrics.overview.useQuery({ timeRange: "24h" });
  const { data: timeSeries } = trpc.metrics.timeSeries.useQuery({ 
    timeRange: "24h",
    metrics: ["sessions", "cost"],
  });
  const { data: costBreakdown } = trpc.metrics.costBreakdown.useQuery({
    timeRange: "24h",
    groupBy: "feature",
  });
  const { data: recentSessions } = trpc.sessions.list.useQuery({ limit: 5 });

  const chartData = timeSeries?.map((d) => ({
    time: new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    sessions: d.sessions,
    cost: d.cost,
    errors: d.errors,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Monitor your AI agent performance</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Sessions"
          value={overview?.totalSessions ?? 0}
          change={overview?.totalSessionsChange}
          icon={Activity}
        />
        <MetricCard
          title="Total Events"
          value={overview?.totalEvents ?? 0}
          change={overview?.totalEventsChange}
          icon={Zap}
        />
        <MetricCard
          title="Total Cost"
          value={overview?.totalCost ?? 0}
          change={overview?.totalCostChange}
          icon={DollarSign}
          format="currency"
        />
        <MetricCard
          title="Error Rate"
          value={overview?.errorRate ?? 0}
          change={overview?.errorRateChange}
          icon={AlertTriangle}
          format="percent"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sessions Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="sessions"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v) => `$${Number(v).toFixed(2)}`} />
                  <Line type="monotone" dataKey="cost" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cost by Feature</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {costBreakdown?.map((item, idx) => {
                const name = 'featureId' in item ? item.featureId : item.model;
                return (
                <div key={name || idx} className="flex items-center">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{name}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(item.cost)} ({item.percentage}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${item.percentage}%` }} />
                    </div>
                  </div>
                </div>
              )})}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentSessions?.sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${
                      session.status === "completed" ? "bg-green-500" :
                      session.status === "error" ? "bg-red-500" : "bg-yellow-500"
                    }`} />
                    <div>
                      <div className="font-medium text-sm">{session.featureId}</div>
                      <div className="text-xs text-muted-foreground">{session.userId} • {session.model}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{formatCurrency(session.totalCost)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(session.promptTokens + session.completionTokens)} tokens
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
