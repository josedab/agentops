/**
 * AgentOps SDK - Embedded Agent Analytics Engine
 *
 * Manages embed tokens, widget configurations, data generation,
 * and HTML rendering for embeddable analytics widgets.
 *
 * @packageDocumentation
 */

import { nanoid } from "nanoid";

import type {
  EmbedConfig,
  EmbedToken,
  EmbedScope,
  WidgetType,
  WidgetConfig,
  WidgetData,
  WidgetTheme,
  SessionTimelineData,
  CostBreakdownData,
  QualityScoreData,
  UsageChartData,
  ErrorFeedData,
  EmbedRenderOutput,
  EmbedMetrics,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const TOKEN_PREFIX = "emb_";

// ============================================================================
// Internal records
// ============================================================================

interface WidgetRecord {
  widgetId: string;
  config: WidgetConfig;
}

// ============================================================================
// Engine
// ============================================================================

export class EmbedSDKEngine {
  private readonly config: EmbedConfig;
  private readonly tokens: Map<string, EmbedToken> = new Map();
  private readonly widgets: Map<string, WidgetRecord> = new Map();
  private readonly revokedTokens: Set<string> = new Set();
  private widgetsRendered = 0;
  private dataQueriesExecuted = 0;

  constructor(config: EmbedConfig) {
    this.config = config;
  }

  // --------------------------------------------------------------------------
  // Token Management
  // --------------------------------------------------------------------------

  /** Issue an embed token with configurable TTL (default 1 hour). */
  issueToken(
    tenantId: string,
    scopes: EmbedScope[],
    ttlMs: number = DEFAULT_TTL_MS,
  ): EmbedToken {
    const now = Date.now();
    const tokenString = TOKEN_PREFIX + nanoid(32);
    const token: EmbedToken = {
      token: tokenString,
      tenantId,
      scopes,
      expiresAt: now + ttlMs,
      issuedAt: now,
    };
    this.tokens.set(tokenString, token);

    if (this.config.debug) {
      console.log(`[embed] Token issued for tenant=${tenantId}`);
    }

    return token;
  }

  /** Validate a token string. Returns decoded token on success. */
  validateToken(token: string): {
    valid: boolean;
    decoded?: EmbedToken;
    error?: string;
  } {
    if (this.revokedTokens.has(token)) {
      return { valid: false, error: "Token has been revoked" };
    }

    const record = this.tokens.get(token);
    if (!record) {
      return { valid: false, error: "Token not found" };
    }

    if (Date.now() > record.expiresAt) {
      return { valid: false, error: "Token has expired" };
    }

    return { valid: true, decoded: record };
  }

  /** Revoke a token so it can no longer be used. */
  revokeToken(token: string): boolean {
    if (!this.tokens.has(token)) {
      return false;
    }
    this.revokedTokens.add(token);
    return true;
  }

  // --------------------------------------------------------------------------
  // Widget Management
  // --------------------------------------------------------------------------

  /** Register a widget configuration. */
  createWidget(config: WidgetConfig): {
    widgetId: string;
    config: WidgetConfig;
  } {
    const widgetId = `wgt_${nanoid(16)}`;
    const record: WidgetRecord = { widgetId, config };
    this.widgets.set(widgetId, record);

    if (this.config.debug) {
      console.log(`[embed] Widget created id=${widgetId} type=${config.type}`);
    }

    return { widgetId, config };
  }

  /** Get mock data for a widget (deterministic sample data). */
  getWidgetData(widgetId: string, token: EmbedToken): WidgetData {
    const validation = this.validateToken(token.token);
    if (!validation.valid) {
      throw new Error(`Invalid token: ${validation.error}`);
    }

    const widget = this.widgets.get(widgetId);
    if (!widget) {
      throw new Error(`Widget not found: ${widgetId}`);
    }

    this.dataQueriesExecuted++;
    const data = this.generateSampleData(widget.config.type);
    const empty = this.isDataEmpty(data, widget.config.type);

    return {
      type: widget.config.type,
      data,
      lastUpdated: Date.now(),
      empty,
    };
  }

  /** Render HTML/CSS/JS for a widget. */
  renderWidget(widgetId: string, token: EmbedToken): EmbedRenderOutput {
    const validation = this.validateToken(token.token);
    if (!validation.valid) {
      throw new Error(`Invalid token: ${validation.error}`);
    }

    const widget = this.widgets.get(widgetId);
    if (!widget) {
      throw new Error(`Widget not found: ${widgetId}`);
    }

    this.widgetsRendered++;
    const theme = widget.config.theme ?? this.getDefaultTheme();
    const title =
      widget.config.title ?? this.getDefaultTitle(widget.config.type);
    const width = widget.config.width ?? "100%";
    const height = widget.config.height ?? "400px";

    const css = this.buildCSS(theme, width, height);
    const js = this.buildJS(widgetId, token.token, widget.config);
    const html = this.buildHTML(widgetId, title, css, js);

    return { html, css, js };
  }

  /** Generate an iframe embed code snippet. */
  renderIframe(
    widgetId: string,
    token: EmbedToken,
    options?: { width?: string; height?: string },
  ): string {
    const validation = this.validateToken(token.token);
    if (!validation.valid) {
      throw new Error(`Invalid token: ${validation.error}`);
    }

    const widget = this.widgets.get(widgetId);
    if (!widget) {
      throw new Error(`Widget not found: ${widgetId}`);
    }

    const width = options?.width ?? widget.config.width ?? "100%";
    const height = options?.height ?? widget.config.height ?? "400px";
    const src = `${this.config.apiEndpoint}/embed/${widgetId}?token=${token.token}`;

    return (
      `<iframe src="${src}" ` +
      `width="${width}" height="${height}" ` +
      `frameborder="0" allowtransparency="true" ` +
      `sandbox="allow-scripts allow-same-origin"></iframe>`
    );
  }

  /** Return the default widget theme. */
  getDefaultTheme(): WidgetTheme {
    return {
      mode: "light",
      primaryColor: "#4F46E5",
      backgroundColor: "#FFFFFF",
      fontFamily: "Inter, system-ui, sans-serif",
      borderRadius: 8,
    };
  }

  /** Return current embed metrics. */
  getMetrics(): EmbedMetrics {
    const now = Date.now();
    let activeTokens = 0;
    for (const [tokenStr, record] of this.tokens) {
      if (!this.revokedTokens.has(tokenStr) && record.expiresAt > now) {
        activeTokens++;
      }
    }

    return {
      tokensIssued: this.tokens.size,
      activeTokens,
      widgetsRendered: this.widgetsRendered,
      dataQueriesExecuted: this.dataQueriesExecuted,
    };
  }

  // --------------------------------------------------------------------------
  // Private: Sample Data Generation (deterministic)
  // --------------------------------------------------------------------------

  private generateSampleData(type: WidgetType): unknown {
    switch (type) {
      case "session_timeline":
        return this.generateSessionTimeline();
      case "cost_breakdown":
        return this.generateCostBreakdown();
      case "quality_score":
        return this.generateQualityScore();
      case "usage_chart":
        return this.generateUsageChart();
      case "error_feed":
        return this.generateErrorFeed();
    }
  }

  private generateSessionTimeline(): SessionTimelineData {
    const baseTime = 1_700_000_000_000;
    return {
      events: [
        {
          id: "evt_001",
          type: "prompt",
          timestamp: baseTime,
          content: "User asked about weather forecast",
          model: "gpt-4",
          durationMs: 1200,
          cost: 0.03,
        },
        {
          id: "evt_002",
          type: "tool_call",
          timestamp: baseTime + 1500,
          content: "Called weather API",
          model: "gpt-4",
          durationMs: 800,
          cost: 0.0,
        },
        {
          id: "evt_003",
          type: "response",
          timestamp: baseTime + 3000,
          content: "Generated weather summary",
          model: "gpt-4",
          durationMs: 950,
          cost: 0.045,
        },
        {
          id: "evt_004",
          type: "prompt",
          timestamp: baseTime + 5000,
          content: "Follow-up question about tomorrow",
          model: "gpt-3.5-turbo",
          durationMs: 600,
          cost: 0.002,
        },
        {
          id: "evt_005",
          type: "response",
          timestamp: baseTime + 6000,
          content: "Tomorrow's forecast details",
          model: "gpt-3.5-turbo",
          durationMs: 450,
          cost: 0.003,
        },
      ],
    };
  }

  private generateCostBreakdown(): CostBreakdownData {
    const baseTime = 1_700_000_000_000;
    return {
      totalCost: 124.56,
      byModel: [
        { model: "gpt-4", cost: 89.2, percentage: 71.6 },
        { model: "gpt-3.5-turbo", cost: 23.8, percentage: 19.1 },
        { model: "claude-3-sonnet", cost: 11.56, percentage: 9.3 },
      ],
      byFeature: [
        { feature: "chat", cost: 62.28, percentage: 50.0 },
        { feature: "code-generation", cost: 37.37, percentage: 30.0 },
        { feature: "summarization", cost: 24.91, percentage: 20.0 },
      ],
      byUser: [
        { user: "user_alice", cost: 49.82, percentage: 40.0 },
        { user: "user_bob", cost: 37.37, percentage: 30.0 },
        { user: "user_carol", cost: 37.37, percentage: 30.0 },
      ],
      period: { start: baseTime, end: baseTime + 7 * 24 * 60 * 60 * 1000 },
    };
  }

  private generateQualityScore(): QualityScoreData {
    const baseTime = 1_700_000_000_000;
    const day = 24 * 60 * 60 * 1000;
    return {
      overallScore: 82,
      scores: [
        { dimension: "accuracy", score: 88, trend: 2.5 },
        { dimension: "relevance", score: 85, trend: 1.0 },
        { dimension: "coherence", score: 79, trend: -0.5 },
        { dimension: "latency", score: 76, trend: 3.0 },
      ],
      history: [
        { timestamp: baseTime, score: 78 },
        { timestamp: baseTime + day, score: 79 },
        { timestamp: baseTime + 2 * day, score: 80 },
        { timestamp: baseTime + 3 * day, score: 81 },
        { timestamp: baseTime + 4 * day, score: 82 },
      ],
    };
  }

  private generateUsageChart(): UsageChartData {
    const baseTime = 1_700_000_000_000;
    const day = 24 * 60 * 60 * 1000;
    return {
      dataPoints: [
        {
          timestamp: baseTime,
          events: 1200,
          tokens: 450_000,
          sessions: 85,
          cost: 15.2,
        },
        {
          timestamp: baseTime + day,
          events: 1350,
          tokens: 510_000,
          sessions: 92,
          cost: 17.8,
        },
        {
          timestamp: baseTime + 2 * day,
          events: 980,
          tokens: 380_000,
          sessions: 68,
          cost: 12.1,
        },
        {
          timestamp: baseTime + 3 * day,
          events: 1500,
          tokens: 590_000,
          sessions: 105,
          cost: 20.3,
        },
        {
          timestamp: baseTime + 4 * day,
          events: 1420,
          tokens: 540_000,
          sessions: 98,
          cost: 18.9,
        },
      ],
      period: "7d",
      granularity: "1d",
    };
  }

  private generateErrorFeed(): ErrorFeedData {
    const baseTime = 1_700_000_000_000;
    return {
      errors: [
        {
          id: "err_001",
          type: "rate_limit",
          message: "Rate limit exceeded for gpt-4",
          sessionId: "ses_abc123",
          timestamp: baseTime,
          count: 12,
        },
        {
          id: "err_002",
          type: "timeout",
          message: "Request timeout after 30s",
          sessionId: "ses_def456",
          timestamp: baseTime + 3600_000,
          count: 5,
        },
        {
          id: "err_003",
          type: "validation",
          message: "Invalid tool call parameters",
          sessionId: "ses_ghi789",
          timestamp: baseTime + 7200_000,
          count: 3,
        },
        {
          id: "err_004",
          type: "context_overflow",
          message: "Context window exceeded (128k tokens)",
          sessionId: "ses_jkl012",
          timestamp: baseTime + 10800_000,
          count: 8,
        },
      ],
      totalErrors: 28,
      errorRate: 0.023,
    };
  }

  private isDataEmpty(data: unknown, type: WidgetType): boolean {
    if (!data) return true;
    switch (type) {
      case "session_timeline":
        return (data as SessionTimelineData).events.length === 0;
      case "cost_breakdown":
        return (data as CostBreakdownData).totalCost === 0;
      case "quality_score":
        return (data as QualityScoreData).scores.length === 0;
      case "usage_chart":
        return (data as UsageChartData).dataPoints.length === 0;
      case "error_feed":
        return (data as ErrorFeedData).errors.length === 0;
    }
  }

  // --------------------------------------------------------------------------
  // Private: Rendering
  // --------------------------------------------------------------------------

  private getDefaultTitle(type: WidgetType): string {
    switch (type) {
      case "session_timeline":
        return "Session Timeline";
      case "cost_breakdown":
        return "Cost Breakdown";
      case "quality_score":
        return "Quality Score";
      case "usage_chart":
        return "Usage Chart";
      case "error_feed":
        return "Error Feed";
    }
  }

  private buildCSS(theme: WidgetTheme, width: string, height: string): string {
    return [
      `.agentops-widget {`,
      `  width: ${width};`,
      `  height: ${height};`,
      `  background-color: ${theme.backgroundColor};`,
      `  font-family: ${theme.fontFamily};`,
      `  border-radius: ${theme.borderRadius}px;`,
      `  color: ${theme.mode === "dark" ? "#E5E7EB" : "#1F2937"};`,
      `  padding: 16px;`,
      `  box-sizing: border-box;`,
      `  overflow: auto;`,
      `}`,
      `.agentops-widget-title {`,
      `  color: ${theme.primaryColor};`,
      `  font-size: 18px;`,
      `  font-weight: 600;`,
      `  margin-bottom: 12px;`,
      `}`,
    ].join("\n");
  }

  private buildJS(
    widgetId: string,
    token: string,
    config: WidgetConfig,
  ): string {
    const refreshMs = config.refreshInterval ?? 0;
    return [
      `(function() {`,
      `  var widgetId = "${widgetId}";`,
      `  var token = "${token}";`,
      `  var endpoint = "${this.config.apiEndpoint}";`,
      `  var refreshInterval = ${refreshMs};`,
      `  function fetchData() {`,
      `    fetch(endpoint + "/embed/" + widgetId + "/data", {`,
      `      headers: { "Authorization": "Bearer " + token }`,
      `    }).then(function(r) { return r.json(); })`,
      `      .then(function(data) {`,
      `        document.getElementById("agentops-" + widgetId).innerHTML = JSON.stringify(data);`,
      `      });`,
      `  }`,
      `  fetchData();`,
      `  if (refreshInterval > 0) { setInterval(fetchData, refreshInterval); }`,
      `})();`,
    ].join("\n");
  }

  private buildHTML(
    widgetId: string,
    title: string,
    css: string,
    js: string,
  ): string {
    return [
      `<div class="agentops-widget" id="agentops-${widgetId}">`,
      `  <style>${css}</style>`,
      `  <div class="agentops-widget-title">${title}</div>`,
      `  <div class="agentops-widget-content"></div>`,
      `  <script>${js}</script>`,
      `</div>`,
    ].join("\n");
  }
}
