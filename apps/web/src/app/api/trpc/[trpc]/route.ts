import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/root';
import type { Context } from '@/server/trpc';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: (): Context => ({
      // In production, extract from auth
      projectId: 'proj_1',
      userId: 'user_1',
    }),
  });

export { handler as GET, handler as POST };
