/**
 * AgentOps SDK
 *
 * AI-native observability for agent applications.
 *
 * @packageDocumentation
 */

// Main client
export { AgentOps } from "./client.js";

// Session tracking
export {
  TrackedSession,
  TrackedSession as Session,
  SessionContext,
} from "./session.js";

// Types
export type {
  // Configuration
  AgentOpsConfig,
  ResolvedConfig,

  // Events
  EventType,
  BaseEvent,
  SessionStartEvent,
  SessionEndEvent,
  PromptEvent,
  ResponseEvent,
  ToolCallEvent,
  ToolResultEvent,
  ErrorEvent,
  CustomEvent,
  AgentEvent,

  // Token & Cost
  TokenUsage,
  CostInfo,

  // Session
  SessionMetadata,
  SessionStats,

  // API
  BatchPayload,
  ApiResponse,
  ApiError,

  // Transport
  TransportConfig,
  FlushResult,
} from "./types.js";

// Utilities (for advanced use cases)
export {
  generateSessionId,
  generateEventId,
  serializeError,
  extractTokenUsage,
  extractModel,
  // Clock utilities for testing
  setClock,
  resetClock,
  systemClock,
} from "./utils.js";
export type { Clock } from "./utils.js";

// Content extractors (Strategy pattern for LLM response parsing)
export {
  ContentExtractorChain,
  OpenAIExtractor,
  AnthropicExtractor,
  CohereExtractor,
  SimpleTextExtractor,
  FallbackExtractor,
  defaultContentExtractor,
  extractContent,
} from "./extractors.js";
export type { ContentExtractor } from "./extractors.js";

// Pricing (re-exported from @agentops/shared)
export {
  calculateCost,
  getModelPricing,
  hasKnownPricing,
  MODEL_PRICING,
  DEFAULT_MODEL_PRICING,
  normalizeModelName,
} from "./pricing.js";
export type { ModelPricing } from "./pricing.js";

// Error classes (re-exported from @agentops/shared)
export {
  AgentOpsError,
  ConfigurationError,
  ValidationError,
  TransportError,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  CostLimitError,
  isAgentOpsError,
  wrapError,
} from "@agentops/shared";
export type { AgentOpsErrorCode } from "@agentops/shared";

// ============================================================================
// Feature Modules
// ============================================================================

// Quality Scoring
export { QualityEvaluator } from "./quality/index.js";
export type {
  QualityCriterion,
  QualityRubric,
  QualityScore,
  CriterionScore,
  QualityConfig,
  QualityStats,
} from "./quality/index.js";

// Multi-Agent Correlation
export { TraceManager, ContextPropagator } from "./correlation/index.js";
export type {
  TraceContext,
  SpanInfo,
  AgentInfo,
  CorrelationConfig,
  TraceStats,
} from "./correlation/index.js";

// Prompt Optimization Studio
export {
  PromptRegistry,
  ExperimentManager,
  TokenAnalyzer,
  VersionControlledRegistry,
  AdvancedExperimentManager,
} from "./prompts/index.js";
export type {
  PromptTemplate,
  PromptVersion,
  PromptExperiment,
  ExperimentVariant,
  VariantMetrics,
  ExperimentResults,
  TokenAnalysis,
  OptimizationSuggestion,
  // Enhanced Version Control
  PromptBranch,
  PromptTag,
  VersionDiff,
  VersionedPrompt,
  PromptCommit,
  MergeResult,
  // Advanced A/B Testing
  AdvancedExperimentConfig,
  ExtendedVariantMetrics,
  PowerAnalysis,
  BayesianAnalysis,
  ExtendedExperimentResults,
} from "./prompts/index.js";

// Anomaly Detection
export { AnomalyDetector } from "./anomaly/index.js";
export type {
  Anomaly,
  AnomalyType,
  AnomalySeverity,
  AnomalyDetectionConfig,
  MetricSnapshot,
  MetricTimeSeries,
} from "./anomaly/index.js";

// Replay & Simulation
export { ReplayEngine } from "./replay/index.js";
export type {
  CapturedSession,
  CapturedEvent,
  ReplayConfig,
  ReplayResult,
  SimulationScenario,
  TestCase,
} from "./replay/index.js";

// Context Window Analyzer
export { ContextWindowAnalyzer } from "./context/index.js";
export type {
  ContextSegment,
  ContextAnalysis,
  ContextSuggestion,
  ContextOverflowEvent,
  ContextConfig,
} from "./context/index.js";

// Team Collaboration
export { CollaborationHub, AnnotationManager } from "./collaboration/index.js";
export type {
  Investigation,
  Annotation,
  Comment,
  TeamMember,
  ShareableLink,
  CollaborationConfig,
  AnnotationConfig,
  EnhancedAnnotation,
  AnnotationAuthor,
  Mention,
  AnnotationAttachment,
  AnnotationReply,
  AnnotationReaction,
  Resolution,
  AnnotationFilter,
  AnnotationStats,
  SharedInsight,
} from "./collaboration/index.js";

