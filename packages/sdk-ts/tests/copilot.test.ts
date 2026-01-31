/**
 * Tests for AI Copilot for Debugging
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DebugCopilot,
  InMemorySessionStore,
  VectorStore,
  SimpleEmbeddingGenerator,
} from "../src/copilot/index.js";
import type { SessionData } from "../src/copilot/index.js";

describe("DebugCopilot", () => {
  let copilot: DebugCopilot;
  let sessionStore: InMemorySessionStore;

  beforeEach(() => {
    sessionStore = new InMemorySessionStore();
    copilot = new DebugCopilot({ enabled: true }, sessionStore);
  });

  const createMockSession = (
    overrides: Partial<SessionData> = {},
  ): SessionData => ({
    sessionId: `sess_${Math.random().toString(36).substr(2, 9)}`,
    userId: "user123",
    featureId: "test-feature",
    model: "gpt-4",
    status: "completed",
    startTime: Date.now() - 5000,
    endTime: Date.now(),
    events: [],
    stats: {
      eventCount: 5,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      estimatedCost: 0.01,
      totalCost: 0.01,
      durationMs: 5000,
      toolCalls: 0,
      errors: 0,
      models: ["gpt-4"],
      tools: [],
    },
    ...overrides,
  });

  describe("basic queries", () => {
    it("should return no data result when no sessions exist", async () => {
      const result = await copilot.ask({
        question: "Why did the session fail?",
      });

      expect(result.answer).toContain("No sessions found");
      expect(result.relatedSessions).toHaveLength(0);
      expect(result.confidence).toBe(1.0);
    });

    it("should analyze sessions when data exists", async () => {
      sessionStore.addSession(createMockSession());
      sessionStore.addSession(createMockSession());
      sessionStore.addSession(createMockSession());

      const result = await copilot.ask({ question: "What is happening?" });

      expect(result.answer).toBeTruthy();
      expect(result.metadata.sessionsAnalyzed).toBe(3);
    });

    it("should analyze failures when asked about errors", async () => {
      sessionStore.addSession(createMockSession({ status: "error" }));
      sessionStore.addSession(createMockSession({ status: "completed" }));

      const result = await copilot.ask({ question: "Why did sessions fail?" });

      expect(result.answer).toBeTruthy();
      expect(result.metadata.sessionsAnalyzed).toBeGreaterThan(0);
    });
  });

  describe("session filtering", () => {
    it("should filter by session IDs", async () => {
      const session1 = createMockSession({ sessionId: "sess_1" });
      const session2 = createMockSession({ sessionId: "sess_2" });
      sessionStore.addSession(session1);
      sessionStore.addSession(session2);

      const result = await copilot.ask({
        question: "What happened?",
        sessionIds: ["sess_1"],
      });

      expect(result.relatedSessions.some((s) => s.sessionId === "sess_1")).toBe(
        true,
      );
    });

    it("should filter by time range", async () => {
      const now = Date.now();
      sessionStore.addSession(createMockSession({ startTime: now - 1000 }));
      sessionStore.addSession(createMockSession({ startTime: now - 100000 }));

      const result = await copilot.ask({
        question: "Recent activity?",
        timeRange: { start: now - 5000, end: now },
      });

      expect(result.metadata.sessionsAnalyzed).toBe(1);
    });
  });

  describe("conversations", () => {
    it("should start a new conversation", () => {
      const conversationId = copilot.startConversation();

      expect(conversationId).toBeTruthy();
      expect(copilot.getConversation(conversationId)).toBeTruthy();
    });

    it("should track conversation history", async () => {
      sessionStore.addSession(createMockSession());
      const conversationId = copilot.startConversation();

      await copilot.ask({
        question: "First question",
        conversationId,
      });

      const conversation = copilot.getConversation(conversationId);
      expect(conversation?.messages).toHaveLength(2); // user + assistant
    });
  });

  describe("failure diagnosis", () => {
    it("should diagnose a failed session", async () => {
      const errorSession = createMockSession({
        status: "error",
        events: [
          {
            eventId: "evt_1",
            sessionId: "sess_1",
            type: "error",
            timestamp: Date.now(),
            errorType: "rate_limit",
            errorMessage: "Rate limit exceeded",
          } as any,
        ],
      });
      sessionStore.addSession(errorSession);

      const diagnosis = await copilot.diagnoseFailure(errorSession.sessionId);

      expect(diagnosis).toBeTruthy();
      expect(diagnosis?.category).toBe("rate_limit");
    });

    it("should return null for successful sessions", async () => {
      const successSession = createMockSession({ status: "completed" });
      sessionStore.addSession(successSession);

      const diagnosis = await copilot.diagnoseFailure(successSession.sessionId);

      expect(diagnosis).toBeNull();
    });
  });

  describe("statistics", () => {
    it("should track query statistics", async () => {
      sessionStore.addSession(createMockSession());

      await copilot.ask({ question: "Test query" });
      await copilot.ask({ question: "Another query" });

      const stats = copilot.getStats();

      expect(stats.totalQueries).toBe(2);
      expect(stats.successfulAnalyses).toBe(2);
    });
  });

  describe("caching", () => {
    it("should cache results for identical queries", async () => {
      sessionStore.addSession(createMockSession());

      const result1 = await copilot.ask({ question: "Test query" });
      const result2 = await copilot.ask({ question: "Test query" });

      expect(result2.metadata.cacheHit).toBe(true);
      expect(copilot.getStats().cacheHits).toBe(1);
    });

    it("should clear cache when requested", async () => {
      sessionStore.addSession(createMockSession());

      await copilot.ask({ question: "Test query" });
      copilot.clearCache();
      const result2 = await copilot.ask({ question: "Test query" });

      expect(result2.metadata.cacheHit).toBe(false);
    });
  });
});

describe("VectorStore", () => {
  let store: VectorStore;

  beforeEach(() => {
    store = new VectorStore({ maxEmbeddings: 100, embeddingDimension: 10 });
  });

  it("should add and retrieve embeddings", () => {
    const embedding = {
      sessionId: "sess_1",
      embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
      summary: "Test session",
      metadata: {
        model: "gpt-4",
        status: "success" as const,
        cost: 0.01,
        tokens: 100,
        timestamp: Date.now(),
      },
    };

    store.addEmbedding(embedding);
    const retrieved = store.getEmbedding("sess_1");

    expect(retrieved).toBeTruthy();
    expect(retrieved?.sessionId).toBe("sess_1");
  });

  it("should find similar embeddings", () => {
    store.addEmbedding({
      sessionId: "sess_1",
      embedding: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      summary: "Session 1",
      metadata: {
        model: "gpt-4",
        status: "success",
        cost: 0.01,
        tokens: 100,
        timestamp: Date.now(),
      },
    });
    store.addEmbedding({
      sessionId: "sess_2",
      embedding: [0.9, 0.1, 0, 0, 0, 0, 0, 0, 0, 0],
      summary: "Session 2",
      metadata: {
        model: "gpt-4",
        status: "success",
        cost: 0.01,
        tokens: 100,
        timestamp: Date.now(),
      },
    });
    store.addEmbedding({
      sessionId: "sess_3",
      embedding: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      summary: "Session 3",
      metadata: {
        model: "gpt-4",
        status: "success",
        cost: 0.01,
        tokens: 100,
        timestamp: Date.now(),
      },
    });

    const similar = store.findSimilar([1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 5);

    expect(similar.length).toBeGreaterThan(0);
    expect(similar[0].sessionId).toBe("sess_1");
  });

  it("should enforce max embeddings limit", () => {
    const smallStore = new VectorStore({ maxEmbeddings: 2 });

    for (let i = 0; i < 5; i++) {
      smallStore.addEmbedding({
        sessionId: `sess_${i}`,
        embedding: Array(1536).fill(0.1),
        summary: `Session ${i}`,
        metadata: {
          model: "gpt-4",
          status: "success",
          cost: 0.01,
          tokens: 100,
          timestamp: Date.now(),
        },
      });
    }

    const stats = smallStore.getStats();
    expect(stats.count).toBe(2);
  });
});

describe("SimpleEmbeddingGenerator", () => {
  it("should generate embeddings of correct dimension", async () => {
    const generator = new SimpleEmbeddingGenerator(128);
    const embedding = await generator.generate("test text");

    expect(embedding.length).toBe(128);
  });

  it("should generate normalized vectors", async () => {
    const generator = new SimpleEmbeddingGenerator(128);
    const embedding = await generator.generate("test text");

    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0),
    );
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("should generate batch embeddings", async () => {
    const generator = new SimpleEmbeddingGenerator(128);
    const embeddings = await generator.generateBatch([
      "text 1",
      "text 2",
      "text 3",
    ]);

    expect(embeddings.length).toBe(3);
    embeddings.forEach((emb) => expect(emb.length).toBe(128));
  });
});
