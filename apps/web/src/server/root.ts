import { router } from './trpc';
import { sessionsRouter } from './routers/sessions';
import { metricsRouter } from './routers/metrics';
import { alertsRouter } from './routers/alerts';

export const appRouter = router({
  sessions: sessionsRouter,
  metrics: metricsRouter,
  alerts: alertsRouter,
});

export type AppRouter = typeof appRouter;
