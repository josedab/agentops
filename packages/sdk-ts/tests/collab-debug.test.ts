import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CollabDebugEngine,
  type CollabDebugConfig,
  type ParticipantRole,
} from "../src/collab-debug";
import { setClock, resetClock } from "../src/utils";

describe("CollabDebugEngine", () => {
  let engine: CollabDebugEngine;
  const mockConfig: CollabDebugConfig = {
    enabled: true,
    maxParticipants: 10,
    sessionTTLMs: 3_600_000,
    debug: false,
  };

  beforeEach(() => {
    resetClock();
    engine = new CollabDebugEngine(mockConfig);
  });

  afterEach(() => {
    resetClock();
  });

  // ==========================================================================
  // Session Management
  // ==========================================================================

  describe("session management", () => {
    it("should create a session and return it", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.traceSessionId).toBe("trace-1");
      expect(session.status).toBe("active");
      expect(session.participants.size).toBe(1);
    });

    it("should set creator as owner with first color", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const participants = Array.from(session.participants.values());
      expect(participants[0].name).toBe("Alice");
      expect(participants[0].role).toBe("owner");
      expect(participants[0].color).toBe("#E53E3E");
    });

    it("should close a session", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const result = engine.closeSession(session.id);
      expect(result).toBe(true);

      const closed = engine.getSession(session.id);
      expect(closed?.status).toBe("closed");
    });

    it("should return false when closing non-existent session", () => {
      expect(engine.closeSession("nonexistent")).toBe(false);
    });

    it("should get session by id", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const retrieved = engine.getSession(session.id);
      expect(retrieved).toBe(session);
    });

    it("should return undefined for unknown session id", () => {
      expect(engine.getSession("nonexistent")).toBeUndefined();
    });

    it("should list all sessions", () => {
      engine.createSession("trace-1", { name: "Alice" });
      engine.createSession("trace-2", { name: "Bob" });
      const sessions = engine.listSessions();
      expect(sessions).toHaveLength(2);
    });

    it("should list sessions filtered by status", () => {
      const s1 = engine.createSession("trace-1", { name: "Alice" });
      engine.createSession("trace-2", { name: "Bob" });
      engine.closeSession(s1.id);

      expect(engine.listSessions({ status: "active" })).toHaveLength(1);
      expect(engine.listSessions({ status: "closed" })).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Invites & Joining
  // ==========================================================================

  describe("invite and join", () => {
    it("should create an invite token", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const invite = engine.createInvite(session.id, "editor");
      expect(invite.token).toBeDefined();
      expect(invite.sessionId).toBe(session.id);
      expect(invite.role).toBe("editor");
      expect(invite.usedCount).toBe(0);
    });

    it("should allow joining with a valid invite", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const invite = engine.createInvite(session.id, "viewer");
      const participant = engine.joinWithInvite(invite.token, {
        name: "Bob",
      });
      expect(participant.name).toBe("Bob");
      expect(participant.role).toBe("viewer");
      expect(session.participants.size).toBe(2);
    });

    it("should throw on invalid invite token", () => {
      expect(() => engine.joinWithInvite("bad-token", { name: "Bob" })).toThrow(
        "Invalid invite token",
      );
    });

    it("should throw on expired invite token", () => {
      let time = 1000;
      setClock({ now: () => time });

      const expiredEngine = new CollabDebugEngine({
        ...mockConfig,
        sessionTTLMs: 100_000_000,
      });
      const session = expiredEngine.createSession("trace-1", {
        name: "Alice",
      });
      const invite = expiredEngine.createInvite(session.id, "editor", {
        ttlMs: 100,
      });

      time = 2000; // well past the 100ms TTL
      expect(() =>
        expiredEngine.joinWithInvite(invite.token, { name: "Bob" }),
      ).toThrow("expired");
    });

    it("should throw when invite has reached max uses", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const invite = engine.createInvite(session.id, "editor", {
        maxUses: 1,
      });
      engine.joinWithInvite(invite.token, { name: "Bob" });
      expect(() =>
        engine.joinWithInvite(invite.token, { name: "Charlie" }),
      ).toThrow("maximum uses");
    });

    it("should throw on creating invite for non-existent session", () => {
      expect(() => engine.createInvite("nonexistent", "editor")).toThrow(
        "Session not found",
      );
    });

    it("should allow multi-use invites", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const invite = engine.createInvite(session.id, "viewer", {
        maxUses: 3,
      });
      engine.joinWithInvite(invite.token, { name: "Bob" });
      engine.joinWithInvite(invite.token, { name: "Charlie" });
      engine.joinWithInvite(invite.token, { name: "Dave" });
      expect(session.participants.size).toBe(4);
    });
  });

  // ==========================================================================
  // Participant Management
  // ==========================================================================

  describe("participant management", () => {
    it("should remove a participant", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const invite = engine.createInvite(session.id, "editor");
      const bob = engine.joinWithInvite(invite.token, { name: "Bob" });

      const result = engine.removeParticipant(session.id, bob.id);
      expect(result).toBe(true);
      expect(session.participants.size).toBe(1);
    });

    it("should return false when removing non-existent participant", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      expect(engine.removeParticipant(session.id, "nonexistent")).toBe(false);
    });

    it("should get participants for a session", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const invite = engine.createInvite(session.id, "editor", { maxUses: 2 });
      engine.joinWithInvite(invite.token, { name: "Bob" });

      const participants = engine.getParticipants(session.id);
      expect(participants).toHaveLength(2);
      expect(participants.map((p) => p.name)).toContain("Alice");
      expect(participants.map((p) => p.name)).toContain("Bob");
    });

    it("should return empty array for non-existent session participants", () => {
      expect(engine.getParticipants("nonexistent")).toEqual([]);
    });

    it("should enforce max participants", () => {
      const smallEngine = new CollabDebugEngine({
        ...mockConfig,
        maxParticipants: 2,
      });
      const session = smallEngine.createSession("trace-1", { name: "Alice" });
      const invite = smallEngine.createInvite(session.id, "editor", {
        maxUses: 5,
      });
      smallEngine.joinWithInvite(invite.token, { name: "Bob" });
      expect(() =>
        smallEngine.joinWithInvite(invite.token, { name: "Charlie" }),
      ).toThrow("maximum participants");
    });
  });

  // ==========================================================================
  // Cursor Tracking
  // ==========================================================================

  describe("cursor tracking", () => {
    it("should update cursor position", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];

      engine.updateCursor(session.id, owner.id, 5);
      expect(owner.cursorPosition).toBe(5);
    });

    it("should get cursors for all participants with positions", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];
      const invite = engine.createInvite(session.id, "editor");
      const bob = engine.joinWithInvite(invite.token, { name: "Bob" });

      engine.updateCursor(session.id, owner.id, 3);
      engine.updateCursor(session.id, bob.id, 7);

      const cursors = engine.getCursors(session.id);
      expect(cursors).toHaveLength(2);
      expect(cursors.find((c) => c.name === "Alice")?.stepIndex).toBe(3);
      expect(cursors.find((c) => c.name === "Bob")?.stepIndex).toBe(7);
    });

    it("should not include participants without cursor positions", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const cursors = engine.getCursors(session.id);
      expect(cursors).toHaveLength(0);
    });

    it("should return empty array for non-existent session cursors", () => {
      expect(engine.getCursors("nonexistent")).toEqual([]);
    });
  });

  // ==========================================================================
  // Annotations
  // ==========================================================================

  describe("annotations", () => {
    it("should add an annotation", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];

      const annotation = engine.addAnnotation(session.id, {
        participantId: owner.id,
        stepIndex: 2,
        content: "This step looks suspicious",
      });

      expect(annotation.id).toBeDefined();
      expect(annotation.content).toBe("This step looks suspicious");
      expect(annotation.resolved).toBe(false);
      expect(annotation.reactions).toEqual([]);
    });

    it("should resolve an annotation", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];
      const annotation = engine.addAnnotation(session.id, {
        participantId: owner.id,
        stepIndex: 2,
        content: "Bug here",
      });

      const result = engine.resolveAnnotation(session.id, annotation.id);
      expect(result).toBe(true);
      expect(annotation.resolved).toBe(true);
    });

    it("should return false resolving already resolved annotation", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];
      const annotation = engine.addAnnotation(session.id, {
        participantId: owner.id,
        stepIndex: 2,
        content: "Bug",
      });
      engine.resolveAnnotation(session.id, annotation.id);
      expect(engine.resolveAnnotation(session.id, annotation.id)).toBe(false);
    });

    it("should add reactions to an annotation", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];
      const annotation = engine.addAnnotation(session.id, {
        participantId: owner.id,
        stepIndex: 1,
        content: "Nice catch",
      });

      engine.addReaction(session.id, annotation.id, owner.id, "👍");
      expect(annotation.reactions).toHaveLength(1);
      expect(annotation.reactions[0].emoji).toBe("👍");
    });

    it("should filter annotations by step index", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];

      engine.addAnnotation(session.id, {
        participantId: owner.id,
        stepIndex: 1,
        content: "A",
      });
      engine.addAnnotation(session.id, {
        participantId: owner.id,
        stepIndex: 2,
        content: "B",
      });
      engine.addAnnotation(session.id, {
        participantId: owner.id,
        stepIndex: 1,
        content: "C",
      });

      const filtered = engine.getAnnotations(session.id, { stepIndex: 1 });
      expect(filtered).toHaveLength(2);
    });

    it("should filter annotations by resolved status", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];

      const a1 = engine.addAnnotation(session.id, {
        participantId: owner.id,
        stepIndex: 1,
        content: "A",
      });
      engine.addAnnotation(session.id, {
        participantId: owner.id,
        stepIndex: 2,
        content: "B",
      });
      engine.resolveAnnotation(session.id, a1.id);

      expect(
        engine.getAnnotations(session.id, { resolved: true }),
      ).toHaveLength(1);
      expect(
        engine.getAnnotations(session.id, { resolved: false }),
      ).toHaveLength(1);
    });

    it("should return empty array for non-existent session annotations", () => {
      expect(engine.getAnnotations("nonexistent")).toEqual([]);
    });

    it("should throw when adding annotation to non-existent session", () => {
      expect(() =>
        engine.addAnnotation("nonexistent", {
          participantId: "p1",
          stepIndex: 0,
          content: "test",
        }),
      ).toThrow("Session not found");
    });
  });

  // ==========================================================================
  // Breakpoints
  // ==========================================================================

  describe("breakpoints", () => {
    it("should add a breakpoint", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];

      const bp = engine.addBreakpoint(session.id, {
        createdBy: owner.id,
        stepIndex: 5,
        enabled: true,
      });

      expect(bp.id).toBeDefined();
      expect(bp.stepIndex).toBe(5);
      expect(bp.enabled).toBe(true);
    });

    it("should add a breakpoint with condition", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];

      const bp = engine.addBreakpoint(session.id, {
        createdBy: owner.id,
        stepIndex: 3,
        condition: "token count > 1000",
        enabled: true,
      });

      expect(bp.condition).toBe("token count > 1000");
    });

    it("should remove a breakpoint", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];
      const bp = engine.addBreakpoint(session.id, {
        createdBy: owner.id,
        stepIndex: 5,
        enabled: true,
      });

      const result = engine.removeBreakpoint(session.id, bp.id);
      expect(result).toBe(true);
      expect(engine.getBreakpoints(session.id)).toHaveLength(0);
    });

    it("should return false when removing non-existent breakpoint", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      expect(engine.removeBreakpoint(session.id, "nonexistent")).toBe(false);
    });

    it("should get all breakpoints for a session", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];

      engine.addBreakpoint(session.id, {
        createdBy: owner.id,
        stepIndex: 1,
        enabled: true,
      });
      engine.addBreakpoint(session.id, {
        createdBy: owner.id,
        stepIndex: 3,
        enabled: false,
      });

      expect(engine.getBreakpoints(session.id)).toHaveLength(2);
    });

    it("should return empty array for non-existent session breakpoints", () => {
      expect(engine.getBreakpoints("nonexistent")).toEqual([]);
    });

    it("should throw when adding breakpoint to non-existent session", () => {
      expect(() =>
        engine.addBreakpoint("nonexistent", {
          createdBy: "p1",
          stepIndex: 0,
          enabled: true,
        }),
      ).toThrow("Session not found");
    });
  });

  // ==========================================================================
  // Activity Log
  // ==========================================================================

  describe("activity log", () => {
    it("should record session creation as joined activity", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const log = engine.getActivityLog(session.id);
      expect(log).toHaveLength(1);
      expect(log[0].action).toBe("joined");
    });

    it("should record participant joining", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const invite = engine.createInvite(session.id, "editor");
      engine.joinWithInvite(invite.token, { name: "Bob" });

      const log = engine.getActivityLog(session.id);
      const joinEvents = log.filter((e) => e.action === "joined");
      expect(joinEvents).toHaveLength(2);
    });

    it("should record participant leaving", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const invite = engine.createInvite(session.id, "editor");
      const bob = engine.joinWithInvite(invite.token, { name: "Bob" });
      engine.removeParticipant(session.id, bob.id);

      const log = engine.getActivityLog(session.id);
      const leftEvents = log.filter((e) => e.action === "left");
      expect(leftEvents).toHaveLength(1);
    });

    it("should record annotations and breakpoints", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];

      engine.addAnnotation(session.id, {
        participantId: owner.id,
        stepIndex: 1,
        content: "test",
      });
      engine.addBreakpoint(session.id, {
        createdBy: owner.id,
        stepIndex: 2,
        enabled: true,
      });

      const log = engine.getActivityLog(session.id);
      expect(log.some((e) => e.action === "added_annotation")).toBe(true);
      expect(log.some((e) => e.action === "added_breakpoint")).toBe(true);
    });

    it("should record cursor movements", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const owner = Array.from(session.participants.values())[0];
      engine.updateCursor(session.id, owner.id, 5);

      const log = engine.getActivityLog(session.id);
      expect(log.some((e) => e.action === "moved_cursor")).toBe(true);
    });

    it("should return empty array for non-existent session log", () => {
      expect(engine.getActivityLog("nonexistent")).toEqual([]);
    });
  });

  // ==========================================================================
  // Metrics
  // ==========================================================================

  describe("metrics", () => {
    it("should return correct metrics", () => {
      const s1 = engine.createSession("trace-1", { name: "Alice" });
      engine.createSession("trace-2", { name: "Bob" });

      const invite = engine.createInvite(s1.id, "editor");
      engine.joinWithInvite(invite.token, { name: "Charlie" });

      const owner = Array.from(s1.participants.values())[0];
      engine.addAnnotation(s1.id, {
        participantId: owner.id,
        stepIndex: 0,
        content: "test",
      });
      engine.addBreakpoint(s1.id, {
        createdBy: owner.id,
        stepIndex: 1,
        enabled: true,
      });

      const metrics = engine.getMetrics();
      expect(metrics.totalSessions).toBe(2);
      expect(metrics.activeSessions).toBe(2);
      expect(metrics.totalParticipants).toBe(3);
      expect(metrics.avgParticipantsPerSession).toBe(1.5);
      expect(metrics.totalAnnotations).toBe(1);
      expect(metrics.totalBreakpoints).toBe(1);
    });

    it("should report zero metrics for empty engine", () => {
      const metrics = engine.getMetrics();
      expect(metrics.totalSessions).toBe(0);
      expect(metrics.activeSessions).toBe(0);
      expect(metrics.avgParticipantsPerSession).toBe(0);
    });
  });

  // ==========================================================================
  // Session Expiry
  // ==========================================================================

  describe("session expiry", () => {
    it("should auto-expire sessions based on TTL", () => {
      let time = 1000;
      setClock({ now: () => time });

      const shortEngine = new CollabDebugEngine({
        ...mockConfig,
        sessionTTLMs: 500,
      });
      shortEngine.createSession("trace-1", { name: "Alice" });

      time = 2000; // past the 500ms TTL
      const sessions = shortEngine.listSessions({ status: "active" });
      expect(sessions).toHaveLength(0);
    });

    it("should not allow actions on expired sessions", () => {
      let time = 1000;
      setClock({ now: () => time });

      const shortEngine = new CollabDebugEngine({
        ...mockConfig,
        sessionTTLMs: 500,
      });
      const session = shortEngine.createSession("trace-1", { name: "Alice" });

      time = 2000; // past the 500ms TTL
      const result = shortEngine.closeSession(session.id);
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Participant Colors
  // ==========================================================================

  describe("participant colors", () => {
    it("should assign different colors to participants", () => {
      const session = engine.createSession("trace-1", { name: "Alice" });
      const invite = engine.createInvite(session.id, "editor", { maxUses: 3 });

      const bob = engine.joinWithInvite(invite.token, { name: "Bob" });
      const charlie = engine.joinWithInvite(invite.token, {
        name: "Charlie",
      });

      const participants = engine.getParticipants(session.id);
      const colors = participants.map((p) => p.color);

      // First three should have different colors
      expect(new Set(colors).size).toBe(3);
    });
  });
});
