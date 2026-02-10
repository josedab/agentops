# Development Setup

Get AgentOps running locally for development.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local infrastructure)

## Setup

```bash
# Clone the repository
git clone https://github.com/josedab/agentops.git
cd agentops

# Install dependencies
pnpm install

# Start infrastructure
cd infrastructure/docker
docker compose up -d
cd ../..

# Run tests
pnpm test

# Start development
pnpm dev
```

## Project Structure

```
agentops/
├── packages/
│   ├── sdk-ts/          # TypeScript SDK
│   ├── sdk-python/      # Python SDK
│   ├── sdk-go/          # Go SDK
│   └── shared/          # Shared types
├── apps/
│   ├── api/             # API server
│   ├── ingest/          # Ingestion workers
│   ├── web/             # Dashboard
│   └── docs/            # Documentation
└── infrastructure/
    ├── docker/          # Local development
    └── terraform/       # Production
```

## Development Commands

```bash
# Run all packages in dev mode
pnpm dev

# Run tests
pnpm test

# Run linting
pnpm lint

# Format code
pnpm format

# Build all packages
pnpm build

# Clean build artifacts
pnpm clean
```

## Infrastructure Services

| Service    | Port | Purpose      |
| ---------- | ---- | ------------ |
| ClickHouse | 8123 | Analytics DB |
| PostgreSQL | 5432 | Metadata DB  |
| Redis      | 6379 | Cache        |
| Redpanda   | 9092 | Streaming    |

## Environment Variables

Create `.env` files as needed:

```bash
# packages/sdk-ts/.env
AGENTOPS_API_KEY=ao_test_key

# apps/api/.env
CLICKHOUSE_URL=http://localhost:8123
DATABASE_URL=postgresql://...
```

## Making Changes

1. Create a branch: `git checkout -b feature/my-feature`
2. Make changes
3. Run tests: `pnpm test`
4. Run linting: `pnpm lint`
5. Commit with conventional commits: `git commit -m "feat: add feature"`
6. Push and create PR
