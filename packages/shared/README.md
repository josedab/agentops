# @agentops/shared

> Shared types, constants, and utilities for the AgentOps platform

## What's Inside

- **Model Pricing** — pricing table for 40+ LLM models with cost calculation helpers
- **Event Types** — canonical event type definitions used across SDK and API
- **Error Hierarchy** — structured error classes (`AgentOpsError`, `ConfigError`, `NetworkError`, etc.)
- **Utilities** — `sleep()`, `calculateBackoff()` (exponential backoff with jitter)
- **Constants** — `API_VERSION`, `SDK_VERSION`

## Usage

```typescript
import {
  getModelPricing,
  calculateCost,
  EVENT_TYPES,
  AgentOpsError,
} from "@agentops/shared";

const cost = calculateCost("gpt-4o", inputTokens, outputTokens);
```

## Development

```bash
pnpm build      # Build with tsup
pnpm dev        # Watch mode
pnpm test       # Run tests
pnpm typecheck  # Type check
pnpm lint       # Lint
```
