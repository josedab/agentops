# Anthropic Integration

Guide to instrumenting Anthropic Claude API calls with AgentOps.

## Installation

```bash
npm install @agentops/sdk @anthropic-ai/sdk
```

## Basic Setup

```typescript
import { AgentOps } from "@agentops/sdk";
import Anthropic from "@anthropic-ai/sdk";

const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});

const anthropic = agentops.wrap(new Anthropic());

const response = await anthropic.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.content[0].text);

await agentops.shutdown();
```

## What Gets Tracked

| Field         | Source                         |
| ------------- | ------------------------------ |
| Model         | `request.model`                |
| Messages      | `request.messages`             |
| Response      | `response.content`             |
| Input Tokens  | `response.usage.input_tokens`  |
| Output Tokens | `response.usage.output_tokens` |
| Stop Reason   | `response.stop_reason`         |

## Tool Use

Claude's tool use is automatically tracked:

```typescript
const response = await anthropic.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  messages: [{ role: "user", content: "What is 2 + 2?" }],
  tools: [
    {
      name: "calculator",
      description: "Perform calculations",
      input_schema: {
        type: "object",
        properties: {
          expression: { type: "string" },
        },
        required: ["expression"],
      },
    },
  ],
});

// Tool use blocks captured as tool_call events
```

## Streaming

```typescript
const stream = await anthropic.messages.stream({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Write a haiku" }],
});

for await (const event of stream) {
  if (event.type === "content_block_delta") {
    process.stdout.write(event.delta.text);
  }
}

// Final message tracked with complete usage
```

## Related

- [OpenAI Integration](/docs/guides/openai-integration)
- [Cost Tracking](/docs/concepts/cost-tracking)
