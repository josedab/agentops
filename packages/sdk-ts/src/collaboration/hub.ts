/**
 * AgentOps SDK - Collaboration Hub
 *
 * Team collaboration features for shared debugging and investigation.
 */

import type {
  Investigation,
  Annotation,
  Comment,
  TeamMember,
  ShareableLink,
  Notification,
  KnowledgeArticle,
  CollaborationConfig,
} from "./types.js";
import { generateEventId, now } from "../utils.js";

export class CollaborationHub {
  private readonly config: CollaborationConfig;
  private investigations: Map<string, Investigation> = new Map();
  private annotations: Map<string, Annotation> = new Map();
  private shareableLinks: Map<string, ShareableLink> = new Map();
  private notifications: Map<string, Notification[]> = new Map();
  private knowledgeBase: Map<string, KnowledgeArticle> = new Map();

  constructor(config: CollaborationConfig) {
    this.config = {
      enabled: config.enabled ?? false,
      teamId: config.teamId,
      currentUser: config.currentUser,
      enableNotifications: config.enableNotifications ?? true,
      enableRealtime: config.enableRealtime ?? false,
    };
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  get currentUser(): TeamMember | undefined {
    return this.config.currentUser;
  }

  // =========================================================================
  // Investigation Management
  // =========================================================================

  /**
   * Create a new investigation
   */
  createInvestigation(
    title: string,
    options?: {
      description?: string;
      priority?: Investigation["priority"];
      sessionIds?: string[];
      anomalyIds?: string[];
      tags?: string[];
      assignees?: TeamMember[];
    },
  ): Investigation {
    if (!this.currentUser) {
      throw new Error("Current user not set");
    }

    const id = `inv_${generateEventId()}`;
    const timestamp = now();

    const investigation: Investigation = {
      id,
      title,
      description: options?.description,
      status: "open",
      priority: options?.priority ?? "medium",
      createdBy: this.currentUser,
      assignees: options?.assignees ?? [],
      sessionIds: options?.sessionIds ?? [],
      anomalyIds: options?.anomalyIds,
      tags: options?.tags ?? [],
      timeline: [
        {
          id: generateEventId(),
          type: "created",
          description: `Investigation created by ${this.currentUser.name}`,
          actor: this.currentUser,
          timestamp,
        },
      ],
      comments: [],
      attachments: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.investigations.set(id, investigation);
    this.notifyAssignees(investigation, "assignment");

    return investigation;
  }

  /**
   * Get an investigation by ID
   */
  getInvestigation(id: string): Investigation | undefined {
    return this.investigations.get(id);
  }

  /**
   * Update investigation status
   */
  updateInvestigationStatus(
    id: string,
    status: Investigation["status"],
    resolution?: string,
  ): Investigation | null {
    const investigation = this.investigations.get(id);
    if (!investigation || !this.currentUser) return null;

    investigation.status = status;
    investigation.updatedAt = now();

    if (status === "resolved") {
      investigation.resolvedAt = now();
      investigation.resolution = resolution;
    }

    investigation.timeline.push({
      id: generateEventId(),
      type: "status_changed",
      description: `Status changed to ${status} by ${this.currentUser.name}`,
      actor: this.currentUser,
      timestamp: now(),
      metadata: { oldStatus: investigation.status, newStatus: status },
    });

    return investigation;
  }

  /**
   * Add a session to investigation
   */
  addSessionToInvestigation(
    investigationId: string,
    sessionId: string,
  ): boolean {
    const investigation = this.investigations.get(investigationId);
    if (!investigation || !this.currentUser) return false;

    if (!investigation.sessionIds.includes(sessionId)) {
      investigation.sessionIds.push(sessionId);
      investigation.updatedAt = now();

      investigation.timeline.push({
        id: generateEventId(),
        type: "session_added",
        description: `Session ${sessionId} added by ${this.currentUser.name}`,
        actor: this.currentUser,
        timestamp: now(),
      });
    }

    return true;
  }

  /**
   * Add comment to investigation
   */
  addComment(
    investigationId: string,
    content: string,
    mentions?: TeamMember[],
  ): Comment | null {
    const investigation = this.investigations.get(investigationId);
    if (!investigation || !this.currentUser) return null;

    const comment: Comment = {
      id: generateEventId(),
      content,
      author: this.currentUser,
      mentions: mentions ?? [],
      createdAt: now(),
      reactions: [],
    };

    investigation.comments.push(comment);
    investigation.updatedAt = now();

    investigation.timeline.push({
      id: generateEventId(),
      type: "comment",
      description: `Comment added by ${this.currentUser.name}`,
      actor: this.currentUser,
      timestamp: now(),
    });

    // Notify mentioned users
    for (const mentioned of mentions ?? []) {
      this.addNotification(mentioned.id, {
        type: "mention",
        title: "You were mentioned",
        message: `${this.currentUser.name} mentioned you in investigation "${investigation.title}"`,
        link: `/investigations/${investigationId}`,
      });
    }

    return comment;
  }

  /**
   * List investigations
   */
  listInvestigations(filter?: {
    status?: Investigation["status"];
    assigneeId?: string;
    tag?: string;
  }): Investigation[] {
    let investigations = Array.from(this.investigations.values());

    if (filter?.status) {
      investigations = investigations.filter((i) => i.status === filter.status);
    }

    if (filter?.assigneeId) {
      investigations = investigations.filter((i) =>
        i.assignees.some((a) => a.id === filter.assigneeId),
      );
    }

    if (filter?.tag) {
      investigations = investigations.filter((i) =>
        i.tags.includes(filter.tag!),
      );
    }

    return investigations.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // =========================================================================
  // Annotation Management
  // =========================================================================

  /**
   * Create an annotation
   */
  createAnnotation(
    type: Annotation["type"],
    content: string,
    target: Annotation["target"],
    options?: {
      position?: Annotation["position"];
      mentions?: TeamMember[];
      visibility?: Annotation["visibility"];
    },
  ): Annotation {
    if (!this.currentUser) {
      throw new Error("Current user not set");
    }

    const annotation: Annotation = {
      id: generateEventId(),
      type,
      content,
      target,
      position: options?.position,
      author: this.currentUser,
      mentions: options?.mentions ?? [],
      visibility: options?.visibility ?? "team",
      createdAt: now(),
      replies: [],
    };

    this.annotations.set(annotation.id, annotation);

    // Notify mentioned users
    for (const mentioned of options?.mentions ?? []) {
      this.addNotification(mentioned.id, {
        type: "mention",
        title: "You were mentioned",
        message: `${this.currentUser.name} mentioned you in an annotation`,
        link: `/${target.type}s/${target.id}#annotation-${annotation.id}`,
      });
    }

    return annotation;
  }

  /**
   * Get annotations for a target
   */
  getAnnotations(target: Annotation["target"]): Annotation[] {
    return Array.from(this.annotations.values())
      .filter((a) => a.target.type === target.type && a.target.id === target.id)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Reply to an annotation
   */
  replyToAnnotation(
    annotationId: string,
    content: string,
    mentions?: TeamMember[],
  ): Comment | null {
    const annotation = this.annotations.get(annotationId);
    if (!annotation || !this.currentUser) return null;

    const reply: Comment = {
      id: generateEventId(),
      content,
      author: this.currentUser,
      mentions: mentions ?? [],
      createdAt: now(),
      reactions: [],
    };

    annotation.replies.push(reply);

    return reply;
  }

  // =========================================================================
  // Sharing
  // =========================================================================

  /**
   * Create a shareable link
   */
  createShareableLink(
    type: ShareableLink["type"],
    targetId: string,
    options?: {
      accessLevel?: ShareableLink["accessLevel"];
      expiresIn?: number; // milliseconds
      password?: string;
    },
  ): ShareableLink {
    if (!this.currentUser) {
      throw new Error("Current user not set");
    }

    const link: ShareableLink = {
      id: generateEventId(),
      type,
      targetId,
      accessLevel: options?.accessLevel ?? "view",
      expiresAt: options?.expiresIn ? now() + options.expiresIn : undefined,
      password: options?.password,
      createdBy: this.currentUser,
      createdAt: now(),
      accessCount: 0,
    };

    this.shareableLinks.set(link.id, link);

    return link;
  }

  /**
   * Access a shareable link
   */
  accessShareableLink(id: string, password?: string): ShareableLink | null {
    const link = this.shareableLinks.get(id);
    if (!link) return null;

    // Check expiration
    if (link.expiresAt && now() > link.expiresAt) {
      return null;
    }

    // Check password
    if (link.password && link.password !== password) {
      return null;
    }

    link.accessCount++;

    return link;
  }

  // =========================================================================
  // Notifications
  // =========================================================================

  /**
   * Get notifications for a user
   */
  getNotifications(userId: string, unreadOnly = false): Notification[] {
    const notifications = this.notifications.get(userId) ?? [];

    if (unreadOnly) {
      return notifications.filter((n) => !n.isRead);
    }

    return notifications;
  }

  /**
   * Mark notification as read
   */
  markNotificationRead(userId: string, notificationId: string): boolean {
    const notifications = this.notifications.get(userId);
    if (!notifications) return false;

    const notification = notifications.find((n) => n.id === notificationId);
    if (!notification) return false;

    notification.isRead = true;
    return true;
  }

  // =========================================================================
  // Knowledge Base
  // =========================================================================

  /**
   * Create a knowledge article
   */
  createKnowledgeArticle(
    title: string,
    content: string,
    category: string,
    options?: {
      tags?: string[];
      relatedSessionIds?: string[];
    },
  ): KnowledgeArticle {
    if (!this.currentUser) {
      throw new Error("Current user not set");
    }

    const article: KnowledgeArticle = {
      id: generateEventId(),
      title,
      content,
      category,
      tags: options?.tags ?? [],
      author: this.currentUser,
      relatedSessionIds: options?.relatedSessionIds,
      createdAt: now(),
      updatedAt: now(),
      viewCount: 0,
    };

    this.knowledgeBase.set(article.id, article);

    return article;
  }

  /**
   * Search knowledge base
   */
  searchKnowledge(query: string): KnowledgeArticle[] {
    const lowerQuery = query.toLowerCase();

    return Array.from(this.knowledgeBase.values())
      .filter(
        (article) =>
          article.title.toLowerCase().includes(lowerQuery) ||
          article.content.toLowerCase().includes(lowerQuery) ||
          article.tags.some((t) => t.toLowerCase().includes(lowerQuery)),
      )
      .sort((a, b) => b.viewCount - a.viewCount);
  }

  /**
   * Get article by ID
   */
  getKnowledgeArticle(id: string): KnowledgeArticle | null {
    const article = this.knowledgeBase.get(id);
    if (article) {
      article.viewCount++;
    }
    return article ?? null;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private addNotification(
    userId: string,
    notification: Omit<Notification, "id" | "isRead" | "createdAt">,
  ): void {
    if (!this.config.enableNotifications) return;

    const fullNotification: Notification = {
      ...notification,
      id: generateEventId(),
      isRead: false,
      createdAt: now(),
    };

    if (!this.notifications.has(userId)) {
      this.notifications.set(userId, []);
    }

    this.notifications.get(userId)!.unshift(fullNotification);
  }

  private notifyAssignees(
    investigation: Investigation,
    type: Notification["type"],
  ): void {
    for (const assignee of investigation.assignees) {
      if (assignee.id !== this.currentUser?.id) {
        this.addNotification(assignee.id, {
          type,
          title: "New Assignment",
          message: `You were assigned to investigation "${investigation.title}"`,
          link: `/investigations/${investigation.id}`,
        });
      }
    }
  }
}
