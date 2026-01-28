import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';

// Mock data for development
const mockSessions = [
  {
    id: 'sess_abc123',
    projectId: 'proj_1',
    userId: 'user_456',
    featureId: 'chat-agent',
    status: 'completed' as const,
    model: 'gpt-5',
    eventCount: 12,
    promptTokens: 450,
    completionTokens: 380,
    totalCost: 0.0234,
    durationMs: 4200,
    startedAt: new Date('2026-01-28T10:30:00Z'),
    endedAt: new Date('2026-01-28T10:30:04Z'),
    tags: ['production'],
  },
  {
    id: 'sess_def456',
    projectId: 'proj_1',
    userId: 'user_789',
    featureId: 'code-review',
    status: 'completed' as const,
    model: 'claude-sonnet-4',
    eventCount: 8,
    promptTokens: 1200,
    completionTokens: 850,
    totalCost: 0.0567,
    durationMs: 6800,
    startedAt: new Date('2026-01-28T10:25:00Z'),
    endedAt: new Date('2026-01-28T10:25:07Z'),
    tags: ['production'],
  },
  {
    id: 'sess_ghi789',
    projectId: 'proj_1',
    userId: 'user_456',
    featureId: 'chat-agent',
    status: 'error' as const,
    model: 'gpt-5',
    eventCount: 5,
    promptTokens: 200,
    completionTokens: 0,
    totalCost: 0.001,
    durationMs: 1500,
    startedAt: new Date('2026-01-28T10:20:00Z'),
    endedAt: new Date('2026-01-28T10:20:02Z'),
    tags: ['production'],
    errorMessage: 'Rate limit exceeded',
  },
];

const mockEvents = [
  {
    id: 'evt_1',
    sessionId: 'sess_abc123',
    type: 'session_start' as const,
    timestamp: new Date('2026-01-28T10:30:00.000Z'),
    durationMs: 0,
  },
  {
    id: 'evt_2',
    sessionId: 'sess_abc123',
    type: 'prompt' as const,
    role: 'system',
    content: 'You are a helpful assistant that provides concise answers.',
    model: 'gpt-5',
    timestamp: new Date('2026-01-28T10:30:00.050Z'),
    tokens: { promptTokens: 15, completionTokens: 0, totalTokens: 15 },
    durationMs: 0,
  },
  {
    id: 'evt_3',
    sessionId: 'sess_abc123',
    type: 'prompt' as const,
    role: 'user',
    content: 'What is the capital of France?',
    model: 'gpt-5',
    timestamp: new Date('2026-01-28T10:30:00.100Z'),
    tokens: { promptTokens: 8, completionTokens: 0, totalTokens: 8 },
    durationMs: 0,
  },
  {
    id: 'evt_4',
    sessionId: 'sess_abc123',
    type: 'response' as const,
    content: 'The capital of France is Paris.',
    model: 'gpt-5',
    timestamp: new Date('2026-01-28T10:30:00.600Z'),
    tokens: { promptTokens: 0, completionTokens: 8, totalTokens: 8 },
    durationMs: 500,
    cost: 0.0001,
  },
  {
    id: 'evt_5',
    sessionId: 'sess_abc123',
    type: 'tool_call' as const,
    toolName: 'web_search',
    toolInput: { query: 'Paris population 2026' },
    timestamp: new Date('2026-01-28T10:30:01.000Z'),
    durationMs: 0,
  },
  {
    id: 'evt_6',
    sessionId: 'sess_abc123',
    type: 'tool_result' as const,
    toolName: 'web_search',
    toolOutput: { results: [{ title: 'Paris Population', snippet: '2.1 million' }] },
    status: 'success',
    timestamp: new Date('2026-01-28T10:30:01.500Z'),
    durationMs: 500,
  },
  {
    id: 'evt_7',
    sessionId: 'sess_abc123',
    type: 'session_end' as const,
    status: 'completed',
    timestamp: new Date('2026-01-28T10:30:04.200Z'),
    durationMs: 4200,
  },
];

export const sessionsRouter = router({
  list: publicProcedure
    .input(z.object({
      projectId: z.string().optional(),
      status: z.enum(['active', 'completed', 'error']).optional(),
      userId: z.string().optional(),
      featureId: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      let filtered = [...mockSessions];
      
      if (input.status) {
        filtered = filtered.filter(s => s.status === input.status);
      }
      if (input.userId) {
        filtered = filtered.filter(s => s.userId === input.userId);
      }
      if (input.featureId) {
        filtered = filtered.filter(s => s.featureId === input.featureId);
      }
      
      return {
        sessions: filtered.slice(input.offset, input.offset + input.limit),
        total: filtered.length,
        hasMore: input.offset + input.limit < filtered.length,
      };
    }),

  get: publicProcedure
    .input(z.object({
      sessionId: z.string(),
    }))
    .query(async ({ input }) => {
      const session = mockSessions.find(s => s.id === input.sessionId);
      if (!session) {
        return null;
      }
      
      const events = mockEvents.filter(e => e.sessionId === input.sessionId);
      
      return {
        ...session,
        events,
      };
    }),

  getEvents: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      limit: z.number().min(1).max(1000).default(100),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const events = mockEvents.filter(e => e.sessionId === input.sessionId);
      
      return {
        events: events.slice(input.offset, input.offset + input.limit),
        total: events.length,
      };
    }),
});
