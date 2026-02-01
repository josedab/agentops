"use client";

import { useState, useCallback } from "react";
import {
  MessageSquare,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  Zap,
  Settings2,
  ThumbsUp,
  ThumbsDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types (mirroring SDK types for frontend)
// ============================================================================

interface ParsedAlertRule {
  rule: AlertRuleConfig;
  confidence: number;
  ambiguities: Ambiguity[];
  suggestions: string[];
}

interface AlertRuleConfig {
  name: string;
  description: string;
  metric: {
    type: string;
    name: string;
    unit: string;
    aggregation?: string;
    window?: number;
  };
  condition: {
    type: string;
    operator: string;
    value: number;
  };
  severity: "info" | "warning" | "critical";
  filters: Array<{
    field: string;
    operator: string;
    value: string | string[];
  }>;
  notifications: Array<{
    channel: string;
    recipients?: string[];
  }>;
}

interface Ambiguity {
  type: string;
  question: string;
  options: Array<{
    value: string | number;
    label: string;
    confidence: number;
  }>;
  default?: string | number;
}

// ============================================================================
// Example Queries
// ============================================================================

const EXAMPLE_QUERIES = [
  "Alert me when costs exceed $10 per hour",
  "Send a critical alert if error rate goes above 5%",
  "Notify me via Slack when latency spikes more than 50%",
  "Create an alert for chat-agent using more than 100k tokens per day",
  "Warn me if quality score drops below 0.8 in production",
];

// ============================================================================
// Mock Parser (simulates SDK NLAlertParser)
// ============================================================================

function simulateParse(query: string): Promise<ParsedAlertRule> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simple pattern matching for demo
      const hasCost = /cost|spending|expense|\$/i.test(query);
      const hasError = /error|failure/i.test(query);
      const hasLatency = /latency|response time|delay/i.test(query);
      const hasQuality = /quality|score/i.test(query);
      const hasTokens = /token/i.test(query);

      const thresholdMatch = query.match(
        /(\d+(?:\.\d+)?)\s*(%|k|m|\$|percent)?/i,
      );
      const threshold = thresholdMatch ? parseFloat(thresholdMatch[1]) : 0;

      const metricType = hasCost
        ? "cost"
        : hasError
          ? "error_rate"
          : hasLatency
            ? "latency"
            : hasQuality
              ? "quality_score"
              : hasTokens
                ? "token_usage"
                : "custom";

      const isAbove = /exceed|above|over|greater|more than|>\s*|spikes?/i.test(
        query,
      );
      const isBelow = /below|under|less than|drops?|<\s*/i.test(query);

      const severity = /critical|urgent|severe/i.test(query)
        ? "critical"
        : /warn/i.test(query)
          ? "warning"
          : "warning";

      const hasSlack = /slack/i.test(query);
      const hasEmail = /email/i.test(query);

      // Extract filters
      const filters: AlertRuleConfig["filters"] = [];
      const userMatch = query.match(/(?:for|from)\s+user\s+([^\s,]+)/i);
      if (userMatch) {
        filters.push({ field: "user", operator: "eq", value: userMatch[1] });
      }
      const envMatch = query.match(/(?:in|on)\s+(production|staging|dev)/i);
      if (envMatch) {
        filters.push({
          field: "environment",
          operator: "eq",
          value: envMatch[1],
        });
      }
      const featureMatch = query.match(
        /(?:for|from)\s+(?:the\s+)?([a-z0-9\-_]+)\s+(?:feature|agent)/i,
      );
      if (featureMatch) {
        filters.push({
          field: "feature",
          operator: "eq",
          value: featureMatch[1],
        });
      }

      // Determine confidence
      let confidence = 0.5;
      if (metricType !== "custom") confidence += 0.2;
      if (threshold > 0) confidence += 0.2;
      if (isAbove || isBelow) confidence += 0.1;

      // Build ambiguities
      const ambiguities: Ambiguity[] = [];
      if (metricType === "custom") {
        ambiguities.push({
          type: "metric",
          question: "Which metric should I monitor?",
          options: [
            {
              value: "cost",
              label: "Cost (spending in dollars)",
              confidence: 0.5,
            },
            {
              value: "error_rate",
              label: "Error Rate (% of failures)",
              confidence: 0.5,
            },
            {
              value: "latency",
              label: "Latency (response time)",
              confidence: 0.5,
            },
            {
              value: "quality_score",
              label: "Quality Score (0-1)",
              confidence: 0.5,
            },
          ],
          default: "cost",
        });
      }

      if (threshold === 0) {
        ambiguities.push({
          type: "threshold",
          question: "What threshold value should trigger the alert?",
          options: [
            {
              value: 10,
              label: metricType === "cost" ? "$10" : "10",
              confidence: 0.6,
            },
            {
              value: 100,
              label: metricType === "cost" ? "$100" : "100",
              confidence: 0.5,
            },
            {
              value: 1000,
              label: metricType === "cost" ? "$1,000" : "1,000",
              confidence: 0.4,
            },
          ],
          default: 10,
        });
      }

      resolve({
        rule: {
          name: `${metricType}-alert-${Math.random().toString(36).slice(2, 8)}`,
          description: query,
          metric: {
            type: metricType,
            name: metricType,
            unit:
              metricType === "cost"
                ? "USD"
                : metricType === "error_rate"
                  ? "percent"
                  : metricType === "latency"
                    ? "ms"
                    : metricType === "token_usage"
                      ? "tokens"
                      : "score",
            aggregation: metricType === "cost" ? "sum" : "avg",
          },
          condition: {
            type: "threshold",
            operator: isBelow ? "lt" : "gt",
            value: threshold,
          },
          severity,
          filters,
          notifications: [
            ...(hasSlack ? [{ channel: "slack" }] : []),
            ...(hasEmail ? [{ channel: "email" }] : []),
            ...(!hasSlack && !hasEmail ? [{ channel: "dashboard" }] : []),
          ],
        },
        confidence,
        ambiguities,
        suggestions:
          ambiguities.length > 0
            ? ["Try being more specific about the metric and threshold value"]
            : filters.length === 0
              ? ["Consider adding filters like 'for user X' or 'in production'"]
              : [],
      });
    }, 800); // Simulate API delay
  });
}