// Compliance & Audit
export { ComplianceManager } from "./compliance/index.js";
export type {
  PIIType,
  PIIScanResult,
  AuditLogEntry,
  CompliancePolicy,
  PolicyViolation,
  ComplianceConfig,
} from "./compliance/index.js";

// Budget & Forecasting
export { BudgetManager } from "./budget/index.js";
export type {
  Budget,
  BudgetAlert,
  CostForecast,
  CostRecord,
  CostSummary,
  BudgetConfig,
} from "./budget/index.js";

// Cost Optimization
export { CostOptimizer } from "./cost/index.js";
export type {
  CostOptimizerConfig,
  OptimizationStrategy,
  CostAnalysis,
  CostRecommendation,
  CostSimulation,
  WasteAnalysis,
  EfficiencyMetrics,
  UsageRecord,
  RealizedSavings,
} from "./cost/index.js";

// Root Cause Analysis
export { RootCauseAnalyzer } from "./rca/index.js";
export type {
  RCAConfig,
  FailureEvent,
  FailurePattern,
  PatternType,
  RootCauseAnalysis,
  RootCause,
  CauseCategory,
  Remediation,
  RemediationType,
  RCAReport,
} from "./rca/index.js";

// Predictive Alerting
export { PredictiveAlertingEngine } from "./alerting/index.js";
export type {
  PredictiveAlertingConfig,
  MetricDataPoint,
  MetricSeries,
  MetricType,
  Prediction,
  ForecastPoint,
  SeasonalPattern,
  PredictiveAlert,
  AlertType,
  AlertRemediation,
  AlertRule,
  AlertCondition,
} from "./alerting/index.js";

// Multi-Agent Orchestration
export { MultiAgentTracer } from "./multiagent/index.js";
export type {
  MultiAgentConfig,
  Agent,
  AgentType,
  AgentSession,
  OrchestrationType,
  MultiAgentEvent,
  AgentHandoff,
  SharedContext,
  ConflictEvent,
  ConflictType,
  ConflictResolution,
  OrchestrationMetrics,
  AgentCommunication,
  InteractionGraph,
  TimelineEntry,
} from "./multiagent/index.js";

// IDE Integration
export { IDEIntegrationService } from "./ide/index.js";
export type {
  IDEIntegrationConfig,
  InlineAnnotation,
  SessionLink,
  CostEstimate,
  CostSuggestion,
  PromptHover,
  DiagnosticInfo,
  QuickFix,
  CodeEdit,
} from "./ide/index.js";

// Benchmark Marketplace
export { BenchmarkMarketplace } from "./benchmark/index.js";
export type {
  BenchmarkConfig,
  Benchmark,
  BenchmarkCategory,
  BenchmarkAuthor,
  Dataset,
  DatasetSample,
  EvaluationCriterion,
  BenchmarkStats,
  BenchmarkRun,
  RunResult,
  RunMetrics,
  LeaderboardEntry,
  Rubric,
  RubricCriterion,
  ScoringScale,
} from "./benchmark/index.js";

// AI Copilot for Debugging
export {
  DebugCopilot,
  InMemorySessionStore,
  VectorStore,
  SimpleEmbeddingGenerator,
  OpenAIEmbeddingGenerator,
} from "./copilot/index.js";
export type {
  CopilotConfig,
  ResolvedCopilotConfig,
  DebugQuery,
  TimeRange,
  QueryFilters,
  AnalysisResult,
  Evidence,
  EvidenceType,
  SessionSummary,
  RootCauseInsight,
  RootCauseCategory,
  Recommendation,
  RecommendationCategory,
  AnalysisMetadata,
  Conversation,
  ConversationMessage,
  ConversationContext,
  SessionEmbedding,
  SimilarSession,
  CopilotError,
  CopilotErrorCode,
  CopilotStats,
  SessionData,
  SessionStore,
  SessionFilter,
  VectorStoreConfig,
  EmbeddingGenerator,
} from "./copilot/index.js";

// Semantic Diff for Agent Behavior
export {
  SemanticDiffEngine,
  InMemoryDiffSessionStore,
} from "./semantic-diff/index.js";
export type {
  SemanticDiffConfig,
  ResolvedSemanticDiffConfig,
  Cohort,
  CohortType,
  CohortFilter,
  CohortSession,
  CohortStats,
  ComparisonRequest,
  MetricType as DiffMetricType,
  DimensionType,
  DiffResult,
  DiffSummary,
  MetricDiff,
  DimensionalDiff,
  DimensionalBreakdown,
  BehavioralChange,
  BehavioralChangeType,
  BehavioralEvidence,
  StatisticalAnalysis,
  StatisticalTest,
  SignificantChange,
  DiffRecommendation,
  DiffRecommendationCategory,
  VersionMarker,
  VersionType,
  DeploymentMarker,
  PromptVersionMarker,
  DiffSessionStore,
} from "./semantic-diff/index.js";

