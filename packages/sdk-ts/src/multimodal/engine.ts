/**
 * Multi-Modal Observability Engine
 *
 * Tracks, validates, and analyzes multi-modal AI interactions.
 *
 * @packageDocumentation
 */

import { nanoid } from "nanoid";
import type {
  MultiModalConfig,
  ResolvedMultiModalConfig,
  MediaType,
  MediaReference,
  MultiModalEvent,
  MultiModalTokenUsage,
  MultiModalCostBreakdown,
  MediaDiff,
  MultiModalSessionSummary,
  ModelModalCapability,
  MultiModalMetrics,
} from "./types.js";

const DEFAULT_MAX_MEDIA_SIZE = 10 * 1024 * 1024; // 10 MB

const DEFAULT_SUPPORTED_MIME_TYPES: string[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "audio/mp3",
  "audio/wav",
  "audio/mpeg",
  "audio/ogg",
  "video/mp4",
  "video/webm",
  "application/pdf",
];

const DEFAULT_CONFIG: ResolvedMultiModalConfig = {
  enabled: true,
  maxMediaSizeBytes: DEFAULT_MAX_MEDIA_SIZE,
  supportedMimeTypes: DEFAULT_SUPPORTED_MIME_TYPES,
  captureMode: "reference",
  thumbnailSize: { width: 128, height: 128 },
  debug: false,
};

/** Built-in model capabilities registry. */
const MODEL_CAPABILITIES: ModelModalCapability[] = [
  {
    modelId: "gpt-4-vision",
    supportsImage: true,
    supportsAudio: false,
    supportsVideo: false,
    maxImageSize: 20 * 1024 * 1024,
    costPerImage: 0.00765,
  },
  {
    modelId: "gpt-4o",
    supportsImage: true,
    supportsAudio: true,
    supportsVideo: false,
    maxImageSize: 20 * 1024 * 1024,
    costPerImage: 0.00765,
    costPerAudioSecond: 0.0001,
  },
  {
    modelId: "gemini-pro-vision",
    supportsImage: true,
    supportsAudio: false,
    supportsVideo: false,
    maxImageSize: 20 * 1024 * 1024,
    costPerImage: 0.0025,
  },
  {
    modelId: "gemini-1.5-pro",
    supportsImage: true,
    supportsAudio: true,
    supportsVideo: true,
    maxImageSize: 20 * 1024 * 1024,
    maxAudioDuration: 600_000,
    costPerImage: 0.0025,
    costPerAudioSecond: 0.000125,
  },
  {
    modelId: "claude-3-opus",
    supportsImage: true,
    supportsAudio: false,
    supportsVideo: false,
    maxImageSize: 20 * 1024 * 1024,
    costPerImage: 0.008,
  },
  {
    modelId: "claude-3-sonnet",
    supportsImage: true,
    supportsAudio: false,
    supportsVideo: false,
    maxImageSize: 20 * 1024 * 1024,
    costPerImage: 0.004,
  },
  {
    modelId: "claude-3-haiku",
    supportsImage: true,
    supportsAudio: false,
    supportsVideo: false,
    maxImageSize: 20 * 1024 * 1024,
    costPerImage: 0.001,
  },
];

/** Options for tracking media events. */
interface TrackMediaOptions {
  textContent?: string;
  tokens?: MultiModalTokenUsage;
  costUsd?: number;
}

/**
 * Multi-Modal Observability Engine.
 *
 * Tracks multi-modal AI interactions, validates media references,
 * computes cost breakdowns, and provides session-level summaries.
 */
export class MultiModalEngine {
  private readonly config: ResolvedMultiModalConfig;
  private readonly events = new Map<string, MultiModalEvent[]>();
  private readonly modelCapabilities = new Map<string, ModelModalCapability>();

  constructor(config: MultiModalConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      supportedMimeTypes:
        config.supportedMimeTypes ?? DEFAULT_CONFIG.supportedMimeTypes,
      thumbnailSize: config.thumbnailSize ?? DEFAULT_CONFIG.thumbnailSize,
    };

