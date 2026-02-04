# Architecture Decision Records

Key architectural decisions and their rationale.

## ADR Index

| ADR                             | Title                             | Status   |
| ------------------------------- | --------------------------------- | -------- |
| [001](#adr-001-clickhouse)      | ClickHouse for Analytics          | Accepted |
| [002](#adr-002-proxy-pattern)   | Proxy Pattern for Instrumentation | Accepted |
| [003](#adr-003-event-buffering) | Event Buffering Strategy          | Accepted |
| [004](#adr-004-multi-sdk)       | Multi-Language SDK Architecture   | Accepted |

---

## ADR-001: ClickHouse for Analytics {#adr-001-clickhouse}

**Status:** Accepted

**Context:** Need a database for high-volume event storage with fast analytical queries.

**Decision:** Use ClickHouse as the primary analytics database.

**Rationale:**

- Columnar storage with 10-40x compression
- Sub-second queries on billions of rows
- Native time-series support
- Cost-effective at scale

**Alternatives Considered:**

- TimescaleDB - Good but slower for pure analytics
- Elasticsearch - Expensive at scale
- BigQuery - Vendor lock-in

---

## ADR-002: Proxy Pattern for Instrumentation {#adr-002-proxy-pattern}

**Status:** Accepted

**Context:** Need to capture LLM calls without requiring users to modify their code.

**Decision:** Use JavaScript Proxy to wrap LLM clients.

**Rationale:**

- Zero code changes for users
- Type-safe (preserves original types)
- Works with any client
- Easy to disable

**Trade-offs:**

- Slightly more complex than manual tracking
- May not work with all edge cases

---

## ADR-003: Event Buffering Strategy {#adr-003-event-buffering}

**Status:** Accepted

**Context:** Need to balance event latency with network efficiency.

**Decision:** Hybrid buffering - flush on 1s timer OR 100 events, whichever comes first.

**Rationale:**

- 1s max latency for real-time visibility
- 100 event batches for network efficiency
- Immediate flush on shutdown

---

## ADR-004: Multi-Language SDK Architecture {#adr-004-multi-sdk}

**Status:** Accepted

**Context:** Need to support TypeScript, Python, and Go with feature parity.

**Decision:** Shared contracts with native implementations per language.

**Rationale:**

- Native performance and idioms
- Shared API design and event schema
- TypeScript as reference implementation
- Feature parity tracking across SDKs
