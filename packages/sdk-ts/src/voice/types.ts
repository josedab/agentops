/**
 * Voice/Video Agent Observability - Type Definitions
 */

// ============================================================================
// Configuration
// ============================================================================

export interface VoiceConfig {
  enabled?: boolean;
  trackSentiment?: boolean;
  trackTurnTaking?: boolean;
  debug?: boolean;
}

export interface ResolvedVoiceConfig {
  enabled: boolean;
  trackSentiment: boolean;
  trackTurnTaking: boolean;
  debug: boolean;
}

// ============================================================================
// Conversation Session
// ============================================================================

export interface ConversationSession {
  id: string;
  sessionId: string;
  platform: string;
  startTime: number;
  endTime: number | null;
  turns: ConversationTurn[];
  status: "active" | "completed" | "dropped" | "escalated";
  metadata: Record<string, unknown>;
}

// ============================================================================
// Conversation Turn
// ============================================================================

export interface ConversationTurn {
  id: string;
  speaker: "agent" | "user";
  startTime: number;
  endTime: number;
  durationMs: number;
  transcript: string;
  sentiment: SentimentScore | null;
  silenceBeforeMs: number;
  wasInterrupted: boolean;
  tokens: number;
  cost: number;
}

// ============================================================================
// Sentiment
// ============================================================================

export interface SentimentScore {
  value: number;
  label:
    | "very_negative"
    | "negative"
    | "neutral"
    | "positive"
    | "very_positive";
  confidence: number;
}

// ============================================================================
// Metrics
// ============================================================================

export interface ConversationMetricsSnapshot {
  sessionId: string;
  totalDurationMs: number;
  totalTurns: number;
  agentTurns: number;
  userTurns: number;
  avgTurnDurationMs: number;
  avgSilenceMs: number;
  interruptionCount: number;
  sentimentTrajectory: number[];
  avgSentiment: number;
  wordErrorRate: number | null;
  responseLatencyMs: number;
  firstResponseLatencyMs: number;
  turnsToResolution: number | null;
  taskCompleted: boolean | null;
  escalated: boolean;
  totalCost: number;
}

// ============================================================================
// Quality Scoring
// ============================================================================

export interface ConversationQualityScore {
  overall: number;
  dimensions: { name: string; score: number; weight: number }[];
  assessment: "excellent" | "good" | "fair" | "poor";
}

export interface QualityRubric {
  id: string;
  name: string;
  dimensions: QualityDimension[];
}

export interface QualityDimension {
  name: string;
  weight: number;
  scorer:
    | "response_time"
    | "sentiment_trend"
    | "interruptions"
    | "resolution"
    | "turns_efficiency";
  thresholds: { excellent: number; good: number; fair: number };
}

// ============================================================================
// Analytics
// ============================================================================

export interface ConversationAnalytics {
  totalConversations: number;
  avgHandleTimeMs: number;
  avgSentiment: number;
  avgQualityScore: number;
  firstCallResolutionRate: number;
  escalationRate: number;
  avgTurnsPerConversation: number;
  avgCostPerConversation: number;
  qualityByHour: { hour: number; avgQuality: number; count: number }[];
}
