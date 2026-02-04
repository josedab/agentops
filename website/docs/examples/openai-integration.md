# OpenAI Integration Example

This example demonstrates automatic instrumentation with the OpenAI SDK.

## Overview

Using `wrap()`, AgentOps automatically captures all OpenAI API calls with zero code changes to your existing logic.

## Complete Example

```typescript
/**
 * AgentOps SDK - OpenAI Integration Example
 * Run with: OPENAI_API_KEY=sk-... npx tsx examples/openai-integration.ts
 */

import OpenAI from "openai";
import { AgentOps } from "@agentops/sdk";

async function main() {
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY environment variable is required");
    process.exit(1);
  }

  // Initialize AgentOps
  const agentops = new AgentOps({
    apiKey: process.env.AGENTOPS_API_KEY!,
    debug: true,
  });

  console.log("🚀 Starting OpenAI integration example...\n");

  // Create OpenAI client and wrap it with AgentOps
  const openai = agentops.wrap(new OpenAI(), {
    userId: "user_456",
    featureId: "openai-chat",
    tags: ["openai", "example"],
  });

  console.log("🤖 Sending request to OpenAI...\n");

  try {
    // Make an API call - automatically tracked!
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        {
          role: "user",
          content: "What are three interesting facts about the moon?",
        },
      ],
      max_tokens: 200,
    });

    console.log("📝 Response:");
    console.log(completion.choices[0]?.message?.content);
    console.log();

    console.log("📊 Usage:");
    console.log(`  Prompt tokens: ${completion.usage?.prompt_tokens}`);
    console.log(`  Completion tokens: ${completion.usage?.completion_tokens}`);
    console.log(`  Total tokens: ${completion.usage?.total_tokens}`);
    console.log();
  } catch (error) {
    console.error("❌ OpenAI API error:", error);
  }

  // Flush and shutdown
  console.log("🔄 Flushing events...");
  await agentops.flush();

  console.log("👋 Shutting down...");
  await agentops.shutdown();

  console.log("\n✨ Example completed!");
}

main().catch(console.error);
```

## What Gets Automatically Tracked

When you use `wrap()`, AgentOps captures:

| Field             | Source                                   |
| ----------------- | ---------------------------------------- |
| Model             | `request.model`                          |
| Messages          | `request.messages`                       |
| Response content  | `response.choices[0].message`            |
| Prompt tokens     | `response.usage.prompt_tokens`           |
| Completion tokens | `response.usage.completion_tokens`       |
| Finish reason     | `response.choices[0].finish_reason`      |
| Latency           | Calculated from request timing           |
| Cost              | Calculated from model pricing            |
| Function calls    | `response.choices[0].message.tool_calls` |

## Session Metadata

Pass metadata when wrapping to associate all calls with context:

```typescript
const openai = agentops.wrap(new OpenAI(), {
  userId: "user_456", // Track by user
  featureId: "openai-chat", // Track by feature
  tags: ["production"], // Add tags
});
```

## Multiple Conversations

Each unique conversation can have its own session:

```typescript
// Conversation 1
const client1 = agentops.wrap(new OpenAI(), { userId: 'user_1' });
await client1.chat.completions.create({...});

// Conversation 2
const client2 = agentops.wrap(new OpenAI(), { userId: 'user_2' });
await client2.chat.completions.create({...});

// Both tracked separately with different user attribution
```

## Error Handling

Errors are automatically tracked:

```typescript
try {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [...],
  });
} catch (error) {
  // AgentOps automatically tracks the error event
  console.error('Error:', error.message);
}
```

## Running This Example

```bash
# Set your API keys
export AGENTOPS_API_KEY=ao_your_key
export OPENAI_API_KEY=sk-your_key

# Run the example
npx tsx examples/openai-integration.ts
```

## Expected Output

```
🚀 Starting OpenAI integration example...

🤖 Sending request to OpenAI...

📝 Response:
Here are three interesting facts about the moon:
1. The Moon is slowly moving away from Earth...
2. The same side of the Moon always faces Earth...
3. The Moon has moonquakes...

📊 Usage:
  Prompt tokens: 28
  Completion tokens: 156
  Total tokens: 184

🔄 Flushing events...
👋 Shutting down...

✨ Example completed!
```

## Next Steps

- [Agent with Tools](/docs/examples/agent-with-tools) - Function calling
- [Auto-Instrumentation](/docs/concepts/auto-instrumentation) - How it works
- [OpenAI Guide](/docs/guides/openai-integration) - Full OpenAI guide
