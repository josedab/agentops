/**
 * AgentOps SDK - Federated Multi-Tenant SaaS Module
 *
 * Multi-tenant SaaS platform management with billing,
 * usage metering, data residency, and federated queries.
 *
 * @packageDocumentation
 */

export { SaaSPlatformEngine } from "./engine.js";

export type {
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