// Cost Guardrails
export {
  CostGuardrailsEngine,
  createGuardrailMiddleware,
} from "./guardrails/index.js";
export type {
  GuardrailsConfig,
  ResolvedGuardrailsConfig,
  GuardrailAction,
  CostLimit,
  LimitType,
  SessionLimit,
  UserLimit,
  FeatureLimit,
  ModelLimit,
  GlobalLimit,
  LimitConfig,
  SessionLimitConfig,
  UserLimitConfig,
  FeatureLimitConfig,
  ModelLimitConfig,
  GuardrailWarning,
  GuardrailEnforcement,
  LimitUpdate,
  CostCheckRequest,
  CostCheckResult,
  CostRecord as GuardrailCostRecord,
  SpendingSummary,
  AdaptiveLimitConfig,
  AdaptiveLimitResult,
  GuardrailStats,
  GuardrailMiddlewareOptions,
} from "./guardrails/index.js";

// Streaming Traces (Real-time WebSocket)
export { StreamingClient, StreamingTransport } from "./streaming/index.js";
export { StreamingError } from "./streaming/index.js";
export type {
  StreamingConfig,
  ResolvedStreamingConfig,
  StreamingEvent,
  StreamingEventType,
  StreamingEventData,
  StreamingFilters,
  StreamingErrorCode,
  ConnectionState,
  ConnectionInfo,
  StreamingHandlers,
  Subscription,
  TokenChunkMessage,
} from "./streaming/index.js";

// Prompt Regression Testing
export {
  TestRunner,
  parseTestSuiteYaml,
  generateTestSuiteYaml,
  EXAMPLE_TEST_SUITE_YAML,
  GitHubReporter,
  generateWorkflow,
  generateTestConfig,
} from "./regression/index.js";
export type {
  TestCase as RegressionTestCase,
  TestSuite,
  TestResult,
  TestRun,
  TestRunSummary,
  TestAssertion,
  TestBaseline,
  RegressionTestConfig,
  TestRunnerOptions,
  GitHubReporterOptions,
  GitHubContext,
  WorkflowOptions,
} from "./regression/index.js";

// Natural Language Alert Configuration
export {
  // Parser
  NLAlertParser,
  // Rule Engine
  NLRuleEngine,
  // Feedback System
  FeedbackCollector,
  // Example queries
  EXAMPLE_QUERIES,
  // Types
  type ParsedAlertRule,
  type AlertRuleConfig,
  type MetricSpec,
  type MetricType as NLMetricType,
  type ConditionSpec,
  type FilterSpec,
  type NotificationSpec,
  type Ambiguity,
  type ParseMetadata,
  type ExtractedEntity,
  type NLAlertParserConfig,
  type LLMProvider,
  type MetricDefinition,
  type KnownEntities,
  type AlertFeedback,
  type RuleEffectiveness,
  type NLRuleEngineConfig,
  type ManagedAlertRule,
  type RuleStats,
  type CreateRuleResult,
  type FeedbackSystemConfig,
  type RuleSuggestion,
  type FeedbackAnalysis,
  type FeedbackMetrics,
  type FeedbackPattern,
  type ParseCorrection,
  type ParserImprovement,
} from "./nl-alerts/index.js";

// ============================================================================
// Singleton API
// ============================================================================

import { AgentOps } from "./client.js";
import type { AgentOpsConfig, SessionMetadata, AgentEvent } from "./types.js";
import type { TrackedSession } from "./session.js";

let defaultClient: AgentOps | null = null;

/**
 * Initialize the default AgentOps client.
 *
 * @example
 * ```typescript
 * import { init, wrap, startSession } from '@agentops/sdk';
 *
 * // Initialize once at startup
 * init({ apiKey: process.env.AGENTOPS_API_KEY });
 *
 * // Then use convenience functions
 * const client = wrap(yourLLMClient);
 * const session = startSession({ userId: 'user123' });
 * ```
 */
export function init(config: AgentOpsConfig): AgentOps {
  defaultClient = new AgentOps(config);
  return defaultClient;
}

/**
 * Get the default AgentOps client.
 *
 * @throws Error if init() hasn't been called
 */
export function getClient(): AgentOps {
  if (!defaultClient) {
    throw new Error(
      'AgentOps not initialized. Call init({ apiKey: "..." }) first, ' +
        'or create an instance with new AgentOps({ apiKey: "..." })',
    );
  }
  return defaultClient;
}

/**
 * Wrap an LLM client for automatic instrumentation using the default client.
 */
export function wrap<T extends object>(
  client: T,
  metadata?: SessionMetadata,
): T {
  return getClient().wrap(client, metadata);
}

/**
 * Start a new session using the default client.
 */
export function startSession(metadata?: SessionMetadata): TrackedSession {
  return getClient().startSession(metadata);
}

/**
 * Track a custom event using the default client.
 */
export function trackEvent(
  event: Omit<AgentEvent, "eventId" | "timestamp">,
): void {
  getClient().trackEvent(event);
}

/**
 * Flush events using the default client.
 */
export async function flush(): Promise<void> {
  await getClient().flush();
}

/**
 * Shutdown the default client.
 */
export async function shutdown(): Promise<void> {
  if (defaultClient) {
    await defaultClient.shutdown();
    defaultClient = null;
  }
}
