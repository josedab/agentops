# OpenAI Integration

Complete guide to instrumenting OpenAI API calls with AgentOps.

## Installation

```bash
npm install @agentops/sdk openai
```

## Basic Setup

```typescript
import { AgentOps } from "@agentops/sdk";
import OpenAI from "openai";

const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});

// Wrap the OpenAI client
const openai = agentops.wrap(new OpenAI());

// Use normally - all calls tracked
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" },
  ],
});

console.log(response.choices[0].message.content);

await agentops.shutdown();
```

## What Gets Tracked

AgentOps captures these fields from OpenAI calls:

| Field             | Source                              |
| ----------------- | ----------------------------------- |
| Model             | `request.model`                     |
| Messages          | `request.messages`                  |
| Response          | `response.choices[0].message`       |
| Prompt Tokens     | `response.usage.prompt_tokens`      |
| Completion Tokens | `response.usage.completion_tokens`  |
| Finish Reason     | `response.choices[0].finish_reason` |
| Duration          | Calculated from request timing      |
| Cost              | Calculated from model pricing       |

## Function Calling

Tool/function calls are automatically tracked:

```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "What is the weather in SF?" }],
  tools: [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather for a location",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" },
          },
          required: ["location"],
        },
      },
    },
  ],
});

// Tool calls are captured as tool_call events
// Response is captured with tool call details
```

## Streaming

Streaming responses are also tracked:

```typescript
const stream = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Write a poem" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}

// Full response and token counts captured at stream end
```

## Adding Session Context

Associate calls with users and features:

```typescript
const openai = agentops.wrap(new OpenAI(), {
  userId: "user_123",
  featureId: "chatbot",
  tags: ["production"],
});
```

## Embeddings

Embedding calls are also tracked:

```typescript
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: "Hello world",
});

// Tracked with model, dimensions, and token usage
```

## Best Practices

1. **Initialize once** - Create AgentOps and wrap OpenAI at startup
2. **Always shutdown** - Call `agentops.shutdown()` before exit
3. **Use async/await** - Ensure events are flushed
4. **Set userId** - Enable per-user cost tracking

## Related

- [Getting Started](/docs/getting-started)
- [Auto-Instrumentation](/docs/concepts/auto-instrumentation)
- [Cost Tracking](/docs/concepts/cost-tracking)
