/**
 * AgentOps SDK - Federated Learning from Traces Module
 *
 * Privacy-preserving federated learning across multi-tenant trace data
 * with differential privacy and community-driven routing profiles.
 *
 * @packageDocumentation
 */

export { FederatedLearningEngine } from "./engine.js";

export type {
  FederatedConfig,
  ResolvedFederatedConfig,
  TenantContribution,
  ModelPerformanceReport,
  InsightType,
  AggregatedInsight,
  CommunityRoutingProfile,
  DifferentialPrivacyParams,
  PrivacyAuditEntry,
  FederatedMetrics,
} from "./types.js";
