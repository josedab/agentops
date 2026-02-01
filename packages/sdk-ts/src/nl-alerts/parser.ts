/**
 * Natural Language Alert Parser
 *
 * LLM-based parser that converts natural language alert descriptions
 * into structured alert rules.
 */

import { now, generateEventId } from "../utils.js";
import type {
  NLAlertParserConfig,
  ParsedAlertRule,
  AlertRuleConfig,
  MetricSpec,
  ConditionSpec,
  FilterSpec,
  NotificationSpec,
  Ambiguity,
  ExtractedEntity,
  MetricType,
  MetricDefinition,
} from "./types.js";

// ============================================================================
// Built-in Metric Definitions
// ============================================================================

const DEFAULT_METRICS: MetricDefinition[] = [
  {
    name: "cost",
    aliases: [
      "costs",
      "spending",
      "spend",
      "price",
      "expense",
      "expenses",
      "bill",
      "charges",
    ],
    type: "cost",
    unit: "USD",
    description: "Total cost in dollars",
  },
  {
    name: "latency",
    aliases: [
      "response time",
      "delay",
      "lag",
      "duration",
      "response_time",
      "time",
      "speed",
    ],
    type: "latency",
    unit: "ms",
    description: "Request latency in milliseconds",
  },
  {
    name: "error_rate",
    aliases: [
      "errors",
      "error rate",
      "failure rate",
      "failures",
      "error percentage",
    ],
    type: "error_rate",
    unit: "percent",
    description: "Percentage of requests that fail",
  },
  {
    name: "token_usage",
    aliases: ["tokens", "token count", "token consumption", "token usage"],
    type: "token_usage",
    unit: "tokens",
    description: "Number of tokens used",
  },
  {
    name: "quality_score",
    aliases: ["quality", "score", "quality score", "rating", "performance"],
    type: "quality_score",
    unit: "score",
    description: "Quality score (0-1)",
  },
  {
    name: "throughput",
    aliases: ["requests", "request rate", "traffic", "volume", "rps", "calls"],
    type: "throughput",
    unit: "requests/s",
    description: "Number of requests per second",
  },
  {
    name: "session_count",
    aliases: ["sessions", "session count", "active sessions"],
    type: "session_count",
    unit: "sessions",
    description: "Number of active sessions",
  },
];

// ============================================================================
// Pattern Matchers (Rule-based parsing)
// ============================================================================

interface PatternMatch {
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => Partial<AlertRuleConfig>;
}

const THRESHOLD_PATTERNS: PatternMatch[] = [
  {
    pattern:
      /(?:when|if|alert when)\s+(.+?)\s+(?:exceeds?|goes?\s+(?:above|over)|is\s+(?:greater|more)\s+than|>)\s+\$?([\d,\.]+)\s*(k|m|%|percent)?/i,
    extract: (match) => {
      // match[1] is metric name, unused for now but captured
      let value = parseFloat(match[2].replace(/,/g, ""));
      const unit = match[3]?.toLowerCase();

      if (unit === "k") value *= 1000;
      if (unit === "m") value *= 1000000;

      return {
        condition: {
          type: "threshold",
          operator: "gt",
          value,
        },
      };
    },
  },
  {
    pattern:
      /(?:when|if|alert when)\s+(.+?)\s+(?:drops?\s+(?:below|under)|falls?\s+(?:below|under)|is\s+(?:less|lower)\s+than|<)\s+\$?([\d,\.]+)\s*(k|m|%|percent)?/i,
    extract: (match) => {
      let value = parseFloat(match[2].replace(/,/g, ""));
      const unit = match[3]?.toLowerCase();

      if (unit === "k") value *= 1000;
      if (unit === "m") value *= 1000000;

      return {
        condition: {
          type: "threshold",
          operator: "lt",
          value,
        },
      };
    },
  },
  {
    pattern:
      /(?:spikes?|increases?|jumps?)\s+(?:by\s+)?(?:more\s+than\s+)?([\d,\.]+)\s*(%|percent)/i,
    extract: (match) => ({
      condition: {
        type: "rate_of_change",
        operator: "gt",
        value: parseFloat(match[1]),
        percentage: parseFloat(match[1]),
      },
    }),
  },
];

