# Advanced Recipes

Production-ready patterns for complex AI applications.

## Available Recipes

- [Multi-Agent Systems](/docs/recipes/multi-agent) - Track coordinated agent interactions
- [Streaming Responses](/docs/recipes/streaming) - Handle and track streaming completions
- [RAG Applications](/docs/recipes/rag) - Instrument retrieval-augmented generation
- [Batch Processing](/docs/recipes/batch-processing) - High-volume job tracking

## When to Use These

| Recipe           | Use Case                                  |
| ---------------- | ----------------------------------------- |
| Multi-Agent      | Orchestrating multiple specialized agents |
| Streaming        | Real-time UI updates, long responses      |
| RAG              | Document Q&A, knowledge bases             |
| Batch Processing | Data processing, bulk operations          |

## Prerequisites

All recipes assume you have:

```typescript
import { AgentOps } from "@agentops/sdk";

const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});
```
