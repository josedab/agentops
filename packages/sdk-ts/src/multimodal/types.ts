/**
 * Multi-Modal Observability Types
 *
 * Types for tracking and analyzing multi-modal AI interactions
 * including images, audio, video, and documents.
 *
 * @packageDocumentation
 */

/** Configuration for multi-modal observability. */
export interface MultiModalConfig {
  /** Whether multi-modal tracking is enabled. */
  enabled?: boolean;
  /** Maximum allowed media size in bytes (default: 10MB). */
  maxMediaSizeBytes?: number;
  /** List of allowed MIME types. */
  supportedMimeTypes?: string[];
  /** How media data is captured. */
  captureMode?: "reference" | "inline" | "upload";
  /** Endpoint for uploading media when captureMode is 'upload'. */
  uploadEndpoint?: string;
  /** Thumbnail dimensions for image/video previews. */
  thumbnailSize?: { width: number; height: number };
  /** Enable debug logging. */
  debug?: boolean;
}

/** Resolved configuration with defaults applied. */
export type ResolvedMultiModalConfig = Required<
  Omit<MultiModalConfig, "uploadEndpoint">
> & {
  uploadEndpoint?: string;
};

/** Supported media types. */
export type MediaType = "image" | "audio" | "video" | "document";

/** A reference to a media asset. */
export interface MediaReference {
  /** Unique identifier for this media reference. */
  id: string;
  /** The type of media. */
  type: MediaType;
  /** MIME type of the media (e.g. 'image/png'). */
  mimeType: string;
  /** URL to the media resource. */
  url?: string;
  /** Base64-encoded media data (for inline capture). */
  dataBase64?: string;
  /** Original filename. */
  filename?: string;
  /** Size in bytes. */
  sizeBytes: number;
  /** Duration in milliseconds (audio/video). */
  durationMs?: number;
  /** Dimensions in pixels (image/video). */
  dimensions?: { width: number; height: number };
  /** URL to a thumbnail preview. */
  thumbnailUrl?: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

/** A multi-modal event representing an input or output interaction. */
export interface MultiModalEvent {
  /** Unique event identifier. */
  eventId: string;
  /** Session this event belongs to. */
  sessionId: string;
  /** Whether media was input to or output from the model. */
  type: "input" | "output";
  /** Media references attached to this event. */
  media: MediaReference[];
  /** Any accompanying text content. */
  textContent?: string;
  /** Model used for this interaction. */
  model: string;
  /** Timestamp in milliseconds since epoch. */
  timestamp: number;
  /** Token usage breakdown including image tokens. */
  tokens?: MultiModalTokenUsage;
  /** Estimated cost in USD. */
  costUsd?: number;
}

/** Token usage breakdown for multi-modal interactions. */
export interface MultiModalTokenUsage {
  /** Tokens used for the prompt. */
  promptTokens: number;
  /** Tokens used for the completion. */
  completionTokens: number;
  /** Total tokens. */
  totalTokens: number;
  /** Tokens attributed to image processing (vision). */
  imageTokens: number;
  /** Seconds of audio processed. */
  audioSeconds?: number;
  /** Number of video frames processed. */
  videoFrames?: number;
}

/** Cost breakdown by modality. */
export interface MultiModalCostBreakdown {
  /** Cost for text processing. */
  textCost: number;
  /** Cost for image processing. */
  imageCost: number;
  /** Cost for audio processing. */
  audioCost: number;
  /** Cost for video processing. */
  videoCost: number;
  /** Total cost across all modalities. */
  totalCost: number;
  /** Currency code (e.g. 'USD'). */
  currency: string;
}

/** Comparison result between two media references. */
export interface MediaDiff {
  /** The left (original) media reference. */
  leftMedia: MediaReference;
  /** The right (compared) media reference. */
  rightMedia: MediaReference;
  /** Type of difference detected. */
  diffType: "added" | "removed" | "changed" | "identical";
  /** Estimated similarity score (0–1) based on metadata comparison. */
  similarity: number;
  /** Human-readable notes about the diff. */
  notes: string;
}

/** Summary of multi-modal usage within a session. */
export interface MultiModalSessionSummary {
  /** Session identifier. */
  sessionId: string;
  /** Total number of media references across all events. */
  totalMedia: number;
  /** Media counts grouped by type. */
  mediaByType: { type: MediaType; count: number }[];
  /** Total bytes of all media. */
  totalMediaSize: number;
  /** Number of text-only events. */
  textEvents: number;
  /** Number of events containing media. */
  multiModalEvents: number;
  /** Aggregated cost breakdown. */
  costBreakdown: MultiModalCostBreakdown;
}

/** Capabilities of a model for multi-modal interactions. */
export interface ModelModalCapability {
  /** Model identifier. */
  modelId: string;
  /** Whether the model supports image inputs. */
  supportsImage: boolean;
  /** Whether the model supports audio inputs. */
  supportsAudio: boolean;
  /** Whether the model supports video inputs. */
  supportsVideo: boolean;
  /** Maximum image size in bytes. */
  maxImageSize?: number;
  /** Maximum audio duration in milliseconds. */
  maxAudioDuration?: number;
  /** Cost per image processed in USD. */
  costPerImage?: number;
  /** Cost per second of audio processed in USD. */
  costPerAudioSecond?: number;
}

/** Aggregate metrics for multi-modal processing. */
export interface MultiModalMetrics {
  /** Total number of media items processed. */
  totalMediaProcessed: number;
  /** Count of media items by type. */
  mediaByType: Record<MediaType, number>;
  /** Total bytes of media processed. */
  totalMediaBytes: number;
  /** Average media size in bytes. */
  avgMediaSize: number;
  /** Estimated cost by modality. */
  costByModality: Record<MediaType, number>;
  /** Number of sessions that included media. */
  sessionsWithMedia: number;
}
