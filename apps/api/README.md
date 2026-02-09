# @agentops/api

> REST API server for the AgentOps observability platform

Built with [Hono](https://hono.dev/) on Node.js.

## Endpoints

| Route           | Description                                  |
| --------------- | -------------------------------------------- |
| `/api/sessions` | Session listing, detail, and event retrieval |
| `/api/metrics`  | Aggregated metrics and dashboard data        |
| `/api/alerts`   | Alert rules and notification management      |
| `/api/projects` | Project settings and team management         |
| `/api/api-keys` | API key creation, rotation, and revocation   |
| `/api/webhooks` | Webhook configuration and delivery logs      |
| `/api/export`   | Data export jobs (CSV, JSON, Parquet)        |

## Development

```bash
# Prerequisites: run infrastructure first
pnpm infra:up          # from repo root

# Then start the API
pnpm dev               # http://localhost:3001
pnpm build             # Production build
pnpm test              # Run tests
pnpm typecheck         # Type check
pnpm lint              # Lint
```

## Environment

Copy `.env.example` to `.env` and fill in values. Local Docker defaults are provided.
