# Getting Started

Get AgentOps tracking your AI agent in under 5 minutes.

## Prerequisites

- Node.js 20 or higher
- An AgentOps API key ([sign up free](https://app.agentops.dev))

## Installation

```bash
npm install @agentops/sdk
# or
pnpm add @agentops/sdk
# or
yarn add @agentops/sdk
```

## Quick Start

### Option 1: Auto-Instrumentation (Recommended)

The easiest way to get started is to wrap your LLM client. AgentOps automatically tracks all calls with zero code changes.

```typescript
import { AgentOps } from "@agentops/sdk";
import OpenAI from "openai";

// Initialize AgentOps
const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});

// Wrap your client - that's it!
const openai = agentops.wrap(new OpenAI());

// All calls are automatically tracked
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.choices[0].message.content);

// Graceful shutdown
await agentops.shutdown();
```

### Option 2: Manual Tracking

For more control, you can manually track sessions and events:

```typescript
import { AgentOps } from "@agentops/sdk";

const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});

// Start a session
const session = agentops.startSession({
  userId: "user_123",
  featureId: "chat-assistant",
  tags: ["production"],
});

// Track a prompt
session.trackPrompt("What is the capital of France?", {
  role: "user",
  model: "gpt-4o",
});

// Track the response
session.trackResponse("The capital of France is Paris.", {
  model: "gpt-4o",
  durationMs: 523,
  tokens: {
    promptTokens: 12,
    completionTokens: 8,
    totalTokens: 20,
  },
});

// End the session
session.end({ status: "completed" });

await agentops.shutdown();
```

## Environment Variables

Set your API key as an environment variable:

```bash
export AGENTOPS_API_KEY=ao_your_project_id_your_secret
```

## View Your Data

After running your agent, view the results in the [AgentOps Dashboard](https://app.agentops.dev):

1. Open the Sessions page
2. Click on a session to see the full trace
3. Explore costs, latencies, and token usage

## Next Steps

- [Core Concepts](/docs/concepts) - Understand sessions, events, and tracing
- [OpenAI Integration](/docs/guides/openai-integration) - Detailed OpenAI setup
- [Cost Guardrails](/docs/guides/cost-guardrails) - Set up budget limits
- [AI Debugging](/docs/guides/debugging-with-copilot) - Use natural language debugging
