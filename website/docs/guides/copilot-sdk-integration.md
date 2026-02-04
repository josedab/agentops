# GitHub Copilot SDK Integration

Guide to instrumenting GitHub Copilot extensions with AgentOps.

## Installation

```bash
npm install @agentops/sdk @github/copilot-sdk
```

## Basic Setup

```typescript
import { AgentOps } from "@agentops/sdk";
import { CopilotClient } from "@github/copilot-sdk";

const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});

const copilot = agentops.wrap(new CopilotClient());

const session = await copilot.createSession({
  model: "gpt-4o",
});

const response = await session.sendAndWait("Hello!");
console.log(response.content);

await agentops.shutdown();
```

## What Gets Tracked

| Field            | Source                 |
| ---------------- | ---------------------- |
| Model            | Session model          |
| Messages         | Send/receive pairs     |
| Tool Calls       | MCP tool invocations   |
| Response Time    | Per-message latency    |
| Session Duration | Full conversation time |

## Tracking MCP Tools

MCP tool calls are automatically captured:

```typescript
// Tools registered with the Copilot client are tracked
const response = await session.sendAndWait("Search for the latest news");

// If the model calls an MCP tool, you'll see:
// - tool_call event with tool name and input
// - tool_result event with output and duration
```

## Multi-Turn Conversations

Each message in a conversation is tracked as a separate event:

```typescript
const session = await copilot.createSession({ model: "gpt-4o" });

await session.sendAndWait("What is 2 + 2?");
// Prompt and response tracked

await session.sendAndWait("And if I add 3 more?");
// Second exchange tracked with same session ID
```

## Best Practices

1. **Wrap at startup** - Wrap the CopilotClient once
2. **Session per conversation** - Each `createSession()` starts a new tracked session
3. **Shutdown gracefully** - Always call `agentops.shutdown()`

## Related

- [Getting Started](/docs/getting-started)
- [Sessions](/docs/concepts/sessions)
- [Tool Tracking](/docs/concepts/events)
