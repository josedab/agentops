---
title: Migrate from Custom Logging
description: Replace homegrown AI observability with AgentOps
---

# Migrate from Custom Logging

This guide helps you replace custom logging solutions with AgentOps.

## Common Custom Patterns

### Pattern 1: Console/File Logging

**Before:**

```typescript
async function callOpenAI(prompt: string) {
  console.log(`[${new Date().toISOString()}] Prompt: ${prompt}`);

  const start = Date.now();
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
  });

  const duration = Date.now() - start;
  console.log(
    `[${new Date().toISOString()}] Response: ${response.choices[0].message.content}`,
  );
  console.log(`[${new Date().toISOString()}] Duration: ${duration}ms`);
  console.log(
    `[${new Date().toISOString()}] Tokens: ${response.usage?.total_tokens}`,
  );

  return response;
}
```

**After:**

```typescript
import { AgentOps } from "@agentops/sdk";
import OpenAI from "openai";

const agentops = new AgentOps({ apiKey: process.env.AGENTOPS_API_KEY! });
const openai = agentops.wrap(new OpenAI());

// That's it - all calls are automatically logged with:
// - Timestamps
// - Duration
// - Token counts
// - Cost calculations
// - Full request/response
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: prompt }],
});
```

### Pattern 2: Database Logging

**Before:**

```typescript
async function logToDatabase(event: AIEvent) {
  await db.insert('ai_logs', {
    id: uuid(),
    timestamp: new Date(),
    user_id: event.userId,
    model: event.model,
    prompt: event.prompt,
    response: event.response,
    tokens: event.tokens,
    duration_ms: event.durationMs,
    cost: calculateCost(event),
  });
}

async function callOpenAI(userId: string, prompt: string) {
  const start = Date.now();
  const response = await openai.chat.completions.create({...});

  await logToDatabase({
    userId,
    model: 'gpt-4',
    prompt,
    response: response.choices[0].message.content,
    tokens: response.usage?.total_tokens,
    durationMs: Date.now() - start,
  });

  return response;
}
```

**After:**

```typescript
const agentops = new AgentOps({ apiKey: process.env.AGENTOPS_API_KEY! });
const openai = agentops.wrap(new OpenAI(), { userId });

// Automatic logging with:
// - Structured events (not raw logs)
// - Query interface
// - Aggregations
// - Retention policies
const response = await openai.chat.completions.create({...});
```

### Pattern 3: Analytics/Metrics

**Before:**

```typescript
import { metrics } from './metrics';

async function callOpenAI(prompt: string) {
  const start = Date.now();

  try {
    const response = await openai.chat.completions.create({...});

    metrics.increment('openai.calls.success');
    metrics.histogram('openai.latency', Date.now() - start);
    metrics.increment('openai.tokens', response.usage?.total_tokens);

    return response;
  } catch (error) {
    metrics.increment('openai.calls.error');
    throw error;
  }
}
```

**After:**

```typescript
const agentops = new AgentOps({ apiKey: process.env.AGENTOPS_API_KEY! });
const openai = agentops.wrap(new OpenAI());

// Built-in metrics:
// - Call counts (success/error)
// - Latency histograms
// - Token usage
// - Cost tracking
// - Error rates
const response = await openai.chat.completions.create({...});
```

### Pattern 4: Distributed Tracing

**Before:**

```typescript
import { trace } from '@opentelemetry/api';

async function callOpenAI(prompt: string) {
  const tracer = trace.getTracer('ai-service');

  return tracer.startActiveSpan('openai.call', async (span) => {
    try {
      span.setAttribute('model', 'gpt-4');
      span.setAttribute('prompt.length', prompt.length);

      const response = await openai.chat.completions.create({...});

      span.setAttribute('response.tokens', response.usage?.total_tokens);
      span.setStatus({ code: SpanStatusCode.OK });

      return response;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

**After:**

```typescript
const agentops = new AgentOps({ apiKey: process.env.AGENTOPS_API_KEY! });
const openai = agentops.wrap(new OpenAI());

// Full distributed tracing with:
// - Automatic span creation
// - Parent-child relationships
// - Tool call tracking
// - Cross-service correlation
const response = await openai.chat.completions.create({...});
```

## Migration Strategy

### Phase 1: Add AgentOps (Keep Custom)

```typescript
const agentops = new AgentOps({ apiKey: process.env.AGENTOPS_API_KEY! });
const openai = agentops.wrap(new OpenAI());

// Keep existing logging temporarily
async function callOpenAI(prompt: string) {
  customLogger.log('prompt', prompt); // Keep this

  const response = await openai.chat.completions.create({...});

  customLogger.log('response', response); // Keep this

  return response;
}
```

### Phase 2: Verify AgentOps Data

1. Compare data in AgentOps dashboard vs custom logs
2. Verify all events are captured
3. Check cost calculations match

### Phase 3: Remove Custom Logging

```typescript
const agentops = new AgentOps({ apiKey: process.env.AGENTOPS_API_KEY! });
const openai = agentops.wrap(new OpenAI());

// Clean code - just use the wrapped client
const response = await openai.chat.completions.create({...});
```

## What You Get

### Instead of Building

| Custom Solution        | Hours | AgentOps    |
| ---------------------- | ----- | ----------- |
| Logging infrastructure | 40+   | ✅ Built-in |
| Cost calculation       | 20+   | ✅ Built-in |
| Dashboard              | 80+   | ✅ Built-in |
| Alerting               | 40+   | ✅ Built-in |
| Search/Query           | 40+   | ✅ Built-in |
| Retention/Archival     | 20+   | ✅ Built-in |
| Multi-model pricing    | 20+   | ✅ Built-in |

### Additional Features You Didn't Have

- **AI Debugging Copilot** - "Why did this session fail?"
- **Semantic Diff** - Compare agent versions meaningfully
- **Cost Guardrails** - Prevent runaway spending
- **Anomaly Detection** - Catch issues automatically

## Preserving Custom Logic

### Custom Events

If you have domain-specific events:

```typescript
// Keep tracking custom business events
session.trackCustom("user_satisfaction", {
  rating: 5,
  feedback: "Helpful!",
});

session.trackCustom("feature_usage", {
  feature: "code_review",
  duration: 120,
});
```

### Custom Metadata

```typescript
const session = agentops.startSession({
  userId: "user_123",
  featureId: "chat",
  metadata: {
    // Your custom fields
    tenant: "acme-corp",
    subscription: "enterprise",
    experiment: "v2-prompt",
  },
});
```

### Webhooks for Integration

Send events to your existing systems:

```typescript
// Configure webhook in dashboard
// AgentOps will POST events to your endpoint
```

## Common Challenges

### High Volume

```typescript
const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
  maxBatchSize: 200, // Larger batches
  flushInterval: 10000, // Less frequent
  sampleRate: 0.1, // Sample 10% if needed
});
```

### Existing Data

AgentOps doesn't import historical data, but you can:

1. Keep historical custom logs in archive
2. Start fresh with AgentOps going forward
3. Run parallel systems during transition

### Compliance Requirements

```typescript
const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
  endpoint: "https://your-agentops.internal.com", // Self-hosted
});
```

## Checklist

- [ ] Install AgentOps SDK
- [ ] Wrap AI clients
- [ ] Verify events appear in dashboard
- [ ] Compare metrics with custom solution
- [ ] Set up alerts to replace custom monitoring
- [ ] Remove custom logging code
- [ ] Update documentation

## Need Help?

- [Discord](https://discord.gg/agentops) - Migration support
- [GitHub Discussions](https://github.com/josedab/agentops/discussions) - Questions
