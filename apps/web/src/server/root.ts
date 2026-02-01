import { router } from "./trpc";
import { sessionsRouter } from "./routers/sessions";
import { metricsRouter } from "./routers/metrics";
import { alertsRouter } from "./routers/alerts";
import { apiKeysRouter } from "./routers/apiKeys";
import { promptsRouter } from "./routers/prompts";
import { settingsRouter } from "./routers/settings";
import { webhooksRouter } from "./routers/webhooks";
import { exportRouter } from "./routers/export";
import { billingRouter } from "./routers/billing";
import { qualityRouter } from "./routers/quality";
import { cacheRouter } from "./routers/cache";
import { playgroundRouter } from "./routers/playground";
import { testsRouter } from "./routers/tests";
import { nlAlertsRouter } from "./routers/nlAlerts";

export const appRouter = router({
  sessions: sessionsRouter,
  metrics: metricsRouter,
  alerts: alertsRouter,
  apiKeys: apiKeysRouter,
  prompts: promptsRouter,
  settings: settingsRouter,
  webhooks: webhooksRouter,
  export: exportRouter,
  billing: billingRouter,
  quality: qualityRouter,
  cache: cacheRouter,
  playground: playgroundRouter,
  tests: testsRouter,
  nlAlerts: nlAlertsRouter,
});

export type AppRouter = typeof appRouter;