const TIME_PATTERNS: PatternMatch[] = [
  {
    pattern: /per\s+(hour|minute|second|day|week|month)/i,
    extract: (match) => {
      const windows: Record<string, number> = {
        second: 1000,
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
      };
      return {
        metric: {
          type: "custom" as MetricType,
          name: "",
          unit: "",
          window: windows[match[1].toLowerCase()],
        },
      };
    },
  },
  {
    pattern: /for\s+(?:more\s+than\s+)?([\d]+)\s+(seconds?|minutes?|hours?)/i,
    extract: (match) => {
      const durations: Record<string, number> = {
        second: 1000,
        seconds: 1000,
        minute: 60 * 1000,
        minutes: 60 * 1000,
        hour: 60 * 60 * 1000,
        hours: 60 * 60 * 1000,
      };
      return {
        condition: {
          type: "threshold",
          operator: "gt",
          value: 0,
          duration: parseInt(match[1]) * durations[match[2].toLowerCase()],
        },
      };
    },
  },
];

const SEVERITY_PATTERNS: PatternMatch[] = [
  {
    pattern: /critical|urgent|severe|emergency/i,
    extract: () => ({ severity: "critical" as const }),
  },
  {
    pattern: /warning|warn|moderate/i,
    extract: () => ({ severity: "warning" as const }),
  },
  {
    pattern: /info|informational|notice/i,
    extract: () => ({ severity: "info" as const }),
  },
];

const NOTIFICATION_PATTERNS: PatternMatch[] = [
  {
    pattern: /(?:notify|alert|send)\s+(?:me\s+)?(?:via|through|on|to)\s+slack/i,
    extract: () => ({ notifications: [{ channel: "slack" as const }] }),
  },
  {
    pattern: /(?:email|mail)\s+(?:me|to\s+)?([\w@\.\-]+)?/i,
    extract: (match) => ({
      notifications: [
        {
          channel: "email" as const,
          recipients: match[1] ? [match[1]] : undefined,
        },
      ],
    }),
  },
  {
    pattern: /(?:page|pagerduty|pager)/i,
    extract: () => ({ notifications: [{ channel: "pagerduty" as const }] }),
  },
  {
    pattern: /webhook/i,
    extract: () => ({ notifications: [{ channel: "webhook" as const }] }),
  },
];

const FILTER_PATTERNS: PatternMatch[] = [
  {
    pattern: /(?:for|from)\s+user\s+([^\s,]+)/i,
    extract: (match) => ({
      filters: [
        { field: "user" as const, operator: "eq" as const, value: match[1] },
      ],
    }),
  },
  {
    pattern:
      /(?:for|from|in)\s+(?:the\s+)?([a-z0-9\-_]+)\s+(?:feature|agent|service)/i,
    extract: (match) => ({
      filters: [
        { field: "feature" as const, operator: "eq" as const, value: match[1] },
      ],
    }),
  },
  {
    pattern: /(?:using|with)\s+(?:model\s+)?([a-z0-9\-\.]+)/i,
    extract: (match) => ({
      filters: [
        { field: "model" as const, operator: "eq" as const, value: match[1] },
      ],
    }),
  },
  {
    pattern: /(?:in|on)\s+(production|staging|development|dev|prod|stage)/i,
    extract: (match) => ({
      filters: [
        {
          field: "environment" as const,
          operator: "eq" as const,
          value: match[1],
        },
      ],
    }),
  },
];

// ============================================================================
// Parser Implementation
// ============================================================================

export class NLAlertParser {
  private readonly config: Required<
    Omit<NLAlertParserConfig, "llmProvider" | "customMetrics" | "knownEntities">
  > & {
    llmProvider?: NLAlertParserConfig["llmProvider"];
    customMetrics: MetricDefinition[];
    knownEntities: NLAlertParserConfig["knownEntities"];
  };

