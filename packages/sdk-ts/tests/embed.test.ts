/**
 * Tests for Embedded Agent Analytics SDK
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { EmbedSDKEngine } from "../src/embed/index.js";
import type {
  EmbedConfig,
  EmbedToken,
  EmbedScope,
  WidgetConfig,
  WidgetType,
  SessionTimelineData,
  CostBreakdownData,
  QualityScoreData,
  UsageChartData,
  ErrorFeedData,
} from "../src/embed/index.js";

// ============================================================================
// Helpers
// ============================================================================

const TEST_CONFIG: EmbedConfig = {
  apiEndpoint: "https://embed.agentops.test",
  debug: false,
};

function makeScopes(
  type: EmbedScope["type"] = "session",
  value = "ses_123",
): EmbedScope[] {
  return [{ type, value, permissions: ["read"] }];
}

function createEngine(): EmbedSDKEngine {
  return new EmbedSDKEngine(TEST_CONFIG);
}

// ============================================================================
// Token Management
// ============================================================================

describe("EmbedSDKEngine – Token Management", () => {
  let engine: EmbedSDKEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  it("should issue a token with default TTL", () => {
    const token = engine.issueToken("tenant_1", makeScopes());

    expect(token.token).toMatch(/^emb_/);
    expect(token.tenantId).toBe("tenant_1");
    expect(token.scopes).toHaveLength(1);
    expect(token.expiresAt).toBeGreaterThan(token.issuedAt);
    expect(token.expiresAt - token.issuedAt).toBe(3_600_000); // 1 hour
  });

  it("should issue a token with custom TTL", () => {
    const ttl = 5 * 60 * 1000; // 5 minutes
    const token = engine.issueToken("tenant_1", makeScopes(), ttl);

    expect(token.expiresAt - token.issuedAt).toBe(ttl);
  });

  it("should validate a valid token", () => {
    const token = engine.issueToken("tenant_1", makeScopes());
    const result = engine.validateToken(token.token);

    expect(result.valid).toBe(true);
    expect(result.decoded).toBeDefined();
    expect(result.decoded!.tenantId).toBe("tenant_1");
    expect(result.error).toBeUndefined();
  });

  it("should reject an unknown token", () => {
    const result = engine.validateToken("emb_unknown_token_string");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token not found");
  });

  it("should detect expired tokens", () => {
    const token = engine.issueToken("tenant_1", makeScopes(), 1); // 1ms TTL

    // Wait a small amount to ensure expiry
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin */
    }

    const result = engine.validateToken(token.token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token has expired");
  });

  it("should revoke a token", () => {
    const token = engine.issueToken("tenant_1", makeScopes());
    const revoked = engine.revokeToken(token.token);

    expect(revoked).toBe(true);

    const result = engine.validateToken(token.token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token has been revoked");
  });

  it("should return false when revoking a non-existent token", () => {
    const revoked = engine.revokeToken("emb_nonexistent");
    expect(revoked).toBe(false);
  });

  it("should issue multiple unique tokens", () => {
    const t1 = engine.issueToken("tenant_1", makeScopes());
    const t2 = engine.issueToken("tenant_1", makeScopes());

    expect(t1.token).not.toBe(t2.token);
  });
});

// ============================================================================
// Widget Creation
// ============================================================================

describe("EmbedSDKEngine – Widget Creation", () => {
  let engine: EmbedSDKEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  const widgetTypes: WidgetType[] = [
    "session_timeline",
    "cost_breakdown",
    "quality_score",
    "usage_chart",
    "error_feed",
  ];

  it.each(widgetTypes)("should create a %s widget", (type) => {
    const config: WidgetConfig = { type };
    const result = engine.createWidget(config);

    expect(result.widgetId).toMatch(/^wgt_/);
    expect(result.config.type).toBe(type);
  });

  it("should create a widget with full config", () => {
    const config: WidgetConfig = {
      type: "cost_breakdown",
      title: "My Costs",
      width: "600px",
      height: "300px",
      theme: {
        mode: "dark",
        primaryColor: "#FF0000",
        backgroundColor: "#111111",
        fontFamily: "Roboto",
        borderRadius: 12,
      },
      refreshInterval: 30_000,
      filters: [{ field: "model", operator: "eq", value: "gpt-4" }],
    };
    const result = engine.createWidget(config);

    expect(result.config.title).toBe("My Costs");
    expect(result.config.theme!.mode).toBe("dark");
    expect(result.config.filters).toHaveLength(1);
  });
});

