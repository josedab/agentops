---
title: Migrate from LangSmith
description: Step-by-step guide to migrate from LangSmith to AgentOps
---

# Migrate from LangSmith

This guide walks you through migrating from LangSmith to AgentOps.

## Quick Comparison

| Feature              | LangSmith   | AgentOps                    |
| -------------------- | ----------- | --------------------------- |
| Tracing              | ✅          | ✅                          |
| Auto-instrumentation | Python only | TS, Python, Go              |
| Cost tracking        | ❌          | ✅ Built-in                 |
| AI debugging         | ❌          | ✅ Natural language queries |
| Self-hosting         | ❌          | ✅                          |
| Pricing              | Per trace   | Per event                   |

## Migration Steps

### Step 1: Install AgentOps SDK

```bash
# Remove LangSmith
pip uninstall langsmith

# Install AgentOps
pip install agentops
# or for TypeScript
npm install @agentops/sdk
```

### Step 2: Update Environment Variables

```bash
# Remove LangSmith variables
# LANGCHAIN_TRACING_V2=true
# LANGCHAIN_API_KEY=ls_...
# LANGCHAIN_PROJECT=my-project

# Add AgentOps variables
AGENTOPS_API_KEY=ao_your_key
```

### Step 3: Replace Initialization

**Before (LangSmith):**

```python
# LangSmith auto-tracing via environment variables
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = "ls_..."

from langchain_openai import ChatOpenAI
llm = ChatOpenAI(model="gpt-4")
```

**After (AgentOps):**

```python
from agentops import AgentOps
from openai import OpenAI

agentops = AgentOps(api_key="ao_your_key")
client = agentops.wrap(OpenAI())

# Use client normally - all calls are tracked
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}]
)
```

### Step 4: Update Custom Tracing

**Before (LangSmith):**

```python
from langsmith import traceable

@traceable
def my_function(input_text: str) -> str:
    # ... processing
    return result
```

**After (AgentOps):**

```python
# Option 1: Session-based tracking
session = agentops.start_session(feature_id="my-feature")
session.track_custom("my_function", {"input": input_text, "output": result})
session.end()

# Option 2: Decorator (coming soon)
@agentops.track
def my_function(input_text: str) -> str:
    return result
```

### Step 5: Migrate Feedback/Evaluation

**Before (LangSmith):**

```python
from langsmith import Client
client = Client()
client.create_feedback(
    run_id="...",
    key="correctness",
    score=1.0
)
```

**After (AgentOps):**

```python
session.track_custom("feedback", {
    "key": "correctness",
    "score": 1.0,
    "comment": "Response was accurate"
})
```

### Step 6: Update Dashboards

LangSmith concepts map to AgentOps:

| LangSmith | AgentOps      |
| --------- | ------------- |
| Project   | Feature ID    |
| Run       | Session       |
| Trace     | Session trace |
| Span      | Event         |
| Feedback  | Custom event  |

## TypeScript Migration

**Before (LangSmith with LangChain.js):**

```typescript
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  modelName: "gpt-4",
  callbacks: [
    /* LangSmith callbacks */
  ],
});
```

**After (AgentOps):**

```typescript
import { AgentOps } from "@agentops/sdk";
import OpenAI from "openai";

const agentops = new AgentOps({ apiKey: "ao_your_key" });
const openai = agentops.wrap(new OpenAI());

// Direct OpenAI usage with automatic tracking
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});
```

## Data Migration

AgentOps doesn't directly import LangSmith data, but you can:

1. **Export LangSmith runs** via their API
2. **Replay as AgentOps events** using the manual tracking API

```python
# Example: Replay historical data
import agentops
from langsmith import Client

ls_client = Client()
ao_client = agentops.AgentOps(api_key="ao_your_key")

for run in ls_client.list_runs(project_name="my-project"):
    session = ao_client.start_session(
        feature_id="migrated",
        metadata={"original_run_id": run.id}
    )

    for event in run.events:
        session.track_custom(event.type, event.data)

    session.end()
```

## Feature Mapping

### Tracing Depth

Both tools capture full traces, but AgentOps adds:

- Automatic cost calculation
- AI-powered debugging
- Semantic comparisons

### Prompt Hub → Prompt Registry

LangSmith Prompt Hub concepts map to AgentOps Prompt Registry:

```python
# AgentOps Prompt Registry
from agentops.features import PromptRegistry

registry = PromptRegistry(agentops)

# Register a prompt version
registry.register(
    name="chat-system",
    version="1.2.0",
    content="You are a helpful assistant...",
    tags=["production"]
)

# Use with A/B testing
prompt = registry.get("chat-system", variant="control")
```

## Common Issues

### Missing Traces

If traces aren't appearing:

```python
# Ensure flush before exit
await agentops.flush()
await agentops.shutdown()
```

### LangChain Integration

AgentOps works alongside LangChain without LangSmith:

```python
from langchain_openai import ChatOpenAI
from agentops import AgentOps

agentops = AgentOps(api_key="ao_your_key")

# Wrap the underlying client
llm = ChatOpenAI(model="gpt-4")
llm.client = agentops.wrap(llm.client)
```

## Need Help?

- [Discord](https://discord.gg/agentops) - Live migration support
- [GitHub Discussions](https://github.com/josedab/agentops/discussions) - Migration questions
