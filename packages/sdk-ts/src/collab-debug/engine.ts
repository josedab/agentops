/**
 * AgentOps SDK - Live Collaboration Debugger Engine
 *
 * Enables real-time collaborative debugging of agent trace sessions
 * with shared cursors, annotations, breakpoints, and activity tracking.
 */

import type {
  CollabDebugConfig,
  ResolvedCollabDebugConfig,
  Participant,
  ParticipantRole,
  DebugSession,
  SharedAnnotation,
  SharedBreakpoint,
  ActivityEntry,
  ActivityAction,
  InviteToken,
  CollabDebugMetrics,
} from "./types.js";
import { generateEventId, now } from "../utils.js";

const DEFAULT_CONFIG: ResolvedCollabDebugConfig = {
  enabled: true,
  maxParticipants: 10,
  sessionTTLMs: 3_600_000,
  debug: false,
};

const PARTICIPANT_COLORS = [
  "#E53E3E",
  "#DD6B20",
  "#D69E2E",
  "#38A169",
  "#319795",
  "#3182CE",
  "#5A67D8",
  "#805AD5",
  "#D53F8C",
  "#718096",
];

export class CollabDebugEngine {
  private readonly config: ResolvedCollabDebugConfig;
  private readonly sessions: Map<string, DebugSession> = new Map();
  private readonly invites: Map<string, InviteToken> = new Map();
  private totalSessionsCreated = 0;

