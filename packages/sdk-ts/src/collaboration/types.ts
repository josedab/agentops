/**
 * AgentOps SDK - Team Collaboration Types
 *
 * Type definitions for team collaboration features.
 */

// ============================================================================
// Investigation Types
// ============================================================================

export interface Investigation {
  /** Unique identifier */
  id: string;

  /** Investigation title */
  title: string;

  /** Description */
  description?: string;

  /** Current status */
  status: "open" | "in_progress" | "resolved" | "closed";

  /** Priority level */
  priority: "low" | "medium" | "high" | "critical";

  /** Creator */
  createdBy: TeamMember;

  /** Assigned team members */
  assignees: TeamMember[];

  /** Related session IDs */
  sessionIds: string[];

  /** Related anomaly IDs */
  anomalyIds?: string[];

  /** Tags */
  tags: string[];

  /** Timeline of events */
  timeline: TimelineEvent[];

  /** Comments/discussion */
  comments: Comment[];

  /** Attachments */
  attachments: Attachment[];

  /** Creation timestamp */
  createdAt: number;

  /** Last updated */
  updatedAt: number;

  /** Resolution timestamp */
  resolvedAt?: number;

  /** Resolution summary */
  resolution?: string;
}

export interface TimelineEvent {
  id: string;
  type:
    | "created"
    | "assigned"
    | "status_changed"
    | "comment"
    | "session_added"
    | "resolved";
  description: string;
  actor: TeamMember;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Annotation Types
// ============================================================================

export interface Annotation {
  /** Unique identifier */
  id: string;

  /** Type of annotation */
  type: "note" | "bug" | "insight" | "question" | "warning";

  /** Content */
  content: string;

  /** Target entity */
  target: {
    type: "session" | "event" | "prompt" | "response";
    id: string;
  };

  /** Position within content (if applicable) */
  position?: {
    start: number;
    end: number;
  };

  /** Author */
  author: TeamMember;

  /** Mentions */
  mentions: TeamMember[];

  /** Visibility */
  visibility: "public" | "team" | "private";

  /** Creation timestamp */
  createdAt: number;

  /** Replies */
  replies: Comment[];
}

// ============================================================================
// Comment Types
// ============================================================================

export interface Comment {
  id: string;
  content: string;
  author: TeamMember;
  mentions: TeamMember[];
  createdAt: number;
  updatedAt?: number;
  reactions: Reaction[];
}

export interface Reaction {
  emoji: string;
  users: TeamMember[];
}

// ============================================================================
// Team Types
// ============================================================================

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role?: "admin" | "member" | "viewer";
}

export interface Team {
  id: string;
  name: string;
  members: TeamMember[];
  createdAt: number;
}

// ============================================================================
// Attachment Types
// ============================================================================

export interface Attachment {
  id: string;
  name: string;
  type: "image" | "file" | "link" | "session_export";
  url: string;
  size?: number;
  uploadedBy: TeamMember;
  uploadedAt: number;
}

// ============================================================================
// Sharing Types
// ============================================================================

export interface ShareableLink {
  id: string;
  type: "session" | "investigation" | "dashboard";
  targetId: string;
  accessLevel: "view" | "comment" | "edit";
  expiresAt?: number;
  password?: string;
  createdBy: TeamMember;
  createdAt: number;
  accessCount: number;
}

// ============================================================================
// Notification Types
// ============================================================================

export interface Notification {
  id: string;
  type: "mention" | "assignment" | "status_change" | "comment" | "share";
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: number;
}

// ============================================================================
// Knowledge Base Types
// ============================================================================

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  author: TeamMember;
  relatedSessionIds?: string[];
  createdAt: number;
  updatedAt: number;
  viewCount: number;
}

// ============================================================================
// Configuration
// ============================================================================

export interface CollaborationConfig {
  enabled: boolean;
  teamId?: string;
  currentUser?: TeamMember;
  enableNotifications?: boolean;
  enableRealtime?: boolean;
}
