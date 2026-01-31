/**
 * AgentOps SDK - AI Copilot for Debugging Types
 *
 * Type definitions for the AI-powered debugging assistant.
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface CopilotConfig {
  /** Enable AI Copilot features */
  enabled: boolean;
  /** LLM provider to use for analysis */
  provider?: "openai" | "anthropic" | "custom";
  /** API key for LLM provider (if not using AgentOps-provided) */
  providerApiKey?: string;
  /** Custom endpoint for LLM provider */
  providerEndpoint?: string;
  /** Model to use for analysis */
  model?: string;
  /** Maximum tokens for analysis responses */
  maxResponseTokens?: number;
  /** Enable caching of analysis results */
  enableCache?: boolean;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs?: number;
  /** Maximum sessions to analyze in batch queries */
  maxSessionsPerQuery?: number;
  /** Callback when analysis is complete */
  onAnalysisComplete?: (result: AnalysisResult) => void;
  /** Callback on errors */
  onError?: (error: CopilotError) => void;
}

export interface ResolvedCopilotConfig extends Required<
  Omit<
    CopilotConfig,
    "providerApiKey" | "providerEndpoint" | "onAnalysisComplete" | "onError"
  >
> {
  providerApiKey?: string;
  providerEndpoint?: string;
  onAnalysisComplete?: (result: AnalysisResult) => void;
  onError?: (error: CopilotError) => void;
}

// ============================================================================
// Query Types
// ============================================================================

