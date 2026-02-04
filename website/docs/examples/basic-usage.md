# Basic Usage Example

This example demonstrates manual session tracking with AgentOps.

## Overview

Manual tracking gives you complete control over what events are recorded. Use this approach when:

- You're not using a supported LLM client
- You need fine-grained control over event data
- You're instrumenting custom AI workflows

## Complete Example

```typescript
/**
 * AgentOps SDK - Basic Usage Example
 * Run with: npx tsx examples/basic-usage.ts
 */

import { AgentOps } from "@agentops/sdk";

async function main() {
  // Initialize AgentOps
  const agentops = new AgentOps({
    apiKey: process.env.AGENTOPS_API_KEY!,
    debug: true,
  });

  console.log("🚀 Starting AgentOps example...\n");

  // Start a tracked session
  const session = agentops.startSession({
    userId: "user_123",
    featureId: "chat-assistant",
    tags: ["example", "demo"],
    metadata: {
      source: "cli",
      version: "1.0.0",
    },
  });

  console.log(`📋 Session started: ${session.sessionId}\n`);

  // Track system prompt
  session.trackPrompt(
    "You are a helpful assistant that provides concise answers.",
    { role: "system", model: "gpt-5" },
  );

  // Track user prompt
  session.trackPrompt("What is the capital of France?", {
    role: "user",
    model: "gpt-5",
  });

  // Simulate processing time
  await sleep(500);

  // Track AI response
  session.trackResponse(
    "The capital of France is Paris. It is the largest city in France and serves as the country's political, economic, and cultural center.",
    {
      model: "gpt-5",
      durationMs: 487,
      tokens: {
        promptTokens: 45,
        completionTokens: 32,
        totalTokens: 77,
      },
      finishReason: "stop",
    },
  );

  console.log("✅ Response tracked\n");

  // Simulate a tool call
  console.log("🔧 Simulating tool call...\n");

  const toolCallId = session.trackToolCall("web_search", {
    query: "Paris population 2024",
  });

  await sleep(300);

  session.trackToolResult(
    "web_search",
    {
      results: [
        { title: "Paris Population", snippet: "2.1 million in city proper" },
      ],
    },
    {
      status: "success",
      durationMs: 287,
      parentEventId: toolCallId,
    },
  );

  console.log("✅ Tool call tracked\n");

  // Track a follow-up question
  session.trackPrompt("What is the population of Paris?", {
    role: "user",
    model: "gpt-5",
  });

  await sleep(400);

  session.trackResponse(
    "Based on recent data, Paris has a population of approximately 2.1 million people within the city proper.",
    {
      model: "gpt-5",
      durationMs: 392,
      tokens: {
        promptTokens: 120,
        completionTokens: 28,
        totalTokens: 148,
      },
      finishReason: "stop",
    },
  );

  // Track a custom event (e.g., user feedback)
  session.trackCustom("user_satisfaction", {
    rating: 5,
    feedback: "Very helpful!",
  });

  // End the session
  session.end({ status: "completed" });

  // View session statistics
  console.log("📊 Session Statistics:");
  console.log(JSON.stringify(session.stats, null, 2));
  console.log();

  // Flush and shutdown
  console.log("🔄 Flushing events...");
  await agentops.flush();

  console.log("👋 Shutting down...");
  await agentops.shutdown();

  console.log("\n✨ Example completed successfully!");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
```

## Key Concepts Demonstrated

### 1. Session Initialization

```typescript
const session = agentops.startSession({
  userId: "user_123", // Attribute costs to this user
  featureId: "chat-assistant", // Group by feature
  tags: ["example"], // Filterable tags
  metadata: { source: "cli" }, // Custom context
});
```

### 2. Tracking Prompts

```typescript
session.trackPrompt("User message", {
  role: "user", // 'system' | 'user' | 'assistant'
  model: "gpt-5",
});
```

### 3. Tracking Responses

```typescript
session.trackResponse("AI response", {
  model: "gpt-5",
  durationMs: 487,
  tokens: {
    promptTokens: 45,
    completionTokens: 32,
    totalTokens: 77,
  },
  finishReason: "stop",
});
```

### 4. Tracking Tool Calls

```typescript
const toolCallId = session.trackToolCall('web_search', { query: '...' });

session.trackToolResult('web_search', { results: [...] }, {
  status: 'success',
  durationMs: 287,
  parentEventId: toolCallId,  // Links result to call
});
```

### 5. Custom Events

```typescript
session.trackCustom("user_satisfaction", {
  rating: 5,
  feedback: "Very helpful!",
});
```

### 6. Session Statistics

After tracking events, access real-time stats:

```typescript
console.log(session.stats);
// {
//   eventCount: 8,
//   promptTokens: 165,
//   completionTokens: 60,
//   totalTokens: 225,
//   estimatedCost: 0.0045,
//   durationMs: 1200,
//   toolCalls: 1,
//   errors: 0,
//   models: ['gpt-5'],
//   tools: ['web_search']
// }
```

## Running This Example

```bash
# Set your API key
export AGENTOPS_API_KEY=ao_your_key

# Run the example
npx tsx examples/basic-usage.ts
```

## Next Steps

- [OpenAI Integration](/docs/examples/openai-integration) - Automatic instrumentation
- [Agent with Tools](/docs/examples/agent-with-tools) - Multi-step agents
- [Sessions](/docs/concepts/sessions) - Deep dive into sessions
