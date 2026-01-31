import { describe, it, expect, beforeEach } from "vitest";
import { CollaborationHub } from "../src/collaboration";
import type { CollaborationConfig, TeamMember } from "../src/collaboration";

describe("CollaborationHub", () => {
  let hub: CollaborationHub;
  const testUser: TeamMember = {
    id: "user-123",
    name: "Test User",
    email: "test@example.com",
    role: "admin",
  };
  const mockConfig: CollaborationConfig = {
    enabled: true,
    teamId: "team-123",
    currentUser: testUser,
    enableNotifications: true,
  };

  beforeEach(() => {
    hub = new CollaborationHub(mockConfig);
  });

  describe("initialization", () => {
    it("should create hub with config", () => {
      expect(hub).toBeInstanceOf(CollaborationHub);
    });

    it("should report enabled status", () => {
      expect(hub.isEnabled).toBe(true);
    });

    it("should expose current user", () => {
      expect(hub.currentUser).toEqual(testUser);
    });
  });

  describe("investigations", () => {
    it("should create an investigation", () => {
      const investigation = hub.createInvestigation("High Latency Issue", {
        description: "Investigating sudden latency spikes",
        sessionIds: ["session-1", "session-2"],
      });

      expect(investigation).toBeDefined();
      expect(investigation.id).toBeDefined();
      expect(investigation.title).toBe("High Latency Issue");
      expect(investigation.status).toBe("open");
    });

    it("should get investigation by ID", () => {
      const created = hub.createInvestigation("Test Investigation");
      const retrieved = hub.getInvestigation(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it("should list investigations", () => {
      hub.createInvestigation("Inv 1");
      hub.createInvestigation("Inv 2");

      const investigations = hub.listInvestigations();
      expect(investigations.length).toBeGreaterThanOrEqual(2);
    });

    it("should update investigation status", () => {
      const investigation = hub.createInvestigation("Status Test");
      hub.updateInvestigationStatus(investigation.id, "in-progress");

      const updated = hub.getInvestigation(investigation.id);
      expect(updated?.status).toBe("in-progress");
    });

    it("should close investigation with resolution", () => {
      const investigation = hub.createInvestigation("To Close");
      hub.updateInvestigationStatus(
        investigation.id,
        "resolved",
        "Fixed the bug",
      );

      const closed = hub.getInvestigation(investigation.id);
      expect(closed?.status).toBe("resolved");
      expect(closed?.resolution).toBe("Fixed the bug");
    });
  });

  describe("annotations", () => {
    it("should create an annotation", () => {
      const annotation = hub.createAnnotation(
        "issue",
        "This response seems wrong",
        { type: "session", id: "session-123" },
        { visibility: "team" },
      );

      expect(annotation).toBeDefined();
      expect(annotation.id).toBeDefined();
      expect(annotation.content).toBe("This response seems wrong");
    });

    it("should get annotations for a target", () => {
      hub.createAnnotation("note", "A1", { type: "session", id: "session-x" });
      hub.createAnnotation("note", "A2", { type: "session", id: "session-x" });

      const annotations = hub.getAnnotations({
        type: "session",
        id: "session-x",
      });
      expect(annotations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("comments", () => {
    it("should add comment to investigation", () => {
      const investigation = hub.createInvestigation("Comment Test");
      const comment = hub.addComment(
        investigation.id,
        "I think I found the issue",
      );

      expect(comment).toBeDefined();
      expect(comment?.content).toBe("I think I found the issue");
    });

    it("should get comments from investigation", () => {
      const investigation = hub.createInvestigation("Comments List Test");
      hub.addComment(investigation.id, "Comment 1");
      hub.addComment(investigation.id, "Comment 2");

      const updated = hub.getInvestigation(investigation.id);
      expect(updated?.comments.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("shareable links", () => {
    it("should create a shareable link", () => {
      const link = hub.createShareableLink("session", "session-123", {
        expiresIn: 24 * 60 * 60 * 1000,
      });

      expect(link).toBeDefined();
      expect(link.id).toBeDefined();
      expect(link.targetId).toBe("session-123");
    });

    it("should access shareable link", () => {
      const created = hub.createShareableLink("session", "session-1");
      const accessed = hub.accessShareableLink(created.id);

      expect(accessed).toBeDefined();
      expect(accessed?.targetId).toBe("session-1");
      expect(accessed?.accessCount).toBe(1);
    });
  });

  describe("knowledge base", () => {
    it("should create knowledge article", () => {
      const article = hub.createKnowledgeArticle(
        "How to Debug Latency Issues",
        "Step 1: Check the metrics...",
        "debugging",
        { tags: ["latency"] },
      );

      expect(article).toBeDefined();
      expect(article.id).toBeDefined();
      expect(article.title).toBe("How to Debug Latency Issues");
    });

    it("should get article by ID", () => {
      const created = hub.createKnowledgeArticle(
        "Test Article",
        "Content",
        "general",
      );
      const retrieved = hub.getKnowledgeArticle(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe("Test Article");
    });

    it("should search articles by keyword", () => {
      hub.createKnowledgeArticle(
        "Python Tips",
        "Use type hints",
        "programming",
        { tags: ["python"] },
      );
      hub.createKnowledgeArticle(
        "JavaScript Guide",
        "Use async/await",
        "programming",
        { tags: ["javascript"] },
      );

      const results = hub.searchKnowledge("Python");
      expect(results.some((a) => a.title.includes("Python"))).toBe(true);
    });
  });

  describe("without current user", () => {
    it("should throw when creating investigation without user", () => {
      const noUserHub = new CollaborationHub({ enabled: true });

      expect(() => noUserHub.createInvestigation("Test")).toThrow(
        "Current user not set",
      );
    });
  });
});
