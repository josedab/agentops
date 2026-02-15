/**
 * AgentOps SDK - Federated Multi-Tenant SaaS Engine
 *
 * Manages tenant provisioning, billing, usage metering,
 * data residency, and federated queries.
 *
 * @packageDocumentation
 */

import { nanoid } from "nanoid";

import type {
  SaaSConfig,
  RegionConfig,
  PlanConfig,
  TenantProvisionRequest,
  TenantProvisionResult,
  BillingEvent,
  UsageMeter,
  DataResidencyPolicy,
  FederatedQuery,
  FederatedQueryResult,
  SaaSMetrics,
} from "./types.js";

// ============================================================================
// Internal tenant record
// ============================================================================

interface TenantRecord {
  tenantId: string;
  name: string;
  email: string;
  planId: string;
  regionId: string;
  apiKey: string;
  active: boolean;
  createdAt: number;
  metadata?: Record<string, string>;
}

interface UsageEntry {
  eventsCount: number;
  periodStart: number;
  periodEnd: number;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_REGIONS: RegionConfig[] = [
  {
    id: "us-east-1",
    name: "US East",
    endpoint: "https://us-east-1.agentops.ai",
    dataResidency: "US",
    available: true,
  },
  {
    id: "eu-west-1",
    name: "EU West",
    endpoint: "https://eu-west-1.agentops.ai",
    dataResidency: "EU",
    available: true,
  },
  {
    id: "ap-southeast-1",
    name: "Asia Pacific",
    endpoint: "https://ap-southeast-1.agentops.ai",
    dataResidency: "APAC",
    available: true,
  },
];

const DEFAULT_PLANS: PlanConfig[] = [
  {
    id: "free",
    name: "Free",
    stripePriceId: "price_free",
    eventsPerMonth: 50_000,
    retentionDays: 7,
    features: ["basic_dashboard"],
    price: 0,
  },
  {
    id: "pro",
    name: "Pro",
    stripePriceId: "price_pro",
    eventsPerMonth: 1_000_000,
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
    features: [
      "basic_dashboard",
      "alerts",
      "team_access",
      "sso",
      "custom_retention",
    ],
    price: 49900,
  },
];

// ============================================================================
// Helpers
// ============================================================================

function getBillingPeriod(): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  ).getTime();
  return { start, end };
}

// ============================================================================
// SaaSPlatformEngine
// ============================================================================

export class SaaSPlatformEngine {
  private readonly config: Required<
    Pick<SaaSConfig, "enabled" | "defaultRegion" | "debug">
  > &
    SaaSConfig;

  private readonly regions: RegionConfig[];
  private readonly plans: PlanConfig[];

  private tenants = new Map<string, TenantRecord>();
  private usage = new Map<string, UsageEntry>();
  private billingEvents: BillingEvent[] = [];
  private deprovisionedCount = 0;

  constructor(config: SaaSConfig) {
    this.regions = config.regions ?? DEFAULT_REGIONS;
    this.plans = config.stripePlans ?? DEFAULT_PLANS;

    const defaultRegion =
      config.defaultRegion ?? this.regions[0]?.id ?? "us-east-1";

    this.config = {
      ...config,
      enabled: config.enabled,
      defaultRegion,
      debug: config.debug ?? false,
    };
  }

  // --------------------------------------------------------------------------
  // Tenant lifecycle
  // --------------------------------------------------------------------------

  /** Provision a new tenant with API key, region, and plan. */
  provisionTenant(request: TenantProvisionRequest): TenantProvisionResult {
    const plan = this.plans.find((p) => p.id === request.planId);
    if (!plan) {
      throw new Error(`Plan not found: ${request.planId}`);
    }

    const regionId = request.regionId ?? this.config.defaultRegion;
    const region = this.regions.find((r) => r.id === regionId);
    if (!region) {
      throw new Error(`Region not found: ${regionId}`);
    }

    if (!region.available) {
      throw new Error(`Region not available: ${regionId}`);
    }

    const tenantId = `tenant_${nanoid(21)}`;
    const apiKey = `agops_${nanoid(32)}`;

    const record: TenantRecord = {
      tenantId,
      name: request.name,
      email: request.email,
      planId: request.planId,
      regionId,
      apiKey,
      active: true,
      createdAt: Date.now(),
      metadata: request.metadata,
    };

    this.tenants.set(tenantId, record);

    // Initialize usage
    const { start, end } = getBillingPeriod();
    this.usage.set(tenantId, {
      eventsCount: 0,
      periodStart: start,
      periodEnd: end,
    });

    const result: TenantProvisionResult = {
      tenantId,
      apiKey,
      region,
      plan,
      dashboardUrl: `${region.endpoint}/dashboard/${tenantId}`,
      status: "provisioned",
      createdAt: record.createdAt,
    };

    this.config.onTenantCreated?.(result);

    if (this.config.debug) {
      console.log(`[SaaS] Tenant provisioned: ${tenantId}`);
    }

    return result;
  }

