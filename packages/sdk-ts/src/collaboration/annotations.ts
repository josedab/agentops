/**
 * AgentOps SDK - Real-time Collaboration Annotations
 *
 * Team collaboration features for annotating sessions, sharing insights,
 * and threaded discussions directly on traces.
 */

import { now, generateEventId } from "../utils.js";

// ============================================================================
// Types
// ============================================================================

export interface AnnotationConfig {
  /** Enable annotation features */
  enabled: boolean;
  /** Maximum annotation length */
  maxAnnotationLength?: number;
  /** Allow @mentions */
  allowMentions?: boolean;
  /** Allow attachments */
  allowAttachments?: boolean;
  /** Real-time sync enabled */
  realtimeSync?: boolean;
  /** Callback when annotation is created */
  onAnnotationCreated?: (annotation: Annotation) => void;
  /** Callback when mention occurs */
  onMention?: (mention: Mention) => void;
}

export interface Annotation {
  id: string;
  /** Session or event this annotation is attached to */
  targetId: string;
  targetType: "session" | "event" | "span" | "trace";
  /** Author information */
  author: AnnotationAuthor;
  /** Annotation content */
  content: string;
  /** Parsed mentions from content */
  mentions: Mention[];
  /** Tags/labels */
  tags: string[];
  /** Priority/severity */
  priority: "low" | "normal" | "high" | "critical";
  /** Status */
  status: "open" | "resolved" | "dismissed";
  /** Attachments */
  attachments: Attachment[];
  /** Thread replies */
  replies: AnnotationReply[];
  /** Reactions */
  reactions: Reaction[];
  /** Timestamps */
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  /** Resolution details */
  resolution?: Resolution;
}

export interface AnnotationAuthor {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

export interface Mention {
  id: string;
  /** User being mentioned */
  userId: string;
  userName: string;
  /** Position in content */
  startIndex: number;
  endIndex: number;
  /** Notification sent */
  notified: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  type: "image" | "file" | "link" | "code";
  url?: string;
  content?: string;
  mimeType?: string;
  size?: number;
}

export interface AnnotationReply {
  id: string;
  author: AnnotationAuthor;
  content: string;
  mentions: Mention[];
  reactions: Reaction[];
  createdAt: number;
  editedAt?: number;
}

export interface Reaction {
  emoji: string;
  users: string[];
  count: number;
}

export interface Resolution {
  resolvedBy: AnnotationAuthor;
  resolution: "fixed" | "wont_fix" | "duplicate" | "not_a_bug" | "by_design";
  comment?: string;
  linkedIssue?: string;
}

export interface AnnotationFilter {
  targetId?: string;
  targetType?: "session" | "event" | "span" | "trace";
  authorId?: string;
  status?: "open" | "resolved" | "dismissed";
  priority?: "low" | "normal" | "high" | "critical";
  tags?: string[];
  mentionsUser?: string;
  search?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface AnnotationStats {
  total: number;
  open: number;
  resolved: number;
  dismissed: number;
  byPriority: Record<string, number>;
  byAuthor: Record<string, number>;
  avgResponseTime: number;
  avgResolutionTime: number;
}

export interface SharedInsight {
  id: string;
  title: string;
  description: string;
  author: AnnotationAuthor;
  /** Related annotations */
  annotations: string[];
  /** Related sessions */
  sessions: string[];
  /** Tags for categorization */
  tags: string[];
  /** Visibility */
  visibility: "private" | "team" | "organization" | "public";
  /** Likes/bookmarks */
  likes: number;
  bookmarks: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Annotation Manager
// ============================================================================

export class AnnotationManager {
  private readonly config: Required<
    Omit<AnnotationConfig, "onAnnotationCreated" | "onMention">
  > & {
    onAnnotationCreated?: (annotation: Annotation) => void;
    onMention?: (mention: Mention) => void;
  };

  private annotations: Map<string, Annotation> = new Map();
  private insights: Map<string, SharedInsight> = new Map();
  private mentionPattern = /@\[([^\]]+)\]\(([^)]+)\)/g;

