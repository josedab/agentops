/**
 * Tests for Synthetic Session Replay (Feature 5 extensions)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ReplayEngine } from "../src/replay/engine.js";
import type { CapturedSession, ReplayConfig } from "../src/replay/types.js";

describe("ReplayEngine Extended Features", () => {
  let engine: ReplayEngine;

  beforeEach(() => {
    engine = new ReplayEngine();
  });

  // Helper to create a test session
  function createTestSession(id: string = "test-session"): CapturedSession {
    return {
      sessionId: id,
      startTime: Date.now() - 10000,
      endTime: Date.now(),
      events: [
        {
          eventId: "evt-1",
          type: "prompt",
          timestamp: Date.now() - 9000,
          data: {
            role: "user",
            content: "Hello, how are you?",
            model: "gpt-4",
          },
        },
        {
          eventId: "evt-2",
          parentEventId: "evt-1",
          type: "response",
          timestamp: Date.now() - 8000,
          durationMs: 500,
          data: {
            content: "I am doing well, thank you!",
            model: "gpt-4",
            tokens: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
          },
        },
      ],
      totalTokens: 18,
      totalCost: 0.001,
      status: "completed",
    };
  }

  describe("Batch Replay", () => {
    it("should replay multiple sessions", async () => {
      engine.captureSession(createTestSession("session-1"));
      engine.captureSession(createTestSession("session-2"));
      engine.captureSession(createTestSession("session-3"));

      const result = await engine.batchReplay(
        ["session-1", "session-2", "session-3"],
        { mode: "mock" },
      );

      expect(result.totalSessions).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.errorCount).toBe(0);
      expect(result.results.length).toBe(3);
    });

    it("should handle missing sessions gracefully", async () => {
      engine.captureSession(createTestSession("session-1"));

      const result = await engine.batchReplay(
        ["session-1", "missing-session"],
        { mode: "mock" },
      );

      expect(result.totalSessions).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(1);
      expect(result.errors[0].sessionId).toBe("missing-session");
    });

    it("should calculate aggregate metrics", async () => {
      engine.captureSession(createTestSession("session-1"));
      engine.captureSession(createTestSession("session-2"));

      const result = await engine.batchReplay(["session-1", "session-2"], {
        mode: "mock",
      });

      expect(result.aggregateMetrics).toBeDefined();
      expect(result.aggregateMetrics.successRate).toBe(100);
    });
  });

  describe("Config Comparison", () => {
    it("should compare two configurations", async () => {
      engine.captureSession(createTestSession("session-1"));

      const configA: ReplayConfig = { mode: "mock", speed: 0 };
      const configB: ReplayConfig = {
        mode: "mock",
        speed: 0,
        overrideModel: "gpt-3.5-turbo",
      };

      const result = await engine.compareConfigs("session-1", configA, configB);

      expect(result.sessionId).toBe("session-1");
      expect(result.configA.result).toBeDefined();
      expect(result.configB.result).toBeDefined();
      expect(result.comparison.winner).toBeDefined();
      expect(["A", "B", "tie"]).toContain(result.comparison.winner);
    });

    it("should generate recommendation", async () => {
      engine.captureSession(createTestSession("session-1"));

      const configA: ReplayConfig = { mode: "mock" };
      const configB: ReplayConfig = { mode: "mock" };

      const result = await engine.compareConfigs("session-1", configA, configB);

      expect(result.comparison.recommendation).toBeDefined();
      expect(typeof result.comparison.recommendation).toBe("string");
    });
  });

  describe("Replay Templates", () => {
    it("should create a template", () => {
      const template = engine.createTemplate(
        "Test Template",
        { mode: "mock", speed: 2 },
        "A test template",
      );

      expect(template.id).toBeDefined();
      expect(template.name).toBe("Test Template");
      expect(template.config.mode).toBe("mock");
    });

    it("should get template by ID", () => {
      const template = engine.createTemplate("My Template", { mode: "mock" });
      const retrieved = engine.getTemplate(template.id);

      expect(retrieved).toEqual(template);
    });

    it("should list all templates", () => {
      engine.createTemplate("Template 1", { mode: "mock" });
      engine.createTemplate("Template 2", { mode: "live" });

      const templates = engine.listTemplates();
      expect(templates.length).toBe(2);
    });

    it("should apply template to replay", async () => {
      engine.captureSession(createTestSession("session-1"));
      const template = engine.createTemplate("Fast Mock", {
        mode: "mock",
        speed: 0,
      });

      const result = await engine.applyTemplate(template.id, "session-1");

      expect(result.originalSessionId).toBe("session-1");
      expect(result.success).toBe(true);
    });

    it("should throw for missing template", async () => {
      engine.captureSession(createTestSession("session-1"));

      await expect(
        engine.applyTemplate("non-existent-template", "session-1"),
      ).rejects.toThrow("Template non-existent-template not found");
    });
  });

  describe("Session Management", () => {
    it("should capture and list sessions", () => {
      engine.captureSession(createTestSession("session-1"));
      engine.captureSession(createTestSession("session-2"));

      const sessions = engine.listSessions();
      expect(sessions.length).toBe(2);
    });

    it("should export and import sessions", () => {
      const original = createTestSession("export-test");
      engine.captureSession(original);

      const exported = engine.exportSession("export-test");
      expect(exported).not.toBeNull();

      const newEngine = new ReplayEngine();
      const imported = newEngine.importSession(exported!);

      expect(imported.sessionId).toBe("export-test");
      expect(newEngine.getSession("export-test")).toBeDefined();
    });

    it("should delete sessions", () => {
      engine.captureSession(createTestSession("to-delete"));
      expect(engine.getSession("to-delete")).toBeDefined();

      const deleted = engine.deleteSession("to-delete");
      expect(deleted).toBe(true);
      expect(engine.getSession("to-delete")).toBeUndefined();
    });
  });
});
