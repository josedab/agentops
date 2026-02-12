/**
 * Voice/Video Agent Observability Engine
 *
 * Tracks conversation sessions, turns, sentiment, quality, and analytics
 * for voice/video agent interactions.
 */

import { generateEventId, now } from "../utils.js";
import type {
  VoiceConfig,
  ResolvedVoiceConfig,
  ConversationSession,
  ConversationTurn,
  SentimentScore,
  ConversationMetricsSnapshot,
  ConversationQualityScore,
  QualityRubric,
  QualityDimension,
  ConversationAnalytics,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: ResolvedVoiceConfig = {
  enabled: true,
  trackSentiment: true,
  trackTurnTaking: true,
  debug: false,
};

const POSITIVE_WORDS = new Set([
  "thank",
  "great",
  "wonderful",
  "helpful",
  "excellent",
  "perfect",
  "appreciate",
  "love",
]);

const NEGATIVE_WORDS = new Set([
  "terrible",
  "awful",
  "frustrated",
  "angry",
  "hate",
  "useless",
  "bad",
  "horrible",
  "disappointed",
]);

const DEFAULT_RUBRIC: QualityRubric = {
  id: "default-rubric",
  name: "Default Conversation Quality Rubric",
  dimensions: [
    {
      name: "Response Time",
      weight: 0.25,
      scorer: "response_time",
      thresholds: { excellent: 2000, good: 5000, fair: 10000 },
    },
    {
      name: "Sentiment Trend",
      weight: 0.2,
      scorer: "sentiment_trend",
      thresholds: { excellent: 0.3, good: 0.0, fair: -0.3 },
    },
    {
      name: "Interruptions",
      weight: 0.15,
      scorer: "interruptions",
      thresholds: { excellent: 0, good: 2, fair: 5 },
    },
    {
      name: "Resolution",
      weight: 0.25,
      scorer: "resolution",
      thresholds: { excellent: 1, good: 0.5, fair: 0 },
    },
    {
      name: "Turns Efficiency",
      weight: 0.15,
      scorer: "turns_efficiency",
      thresholds: { excellent: 5, good: 10, fair: 20 },
    },
  ],
};

// ============================================================================
// Engine
// ============================================================================

export class VoiceObservabilityEngine {
  private readonly config: ResolvedVoiceConfig;
  private readonly conversations = new Map<string, ConversationSession>();

  constructor(config: VoiceConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  // --------------------------------------------------------------------------
  // Conversation lifecycle
  // --------------------------------------------------------------------------

  startConversation(options: {
    sessionId?: string;
    platform: string;
    metadata?: Record<string, unknown>;
  }): ConversationSession {
    const session: ConversationSession = {
      id: generateEventId(),
      sessionId: options.sessionId ?? generateEventId(),
      platform: options.platform,
      startTime: now(),
      endTime: null,
      turns: [],
      status: "active",
      metadata: options.metadata ?? {},
    };
    this.conversations.set(session.id, session);
    return session;
  }

  endConversation(
    conversationId: string,
    outcome?: { status?: string; taskCompleted?: boolean },
  ): ConversationSession {
    const session = this.conversations.get(conversationId);
    if (!session) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    session.endTime = now();
    if (outcome?.status === "escalated") {
      session.status = "escalated";
    } else if (outcome?.status === "dropped") {
      session.status = "dropped";
    } else {
      session.status = "completed";
    }
    if (outcome?.taskCompleted !== undefined) {
      session.metadata.taskCompleted = outcome.taskCompleted;
    }
    return session;
  }

  getConversation(id: string): ConversationSession | undefined {
    return this.conversations.get(id);
  }

  listConversations(filter?: {
    platform?: string;
    status?: string;
  }): ConversationSession[] {
    let results = Array.from(this.conversations.values());
    if (filter?.platform) {
      results = results.filter((c) => c.platform === filter.platform);
    }
    if (filter?.status) {
      results = results.filter((c) => c.status === filter.status);
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // Turn management
  // --------------------------------------------------------------------------

  addTurn(
    conversationId: string,
    turn: Omit<ConversationTurn, "id" | "silenceBeforeMs" | "wasInterrupted">,
  ): ConversationTurn {
    const session = this.conversations.get(conversationId);
    if (!session) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const previousTurn =
      session.turns.length > 0 ? session.turns[session.turns.length - 1] : null;

    const silenceBeforeMs = previousTurn
      ? Math.max(0, turn.startTime - previousTurn.endTime)
      : 0;

    const wasInterrupted = previousTurn
      ? turn.startTime < previousTurn.endTime
      : false;

    const completeTurn: ConversationTurn = {
      ...turn,
      id: generateEventId(),
      silenceBeforeMs,
      wasInterrupted,
    };

    // Auto-analyze sentiment if enabled and not provided
    if (this.config.trackSentiment && completeTurn.sentiment === null) {
      completeTurn.sentiment = this.analyzeSentiment(completeTurn.transcript);
    }

    session.turns.push(completeTurn);
    return completeTurn;
  }

  // --------------------------------------------------------------------------
  // Sentiment analysis
  // --------------------------------------------------------------------------

  analyzeSentiment(text: string): SentimentScore {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const totalWords = Math.max(words.length, 1);

    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of words) {
      // Strip common punctuation for matching
      const cleaned = word.replace(/[.,!?;:'"]/g, "");
      if (POSITIVE_WORDS.has(cleaned)) positiveCount++;
      if (NEGATIVE_WORDS.has(cleaned)) negativeCount++;
    }

    const rawScore = ((positiveCount - negativeCount) / totalWords) * 3;
    const value = Math.max(-1, Math.min(1, rawScore));

    let label: SentimentScore["label"];
    if (value <= -0.5) label = "very_negative";
    else if (value < -0.1) label = "negative";
    else if (value <= 0.1) label = "neutral";
    else if (value < 0.5) label = "positive";
    else label = "very_positive";

    const matchedWords = positiveCount + negativeCount;
    const confidence = Math.min(
      1,
      matchedWords / Math.max(totalWords, 1) + 0.3,
    );

    return { value, label, confidence };
  }

  // --------------------------------------------------------------------------
  // Metrics
  // --------------------------------------------------------------------------

  getConversationMetrics(conversationId: string): ConversationMetricsSnapshot {
    const session = this.conversations.get(conversationId);
    if (!session) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const turns = session.turns;
    const agentTurns = turns.filter((t) => t.speaker === "agent");
    const userTurns = turns.filter((t) => t.speaker === "user");

    const totalDurationMs =
      session.endTime !== null
        ? session.endTime - session.startTime
        : turns.length > 0
          ? turns[turns.length - 1].endTime - session.startTime
          : 0;

    const avgTurnDurationMs =
      turns.length > 0
        ? turns.reduce((sum, t) => sum + t.durationMs, 0) / turns.length
        : 0;

    const silences = turns
      .filter((t) => t.silenceBeforeMs > 0)
      .map((t) => t.silenceBeforeMs);
    const avgSilenceMs =
      silences.length > 0
        ? silences.reduce((a, b) => a + b, 0) / silences.length
        : 0;

    const interruptionCount = turns.filter((t) => t.wasInterrupted).length;

    const sentimentTrajectory = turns
      .filter((t) => t.sentiment !== null)
      .map((t) => t.sentiment!.value);

    const avgSentiment =
      sentimentTrajectory.length > 0
        ? sentimentTrajectory.reduce((a, b) => a + b, 0) /
          sentimentTrajectory.length
        : 0;

    // Response latency: time between user turn end and next agent turn start
    const responseTimes: number[] = [];
    for (let i = 1; i < turns.length; i++) {
      if (turns[i].speaker === "agent" && turns[i - 1].speaker === "user") {
        responseTimes.push(
          Math.max(0, turns[i].startTime - turns[i - 1].endTime),
        );
      }
    }

    const responseLatencyMs =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    const firstResponseLatencyMs =
      responseTimes.length > 0 ? responseTimes[0] : 0;

    const taskCompleted =
      session.metadata.taskCompleted !== undefined
        ? (session.metadata.taskCompleted as boolean)
        : null;

    const totalCost = turns.reduce((sum, t) => sum + t.cost, 0);

    return {
      sessionId: session.id,
      totalDurationMs,
      totalTurns: turns.length,
      agentTurns: agentTurns.length,
      userTurns: userTurns.length,
      avgTurnDurationMs,
      avgSilenceMs,
      interruptionCount,
      sentimentTrajectory,
      avgSentiment,
      wordErrorRate: null,
      responseLatencyMs,
      firstResponseLatencyMs,
      turnsToResolution: taskCompleted ? turns.length : null,
      taskCompleted,
      escalated: session.status === "escalated",
      totalCost,
    };
  }

  // --------------------------------------------------------------------------
  // Quality scoring
  // --------------------------------------------------------------------------

  scoreQuality(
    conversationId: string,
    rubric?: QualityRubric,
  ): ConversationQualityScore {
    const metrics = this.getConversationMetrics(conversationId);
    const activeRubric = rubric ?? DEFAULT_RUBRIC;

    const dimensions = activeRubric.dimensions.map((dim) => ({
      name: dim.name,
      score: this.scoreDimension(dim, metrics),
      weight: dim.weight,
    }));

    const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
    const overall =
      totalWeight > 0
        ? dimensions.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight
        : 0;

    let assessment: ConversationQualityScore["assessment"];
    if (overall >= 80) assessment = "excellent";
    else if (overall >= 60) assessment = "good";
    else if (overall >= 40) assessment = "fair";
    else assessment = "poor";

    return { overall, dimensions, assessment };
  }

  getDefaultRubric(): QualityRubric {
    return { ...DEFAULT_RUBRIC, dimensions: [...DEFAULT_RUBRIC.dimensions] };
  }

  // --------------------------------------------------------------------------
  // Analytics
  // --------------------------------------------------------------------------

  getAnalytics(
    periodStart?: number,
    periodEnd?: number,
  ): ConversationAnalytics {
    let sessions = Array.from(this.conversations.values());

    if (periodStart !== undefined) {
      sessions = sessions.filter((s) => s.startTime >= periodStart);
    }
    if (periodEnd !== undefined) {
      sessions = sessions.filter((s) => s.startTime <= periodEnd);
    }

    const totalConversations = sessions.length;
    if (totalConversations === 0) {
      return {
        totalConversations: 0,
        avgHandleTimeMs: 0,
        avgSentiment: 0,
        avgQualityScore: 0,
        firstCallResolutionRate: 0,
        escalationRate: 0,
        avgTurnsPerConversation: 0,
        avgCostPerConversation: 0,
        qualityByHour: [],
      };
    }

    const metricsAll = sessions.map((s) => this.getConversationMetrics(s.id));
    const qualityAll = sessions.map((s) => this.scoreQuality(s.id));

    const avgHandleTimeMs =
      metricsAll.reduce((s, m) => s + m.totalDurationMs, 0) /
      totalConversations;
    const avgSentiment =
      metricsAll.reduce((s, m) => s + m.avgSentiment, 0) / totalConversations;
    const avgQualityScore =
      qualityAll.reduce((s, q) => s + q.overall, 0) / totalConversations;

    const resolvedCount = sessions.filter(
      (s) => s.metadata.taskCompleted === true,
    ).length;
    const firstCallResolutionRate = resolvedCount / totalConversations;

    const escalatedCount = sessions.filter(
      (s) => s.status === "escalated",
    ).length;
    const escalationRate = escalatedCount / totalConversations;

    const avgTurnsPerConversation =
      metricsAll.reduce((s, m) => s + m.totalTurns, 0) / totalConversations;

    const avgCostPerConversation =
      metricsAll.reduce((s, m) => s + m.totalCost, 0) / totalConversations;

    // Quality by hour
    const hourMap = new Map<number, { total: number; count: number }>();
    for (let i = 0; i < sessions.length; i++) {
      const hour = new Date(sessions[i].startTime).getHours();
      const entry = hourMap.get(hour) ?? { total: 0, count: 0 };
      entry.total += qualityAll[i].overall;
      entry.count += 1;
      hourMap.set(hour, entry);
    }
    const qualityByHour = Array.from(hourMap.entries())
      .map(([hour, data]) => ({
        hour,
        avgQuality: data.total / data.count,
        count: data.count,
      }))
      .sort((a, b) => a.hour - b.hour);

    return {
      totalConversations,
      avgHandleTimeMs,
      avgSentiment,
      avgQualityScore,
      firstCallResolutionRate,
      escalationRate,
      avgTurnsPerConversation,
      avgCostPerConversation,
      qualityByHour,
    };
  }

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  reset(): void {
    this.conversations.clear();
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private scoreDimension(
    dim: QualityDimension,
    metrics: ConversationMetricsSnapshot,
  ): number {
    switch (dim.scorer) {
      case "response_time":
        return this.scoreThresholdInverse(
          metrics.responseLatencyMs,
          dim.thresholds,
        );
      case "sentiment_trend": {
        const traj = metrics.sentimentTrajectory;
        if (traj.length < 2) return 50;
        const trend = traj[traj.length - 1] - traj[0];
        return this.scoreThresholdDirect(trend, dim.thresholds);
      }
      case "interruptions":
        return this.scoreThresholdInverse(
          metrics.interruptionCount,
          dim.thresholds,
        );
      case "resolution":
        if (metrics.taskCompleted === true) return 100;
        if (metrics.taskCompleted === false) return 20;
        return 50;
      case "turns_efficiency":
        return this.scoreThresholdInverse(metrics.totalTurns, dim.thresholds);
      default:
        return 50;
    }
  }

  /** Lower value = better score (e.g., response time, interruptions) */
  private scoreThresholdInverse(
    value: number,
    thresholds: { excellent: number; good: number; fair: number },
  ): number {
    if (value <= thresholds.excellent) return 100;
    if (value <= thresholds.good) return 75;
    if (value <= thresholds.fair) return 50;
    return 25;
  }

  /** Higher value = better score (e.g., sentiment trend) */
  private scoreThresholdDirect(
    value: number,
    thresholds: { excellent: number; good: number; fair: number },
  ): number {
    if (value >= thresholds.excellent) return 100;
    if (value >= thresholds.good) return 75;
    if (value >= thresholds.fair) return 50;
    return 25;
  }
}
