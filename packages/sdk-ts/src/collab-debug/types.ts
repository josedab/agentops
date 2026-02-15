/**
 * AgentOps SDK - Live Collaboration Debugger Types
 *
 * Type definitions for real-time collaborative debugging sessions.
 */

// ============================================================================
// Configuration
// ============================================================================

export interface CollabDebugConfig {
  enabled?: boolean;
  maxParticipants?: number;
  sessionTTLMs?: number;
  debug?: boolean;
}

export interface ResolvedCollabDebugConfig {
  enabled: boolean;
  maxParticipants: number;
  sessionTTLMs: number;
  debug: boolean;
}

// ============================================================================
// Participants
// ============================================================================

export type ParticipantRole = "owner" | "editor" | "viewer";

export interface Participant {
  id: string;
  name: string;
  role: ParticipantRole;
  joinedAt: number;
  lastActiveAt: number;
  cursorPosition: number | null;
  color: string;
}

// ============================================================================
// Debug Sessions
// ============================================================================

export type DebugSessionStatus = "active" | "closed";

export interface DebugSession {
  id: string;
  createdAt: number;
  createdBy: string;
  traceSessionId: string;
  participants: Map<string, Participant>;
  annotations: SharedAnnotation[];
  sharedBreakpoints: SharedBreakpoint[];
  status: DebugSessionStatus;
  expiresAt: number;
  activityLog: ActivityEntry[];
}

// ============================================================================
// Annotations
// ============================================================================

export interface SharedAnnotation {
  id: string;
  participantId: string;
  stepIndex: number;
  content: string;
  timestamp: number;
  reactions: { participantId: string; emoji: string }[];
  resolved: boolean;
}

// ============================================================================
// Breakpoints
// ============================================================================

export interface SharedBreakpoint {
  id: string;
  createdBy: string;
  stepIndex: number;
  condition?: string;
  enabled: boolean;
}

// ============================================================================
// Activity Log
// ============================================================================

export type ActivityAction =
  | "joined"
  | "left"
  | "added_annotation"
  | "added_breakpoint"
  | "moved_cursor"
  | "resolved_annotation";

export interface ActivityEntry {
  id: string;
  participantId: string;
  action: ActivityAction;
  timestamp: number;
  details?: Record<string, unknown>;
}

// ============================================================================
// Invites
// ============================================================================

export interface InviteToken {
  token: string;
  sessionId: string;
  role: ParticipantRole;
  createdBy: string;
  expiresAt: number;
  maxUses: number;
  usedCount: number;
}

// ============================================================================
// Metrics
// ============================================================================

export interface CollabDebugMetrics {
  totalSessions: number;
  activeSessions: number;
  totalParticipants: number;
  avgParticipantsPerSession: number;
  totalAnnotations: number;
  totalBreakpoints: number;
}
