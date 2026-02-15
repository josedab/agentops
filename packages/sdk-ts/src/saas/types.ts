/**
 * AgentOps SDK - Federated Multi-Tenant SaaS Types
 *
 * Type definitions for multi-tenant SaaS platform management,
 * billing, usage metering, data residency, and federated queries.
 *
 * @packageDocumentation
 */

// ============================================================================
// Configuration
// ============================================================================

export interface SaaSConfig {
  /** Enable the SaaS platform engine */
  enabled: boolean;

  /** Available regions */
  regions?: RegionConfig[];

  /** Default region for new tenants */
  defaultRegion?: string;

  /** Stripe plan configurations */
  stripePlans?: PlanConfig[];

  /** Callback when a tenant is created */
  onTenantCreated?: (result: TenantProvisionResult) => void;

  /** Callback when a billing event occurs */
  onBillingEvent?: (event: BillingEvent) => void;

  /** Enable debug logging */
  debug?: boolean;
}

export interface RegionConfig {
  /** Region identifier (e.g. 'us-east-1', 'eu-west-1') */
  id: string;

  /** Human-readable name */
  name: string;

  /** API endpoint URL for this region */
  endpoint: string;

  /** Data residency zone */
  dataResidency: "US" | "EU" | "APAC";

  /** Whether this region is available for new tenants */
  available: boolean;
}

export interface PlanConfig {
  /** Unique plan identifier */
  id: string;

  /** Display name */
  name: string;

  /** Stripe price ID */
  stripePriceId: string;

  /** Maximum events per month */
  eventsPerMonth: number;

  /** Data retention in days */
  retentionDays: number;

  /** Enabled features for this plan */
  features: string[];

  /** Price in cents */
  price: number;
}

// ============================================================================
// Tenant Provisioning
// ============================================================================

export interface TenantProvisionRequest {
  /** Tenant display name */
  name: string;

  /** Contact email */
  email: string;

  /** Selected plan ID */
  planId: string;

  /** Selected region ID */
  regionId?: string;

  /** Arbitrary metadata */
  metadata?: Record<string, string>;
}

export interface TenantProvisionResult {
  /** Unique tenant identifier */
  tenantId: string;

  /** Generated API key */
  apiKey: string;

  /** Assigned region */
  region: RegionConfig;

  /** Assigned plan */
  plan: PlanConfig;

  /** Dashboard URL */
  dashboardUrl: string;

  /** Provisioning status */
  status: "provisioned" | "pending" | "failed";

  /** Creation timestamp */
  createdAt: number;
}

// ============================================================================
// Billing
// ============================================================================

export interface BillingEvent {
  /** Tenant identifier */
  tenantId: string;

  /** Event type */
  type:
    | "subscription_created"
    | "invoice_paid"
    | "invoice_failed"
    | "usage_reported"
    | "plan_changed"
    | "subscription_cancelled";

  /** Amount in cents */
  amount: number;

  /** Currency code */
  currency: string;

  /** Event timestamp */
  timestamp: number;

  /** Arbitrary metadata */
  metadata?: Record<string, string>;
}

// ============================================================================
// Usage Metering
// ============================================================================

export interface UsageMeter {
  /** Tenant identifier */
  tenantId: string;

  /** Total events in the current period */
  eventsCount: number;

  /** Event limit for the current period */
  eventsLimit: number;

  /** Percentage of limit used (0-100) */
  percentUsed: number;

  /** Start of the billing period */
  periodStart: number;

  /** End of the billing period */
  periodEnd: number;

  /** Projected overage events (0 if within limit) */
  projectedOverage: number;
}

// ============================================================================
// Data Residency
// ============================================================================

export interface DataResidencyPolicy {
  /** Tenant identifier */
  tenantId: string;

  /** Primary region */
  region: string;

  /** Regions allowed for data storage */
  allowedRegions: string[];

  /** Whether data replication across regions is enabled */
  dataReplicationEnabled: boolean;

  /** Encryption key identifier for tenant data */
  encryptionKeyId: string;
}

// ============================================================================
// Federated Query
// ============================================================================

export interface FederatedQuery {
  /** Query string or identifier */
  query: string;

  /** Regions to fan out the query to */
  regions: string[];

  /** Strategy for merging results */
  mergeStrategy: "union" | "aggregate";

  /** Query timeout in milliseconds */
  timeout: number;
}

export interface FederatedQueryResult {
  /** Results per region */
  results: Map<string, unknown>;

  /** Total query duration in milliseconds */
  totalDurationMs: number;

  /** Regions that were queried */
  regionsQueried: string[];

  /** Errors per region (if any) */
  errors: Map<string, string>;
}

// ============================================================================
// Platform Metrics
// ============================================================================

export interface SaaSMetrics {
  /** Total number of tenants */
  totalTenants: number;

  /** Number of active (non-deprovisioned) tenants */
  activeTenants: number;

  /** Monthly recurring revenue in cents */
  mrr: number;

  /** Churn rate (0-1) */
  churnRate: number;

  /** Average events per tenant in the current period */
  avgEventsPerTenant: number;

  /** Tenant count per region */
  regionDistribution: Map<string, number>;
}
