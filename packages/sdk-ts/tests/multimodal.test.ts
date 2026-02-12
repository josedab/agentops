import { describe, it, expect, beforeEach } from "vitest";
import { MultiModalEngine } from "../src/multimodal/index.js";
import type {
  MediaReference,
  ModelModalCapability,
} from "../src/multimodal/index.js";

describe("MultiModalEngine", () => {
  let engine: MultiModalEngine;

  beforeEach(() => {
    engine = new MultiModalEngine({
      enabled: true,
      maxMediaSizeBytes: 10 * 1024 * 1024,
      captureMode: "reference",
    });
  });

  // --------------------------------------------------------------------------
  // Media reference creation and validation
  // --------------------------------------------------------------------------
  describe("createMediaReference", () => {
    it("should create an image reference with dimensions", () => {
      const ref = engine.createMediaReference("image", "image/png", {
        url: "https://example.com/photo.png",
        sizeBytes: 5000,
        dimensions: { width: 800, height: 600 },
        filename: "photo.png",
      });

      expect(ref.id).toMatch(/^media_/);
      expect(ref.type).toBe("image");
      expect(ref.mimeType).toBe("image/png");
      expect(ref.sizeBytes).toBe(5000);
      expect(ref.dimensions).toEqual({ width: 800, height: 600 });
      expect(ref.url).toBe("https://example.com/photo.png");
      expect(ref.filename).toBe("photo.png");
      expect(ref.metadata).toEqual({});
    });

    it("should create an audio reference with duration", () => {
      const ref = engine.createMediaReference("audio", "audio/mp3", {
        sizeBytes: 120_000,
        durationMs: 30_000,
      });

      expect(ref.type).toBe("audio");
      expect(ref.durationMs).toBe(30_000);
    });

    it("should create a video reference", () => {
      const ref = engine.createMediaReference("video", "video/mp4", {
        sizeBytes: 500_000,
        durationMs: 60_000,
        dimensions: { width: 1920, height: 1080 },
      });

      expect(ref.type).toBe("video");
      expect(ref.dimensions).toEqual({ width: 1920, height: 1080 });
      expect(ref.durationMs).toBe(60_000);
    });

    it("should create a document reference", () => {
      const ref = engine.createMediaReference("document", "application/pdf", {
        sizeBytes: 200_000,
        filename: "report.pdf",
      });

      expect(ref.type).toBe("document");
      expect(ref.mimeType).toBe("application/pdf");
    });
  });

  // --------------------------------------------------------------------------
  // Media validation
  // --------------------------------------------------------------------------
  describe("validateMedia", () => {
    it("should accept valid media within size and MIME type limits", () => {
      const ref = engine.createMediaReference("image", "image/png", {
        sizeBytes: 1024,
      });
      const result = engine.validateMedia(ref);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject media exceeding maxMediaSizeBytes", () => {
      const ref = engine.createMediaReference("image", "image/png", {
        sizeBytes: 20 * 1024 * 1024,
      });
      const result = engine.validateMedia(ref);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("exceeds limit");
    });

    it("should reject unsupported MIME types", () => {
      const ref = engine.createMediaReference("image", "image/tiff", {
        sizeBytes: 1024,
      });
      const result = engine.validateMedia(ref);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("MIME type");
    });

    it("should reject zero-size media", () => {
      const ref = engine.createMediaReference("image", "image/png", {
        sizeBytes: 0,
      });
      const result = engine.validateMedia(ref);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Media size must be greater than 0");
    });

    it("should accumulate multiple validation errors", () => {
      const ref = engine.createMediaReference("image", "image/tiff", {
        sizeBytes: 20 * 1024 * 1024,
      });
      const result = engine.validateMedia(ref);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --------------------------------------------------------------------------
  // Track media input/output events
  // --------------------------------------------------------------------------
  describe("trackMediaInput / trackMediaOutput", () => {
    it("should track a media input event", () => {
      const media = [
        engine.createMediaReference("image", "image/png", { sizeBytes: 5000 }),
      ];
      const event = engine.trackMediaInput("sess_1", media, "gpt-4o", {
        textContent: "Describe this image",
      });

      expect(event.eventId).toMatch(/^mm_/);
      expect(event.sessionId).toBe("sess_1");
      expect(event.type).toBe("input");
      expect(event.media).toHaveLength(1);
      expect(event.model).toBe("gpt-4o");
      expect(event.textContent).toBe("Describe this image");
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it("should track a media output event", () => {
      const media = [
        engine.createMediaReference("image", "image/png", { sizeBytes: 8000 }),
      ];
      const event = engine.trackMediaOutput("sess_1", media, "gpt-4o");

      expect(event.type).toBe("output");
      expect(event.media).toHaveLength(1);
    });

    it("should track events with token usage", () => {
      const media = [
        engine.createMediaReference("image", "image/jpeg", { sizeBytes: 1000 }),
      ];
      const tokens = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        imageTokens: 85,
      };
      const event = engine.trackMediaInput("sess_1", media, "gpt-4o", {
        tokens,
        costUsd: 0.05,
      });

      expect(event.tokens).toEqual(tokens);
      expect(event.costUsd).toBe(0.05);
    });
  });

  // --------------------------------------------------------------------------
  // Session summary with mixed modalities
  // --------------------------------------------------------------------------
  describe("getSessionSummary", () => {
    it("should summarize a session with mixed media types", () => {
      const img = engine.createMediaReference("image", "image/png", {
        sizeBytes: 5000,
      });
      const audio = engine.createMediaReference("audio", "audio/mp3", {
        sizeBytes: 120_000,
        durationMs: 30_000,
      });
      const doc = engine.createMediaReference("document", "application/pdf", {
        sizeBytes: 200_000,
      });

      engine.trackMediaInput("sess_a", [img], "gpt-4o", { costUsd: 0.01 });
      engine.trackMediaInput("sess_a", [audio], "gpt-4o", { costUsd: 0.02 });
      engine.trackMediaOutput("sess_a", [doc], "gpt-4o");

      const summary = engine.getSessionSummary("sess_a");

      expect(summary.sessionId).toBe("sess_a");
      expect(summary.totalMedia).toBe(3);
      expect(summary.multiModalEvents).toBe(3);
      expect(summary.textEvents).toBe(0);
      expect(summary.totalMediaSize).toBe(5000 + 120_000 + 200_000);
      expect(summary.mediaByType).toEqual(
        expect.arrayContaining([
          { type: "image", count: 1 },
          { type: "audio", count: 1 },
          { type: "document", count: 1 },
        ]),
      );
    });

    it("should return empty summary for unknown session", () => {
      const summary = engine.getSessionSummary("unknown");

      expect(summary.totalMedia).toBe(0);
      expect(summary.mediaByType).toHaveLength(0);
      expect(summary.textEvents).toBe(0);
      expect(summary.multiModalEvents).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Media diffing
  // --------------------------------------------------------------------------
  describe("diffMedia", () => {
    it("should detect identical media references", () => {
      const ref = engine.createMediaReference("image", "image/png", {
        sizeBytes: 5000,
      });
      const diff = engine.diffMedia(ref, ref);

      expect(diff.diffType).toBe("identical");
      expect(diff.similarity).toBe(1);
    });

    it("should detect changed media with partial similarity", () => {
      const left = engine.createMediaReference("image", "image/png", {
        sizeBytes: 5000,
        filename: "a.png",
        dimensions: { width: 800, height: 600 },
      });
      const right = engine.createMediaReference("image", "image/png", {
        sizeBytes: 6000,
        filename: "b.png",
        dimensions: { width: 800, height: 600 },
      });
      const diff = engine.diffMedia(left, right);

      expect(diff.diffType).toBe("changed");
      expect(diff.similarity).toBeGreaterThan(0);
      expect(diff.similarity).toBeLessThan(1);
      expect(diff.notes).toContain("Size changed");
      expect(diff.notes).toContain("Filename changed");
    });

    it("should detect type differences", () => {
      const left = engine.createMediaReference("image", "image/png", {
        sizeBytes: 5000,
      });
      const right = engine.createMediaReference("audio", "audio/mp3", {
        sizeBytes: 120_000,
      });
      const diff = engine.diffMedia(left, right);

      expect(diff.diffType).toBe("changed");
      expect(diff.similarity).toBeLessThan(1);
      expect(diff.notes).toContain("Type changed");
    });
  });

  // --------------------------------------------------------------------------
  // Multi-modal cost calculation
  // --------------------------------------------------------------------------
  describe("calculateMultiModalCost", () => {
    it("should calculate image cost using model capability", () => {
      const media = [
        engine.createMediaReference("image", "image/png", { sizeBytes: 5000 }),
      ];
      const event = engine.trackMediaInput("sess_c", media, "gpt-4o", {
        costUsd: 0.05,
      });

      const cost = engine.calculateMultiModalCost(event);

      expect(cost.imageCost).toBeGreaterThan(0);
      expect(cost.totalCost).toBeGreaterThan(0);
      expect(cost.currency).toBe("USD");
    });

    it("should calculate audio cost based on duration", () => {
      const media = [
        engine.createMediaReference("audio", "audio/mp3", {
          sizeBytes: 120_000,
          durationMs: 30_000,
        }),
      ];
      const event = engine.trackMediaInput("sess_d", media, "gpt-4o", {
        costUsd: 0.01,
      });

      const cost = engine.calculateMultiModalCost(event);

      expect(cost.audioCost).toBeGreaterThan(0);
    });

    it("should use explicit model capability when provided", () => {
      const cap: ModelModalCapability = {
        modelId: "custom-model",
        supportsImage: true,
        supportsAudio: false,
        supportsVideo: false,
        costPerImage: 0.05,
      };
      const media = [
        engine.createMediaReference("image", "image/png", { sizeBytes: 5000 }),
      ];
      const event = engine.trackMediaInput("sess_e", media, "custom-model", {
        costUsd: 0.1,
      });

      const cost = engine.calculateMultiModalCost(event, cap);

      expect(cost.imageCost).toBe(0.05);
    });
  });

  // --------------------------------------------------------------------------
  // Model capabilities lookup
  // --------------------------------------------------------------------------
  describe("getModelCapabilities", () => {
    it("should return capabilities for gpt-4-vision", () => {
      const cap = engine.getModelCapabilities("gpt-4-vision");

      expect(cap.modelId).toBe("gpt-4-vision");
      expect(cap.supportsImage).toBe(true);
      expect(cap.supportsAudio).toBe(false);
    });

    it("should return capabilities for gpt-4o", () => {
      const cap = engine.getModelCapabilities("gpt-4o");

      expect(cap.supportsImage).toBe(true);
      expect(cap.supportsAudio).toBe(true);
      expect(cap.costPerImage).toBeGreaterThan(0);
    });

    it("should return capabilities for gemini-pro-vision", () => {
      const cap = engine.getModelCapabilities("gemini-pro-vision");

      expect(cap.supportsImage).toBe(true);
    });

    it("should return capabilities for gemini-1.5-pro", () => {
      const cap = engine.getModelCapabilities("gemini-1.5-pro");

      expect(cap.supportsImage).toBe(true);
      expect(cap.supportsAudio).toBe(true);
      expect(cap.supportsVideo).toBe(true);
    });

    it("should return capabilities for claude-3-opus", () => {
      const cap = engine.getModelCapabilities("claude-3-opus");

      expect(cap.supportsImage).toBe(true);
      expect(cap.costPerImage).toBeGreaterThan(0);
    });

    it("should return capabilities for claude-3-sonnet", () => {
      const cap = engine.getModelCapabilities("claude-3-sonnet");

      expect(cap.supportsImage).toBe(true);
    });

    it("should return capabilities for claude-3-haiku", () => {
      const cap = engine.getModelCapabilities("claude-3-haiku");

      expect(cap.supportsImage).toBe(true);
    });

    it("should return default capabilities for unknown models", () => {
      const cap = engine.getModelCapabilities("unknown-model");

      expect(cap.modelId).toBe("unknown-model");
      expect(cap.supportsImage).toBe(false);
      expect(cap.supportsAudio).toBe(false);
      expect(cap.supportsVideo).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Metrics tracking
  // --------------------------------------------------------------------------
  describe("getMetrics", () => {
    it("should aggregate metrics across sessions", () => {
      const img = engine.createMediaReference("image", "image/png", {
        sizeBytes: 5000,
      });
      const audio = engine.createMediaReference("audio", "audio/mp3", {
        sizeBytes: 120_000,
        durationMs: 30_000,
      });

      engine.trackMediaInput("sess_x", [img], "gpt-4o");
      engine.trackMediaInput("sess_y", [audio], "gpt-4o");
      engine.trackMediaOutput("sess_x", [img], "gpt-4o");

      const metrics = engine.getMetrics();

      expect(metrics.totalMediaProcessed).toBe(3);
      expect(metrics.mediaByType.image).toBe(2);
      expect(metrics.mediaByType.audio).toBe(1);
      expect(metrics.totalMediaBytes).toBe(5000 + 120_000 + 5000);
      expect(metrics.avgMediaSize).toBeCloseTo((5000 + 120_000 + 5000) / 3, 0);
      expect(metrics.sessionsWithMedia).toBe(2);
    });

    it("should return zero metrics when no events tracked", () => {
      const metrics = engine.getMetrics();

      expect(metrics.totalMediaProcessed).toBe(0);
      expect(metrics.avgMediaSize).toBe(0);
      expect(metrics.sessionsWithMedia).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Supported MIME types configuration
  // --------------------------------------------------------------------------
  describe("getSupportedMimeTypes", () => {
    it("should return default MIME types", () => {
      const types = engine.getSupportedMimeTypes();

      expect(types).toContain("image/png");
      expect(types).toContain("image/jpeg");
      expect(types).toContain("audio/mp3");
      expect(types).toContain("video/mp4");
      expect(types).toContain("application/pdf");
    });

    it("should return custom MIME types when configured", () => {
      const custom = new MultiModalEngine({
        supportedMimeTypes: ["image/svg+xml", "audio/flac"],
      });
      const types = custom.getSupportedMimeTypes();

      expect(types).toEqual(["image/svg+xml", "audio/flac"]);
      expect(types).not.toContain("image/png");
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------
  describe("reset", () => {
    it("should clear all tracked events", () => {
      const img = engine.createMediaReference("image", "image/png", {
        sizeBytes: 5000,
      });
      engine.trackMediaInput("sess_z", [img], "gpt-4o");

      engine.reset();

      const summary = engine.getSessionSummary("sess_z");
      expect(summary.totalMedia).toBe(0);

      const metrics = engine.getMetrics();
      expect(metrics.totalMediaProcessed).toBe(0);
    });
  });
});
