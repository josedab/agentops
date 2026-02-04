# TypeScript SDK

The TypeScript SDK (`@agentops/sdk`) is the primary SDK for AgentOps, offering the most complete feature set.

## Installation

```bash
npm install @agentops/sdk
# or
pnpm add @agentops/sdk
# or
yarn add @agentops/sdk
```

## Quick Start

```typescript
import { AgentOps } from "@agentops/sdk";
import OpenAI from "openai";

const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});

const openai = agentops.wrap(new OpenAI());

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});

await agentops.shutdown();
```

## Configuration

```typescript
const agentops = new AgentOps({
  // Required
  apiKey: "ao_yourkey...",

  // Optional
  endpoint: "https://ingest.agentops.dev",
  flushInterval: 1000, // Ms between flushes
  maxBatchSize: 100, // Events per batch
  maxRetries: 3, // Retry attempts
  disabled: false, // Disable tracking
  debug: false, // Debug logging
  defaultTags: ["prod"], // Tags for all events
  defaultMetadata: {}, // Metadata for all events
});
```

## Core API

### AgentOps Class

```typescript
// Initialize
const agentops = new AgentOps(config);

// Wrap a client for auto-instrumentation
const client = agentops.wrap(llmClient, metadata?);

// Start a manual session
const session = agentops.startSession(metadata?);

// Track event outside of session
agentops.trackEvent(event);

// Flush pending events
await agentops.flush();

// Shutdown gracefully
await agentops.shutdown();

// Check if enabled
agentops.isEnabled;
```

### TrackedSession Class

```typescript
const session = agentops.startSession({
  userId: 'user_123',
  featureId: 'chatbot',
  tags: ['production'],
  metadata: { version: '1.0' },
});

// Track events
session.trackPrompt(content, options?);
session.trackResponse(content, options);
session.trackToolCall(name, input, options?);
session.trackToolResult(name, output, options);
session.trackError(error, options?);
session.trackCustom(name, data, options?);

// End session
session.end({ status: 'completed' });

// Access stats
session.stats;
session.sessionId;
session.userId;
```

### Singleton API

```typescript
import { init, wrap, startSession, flush, shutdown } from "@agentops/sdk";

// Initialize once
init({ apiKey: "..." });

// Use anywhere
const client = wrap(new OpenAI());
const session = startSession({ userId: "..." });

// Shutdown
await shutdown();
```

## Advanced Features

### DebugCopilot

```typescript
import { DebugCopilot } from "@agentops/sdk";

const copilot = new DebugCopilot({ enabled: true });

const result = await copilot.ask({
  question: "Why did sessions fail yesterday?",
  timeRange: { start: Date.now() - 86400000, end: Date.now() },
});

console.log(result.answer);
console.log(result.recommendations);
```

### SemanticDiffEngine

```typescript
import { SemanticDiffEngine } from "@agentops/sdk";

const diffEngine = new SemanticDiffEngine({ enabled: true });

const diff = await diffEngine.comparePromptVersions("v1.0", "v2.0");
console.log(diff.summary.assessment); // 'improved' | 'degraded' | 'neutral'
```

### CostGuardrailsEngine

```typescript
import { CostGuardrailsEngine } from "@agentops/sdk";

const guardrails = new CostGuardrailsEngine({
  enabled: true,
  defaultSessionLimit: 1.0,
  defaultUserLimit: 10.0,
  onWarning: (w) => console.log(w),
});

const check = guardrails.checkCost({
  sessionId: "sess_123",
  userId: "user_456",
  estimatedCost: 0.05,
});
```

## TypeScript Support

The SDK is written in TypeScript and exports all types:

```typescript
import type {
  AgentOpsConfig,
  SessionMetadata,
  TrackedSession,
  Event,
  EventType,
  TokenUsage,
  SessionStats,
} from "@agentops/sdk";
```

## Related

- [Getting Started](/docs/getting-started) - Quick setup guide
- [Auto-Instrumentation](/docs/concepts/auto-instrumentation) - How wrapping works
- [OpenAI Integration](/docs/guides/openai-integration) - OpenAI-specific guide
