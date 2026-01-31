/**
 * AgentOps SDK - AI Copilot for Debugging
 *
 * Natural language interface for investigating agent sessions,
 * understanding failures, and getting actionable recommendations.
 */

import { generateEventId, now } from "../utils.js";
import {
  CopilotConfig,
  ResolvedCopilotConfig,
  DebugQuery,
  AnalysisResult,
  Evidence,
  SessionSummary,
  RootCauseInsight,
  RootCauseCategory,
  Recommendation,
  Conversation,
  CopilotStats,
  CopilotError,
  CopilotErrorCode,
  TimeRange,
} from "./types.js";
import {
  VectorStore,
  VectorStoreConfig,
  EmbeddingGenerator,
  SimpleEmbeddingGenerator,
} from "./vector-store.js";
import type { AgentEvent, SessionStats } from "../types.js";

// ============================================================================
// Session Store Interface (for accessing session data)
// ============================================================================

export interface SessionData {
  sessionId: string;
  userId?: string;
  featureId?: string;
  model?: string;
  status: "active" | "completed" | "error";
  startTime: number;
  endTime?: number;
  events: AgentEvent[];
  stats: SessionStats;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface SessionStore {
  getSession(sessionId: string): Promise<SessionData | null>;
  getSessions(filter: SessionFilter): Promise<SessionData[]>;
  getRecentSessions(limit: number): Promise<SessionData[]>;
  getFailedSessions(timeRange?: TimeRange): Promise<SessionData[]>;
}

export interface SessionFilter {
  sessionIds?: string[];
  userId?: string;
  featureId?: string;
  model?: string;
  status?: "active" | "completed" | "error";
  timeRange?: TimeRange;
  tags?: string[];
  limit?: number;
}

// ============================================================================
// In-Memory Session Store (for SDK-side caching)
// ============================================================================

export class InMemorySessionStore implements SessionStore {
  private sessions: Map<string, SessionData> = new Map();
  private maxSessions: number;

  constructor(maxSessions: number = 1000) {
    this.maxSessions = maxSessions;
  }

  addSession(session: SessionData): void {
    if (this.sessions.size >= this.maxSessions) {
      // Remove oldest
      const oldest = this.findOldestSession();
      if (oldest) {
        this.sessions.delete(oldest);
      }
    }
    this.sessions.set(session.sessionId, session);
  }

  updateSession(sessionId: string, updates: Partial<SessionData>): void {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.sessions.set(sessionId, { ...existing, ...updates });
    }
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async getSessions(filter: SessionFilter): Promise<SessionData[]> {
    let results = Array.from(this.sessions.values());

    if (filter.sessionIds) {
      const idSet = new Set(filter.sessionIds);
      results = results.filter((s) => idSet.has(s.sessionId));
    }

    if (filter.userId) {
      results = results.filter((s) => s.userId === filter.userId);
    }

    if (filter.featureId) {
      results = results.filter((s) => s.featureId === filter.featureId);
    }

    if (filter.model) {
      results = results.filter((s) => s.model === filter.model);
    }

    if (filter.status) {
      results = results.filter((s) => s.status === filter.status);
    }

    if (filter.timeRange) {
      results = results.filter(
        (s) =>
          s.startTime >= filter.timeRange!.start &&
          s.startTime <= filter.timeRange!.end,
      );
    }

    if (filter.tags && filter.tags.length > 0) {
      const tagSet = new Set(filter.tags);
      results = results.filter((s) => s.tags?.some((t) => tagSet.has(t)));
    }

    // Sort by start time descending
    results.sort((a, b) => b.startTime - a.startTime);

    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async getRecentSessions(limit: number): Promise<SessionData[]> {
    return this.getSessions({ limit });
  }

  async getFailedSessions(timeRange?: TimeRange): Promise<SessionData[]> {
    return this.getSessions({ status: "error", timeRange });
  }

  clear(): void {
    this.sessions.clear();
  }

  private findOldestSession(): string | null {
    let oldest: SessionData | null = null;
    for (const session of this.sessions.values()) {
      if (!oldest || session.startTime < oldest.startTime) {
        oldest = session;
      }
    }
    return oldest?.sessionId ?? null;
  }
}

// ============================================================================
// Debug Copilot Implementation
// ============================================================================

const DEFAULT_CONFIG: ResolvedCopilotConfig = {
  enabled: true,
  provider: "openai",
  model: "gpt-4o-mini",
  maxResponseTokens: 2000,
  enableCache: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  maxSessionsPerQuery: 50,
};

export class DebugCopilot {
  private config: ResolvedCopilotConfig;
  private sessionStore: SessionStore;
  private vectorStore: VectorStore;
  private embeddingGenerator: EmbeddingGenerator;
  private conversations: Map<string, Conversation> = new Map();
  private cache: Map<string, { result: AnalysisResult; expiry: number }> =
    new Map();
  private stats: CopilotStats = {
    totalQueries: 0,
    successfulAnalyses: 0,
    failedAnalyses: 0,
    cacheHits: 0,
    avgAnalysisTimeMs: 0,
    totalTokensUsed: 0,
    sessionsAnalyzed: 0,
  };

