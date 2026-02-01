# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the AgentOps project. ADRs document important architectural decisions along with their context and consequences.

## What is an ADR?

An Architecture Decision Record captures an important architectural decision made along with its context and consequences. ADRs help us:

- **Document decisions** - Keep a historical record of why decisions were made
- **Communicate changes** - Help team members understand the reasoning
- **Evaluate trade-offs** - Record what alternatives were considered
- **Guide future work** - Inform similar decisions down the road

## ADR Template

Each ADR follows this structure:

```markdown
# ADR-XXX: Title

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Context

What is the issue that we're seeing that is motivating this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change?
```

## Index

| ADR                                           | Title                                 | Status   |
| --------------------------------------------- | ------------------------------------- | -------- |
| [001](./001-clickhouse-analytics.md)          | ClickHouse for Analytics              | Accepted |
| [002](./002-proxy-pattern-instrumentation.md) | Proxy Pattern for SDK Instrumentation | Accepted |
| [003](./003-event-buffering-strategy.md)      | Event Buffering Strategy              | Accepted |
| [004](./004-multi-sdk-architecture.md)        | Multi-Language SDK Architecture       | Accepted |

## Creating a New ADR

1. Copy the template above
2. Number it sequentially (e.g., `005-your-decision.md`)
3. Fill in the sections
4. Add it to the index in this README
5. Submit for review
