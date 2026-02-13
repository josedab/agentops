/**
 * AgentOps SDK - Route LLM Types
 *
 * Type definitions for intelligent LLM routing and cost optimization.
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface RouteLLMConfig {
  enabled: boolean;
  models?: ModelProfile[];
  qualityFloor?: number;
  defaultModel?: string;
  shadowMode?: boolean;
  costWeight?: number;
  qualityWeight?: number;
  latencyWeight?: number;
  onRoutingDecision?: (decision: RoutingDecision) => void;
  debug?: boolean;
}

export interface ResolvedRouteLLMConfig {
  enabled: boolean;
  models: ModelProfile[];
  qualityFloor: number;
  defaultModel: string;
  shadowMode: boolean;
  costWeight: number;
  qualityWeight: number;
  latencyWeight: number;
  onRoutingDecision?: (decision: RoutingDecision) => void;
  debug: boolean;
}

// ============================================================================
// Model Types
// ============================================================================

export interface ModelProfile {
  modelId: string;
  costPer1kTokens: {
    input: number;
    output: number;
  };
  avgLatencyMs: number;
  qualityScore: number;
  maxTokens: number;
  capabilities: string[];
  tier: "premium" | "standard" | "economy";
}

// ============================================================================
// Routing Types
// ============================================================================

export interface RoutingRequest {
  input: string;
  estimatedTokens: number;
  requiredCapabilities: string[];
  minQuality?: number;
  maxCostPerRequest?: number;
  maxLatencyMs?: number;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface RoutingDecision {
  selectedModel: string;
  reason: string;
  score: number;
  alternativeModels: AlternativeModel[];
  estimatedCost: number;
  estimatedLatency: number;
  estimatedQuality: number;
  shadowMode: boolean;
  timestamp: number;
}

export interface AlternativeModel {
  modelId: string;
  score: number;
  reason: string;
}

// ============================================================================
// History & Performance Types
// ============================================================================

export interface RoutingHistory {
  requestId: string;
  request: RoutingRequest;
  decision: RoutingDecision;
  actualCost?: number;
  actualLatency?: number;
  actualQuality?: number;
  timestamp: number;
}

export interface ModelPerformanceData {
  modelId: string;
  samples: number;
  avgCost: number;
  avgLatency: number;
  avgQuality: number;
  costP95: number;
  latencyP95: number;
  qualityP5: number;
  lastUpdated: number;
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface RoutingMetrics {
  totalRequests: number;
  routedToPremium: number;
  routedToStandard: number;
  routedToEconomy: number;
  estimatedSavings: number;
  actualSavings: number;
  avgQualityDelta: number;
  shadowModeDecisions: number;
}

// ============================================================================
// Fallback Types
// ============================================================================

export interface FallbackChain {
  models: string[];
  strategy: "sequential" | "quality_threshold";
  qualityThreshold: number;
}
