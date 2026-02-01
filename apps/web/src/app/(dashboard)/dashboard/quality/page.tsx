"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function QualityPage() {
  const { data: metrics } = trpc.quality.getQualityMetrics.useQuery({
    granularity: "day",
  });

  const { data: distribution } = trpc.quality.getQualityDistribution.useQuery({
    timeRange: "7d",
  });

  const { data: dimensions } = trpc.quality.getDimensions.useQuery();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Quality Scoring</h1>
        <p className="text-muted-foreground">
          Monitor AI response quality with LLM-as-judge evaluation
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Score</CardDescription>
            <CardTitle className="text-3xl">
              {metrics?.summary?.avgScore?.toFixed(1) || "0.0"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Out of 10.0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Evaluations</CardDescription>
            <CardTitle className="text-3xl">
              {metrics?.summary?.totalEvaluations?.toLocaleString() || "0"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Improvement</CardDescription>
            <CardTitle className="text-3xl text-green-500">
              +{metrics?.summary?.improvementPercent?.toFixed(1) || "0"}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">vs previous period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Median Score</CardDescription>
            <CardTitle className="text-3xl">
              {distribution?.median?.toFixed(1) || "0.0"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              σ = {distribution?.stdDev?.toFixed(2) || "0"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quality Dimensions */}
        <Card>
          <CardHeader>
            <CardTitle>Quality Dimensions</CardTitle>
            <CardDescription>
              Average scores by evaluation criteria
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dimensions?.map((dim) => {
                const score =
                  metrics?.data?.[metrics.data.length - 1]?.dimensions?.[
                    dim.id as keyof (typeof metrics.data)[number]["dimensions"]
                  ] || 7.5;
                const percentage = (Number(score) / 10) * 100;

                return (
                  <div key={dim.id} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{dim.name}</span>
                      <span>
                        {typeof score === "number" ? score.toFixed(1) : score}
                        /10
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {dim.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
            <CardDescription>
              Distribution of quality scores (last 7 days)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {distribution?.buckets?.map((bucket) => (
                <div key={bucket.range} className="flex items-center gap-3">
                  <span className="w-12 text-sm text-muted-foreground">
                    {bucket.range}
                  </span>
                  <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full bg-primary/80 rounded transition-all"
                      style={{ width: `${bucket.percentage}%` }}
                    />
                  </div>
                  <span className="w-16 text-sm text-right">
                    {bucket.count}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Trend Over Time */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Quality Trend</CardTitle>
            <CardDescription>
              Average quality score over the last 7 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-end gap-2">
              {metrics?.data?.map((point, idx) => {
                const height = (point.avgScore / 10) * 100;
                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <div
                      className="w-full bg-primary/80 rounded-t transition-all hover:bg-primary"
                      style={{ height: `${height}%` }}
                      title={`Score: ${point.avgScore.toFixed(2)}`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {new Date(point.timestamp).toLocaleDateString("en-US", {
                        weekday: "short",
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
