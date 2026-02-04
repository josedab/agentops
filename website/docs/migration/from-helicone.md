---
title: Migrate from Helicone
description: Step-by-step guide to migrate from Helicone to AgentOps
---

# Migrate from Helicone

This guide walks you through migrating from Helicone's proxy-based approach to AgentOps SDK.

## Quick Comparison

| Feature              | Helicone        | AgentOps       |
| -------------------- | --------------- | -------------- |
| Integration          | Proxy URL       | SDK            |
| Language support     | Any (via proxy) | TS, Python, Go |
| Auto-instrumentation | ❌              | ✅             |
| Session tracking     | ❌              | ✅             |
| AI debugging         | ❌              | ✅             |
| Self-hosting         | ❌              | ✅             |

## Migration Steps

### Step 1: Install AgentOps SDK

```bash
npm install @agentops/sdk
# or
pip install agentops
```

### Step 2: Remove Helicone Proxy Configuration

**Before (Helicone):**

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://oai.helicone.ai/v1",
  defaultHeaders: {
    "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
    "Helicone-User-Id": "user_123",
  },
});
```

**After (AgentOps):**

```typescript
import OpenAI from "openai";
import { AgentOps } from "@agentops/sdk";

const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});

const openai = agentops.wrap(
  new OpenAI(), // No proxy needed - uses OpenAI directly
  { userId: "user_123" },
);
```

### Step 3: Update Environment Variables

```bash
# Remove Helicone
# HELICONE_API_KEY=sk-helicone-...

# Add AgentOps
AGENTOPS_API_KEY=ao_your_key
```

### Step 4: Migrate Custom Properties

**Before (Helicone):**

```typescript
const response = await openai.chat.completions.create(
  {
    model: 'gpt-4',
    messages: [...],
  },
  {
    headers: {
      'Helicone-Property-Environment': 'production',
      'Helicone-Property-Feature': 'chat',
    },
  }
);
```

**After (AgentOps):**

```typescript
// Set properties at wrap time
const openai = agentops.wrap(new OpenAI(), {
  featureId: "chat",
  tags: ["production"],
  metadata: {
    environment: "production",
  },
});

// Or use session for more control
const session = agentops.startSession({
  featureId: "chat",
  tags: ["production"],
});
```

### Step 5: Migrate User Tracking

**Before (Helicone):**

```typescript
// Per-request user tracking via headers
const response = await openai.chat.completions.create(
  { model: 'gpt-4', messages: [...] },
  { headers: { 'Helicone-User-Id': userId } }
);
```

**After (AgentOps):**

```typescript
// User tracking via wrap or session
const openai = agentops.wrap(new OpenAI(), { userId });

// Or per-session
const session = agentops.startSession({ userId });
```

## Python Migration

**Before (Helicone):**

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["OPENAI_API_KEY"],
    base_url="https://oai.helicone.ai/v1",
    default_headers={
        "Helicone-Auth": f"Bearer {os.environ['HELICONE_API_KEY']}",
    }
)
```

**After (AgentOps):**

```python
from openai import OpenAI
from agentops import AgentOps

agentops = AgentOps(api_key=os.environ["AGENTOPS_API_KEY"])
client = agentops.wrap(OpenAI())

# Use normally
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}]
)
```

## Feature Mapping

| Helicone              | AgentOps                     |
| --------------------- | ---------------------------- |
| `Helicone-User-Id`    | `userId` in session/wrap     |
| `Helicone-Session-Id` | `sessionId` (auto-generated) |
| `Helicone-Property-*` | `metadata` object            |
| `Helicone-Prompt-Id`  | Prompt Registry              |
| Cache                 | Coming soon                  |

## Advantages of SDK Approach

### 1. No Proxy Latency

Helicone adds a network hop. AgentOps tracks locally:

```
Helicone:  Client → Helicone → OpenAI → Helicone → Client
AgentOps:  Client → OpenAI → Client (tracking happens async)
```

### 2. Session Context

Group related calls automatically:

```typescript
const session = agentops.startSession({ userId: 'user_123' });

// All calls in this session are grouped
await openai.chat.completions.create({...});
await openai.chat.completions.create({...});
await openai.chat.completions.create({...});

session.end();
```

### 3. Tool Call Tracking

AgentOps automatically captures function calling:

```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
  tools: [{ type: 'function', function: {...} }],
});

// Tool calls tracked automatically - no extra headers needed
```

### 4. Multi-Provider Support

Track any AI provider with one SDK:

```typescript
const openai = agentops.wrap(new OpenAI());
const anthropic = agentops.wrap(new Anthropic());

// Both tracked in the same session
```

## Gradual Migration

Run both systems during migration:

```typescript
import OpenAI from "openai";
import { AgentOps } from "@agentops/sdk";

// Keep Helicone temporarily
const heliconeClient = new OpenAI({
  baseURL: "https://oai.helicone.ai/v1",
  defaultHeaders: { "Helicone-Auth": `Bearer ${HELICONE_KEY}` },
});

// Add AgentOps
const agentops = new AgentOps({ apiKey: AGENTOPS_KEY });
const openai = agentops.wrap(new OpenAI());

// Gradually migrate traffic
const client = useAgentOps ? openai : heliconeClient;
```

## Common Issues

### Missing Requests

If some requests aren't tracked:

```typescript
// Ensure you're using the wrapped client
const openai = agentops.wrap(new OpenAI());

// ❌ This won't be tracked
const rawClient = new OpenAI();
await rawClient.chat.completions.create({...});

// ✅ This will be tracked
await openai.chat.completions.create({...});
```

### Flush Before Exit

```typescript
// Ensure all events are sent
await agentops.flush();
await agentops.shutdown();
```

## Need Help?

- [Discord](https://discord.gg/agentops) - Live migration support
- [GitHub Discussions](https://github.com/josedab/agentops/discussions) - Questions
