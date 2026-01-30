/**
 * AgentOps SDK - Session Replay Engine
 *
 * Replay captured sessions with modified prompts or models.
 */

import type {
  CapturedSession,
  CapturedEvent,
  ReplayConfig,
  ReplayResult,
  ReplayComparison,
  EventComparison,
  PromptModification,
  CapturedPrompt,
  CapturedResponse,
} from "./types.js";
import { generateSessionId, generateEventId, now, sleep } from "../utils.js";

export class ReplayEngine {
  private capturedSessions: Map<string, CapturedSession> = new Map();

  /**
   * Capture a session for later replay
   */
  captureSession(session: CapturedSession): void {
    this.capturedSessions.set(session.sessionId, session);
  }

  /**
   * Get a captured session
   */
  getSession(sessionId: string): CapturedSession | undefined {
    return this.capturedSessions.get(sessionId);
  }

  /**
   * List all captured sessions
   */
  listSessions(): CapturedSession[] {
    return Array.from(this.capturedSessions.values());
  }

  /**
   * Replay a session with optional modifications
   */
  async replay(
    sessionId: string,
    config: ReplayConfig,
    llmClient?: {
      complete: (
        messages: Array<{ role: string; content: string }>,
        model: string,
      ) => Promise<{
        content: string;
        tokens?: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
        model: string;
        latencyMs: number;
      }>;
    },
  ): Promise<ReplayResult> {
    const session = this.capturedSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const startTime = now();
    const replaySessionId =
      config.mode === "live" ? generateSessionId() : undefined;
    const eventComparisons: EventComparison[] = [];
    const replayEvents: CapturedEvent[] = [];

    try {
      for (let i = 0; i < session.events.length; i++) {
        const originalEvent = session.events[i];

        // Emit original event
        if (config.onEvent) {
          config.onEvent(originalEvent, true);
        }

        // Calculate delay for realistic replay
        if (config.speed && config.speed > 0 && i > 0) {
          const timeDiff =
            originalEvent.timestamp - session.events[i - 1].timestamp;
          const delay = timeDiff / config.speed;
          if (delay > 0 && delay < 60000) {
            await sleep(delay);
          }
        }

        // Handle replay based on event type
        if (originalEvent.type === "prompt") {
          const modifiedPrompt = this.applyModifications(
            originalEvent.data as CapturedPrompt,
            config.promptModifications || [],
          );

          if (config.mode === "live" && llmClient) {
            // Find the corresponding response
            const responseEvent = session.events.find(
              (e) =>
                e.type === "response" &&
                e.parentEventId === originalEvent.eventId,
            );

            if (responseEvent) {
              // Build message history
              const messages = this.buildMessages(session.events, i);
              messages[messages.length - 1].content = modifiedPrompt.content;

              // Call the LLM
              const model =
                config.overrideModel || modifiedPrompt.model || "gpt-4";
              const result = await llmClient.complete(messages, model);

              // Create replay event
              const replayResponse: CapturedEvent = {
                eventId: generateEventId(),
                parentEventId: originalEvent.eventId,
                type: "response",
                timestamp: now(),
                durationMs: result.latencyMs,
                data: {
                  content: result.content,
                  model: result.model,
                  tokens: result.tokens,
                } as CapturedResponse,
              };

              replayEvents.push(replayResponse);

              // Compare
              const comparison = this.compareResponses(
                responseEvent.data as CapturedResponse,
                replayResponse.data as CapturedResponse,
              );
              eventComparisons.push({
                originalEventId: responseEvent.eventId,
                replayEventId: replayResponse.eventId,
                type: "response",
                outputsMatch: comparison.similarity > 0.9,
                similarity: comparison.similarity,
                differences: comparison.differences,
              });

              if (config.onEvent) {
                config.onEvent(replayResponse, false);
              }
            }
          }
        }
      }

      const endTime = now();
      const comparison = this.calculateOverallComparison(
        session,
        replayEvents,
        eventComparisons,
      );

      const result: ReplayResult = {
        originalSessionId: sessionId,
        replaySessionId,
        startTime,
        endTime,
        success: true,
        comparison,
        eventComparisons,
      };

      if (config.onComplete) {
        config.onComplete(result);
      }

      return result;
    } catch (error) {
      const endTime = now();

      return {
        originalSessionId: sessionId,
        replaySessionId,
        startTime,
        endTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        comparison: {
          tokenDifferencePercent: 0,
          costDifferencePercent: 0,
          latencyDifferencePercent: 0,
          outputSimilarity: 0,
        },
        eventComparisons,
      };
    }
  }