// ============================================================================
// Widget Data Generation
// ============================================================================

describe("EmbedSDKEngine – Widget Data", () => {
  let engine: EmbedSDKEngine;
  let token: EmbedToken;

  beforeEach(() => {
    engine = createEngine();
    token = engine.issueToken("tenant_1", makeScopes());
  });

  it("should generate session_timeline data", () => {
    const { widgetId } = engine.createWidget({ type: "session_timeline" });
    const result = engine.getWidgetData(widgetId, token);

    expect(result.type).toBe("session_timeline");
    expect(result.empty).toBe(false);
    expect(result.lastUpdated).toBeGreaterThan(0);

    const data = result.data as SessionTimelineData;
    expect(data.events.length).toBeGreaterThan(0);
    expect(data.events[0]).toHaveProperty("id");
    expect(data.events[0]).toHaveProperty("type");
    expect(data.events[0]).toHaveProperty("model");
    expect(data.events[0]).toHaveProperty("cost");
  });

  it("should generate cost_breakdown data", () => {
    const { widgetId } = engine.createWidget({ type: "cost_breakdown" });
    const result = engine.getWidgetData(widgetId, token);

    expect(result.type).toBe("cost_breakdown");
    const data = result.data as CostBreakdownData;
    expect(data.totalCost).toBeGreaterThan(0);
    expect(data.byModel.length).toBeGreaterThan(0);
    expect(data.byFeature.length).toBeGreaterThan(0);
    expect(data.byUser.length).toBeGreaterThan(0);
    expect(data.period.start).toBeLessThan(data.period.end);
  });

  it("should generate quality_score data", () => {
    const { widgetId } = engine.createWidget({ type: "quality_score" });
    const result = engine.getWidgetData(widgetId, token);

    expect(result.type).toBe("quality_score");
    const data = result.data as QualityScoreData;
    expect(data.overallScore).toBeGreaterThanOrEqual(0);
    expect(data.overallScore).toBeLessThanOrEqual(100);
    expect(data.scores.length).toBeGreaterThan(0);
    expect(data.history.length).toBeGreaterThan(0);
  });

  it("should generate usage_chart data", () => {
    const { widgetId } = engine.createWidget({ type: "usage_chart" });
    const result = engine.getWidgetData(widgetId, token);

    expect(result.type).toBe("usage_chart");
    const data = result.data as UsageChartData;
    expect(data.dataPoints.length).toBeGreaterThan(0);
    expect(data.period).toBe("7d");
    expect(data.granularity).toBe("1d");
    expect(data.dataPoints[0]).toHaveProperty("events");
    expect(data.dataPoints[0]).toHaveProperty("tokens");
    expect(data.dataPoints[0]).toHaveProperty("cost");
  });

  it("should generate error_feed data", () => {
    const { widgetId } = engine.createWidget({ type: "error_feed" });
    const result = engine.getWidgetData(widgetId, token);

    expect(result.type).toBe("error_feed");
    const data = result.data as ErrorFeedData;
    expect(data.errors.length).toBeGreaterThan(0);
    expect(data.totalErrors).toBeGreaterThan(0);
    expect(data.errorRate).toBeGreaterThan(0);
    expect(data.errors[0]).toHaveProperty("id");
    expect(data.errors[0]).toHaveProperty("message");
    expect(data.errors[0]).toHaveProperty("sessionId");
  });

  it("should throw for invalid token on data request", () => {
    const { widgetId } = engine.createWidget({ type: "usage_chart" });
    engine.revokeToken(token.token);

    expect(() => engine.getWidgetData(widgetId, token)).toThrow(
      "Invalid token",
    );
  });

  it("should throw for unknown widget id", () => {
    expect(() => engine.getWidgetData("wgt_nonexistent", token)).toThrow(
      "Widget not found",
    );
  });
});

