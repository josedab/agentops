---
title: Streaming Responses
description: Track streaming completions from AI models
---

# Streaming Responses

This recipe shows how to track streaming responses while maintaining real-time UI updates.

## The Challenge

Streaming responses arrive in chunks, but you need:

- Real-time UI updates (show text as it arrives)
- Complete tracking (capture the full response)
- Accurate token counts (only available at the end)
- Error handling (stream can fail mid-response)

## Basic Streaming

### With Auto-Instrumentation

AgentOps automatically tracks streaming when you use `wrap()`:

```typescript
import { AgentOps } from "@agentops/sdk";
import OpenAI from "openai";

const agentops = new AgentOps({ apiKey: process.env.AGENTOPS_API_KEY! });
const openai = agentops.wrap(new OpenAI());

async function streamResponse(prompt: string) {
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    stream: true,
  });

  let fullResponse = "";

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    fullResponse += content;

    // Update UI in real-time
    process.stdout.write(content);
  }

  console.log("\n");

  // AgentOps automatically captures:
  // - Full response text
  // - Total duration
  // - Token usage (from final chunk)

  return fullResponse;
}
```

### Manual Tracking

For more control, track manually:

```typescript
async function streamWithManualTracking(prompt: string) {
  const session = agentops.startSession({ featureId: "streaming" });

  // Track the prompt
  session.trackPrompt(prompt, { role: "user", model: "gpt-4o" });

  const startTime = Date.now();
  let fullResponse = "";
  let usage = null;

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      stream: true,
      stream_options: { include_usage: true }, // Get token counts
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      fullResponse += content;

      // Capture usage from final chunk
      if (chunk.usage) {
        usage = chunk.usage;
      }

      process.stdout.write(content);
    }

    // Track complete response
    session.trackResponse(fullResponse, {
      model: "gpt-4o",
      durationMs: Date.now() - startTime,
      tokens: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          }
        : undefined,
      finishReason: "stop",
    });
  } catch (error) {
    // Track streaming error
    session.trackError(error as Error, {
      context: "streaming",
      partialResponse: fullResponse,
      chunkCount: fullResponse.length,
    });
    throw error;
  } finally {
    session.end();
  }

  return fullResponse;
}
```

## Streaming with Tool Calls

Function calls can also stream:

```typescript
async function streamWithTools(prompt: string) {
  const session = agentops.startSession({ featureId: "streaming-tools" });

  const tools = [
    {
      type: "function" as const,
      function: {
        name: "get_weather",
        description: "Get weather for a location",
        parameters: {
          type: "object",
          properties: { location: { type: "string" } },
          required: ["location"],
        },
      },
    },
  ];

  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    tools,
    stream: true,
  });

  let fullResponse = "";
  let toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
  let currentToolCall: { id: string; name: string; arguments: string } | null =
    null;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;

    // Handle text content
    if (delta?.content) {
      fullResponse += delta.content;
      process.stdout.write(delta.content);
    }

    // Handle tool calls
    if (delta?.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        if (toolCall.id) {
          // New tool call starting
          currentToolCall = {
            id: toolCall.id,
            name: toolCall.function?.name || "",
            arguments: toolCall.function?.arguments || "",
          };
          toolCalls.push(currentToolCall);
        } else if (currentToolCall && toolCall.function?.arguments) {
          // Continuing to stream arguments
          currentToolCall.arguments += toolCall.function.arguments;
        }
      }
    }
  }

  // Track any tool calls
  for (const tc of toolCalls) {
    session.trackToolCall(tc.name, JSON.parse(tc.arguments));
  }

  session.end();

  return { content: fullResponse, toolCalls };
}
```

## Real-Time Progress Tracking

Track streaming progress for long responses:

```typescript
async function streamWithProgress(prompt: string) {
  const session = agentops.startSession({ featureId: "streaming" });

  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    stream: true,
    max_tokens: 4000, // Long response expected
  });

  let chunkCount = 0;
  let fullResponse = "";
  const progressInterval = 50; // Track every 50 chunks

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    fullResponse += content;
    chunkCount++;

    // Track progress periodically
    if (chunkCount % progressInterval === 0) {
      session.trackCustom("streaming_progress", {
        chunkCount,
        characterCount: fullResponse.length,
        estimatedTokens: Math.floor(fullResponse.length / 4),
      });
    }

    process.stdout.write(content);
  }

  session.trackCustom("streaming_complete", {
    totalChunks: chunkCount,
    totalCharacters: fullResponse.length,
  });

  session.end();

  return fullResponse;
}
```

## Server-Sent Events (SSE)

For web applications using SSE:

```typescript
import express from "express";

const app = express();

app.get("/api/chat", async (req, res) => {
  const prompt = req.query.prompt as string;
  const session = agentops.startSession({
    featureId: "sse-chat",
    userId: req.user?.id,
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      fullResponse += content;

      // Send SSE event
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);

    session.trackResponse(fullResponse, { model: "gpt-4o" });
  } catch (error) {
    res.write(
      `data: ${JSON.stringify({ error: (error as Error).message })}\n\n`,
    );
    session.trackError(error as Error);
  } finally {
    session.end();
    res.end();
  }
});
```

## Timeout Handling

Handle stalled streams:

```typescript
async function streamWithTimeout(prompt: string, timeoutMs = 30000) {
  const session = agentops.startSession({ featureId: "streaming" });

  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    stream: true,
  });

  let fullResponse = "";
  let lastChunkTime = Date.now();

  const checkTimeout = setInterval(() => {
    if (Date.now() - lastChunkTime > timeoutMs) {
      session.trackCustom("stream_timeout", {
        partialResponse: fullResponse,
        timeoutMs,
      });
      throw new Error(`Stream timeout after ${timeoutMs}ms`);
    }
  }, 1000);

  try {
    for await (const chunk of stream) {
      lastChunkTime = Date.now();
      const content = chunk.choices[0]?.delta?.content || "";
      fullResponse += content;
    }
  } finally {
    clearInterval(checkTimeout);
    session.end();
  }

  return fullResponse;
}
```

## Best Practices

1. **Always capture full response** - Don't just track chunks
2. **Track errors with partial data** - Include what was received before failure
3. **Use `stream_options.include_usage`** - Get accurate token counts
4. **Set reasonable timeouts** - Streams can stall
5. **Close sessions on completion** - Even if response was incomplete

## Related

- [OpenAI Integration](/docs/guides/openai-integration) - Full OpenAI setup
- [Error Handling](/docs/troubleshooting) - Handle streaming errors