    for (const cap of MODEL_CAPABILITIES) {
      this.modelCapabilities.set(cap.modelId, cap);
    }
  }

  /**
   * Track a media input event.
   */
  trackMediaInput(
    sessionId: string,
    media: MediaReference[],
    model: string,
    options: TrackMediaOptions = {},
  ): MultiModalEvent {
    return this.trackEvent(sessionId, "input", media, model, options);
  }

  /**
   * Track a media output event.
   */
  trackMediaOutput(
    sessionId: string,
    media: MediaReference[],
    model: string,
    options: TrackMediaOptions = {},
  ): MultiModalEvent {
    return this.trackEvent(sessionId, "output", media, model, options);
  }

  /**
   * Create and validate a media reference.
   */
  createMediaReference(
    type: MediaType,
    mimeType: string,
    options: {
      url?: string;
      dataBase64?: string;
      filename?: string;
      sizeBytes: number;
      durationMs?: number;
      dimensions?: { width: number; height: number };
    },
  ): MediaReference {
    const ref: MediaReference = {
      id: `media_${nanoid(21)}`,
      type,
      mimeType,
      url: options.url,
      dataBase64: options.dataBase64,
      filename: options.filename,
      sizeBytes: options.sizeBytes,
      durationMs: options.durationMs,
      dimensions: options.dimensions,
      metadata: {},
    };
    return ref;
  }

  /**
   * Validate a media reference against the current configuration.
   */
  validateMedia(ref: MediaReference): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (ref.sizeBytes > this.config.maxMediaSizeBytes) {
      errors.push(
        `Media size ${ref.sizeBytes} bytes exceeds limit of ${this.config.maxMediaSizeBytes} bytes`,
      );
    }

    if (!this.config.supportedMimeTypes.includes(ref.mimeType)) {
      errors.push(`MIME type '${ref.mimeType}' is not in the supported list`);
    }

    if (ref.sizeBytes <= 0) {
      errors.push("Media size must be greater than 0");
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get a summary of multi-modal usage for a session.
   */
  getSessionSummary(sessionId: string): MultiModalSessionSummary {
    const sessionEvents = this.events.get(sessionId) ?? [];

    const typeCounts: Record<MediaType, number> = {
      image: 0,
      audio: 0,
      video: 0,
      document: 0,
    };

    let totalMedia = 0;
    let totalMediaSize = 0;
    let textEvents = 0;
    let multiModalEvents = 0;
    const costBreakdown: MultiModalCostBreakdown = {
      textCost: 0,
      imageCost: 0,
      audioCost: 0,
      videoCost: 0,
      totalCost: 0,
      currency: "USD",
    };

    for (const event of sessionEvents) {
      if (event.media.length === 0) {
        textEvents++;
      } else {
        multiModalEvents++;
        for (const m of event.media) {
          totalMedia++;
          totalMediaSize += m.sizeBytes;
          typeCounts[m.type]++;
        }
      }

      if (event.costUsd != null) {
        const eventCost = this.calculateMultiModalCost(
          event,
          this.modelCapabilities.get(event.model),
        );
        costBreakdown.textCost += eventCost.textCost;
        costBreakdown.imageCost += eventCost.imageCost;
        costBreakdown.audioCost += eventCost.audioCost;
        costBreakdown.videoCost += eventCost.videoCost;
        costBreakdown.totalCost += eventCost.totalCost;
      }
    }

    const mediaByType = (Object.entries(typeCounts) as [MediaType, number][])
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({ type, count }));

    return {
      sessionId,
      totalMedia,
      mediaByType,
      totalMediaSize,
      textEvents,
      multiModalEvents,
      costBreakdown,
    };
  }

  /**
   * Compare two media references and produce a diff.
   */
  diffMedia(left: MediaReference, right: MediaReference): MediaDiff {
    if (left.id === right.id) {
      return {
        leftMedia: left,
        rightMedia: right,
        diffType: "identical",
        similarity: 1,
        notes: "Same media reference",
      };
    }

    const notes: string[] = [];
    let matchCount = 0;
    const totalChecks = 5;

    if (left.type === right.type) {
      matchCount++;
    } else {
      notes.push(`Type changed from '${left.type}' to '${right.type}'`);
    }

    if (left.mimeType === right.mimeType) {
      matchCount++;
    } else {
      notes.push(
        `MIME type changed from '${left.mimeType}' to '${right.mimeType}'`,
      );
    }

    if (left.sizeBytes === right.sizeBytes) {
      matchCount++;
    } else {
      notes.push(
        `Size changed from ${left.sizeBytes} to ${right.sizeBytes} bytes`,
      );
    }

    if (left.filename === right.filename) {
      matchCount++;
    } else {
      notes.push(
        `Filename changed from '${left.filename ?? "(none)"}' to '${right.filename ?? "(none)"}'`,
      );
    }

    const sameDimensions =
      left.dimensions?.width === right.dimensions?.width &&
      left.dimensions?.height === right.dimensions?.height;
    if (sameDimensions) {
      matchCount++;
    } else {
      notes.push("Dimensions changed");
    }

    const similarity = matchCount / totalChecks;
    let diffType: MediaDiff["diffType"];
    if (similarity === 1) {
      diffType = "identical";
    } else if (similarity >= 0.8) {
      diffType = "changed";
    } else {
      diffType = "changed";
    }

    return {
      leftMedia: left,
      rightMedia: right,
      diffType,
      similarity,
      notes: notes.length > 0 ? notes.join("; ") : "No differences detected",
    };
  }

  /**
   * Calculate cost breakdown by modality for a multi-modal event.
   */
  calculateMultiModalCost(
    event: MultiModalEvent,
    modelCapability?: ModelModalCapability,
  ): MultiModalCostBreakdown {
    const cap = modelCapability ?? this.modelCapabilities.get(event.model);
    const totalCost = event.costUsd ?? 0;

    let imageCost = 0;
    let audioCost = 0;
    let videoCost = 0;

    for (const m of event.media) {
      switch (m.type) {
        case "image":
          imageCost += cap?.costPerImage ?? 0;
          break;
        case "audio":
          if (m.durationMs != null && cap?.costPerAudioSecond != null) {
            audioCost += (m.durationMs / 1000) * cap.costPerAudioSecond;
          }
          break;
        case "video":
          // Video cost estimated as image cost per frame
          if (cap?.costPerImage != null) {
            const frames = event.tokens?.videoFrames ?? 1;
            videoCost += cap.costPerImage * frames;
          }
          break;
      }
    }

    const modalityCost = imageCost + audioCost + videoCost;
    const textCost = Math.max(0, totalCost - modalityCost);

    return {
      textCost,
      imageCost,
      audioCost,
      videoCost,
      totalCost: textCost + imageCost + audioCost + videoCost,
      currency: "USD",
    };
  }

  /**
   * Get known capabilities for a model.
   */
  getModelCapabilities(modelId: string): ModelModalCapability {
    const cap = this.modelCapabilities.get(modelId);
    if (cap) {
      return cap;
    }

    // Return a default unknown-model capability
    return {
      modelId,
      supportsImage: false,
      supportsAudio: false,
      supportsVideo: false,
    };
  }

  /**
   * Get aggregate metrics across all tracked sessions.
   */
  getMetrics(): MultiModalMetrics {
    const mediaByType: Record<MediaType, number> = {
      image: 0,
      audio: 0,
      video: 0,
      document: 0,
    };
    const costByModality: Record<MediaType, number> = {
      image: 0,
      audio: 0,
      video: 0,
      document: 0,
    };

    let totalMediaProcessed = 0;
    let totalMediaBytes = 0;
    const sessionsWithMedia = new Set<string>();

    for (const [sessionId, sessionEvents] of this.events) {
      for (const event of sessionEvents) {
        if (event.media.length > 0) {
          sessionsWithMedia.add(sessionId);
        }
        for (const m of event.media) {
          totalMediaProcessed++;
          totalMediaBytes += m.sizeBytes;
          mediaByType[m.type]++;
        }

        if (event.costUsd != null) {
          const cost = this.calculateMultiModalCost(event);
          costByModality.image += cost.imageCost;
          costByModality.audio += cost.audioCost;
          costByModality.video += cost.videoCost;
        }
      }
    }

    return {
      totalMediaProcessed,
      mediaByType,
      totalMediaBytes,
      avgMediaSize:
        totalMediaProcessed > 0 ? totalMediaBytes / totalMediaProcessed : 0,
      costByModality,
      sessionsWithMedia: sessionsWithMedia.size,
    };
  }

  /**
   * Get the list of supported MIME types from the current configuration.
   */
  getSupportedMimeTypes(): string[] {
    return [...this.config.supportedMimeTypes];
  }

  /**
   * Reset all tracked events and metrics.
   */
  reset(): void {
    this.events.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private trackEvent(
    sessionId: string,
    type: "input" | "output",
    media: MediaReference[],
    model: string,
    options: TrackMediaOptions,
  ): MultiModalEvent {
    const event: MultiModalEvent = {
      eventId: `mm_${nanoid(21)}`,
      sessionId,
      type,
      media,
      textContent: options.textContent,
      model,
      timestamp: Date.now(),
      tokens: options.tokens,
      costUsd: options.costUsd,
    };

    const sessionEvents = this.events.get(sessionId) ?? [];
    sessionEvents.push(event);
    this.events.set(sessionId, sessionEvents);

    return event;
  }
}
