# System Overview

High-level architecture of the AgentOps platform.

## Architecture Diagram

```mermaid
flowchart TB
    subgraph Clients["Client Applications"]
        TS["TypeScript SDK"]
        PY["Python SDK"]
        GO["Go SDK"]
    end

    subgraph Edge["Edge Layer"]
        CF["Cloudflare Workers<br/>(Ingest Service)"]
    end

    subgraph Backend["Backend Services"]
        API["API Server<br/>(Hono)"]
        WEB["Web Dashboard<br/>(Next.js)"]
    end

    subgraph Storage["Data Layer"]
        CH[("ClickHouse<br/>(Events)")]
        PG[("PostgreSQL<br/>(Metadata)")]
        RD[("Redis<br/>(Cache)")]
    end

    TS & PY & GO -->|"POST /v1/events"| CF
    CF -->|Batch Insert| CH

    WEB -->|tRPC| API
    API -->|Query| CH
    API -->|CRUD| PG
    API -->|Cache| RD
```

## Components

### SDKs

Multi-language clients that instrument applications:

- Auto-instrumentation via proxy wrapping
- Event batching and buffering
- Graceful shutdown and retry logic

### Ingest Service

Edge-deployed workers for low-latency ingestion:

- Validates and enriches events
- Batches inserts to ClickHouse
- Handles 10K+ events/second per worker

### API Server

REST API built with Hono:

- Session queries and filtering
- Aggregated metrics
- Alert management
- Webhook delivery

### Dashboard

Next.js application for visualization:

- Real-time session explorer
- Cost analytics
- Alert configuration
- Team management

### ClickHouse

Columnar database optimized for analytics:

- 10-40x compression
- Sub-second queries on billions of events
- 90-day default retention

### PostgreSQL

Relational database for metadata:

- Organization/project configuration
- API keys and permissions
- Alert rules