// ============================================================================
// Components
// ============================================================================

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const level =
    confidence >= 0.8 ? "high" : confidence >= 0.6 ? "medium" : "low";
  const colors = {
    high: "bg-green-500",
    medium: "bg-yellow-500",
    low: "bg-red-500",
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              "h-2 w-1.5 rounded-sm",
              i <= confidence * 5 ? colors[level] : "bg-muted",
            )}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {Math.round(confidence * 100)}% confident
      </span>
    </div>
  );
}

function ParsedRulePreview({ rule }: { rule: AlertRuleConfig }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{rule.name}</h4>
        <span
          className={cn(
            "px-2 py-0.5 rounded text-xs font-medium",
            rule.severity === "critical"
              ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
              : rule.severity === "warning"
                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
          )}
        >
          {rule.severity}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Metric:</span>
          <span className="ml-2 font-mono">
            {rule.metric.name} ({rule.metric.unit})
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Condition:</span>
          <span className="ml-2 font-mono">
            {rule.condition.operator === "gt" ? ">" : "<"}{" "}
            {rule.condition.value}
          </span>
        </div>
      </div>

      {rule.filters.length > 0 && (
        <div className="text-sm">
          <span className="text-muted-foreground">Filters:</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {rule.filters.map((f, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded bg-muted text-xs font-mono"
              >
                {f.field} = {String(f.value)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="text-sm">
        <span className="text-muted-foreground">Notify via:</span>
        <span className="ml-2">
          {rule.notifications.map((n) => n.channel).join(", ")}
        </span>
      </div>
    </div>
  );
}

function AmbiguityResolver({
  ambiguity,
  onResolve,
}: {
  ambiguity: Ambiguity;
  onResolve: (value: string | number) => void;
}) {
  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950 p-4">
      <div className="flex items-start gap-2">
        <HelpCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-yellow-800 dark:text-yellow-200">
            {ambiguity.question}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ambiguity.options.map((option) => (
              <button
                key={String(option.value)}
                onClick={() => onResolve(option.value)}
                className="px-3 py-1.5 rounded border bg-background hover:bg-muted transition-colors text-sm"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function ConfigureAlertPage() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [parsed, setParsed] = useState<ParsedAlertRule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const handleParse = useCallback(async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setParsed(null);
    setCreated(false);

    try {
      const result = await simulateParse(query);
      setParsed(result);
    } catch {
      setError("Failed to parse query. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const handleResolveAmbiguity = useCallback(
    (type: string, value: string | number) => {
      if (!parsed) return;

      // Update the parsed rule based on ambiguity resolution
      const newRule = { ...parsed.rule };

      if (type === "metric") {
        newRule.metric = {
          ...newRule.metric,
          type: String(value),
          name: String(value),
        };
      } else if (type === "threshold") {
        newRule.condition = {
          ...newRule.condition,
          value: Number(value),
        };
      }

      // Remove resolved ambiguity and increase confidence
      const newAmbiguities = parsed.ambiguities.filter((a) => a.type !== type);
      const newConfidence = Math.min(1, parsed.confidence + 0.15);

      setParsed({
        ...parsed,
        rule: newRule,
        ambiguities: newAmbiguities,
        confidence: newConfidence,
      });
    },
    [parsed],
  );

  const handleCreate = useCallback(() => {
    if (!parsed) return;
    // In production, this would call the API
    setCreated(true);
  }, [parsed]);

  return (
    <div className="container max-w-4xl py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Settings2 className="h-4 w-4" />
          <span>Alert Configuration</span>
          <ChevronRight className="h-4 w-4" />
          <span>Natural Language</span>
        </div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-purple-500" />
          Create Alert with Natural Language
        </h1>
        <p className="text-muted-foreground mt-2">
          Describe what you want to be alerted about in plain English. Our AI
          will parse your request into a structured alert rule.
        </p>
      </div>

      {/* Input Section */}
      <div className="space-y-4">
        <div className="relative">
          <MessageSquare className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe your alert... e.g., 'Alert me when costs exceed $10 per hour'"
            className="w-full min-h-[120px] pl-12 pr-4 py-4 rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) {
                handleParse();
              }
            }}
          />
        </div>

        {/* Example Queries */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">Try:</span>
          {EXAMPLE_QUERIES.slice(0, 3).map((example) => (
            <button
              key={example}
              onClick={() => setQuery(example)}
              className="text-sm text-primary hover:underline"
            >
              "{example.slice(0, 40)}..."
            </button>
          ))}
        </div>

        <button
          onClick={handleParse}
          disabled={isLoading || !query.trim()}
          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Parsing...
            </>
          ) : (
            <>
              <Zap className="h-5 w-5" />
              Parse Alert Rule
            </>
          )}
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4 flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Parsed Result */}
      {parsed && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Parsed Alert Rule</h2>
            <ConfidenceIndicator confidence={parsed.confidence} />
          </div>

          {/* Ambiguities */}
          {parsed.ambiguities.length > 0 && (
            <div className="space-y-3">
              {parsed.ambiguities.map((ambiguity) => (
                <AmbiguityResolver
                  key={ambiguity.type}
                  ambiguity={ambiguity}
                  onResolve={(value) =>
                    handleResolveAmbiguity(ambiguity.type, value)
                  }
                />
              ))}
            </div>
          )}

          {/* Rule Preview */}
          <ParsedRulePreview rule={parsed.rule} />

          {/* Suggestions */}
          {parsed.suggestions.length > 0 && (
            <div className="text-sm text-muted-foreground flex items-start gap-2">
              <Sparkles className="h-4 w-4 mt-0.5" />
              <span>Tip: {parsed.suggestions[0]}</span>
            </div>
          )}

          {/* Action Buttons */}
          {!created ? (
            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={
                  parsed.ambiguities.length > 0 || parsed.confidence < 0.5
                }
                className="flex-1 py-3 rounded-lg bg-green-600 text-white font-medium flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle2 className="h-5 w-5" />
                Create Alert Rule
              </button>
              <button
                onClick={() => {
                  setParsed(null);
                  setQuery("");
                }}
                className="px-6 py-3 rounded-lg border font-medium hover:bg-muted transition-colors"
              >
                Start Over
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 p-4">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">
                  Alert rule created successfully!
                </span>
              </div>
              <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                Your alert is now active and will trigger based on your
                configured conditions.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => {
                    setParsed(null);
                    setQuery("");
                    setCreated(false);
                  }}
                  className="px-4 py-2 rounded border text-sm font-medium hover:bg-background transition-colors"
                >
                  Create Another
                </button>
                <a
                  href="/dashboard/alerts"
                  className="px-4 py-2 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  View All Alerts
                </a>
              </div>
            </div>
          )}

          {/* Feedback */}
          {created && (
            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-2">
                Was this parsing accurate?
              </p>
              <div className="flex gap-2">
                <button className="flex items-center gap-1 px-3 py-1.5 rounded border text-sm hover:bg-muted transition-colors">
                  <ThumbsUp className="h-4 w-4" />
                  Yes
                </button>
                <button className="flex items-center gap-1 px-3 py-1.5 rounded border text-sm hover:bg-muted transition-colors">
                  <ThumbsDown className="h-4 w-4" />
                  No
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