// ============================================================================
// Widget Rendering
// ============================================================================

describe("EmbedSDKEngine – Widget Rendering", () => {
  let engine: EmbedSDKEngine;
  let token: EmbedToken;

  beforeEach(() => {
    engine = createEngine();
    token = engine.issueToken("tenant_1", makeScopes());
  });

  it("should render widget HTML with correct structure", () => {
    const { widgetId } = engine.createWidget({ type: "session_timeline" });
    const output = engine.renderWidget(widgetId, token);

    expect(output.html).toContain("<div");
    expect(output.html).toContain(`agentops-${widgetId}`);
    expect(output.html).toContain("<style>");
    expect(output.html).toContain("<script>");
    expect(output.html).toContain("Session Timeline");
  });

  it("should use custom title in rendered HTML", () => {
    const { widgetId } = engine.createWidget({
      type: "cost_breakdown",
      title: "Monthly Costs",
    });
    const output = engine.renderWidget(widgetId, token);

    expect(output.html).toContain("Monthly Costs");
  });

  it("should include theme properties in CSS", () => {
    const { widgetId } = engine.createWidget({
      type: "quality_score",
      theme: {
        mode: "dark",
        primaryColor: "#00FF00",
        backgroundColor: "#000000",
        fontFamily: "Monospace",
        borderRadius: 16,
      },
    });
    const output = engine.renderWidget(widgetId, token);

    expect(output.css).toContain("#000000");
    expect(output.css).toContain("#00FF00");
    expect(output.css).toContain("Monospace");
    expect(output.css).toContain("16px");
  });

  it("should include API endpoint in JS", () => {
    const { widgetId } = engine.createWidget({ type: "error_feed" });
    const output = engine.renderWidget(widgetId, token);

    expect(output.js).toContain(TEST_CONFIG.apiEndpoint);
    expect(output.js).toContain(token.token);
  });

  it("should throw for invalid token on render", () => {
    const { widgetId } = engine.createWidget({ type: "usage_chart" });
    engine.revokeToken(token.token);

    expect(() => engine.renderWidget(widgetId, token)).toThrow("Invalid token");
  });
});

// ============================================================================
// Iframe Embed
// ============================================================================

describe("EmbedSDKEngine – Iframe Embed", () => {
  let engine: EmbedSDKEngine;
  let token: EmbedToken;

  beforeEach(() => {
    engine = createEngine();
    token = engine.issueToken("tenant_1", makeScopes());
  });

  it("should generate a valid iframe tag", () => {
    const { widgetId } = engine.createWidget({ type: "session_timeline" });
    const iframe = engine.renderIframe(widgetId, token);

    expect(iframe).toContain("<iframe");
    expect(iframe).toContain(
      `src="${TEST_CONFIG.apiEndpoint}/embed/${widgetId}`,
    );
    expect(iframe).toContain(`token=${token.token}`);
    expect(iframe).toContain('sandbox="allow-scripts allow-same-origin"');
  });

  it("should use custom dimensions", () => {
    const { widgetId } = engine.createWidget({ type: "cost_breakdown" });
    const iframe = engine.renderIframe(widgetId, token, {
      width: "800px",
      height: "500px",
    });

    expect(iframe).toContain('width="800px"');
    expect(iframe).toContain('height="500px"');
  });

  it("should fall back to widget config dimensions", () => {
    const { widgetId } = engine.createWidget({
      type: "cost_breakdown",
      width: "640px",
      height: "320px",
    });
    const iframe = engine.renderIframe(widgetId, token);

    expect(iframe).toContain('width="640px"');
    expect(iframe).toContain('height="320px"');
  });

  it("should throw for invalid token on iframe render", () => {
    const { widgetId } = engine.createWidget({ type: "usage_chart" });
    engine.revokeToken(token.token);

    expect(() => engine.renderIframe(widgetId, token)).toThrow("Invalid token");
  });
});

// ============================================================================
// Scope-Based Access
// ============================================================================