  constructor(
    config: CopilotConfig,
    sessionStore?: SessionStore,
    vectorStoreConfig?: VectorStoreConfig,
    embeddingGenerator?: EmbeddingGenerator,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionStore = sessionStore ?? new InMemorySessionStore();
    this.vectorStore = new VectorStore(vectorStoreConfig);
    this.embeddingGenerator =
      embeddingGenerator ?? new SimpleEmbeddingGenerator();
  }

  /**
   * Ask a natural language question about agent sessions
   */
  async ask(query: DebugQuery): Promise<AnalysisResult> {
    if (!this.config.enabled) {
      throw this.createError("configuration_error", "Copilot is disabled");
    }

    const startTime = now();
    this.stats.totalQueries++;

    try {
      // Check cache
      const cacheKey = this.generateCacheKey(query);
      if (this.config.enableCache) {
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiry > now()) {
          this.stats.cacheHits++;
          return {
            ...cached.result,
            metadata: { ...cached.result.metadata, cacheHit: true },
          };
        }
      }

      // Get relevant sessions
      const sessions = await this.getRelevantSessions(query);
      if (sessions.length === 0) {
        return this.createNoDataResult(query, startTime);
      }

      // Analyze sessions
      const result = await this.analyzeWithLLM(query, sessions, startTime);

      // Cache result
      if (this.config.enableCache) {
        this.cache.set(cacheKey, {
          result,
          expiry: now() + this.config.cacheTtlMs,
        });
      }

      // Update conversation if part of one
      if (query.conversationId) {
        this.updateConversation(query.conversationId, query, result);
      }

      // Update stats
      this.stats.successfulAnalyses++;
      this.stats.sessionsAnalyzed += sessions.length;
      this.updateAvgAnalysisTime(result.metadata.analysisTimeMs);

      // Callback
      this.config.onAnalysisComplete?.(result);

      return result;
    } catch (error) {
      this.stats.failedAnalyses++;
      const copilotError = this.normalizeError(error);
      this.config.onError?.(copilotError);
      throw copilotError;
    }
  }

  /**
   * Start a new conversation for multi-turn debugging
   */
  startConversation(): string {
    const id = generateEventId();
    const conversation: Conversation = {
      id,
      messages: [],
      context: {
        referencedSessions: [],
        identifiedIssues: [],
        filters: {},
      },
      createdAt: now(),
      updatedAt: now(),
    };
    this.conversations.set(id, conversation);
    return id;
  }

  /**
   * Get conversation history
   */
  getConversation(conversationId: string): Conversation | null {
    return this.conversations.get(conversationId) ?? null;
  }

  /**
   * Find sessions similar to a given session
   */
  async findSimilarSessions(
    sessionId: string,
    limit: number = 5,
  ): Promise<SessionSummary[]> {
    const session = await this.sessionStore.getSession(sessionId);
    if (!session) return [];

    // Ensure session is embedded
    await this.ensureSessionEmbedded(session);

    // Find similar
    const similar = this.vectorStore.findSimilarToSession(sessionId, limit);
    return similar.map((s) => s.summary);
  }

  /**
   * Get quick diagnosis for a failed session
   */
  async diagnoseFailure(sessionId: string): Promise<RootCauseInsight | null> {
    const session = await this.sessionStore.getSession(sessionId);
    if (!session || session.status !== "error") return null;

    const errorEvents = session.events.filter((e) => e.type === "error");
    const toolFailures = session.events.filter(
      (e) => e.type === "tool_result" && (e as any).status === "error",
    );

    // Determine root cause category
    const category = this.categorizeFailure(session, errorEvents, toolFailures);

    return {
      category,
      explanation: this.generateFailureExplanation(
        category,
        session,
        errorEvents,
      ),
      confidence: this.calculateConfidence(category, errorEvents),
      contributingFactors: this.identifyContributingFactors(
        session,
        errorEvents,
      ),
      timeline: this.buildFailureTimeline(session),
    };
  }

  /**
   * Index a session for semantic search
   */
  async indexSession(session: SessionData): Promise<void> {
    await this.ensureSessionEmbedded(session);
  }