  /** Soft-delete (deprovision) a tenant. */
  deprovisionTenant(tenantId: string): boolean {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return false;
    }

    tenant.active = false;
    this.deprovisionedCount++;
    return true;
  }

  /** Get tenant information. */
  getTenant(
    tenantId: string,
  ): (TenantRecord & { region: RegionConfig; plan: PlanConfig }) | undefined {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return undefined;
    }

    const region = this.regions.find((r) => r.id === tenant.regionId)!;
    const plan = this.plans.find((p) => p.id === tenant.planId)!;
    return { ...tenant, region, plan };
  }

  /** List tenants with optional filtering. */
  listTenants(filter?: {
    planId?: string;
    regionId?: string;
    active?: boolean;
  }): TenantRecord[] {
    let results = Array.from(this.tenants.values());

    if (filter?.planId !== undefined) {
      results = results.filter((t) => t.planId === filter.planId);
    }
    if (filter?.regionId !== undefined) {
      results = results.filter((t) => t.regionId === filter.regionId);
    }
    if (filter?.active !== undefined) {
      results = results.filter((t) => t.active === filter.active);
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // Plan management
  // --------------------------------------------------------------------------

  /** Change a tenant's subscription plan. */
  changePlan(
    tenantId: string,
    newPlanId: string,
  ): { previousPlanId: string; newPlanId: string } {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const newPlan = this.plans.find((p) => p.id === newPlanId);
    if (!newPlan) {
      throw new Error(`Plan not found: ${newPlanId}`);
    }

    const previousPlanId = tenant.planId;
    tenant.planId = newPlanId;

    this.recordBillingEvent({
      tenantId,
      type: "plan_changed",
      amount: newPlan.price,
      currency: "usd",
      timestamp: Date.now(),
      metadata: { previousPlanId, newPlanId },
    });

    return { previousPlanId, newPlanId };
  }

  // --------------------------------------------------------------------------
  // Usage metering
  // --------------------------------------------------------------------------

  /** Record usage (event count) for a tenant. */
  recordUsage(tenantId: string, eventCount: number): void {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const { start, end } = getBillingPeriod();
    const entry = this.usage.get(tenantId) ?? {
      eventsCount: 0,
      periodStart: start,
      periodEnd: end,
    };

    entry.eventsCount += eventCount;
    this.usage.set(tenantId, entry);
  }

  /** Get the current usage meter for a tenant. */
  getUsageMeter(tenantId: string): UsageMeter {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const plan = this.plans.find((p) => p.id === tenant.planId)!;
    const { start, end } = getBillingPeriod();
    const entry = this.usage.get(tenantId) ?? {
      eventsCount: 0,
      periodStart: start,
      periodEnd: end,
    };

    const percentUsed =
      plan.eventsPerMonth > 0
        ? Math.round((entry.eventsCount / plan.eventsPerMonth) * 10000) / 100
        : 0;

    const projectedOverage = Math.max(
      0,
      entry.eventsCount - plan.eventsPerMonth,
    );

    return {
      tenantId,
      eventsCount: entry.eventsCount,
      eventsLimit: plan.eventsPerMonth,
      percentUsed,
      periodStart: entry.periodStart,
      periodEnd: entry.periodEnd,
      projectedOverage,
    };
  }

  /** Check if a tenant can send more events. */
  checkUsageLimit(tenantId: string): {
    allowed: boolean;
    remaining: number;
    percentUsed: number;
  } {
    const meter = this.getUsageMeter(tenantId);
    const remaining = Math.max(0, meter.eventsLimit - meter.eventsCount);

    return {
      allowed: remaining > 0,
      remaining,
      percentUsed: meter.percentUsed,
    };
  }

  // --------------------------------------------------------------------------
  // Billing
  // --------------------------------------------------------------------------

  /** Record a billing event. */
  recordBillingEvent(event: BillingEvent): void {
    this.billingEvents.push(event);
    this.config.onBillingEvent?.(event);
  }

  /** Get billing history for a tenant. */
  getBillingHistory(tenantId: string): BillingEvent[] {
    return this.billingEvents.filter((e) => e.tenantId === tenantId);
  }

  // --------------------------------------------------------------------------
  // Region & data residency
  // --------------------------------------------------------------------------

  /** Resolve the region configuration for a tenant. */
  resolveRegion(tenantId: string): RegionConfig {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const region = this.regions.find((r) => r.id === tenant.regionId);
    if (!region) {
      throw new Error(`Region not found: ${tenant.regionId}`);
    }

    return region;
  }

  /** Get the data residency policy for a tenant. */
  getDataResidencyPolicy(tenantId: string): DataResidencyPolicy {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const region = this.regions.find((r) => r.id === tenant.regionId)!;
    const sameResidency = this.regions
      .filter((r) => r.dataResidency === region.dataResidency)
      .map((r) => r.id);

    return {
      tenantId,
      region: tenant.regionId,
      allowedRegions: sameResidency,
      dataReplicationEnabled: sameResidency.length > 1,
      encryptionKeyId: `enc_${tenantId}`,
    };
  }

  // --------------------------------------------------------------------------
  // Federated queries
  // --------------------------------------------------------------------------

  /** Execute a federated query across multiple regions. */
  async executeFederatedQuery(
    query: FederatedQuery,
  ): Promise<FederatedQueryResult> {
    const startTime = Date.now();
    const results = new Map<string, unknown>();
    const errors = new Map<string, string>();
    const regionsQueried: string[] = [];

    const regionPromises = query.regions.map(async (regionId) => {
      const region = this.regions.find((r) => r.id === regionId);
      if (!region) {
        errors.set(regionId, `Region not found: ${regionId}`);
        return;
      }

      if (!region.available) {
        errors.set(regionId, `Region not available: ${regionId}`);
        return;
      }

      regionsQueried.push(regionId);

      // Simulate region query with a small delay
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 10);
        // Respect timeout
        if (query.timeout > 0) {
          const timeoutTimer = setTimeout(() => {
            clearTimeout(timer);
            reject(new Error("Query timed out"));
          }, query.timeout);
          // Clear timeout timer if resolved first
          void Promise.resolve().then(() => clearTimeout(timeoutTimer));
        }
      });

      // Simulated region-local result
      const tenantCount = Array.from(this.tenants.values()).filter(
        (t) => t.regionId === regionId && t.active,
      ).length;

      results.set(regionId, {
        query: query.query,
        region: regionId,
        tenantCount,
      });
    });

    await Promise.allSettled(regionPromises);

    return {
      results,
      totalDurationMs: Date.now() - startTime,
      regionsQueried,
      errors,
    };
  }

  // --------------------------------------------------------------------------
  // Metrics
  // --------------------------------------------------------------------------

  /** Get platform-wide SaaS metrics. */
  getMetrics(): SaaSMetrics {
    const allTenants = Array.from(this.tenants.values());
    const activeTenants = allTenants.filter((t) => t.active);
    const totalTenants = allTenants.length;

    // Calculate MRR from active tenants
    let mrr = 0;
    for (const tenant of activeTenants) {
      const plan = this.plans.find((p) => p.id === tenant.planId);
      if (plan) {
        mrr += plan.price;
      }
    }

    // Calculate churn rate
    const churnRate =
      totalTenants > 0 ? this.deprovisionedCount / totalTenants : 0;

    // Average events per tenant
    let totalEvents = 0;
    for (const entry of this.usage.values()) {
      totalEvents += entry.eventsCount;
    }
    const avgEventsPerTenant =
      activeTenants.length > 0
        ? Math.round(totalEvents / activeTenants.length)
        : 0;

    // Region distribution
    const regionDistribution = new Map<string, number>();
    for (const tenant of activeTenants) {
      const count = regionDistribution.get(tenant.regionId) ?? 0;
      regionDistribution.set(tenant.regionId, count + 1);
    }

    return {
      totalTenants,
      activeTenants: activeTenants.length,
      mrr,
      churnRate,
      avgEventsPerTenant,
      regionDistribution,
    };
  }
}
