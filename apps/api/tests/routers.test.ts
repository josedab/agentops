/**
 * API Router Tests
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { sessionsRouter } from "../src/routers/sessions.js";
import { metricsRouter } from "../src/routers/metrics.js";
import { alertsRouter } from "../src/routers/alerts.js";
import { apiKeysRouter } from "../src/routers/apiKeys.js";
import { webhooksRouter } from "../src/routers/webhooks.js";
import { exportRouter } from "../src/routers/export.js";
import { projectsRouter } from "../src/routers/projects.js";

// Helper to create test app with auth
function createTestApp(router: Hono) {
  const app = new Hono();

  // Mock auth middleware
  app.use("*", async (c, next) => {
    c.set("projectId", "proj_1");
    await next();
  });

  app.route("/", router);
  return app;
}

// Helper to make requests
async function request(app: Hono, method: string, path: string, body?: any) {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer ao_proj1_test123456789012345678901234",
    },
  };

  if (body) {
    init.body = JSON.stringify(body);
  }

  const res = await app.request(path, init);
  const json = await res.json();
  return { status: res.status, body: json };
}

describe("Sessions Router", () => {
  const app = createTestApp(sessionsRouter);

  it("should list sessions", async () => {
    const { status, body } = await request(app, "GET", "/");

    expect(status).toBe(200);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
  });

  it("should filter sessions by status", async () => {
    const { status, body } = await request(app, "GET", "/?status=completed");

    expect(status).toBe(200);
    expect(body.data.every((s: any) => s.status === "completed")).toBe(true);
  });

  it("should get session by ID", async () => {
    const { status, body } = await request(app, "GET", "/sess_abc123def456");

    expect(status).toBe(200);
    expect(body.data.sessionId).toBe("sess_abc123def456");
  });

  it("should return 404 for unknown session", async () => {
    const { status, body } = await request(app, "GET", "/sess_unknown");

    expect(status).toBe(404);
    expect(body.error).toBe("Not Found");
  });

  it("should get session events", async () => {
    const { status, body } = await request(
      app,
      "GET",
      "/sess_abc123def456/events",
    );

    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("should get session trace", async () => {
    const { status, body } = await request(
      app,
      "GET",
      "/sess_abc123def456/trace",
    );

    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("should get session replay data", async () => {
    const { status, body } = await request(
      app,
      "GET",
      "/sess_abc123def456/replay",
    );

    expect(status).toBe(200);
    expect(body.data.session).toBeDefined();
    expect(body.data.events).toBeDefined();
    expect(body.data.timeline).toBeDefined();
  });
});

describe("Metrics Router", () => {
  const app = createTestApp(metricsRouter);

  it("should get overview metrics", async () => {
    const { status, body } = await request(app, "GET", "/");

    expect(status).toBe(200);
    expect(body.data.timeSeries).toBeDefined();
    expect(body.data.totals).toBeDefined();
  });

  it("should get cost metrics", async () => {
    const { status, body } = await request(app, "GET", "/cost");

    expect(status).toBe(200);
    expect(body.data.breakdown).toBeDefined();
    expect(body.data.total).toBeDefined();
  });

  it("should get token metrics", async () => {
    const { status, body } = await request(app, "GET", "/tokens");

    expect(status).toBe(200);
    expect(body.data.breakdown).toBeDefined();
    expect(body.data.totals.promptTokens).toBeDefined();
  });

  it("should get latency metrics", async () => {
    const { status, body } = await request(app, "GET", "/latency");

    expect(status).toBe(200);
    expect(body.data.overall.p50).toBeDefined();
    expect(body.data.overall.p95).toBeDefined();
  });

  it("should get error metrics", async () => {
    const { status, body } = await request(app, "GET", "/errors");

    expect(status).toBe(200);
    expect(body.data.byType).toBeDefined();
    expect(body.data.totals.errorRate).toBeDefined();
  });

  it("should get tool usage metrics", async () => {
    const { status, body } = await request(app, "GET", "/tools");

    expect(status).toBe(200);
    expect(Array.isArray(body.data.tools)).toBe(true);
  });
});

describe("Alerts Router", () => {
  const app = createTestApp(alertsRouter);

  it("should list alerts", async () => {
    const { status, body } = await request(app, "GET", "/");

    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("should get alert by ID", async () => {
    const { status, body } = await request(app, "GET", "/alert_001");

    expect(status).toBe(200);
    expect(body.data.id).toBe("alert_001");
    expect(body.data.name).toBe("High Error Rate");
  });

  it("should create alert", async () => {
    const newAlert = {
      name: "Test Alert",
      condition: {
        metric: "error_rate",
        operator: "gt",
        threshold: 10,
        window: "5m",
      },
      severity: "warning",
      channels: [{ type: "email", target: "test@test.com" }],
    };

    const { status, body } = await request(app, "POST", "/", newAlert);

    expect(status).toBe(201);
    expect(body.data.name).toBe("Test Alert");
    expect(body.data.id).toBeDefined();
  });

  it("should update alert", async () => {
    const { status, body } = await request(app, "PATCH", "/alert_001", {
      enabled: false,
    });

    expect(status).toBe(200);
    expect(body.data.enabled).toBe(false);
  });

  it("should delete alert", async () => {
    const { status, body } = await request(app, "DELETE", "/alert_002");

    expect(status).toBe(200);
    expect(body.data.success).toBe(true);
  });

  it("should get alert history", async () => {
    const { status, body } = await request(app, "GET", "/history/list");

    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe("API Keys Router", () => {
  const app = createTestApp(apiKeysRouter);

  it("should list API keys", async () => {
    const { status, body } = await request(app, "GET", "/");

    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    // Should not include revoked keys by default
    expect(body.data.every((k: any) => !k.revokedAt)).toBe(true);
  });

  it("should include revoked keys when requested", async () => {
    const { status, body } = await request(app, "GET", "/?includeRevoked=true");

    expect(status).toBe(200);
    expect(body.data.some((k: any) => k.revokedAt)).toBe(true);
  });

  it("should create API key", async () => {
    const { status, body } = await request(app, "POST", "/", {
      name: "Test Key",
      scopes: ["ingest", "read"],
    });

    expect(status).toBe(201);
    expect(body.data.name).toBe("Test Key");
    expect(body.data.key).toBeDefined(); // Full key returned on creation
    expect(body.data.key.startsWith("ao_")).toBe(true);
    expect(body.warning).toContain("Save this API key");
  });

  it("should get API key usage", async () => {
    const { status, body } = await request(app, "GET", "/key_001/usage");

    expect(status).toBe(200);
    expect(body.data.totalRequests).toBeDefined();
    expect(body.data.timeSeries).toBeDefined();
  });

  it("should revoke API key", async () => {
    const { status, body } = await request(app, "POST", "/key_002/revoke");

    expect(status).toBe(200);
    expect(body.data.success).toBe(true);
    expect(body.data.revokedAt).toBeDefined();
  });
});

describe("Webhooks Router", () => {
  const app = createTestApp(webhooksRouter);

  it("should list webhooks", async () => {
    const { status, body } = await request(app, "GET", "/");

    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    // Should not expose secrets
    expect(
      body.data.every((w: any) => !w.secret && w.hasSecret !== undefined),
    ).toBe(true);
  });

  it("should create webhook", async () => {
    const { status, body } = await request(app, "POST", "/", {
      name: "Test Webhook",
      url: "https://example.com/webhook",
      events: ["session.ended", "alert.triggered"],
    });

    expect(status).toBe(201);
    expect(body.data.name).toBe("Test Webhook");
    expect(body.data.secret).toBeDefined(); // Secret returned on creation
    expect(body.data.secret.startsWith("whsec_")).toBe(true);
  });

  it("should test webhook", async () => {
    const { status, body } = await request(app, "POST", "/webhook_001/test");

    expect(status).toBe(200);
    expect(body.data.success).toBe(true);
  });

  it("should get webhook deliveries", async () => {
    const { status, body } = await request(
      app,
      "GET",
      "/webhook_001/deliveries",
    );

    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe("Export Router", () => {
  const app = createTestApp(exportRouter);

  it("should list export jobs", async () => {
    const { status, body } = await request(app, "GET", "/");

    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("should create export job", async () => {
    const { status, body } = await request(app, "POST", "/", {
      type: "sessions",
      format: "json",
      filters: {
        startDate: "2026-01-01T00:00:00Z",
        endDate: "2026-01-28T23:59:59Z",
      },
    });

    expect(status).toBe(202);
    expect(body.data.status).toBe("queued");
    expect(body.data.estimate).toBeDefined();
  });

  it("should get export estimate", async () => {
    const { status, body } = await request(app, "POST", "/estimate", {
      type: "events",
      format: "parquet",
      compression: "zstd",
      filters: {
        startDate: "2026-01-01T00:00:00Z",
        endDate: "2026-01-28T23:59:59Z",
      },
    });

    expect(status).toBe(200);
    expect(body.data.estimatedRows).toBeDefined();
    expect(body.data.estimatedSizeHuman).toBeDefined();
  });

  it("should get download URL for completed export", async () => {
    const { status, body } = await request(app, "GET", "/export_001/download");

    expect(status).toBe(200);
    expect(body.data.downloadUrl).toContain("token=signed_");
  });
});

describe("Projects Router", () => {
  const app = createTestApp(projectsRouter);

  it("should get current project", async () => {
    const { status, body } = await request(app, "GET", "/current");

    expect(status).toBe(200);
    expect(body.data.id).toBe("proj_1");
    expect(body.data.name).toBeDefined();
  });

  it("should update project settings", async () => {
    const { status, body } = await request(app, "PATCH", "/current", {
      settings: {
        samplingRate: 50,
      },
    });

    expect(status).toBe(200);
    expect(body.data.settings.samplingRate).toBe(50);
  });

  it("should get project usage", async () => {
    const { status, body } = await request(app, "GET", "/current/usage");

    expect(status).toBe(200);
    expect(body.data.current.events).toBeDefined();
    expect(body.data.limits).toBeDefined();
  });

  it("should list project members", async () => {
    const { status, body } = await request(app, "GET", "/current/members");

    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((m: any) => m.role === "owner")).toBe(true);
  });

  it("should get audit log", async () => {
    const { status, body } = await request(app, "GET", "/current/audit-log");

    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].action).toBeDefined();
  });
});
