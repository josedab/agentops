# TypeScript SDK Reference

> `@agentops/sdk` - AI observability for TypeScript/JavaScript applications

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

const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});

// Auto-instrument an LLM client
const client = agentops.wrap(yourLLMClient);

// Graceful shutdown
await agentops.shutdown();
```

---

## Core API

### AgentOps

Main client class for SDK initialization and management.

```typescript
import { AgentOps } from "@agentops/sdk";

const agentops = new AgentOps(config: AgentOpsConfig);
```

#### Configuration

| Option            | Type                  | Default                       | Description                                 |
| ----------------- | --------------------- | ----------------------------- | ------------------------------------------- |
| `apiKey`          | `string`              | **required**                  | API key (format: `ao_<projectId>_<secret>`) |
| `endpoint`        | `string`              | `https://ingest.agentops.dev` | Ingestion endpoint                          |
| `flushInterval`   | `number`              | `1000`                        | Milliseconds between auto-flushes           |
| `maxBatchSize`    | `number`              | `100`                         | Maximum events per batch                    |
| `maxRetries`      | `number`              | `3`                           | Retry attempts for failed requests          |
| `disabled`        | `boolean`             | `false`                       | Disable all tracking                        |
| `debug`           | `boolean`             | `false`                       | Enable debug logging                        |
| `defaultTags`     | `string[]`            | `[]`                          | Tags applied to all events                  |
| `defaultMetadata` | `Record<string, any>` | `{}`                          | Metadata applied to all events              |

#### Methods

##### `wrap<T>(client: T, metadata?: SessionMetadata): T`

Wraps an LLM client for automatic instrumentation.

```typescript
import OpenAI from "openai";

const openai = agentops.wrap(new OpenAI());

// All calls are automatically tracked
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});
```

**Supported Clients:**

- OpenAI (`chat.completions.create`)
- Anthropic (`messages.create`)
- GitHub Copilot SDK (`createSession`)
- Generic (any object with async methods)

##### `startSession(metadata?: SessionMetadata): TrackedSession`

Creates a new tracked session for manual instrumentation.

```typescript
const session = agentops.startSession({
  userId: "user_123",
  featureId: "chat-assistant",
  tags: ["production", "v2"],
  metadata: { source: "web" },
});
```

##### `trackEvent(event: Event): void`

Tracks a custom event outside of a session.

```typescript
agentops.trackEvent({
  type: "custom",
  name: "deployment",
  data: { version: "1.2.3" },
});
```

##### `flush(): Promise<void>`

Manually flushes buffered events.

```typescript
await agentops.flush();
```

##### `shutdown(): Promise<void>`

Gracefully shuts down the client (flushes pending events).

```typescript
await agentops.shutdown();
```

##### `isEnabled: boolean`

Check if tracking is active.

---

### TrackedSession

Represents a tracked agent session.

```typescript
const session = agentops.startSession({ userId: "user_123" });
```

#### Properties

| Property    | Type                  | Description                  |
| ----------- | --------------------- | ---------------------------- |
| `sessionId` | `string`              | Unique session identifier    |
| `userId`    | `string \| undefined` | User identifier              |
| `featureId` | `string \| undefined` | Feature/agent identifier     |
| `stats`     | `SessionStats`        | Real-time session statistics |

#### Methods

##### `trackPrompt(content: string, options?: PromptOptions): string`

Tracks an input prompt.

```typescript
const eventId = session.trackPrompt("What is the capital of France?", {
  role: "user",
  model: "gpt-4",
});
```

**Options:**

- `role`: `"system" | "user" | "assistant"`
- `model`: Model identifier
- `metadata`: Additional data

##### `trackResponse(content: string, options: ResponseOptions): string`

Tracks a model response.

```typescript
session.trackResponse("The capital of France is Paris.", {
  model: "gpt-4",
  durationMs: 523,
  tokens: {
    promptTokens: 12,
    completionTokens: 8,
    totalTokens: 20,
  },
  finishReason: "stop",
});
```

**Required Options:**

- `model`: Model identifier
- `durationMs`: Response latency

**Optional:**

- `tokens`: Token usage object
- `finishReason`: `"stop" | "length" | "tool_calls" | "content_filter"`
- `cost`: Cost in USD

##### `trackToolCall(name: string, input: any, options?: ToolOptions): string`

Tracks a tool/function invocation.

```typescript
const toolEventId = session.trackToolCall("web_search", {
  query: "latest news",
});
```

##### `trackToolResult(name: string, output: any, options: ToolResultOptions): string`

Tracks a tool execution result.

```typescript
session.trackToolResult(
  "web_search",
  { results: [...] },
  {
    status: "success",
    durationMs: 1200,
    parentEventId: toolEventId,
  }
);
```

##### `trackError(error: Error, options?: ErrorOptions): string`

Tracks an error.

```typescript
session.trackError(new Error("Rate limit exceeded"), {
  durationMs: 100,
});
```

##### `trackCustom(name: string, data: any, options?: CustomOptions): string`

Tracks a custom event.

```typescript
session.trackCustom("user_feedback", {
  rating: 5,
  comment: "Very helpful!",
});
```

##### `end(options?: EndOptions): void`

Ends the session.

```typescript
session.end({ status: "completed" });
// or
session.end({ status: "error", errorMessage: "Timeout" });
```

