# AI Debugging Copilot

Use natural language to investigate and debug your agent sessions.

## Overview

The Debug Copilot lets you ask questions about your agent's behavior in plain English. Instead of manually searching through logs and traces, just ask:

- "Why did sessions fail yesterday?"
- "What errors are most common?"
- "Which users are affected by slow responses?"

## Setup

```typescript
import { DebugCopilot, InMemorySessionStore } from "@agentops/sdk";

const copilot = new DebugCopilot({
  enabled: true,
  sessionStore: new InMemorySessionStore(),
});
```

## Asking Questions

```typescript
const result = await copilot.ask({
  question: "Why did sessions fail yesterday?",
  timeRange: {
    start: Date.now() - 86400000, // 24 hours ago
    end: Date.now(),
  },
});

console.log(result.answer);
// "Analysis of 1,523 sessions from the past 24 hours shows 35 failures (2.3%).
//  The primary cause was rate limiting from the OpenAI API, affecting 15 sessions
//  between 2:00 PM and 3:00 PM UTC..."

console.log(result.rootCause);
// { type: 'RateLimitError', count: 15, ... }

console.log(result.recommendations);
// ['Implement exponential backoff', 'Consider caching frequent queries', ...]
```

## Multi-Turn Conversations

For deeper investigation, use conversation context:

```typescript
const conversationId = copilot.startConversation();

await copilot.ask({
  question: "What errors are most common?",
  conversationId,
});
// "The most common errors are: RateLimitError (42%), TimeoutError (34%)..."

await copilot.ask({
  question: "Which users are affected?",
  conversationId,
});
// "Based on the errors identified, 23 unique users were affected..."

await copilot.ask({
  question: "Show me an example session with this issue",
  conversationId,
});
// Returns specific session details
```

## Available Questions

The Debug Copilot can answer questions about:

- **Failures** - What went wrong and why
- **Performance** - Latency patterns and bottlenecks
- **Costs** - Spending anomalies and trends
- **Users** - User-specific issues
- **Comparisons** - Before/after changes

## Example Questions

```
"Why did sessions fail yesterday?"
"What's causing high latency in the support-agent feature?"
"Which model is most cost-effective for my use case?"
"Show me sessions where the agent used more than 3 tool calls"
"Compare error rates this week vs last week"
"What changed after the deployment on Tuesday?"
```

## Filtering

Narrow your investigation with filters:

```typescript
const result = await copilot.ask({
  question: "What errors occurred?",
  timeRange: { start, end },
  filters: {
    userId: "user_123",
    featureId: "support-agent",
    tags: ["production"],
    status: "error",
  },
});
```

## Integration with Dashboard

The Debug Copilot is also available in the AgentOps dashboard:

1. Go to Sessions page
2. Click "Ask Copilot" button
3. Type your question
4. View results with linked sessions

## Related

- [Sessions](/docs/concepts/sessions)
- [Semantic Diff](/docs/guides/semantic-diff)
- [Troubleshooting](/docs/troubleshooting)