describe("EmbedSDKEngine – Scope-Based Access", () => {
  let engine: EmbedSDKEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  it("should store and validate scopes on token", () => {
    const scopes: EmbedScope[] = [
      { type: "session", value: "ses_abc", permissions: ["read"] },
      { type: "user", value: "user_123", permissions: ["read", "read_write"] },
    ];
    const token = engine.issueToken("tenant_1", scopes);
    const result = engine.validateToken(token.token);

    expect(result.valid).toBe(true);
    expect(result.decoded!.scopes).toHaveLength(2);
    expect(result.decoded!.scopes[0].type).toBe("session");
    expect(result.decoded!.scopes[1].type).toBe("user");
    expect(result.decoded!.scopes[1].permissions).toContain("read_write");
  });

  it("should support global scope tokens", () => {
    const scopes: EmbedScope[] = [
      { type: "global", value: "*", permissions: ["read"] },
    ];
    const token = engine.issueToken("tenant_1", scopes);
    const result = engine.validateToken(token.token);

    expect(result.decoded!.scopes[0].type).toBe("global");
    expect(result.decoded!.scopes[0].value).toBe("*");
  });

  it("should support feature scope tokens", () => {
    const scopes: EmbedScope[] = [
      { type: "feature", value: "chat", permissions: ["read"] },
    ];
    const token = engine.issueToken("tenant_1", scopes);
    const result = engine.validateToken(token.token);

    expect(result.decoded!.scopes[0].type).toBe("feature");
    expect(result.decoded!.scopes[0].value).toBe("chat");
  });
});

// ============================================================================
// Metrics Tracking
// ============================================================================

describe("EmbedSDKEngine – Metrics", () => {
  let engine: EmbedSDKEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  it("should start with zero metrics", () => {
    const metrics = engine.getMetrics();

    expect(metrics.tokensIssued).toBe(0);
    expect(metrics.activeTokens).toBe(0);
    expect(metrics.widgetsRendered).toBe(0);
    expect(metrics.dataQueriesExecuted).toBe(0);
  });

  it("should track token issuance", () => {
    engine.issueToken("t1", makeScopes());
    engine.issueToken("t2", makeScopes());

    const metrics = engine.getMetrics();
    expect(metrics.tokensIssued).toBe(2);
    expect(metrics.activeTokens).toBe(2);
  });

  it("should track active tokens (excluding revoked)", () => {
    const t1 = engine.issueToken("t1", makeScopes());
    engine.issueToken("t2", makeScopes());
    engine.revokeToken(t1.token);

    const metrics = engine.getMetrics();
    expect(metrics.tokensIssued).toBe(2);
    expect(metrics.activeTokens).toBe(1);
  });

  it("should track widget renders", () => {
    const token = engine.issueToken("t1", makeScopes());
    const { widgetId } = engine.createWidget({ type: "cost_breakdown" });

    engine.renderWidget(widgetId, token);
    engine.renderWidget(widgetId, token);

    const metrics = engine.getMetrics();
    expect(metrics.widgetsRendered).toBe(2);
  });

  it("should track data queries", () => {
    const token = engine.issueToken("t1", makeScopes());
    const w1 = engine.createWidget({ type: "error_feed" });
    const w2 = engine.createWidget({ type: "usage_chart" });

    engine.getWidgetData(w1.widgetId, token);
    engine.getWidgetData(w2.widgetId, token);
    engine.getWidgetData(w1.widgetId, token);

    const metrics = engine.getMetrics();
    expect(metrics.dataQueriesExecuted).toBe(3);
  });
});

// ============================================================================
// Default Theme
// ============================================================================

describe("EmbedSDKEngine – Default Theme", () => {
  it("should return a complete default theme", () => {
    const engine = createEngine();
    const theme = engine.getDefaultTheme();

    expect(theme.mode).toBe("light");
    expect(theme.primaryColor).toBeTruthy();
    expect(theme.backgroundColor).toBeTruthy();
    expect(theme.fontFamily).toBeTruthy();
    expect(theme.borderRadius).toBeGreaterThanOrEqual(0);
  });
});