  /**
   * Get copilot statistics
   */
  getStats(): CopilotStats {
    return { ...this.stats };
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get the underlying session store (for adding sessions)
   */
  getSessionStore(): SessionStore {
    return this.sessionStore;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async getRelevantSessions(query: DebugQuery): Promise<SessionData[]> {
    // Build filter from query
    const filter: SessionFilter = {
      sessionIds: query.sessionIds,
      userId: query.filters?.userId,
      featureId: query.filters?.featureId,
      model: query.filters?.model,
      timeRange: query.timeRange,
      tags: query.filters?.tags,
      limit: this.config.maxSessionsPerQuery,
    };

    if (query.filters?.failedOnly) {
      filter.status = "error";
    }

    // Get sessions from store
    let sessions = await this.sessionStore.getSessions(filter);

    // If question seems to be about failures, prioritize failed sessions
    if (this.isFailureRelatedQuery(query.question)) {
      const failedSessions = sessions.filter((s) => s.status === "error");
      if (failedSessions.length > 0) {
        sessions = failedSessions;
      }
    }

    // Use semantic search to find most relevant
    if (sessions.length > 10) {
      sessions = await this.rankByRelevance(query.question, sessions);
    }

    return sessions;
  }

  private isFailureRelatedQuery(question: string): boolean {
    const failureKeywords = [
      "fail",
      "error",
      "crash",
      "wrong",
      "issue",
      "problem",
      "bug",
      "not working",
      "broken",
      "exception",
      "timeout",
      "slow",
    ];
    const lower = question.toLowerCase();
    return failureKeywords.some((kw) => lower.includes(kw));
  }

  private async rankByRelevance(
    question: string,
    sessions: SessionData[],
  ): Promise<SessionData[]> {
    // Embed the question
    const questionEmbedding = await this.embeddingGenerator.generate(question);

    // Ensure all sessions are embedded
    await Promise.all(sessions.map((s) => this.ensureSessionEmbedded(s)));

    // Find similar sessions
    const similar = this.vectorStore.findSimilar(
      questionEmbedding,
      this.config.maxSessionsPerQuery,
      [],
    );

    // Map back to session data
    const sessionMap = new Map(sessions.map((s) => [s.sessionId, s]));
    const ranked: SessionData[] = [];

    for (const sim of similar) {
      const session = sessionMap.get(sim.sessionId);
      if (session) {
        ranked.push(session);
      }
    }

    // Add any sessions not found via similarity
    for (const session of sessions) {
      if (!ranked.some((r) => r.sessionId === session.sessionId)) {
        ranked.push(session);
      }
    }

    return ranked.slice(0, this.config.maxSessionsPerQuery);
  }

  private async ensureSessionEmbedded(session: SessionData): Promise<void> {
    const existing = this.vectorStore.getEmbedding(session.sessionId);
    if (existing) return;

    const summary = this.summarizeSession(session);
    const embedding = await this.embeddingGenerator.generate(summary);

    this.vectorStore.addEmbedding({
      sessionId: session.sessionId,
      embedding,
      summary,
      metadata: {
        model: session.model ?? "unknown",
        status: session.status === "error" ? "error" : "success",
        cost: session.stats.totalCost,
        tokens: session.stats.totalTokens,
        timestamp: session.startTime,
      },
    });
  }

  private summarizeSession(session: SessionData): string {
    const parts: string[] = [];

    parts.push(`Session ${session.sessionId}`);
    if (session.featureId) parts.push(`Feature: ${session.featureId}`);
    if (session.model) parts.push(`Model: ${session.model}`);
    parts.push(`Status: ${session.status}`);
    parts.push(`Events: ${session.events.length}`);
    parts.push(`Tokens: ${session.stats.totalTokens}`);
    parts.push(`Cost: $${session.stats.totalCost.toFixed(4)}`);

    // Summarize errors
    const errors = session.events.filter((e) => e.type === "error");
    if (errors.length > 0) {
      parts.push(
        `Errors: ${errors.map((e) => (e as any).errorMessage).join(", ")}`,
      );
    }

    // Summarize tools used
    const tools = [
      ...new Set(
        session.events
          .filter((e) => e.type === "tool_call")
          .map((e) => (e as any).toolName),
      ),
    ];
    if (tools.length > 0) {
      parts.push(`Tools: ${tools.join(", ")}`);
    }

    return parts.join(". ");
  }

  private async analyzeWithLLM(
    query: DebugQuery,
    sessions: SessionData[],
    startTime: number,
  ): Promise<AnalysisResult> {
    // Build context for analysis
    const context = this.buildAnalysisContext(sessions);
    // Build prompt for future LLM integration
    void this.buildAnalysisPrompt(query.question, context);

    // For now, use rule-based analysis
    // Production: Call actual LLM API
    const analysis = this.performRuleBasedAnalysis(query, sessions);

    const analysisTimeMs = now() - startTime;

    return {
      id: generateEventId(),
      query,
      answer: analysis.answer,
      confidence: analysis.confidence,
      evidence: analysis.evidence,
      relatedSessions: sessions
        .slice(0, 5)
        .map((s) => this.sessionToSummary(s)),
      suggestedQuestions: this.generateFollowUpQuestions(query, analysis),
      rootCause: analysis.rootCause,
      recommendations: analysis.recommendations,
      metadata: {
        analysisTimeMs,
        sessionsAnalyzed: sessions.length,
        eventsProcessed: sessions.reduce((sum, s) => sum + s.events.length, 0),
        tokensUsed: 0, // Would be populated by actual LLM call
        cacheHit: false,
        modelUsed: this.config.model,
        timestamp: now(),
      },
    };
  }

  private buildAnalysisContext(sessions: SessionData[]): string {
    const lines: string[] = [];

    for (const session of sessions.slice(0, 10)) {
      lines.push(`--- Session ${session.sessionId} ---`);
      lines.push(`Status: ${session.status}`);
      lines.push(`Model: ${session.model}`);
      lines.push(`Duration: ${session.stats.durationMs}ms`);
      lines.push(`Tokens: ${session.stats.totalTokens}`);
      lines.push(`Cost: $${session.stats.totalCost.toFixed(4)}`);

      // Add event summaries
      for (const event of session.events.slice(0, 20)) {
        const time = new Date(event.timestamp).toISOString();
        switch (event.type) {
          case "prompt":
            lines.push(
              `[${time}] PROMPT: ${this.truncate((event as any).content, 100)}`,
            );
            break;
          case "response":
            lines.push(
              `[${time}] RESPONSE: ${this.truncate((event as any).content, 100)}`,
            );
            break;
          case "error":
            lines.push(`[${time}] ERROR: ${(event as any).errorMessage}`);
            break;
          case "tool_call":
            lines.push(`[${time}] TOOL_CALL: ${(event as any).toolName}`);
            break;
          case "tool_result":
            lines.push(
              `[${time}] TOOL_RESULT: ${(event as any).toolName} - ${(event as any).status}`,
            );
            break;
        }
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private buildAnalysisPrompt(question: string, context: string): string {
    return `You are an AI debugging assistant analyzing agent session traces.

User Question: ${question}

Session Data:
${context}

Provide a helpful, specific answer based on the session data. Include:
1. Direct answer to the question
2. Evidence from the sessions
3. Root cause if applicable
4. Recommendations for improvement`;
  }

  private performRuleBasedAnalysis(
    query: DebugQuery,
    sessions: SessionData[],
  ): {
    answer: string;
    confidence: number;
    evidence: Evidence[];
    rootCause?: RootCauseInsight;
    recommendations: Recommendation[];
  } {
    const evidence: Evidence[] = [];
    const recommendations: Recommendation[] = [];
    let answer = "";
    let confidence = 0.7;
    let rootCause: RootCauseInsight | undefined;

    const question = query.question.toLowerCase();

    // Analyze based on question type
    if (question.includes("fail") || question.includes("error")) {
      const result = this.analyzeFailures(sessions);
      answer = result.answer;
      evidence.push(...result.evidence);
      rootCause = result.rootCause;
      recommendations.push(...result.recommendations);
      confidence = result.confidence;
    } else if (question.includes("cost") || question.includes("expensive")) {
      const result = this.analyzeCosts(sessions);
      answer = result.answer;
      evidence.push(...result.evidence);
      recommendations.push(...result.recommendations);
      confidence = result.confidence;
    } else if (
      question.includes("slow") ||
      question.includes("latency") ||
      question.includes("performance")
    ) {
      const result = this.analyzePerformance(sessions);
      answer = result.answer;
      evidence.push(...result.evidence);
      recommendations.push(...result.recommendations);
      confidence = result.confidence;
    } else if (question.includes("tool")) {
      const result = this.analyzeTools(sessions);
      answer = result.answer;
      evidence.push(...result.evidence);
      recommendations.push(...result.recommendations);
      confidence = result.confidence;
    } else {
      // General analysis
      const result = this.generalAnalysis(sessions, question);
      answer = result.answer;
      evidence.push(...result.evidence);
      recommendations.push(...result.recommendations);
      confidence = result.confidence;
    }

    return { answer, confidence, evidence, rootCause, recommendations };
  }

  private analyzeFailures(sessions: SessionData[]): {
    answer: string;
    confidence: number;
    evidence: Evidence[];
    rootCause?: RootCauseInsight;
    recommendations: Recommendation[];
  } {
    const failedSessions = sessions.filter((s) => s.status === "error");
    const evidence: Evidence[] = [];
    const recommendations: Recommendation[] = [];

    if (failedSessions.length === 0) {
      return {
        answer: `No failed sessions found in the analyzed data. All ${sessions.length} sessions completed successfully.`,
        confidence: 0.9,
        evidence: [],
        recommendations: [],
      };
    }

    // Categorize errors
    const errorCategories: Record<string, number> = {};
    const errorExamples: Record<
      string,
      { sessionId: string; message: string }
    > = {};

    for (const session of failedSessions) {
      for (const event of session.events) {
        if (event.type === "error") {
          const errorType = (event as any).errorType || "unknown";
          errorCategories[errorType] = (errorCategories[errorType] || 0) + 1;
          if (!errorExamples[errorType]) {
            errorExamples[errorType] = {
              sessionId: session.sessionId,
              message: (event as any).errorMessage,
            };
          }
        }
      }
    }

    // Build answer
    const totalFailures = failedSessions.length;
    const failureRate = ((totalFailures / sessions.length) * 100).toFixed(1);

    let answer = `Found ${totalFailures} failed sessions out of ${sessions.length} analyzed (${failureRate}% failure rate).\n\n`;
    answer += `**Error Breakdown:**\n`;

    for (const [errorType, count] of Object.entries(errorCategories).sort(
      (a, b) => b[1] - a[1],
    )) {
      answer += `- ${errorType}: ${count} occurrences\n`;

      evidence.push({
        type: "error_log",
        sessionId: errorExamples[errorType].sessionId,
        description: `${errorType}: ${errorExamples[errorType].message}`,
        data: { errorType, count, example: errorExamples[errorType] },
        relevance: count / totalFailures,
      });
    }

    // Determine root cause
    const topError = Object.entries(errorCategories).sort(
      (a, b) => b[1] - a[1],
    )[0];
    const rootCause = this.categorizeErrorToRootCause(
      topError?.[0],
      failedSessions,
    );

    // Generate recommendations
    if (topError) {
      recommendations.push(
        ...this.generateErrorRecommendations(topError[0], failedSessions),
      );
    }

    return {
      answer,
      confidence: 0.85,
      evidence,
      rootCause,
      recommendations,
    };
  }

  private analyzeCosts(sessions: SessionData[]): {
    answer: string;
    confidence: number;
    evidence: Evidence[];
    recommendations: Recommendation[];
  } {
    const evidence: Evidence[] = [];
    const recommendations: Recommendation[] = [];

    const totalCost = sessions.reduce((sum, s) => sum + s.stats.totalCost, 0);
    const avgCost = totalCost / sessions.length;

    // Find high cost sessions
    const highCostThreshold = avgCost * 2;
    const highCostSessions = sessions.filter(
      (s) => s.stats.totalCost > highCostThreshold,
    );

    // Cost by model
    const costByModel: Record<string, { cost: number; sessions: number }> = {};
    for (const session of sessions) {
      const model = session.model ?? "unknown";
      if (!costByModel[model]) {
        costByModel[model] = { cost: 0, sessions: 0 };
      }
      costByModel[model].cost += session.stats.totalCost;
      costByModel[model].sessions++;
    }

    let answer = `**Cost Analysis for ${sessions.length} sessions:**\n\n`;
    answer += `- Total Cost: $${totalCost.toFixed(4)}\n`;
    answer += `- Average Cost per Session: $${avgCost.toFixed(4)}\n`;
    answer += `- High Cost Sessions (>$${highCostThreshold.toFixed(4)}): ${highCostSessions.length}\n\n`;

    answer += `**Cost by Model:**\n`;
    for (const [model, data] of Object.entries(costByModel).sort(
      (a, b) => b[1].cost - a[1].cost,
    )) {
      answer += `- ${model}: $${data.cost.toFixed(4)} (${data.sessions} sessions)\n`;

      evidence.push({
        type: "cost_anomaly",
        sessionId: sessions.find((s) => s.model === model)?.sessionId ?? "",
        description: `Model ${model} cost: $${data.cost.toFixed(4)}`,
        data: { model, ...data },
        relevance: data.cost / totalCost,
      });
    }

    // Recommendations
    if (highCostSessions.length > 0) {
      recommendations.push({
        id: generateEventId(),
        title: "Investigate High-Cost Sessions",
        description: `${highCostSessions.length} sessions have unusually high costs. Review these sessions for optimization opportunities.`,
        priority: "high",
        category: "cost_optimization",
        effort: "medium",
        expectedImpact: `Potential savings of up to $${highCostSessions.reduce((s, sess) => s + sess.stats.totalCost - avgCost, 0).toFixed(2)}`,
      });
    }

    return { answer, confidence: 0.9, evidence, recommendations };
  }

  private analyzePerformance(sessions: SessionData[]): {
    answer: string;
    confidence: number;
    evidence: Evidence[];
    recommendations: Recommendation[];
  } {
    const evidence: Evidence[] = [];
    const recommendations: Recommendation[] = [];

    const durations = sessions.map((s) => s.stats.durationMs);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p50 = this.percentile(durations, 50);
    const p95 = this.percentile(durations, 95);
    const p99 = this.percentile(durations, 99);

    // Find slow sessions
    const slowThreshold = p95;
    const slowSessions = sessions.filter(
      (s) => s.stats.durationMs > slowThreshold,
    );

    let answer = `**Performance Analysis for ${sessions.length} sessions:**\n\n`;
    answer += `- Average Duration: ${avgDuration.toFixed(0)}ms\n`;
    answer += `- P50 (Median): ${p50.toFixed(0)}ms\n`;
    answer += `- P95: ${p95.toFixed(0)}ms\n`;
    answer += `- P99: ${p99.toFixed(0)}ms\n`;
    answer += `- Slow Sessions (>${slowThreshold.toFixed(0)}ms): ${slowSessions.length}\n`;

    // Analyze slow sessions for patterns
    if (slowSessions.length > 0) {
      const slowByModel: Record<string, number> = {};
      for (const session of slowSessions) {
        const model = session.model ?? "unknown";
        slowByModel[model] = (slowByModel[model] || 0) + 1;
      }

      answer += `\n**Slow Sessions by Model:**\n`;
      for (const [model, count] of Object.entries(slowByModel)) {
        answer += `- ${model}: ${count}\n`;
        evidence.push({
          type: "latency_spike",
          sessionId:
            slowSessions.find((s) => s.model === model)?.sessionId ?? "",
          description: `${count} slow sessions using ${model}`,
          data: { model, count, avgDuration: avgDuration },
          relevance: count / slowSessions.length,
        });
      }

      recommendations.push({
        id: generateEventId(),
        title: "Optimize Slow Sessions",
        description: `${slowSessions.length} sessions exceed the P95 latency threshold of ${slowThreshold.toFixed(0)}ms.`,
        priority: "medium",
        category: "performance",
        effort: "medium",
        expectedImpact: `Reduce P95 latency by up to ${(((p95 - p50) / p95) * 100).toFixed(0)}%`,
      });
    }

    return { answer, confidence: 0.85, evidence, recommendations };
  }

  private analyzeTools(sessions: SessionData[]): {
    answer: string;
    confidence: number;
    evidence: Evidence[];
    recommendations: Recommendation[];
  } {
    const evidence: Evidence[] = [];
    const recommendations: Recommendation[] = [];

    const toolStats: Record<
      string,
      {
        calls: number;
        successes: number;
        failures: number;
        totalDuration: number;
      }
    > = {};

    for (const session of sessions) {
      for (const event of session.events) {
        if (event.type === "tool_call") {
          const toolName = (event as any).toolName;
          if (!toolStats[toolName]) {
            toolStats[toolName] = {
              calls: 0,
              successes: 0,
              failures: 0,
              totalDuration: 0,
            };
          }
          toolStats[toolName].calls++;
        }
        if (event.type === "tool_result") {
          const toolName = (event as any).toolName;
          const status = (event as any).status;
          const duration = (event as any).durationMs || 0;

          if (toolStats[toolName]) {
            if (status === "success") {
              toolStats[toolName].successes++;
            } else {
              toolStats[toolName].failures++;
            }
            toolStats[toolName].totalDuration += duration;
          }
        }
      }
    }

    let answer = `**Tool Usage Analysis across ${sessions.length} sessions:**\n\n`;

    for (const [tool, stats] of Object.entries(toolStats).sort(
      (a, b) => b[1].calls - a[1].calls,
    )) {
      const successRate =
        stats.calls > 0
          ? ((stats.successes / stats.calls) * 100).toFixed(1)
          : "N/A";
      const avgDuration =
        stats.calls > 0
          ? (stats.totalDuration / stats.calls).toFixed(0)
          : "N/A";

      answer += `**${tool}**\n`;
      answer += `- Calls: ${stats.calls}\n`;
      answer += `- Success Rate: ${successRate}%\n`;
      answer += `- Avg Duration: ${avgDuration}ms\n\n`;

      if (stats.failures > 0) {
        evidence.push({
          type: "tool_failure",
          sessionId:
            sessions.find((s) =>
              s.events.some(
                (e) =>
                  e.type === "tool_result" &&
                  (e as any).toolName === tool &&
                  (e as any).status === "error",
              ),
            )?.sessionId ?? "",
          description: `${tool} has ${stats.failures} failures (${((stats.failures / stats.calls) * 100).toFixed(1)}% failure rate)`,
          data: stats,
          relevance: stats.failures / stats.calls,
        });
      }
    }

    // Recommend fixing failing tools
    const failingTools = Object.entries(toolStats).filter(
      ([_, s]) => s.failures > 0,
    );
    if (failingTools.length > 0) {
      recommendations.push({
        id: generateEventId(),
        title: "Fix Failing Tools",
        description: `${failingTools.length} tools have failures: ${failingTools.map(([t]) => t).join(", ")}`,
        priority: "high",
        category: "tool_configuration",
        effort: "medium",
        expectedImpact: "Improve overall success rate by fixing tool failures",
      });
    }

    return { answer, confidence: 0.85, evidence, recommendations };
  }

  private generalAnalysis(
    sessions: SessionData[],
    _question: string,
  ): {
    answer: string;
    confidence: number;
    evidence: Evidence[];
    recommendations: Recommendation[];
  } {
    const evidence: Evidence[] = [];
    const recommendations: Recommendation[] = [];

    // Provide general statistics
    const successCount = sessions.filter(
      (s) => s.status === "completed",
    ).length;
    const errorCount = sessions.filter((s) => s.status === "error").length;
    const totalCost = sessions.reduce((sum, s) => sum + s.stats.totalCost, 0);
    const totalTokens = sessions.reduce(
      (sum, s) => sum + s.stats.totalTokens,
      0,
    );
    const avgDuration =
      sessions.reduce((sum, s) => sum + s.stats.durationMs, 0) /
      sessions.length;

    let answer = `**Analysis of ${sessions.length} sessions:**\n\n`;
    answer += `- Success Rate: ${((successCount / sessions.length) * 100).toFixed(1)}%\n`;
    answer += `- Error Rate: ${((errorCount / sessions.length) * 100).toFixed(1)}%\n`;
    answer += `- Total Cost: $${totalCost.toFixed(4)}\n`;
    answer += `- Total Tokens: ${totalTokens.toLocaleString()}\n`;
    answer += `- Average Duration: ${avgDuration.toFixed(0)}ms\n\n`;

    // Models used
    const models = [...new Set(sessions.map((s) => s.model).filter(Boolean))];
    answer += `**Models Used:** ${models.join(", ") || "Not specified"}\n\n`;

    // Features
    const features = [
      ...new Set(sessions.map((s) => s.featureId).filter(Boolean)),
    ];
    if (features.length > 0) {
      answer += `**Features:** ${features.join(", ")}\n`;
    }

    evidence.push({
      type: "session_trace",
      sessionId: sessions[0]?.sessionId ?? "",
      description: `Analyzed ${sessions.length} sessions`,
      data: { successCount, errorCount, totalCost, totalTokens },
      relevance: 1.0,
    });

    return { answer, confidence: 0.7, evidence, recommendations };
  }

  private categorizeFailure(
    session: SessionData,
    errorEvents: AgentEvent[],
    toolFailures: AgentEvent[],
  ): RootCauseCategory {
    if (toolFailures.length > 0) return "tool_failure";

    const errorMessages = errorEvents.map(
      (e) => (e as any).errorMessage?.toLowerCase() || "",
    );

    for (const msg of errorMessages) {
      if (msg.includes("rate limit")) return "rate_limit";
      if (msg.includes("timeout")) return "timeout";
      if (msg.includes("context") && msg.includes("length"))
        return "context_overflow";
      if (msg.includes("model")) return "model_limitation";
    }

    if (session.stats.totalTokens > 100000) return "context_overflow";

    return "unknown";
  }

  private generateFailureExplanation(
    category: RootCauseCategory,
    _session: SessionData,
    errorEvents: AgentEvent[],
  ): string {
    const explanations: Record<RootCauseCategory, string> = {
      prompt_issue:
        "The failure appears to be related to prompt formatting or content issues.",
      model_limitation:
        "The model may have encountered a limitation or unsupported request.",
      tool_failure: "One or more tool calls failed during the session.",
      context_overflow:
        "The session exceeded the model's context window limit.",
      rate_limit: "The request was rate limited by the API provider.",
      timeout: "The request timed out before completing.",
      data_quality: "Input data quality issues may have caused the failure.",
      configuration:
        "There may be a configuration issue with the agent or tools.",
      external_dependency: "An external service or dependency failed.",
      unknown: "The root cause could not be definitively determined.",
    };

    return (
      explanations[category] +
      (errorEvents.length > 0
        ? ` Error: ${(errorEvents[0] as any).errorMessage}`
        : "")
    );
  }

  private calculateConfidence(
    category: RootCauseCategory,
    errorEvents: AgentEvent[],
  ): number {
    if (category === "unknown") return 0.3;
    if (errorEvents.length === 0) return 0.5;
    return 0.8;
  }

  private identifyContributingFactors(
    session: SessionData,
    _errorEvents: AgentEvent[],
  ): { factor: string; impact: "high" | "medium" | "low"; evidence: string }[] {
    const factors: {
      factor: string;
      impact: "high" | "medium" | "low";
      evidence: string;
    }[] = [];

    if (session.stats.totalTokens > 50000) {
      factors.push({
        factor: "High token usage",
        impact: "medium",
        evidence: `Session used ${session.stats.totalTokens} tokens`,
      });
    }

    if (session.stats.durationMs > 30000) {
      factors.push({
        factor: "Long session duration",
        impact: "low",
        evidence: `Session lasted ${(session.stats.durationMs / 1000).toFixed(1)}s`,
      });
    }

    if (session.stats.toolCalls > 10) {
      factors.push({
        factor: "Many tool calls",
        impact: "medium",
        evidence: `Session made ${session.stats.toolCalls} tool calls`,
      });
    }

    return factors;
  }

  private buildFailureTimeline(session: SessionData): {
    timestamp: number;
    event: string;
    type: "normal" | "warning" | "error";
    details?: string;
  }[] {
    const timeline: {
      timestamp: number;
      event: string;
      type: "normal" | "warning" | "error";
      details?: string;
    }[] = [];

    for (const event of session.events) {
      let timelineEvent: (typeof timeline)[0] | null = null;

      switch (event.type) {
        case "session_start":
          timelineEvent = {
            timestamp: event.timestamp,
            event: "Session started",
            type: "normal",
          };
          break;
        case "prompt":
          timelineEvent = {
            timestamp: event.timestamp,
            event: "Prompt sent",
            type: "normal",
          };
          break;
        case "response":
          timelineEvent = {
            timestamp: event.timestamp,
            event: "Response received",
            type: "normal",
          };
          break;
        case "tool_call":
          timelineEvent = {
            timestamp: event.timestamp,
            event: `Tool called: ${(event as any).toolName}`,
            type: "normal",
          };
          break;
        case "tool_result":
          const status = (event as any).status;
          timelineEvent = {
            timestamp: event.timestamp,
            event: `Tool result: ${(event as any).toolName}`,
            type: status === "error" ? "error" : "normal",
            details:
              status === "error" ? (event as any).errorMessage : undefined,
          };
          break;
        case "error":
          timelineEvent = {
            timestamp: event.timestamp,
            event: "Error occurred",
            type: "error",
            details: (event as any).errorMessage,
          };
          break;
        case "session_end":
          const endStatus = (event as any).status;
          timelineEvent = {
            timestamp: event.timestamp,
            event: "Session ended",
            type: endStatus === "error" ? "error" : "normal",
          };
          break;
      }

      if (timelineEvent) {
        timeline.push(timelineEvent);
      }
    }

    return timeline;
  }

  private categorizeErrorToRootCause(
    errorType: string | undefined,
    _sessions: SessionData[],
  ): RootCauseInsight | undefined {
    if (!errorType) return undefined;

    const category = this.errorTypeToCategory(errorType);

    return {
      category,
      explanation: `The primary error type "${errorType}" suggests ${category.replace(/_/g, " ")} issues.`,
      confidence: 0.75,
      contributingFactors: [],
      timeline: [],
    };
  }

  private errorTypeToCategory(errorType: string): RootCauseCategory {
    const type = errorType.toLowerCase();
    if (type.includes("rate")) return "rate_limit";
    if (type.includes("timeout")) return "timeout";
    if (type.includes("context") || type.includes("token"))
      return "context_overflow";
    if (type.includes("tool")) return "tool_failure";
    if (type.includes("model")) return "model_limitation";
    return "unknown";
  }

  private generateErrorRecommendations(
    errorType: string,
    _sessions: SessionData[],
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const type = errorType.toLowerCase();

    if (type.includes("rate")) {
      recommendations.push({
        id: generateEventId(),
        title: "Implement Rate Limiting",
        description:
          "Add client-side rate limiting to avoid hitting API rate limits.",
        priority: "high",
        category: "reliability",
        effort: "small",
        expectedImpact: "Eliminate rate limit errors",
      });
    }

    if (type.includes("timeout")) {
      recommendations.push({
        id: generateEventId(),
        title: "Increase Timeout or Optimize",
        description:
          "Either increase timeout thresholds or optimize prompts to reduce processing time.",
        priority: "medium",
        category: "performance",
        effort: "medium",
        expectedImpact: "Reduce timeout failures",
      });
    }

    if (type.includes("context") || type.includes("token")) {
      recommendations.push({
        id: generateEventId(),
        title: "Optimize Context Usage",
        description:
          "Reduce prompt size or implement context window management to stay within limits.",
        priority: "high",
        category: "prompt_optimization",
        effort: "medium",
        expectedImpact: "Prevent context overflow errors",
      });
    }

    return recommendations;
  }

  private generateFollowUpQuestions(
    _query: DebugQuery,
    analysis: { answer: string; evidence: Evidence[] },
  ): string[] {
    const questions: string[] = [];

    if (analysis.evidence.some((e) => e.type === "error_log")) {
      questions.push("What are the common patterns in the failing sessions?");
      questions.push("Which users are most affected by these errors?");
    }

    if (analysis.evidence.some((e) => e.type === "cost_anomaly")) {
      questions.push("Which features have the highest cost per session?");
      questions.push("How can I reduce costs without impacting quality?");
    }

    if (analysis.evidence.some((e) => e.type === "tool_failure")) {
      questions.push("Which tools have the lowest success rate?");
      questions.push("What inputs cause the most tool failures?");
    }

    // Default suggestions
    if (questions.length === 0) {
      questions.push("What are the most common errors?");
      questions.push("Which sessions have the highest cost?");
      questions.push("What is the average latency trend?");
    }

    return questions.slice(0, 3);
  }

  private sessionToSummary(session: SessionData): SessionSummary {
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      featureId: session.featureId,
      model: session.model ?? "unknown",
      status: session.status === "error" ? "error" : "success",
      startTime: session.startTime,
      endTime: session.endTime,
      durationMs: session.stats.durationMs,
      totalCost: session.stats.totalCost,
      totalTokens: session.stats.totalTokens,
      eventCount: session.events.length,
      errorCount: session.stats.errors,
      relevanceScore: 1.0,
    };
  }

  private createNoDataResult(
    query: DebugQuery,
    startTime: number,
  ): AnalysisResult {
    return {
      id: generateEventId(),
      query,
      answer:
        "No sessions found matching your query. Try adjusting your filters or time range.",
      confidence: 1.0,
      evidence: [],
      relatedSessions: [],
      suggestedQuestions: [
        "Show me all recent sessions",
        "What sessions failed in the last hour?",
        "Which features have the most activity?",
      ],
      recommendations: [],
      metadata: {
        analysisTimeMs: now() - startTime,
        sessionsAnalyzed: 0,
        eventsProcessed: 0,
        tokensUsed: 0,
        cacheHit: false,
        modelUsed: this.config.model,
        timestamp: now(),
      },
    };
  }

  private updateConversation(
    conversationId: string,
    query: DebugQuery,
    result: AnalysisResult,
  ): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    conversation.messages.push({
      role: "user",
      content: query.question,
      timestamp: now(),
    });

    conversation.messages.push({
      role: "assistant",
      content: result.answer,
      timestamp: now(),
      analysisId: result.id,
    });

    // Update context
    for (const session of result.relatedSessions) {
      if (
        !conversation.context.referencedSessions.includes(session.sessionId)
      ) {
        conversation.context.referencedSessions.push(session.sessionId);
      }
    }

    if (result.rootCause) {
      conversation.context.identifiedIssues.push(result.rootCause.category);
    }

    conversation.updatedAt = now();
  }

  private generateCacheKey(query: DebugQuery): string {
    return JSON.stringify({
      question: query.question,
      sessionIds: query.sessionIds?.sort(),
      timeRange: query.timeRange,
      filters: query.filters,
    });
  }

  private updateAvgAnalysisTime(newTime: number): void {
    const total =
      this.stats.avgAnalysisTimeMs * (this.stats.successfulAnalyses - 1) +
      newTime;
    this.stats.avgAnalysisTimeMs = total / this.stats.successfulAnalyses;
  }

  private createError(
    code: CopilotErrorCode,
    message: string,
    details?: unknown,
  ): CopilotError {
    return {
      code,
      message,
      details,
      retryable: code === "rate_limit" || code === "timeout",
    };
  }

  private normalizeError(error: unknown): CopilotError {
    if (error && typeof error === "object" && "code" in error) {
      return error as CopilotError;
    }
    return this.createError(
      "analysis_failed",
      error instanceof Error ? error.message : "Unknown error",
      error,
    );
  }

  private truncate(text: unknown, maxLength: number): string {
    const str = typeof text === "string" ? text : JSON.stringify(text);
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + "...";
  }

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
