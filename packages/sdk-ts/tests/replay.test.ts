import { describe, it, expect, beforeEach } from "vitest";
import { ReplayEngine } from "../src/replay";
import type { CapturedSession, CapturedEvent } from "../src/replay";

describe("ReplayEngine", () => {
  let engine: ReplayEngine;

  beforeEach(() => {
    engine = new ReplayEngine();
  });

  describe("session capture", () => {
    it("should capture a session", () => {
      const session: CapturedSession = {
        sessionId: "session-123",
        startTime: Date.now(),
        events: [],
        metadata: {},
      };

      engine.captureSession(session);
      const retrieved = engine.getSession("session-123");

      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe("session-123");
    });

    it("should list captured sessions", () => {
      engine.captureSession({
        sessionId: "session-1",
        startTime: Date.now(),
        events: [],
        metadata: {},
      });
      engine.captureSession({
        sessionId: "session-2",
        startTime: Date.now(),
        events: [],
        metadata: {},
      });

      const sessions = engine.listSessions();
      expect(sessions.length).toBe(2);
    });

    it("should return undefined for non-existent session", () => {
      const session = engine.getSession("non-existent");
      expect(session).toBeUndefined();
    });

    it("should capture session with events", () => {
      const events: CapturedEvent[] = [
        {
          eventId: "event-1",
          sessionId: "session-123",
          type: "prompt",
          timestamp: Date.now(),
          data: { content: "Hello" },
        },
        {
          eventId: "event-2",
          sessionId: "session-123",
          type: "response",
          timestamp: Date.now() + 100,
          data: { content: "Hi there!" },
        },
      ];

      engine.captureSession({
        sessionId: "session-123",
        startTime: Date.now(),
        events,
        metadata: {},
      });

      const session = engine.getSession("session-123");
      expect(session?.events.length).toBe(2);
    });
  });

  describe("session replay", () => {
    it("should replay a session", async () => {
      engine.captureSession({
        sessionId: "replay-session",
        startTime: Date.now(),
        events: [
          {
            eventId: "e1",
            sessionId: "replay-session",
            type: "prompt",
            timestamp: Date.now(),
            data: { role: "user", content: "Test" },
          },
        ],
        metadata: {},
      });

      const result = await engine.replay("replay-session", {
        mode: "dry-run",
      });

      expect(result).toBeDefined();
      expect(result.originalSessionId).toBe("replay-session");
    });

    it("should throw for non-existent session", async () => {
      await expect(
        engine.replay("non-existent", { mode: "dry-run" }),
      ).rejects.toThrow("not found");
    });

    it("should respect replay speed", async () => {
      engine.captureSession({
        sessionId: "speed-session",
        startTime: Date.now(),
        events: [
          {
            eventId: "e1",
            sessionId: "speed-session",
            type: "prompt",
            timestamp: Date.now(),
            data: {},
          },
        ],
        metadata: {},
      });

      const result = await engine.replay("speed-session", {
        mode: "dry-run",
        speed: 2.0,
      });

      expect(result).toBeDefined();
    });
  });
});
