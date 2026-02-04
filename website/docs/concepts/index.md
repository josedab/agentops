# Core Concepts

Understanding the fundamental concepts in AgentOps will help you get the most out of the platform.

## Overview

AgentOps is built around a simple but powerful model:

```
Sessions → Events → Analytics
```

- **Sessions** represent a single agent interaction (e.g., a user conversation)
- **Events** capture what happened during that session (prompts, responses, tool calls)
- **Analytics** aggregate data across sessions for insights and monitoring

## Key Concepts

### Sessions

A [session](/docs/concepts/sessions) represents a single interaction between your agent and a user. It has:

- A unique session ID
- Optional user and feature identifiers
- Start and end timestamps
- Aggregated stats (tokens, cost, duration)

### Events

[Events](/docs/concepts/events) are the building blocks of observability. Types include:

| Event Type    | Description              |
| ------------- | ------------------------ |
| `prompt`      | User input to the model  |
| `response`    | Model output             |
| `tool_call`   | Function/tool invocation |
| `tool_result` | Function/tool result     |
| `error`       | Exceptions and failures  |
| `custom`      | Your own event types     |

### Auto-Instrumentation

[Auto-instrumentation](/docs/concepts/auto-instrumentation) uses JavaScript Proxy to wrap LLM clients and automatically capture all events without code changes.

### Cost Tracking

[Cost tracking](/docs/concepts/cost-tracking) calculates and attributes costs based on token usage and model pricing, enabling budget management and optimization.

## Data Flow

```mermaid
flowchart LR
    App[Your App] -->|wrap()| SDK[AgentOps SDK]
    SDK -->|Batch Events| Ingest[Ingest API]
    Ingest --> CH[(ClickHouse)]
    CH --> Dashboard[Dashboard]
    CH --> API[Query API]
```

## Next Steps

- [Sessions](/docs/concepts/sessions) - Deep dive into session management
- [Events](/docs/concepts/events) - Understanding event types and structure
- [Auto-Instrumentation](/docs/concepts/auto-instrumentation) - How proxy wrapping works
- [Cost Tracking](/docs/concepts/cost-tracking) - Cost calculation and attribution