  constructor(config?: CollabDebugConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  createSession(
    traceSessionId: string,
    creator: { name: string },
  ): DebugSession {
    const sessionId = generateEventId();
    const participantId = generateEventId();
    const timestamp = now();

    const owner: Participant = {
      id: participantId,
      name: creator.name,
      role: "owner",
      joinedAt: timestamp,
      lastActiveAt: timestamp,
      cursorPosition: null,
      color: PARTICIPANT_COLORS[0],
    };

    const session: DebugSession = {
      id: sessionId,
      createdAt: timestamp,
      createdBy: participantId,
      traceSessionId,
      participants: new Map([[participantId, owner]]),
      annotations: [],
      sharedBreakpoints: [],
      status: "active",
      expiresAt: timestamp + this.config.sessionTTLMs,
      activityLog: [],
    };

    this.addActivity(session, participantId, "joined");
    this.sessions.set(sessionId, session);
    this.totalSessionsCreated++;

    return session;
  }

  closeSession(sessionId: string): boolean {
    const session = this.getActiveSession(sessionId);
    if (!session) return false;
    session.status = "closed";
    return true;
  }

  getSession(sessionId: string): DebugSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(filter?: { status?: string }): DebugSession[] {
    this.expireSessions();
    const sessions = Array.from(this.sessions.values());
    if (filter?.status) {
      return sessions.filter((s) => s.status === filter.status);
    }
    return sessions;
  }

  // ==========================================================================
  // Invite & Join
  // ==========================================================================

  createInvite(
    sessionId: string,
    role: ParticipantRole,
    options?: { maxUses?: number; ttlMs?: number },
  ): InviteToken {
    const session = this.getActiveSession(sessionId);
    if (!session) {
      throw new Error(`Session not found or not active: ${sessionId}`);
    }

    const token: InviteToken = {
      token: generateEventId(),
      sessionId,
      role,
      createdBy: session.createdBy,
      expiresAt: now() + (options?.ttlMs ?? this.config.sessionTTLMs),
      maxUses: options?.maxUses ?? 1,
      usedCount: 0,
    };

    this.invites.set(token.token, token);
    return token;
  }

  joinWithInvite(token: string, participant: { name: string }): Participant {
    const invite = this.invites.get(token);
    if (!invite) {
      throw new Error("Invalid invite token");
    }

    if (now() > invite.expiresAt) {
      throw new Error("Invite token has expired");
    }

    if (invite.usedCount >= invite.maxUses) {
      throw new Error("Invite token has reached maximum uses");
    }

    const session = this.getActiveSession(invite.sessionId);
    if (!session) {
      throw new Error("Session not found or not active");
    }

    if (session.participants.size >= this.config.maxParticipants) {
      throw new Error(
        `Session has reached maximum participants (${this.config.maxParticipants})`,
      );
    }

    const participantId = generateEventId();
    const colorIndex = session.participants.size % PARTICIPANT_COLORS.length;
    const timestamp = now();

    const newParticipant: Participant = {
      id: participantId,
      name: participant.name,
      role: invite.role,
      joinedAt: timestamp,
      lastActiveAt: timestamp,
      cursorPosition: null,
      color: PARTICIPANT_COLORS[colorIndex],
    };

    session.participants.set(participantId, newParticipant);
    invite.usedCount++;

    this.addActivity(session, participantId, "joined");

    return newParticipant;
  }

  removeParticipant(sessionId: string, participantId: string): boolean {
    const session = this.getActiveSession(sessionId);
    if (!session) return false;

    const deleted = session.participants.delete(participantId);
    if (deleted) {
      this.addActivity(session, participantId, "left");
    }
    return deleted;
  }

  getParticipants(sessionId: string): Participant[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return Array.from(session.participants.values());
  }

  // ==========================================================================
  // Cursor Tracking
  // ==========================================================================

  updateCursor(
    sessionId: string,
    participantId: string,
    stepIndex: number,
  ): void {
    const session = this.getActiveSession(sessionId);
    if (!session) return;

    const participant = session.participants.get(participantId);
    if (!participant) return;

    participant.cursorPosition = stepIndex;
    participant.lastActiveAt = now();
    this.addActivity(session, participantId, "moved_cursor", {
      stepIndex,
    });
  }

  getCursors(
    sessionId: string,
  ): {
    participantId: string;
    name: string;
    stepIndex: number;
    color: string;
  }[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const cursors: {
      participantId: string;
      name: string;
      stepIndex: number;
      color: string;
    }[] = [];

    for (const p of session.participants.values()) {
      if (p.cursorPosition !== null) {
        cursors.push({
          participantId: p.id,
          name: p.name,
          stepIndex: p.cursorPosition,
          color: p.color,
        });
      }
    }

    return cursors;
  }

  // ==========================================================================
  // Annotations
  // ==========================================================================

  addAnnotation(
    sessionId: string,
    annotation: Omit<
      SharedAnnotation,
      "id" | "timestamp" | "reactions" | "resolved"
    >,
  ): SharedAnnotation {
    const session = this.getActiveSession(sessionId);
    if (!session) {
      throw new Error(`Session not found or not active: ${sessionId}`);
    }

    const newAnnotation: SharedAnnotation = {
      ...annotation,
      id: generateEventId(),
      timestamp: now(),
      reactions: [],
      resolved: false,
    };

    session.annotations.push(newAnnotation);
    this.addActivity(session, annotation.participantId, "added_annotation", {
      annotationId: newAnnotation.id,
      stepIndex: annotation.stepIndex,
    });

    return newAnnotation;
  }

  resolveAnnotation(sessionId: string, annotationId: string): boolean {
    const session = this.getActiveSession(sessionId);
    if (!session) return false;

    const annotation = session.annotations.find((a) => a.id === annotationId);
    if (!annotation || annotation.resolved) return false;

    annotation.resolved = true;
    this.addActivity(session, annotation.participantId, "resolved_annotation", {
      annotationId,
    });

    return true;
  }

  addReaction(
    sessionId: string,
    annotationId: string,
    participantId: string,
    emoji: string,
  ): void {
    const session = this.getActiveSession(sessionId);
    if (!session) return;

    const annotation = session.annotations.find((a) => a.id === annotationId);
    if (!annotation) return;

    annotation.reactions.push({ participantId, emoji });
  }

  getAnnotations(
    sessionId: string,
    filter?: { stepIndex?: number; resolved?: boolean },
  ): SharedAnnotation[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    let annotations = session.annotations;

    if (filter?.stepIndex !== undefined) {
      annotations = annotations.filter((a) => a.stepIndex === filter.stepIndex);
    }
    if (filter?.resolved !== undefined) {
      annotations = annotations.filter((a) => a.resolved === filter.resolved);
    }

    return annotations;
  }

  // ==========================================================================
  // Breakpoints
  // ==========================================================================

  addBreakpoint(
    sessionId: string,
    bp: Omit<SharedBreakpoint, "id">,
  ): SharedBreakpoint {
    const session = this.getActiveSession(sessionId);
    if (!session) {
      throw new Error(`Session not found or not active: ${sessionId}`);
    }

    const breakpoint: SharedBreakpoint = {
      ...bp,
      id: generateEventId(),
    };

    session.sharedBreakpoints.push(breakpoint);
    this.addActivity(session, bp.createdBy, "added_breakpoint", {
      breakpointId: breakpoint.id,
      stepIndex: bp.stepIndex,
    });

    return breakpoint;
  }

  removeBreakpoint(sessionId: string, breakpointId: string): boolean {
    const session = this.getActiveSession(sessionId);
    if (!session) return false;

    const index = session.sharedBreakpoints.findIndex(
      (bp) => bp.id === breakpointId,
    );
    if (index === -1) return false;

    session.sharedBreakpoints.splice(index, 1);
    return true;
  }

  getBreakpoints(sessionId: string): SharedBreakpoint[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.sharedBreakpoints;
  }

  // ==========================================================================
  // Activity Log & Metrics
  // ==========================================================================

  getActivityLog(sessionId: string): ActivityEntry[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.activityLog;
  }

  getMetrics(): CollabDebugMetrics {
    this.expireSessions();

    const sessions = Array.from(this.sessions.values());
    const activeSessions = sessions.filter((s) => s.status === "active");

    const totalParticipants = sessions.reduce(
      (sum, s) => sum + s.participants.size,
      0,
    );
    const totalAnnotations = sessions.reduce(
      (sum, s) => sum + s.annotations.length,
      0,
    );
    const totalBreakpoints = sessions.reduce(
      (sum, s) => sum + s.sharedBreakpoints.length,
      0,
    );

    return {
      totalSessions: this.totalSessionsCreated,
      activeSessions: activeSessions.length,
      totalParticipants,
      avgParticipantsPerSession:
        sessions.length > 0 ? totalParticipants / sessions.length : 0,
      totalAnnotations,
      totalBreakpoints,
    };
  }

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  private getActiveSession(sessionId: string): DebugSession | undefined {
    this.expireSessions();
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return undefined;
    return session;
  }

  private expireSessions(): void {
    const timestamp = now();
    for (const session of this.sessions.values()) {
      if (session.status === "active" && timestamp >= session.expiresAt) {
        session.status = "closed";
      }
    }
  }

  private addActivity(
    session: DebugSession,
    participantId: string,
    action: ActivityAction,
    details?: Record<string, unknown>,
  ): void {
    const entry: ActivityEntry = {
      id: generateEventId(),
      participantId,
      action,
      timestamp: now(),
      details,
    };
    session.activityLog.push(entry);
  }
}
