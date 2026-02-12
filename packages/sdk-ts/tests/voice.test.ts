import { describe, it, expect, beforeEach } from "vitest";
import { VoiceObservabilityEngine } from "../src/voice/index.js";
import type {
  ConversationSession,
  ConversationTurn,
  VoiceQualityRubric,
} from "../src/voice/index.js";

describe("VoiceObservabilityEngine", () => {
  let engine: VoiceObservabilityEngine;

  beforeEach(() => {
    engine = new VoiceObservabilityEngine({
      enabled: true,
      trackSentiment: true,
      trackTurnTaking: true,
    });
  });

  // --------------------------------------------------------------------------
  // Conversation lifecycle
  // --------------------------------------------------------------------------
  describe("startConversation", () => {
    it("should create a new conversation session", () => {
      const session = engine.startConversation({ platform: "twilio" });

      expect(session.id).toBeDefined();
      expect(session.sessionId).toBeDefined();
      expect(session.platform).toBe("twilio");
      expect(session.status).toBe("active");
      expect(session.turns).toEqual([]);
      expect(session.endTime).toBeNull();
      expect(session.startTime).toBeGreaterThan(0);
    });

    it("should accept custom sessionId and metadata", () => {
      const session = engine.startConversation({
        sessionId: "custom-sess-1",
        platform: "webrtc",
        metadata: { userId: "u1", department: "support" },
      });

      expect(session.sessionId).toBe("custom-sess-1");
      expect(session.platform).toBe("webrtc");
      expect(session.metadata).toEqual({ userId: "u1", department: "support" });
    });
  });

  describe("endConversation", () => {
    it("should mark conversation as completed", () => {
      const session = engine.startConversation({ platform: "twilio" });
      const ended = engine.endConversation(session.id);

      expect(ended.status).toBe("completed");
      expect(ended.endTime).toBeGreaterThan(0);
    });

    it("should mark conversation as escalated", () => {
      const session = engine.startConversation({ platform: "twilio" });
      const ended = engine.endConversation(session.id, { status: "escalated" });

      expect(ended.status).toBe("escalated");
    });

    it("should mark conversation as dropped", () => {
      const session = engine.startConversation({ platform: "twilio" });
      const ended = engine.endConversation(session.id, { status: "dropped" });

      expect(ended.status).toBe("dropped");
    });

    it("should record taskCompleted in metadata", () => {
      const session = engine.startConversation({ platform: "twilio" });
      const ended = engine.endConversation(session.id, {
        taskCompleted: true,
      });

      expect(ended.metadata.taskCompleted).toBe(true);
    });

    it("should throw for unknown conversation", () => {
      expect(() => engine.endConversation("nonexistent")).toThrow(
        "Conversation not found",
      );
    });
  });

  describe("getConversation", () => {
    it("should return a conversation by id", () => {
      const session = engine.startConversation({ platform: "vonage" });
      const found = engine.getConversation(session.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(session.id);
    });

    it("should return undefined for unknown id", () => {
      expect(engine.getConversation("nope")).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Turn management
  // --------------------------------------------------------------------------
  describe("addTurn", () => {
    let session: ConversationSession;

    beforeEach(() => {
      session = engine.startConversation({ platform: "twilio" });
    });

    it("should add a turn with auto-calculated silence", () => {
      const t1 = engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 3000,
        durationMs: 2000,
        transcript: "Hello, I need help.",
        sentiment: null,
        tokens: 5,
        cost: 0.001,
      });

      expect(t1.id).toBeDefined();
      expect(t1.silenceBeforeMs).toBe(0); // first turn
      expect(t1.wasInterrupted).toBe(false);

      const t2 = engine.addTurn(session.id, {
        speaker: "agent",
        startTime: 3500,
        endTime: 6000,
        durationMs: 2500,
        transcript: "Hello! I'd be happy to help.",
        sentiment: null,
        tokens: 8,
        cost: 0.002,
      });

      expect(t2.silenceBeforeMs).toBe(500); // 3500 - 3000
      expect(t2.wasInterrupted).toBe(false);
    });

    it("should detect interruption when turn starts before previous ends", () => {
      engine.addTurn(session.id, {
        speaker: "agent",
        startTime: 1000,
        endTime: 5000,
        durationMs: 4000,
        transcript: "Let me explain the process...",
        sentiment: null,
        tokens: 10,
        cost: 0.003,
      });

      const t2 = engine.addTurn(session.id, {
        speaker: "user",
        startTime: 4000, // starts before agent ends at 5000
        endTime: 6000,
        durationMs: 2000,
        transcript: "Wait, I already know that.",
        sentiment: null,
        tokens: 6,
        cost: 0.001,
      });

      expect(t2.wasInterrupted).toBe(true);
      expect(t2.silenceBeforeMs).toBe(0); // no silence on interruption
    });

    it("should auto-analyze sentiment when trackSentiment is enabled", () => {
      const turn = engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 3000,
        durationMs: 2000,
        transcript: "This is great and wonderful service!",
        sentiment: null,
        tokens: 7,
        cost: 0.001,
      });

      expect(turn.sentiment).toBeDefined();
      expect(turn.sentiment!.value).toBeGreaterThan(0);
      expect(turn.sentiment!.label).toMatch(/positive/);
    });

    it("should throw for unknown conversation", () => {
      expect(() =>
        engine.addTurn("nonexistent", {
          speaker: "user",
          startTime: 1000,
          endTime: 2000,
          durationMs: 1000,
          transcript: "test",
          sentiment: null,
          tokens: 1,
          cost: 0,
        }),
      ).toThrow("Conversation not found");
    });
  });

  // --------------------------------------------------------------------------
  // Sentiment analysis
  // --------------------------------------------------------------------------
  describe("analyzeSentiment", () => {
    it("should return positive sentiment for positive text", () => {
      const result = engine.analyzeSentiment(
        "Thank you so much, this is excellent!",
      );

      expect(result.value).toBeGreaterThan(0);
      expect(result.label).toMatch(/positive/);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("should return negative sentiment for negative text", () => {
      const result = engine.analyzeSentiment(
        "This is terrible and awful, I'm frustrated!",
      );

      expect(result.value).toBeLessThan(0);
      expect(result.label).toMatch(/negative/);
    });

    it("should return neutral sentiment for neutral text", () => {
      const result = engine.analyzeSentiment(
        "I would like to check my account balance.",
      );

      expect(result.label).toBe("neutral");
    });

    it("should handle mixed sentiment", () => {
      const result = engine.analyzeSentiment(
        "The service was great but the wait was terrible.",
      );

      // Mixed: one positive, one negative → near neutral
      expect(result.value).toBeGreaterThanOrEqual(-1);
      expect(result.value).toBeLessThanOrEqual(1);
    });

    it("should handle empty text", () => {
      const result = engine.analyzeSentiment("");

      expect(result.label).toBe("neutral");
      expect(result.value).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Conversation metrics
  // --------------------------------------------------------------------------
  describe("getConversationMetrics", () => {
    it("should calculate basic metrics", () => {
      const session = engine.startConversation({ platform: "twilio" });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 3000,
        durationMs: 2000,
        transcript: "Hi, I need help with my bill.",
        sentiment: null,
        tokens: 8,
        cost: 0.002,
      });

      engine.addTurn(session.id, {
        speaker: "agent",
        startTime: 3500,
        endTime: 7000,
        durationMs: 3500,
        transcript: "I'd be happy to help with your bill.",
        sentiment: null,
        tokens: 9,
        cost: 0.003,
      });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 7200,
        endTime: 9000,
        durationMs: 1800,
        transcript: "Thank you, that's great!",
        sentiment: null,
        tokens: 5,
        cost: 0.001,
      });

      engine.endConversation(session.id, { taskCompleted: true });

      const metrics = engine.getConversationMetrics(session.id);

      expect(metrics.totalTurns).toBe(3);
      expect(metrics.agentTurns).toBe(1);
      expect(metrics.userTurns).toBe(2);
      expect(metrics.avgTurnDurationMs).toBeCloseTo(2433.33, 0);
      expect(metrics.interruptionCount).toBe(0);
      expect(metrics.taskCompleted).toBe(true);
      expect(metrics.escalated).toBe(false);
      expect(metrics.totalCost).toBeCloseTo(0.006);
    });

    it("should calculate silence between turns", () => {
      const session = engine.startConversation({ platform: "webrtc" });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 3000,
        durationMs: 2000,
        transcript: "Hello",
        sentiment: null,
        tokens: 1,
        cost: 0,
      });

      engine.addTurn(session.id, {
        speaker: "agent",
        startTime: 5000, // 2s silence
        endTime: 7000,
        durationMs: 2000,
        transcript: "Hi there",
        sentiment: null,
        tokens: 2,
        cost: 0,
      });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 8000, // 1s silence
        endTime: 10000,
        durationMs: 2000,
        transcript: "Question",
        sentiment: null,
        tokens: 1,
        cost: 0,
      });

      const metrics = engine.getConversationMetrics(session.id);

      // Two silences: 2000ms and 1000ms, avg = 1500ms
      expect(metrics.avgSilenceMs).toBe(1500);
    });

    it("should count interruptions", () => {
      const session = engine.startConversation({ platform: "twilio" });

      engine.addTurn(session.id, {
        speaker: "agent",
        startTime: 1000,
        endTime: 5000,
        durationMs: 4000,
        transcript: "Let me walk you through the process step by step.",
        sentiment: null,
        tokens: 10,
        cost: 0.003,
      });

      // User interrupts
      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 4000,
        endTime: 6000,
        durationMs: 2000,
        transcript: "Wait, skip that.",
        sentiment: null,
        tokens: 3,
        cost: 0.001,
      });

      const metrics = engine.getConversationMetrics(session.id);

      expect(metrics.interruptionCount).toBe(1);
    });

    it("should calculate response latency", () => {
      const session = engine.startConversation({ platform: "twilio" });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 3000,
        durationMs: 2000,
        transcript: "Help me",
        sentiment: null,
        tokens: 2,
        cost: 0,
      });

      engine.addTurn(session.id, {
        speaker: "agent",
        startTime: 4000, // 1s after user
        endTime: 6000,
        durationMs: 2000,
        transcript: "Sure thing",
        sentiment: null,
        tokens: 2,
        cost: 0,
      });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 6500,
        endTime: 8000,
        durationMs: 1500,
        transcript: "Another question",
        sentiment: null,
        tokens: 2,
        cost: 0,
      });

      engine.addTurn(session.id, {
        speaker: "agent",
        startTime: 10000, // 2s after user
        endTime: 12000,
        durationMs: 2000,
        transcript: "Here's the answer",
        sentiment: null,
        tokens: 3,
        cost: 0,
      });

      const metrics = engine.getConversationMetrics(session.id);

      // Two response latencies: 1000ms and 2000ms, avg = 1500ms
      expect(metrics.responseLatencyMs).toBe(1500);
      expect(metrics.firstResponseLatencyMs).toBe(1000);
    });

    it("should track sentiment trajectory", () => {
      const session = engine.startConversation({ platform: "twilio" });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 3000,
        durationMs: 2000,
        transcript: "I'm frustrated with this terrible service.",
        sentiment: null,
        tokens: 7,
        cost: 0.001,
      });

      engine.addTurn(session.id, {
        speaker: "agent",
        startTime: 3500,
        endTime: 6000,
        durationMs: 2500,
        transcript: "I appreciate your patience. Let me help.",
        sentiment: null,
        tokens: 8,
        cost: 0.002,
      });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 6500,
        endTime: 8000,
        durationMs: 1500,
        transcript: "Thank you, that's wonderful and helpful!",
        sentiment: null,
        tokens: 7,
        cost: 0.001,
      });

      const metrics = engine.getConversationMetrics(session.id);

      expect(metrics.sentimentTrajectory.length).toBe(3);
      // First turn should be negative, last should be positive
      expect(metrics.sentimentTrajectory[0]).toBeLessThan(0);
      expect(
        metrics.sentimentTrajectory[metrics.sentimentTrajectory.length - 1],
      ).toBeGreaterThan(0);
    });

    it("should track first response latency", () => {
      const session = engine.startConversation({ platform: "twilio" });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 3000,
        durationMs: 2000,
        transcript: "Hello",
        sentiment: null,
        tokens: 1,
        cost: 0,
      });

      engine.addTurn(session.id, {
        speaker: "agent",
        startTime: 5500, // 2.5s latency
        endTime: 7000,
        durationMs: 1500,
        transcript: "Welcome",
        sentiment: null,
        tokens: 1,
        cost: 0,
      });

      const metrics = engine.getConversationMetrics(session.id);

      expect(metrics.firstResponseLatencyMs).toBe(2500);
    });

    it("should track escalation status", () => {
      const session = engine.startConversation({ platform: "twilio" });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        transcript: "I want a manager",
        sentiment: null,
        tokens: 4,
        cost: 0,
      });

      engine.endConversation(session.id, { status: "escalated" });

      const metrics = engine.getConversationMetrics(session.id);

      expect(metrics.escalated).toBe(true);
    });

    it("should throw for unknown conversation", () => {
      expect(() => engine.getConversationMetrics("nonexistent")).toThrow(
        "Conversation not found",
      );
    });
  });

  // --------------------------------------------------------------------------
  // Quality scoring
  // --------------------------------------------------------------------------
  describe("scoreQuality", () => {
    it("should score quality with default rubric", () => {
      const session = engine.startConversation({ platform: "twilio" });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 3000,
        durationMs: 2000,
        transcript: "I need help",
        sentiment: null,
        tokens: 3,
        cost: 0.001,
      });

      engine.addTurn(session.id, {
        speaker: "agent",
        startTime: 3500, // fast response < 2s
        endTime: 6000,
        durationMs: 2500,
        transcript: "Absolutely! Let me help you right away.",
        sentiment: null,
        tokens: 8,
        cost: 0.002,
      });

      engine.endConversation(session.id, { taskCompleted: true });

      const quality = engine.scoreQuality(session.id);

      expect(quality.overall).toBeGreaterThan(0);
      expect(quality.overall).toBeLessThanOrEqual(100);
      expect(quality.dimensions.length).toBeGreaterThan(0);
      expect(["excellent", "good", "fair", "poor"]).toContain(
        quality.assessment,
      );
    });

    it("should score quality with custom rubric", () => {
      const session = engine.startConversation({ platform: "twilio" });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 3000,
        durationMs: 2000,
        transcript: "Help please",
        sentiment: null,
        tokens: 2,
        cost: 0,
      });

      engine.addTurn(session.id, {
        speaker: "agent",
        startTime: 3200,
        endTime: 5000,
        durationMs: 1800,
        transcript: "Of course!",
        sentiment: null,
        tokens: 2,
        cost: 0,
      });

      engine.endConversation(session.id, { taskCompleted: true });

      const customRubric: VoiceQualityRubric = {
        id: "custom",
        name: "Custom Rubric",
        dimensions: [
          {
            name: "Speed",
            weight: 0.5,
            scorer: "response_time",
            thresholds: { excellent: 1000, good: 3000, fair: 5000 },
          },
          {
            name: "Resolution",
            weight: 0.5,
            scorer: "resolution",
            thresholds: { excellent: 1, good: 0.5, fair: 0 },
          },
        ],
      };

      const quality = engine.scoreQuality(session.id, customRubric);

      expect(quality.dimensions.length).toBe(2);
      expect(quality.dimensions[0].name).toBe("Speed");
      expect(quality.dimensions[1].name).toBe("Resolution");
      // Fast response + task completed = high score
      expect(quality.overall).toBeGreaterThanOrEqual(75);
    });

    it("should return poor assessment for bad conversations", () => {
      const session = engine.startConversation({ platform: "twilio" });

      // Many turns, slow responses, negative sentiment
      for (let i = 0; i < 15; i++) {
        engine.addTurn(session.id, {
          speaker: i % 2 === 0 ? "user" : "agent",
          startTime: i * 15000,
          endTime: i * 15000 + 5000,
          durationMs: 5000,
          transcript:
            i % 2 === 0
              ? "This is terrible and frustrating!"
              : "I understand. Let me check that for you.",
          sentiment: null,
          tokens: 8,
          cost: 0.003,
        });
      }

      engine.endConversation(session.id, { taskCompleted: false });

      const quality = engine.scoreQuality(session.id);

      expect(quality.assessment).toMatch(/fair|poor/);
    });
  });

  describe("getDefaultRubric", () => {
    it("should return the default quality rubric", () => {
      const rubric = engine.getDefaultRubric();

      expect(rubric.id).toBe("default-rubric");
      expect(rubric.dimensions.length).toBe(5);
      expect(rubric.dimensions.map((d) => d.scorer)).toEqual([
        "response_time",
        "sentiment_trend",
        "interruptions",
        "resolution",
        "turns_efficiency",
      ]);
    });
  });

  // --------------------------------------------------------------------------
  // Analytics
  // --------------------------------------------------------------------------
  describe("getAnalytics", () => {
    it("should aggregate analytics across conversations", () => {
      // Create multiple conversations
      const s1 = engine.startConversation({ platform: "twilio" });
      engine.addTurn(s1.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 3000,
        durationMs: 2000,
        transcript: "Help me please",
        sentiment: null,
        tokens: 3,
        cost: 0.01,
      });
      engine.addTurn(s1.id, {
        speaker: "agent",
        startTime: 3500,
        endTime: 6000,
        durationMs: 2500,
        transcript: "Sure, I can help!",
        sentiment: null,
        tokens: 5,
        cost: 0.02,
      });
      engine.endConversation(s1.id, { taskCompleted: true });

      const s2 = engine.startConversation({ platform: "vonage" });
      engine.addTurn(s2.id, {
        speaker: "user",
        startTime: 2000,
        endTime: 4000,
        durationMs: 2000,
        transcript: "I have a question",
        sentiment: null,
        tokens: 4,
        cost: 0.005,
      });
      engine.addTurn(s2.id, {
        speaker: "agent",
        startTime: 5000,
        endTime: 8000,
        durationMs: 3000,
        transcript: "Let me look into that",
        sentiment: null,
        tokens: 5,
        cost: 0.015,
      });
      engine.endConversation(s2.id, { taskCompleted: false });

      const analytics = engine.getAnalytics();

      expect(analytics.totalConversations).toBe(2);
      expect(analytics.avgTurnsPerConversation).toBe(2);
      expect(analytics.firstCallResolutionRate).toBe(0.5);
      expect(analytics.escalationRate).toBe(0);
      expect(analytics.avgCostPerConversation).toBeGreaterThan(0);
    });

    it("should track escalation rate", () => {
      const s1 = engine.startConversation({ platform: "twilio" });
      engine.addTurn(s1.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        transcript: "Help",
        sentiment: null,
        tokens: 1,
        cost: 0,
      });
      engine.endConversation(s1.id, { status: "escalated" });

      const s2 = engine.startConversation({ platform: "twilio" });
      engine.addTurn(s2.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        transcript: "Help",
        sentiment: null,
        tokens: 1,
        cost: 0,
      });
      engine.endConversation(s2.id, { taskCompleted: true });

      const analytics = engine.getAnalytics();

      expect(analytics.escalationRate).toBe(0.5);
    });

    it("should return empty analytics when no conversations", () => {
      const analytics = engine.getAnalytics();

      expect(analytics.totalConversations).toBe(0);
      expect(analytics.avgHandleTimeMs).toBe(0);
      expect(analytics.avgSentiment).toBe(0);
      expect(analytics.avgQualityScore).toBe(0);
      expect(analytics.qualityByHour).toEqual([]);
    });

    it("should track cost per conversation", () => {
      const s1 = engine.startConversation({ platform: "twilio" });
      engine.addTurn(s1.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        transcript: "Hello",
        sentiment: null,
        tokens: 1,
        cost: 0.05,
      });
      engine.addTurn(s1.id, {
        speaker: "agent",
        startTime: 2500,
        endTime: 4000,
        durationMs: 1500,
        transcript: "Hi",
        sentiment: null,
        tokens: 1,
        cost: 0.1,
      });
      engine.endConversation(s1.id);

      const analytics = engine.getAnalytics();

      expect(analytics.avgCostPerConversation).toBeCloseTo(0.15);
    });
  });

  // --------------------------------------------------------------------------
  // Platform & status filtering
  // --------------------------------------------------------------------------
  describe("listConversations", () => {
    it("should filter by platform", () => {
      engine.startConversation({ platform: "twilio" });
      engine.startConversation({ platform: "vonage" });
      engine.startConversation({ platform: "twilio" });

      const twilio = engine.listConversations({ platform: "twilio" });
      const vonage = engine.listConversations({ platform: "vonage" });

      expect(twilio.length).toBe(2);
      expect(vonage.length).toBe(1);
    });

    it("should filter by status", () => {
      const s1 = engine.startConversation({ platform: "twilio" });
      const s2 = engine.startConversation({ platform: "twilio" });
      engine.startConversation({ platform: "twilio" });

      engine.endConversation(s1.id);
      engine.endConversation(s2.id, { status: "escalated" });

      const active = engine.listConversations({ status: "active" });
      const completed = engine.listConversations({ status: "completed" });
      const escalated = engine.listConversations({ status: "escalated" });

      expect(active.length).toBe(1);
      expect(completed.length).toBe(1);
      expect(escalated.length).toBe(1);
    });

    it("should return all conversations without filter", () => {
      engine.startConversation({ platform: "twilio" });
      engine.startConversation({ platform: "vonage" });

      expect(engine.listConversations().length).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------
  describe("reset", () => {
    it("should clear all conversations", () => {
      engine.startConversation({ platform: "twilio" });
      engine.startConversation({ platform: "vonage" });

      expect(engine.listConversations().length).toBe(2);

      engine.reset();

      expect(engine.listConversations().length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases and additional coverage
  // --------------------------------------------------------------------------
  describe("edge cases", () => {
    it("should handle conversation with no turns for metrics", () => {
      const session = engine.startConversation({ platform: "twilio" });
      engine.endConversation(session.id);

      const metrics = engine.getConversationMetrics(session.id);

      expect(metrics.totalTurns).toBe(0);
      expect(metrics.avgTurnDurationMs).toBe(0);
      expect(metrics.avgSilenceMs).toBe(0);
      expect(metrics.responseLatencyMs).toBe(0);
      expect(metrics.firstResponseLatencyMs).toBe(0);
    });

    it("should handle sentiment analysis with single word", () => {
      const positive = engine.analyzeSentiment("excellent");
      expect(positive.value).toBeGreaterThan(0);

      const negative = engine.analyzeSentiment("terrible");
      expect(negative.value).toBeLessThan(0);
    });

    it("should handle quality scoring for unresolved conversation", () => {
      const session = engine.startConversation({ platform: "twilio" });
      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        transcript: "Hello",
        sentiment: null,
        tokens: 1,
        cost: 0,
      });

      // Don't end conversation, no taskCompleted set
      const quality = engine.scoreQuality(session.id);
      expect(quality.overall).toBeGreaterThan(0);
    });

    it("should properly track turns to resolution", () => {
      const session = engine.startConversation({ platform: "twilio" });

      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        transcript: "Question",
        sentiment: null,
        tokens: 1,
        cost: 0,
      });
      engine.addTurn(session.id, {
        speaker: "agent",
        startTime: 2500,
        endTime: 4000,
        durationMs: 1500,
        transcript: "Answer",
        sentiment: null,
        tokens: 1,
        cost: 0,
      });

      engine.endConversation(session.id, { taskCompleted: true });

      const metrics = engine.getConversationMetrics(session.id);

      expect(metrics.turnsToResolution).toBe(2);
    });

    it("should return null turnsToResolution when not completed", () => {
      const session = engine.startConversation({ platform: "twilio" });
      engine.addTurn(session.id, {
        speaker: "user",
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        transcript: "Question",
        sentiment: null,
        tokens: 1,
        cost: 0,
      });

      const metrics = engine.getConversationMetrics(session.id);

      expect(metrics.turnsToResolution).toBeNull();
    });
  });
});
