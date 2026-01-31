/**
 * AgentOps SDK - AI Copilot for Debugging
 *
 * Natural language interface for investigating agent sessions.
 *
 * @packageDocumentation
 */

export { DebugCopilot, InMemorySessionStore } from "./copilot.js";
export type { SessionData, SessionStore, SessionFilter } from "./copilot.js";

export {
  VectorStore,
  SimpleEmbeddingGenerator,
  OpenAIEmbeddingGenerator,
} from "./vector-store.js";
export type { VectorStoreConfig, EmbeddingGenerator } from "./vector-store.js";

export type {
  // Configuration
  CopilotConfig,
  ResolvedCopilotConfig,

  // Queries
  DebugQuery,
  TimeRange,
  QueryFilters,

  // Results
  AnalysisResult,
  Evidence,
  EvidenceType,
  SessionSummary,
  RootCauseInsight,
  RootCauseCategory,
  Recommendation,
  RecommendationCategory,
  AnalysisMetadata,

  // Conversations
  Conversation,
  ConversationMessage,
  ConversationContext,

  // Embeddings
  SessionEmbedding,
  SimilarSession,

  // Errors
  CopilotError,
  CopilotErrorCode,

  // Stats
  CopilotStats,
} from "./types.js";