  /**
   * Export a session for sharing
   */
  exportSession(sessionId: string): string | null {
    const session = this.capturedSessions.get(sessionId);
    if (!session) return null;
    return JSON.stringify(session, null, 2);
  }

  /**
   * Import a session from JSON
   */
  importSession(json: string): CapturedSession {
    const session = JSON.parse(json) as CapturedSession;
    this.capturedSessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Delete a captured session
   */
  deleteSession(sessionId: string): boolean {
    return this.capturedSessions.delete(sessionId);
  }

  private applyModifications(
    prompt: CapturedPrompt,
    modifications: PromptModification[],
  ): CapturedPrompt {
    let content = prompt.content;

    for (const mod of modifications) {
      if (mod.target !== "all" && mod.target !== prompt.role) {
        continue;
      }

      switch (mod.type) {
        case "replace":
          if (mod.pattern) {
            content = content.split(mod.pattern).join(mod.replacement);
          }
          break;

        case "prepend":
          content = mod.replacement + content;
          break;

        case "append":
          content = content + mod.replacement;
          break;

        case "regex":
          if (mod.pattern) {
            content = content.replace(
              new RegExp(mod.pattern, "g"),
              mod.replacement,
            );
          }
          break;
      }
    }

    return { ...prompt, content };
  }

  private buildMessages(
    events: CapturedEvent[],
    upToIndex: number,
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    for (let i = 0; i <= upToIndex; i++) {
      const event = events[i];
      if (event.type === "prompt") {
        const prompt = event.data as CapturedPrompt;
        messages.push({ role: prompt.role, content: prompt.content });
      } else if (event.type === "response") {
        const response = event.data as CapturedResponse;
        messages.push({ role: "assistant", content: response.content });
      }
    }

    return messages;
  }

  private compareResponses(
    original: CapturedResponse,
    replay: CapturedResponse,
  ): { similarity: number; differences: string[] } {
    const differences: string[] = [];

    // Calculate text similarity (simple Jaccard similarity)
    const originalWords = new Set(original.content.toLowerCase().split(/\s+/));
    const replayWords = new Set(replay.content.toLowerCase().split(/\s+/));
    const intersection = new Set(
      [...originalWords].filter((w) => replayWords.has(w)),
    );
    const union = new Set([...originalWords, ...replayWords]);
    const similarity = union.size > 0 ? intersection.size / union.size : 0;

    // Find specific differences
    if (original.model !== replay.model) {
      differences.push(`Model changed: ${original.model} → ${replay.model}`);
    }

    if (original.tokens && replay.tokens) {
      const tokenDiff = replay.tokens.totalTokens - original.tokens.totalTokens;
      if (Math.abs(tokenDiff) > original.tokens.totalTokens * 0.1) {
        differences.push(
          `Token count changed: ${original.tokens.totalTokens} → ${replay.tokens.totalTokens}`,
        );
      }
    }

    if (similarity < 0.8) {
      differences.push("Significant content difference detected");
    }

    return { similarity, differences };
  }

  private calculateOverallComparison(
    original: CapturedSession,
    replayEvents: CapturedEvent[],
    eventComparisons: EventComparison[],
  ): ReplayComparison {
    // Calculate aggregate metrics
    const originalTokens = original.totalTokens || 0;
    const replayTokens = replayEvents
      .filter((e) => e.type === "response")
      .reduce((sum, e) => {
        const data = e.data as CapturedResponse;
        return sum + (data.tokens?.totalTokens || 0);
      }, 0);

    const originalDuration = original.events
      .filter((e) => e.type === "response")
      .reduce((sum, e) => sum + (e.durationMs || 0), 0);

    const replayDuration = replayEvents
      .filter((e) => e.type === "response")
      .reduce((sum, e) => sum + (e.durationMs || 0), 0);

    const avgSimilarity =
      eventComparisons.length > 0
        ? eventComparisons.reduce((sum, c) => sum + c.similarity, 0) /
          eventComparisons.length
        : 0;

    return {
      tokenDifferencePercent:
        originalTokens > 0
          ? ((replayTokens - originalTokens) / originalTokens) * 100
          : 0,
      costDifferencePercent: 0, // Would need pricing data
      latencyDifferencePercent:
        originalDuration > 0
          ? ((replayDuration - originalDuration) / originalDuration) * 100
          : 0,
      outputSimilarity: avgSimilarity,
    };
  }

  // =========================================================================
  // Extended Replay Features (Feature 5)
  // =========================================================================

  /**
   * Batch replay multiple sessions with the same config
   */
  async batchReplay(
    sessionIds: string[],
    config: ReplayConfig,
    llmClient?: {
      complete: (
        messages: Array<{ role: string; content: string }>,
        model: string,
      ) => Promise<{
        content: string;
        tokens?: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
        model: string;
        latencyMs: number;
      }>;
    },
  ): Promise<BatchReplayResult> {
    const results: ReplayResult[] = [];
    const errors: Array<{ sessionId: string; error: string }> = [];
    const startTime = now();

    for (const sessionId of sessionIds) {
      try {
        const result = await this.replay(sessionId, config, llmClient);
        results.push(result);
      } catch (error) {
        errors.push({
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successfulResults = results.filter((r) => r.success);

    return {
      totalSessions: sessionIds.length,
      successCount: successfulResults.length,
      errorCount: errors.length,
      results,
      errors,
      aggregateMetrics: this.calculateAggregateMetrics(successfulResults),
      startTime,
      endTime: now(),
    };
  }

  /**
   * A/B comparison - replay with two different configs
   */
  async compareConfigs(
    sessionId: string,
    configA: ReplayConfig,
    configB: ReplayConfig,
    llmClient?: {
      complete: (
        messages: Array<{ role: string; content: string }>,
        model: string,
      ) => Promise<{
        content: string;
        tokens?: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
        model: string;
        latencyMs: number;
      }>;
    },
  ): Promise<ConfigComparisonResult> {
    const [resultA, resultB] = await Promise.all([
      this.replay(sessionId, configA, llmClient),
      this.replay(sessionId, configB, llmClient),
    ]);

    return {
      sessionId,
      configA: { config: configA, result: resultA },
      configB: { config: configB, result: resultB },
      comparison: {
        tokenDelta:
          resultB.comparison.tokenDifferencePercent -
          resultA.comparison.tokenDifferencePercent,
        latencyDelta:
          resultB.comparison.latencyDifferencePercent -
          resultA.comparison.latencyDifferencePercent,
        similarityDelta:
          resultB.comparison.outputSimilarity -
          resultA.comparison.outputSimilarity,
        winner: this.determineWinner(resultA, resultB),
        recommendation: this.generateRecommendation(resultA, resultB),
      },
    };
  }

  /**
   * Create a replay template for reuse
   */
  createTemplate(
    name: string,
    config: ReplayConfig,
    description?: string,
  ): ReplayTemplate {
    const template: ReplayTemplate = {
      id: generateEventId(),
      name,
      description,
      config,
      createdAt: now(),
    };

    this.templates.set(template.id, template);
    return template;
  }

  /**
   * Get a replay template
   */
  getTemplate(id: string): ReplayTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * List all templates
   */
  listTemplates(): ReplayTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Apply template to replay
   */
  async applyTemplate(
    templateId: string,
    sessionId: string,
    llmClient?: {
      complete: (
        messages: Array<{ role: string; content: string }>,
        model: string,
      ) => Promise<{
        content: string;
        tokens?: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
        model: string;
        latencyMs: number;
      }>;
    },
  ): Promise<ReplayResult> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    return this.replay(sessionId, template.config, llmClient);
  }

  private templates: Map<string, ReplayTemplate> = new Map();

  private calculateAggregateMetrics(results: ReplayResult[]): AggregateMetrics {
    if (results.length === 0) {
      return {
        avgTokenDifference: 0,
        avgLatencyDifference: 0,
        avgSimilarity: 0,
        successRate: 0,
      };
    }

    const totalTokenDiff = results.reduce(
      (sum, r) => sum + r.comparison.tokenDifferencePercent,
      0,
    );
    const totalLatencyDiff = results.reduce(
      (sum, r) => sum + r.comparison.latencyDifferencePercent,
      0,
    );
    const totalSimilarity = results.reduce(
      (sum, r) => sum + r.comparison.outputSimilarity,
      0,
    );

    return {
      avgTokenDifference: totalTokenDiff / results.length,
      avgLatencyDifference: totalLatencyDiff / results.length,
      avgSimilarity: totalSimilarity / results.length,
      successRate:
        (results.filter((r) => r.success).length / results.length) * 100,
    };
  }

  private determineWinner(
    resultA: ReplayResult,
    resultB: ReplayResult,
  ): "A" | "B" | "tie" {
    let scoreA = 0;
    let scoreB = 0;

    // Better similarity wins
    if (
      resultA.comparison.outputSimilarity > resultB.comparison.outputSimilarity
    ) {
      scoreA++;
    } else if (
      resultB.comparison.outputSimilarity > resultA.comparison.outputSimilarity
    ) {
      scoreB++;
    }

    // Lower token usage wins (if similar quality)
    if (
      resultA.comparison.tokenDifferencePercent <
      resultB.comparison.tokenDifferencePercent
    ) {
      scoreA++;
    } else if (
      resultB.comparison.tokenDifferencePercent <
      resultA.comparison.tokenDifferencePercent
    ) {
      scoreB++;
    }

    // Lower latency wins
    if (
      resultA.comparison.latencyDifferencePercent <
      resultB.comparison.latencyDifferencePercent
    ) {
      scoreA++;
    } else if (
      resultB.comparison.latencyDifferencePercent <
      resultA.comparison.latencyDifferencePercent
    ) {
      scoreB++;
    }

    if (scoreA > scoreB) return "A";
    if (scoreB > scoreA) return "B";
    return "tie";
  }

  private generateRecommendation(
    resultA: ReplayResult,
    resultB: ReplayResult,
  ): string {
    const winner = this.determineWinner(resultA, resultB);

    if (winner === "tie") {
      return "Both configurations perform similarly. Choose based on other factors.";
    }

    const winnerResult = winner === "A" ? resultA : resultB;
    const reasons: string[] = [];

    if (winnerResult.comparison.outputSimilarity > 0.9) {
      reasons.push("maintains high output quality");
    }
    if (winnerResult.comparison.tokenDifferencePercent < 0) {
      reasons.push("reduces token usage");
    }
    if (winnerResult.comparison.latencyDifferencePercent < 0) {
      reasons.push("improves latency");
    }

    return `Configuration ${winner} is recommended${reasons.length > 0 ? ` because it ${reasons.join(" and ")}` : ""}.`;
  }
}

// Extended types for Feature 5
export interface BatchReplayResult {
  totalSessions: number;
  successCount: number;
  errorCount: number;
  results: ReplayResult[];
  errors: Array<{ sessionId: string; error: string }>;
  aggregateMetrics: AggregateMetrics;
  startTime: number;
  endTime: number;
}

export interface AggregateMetrics {
  avgTokenDifference: number;
  avgLatencyDifference: number;
  avgSimilarity: number;
  successRate: number;
}

export interface ConfigComparisonResult {
  sessionId: string;
  configA: { config: ReplayConfig; result: ReplayResult };
  configB: { config: ReplayConfig; result: ReplayResult };
  comparison: {
    tokenDelta: number;
    latencyDelta: number;
    similarityDelta: number;
    winner: "A" | "B" | "tie";
    recommendation: string;
  };
}

export interface ReplayTemplate {
  id: string;
  name: string;
  description?: string;
  config: ReplayConfig;
  createdAt: number;
}