  constructor(config: AnnotationConfig) {
    this.config = {
      enabled: config.enabled,
      maxAnnotationLength: config.maxAnnotationLength ?? 10000,
      allowMentions: config.allowMentions ?? true,
      allowAttachments: config.allowAttachments ?? true,
      realtimeSync: config.realtimeSync ?? false,
      onAnnotationCreated: config.onAnnotationCreated,
      onMention: config.onMention,
    };
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  // =========================================================================
  // Annotation CRUD
  // =========================================================================

  /**
   * Create a new annotation on a session, event, or trace
   */
  createAnnotation(params: {
    targetId: string;
    targetType: "session" | "event" | "span" | "trace";
    author: AnnotationAuthor;
    content: string;
    tags?: string[];
    priority?: "low" | "normal" | "high" | "critical";
    attachments?: Omit<Attachment, "id">[];
  }): Annotation {
    if (!this.config.enabled) {
      throw new Error("Annotations are disabled");
    }

    if (params.content.length > this.config.maxAnnotationLength) {
      throw new Error(
        `Annotation exceeds maximum length of ${this.config.maxAnnotationLength}`,
      );
    }

    const mentions = this.config.allowMentions
      ? this.parseMentions(params.content)
      : [];

    const attachments: Attachment[] =
      this.config.allowAttachments && params.attachments
        ? params.attachments.map((a) => ({ ...a, id: generateEventId() }))
        : [];

    const annotation: Annotation = {
      id: generateEventId(),
      targetId: params.targetId,
      targetType: params.targetType,
      author: params.author,
      content: params.content,
      mentions,
      tags: params.tags ?? [],
      priority: params.priority ?? "normal",
      status: "open",
      attachments,
      replies: [],
      reactions: [],
      createdAt: now(),
      updatedAt: now(),
    };

    this.annotations.set(annotation.id, annotation);

    // Notify callbacks
    if (this.config.onAnnotationCreated) {
      this.config.onAnnotationCreated(annotation);
    }

    // Notify mentioned users
    for (const mention of mentions) {
      mention.notified = true;
      if (this.config.onMention) {
        this.config.onMention(mention);
      }
    }

    return annotation;
  }

  /**
   * Get annotation by ID
   */
  getAnnotation(id: string): Annotation | undefined {
    return this.annotations.get(id);
  }

  /**
   * Update an annotation
   */
  updateAnnotation(
    id: string,
    updates: Partial<
      Pick<Annotation, "content" | "tags" | "priority" | "status">
    >,
  ): Annotation | null {
    const annotation = this.annotations.get(id);
    if (!annotation) return null;

    if (updates.content) {
      if (updates.content.length > this.config.maxAnnotationLength) {
        throw new Error(`Annotation exceeds maximum length`);
      }
      annotation.content = updates.content;
      annotation.mentions = this.config.allowMentions
        ? this.parseMentions(updates.content)
        : [];
    }

    if (updates.tags) annotation.tags = updates.tags;
    if (updates.priority) annotation.priority = updates.priority;
    if (updates.status) {
      annotation.status = updates.status;
      if (updates.status === "resolved") {
        annotation.resolvedAt = now();
      }
    }

    annotation.updatedAt = now();
    return annotation;
  }

  /**
   * Delete an annotation
   */
  deleteAnnotation(id: string): boolean {
    return this.annotations.delete(id);
  }

  /**
   * List annotations with filters
   */
  listAnnotations(filter?: AnnotationFilter): Annotation[] {
    let results = Array.from(this.annotations.values());

    if (filter) {
      if (filter.targetId) {
        results = results.filter((a) => a.targetId === filter.targetId);
      }
      if (filter.targetType) {
        results = results.filter((a) => a.targetType === filter.targetType);
      }
      if (filter.authorId) {
        results = results.filter((a) => a.author.id === filter.authorId);
      }
      if (filter.status) {
        results = results.filter((a) => a.status === filter.status);
      }
      if (filter.priority) {
        results = results.filter((a) => a.priority === filter.priority);
      }
      if (filter.tags && filter.tags.length > 0) {
        results = results.filter((a) =>
          filter.tags!.some((t) => a.tags.includes(t)),
        );
      }
      if (filter.mentionsUser) {
        results = results.filter((a) =>
          a.mentions.some((m) => m.userId === filter.mentionsUser),
        );
      }
      if (filter.search) {
        const search = filter.search.toLowerCase();
        results = results.filter(
          (a) =>
            a.content.toLowerCase().includes(search) ||
            a.tags.some((t) => t.toLowerCase().includes(search)),
        );
      }
      if (filter.startTime) {
        results = results.filter((a) => a.createdAt >= filter.startTime!);
      }
      if (filter.endTime) {
        results = results.filter((a) => a.createdAt <= filter.endTime!);
      }
    }

    // Sort by creation time (newest first)
    results.sort((a, b) => b.createdAt - a.createdAt);

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  // =========================================================================
  // Replies & Threads
  // =========================================================================

  /**
   * Add a reply to an annotation
   */
  addReply(
    annotationId: string,
    params: {
      author: AnnotationAuthor;
      content: string;
    },
  ): AnnotationReply | null {
    const annotation = this.annotations.get(annotationId);
    if (!annotation) return null;

    const mentions = this.config.allowMentions
      ? this.parseMentions(params.content)
      : [];

    const reply: AnnotationReply = {
      id: generateEventId(),
      author: params.author,
      content: params.content,
      mentions,
      reactions: [],
      createdAt: now(),
    };

    annotation.replies.push(reply);
    annotation.updatedAt = now();

    // Notify mentioned users
    for (const mention of mentions) {
      mention.notified = true;
      if (this.config.onMention) {
        this.config.onMention(mention);
      }
    }

    return reply;
  }

  /**
   * Edit a reply
   */
  editReply(
    annotationId: string,
    replyId: string,
    content: string,
  ): AnnotationReply | null {
    const annotation = this.annotations.get(annotationId);
    if (!annotation) return null;

    const reply = annotation.replies.find((r) => r.id === replyId);
    if (!reply) return null;

    reply.content = content;
    reply.mentions = this.config.allowMentions
      ? this.parseMentions(content)
      : [];
    reply.editedAt = now();
    annotation.updatedAt = now();

    return reply;
  }

  /**
   * Delete a reply
   */
  deleteReply(annotationId: string, replyId: string): boolean {
    const annotation = this.annotations.get(annotationId);
    if (!annotation) return false;

    const index = annotation.replies.findIndex((r) => r.id === replyId);
    if (index === -1) return false;

    annotation.replies.splice(index, 1);
    annotation.updatedAt = now();
    return true;
  }

  // =========================================================================
  // Reactions
  // =========================================================================

  /**
   * Add a reaction to an annotation
   */
  addReaction(annotationId: string, emoji: string, userId: string): boolean {
    const annotation = this.annotations.get(annotationId);
    if (!annotation) return false;

    const existing = annotation.reactions.find((r) => r.emoji === emoji);
    if (existing) {
      if (!existing.users.includes(userId)) {
        existing.users.push(userId);
        existing.count++;
      }
    } else {
      annotation.reactions.push({
        emoji,
        users: [userId],
        count: 1,
      });
    }

    return true;
  }

  /**
   * Remove a reaction
   */
  removeReaction(annotationId: string, emoji: string, userId: string): boolean {
    const annotation = this.annotations.get(annotationId);
    if (!annotation) return false;

    const reaction = annotation.reactions.find((r) => r.emoji === emoji);
    if (!reaction) return false;

    const userIndex = reaction.users.indexOf(userId);
    if (userIndex === -1) return false;

    reaction.users.splice(userIndex, 1);
    reaction.count--;

    if (reaction.count === 0) {
      const reactionIndex = annotation.reactions.indexOf(reaction);
      annotation.reactions.splice(reactionIndex, 1);
    }

    return true;
  }

  /**
   * Add reaction to a reply
   */
  addReplyReaction(
    annotationId: string,
    replyId: string,
    emoji: string,
    userId: string,
  ): boolean {
    const annotation = this.annotations.get(annotationId);
    if (!annotation) return false;

    const reply = annotation.replies.find((r) => r.id === replyId);
    if (!reply) return false;

    const existing = reply.reactions.find((r) => r.emoji === emoji);
    if (existing) {
      if (!existing.users.includes(userId)) {
        existing.users.push(userId);
        existing.count++;
      }
    } else {
      reply.reactions.push({
        emoji,
        users: [userId],
        count: 1,
      });
    }

    return true;
  }

  // =========================================================================
  // Resolution
  // =========================================================================

  /**
   * Resolve an annotation
   */
  resolveAnnotation(id: string, resolution: Resolution): Annotation | null {
    const annotation = this.annotations.get(id);
    if (!annotation) return null;

    annotation.status = "resolved";
    annotation.resolution = resolution;
    annotation.resolvedAt = now();
    annotation.updatedAt = now();

    return annotation;
  }

  /**
   * Reopen a resolved annotation
   */
  reopenAnnotation(id: string): Annotation | null {
    const annotation = this.annotations.get(id);
    if (!annotation) return null;

    annotation.status = "open";
    annotation.resolution = undefined;
    annotation.resolvedAt = undefined;
    annotation.updatedAt = now();

    return annotation;
  }

  // =========================================================================
  // Shared Insights
  // =========================================================================

  /**
   * Create a shared insight from annotations
   */
  createInsight(params: {
    title: string;
    description: string;
    author: AnnotationAuthor;
    annotations?: string[];
    sessions?: string[];
    tags?: string[];
    visibility?: "private" | "team" | "organization" | "public";
  }): SharedInsight {
    const insight: SharedInsight = {
      id: generateEventId(),
      title: params.title,
      description: params.description,
      author: params.author,
      annotations: params.annotations ?? [],
      sessions: params.sessions ?? [],
      tags: params.tags ?? [],
      visibility: params.visibility ?? "team",
      likes: 0,
      bookmarks: 0,
      createdAt: now(),
      updatedAt: now(),
    };

    this.insights.set(insight.id, insight);
    return insight;
  }

  /**
   * Get insight by ID
   */
  getInsight(id: string): SharedInsight | undefined {
    return this.insights.get(id);
  }

  /**
   * List insights
   */
  listInsights(filter?: {
    authorId?: string;
    tags?: string[];
    visibility?: string;
    search?: string;
    limit?: number;
  }): SharedInsight[] {
    let results = Array.from(this.insights.values());

    if (filter) {
      if (filter.authorId) {
        results = results.filter((i) => i.author.id === filter.authorId);
      }
      if (filter.tags && filter.tags.length > 0) {
        results = results.filter((i) =>
          filter.tags!.some((t) => i.tags.includes(t)),
        );
      }
      if (filter.visibility) {
        results = results.filter((i) => i.visibility === filter.visibility);
      }
      if (filter.search) {
        const search = filter.search.toLowerCase();
        results = results.filter(
          (i) =>
            i.title.toLowerCase().includes(search) ||
            i.description.toLowerCase().includes(search),
        );
      }
    }

    results.sort((a, b) => b.createdAt - a.createdAt);

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Like an insight
   */
  likeInsight(id: string): boolean {
    const insight = this.insights.get(id);
    if (!insight) return false;
    insight.likes++;
    return true;
  }

  /**
   * Bookmark an insight
   */
  bookmarkInsight(id: string): boolean {
    const insight = this.insights.get(id);
    if (!insight) return false;
    insight.bookmarks++;
    return true;
  }

  // =========================================================================
  // Statistics
  // =========================================================================

  /**
   * Get annotation statistics
   */
  getStats(filter?: {
    targetId?: string;
    startTime?: number;
    endTime?: number;
  }): AnnotationStats {
    let annotations = Array.from(this.annotations.values());

    if (filter) {
      if (filter.targetId) {
        annotations = annotations.filter((a) => a.targetId === filter.targetId);
      }
      if (filter.startTime) {
        annotations = annotations.filter(
          (a) => a.createdAt >= filter.startTime!,
        );
      }
      if (filter.endTime) {
        annotations = annotations.filter((a) => a.createdAt <= filter.endTime!);
      }
    }

    const byPriority: Record<string, number> = {
      low: 0,
      normal: 0,
      high: 0,
      critical: 0,
    };

    const byAuthor: Record<string, number> = {};
    let totalResponseTime = 0;
    let responseCount = 0;
    let totalResolutionTime = 0;
    let resolutionCount = 0;

    for (const a of annotations) {
      byPriority[a.priority]++;
      byAuthor[a.author.id] = (byAuthor[a.author.id] ?? 0) + 1;

      // Calculate response time (time to first reply)
      if (a.replies.length > 0) {
        totalResponseTime += a.replies[0].createdAt - a.createdAt;
        responseCount++;
      }

      // Calculate resolution time
      if (a.resolvedAt) {
        totalResolutionTime += a.resolvedAt - a.createdAt;
        resolutionCount++;
      }
    }

    return {
      total: annotations.length,
      open: annotations.filter((a) => a.status === "open").length,
      resolved: annotations.filter((a) => a.status === "resolved").length,
      dismissed: annotations.filter((a) => a.status === "dismissed").length,
      byPriority,
      byAuthor,
      avgResponseTime:
        responseCount > 0 ? totalResponseTime / responseCount : 0,
      avgResolutionTime:
        resolutionCount > 0 ? totalResolutionTime / resolutionCount : 0,
    };
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Parse @mentions from content
   * Format: @[User Name](user-id)
   */
  private parseMentions(content: string): Mention[] {
    const mentions: Mention[] = [];
    let match;

    // Reset regex
    this.mentionPattern.lastIndex = 0;

    while ((match = this.mentionPattern.exec(content)) !== null) {
      mentions.push({
        id: generateEventId(),
        userName: match[1],
        userId: match[2],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        notified: false,
      });
    }

    return mentions;
  }

  /**
   * Get annotations for export
   */
  exportAnnotations(targetId?: string): Annotation[] {
    const annotations = targetId
      ? this.listAnnotations({ targetId })
      : Array.from(this.annotations.values());

    return annotations;
  }

  /**
   * Import annotations (for syncing)
   */
  importAnnotations(annotations: Annotation[]): number {
    let imported = 0;
    for (const annotation of annotations) {
      if (!this.annotations.has(annotation.id)) {
        this.annotations.set(annotation.id, annotation);
        imported++;
      }
    }
    return imported;
  }
}
