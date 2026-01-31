/**
 * Tests for Enhanced Collaboration Annotations (Feature 4)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AnnotationManager } from "../src/collaboration/annotations.js";
import type {
  AnnotationConfig,
  AnnotationAuthor,
} from "../src/collaboration/annotations.js";

describe("AnnotationManager", () => {
  let manager: AnnotationManager;
  let defaultConfig: AnnotationConfig;
  let testAuthor: AnnotationAuthor;

  beforeEach(() => {
    defaultConfig = {
      enabled: true,
      maxAnnotationLength: 10000,
      allowMentions: true,
      allowAttachments: true,
    };
    manager = new AnnotationManager(defaultConfig);
    testAuthor = {
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
    };
  });

  describe("Annotation CRUD", () => {
    it("should create an annotation", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "This is a test annotation",
      });

      expect(annotation.id).toBeDefined();
      expect(annotation.targetId).toBe("session-123");
      expect(annotation.content).toBe("This is a test annotation");
      expect(annotation.status).toBe("open");
    });

    it("should get annotation by ID", () => {
      const created = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Test",
      });

      const retrieved = manager.getAnnotation(created.id);
      expect(retrieved).toEqual(created);
    });

    it("should update annotation", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Original content",
      });

      const updated = manager.updateAnnotation(annotation.id, {
        content: "Updated content",
        priority: "high",
      });

      expect(updated?.content).toBe("Updated content");
      expect(updated?.priority).toBe("high");
    });

    it("should delete annotation", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Test",
      });

      const deleted = manager.deleteAnnotation(annotation.id);
      expect(deleted).toBe(true);
      expect(manager.getAnnotation(annotation.id)).toBeUndefined();
    });

    it("should list annotations with filters", () => {
      manager.createAnnotation({
        targetId: "session-1",
        targetType: "session",
        author: testAuthor,
        content: "Test 1",
        priority: "high",
      });
      manager.createAnnotation({
        targetId: "session-2",
        targetType: "session",
        author: testAuthor,
        content: "Test 2",
        priority: "low",
      });

      const highPriority = manager.listAnnotations({ priority: "high" });
      expect(highPriority.length).toBe(1);
      expect(highPriority[0].priority).toBe("high");
    });
  });

  describe("Mentions", () => {
    it("should parse @mentions from content", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Hey @[John Doe](user-2), please check this out",
      });

      expect(annotation.mentions.length).toBe(1);
      expect(annotation.mentions[0].userName).toBe("John Doe");
      expect(annotation.mentions[0].userId).toBe("user-2");
    });

    it("should parse multiple mentions", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Assigning to @[Alice](user-2) and @[Bob](user-3)",
      });

      expect(annotation.mentions.length).toBe(2);
    });

    it("should call onMention callback", () => {
      const mentionedUsers: string[] = [];
      const managerWithCallback = new AnnotationManager({
        ...defaultConfig,
        onMention: (mention) => mentionedUsers.push(mention.userId),
      });

      managerWithCallback.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Hey @[John](user-2)",
      });

      expect(mentionedUsers).toContain("user-2");
    });
  });

  describe("Replies & Threads", () => {
    it("should add reply to annotation", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Main annotation",
      });

      const reply = manager.addReply(annotation.id, {
        author: { id: "user-2", name: "Another User" },
        content: "This is a reply",
      });

      expect(reply).not.toBeNull();
      expect(reply!.content).toBe("This is a reply");

      const updated = manager.getAnnotation(annotation.id);
      expect(updated?.replies.length).toBe(1);
    });

    it("should edit reply", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Main annotation",
      });

      const reply = manager.addReply(annotation.id, {
        author: testAuthor,
        content: "Original reply",
      });

      const edited = manager.editReply(
        annotation.id,
        reply!.id,
        "Edited reply",
      );
      expect(edited?.content).toBe("Edited reply");
      expect(edited?.editedAt).toBeDefined();
    });

    it("should delete reply", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Main annotation",
      });

      const reply = manager.addReply(annotation.id, {
        author: testAuthor,
        content: "Reply to delete",
      });

      const deleted = manager.deleteReply(annotation.id, reply!.id);
      expect(deleted).toBe(true);

      const updated = manager.getAnnotation(annotation.id);
      expect(updated?.replies.length).toBe(0);
    });
  });

  describe("Reactions", () => {
    it("should add reaction to annotation", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Test",
      });

      manager.addReaction(annotation.id, "👍", "user-2");

      const updated = manager.getAnnotation(annotation.id);
      expect(updated?.reactions.length).toBe(1);
      expect(updated?.reactions[0].emoji).toBe("👍");
      expect(updated?.reactions[0].count).toBe(1);
    });

    it("should increment count for same reaction", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Test",
      });

      manager.addReaction(annotation.id, "👍", "user-2");
      manager.addReaction(annotation.id, "👍", "user-3");

      const updated = manager.getAnnotation(annotation.id);
      expect(updated?.reactions[0].count).toBe(2);
    });

    it("should remove reaction", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Test",
      });

      manager.addReaction(annotation.id, "👍", "user-2");
      manager.removeReaction(annotation.id, "👍", "user-2");

      const updated = manager.getAnnotation(annotation.id);
      expect(updated?.reactions.length).toBe(0);
    });
  });

  describe("Resolution", () => {
    it("should resolve annotation", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Issue to fix",
      });

      const resolved = manager.resolveAnnotation(annotation.id, {
        resolvedBy: testAuthor,
        resolution: "fixed",
        comment: "Fixed in PR #123",
      });

      expect(resolved?.status).toBe("resolved");
      expect(resolved?.resolution?.resolution).toBe("fixed");
      expect(resolved?.resolvedAt).toBeDefined();
    });

    it("should reopen annotation", () => {
      const annotation = manager.createAnnotation({
        targetId: "session-123",
        targetType: "session",
        author: testAuthor,
        content: "Issue",
      });

      manager.resolveAnnotation(annotation.id, {
        resolvedBy: testAuthor,
        resolution: "fixed",
      });

      const reopened = manager.reopenAnnotation(annotation.id);
      expect(reopened?.status).toBe("open");
      expect(reopened?.resolution).toBeUndefined();
    });
  });

  describe("Shared Insights", () => {
    it("should create shared insight", () => {
      const insight = manager.createInsight({
        title: "Common failure pattern",
        description: "Discovered a common failure pattern in auth flows",
        author: testAuthor,
        tags: ["auth", "failure"],
        visibility: "team",
      });

      expect(insight.id).toBeDefined();
      expect(insight.title).toBe("Common failure pattern");
      expect(insight.visibility).toBe("team");
    });

    it("should list insights", () => {
      manager.createInsight({
        title: "Insight 1",
        description: "Description 1",
        author: testAuthor,
        tags: ["tag1"],
      });
      manager.createInsight({
        title: "Insight 2",
        description: "Description 2",
        author: testAuthor,
        tags: ["tag2"],
      });

      const all = manager.listInsights();
      expect(all.length).toBe(2);
    });

    it("should like and bookmark insight", () => {
      const insight = manager.createInsight({
        title: "Useful insight",
        description: "Very helpful",
        author: testAuthor,
      });

      manager.likeInsight(insight.id);
      manager.bookmarkInsight(insight.id);

      const updated = manager.getInsight(insight.id);
      expect(updated?.likes).toBe(1);
      expect(updated?.bookmarks).toBe(1);
    });
  });

  describe("Statistics", () => {
    it("should calculate annotation stats", () => {
      manager.createAnnotation({
        targetId: "session-1",
        targetType: "session",
        author: testAuthor,
        content: "Open issue",
        priority: "high",
      });

      manager.createAnnotation({
        targetId: "session-2",
        targetType: "session",
        author: testAuthor,
        content: "Low priority",
        priority: "low",
      });

      const stats = manager.getStats();
      expect(stats.total).toBe(2);
      expect(stats.open).toBe(2);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.low).toBe(1);
    });
  });

  describe("Validation", () => {
    it("should reject annotation when disabled", () => {
      const disabledManager = new AnnotationManager({ enabled: false });

      expect(() =>
        disabledManager.createAnnotation({
          targetId: "session-123",
          targetType: "session",
          author: testAuthor,
          content: "Test",
        }),
      ).toThrow("Annotations are disabled");
    });

    it("should reject annotation exceeding max length", () => {
      const limitedManager = new AnnotationManager({
        enabled: true,
        maxAnnotationLength: 10,
      });

      expect(() =>
        limitedManager.createAnnotation({
          targetId: "session-123",
          targetType: "session",
          author: testAuthor,
          content: "This is too long",
        }),
      ).toThrow("exceeds maximum length");
    });
  });

  describe("Export/Import", () => {
    it("should export annotations", () => {
      manager.createAnnotation({
        targetId: "session-1",
        targetType: "session",
        author: testAuthor,
        content: "Annotation 1",
      });
      manager.createAnnotation({
        targetId: "session-1",
        targetType: "session",
        author: testAuthor,
        content: "Annotation 2",
      });

      const exported = manager.exportAnnotations("session-1");
      expect(exported.length).toBe(2);
    });

    it("should import annotations", () => {
      manager.createAnnotation({
        targetId: "session-1",
        targetType: "session",
        author: testAuthor,
        content: "Test",
      });

      const allExported = manager.exportAnnotations();
      const newManager = new AnnotationManager(defaultConfig);
      const imported = newManager.importAnnotations(allExported);
      expect(imported).toBe(1);
    });
  });
});
