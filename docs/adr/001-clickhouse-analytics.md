# ADR-001: ClickHouse for Analytics Database

## Status

Accepted

## Context

AgentOps needs to store and query large volumes of event data from AI agent sessions. Requirements include:

- **High write throughput**: Ingesting millions of events per day from instrumented applications
- **Fast analytical queries**: Real-time dashboards showing session metrics, cost breakdowns, and trends
- **Time-series optimization**: Most queries are time-bounded (last hour, day, week)
- **Cost efficiency**: Need to store terabytes of data affordably
- **Aggregation performance**: Frequent GROUP BY queries for metrics like "cost by user", "errors by model"

Traditional OLTP databases (PostgreSQL, MySQL) struggle with:

- Column-oriented analytical queries at scale
- Compression ratios needed for cost-effective storage
- Real-time ingestion while serving queries

Alternatives considered:

1. **TimescaleDB** - Good for time-series but limited columnar optimization
2. **Apache Druid** - Complex operational overhead, requires ZooKeeper
3. **Elasticsearch** - Expensive at scale, not optimized for numerical aggregations
4. **BigQuery/Snowflake** - Excellent analytics but high cost and vendor lock-in

## Decision

We chose **ClickHouse** as our primary analytics database for event storage and querying.

Key factors:

1. **Columnar storage** - Excellent compression (10-40x) and fast aggregations
2. **MergeTree engine** - Optimized for time-series with automatic partitioning
3. **Real-time ingestion** - Native support for high-throughput inserts
4. **SQL interface** - Familiar query language, easy to integrate
5. **Open source** - No vendor lock-in, active community
6. **Materialized views** - Pre-aggregate common queries for dashboard performance
7. **Self-hosted option** - Supports both cloud and on-premise deployments

## Consequences

### Positive

- **Query performance**: Sub-second response for most dashboard queries even with billions of rows
- **Storage costs**: 10-40x compression reduces storage costs significantly
- **Developer experience**: Standard SQL with powerful analytical functions
- **Operational simplicity**: Single binary, easy to deploy and scale
- **Flexibility**: Can self-host for enterprise customers or use ClickHouse Cloud

### Negative

- **Learning curve**: Team needs to learn ClickHouse-specific optimizations (partitioning, sorting keys)
- **No transactions**: Eventually consistent, not suitable for OLTP workloads (using PostgreSQL for metadata)
- **Update complexity**: Updates/deletes are expensive (designed for immutable data)
- **Monitoring**: Need additional tooling for ClickHouse-specific metrics

### Mitigation

- PostgreSQL handles metadata, user accounts, and configuration (OLTP workloads)
- Events are immutable - we don't update them after ingestion
- Comprehensive documentation and training for the team
