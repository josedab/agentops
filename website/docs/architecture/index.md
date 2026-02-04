# Architecture

Technical documentation for AgentOps system architecture.

## Overview

AgentOps is built on a modern, scalable architecture:

- **SDKs** - TypeScript, Python, Go clients
- **Ingest API** - Cloudflare Workers for edge ingestion
- **Storage** - ClickHouse for analytics, PostgreSQL for metadata
- **Dashboard** - Next.js web application

## Components

- [System Overview](/docs/architecture/overview) - High-level architecture
- [Data Pipeline](/docs/architecture/data-pipeline) - Event flow from SDK to dashboard
- [ADRs](/docs/architecture/adrs) - Architecture Decision Records

## Technology Stack

| Component    | Technology             |
| ------------ | ---------------------- |
| SDKs         | TypeScript, Python, Go |
| Ingest       | Cloudflare Workers     |
| API          | Hono (Node.js)         |
| Dashboard    | Next.js 15, React 19   |
| Analytics DB | ClickHouse             |
| Metadata DB  | PostgreSQL             |
| Cache        | Redis                  |
| Streaming    | Redpanda               |
