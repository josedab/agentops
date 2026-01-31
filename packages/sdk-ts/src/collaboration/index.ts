/**
 * AgentOps SDK - Collaboration Module
 *
 * Exports for team collaboration features.
 */

export { CollaborationHub } from "./hub.js";
export { AnnotationManager } from "./annotations.js";

export type {
  Investigation,
  TimelineEvent,
  Annotation,
  Comment,
  Reaction,
  TeamMember,
  Team,
  Attachment,
  ShareableLink,
  Notification,
  KnowledgeArticle,
  CollaborationConfig,
} from "./types.js";

export type {
  AnnotationConfig,
  Annotation as EnhancedAnnotation,
  AnnotationAuthor,
  Mention,
  Attachment as AnnotationAttachment,
  AnnotationReply,
  Reaction as AnnotationReaction,
  Resolution,
  AnnotationFilter,
  AnnotationStats,
  SharedInsight,
} from "./annotations.js";
