# @agentops/ingest

> High-throughput event ingestion service for AgentOps

Edge-deployed on [Cloudflare Workers](https://workers.cloudflare.com/) using [Hono](https://hono.dev/).

## How It Works

SDKs send telemetry events (prompts, responses, tool calls, errors) to this service. Events are validated with Zod schemas, then buffered and written to ClickHouse for analytics.

## API

| Endpoint                | Description              |
| ----------------------- | ------------------------ |
| `POST /v1/events`       | Ingest a single event    |
| `POST /v1/events/batch` | Ingest a batch of events |
| `GET /health`           | Health check             |
| `GET /ready`            | Readiness check          |

## Development

```bash
pnpm dev               # Local dev with wrangler
pnpm build             # Dry-run deploy (outputs to dist/)
pnpm test              # Run tests
pnpm typecheck         # Type check
pnpm lint              # Lint
pnpm deploy            # Deploy to Cloudflare
```

## Environment

Copy `.env.example` to `.env` for local development. Production secrets are managed via `wrangler.toml`.
