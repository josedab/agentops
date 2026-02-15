/**
 * AgentOps SDK - Federated Learning from Traces Types
 *
 * Type definitions for privacy-preserving federated learning
 * across multi-tenant trace data.
 *
 * @packageDocumentation
 */

// ============================================================================
// Configuration
// ============================================================================

export interface FederatedConfig {
  enabled?: boolean;
  privacyBudget?: number;
  minTenantSamples?: number;
  aggregationIntervalMs?: number;
  debug?: boolean;
}

export interface ResolvedFederatedConfig {
  enabled: boolean;
  privacyBudget: number;
  minTenantSamples: number;
  aggregationIntervalMs: number;
  debug: boolean;
}

// ============================================================================
// Tenant Contributions
// ============================================================================

export interface TenantContribution {
  tenantId: string;
  optedIn: boolean;
  optedInAt: number | null;
  samplesContributed: number;
  lastContribution: number | null;
}

// ============================================================================
// Model Performance
// ============================================================================

export interface ModelPerformanceReport {
  modelId: string;
  avgCost: number;
  avgLatencyMs: number;
  avgQualityScore: number;
  sampleCount: number;
  costP95: number;
  latencyP95: number;
  qualityP5: number;
}

// ============================================================================
// Insights
// ============================================================================

export type InsightType =
  | "model_recommendation"
  | "cost_optimization"
  | "quality_improvement"
  | "routing_suggestion";

export interface AggregatedInsight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  confidence: number;
  affectedModels: string[];
  estimatedImpact: { metric: string; improvement: number };
  generatedAt: number;
  sampleSize: number;
}

// ============================================================================
// Routing Profiles
// ============================================================================

export interface CommunityRoutingProfile {
  id: string;
  name: string;
  description: string;
  modelRankings: {
    modelId: string;
    score: number;
    costEfficiency: number;
    qualityScore: number;
  }[];
  workloadType: string;
  sampleSize: number;
  updatedAt: number;
}

// ============================================================================
// Differential Privacy
// ============================================================================

export interface DifferentialPrivacyParams {
  epsilon: number;
  delta: number;
  noiseScale: number;
}

// ============================================================================
// Audit
// ============================================================================

export interface PrivacyAuditEntry {
  id: string;
  tenantId: string;
  action: "opt_in" | "opt_out" | "contribution" | "data_deletion";
  timestamp: number;
  details: string;
}

// ============================================================================
// Metrics
// ============================================================================

export interface FederatedMetrics {
  totalTenants: number;
  optedInTenants: number;
  totalSamples: number;
  totalInsightsGenerated: number;
  totalRoutingProfiles: number;
  avgPrivacyBudgetUsed: number;
}