#### SessionStats

```typescript
interface SessionStats {
  eventCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  totalCost: number;
  durationMs: number;
  toolCalls: number;
  errors: number;
  models: string[];
  tools: string[];
}
```

---

## Singleton API

For applications preferring a global instance:

```typescript
import {
  init,
  getClient,
  wrap,
  startSession,
  trackEvent,
  flush,
  shutdown,
} from "@agentops/sdk";

// Initialize once at startup
init({ apiKey: process.env.AGENTOPS_API_KEY! });

// Use anywhere
const client = wrap(new OpenAI());
const session = startSession({ userId: "user_123" });

// Shutdown on exit
await shutdown();
```

---

## Feature Modules

### DebugCopilot

AI-powered debugging assistant for session analysis.

```typescript
import { DebugCopilot, InMemorySessionStore } from "@agentops/sdk";

const copilot = new DebugCopilot({
  enabled: true,
  sessionStore: new InMemorySessionStore(),
});

// Ask questions about sessions
const result = await copilot.ask({
  question: "Why did sessions fail yesterday?",
  timeRange: {
    start: Date.now() - 86400000,
    end: Date.now(),
  },
});

console.log(result.answer);
console.log(result.rootCause);
console.log(result.recommendations);

// Multi-turn conversations
const conversationId = copilot.startConversation();
await copilot.ask({
  question: "What errors are most common?",
  conversationId,
});
await copilot.ask({
  question: "Which users are affected?",
  conversationId,
});
```

### SemanticDiffEngine

Compare agent behavior across versions or time periods.

```typescript
import { SemanticDiffEngine } from "@agentops/sdk";

const diffEngine = new SemanticDiffEngine({ enabled: true });

// Compare prompt versions
const diff = await diffEngine.comparePromptVersions("v1.0", "v2.0");
console.log(diff.summary.assessment); // 'improved' | 'degraded' | 'neutral'
console.log(diff.significantChanges);
console.log(diff.recommendations);

// Compare before/after deployment
const timeDiff = await diffEngine.compareTimePeriods(deploymentTimestamp, {
  beforeDurationMs: 24 * 60 * 60 * 1000,
  afterDurationMs: 24 * 60 * 60 * 1000,
});

// Track deployments
diffEngine.recordDeployment({
  version: "1.2.3",
  commitSha: "abc123",
  environment: "production",
});
```

### CostGuardrailsEngine

Prevent runaway costs with real-time budget enforcement.

```typescript
import { CostGuardrailsEngine } from "@agentops/sdk";

const guardrails = new CostGuardrailsEngine({
  enabled: true,
  defaultSessionLimit: 1.0, // $1 per session
  defaultUserLimit: 10.0, // $10 per user per hour
  defaultAction: "soft_block", // 'warn' | 'throttle' | 'soft_block' | 'hard_block'
  warningThreshold: 0.8, // Warn at 80%
  onWarning: (warning) => console.log("Warning:", warning),
  onLimitEnforced: (enforcement) => console.log("Blocked:", enforcement),
});

// Set custom limits
guardrails.setUserLimit({
  userId: "premium_user",
  maxCost: 100.0,
  windowMs: 24 * 60 * 60 * 1000, // 24-hour window
});

// Check before LLM calls
const check = guardrails.checkCost({
  sessionId: "sess_123",
  userId: "user_456",
  estimatedCost: 0.05,
});

if (!check.allowed) {
  throw new Error(check.message);
}

// Record actual costs
guardrails.recordCost({
  sessionId: "sess_123",
  userId: "user_456",
  cost: 0.045,
  timestamp: Date.now(),
});

// Get spending summary
const summary = guardrails.getSpendingSummary(
  Date.now() - 86400000,
  Date.now(),
);
```

---

## Event Types

```typescript
type EventType =
  | "session_start" // Session initialization
  | "session_end" // Session completion
  | "prompt" // Input to model
  | "response" // Model output
  | "tool_call" // Function invocation
  | "tool_result" // Function result
  | "error" // Exception/failure
  | "custom"; // User-defined

interface BaseEvent {
  eventId: string;
  sessionId: string;
  parentEventId?: string;
  type: EventType;
  timestamp: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
```

---

## Additional Modules

| Module                  | Purpose                        |
| ----------------------- | ------------------------------ |
| `QualityEvaluator`      | Output quality scoring         |
| `AnomalyDetector`       | Error pattern detection        |
| `ReplayEngine`          | Session replay/simulation      |
| `ContextWindowAnalyzer` | Token optimization             |
| `CollaborationHub`      | Team annotations               |
| `ComplianceManager`     | PII scanning, audit logs       |
| `BudgetManager`         | Budget forecasting             |
| `CostOptimizer`         | Cost reduction recommendations |

---

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md) - System design, data flow, infrastructure
- [Python SDK](./sdk-python.md) - Python SDK reference
- [Go SDK](./sdk-go.md) - Go SDK reference
- [REST API](./api-reference.md) - Backend API reference
- [ADR-002: Proxy Pattern](./adr/002-proxy-pattern-instrumentation.md) - Why we use Proxy for auto-instrumentation
- [ADR-003: Event Buffering](./adr/003-event-buffering-strategy.md) - How SDK buffering works
