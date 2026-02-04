# Events

Events are the fundamental data points in AgentOps. Every prompt, response, tool call, and error is captured as an event.

## Event Types

| Type            | Description         | Key Fields                                |
| --------------- | ------------------- | ----------------------------------------- |
| `session_start` | Session initialized | `userId`, `featureId`, `tags`             |
| `session_end`   | Session completed   | `status`, `errorMessage`                  |
| `prompt`        | Input to the model  | `content`, `role`, `model`                |
| `response`      | Model output        | `content`, `tokens`, `cost`, `durationMs` |
| `tool_call`     | Function invocation | `name`, `input`                           |
| `tool_result`   | Function result     | `name`, `output`, `status`, `durationMs`  |
| `error`         | Exception occurred  | `message`, `stack`, `code`                |
| `custom`        | User-defined event  | `name`, `data`                            |

## Tracking Events

### Prompts

```typescript
session.trackPrompt("What is the capital of France?", {
  role: "user", // 'system' | 'user' | 'assistant'
  model: "gpt-4o",
});
```

### Responses

```typescript
session.trackResponse("The capital of France is Paris.", {
  model: "gpt-4o",
  durationMs: 523,
  tokens: {
    promptTokens: 12,
    completionTokens: 8,
    totalTokens: 20,
  },
  finishReason: "stop", // 'stop' | 'length' | 'tool_calls'
  cost: 0.0003, // Optional, auto-calculated if omitted
});
```

### Tool Calls

```typescript
// Track the call
const toolEventId = session.trackToolCall('web_search', {
  query: 'latest AI news',
});

// ... execute tool ...

// Track the result
session.trackToolResult('web_search', { results: [...] }, {
  status: 'success',      // 'success' | 'error'
  durationMs: 1200,
  parentEventId: toolEventId,  // Links to the call
});
```

### Errors

```typescript
try {
  await llm.complete(prompt);
} catch (error) {
  session.trackError(error, {
    recoverable: false,
    context: { prompt },
  });
}
```

### Custom Events

```typescript
session.trackCustom("user_feedback", {
  rating: 5,
  comment: "Very helpful!",
  category: "accuracy",
});
```

## Event Structure

Every event has these common fields:

```typescript
interface BaseEvent {
  eventId: string; // Unique identifier
  sessionId: string; // Parent session
  type: EventType; // Event type
  timestamp: number; // Unix milliseconds
  parentEventId?: string; // For hierarchical tracing
  tags?: string[];
  metadata?: Record<string, any>;
}
```

## Event Hierarchy

Events can form parent-child relationships for trace visualization:

```
prompt (evt_001)
├── tool_call (evt_002)
│   └── tool_result (evt_003)
└── response (evt_004)
```

Use `parentEventId` to establish relationships:

```typescript
const promptId = session.trackPrompt("Search for...");

const toolId = session.trackToolCall("search", input, {
  parentEventId: promptId,
});

session.trackToolResult("search", output, {
  parentEventId: toolId,
});

session.trackResponse(response, {
  parentEventId: promptId,
});
```

## Automatic vs Manual Events

| Approach             | Pros                          | Cons         |
| -------------------- | ----------------------------- | ------------ |
| Auto-instrumentation | Zero code changes, consistent | Less control |
| Manual tracking      | Full control, custom events   | More code    |

Most users combine both: auto-instrumentation for LLM calls plus manual tracking for custom business events.

## Related

- [Sessions](/docs/concepts/sessions) - Container for events
- [Auto-Instrumentation](/docs/concepts/auto-instrumentation) - Automatic event capture