export interface DebugQuery {
  /** Natural language question about sessions/behavior */
  question: string;
  /** Optional session IDs to focus on */
  sessionIds?: string[];
  /** Optional time range filter */
  timeRange?: TimeRange;
  /** Optional filters */
  filters?: QueryFilters;
  /** Query context for follow-up questions */
  conversationId?: string;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface QueryFilters {
  /** Filter by user ID */
  userId?: string;
  /** Filter by feature ID */
  featureId?: string;
  /** Filter by model */
  model?: string;
  /** Filter by error type */
  errorType?: string;
  /** Filter by tags */
  tags?: string[];
  /** Only include failed sessions */
  failedOnly?: boolean;
  /** Minimum cost threshold */
  minCost?: number;
  /** Maximum cost threshold */
  maxCost?: number;
}

// ============================================================================
// Analysis Result Types
// ============================================================================

export interface AnalysisResult {
  /** Unique result ID */
  id: string;
  /** Original query */
  query: DebugQuery;
  /** Natural language answer */
  answer: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Evidence supporting the answer */
  evidence: Evidence[];
  /** Related sessions found */
  relatedSessions: SessionSummary[];
  /** Suggested follow-up questions */
  suggestedQuestions: string[];
  /** Root cause analysis (if applicable) */
  rootCause?: RootCauseInsight;
  /** Recommended actions */
  recommendations: Recommendation[];
  /** Analysis metadata */
  metadata: AnalysisMetadata;
}

export interface Evidence {
  /** Evidence type */
  type: EvidenceType;
  /** Session ID this evidence comes from */
  sessionId: string;
  /** Event ID (if specific event) */
  eventId?: string;
  /** Evidence description */
  description: string;
  /** Raw data supporting this evidence */
  data: unknown;
  /** Relevance score (0-1) */
  relevance: number;
}

export type EvidenceType =
  | "session_trace"
  | "error_log"
  | "tool_failure"
  | "cost_anomaly"
  | "latency_spike"
  | "pattern_match"
  | "behavior_change"
  | "prompt_issue";

export interface SessionSummary {
  sessionId: string;
  userId?: string;
  featureId?: string;
  model: string;
  status: "success" | "error";
  startTime: number;
  endTime?: number;
  durationMs: number;
  totalCost: number;
  totalTokens: number;
  eventCount: number;
  errorCount: number;
  relevanceScore: number;
}

export interface RootCauseInsight {
  /** Primary cause category */
  category: RootCauseCategory;
  /** Detailed explanation */
  explanation: string;
  /** Confidence in this diagnosis (0-1) */
  confidence: number;
  /** Contributing factors */
  contributingFactors: ContributingFactor[];
  /** Timeline of events leading to issue */
  timeline: TimelineEvent[];
}

export type RootCauseCategory =
  | "prompt_issue"
  | "model_limitation"
  | "tool_failure"
  | "context_overflow"
  | "rate_limit"
  | "timeout"
  | "data_quality"
  | "configuration"
  | "external_dependency"
  | "unknown";

export interface ContributingFactor {
  factor: string;
  impact: "high" | "medium" | "low";
  evidence: string;
}

export interface TimelineEvent {
  timestamp: number;
  event: string;
  type: "normal" | "warning" | "error";
  details?: string;
}

export interface Recommendation {
  /** Recommendation ID */
  id: string;
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** Priority level */
  priority: "critical" | "high" | "medium" | "low";
  /** Category of fix */
  category: RecommendationCategory;
  /** Estimated effort */
  effort: "trivial" | "small" | "medium" | "large";
  /** Expected impact */
  expectedImpact: string;
  /** Code snippet or example (if applicable) */
  codeExample?: string;
  /** Documentation link (if applicable) */
  documentationUrl?: string;
}

export type RecommendationCategory =
  | "prompt_optimization"
  | "model_selection"
  | "error_handling"
  | "tool_configuration"
  | "cost_optimization"
  | "performance"
  | "reliability";

export interface AnalysisMetadata {
  /** Time taken for analysis (ms) */
  analysisTimeMs: number;
  /** Sessions analyzed */
  sessionsAnalyzed: number;
  /** Events processed */
  eventsProcessed: number;
  /** Tokens used for analysis */
  tokensUsed: number;
  /** Cache hit */
  cacheHit: boolean;
  /** Model used for analysis */
  modelUsed: string;
  /** Timestamp */
  timestamp: number;
}

// ============================================================================
// Conversation Types
// ============================================================================

export interface Conversation {
  /** Conversation ID */
  id: string;
  /** Conversation history */
  messages: ConversationMessage[];
  /** Context accumulated from queries */
  context: ConversationContext;
  /** Created at */
  createdAt: number;
  /** Last updated */
  updatedAt: number;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  analysisId?: string;
}

export interface ConversationContext {
  /** Sessions referenced in conversation */
  referencedSessions: string[];
  /** Identified issues */
  identifiedIssues: string[];
  /** Applied filters */
  filters: QueryFilters;
}

// ============================================================================
// Vector/Embedding Types
// ============================================================================

export interface SessionEmbedding {
  sessionId: string;
  embedding: number[];
  summary: string;
  metadata: {
    model: string;
    status: "success" | "error";
    cost: number;
    tokens: number;
    timestamp: number;
  };
}

export interface SimilarSession {
  sessionId: string;
  similarity: number;
  summary: SessionSummary;
}

// ============================================================================
// Error Types
// ============================================================================

export interface CopilotError {
  code: CopilotErrorCode;
  message: string;
  details?: unknown;
  retryable: boolean;
}

export type CopilotErrorCode =
  | "provider_error"
  | "rate_limit"
  | "invalid_query"
  | "no_data"
  | "analysis_failed"
  | "timeout"
  | "configuration_error";

// ============================================================================
// Stats Types
// ============================================================================

export interface CopilotStats {
  /** Total queries made */
  totalQueries: number;
  /** Successful analyses */
  successfulAnalyses: number;
  /** Failed analyses */
  failedAnalyses: number;
  /** Cache hits */
  cacheHits: number;
  /** Average analysis time (ms) */
  avgAnalysisTimeMs: number;
  /** Total tokens used */
  totalTokensUsed: number;
  /** Sessions analyzed */
  sessionsAnalyzed: number;
}