  private metrics: MetricDefinition[];

  constructor(config: NLAlertParserConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      fuzzyMatching: config.fuzzyMatching ?? true,
      confidenceThreshold: config.confidenceThreshold ?? 0.7,
      maxAmbiguities: config.maxAmbiguities ?? 3,
      debug: config.debug ?? false,
      llmProvider: config.llmProvider,
      customMetrics: config.customMetrics ?? [],
      knownEntities: config.knownEntities,
    };

    this.metrics = [...DEFAULT_METRICS, ...this.config.customMetrics];
  }

  /**
   * Parse a natural language query into an alert rule
   */
  async parse(query: string): Promise<ParsedAlertRule> {
    const startTime = now();
    const extractedEntities: ExtractedEntity[] = [];
    const ambiguities: Ambiguity[] = [];

    // Normalize the query
    const normalizedQuery = query.trim().toLowerCase();

    // Step 1: Extract metric
    const { metric, metricEntity } = this.extractMetric(normalizedQuery);
    if (metricEntity) extractedEntities.push(metricEntity);

    // Step 2: Extract condition
    const condition = this.extractCondition(query);

    // Step 3: Extract severity
    const severity = this.extractSeverity(query);

    // Step 4: Extract filters
    const filters = this.extractFilters(query);

    // Step 5: Extract notifications
    const notifications = this.extractNotifications(query);

    // Step 6: Generate ambiguities if needed
    if (!metric.type || metric.type === "custom") {
      ambiguities.push({
        type: "metric",
        question: "Which metric should I monitor?",
        options: this.metrics.slice(0, 5).map((m) => ({
          value: m.name,
          label: `${m.name} (${m.description})`,
          confidence: 0.5,
        })),
        default: "cost",
      });
    }

    if (!condition.value && condition.type === "threshold") {
      ambiguities.push({
        type: "threshold",
        question: "What threshold value should trigger the alert?",
        options: this.suggestThresholds(metric.type),
        default: this.getDefaultThreshold(metric.type),
      });
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(
      metric,
      condition,
      filters,
      ambiguities,
    );

    // Build the rule config
    const rule: AlertRuleConfig = {
      name: this.generateRuleName(query, metric),
      description: query,
      metric,
      condition,
      severity,
      filters,
      notifications,
      enabled: true,
      cooldownMs: 60 * 60 * 1000, // 1 hour default
    };

    return {
      rule,
      originalQuery: query,
      confidence,
      ambiguities,
      suggestions: this.generateSuggestions(rule, ambiguities),
      metadata: {
        parseTimeMs: now() - startTime,
        extractedEntities,
      },
    };
  }

  /**
   * Parse with LLM enhancement (if provider is configured)
   */
  async parseWithLLM(query: string): Promise<ParsedAlertRule> {
    // First, try rule-based parsing
    const ruleBased = await this.parse(query);

    // If confidence is high enough or no LLM, return rule-based result
    if (
      ruleBased.confidence >= this.config.confidenceThreshold ||
      !this.config.llmProvider
    ) {
      return ruleBased;
    }

    // Use LLM to enhance parsing
    const prompt = this.buildLLMPrompt(query, ruleBased);

    try {
      const llmResponse = await this.config.llmProvider.complete(prompt);
      const enhanced = this.parseLLMResponse(llmResponse, ruleBased);

      return {
        ...enhanced,
        metadata: {
          ...enhanced.metadata,
          modelUsed: "llm-enhanced",
        },
      };
    } catch (error) {
      // Fall back to rule-based if LLM fails
      if (this.config.debug) {
        console.warn("LLM parsing failed, using rule-based result:", error);
      }
      return ruleBased;
    }
  }

  /**
   * Resolve an ambiguity with user input
   */
  resolveAmbiguity(
    parsed: ParsedAlertRule,
    ambiguityType: string,
    resolvedValue: string | number,
  ): ParsedAlertRule {
    const rule = { ...parsed.rule };
    const remainingAmbiguities = parsed.ambiguities.filter(
      (a) => a.type !== ambiguityType,
    );

    switch (ambiguityType) {
      case "metric":
        const metricDef = this.metrics.find((m) => m.name === resolvedValue);
        if (metricDef) {
          rule.metric = {
            ...rule.metric,
            type: metricDef.type,
            name: metricDef.name,
            unit: metricDef.unit,
          };
        }
        break;

      case "threshold":
        rule.condition = {
          ...rule.condition,
          value:
            typeof resolvedValue === "number"
              ? resolvedValue
              : parseFloat(String(resolvedValue)),
        };
        break;

      case "severity":
        rule.severity = resolvedValue as "info" | "warning" | "critical";
        break;

      case "timeframe":
        rule.metric = {
          ...rule.metric,
          window:
            typeof resolvedValue === "number"
              ? resolvedValue
              : parseInt(String(resolvedValue)),
        };
        break;
    }

    // Recalculate confidence
    const newConfidence = this.calculateConfidence(
      rule.metric,
      rule.condition,
      rule.filters,
      remainingAmbiguities,
    );

    return {
      ...parsed,
      rule,
      confidence: newConfidence,
      ambiguities: remainingAmbiguities,
    };
  }

  /**
   * Validate a parsed rule
   */
  validateRule(rule: AlertRuleConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!rule.name || rule.name.length < 3) {
      errors.push("Rule name must be at least 3 characters");
    }

    if (!rule.metric.type || rule.metric.type === "custom") {
      errors.push("Metric type must be specified");
    }

    if (rule.condition.value === undefined || rule.condition.value === null) {
      errors.push("Condition value must be specified");
    }

    if (rule.condition.type === "threshold" && isNaN(rule.condition.value)) {
      errors.push("Threshold value must be a valid number");
    }

    return { valid: errors.length === 0, errors };
  }

  // Private helper methods

  private extractMetric(query: string): {
    metric: MetricSpec;
    metricEntity?: ExtractedEntity;
  } {
    for (const metricDef of this.metrics) {
      const allNames = [metricDef.name, ...metricDef.aliases];

      for (const name of allNames) {
        const index = query.indexOf(name);
        if (index !== -1) {
          // Look for time window
          let window: number | undefined;
          const windowMatch = query.match(
            /per\s+(hour|minute|second|day|week|month)/i,
          );
          if (windowMatch) {
            const windows: Record<string, number> = {
              second: 1000,
              minute: 60000,
              hour: 3600000,
              day: 86400000,
              week: 604800000,
              month: 2592000000,
            };
            window = windows[windowMatch[1].toLowerCase()];
          }

          return {
            metric: {
              type: metricDef.type,
              name: metricDef.name,
              unit: metricDef.unit,
              aggregation: this.inferAggregation(query, metricDef.type),
              window,
            },
            metricEntity: {
              type: "metric",
              value: metricDef.name,
              span: [index, index + name.length],
              confidence: 0.9,
            },
          };
        }
      }
    }

    // No match found
    return {
      metric: {
        type: "custom",
        name: "",
        unit: "",
      },
    };
  }

  private extractCondition(query: string): ConditionSpec {
    let condition: ConditionSpec = {
      type: "threshold",
      operator: "gt",
      value: 0,
    };

    // Try each threshold pattern
    for (const { pattern, extract } of THRESHOLD_PATTERNS) {
      const match = query.match(pattern);
      if (match) {
        const extracted = extract(match);
        if (extracted.condition) {
          condition = { ...condition, ...extracted.condition };
        }
      }
    }

    // Try time patterns for duration
    for (const { pattern, extract } of TIME_PATTERNS) {
      const match = query.match(pattern);
      if (match) {
        const extracted = extract(match);
        if (extracted.condition?.duration) {
          condition.duration = extracted.condition.duration;
        }
      }
    }

    return condition;
  }

  private extractSeverity(query: string): "info" | "warning" | "critical" {
    for (const { pattern, extract } of SEVERITY_PATTERNS) {
      const match = query.match(pattern);
      if (match) {
        return extract(match).severity!;
      }
    }
    return "warning"; // Default severity
  }

  private extractFilters(query: string): FilterSpec[] {
    const filters: FilterSpec[] = [];

    for (const { pattern, extract } of FILTER_PATTERNS) {
      const match = query.match(pattern);
      if (match) {
        const extracted = extract(match);
        if (extracted.filters) {
          filters.push(...extracted.filters);
        }
      }
    }

    return filters;
  }

  private extractNotifications(query: string): NotificationSpec[] {
    const notifications: NotificationSpec[] = [];

    for (const { pattern, extract } of NOTIFICATION_PATTERNS) {
      const match = query.match(pattern);
      if (match) {
        const extracted = extract(match);
        if (extracted.notifications) {
          notifications.push(...extracted.notifications);
        }
      }
    }

    // Default to dashboard if no notification specified
    if (notifications.length === 0) {
      notifications.push({ channel: "dashboard" });
    }

    return notifications;
  }

  private inferAggregation(
    query: string,
    metricType: MetricType,
  ): MetricSpec["aggregation"] {
    if (/average|avg|mean/i.test(query)) return "avg";
    if (/total|sum/i.test(query)) return "sum";
    if (/maximum|max|peak/i.test(query)) return "max";
    if (/minimum|min|lowest/i.test(query)) return "min";
    if (/p99|99th|99%/i.test(query)) return "p99";
    if (/p90|90th|90%/i.test(query)) return "p90";
    if (/count|number of/i.test(query)) return "count";

    // Defaults based on metric type
    switch (metricType) {
      case "cost":
        return "sum";
      case "latency":
        return "avg";
      case "error_rate":
        return "avg";
      case "throughput":
        return "sum";
      default:
        return "avg";
    }
  }

  private calculateConfidence(
    metric: MetricSpec,
    condition: ConditionSpec,
    filters: FilterSpec[],
    ambiguities: Ambiguity[],
  ): number {
    let confidence = 1.0;

    // Reduce confidence for missing/uncertain components
    if (!metric.type || metric.type === "custom") confidence -= 0.3;
    if (condition.value === 0 && condition.type === "threshold")
      confidence -= 0.2;
    if (filters.length === 0) confidence -= 0.05;

    // Reduce for each ambiguity
    confidence -= ambiguities.length * 0.1;

    return Math.max(0, Math.min(1, confidence));
  }

  private generateRuleName(_query: string, metric: MetricSpec): string {
    const prefix =
      metric.type !== "custom" ? metric.type.replace(/_/g, "-") : "custom";
    const hash = generateEventId().slice(0, 6);
    return `${prefix}-alert-${hash}`;
  }

  private suggestThresholds(metricType: MetricType): Ambiguity["options"] {
    const suggestions: Record<MetricType, Ambiguity["options"]> = {
      cost: [
        { value: 10, label: "$10/hour", confidence: 0.7 },
        { value: 100, label: "$100/hour", confidence: 0.6 },
        { value: 1000, label: "$1,000/day", confidence: 0.5 },
      ],
      latency: [
        { value: 1000, label: "1 second", confidence: 0.7 },
        { value: 5000, label: "5 seconds", confidence: 0.6 },
        { value: 500, label: "500ms", confidence: 0.5 },
      ],
      error_rate: [
        { value: 1, label: "1%", confidence: 0.7 },
        { value: 5, label: "5%", confidence: 0.8 },
        { value: 10, label: "10%", confidence: 0.6 },
      ],
      token_usage: [
        { value: 10000, label: "10K tokens", confidence: 0.6 },
        { value: 100000, label: "100K tokens", confidence: 0.7 },
        { value: 1000000, label: "1M tokens", confidence: 0.5 },
      ],
      quality_score: [
        { value: 0.8, label: "0.8 (80%)", confidence: 0.7 },
        { value: 0.9, label: "0.9 (90%)", confidence: 0.6 },
        { value: 0.7, label: "0.7 (70%)", confidence: 0.5 },
      ],
      throughput: [
        { value: 100, label: "100 req/s", confidence: 0.6 },
        { value: 1000, label: "1000 req/s", confidence: 0.7 },
      ],
      session_count: [
        { value: 100, label: "100 sessions", confidence: 0.6 },
        { value: 1000, label: "1000 sessions", confidence: 0.7 },
      ],
      tool_usage: [
        { value: 100, label: "100 calls", confidence: 0.6 },
        { value: 1000, label: "1000 calls", confidence: 0.7 },
      ],
      custom: [
        { value: 100, label: "100", confidence: 0.5 },
        { value: 1000, label: "1000", confidence: 0.5 },
      ],
    };

    return suggestions[metricType] || suggestions.custom;
  }

  private getDefaultThreshold(metricType: MetricType): number | string {
    const defaults: Record<MetricType, number> = {
      cost: 100,
      latency: 1000,
      error_rate: 5,
      token_usage: 100000,
      quality_score: 0.8,
      throughput: 1000,
      session_count: 100,
      tool_usage: 100,
      custom: 100,
    };
    return defaults[metricType] || 100;
  }

  private generateSuggestions(
    rule: AlertRuleConfig,
    ambiguities: Ambiguity[],
  ): string[] {
    const suggestions: string[] = [];

    if (ambiguities.length > 0) {
      suggestions.push(
        "Try being more specific about the metric and threshold value",
      );
    }

    if (rule.filters.length === 0) {
      suggestions.push(
        "Consider adding filters like 'for user X' or 'in production'",
      );
    }

    if (
      rule.notifications.length === 1 &&
      rule.notifications[0].channel === "dashboard"
    ) {
      suggestions.push(
        "You can add 'notify via Slack' or 'email me' for notifications",
      );
    }

    if (!rule.metric.window) {
      suggestions.push(
        "Consider specifying a time window like 'per hour' or 'per day'",
      );
    }

    return suggestions;
  }

  private buildLLMPrompt(query: string, ruleBased: ParsedAlertRule): string {
    return `Parse the following natural language alert configuration into a structured alert rule.

User query: "${query}"

Current parse (confidence: ${ruleBased.confidence}):
${JSON.stringify(ruleBased.rule, null, 2)}

Ambiguities to resolve:
${ruleBased.ambiguities.map((a) => `- ${a.type}: ${a.question}`).join("\n")}

Available metrics: ${this.metrics.map((m) => m.name).join(", ")}

Provide a JSON response with the resolved alert rule configuration. Focus on:
1. Identifying the correct metric type
2. Extracting the threshold/condition value
3. Identifying any user/feature/environment filters
4. Determining the appropriate severity

Response format:
{
  "metric": { "type": "...", "name": "...", "unit": "...", "aggregation": "...", "window": ... },
  "condition": { "type": "...", "operator": "...", "value": ... },
  "severity": "...",
  "filters": [...],
  "notifications": [...]
}`;
  }

  private parseLLMResponse(
    response: string,
    original: ParsedAlertRule,
  ): ParsedAlertRule {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return original;

      const parsed = JSON.parse(jsonMatch[0]);

      // Merge with original
      const mergedRule: AlertRuleConfig = {
        ...original.rule,
        metric: { ...original.rule.metric, ...parsed.metric },
        condition: { ...original.rule.condition, ...parsed.condition },
        severity: parsed.severity || original.rule.severity,
        filters: parsed.filters || original.rule.filters,
        notifications: parsed.notifications || original.rule.notifications,
      };

      // Recalculate confidence
      const newConfidence = this.calculateConfidence(
        mergedRule.metric,
        mergedRule.condition,
        mergedRule.filters,
        [],
      );

      return {
        ...original,
        rule: mergedRule,
        confidence: Math.max(newConfidence, 0.8), // LLM boost
        ambiguities: [], // LLM should resolve ambiguities
      };
    } catch {
      return original;
    }
  }
}
