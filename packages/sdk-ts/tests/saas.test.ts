/**
 * Tests for Federated Multi-Tenant SaaS Platform Engine
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SaaSPlatformEngine } from "../src/saas/index.js";
import type {
  SaaSConfig,
  RegionConfig,
  PlanConfig,
  TenantProvisionRequest,
  BillingEvent,
} from "../src/saas/index.js";

// ============================================================================
// Helpers
// ============================================================================

const TEST_REGIONS: RegionConfig[] = [
  {
    id: "us-east-1",
    name: "US East",
    endpoint: "https://us-east-1.test.ai",
    dataResidency: "US",
    available: true,
  },
  {
    id: "eu-west-1",
    name: "EU West",
    endpoint: "https://eu-west-1.test.ai",
    dataResidency: "EU",
    available: true,
  },
  {
    id: "ap-southeast-1",
    name: "Asia Pacific",
    endpoint: "https://ap-southeast-1.test.ai",
    dataResidency: "APAC",
    available: true,
  },
];

const TEST_PLANS: PlanConfig[] = [
  {
    id: "free",
    name: "Free",
    stripePriceId: "price_free",
    eventsPerMonth: 1_000,
    retentionDays: 7,
    features: ["basic_dashboard"],
    price: 0,
  },
  {
    id: "pro",
    name: "Pro",
    stripePriceId: "price_pro",
    eventsPerMonth: 100_000,
    retentionDays: 30,
    features: ["basic_dashboard", "alerts", "team_access"],
    price: 9900,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    stripePriceId: "price_enterprise",
    eventsPerMonth: 10_000_000,
    retentionDays: 90,
    features: ["basic_dashboard", "alerts", "team_access", "sso"],
    price: 49900,
  },
];

function makeConfig(overrides: Partial<SaaSConfig> = {}): SaaSConfig {
  return {
    enabled: true,
    regions: TEST_REGIONS,
    defaultRegion: "us-east-1",
    stripePlans: TEST_PLANS,
    ...overrides,
  };
}

function makeRequest(
  overrides: Partial<TenantProvisionRequest> = {},
): TenantProvisionRequest {
  return {
    name: "Acme Corp",
    email: "admin@acme.com",
    planId: "pro",
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("SaaSPlatformEngine", () => {
  let engine: SaaSPlatformEngine;

  beforeEach(() => {
    engine = new SaaSPlatformEngine(makeConfig());
  });

  // --------------------------------------------------------------------------
  // Tenant provisioning
  // --------------------------------------------------------------------------

  describe("tenant provisioning", () => {
    it("should provision a tenant and return result", () => {
      const result = engine.provisionTenant(makeRequest());

      expect(result.tenantId).toMatch(/^tenant_/);
      expect(result.apiKey).toMatch(/^agops_/);
      expect(result.status).toBe("provisioned");
      expect(result.region.id).toBe("us-east-1");
      expect(result.plan.id).toBe("pro");
      expect(result.dashboardUrl).toContain(result.tenantId);
      expect(result.createdAt).toBeGreaterThan(0);
    });

    it("should assign a specific region when requested", () => {
      const result = engine.provisionTenant(
        makeRequest({ regionId: "eu-west-1" }),
      );

      expect(result.region.id).toBe("eu-west-1");
      expect(result.region.dataResidency).toBe("EU");
    });

    it("should use default region when none specified", () => {
      const result = engine.provisionTenant(makeRequest());
      expect(result.region.id).toBe("us-east-1");
    });

    it("should throw on invalid plan", () => {
      expect(() =>
        engine.provisionTenant(makeRequest({ planId: "nonexistent" })),
      ).toThrow("Plan not found");
    });

    it("should throw on invalid region", () => {
      expect(() =>
        engine.provisionTenant(makeRequest({ regionId: "mars-1" })),
      ).toThrow("Region not found");
    });

    it("should throw on unavailable region", () => {
      const cfg = makeConfig({
        regions: [{ ...TEST_REGIONS[0], available: false }],
      });
      const eng = new SaaSPlatformEngine(cfg);

      expect(() => eng.provisionTenant(makeRequest())).toThrow(
        "Region not available",
      );
    });

    it("should call onTenantCreated callback", () => {
      const callback = vi.fn();
      const eng = new SaaSPlatformEngine(
        makeConfig({ onTenantCreated: callback }),
      );

      const result = eng.provisionTenant(makeRequest());
      expect(callback).toHaveBeenCalledWith(result);
    });

    it("should store metadata on the tenant", () => {
      const result = engine.provisionTenant(
        makeRequest({ metadata: { source: "signup" } }),
      );
      const tenant = engine.getTenant(result.tenantId);
      expect(tenant?.metadata).toEqual({ source: "signup" });
    });
  });

  // --------------------------------------------------------------------------
  // Tenant deprovisioning
  // --------------------------------------------------------------------------

  describe("tenant deprovisioning", () => {
    it("should soft-delete a tenant", () => {
      const result = engine.provisionTenant(makeRequest());
      const ok = engine.deprovisionTenant(result.tenantId);
      expect(ok).toBe(true);

      const tenant = engine.getTenant(result.tenantId);
      expect(tenant?.active).toBe(false);
    });

    it("should return false for unknown tenant", () => {
      expect(engine.deprovisionTenant("nonexistent")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Get & list tenants
  // --------------------------------------------------------------------------

  describe("tenant queries", () => {
    it("should get a provisioned tenant", () => {
      const result = engine.provisionTenant(makeRequest());
      const tenant = engine.getTenant(result.tenantId);
      expect(tenant).toBeDefined();
      expect(tenant!.name).toBe("Acme Corp");
      expect(tenant!.plan.id).toBe("pro");
      expect(tenant!.region.id).toBe("us-east-1");
    });

    it("should return undefined for unknown tenant", () => {
      expect(engine.getTenant("nonexistent")).toBeUndefined();
    });

    it("should list tenants with filters", () => {
      engine.provisionTenant(makeRequest({ planId: "free" }));
      engine.provisionTenant(makeRequest({ planId: "pro" }));
      engine.provisionTenant(
        makeRequest({ planId: "pro", regionId: "eu-west-1" }),
      );

      expect(engine.listTenants()).toHaveLength(3);
      expect(engine.listTenants({ planId: "pro" })).toHaveLength(2);
      expect(
        engine.listTenants({ planId: "pro", regionId: "eu-west-1" }),
      ).toHaveLength(1);
    });

    it("should filter by active status", () => {
      const r1 = engine.provisionTenant(makeRequest());
      engine.provisionTenant(makeRequest());
      engine.deprovisionTenant(r1.tenantId);

      expect(engine.listTenants({ active: true })).toHaveLength(1);
      expect(engine.listTenants({ active: false })).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Plan changes
  // --------------------------------------------------------------------------

  describe("plan changes", () => {
    it("should change a tenant plan", () => {
      const result = engine.provisionTenant(makeRequest({ planId: "free" }));
      const change = engine.changePlan(result.tenantId, "pro");

      expect(change.previousPlanId).toBe("free");
      expect(change.newPlanId).toBe("pro");

      const tenant = engine.getTenant(result.tenantId);
      expect(tenant!.plan.id).toBe("pro");
    });

    it("should record a billing event on plan change", () => {
      const result = engine.provisionTenant(makeRequest({ planId: "free" }));
      engine.changePlan(result.tenantId, "pro");

      const history = engine.getBillingHistory(result.tenantId);
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe("plan_changed");
    });

    it("should throw on unknown tenant", () => {
      expect(() => engine.changePlan("nonexistent", "pro")).toThrow(
        "Tenant not found",
      );
    });

    it("should throw on unknown plan", () => {
      const result = engine.provisionTenant(makeRequest());
      expect(() => engine.changePlan(result.tenantId, "nonexistent")).toThrow(
        "Plan not found",
      );
    });
  });

  // --------------------------------------------------------------------------
  // Usage metering and limit checking
  // --------------------------------------------------------------------------

  describe("usage metering", () => {
    it("should record and retrieve usage", () => {
      const result = engine.provisionTenant(makeRequest({ planId: "free" }));
      engine.recordUsage(result.tenantId, 500);

      const meter = engine.getUsageMeter(result.tenantId);
      expect(meter.eventsCount).toBe(500);
      expect(meter.eventsLimit).toBe(1_000);
      expect(meter.percentUsed).toBe(50);
      expect(meter.projectedOverage).toBe(0);
    });

    it("should accumulate usage", () => {
      const result = engine.provisionTenant(makeRequest({ planId: "free" }));
      engine.recordUsage(result.tenantId, 300);
      engine.recordUsage(result.tenantId, 400);

      const meter = engine.getUsageMeter(result.tenantId);
      expect(meter.eventsCount).toBe(700);
    });

    it("should detect projected overage", () => {
      const result = engine.provisionTenant(makeRequest({ planId: "free" }));
      engine.recordUsage(result.tenantId, 1_200);

      const meter = engine.getUsageMeter(result.tenantId);
      expect(meter.projectedOverage).toBe(200);
    });

    it("should check usage limits - allowed", () => {
      const result = engine.provisionTenant(makeRequest({ planId: "free" }));
      engine.recordUsage(result.tenantId, 500);

      const check = engine.checkUsageLimit(result.tenantId);
      expect(check.allowed).toBe(true);
      expect(check.remaining).toBe(500);
      expect(check.percentUsed).toBe(50);
    });

    it("should check usage limits - denied", () => {
      const result = engine.provisionTenant(makeRequest({ planId: "free" }));
      engine.recordUsage(result.tenantId, 1_000);

      const check = engine.checkUsageLimit(result.tenantId);
      expect(check.allowed).toBe(false);
      expect(check.remaining).toBe(0);
      expect(check.percentUsed).toBe(100);
    });

    it("should throw on unknown tenant for recordUsage", () => {
      expect(() => engine.recordUsage("nonexistent", 100)).toThrow(
        "Tenant not found",
      );
    });
  });

  // --------------------------------------------------------------------------
  // Billing events
  // --------------------------------------------------------------------------

  describe("billing events", () => {
    it("should record and retrieve billing events", () => {
      const result = engine.provisionTenant(makeRequest());

      const event: BillingEvent = {
        tenantId: result.tenantId,
        type: "invoice_paid",
        amount: 9900,
        currency: "usd",
        timestamp: Date.now(),
      };

      engine.recordBillingEvent(event);
      const history = engine.getBillingHistory(result.tenantId);

      expect(history).toHaveLength(1);
      expect(history[0].type).toBe("invoice_paid");
      expect(history[0].amount).toBe(9900);
    });

    it("should call onBillingEvent callback", () => {
      const callback = vi.fn();
      const eng = new SaaSPlatformEngine(
        makeConfig({ onBillingEvent: callback }),
      );

      const result = eng.provisionTenant(makeRequest());
      const event: BillingEvent = {
        tenantId: result.tenantId,
        type: "subscription_created",
        amount: 9900,
        currency: "usd",
        timestamp: Date.now(),
      };

      eng.recordBillingEvent(event);
      expect(callback).toHaveBeenCalledWith(event);
    });

    it("should return empty array for tenant with no billing events", () => {
      const result = engine.provisionTenant(makeRequest());
      expect(engine.getBillingHistory(result.tenantId)).toEqual([]);
    });

    it("should filter billing history by tenant", () => {
      const r1 = engine.provisionTenant(makeRequest());
      const r2 = engine.provisionTenant(makeRequest({ name: "Other Corp" }));

      engine.recordBillingEvent({
        tenantId: r1.tenantId,
        type: "invoice_paid",
        amount: 9900,
        currency: "usd",
        timestamp: Date.now(),
      });
      engine.recordBillingEvent({
        tenantId: r2.tenantId,
        type: "invoice_paid",
        amount: 4900,
        currency: "usd",
        timestamp: Date.now(),
      });

      expect(engine.getBillingHistory(r1.tenantId)).toHaveLength(1);
      expect(engine.getBillingHistory(r2.tenantId)).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Region resolution
  // --------------------------------------------------------------------------

  describe("region resolution", () => {
    it("should resolve the correct region for a tenant", () => {
      const result = engine.provisionTenant(
        makeRequest({ regionId: "eu-west-1" }),
      );
      const region = engine.resolveRegion(result.tenantId);

      expect(region.id).toBe("eu-west-1");
      expect(region.dataResidency).toBe("EU");
    });

    it("should throw on unknown tenant", () => {
      expect(() => engine.resolveRegion("nonexistent")).toThrow(
        "Tenant not found",
      );
    });
  });

  // --------------------------------------------------------------------------
  // Data residency policy
  // --------------------------------------------------------------------------

  describe("data residency policy", () => {
    it("should return the data residency policy", () => {
      const result = engine.provisionTenant(
        makeRequest({ regionId: "us-east-1" }),
      );
      const policy = engine.getDataResidencyPolicy(result.tenantId);

      expect(policy.tenantId).toBe(result.tenantId);
      expect(policy.region).toBe("us-east-1");
      expect(policy.allowedRegions).toContain("us-east-1");
      expect(policy.encryptionKeyId).toContain(result.tenantId);
    });

    it("should only allow same-residency regions", () => {
      const result = engine.provisionTenant(
        makeRequest({ regionId: "eu-west-1" }),
      );
      const policy = engine.getDataResidencyPolicy(result.tenantId);

      // EU residency should only include EU regions
      expect(policy.allowedRegions).toContain("eu-west-1");
      expect(policy.allowedRegions).not.toContain("us-east-1");
      expect(policy.allowedRegions).not.toContain("ap-southeast-1");
    });

    it("should throw on unknown tenant", () => {
      expect(() => engine.getDataResidencyPolicy("nonexistent")).toThrow(
        "Tenant not found",
      );
    });
  });

  // --------------------------------------------------------------------------
  // Federated query execution
  // --------------------------------------------------------------------------

  describe("federated query", () => {
    it("should execute a federated query across regions", async () => {
      engine.provisionTenant(makeRequest({ regionId: "us-east-1" }));
      engine.provisionTenant(
        makeRequest({ regionId: "eu-west-1", name: "EU Corp" }),
      );

      const queryResult = await engine.executeFederatedQuery({
        query: "SELECT count(*) FROM tenants",
        regions: ["us-east-1", "eu-west-1"],
        mergeStrategy: "union",
        timeout: 5000,
      });

      expect(queryResult.regionsQueried).toContain("us-east-1");
      expect(queryResult.regionsQueried).toContain("eu-west-1");
      expect(queryResult.results.size).toBe(2);
      expect(queryResult.errors.size).toBe(0);
      expect(queryResult.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("should report errors for unknown regions", async () => {
      const queryResult = await engine.executeFederatedQuery({
        query: "SELECT 1",
        regions: ["nonexistent"],
        mergeStrategy: "aggregate",
        timeout: 5000,
      });

      expect(queryResult.errors.has("nonexistent")).toBe(true);
      expect(queryResult.results.size).toBe(0);
    });

    it("should report errors for unavailable regions", async () => {
      const cfg = makeConfig({
        regions: [
          ...TEST_REGIONS.slice(0, 1),
          { ...TEST_REGIONS[1], available: false },
        ],
      });
      const eng = new SaaSPlatformEngine(cfg);

      const queryResult = await eng.executeFederatedQuery({
        query: "SELECT 1",
        regions: ["eu-west-1"],
        mergeStrategy: "union",
        timeout: 5000,
      });

      expect(queryResult.errors.has("eu-west-1")).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Platform metrics
  // --------------------------------------------------------------------------

  describe("platform metrics", () => {
    it("should return correct metrics", () => {
      engine.provisionTenant(makeRequest({ planId: "pro" }));
      engine.provisionTenant(
        makeRequest({ planId: "enterprise", regionId: "eu-west-1" }),
      );

      const metrics = engine.getMetrics();

      expect(metrics.totalTenants).toBe(2);
      expect(metrics.activeTenants).toBe(2);
      expect(metrics.mrr).toBe(9900 + 49900);
      expect(metrics.churnRate).toBe(0);
      expect(metrics.regionDistribution.get("us-east-1")).toBe(1);
      expect(metrics.regionDistribution.get("eu-west-1")).toBe(1);
    });

    it("should reflect deprovisioned tenants in churn", () => {
      const r1 = engine.provisionTenant(makeRequest());
      engine.provisionTenant(makeRequest());
      engine.deprovisionTenant(r1.tenantId);

      const metrics = engine.getMetrics();

      expect(metrics.totalTenants).toBe(2);
      expect(metrics.activeTenants).toBe(1);
      expect(metrics.churnRate).toBe(0.5);
    });

    it("should compute average events per tenant", () => {
      const r1 = engine.provisionTenant(makeRequest({ planId: "free" }));
      const r2 = engine.provisionTenant(makeRequest({ planId: "free" }));

      engine.recordUsage(r1.tenantId, 200);
      engine.recordUsage(r2.tenantId, 400);

      const metrics = engine.getMetrics();
      expect(metrics.avgEventsPerTenant).toBe(300);
    });

    it("should return zero metrics when empty", () => {
      const metrics = engine.getMetrics();

      expect(metrics.totalTenants).toBe(0);
      expect(metrics.activeTenants).toBe(0);
      expect(metrics.mrr).toBe(0);
      expect(metrics.churnRate).toBe(0);
      expect(metrics.avgEventsPerTenant).toBe(0);
    });
  });
});
