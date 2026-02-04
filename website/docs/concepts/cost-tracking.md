# Cost Tracking

AgentOps automatically calculates and tracks the cost of every LLM call, enabling you to understand spending and optimize your AI applications.

## How Cost Tracking Works

1. **Token counting** - AgentOps captures token usage from API responses
2. **Model pricing** - Built-in pricing table maps models to costs
3. **Cost calculation** - `cost = (promptTokens × inputPrice) + (completionTokens × outputPrice)`
4. **Attribution** - Costs are attributed to sessions, users, and features

## Automatic Cost Calculation

When using auto-instrumentation, costs are calculated automatically:

```typescript
const openai = agentops.wrap(new OpenAI());

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});

// Cost is automatically tracked based on:
// - Model: gpt-4o
// - Prompt tokens from response.usage.prompt_tokens
// - Completion tokens from response.usage.completion_tokens
```

## Viewing Costs

### Session Stats

```typescript
const session = agentops.startSession();
// ... make LLM calls ...

console.log(session.stats.totalCost);
// 0.0156

console.log(session.stats);
// {
//   promptTokens: 450,
//   completionTokens: 230,
//   totalTokens: 680,
//   estimatedCost: 0.0156,
//   totalCost: 0.0156,
// }
```

### Dashboard

The AgentOps dashboard provides cost analytics:

- **Cost over time** - Spending trends
- **Cost by model** - Compare model efficiency
- **Cost by user** - Per-user attribution
- **Cost by feature** - Feature-level breakdown

## Supported Models

AgentOps includes pricing for popular models:

| Provider  | Models                                                 |
| --------- | ------------------------------------------------------ |
| OpenAI    | GPT-4o, GPT-4o-mini, GPT-4, GPT-3.5-turbo, o1, o1-mini |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku       |
| Others    | Custom pricing configuration                           |

## Custom Pricing

For models not in the default pricing table, provide costs manually:

```typescript
session.trackResponse("Response text", {
  model: "custom-model",
  tokens: {
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
  },
  cost: 0.0025, // Explicit cost overrides calculation
});
```

## Cost Attribution

### By User

```typescript
const session = agentops.startSession({
  userId: "user_123", // Costs attributed to this user
});
```

### By Feature

```typescript
const session = agentops.startSession({
  userId: "user_123",
  featureId: "support-agent", // Costs attributed to this feature
});
```

### By Tags

```typescript
const session = agentops.startSession({
  tags: ["experiment-a", "production"],
});
```

## Cost Guardrails

Prevent runaway costs with the [Cost Guardrails](/docs/guides/cost-guardrails) feature:

```typescript
import { CostGuardrailsEngine } from "@agentops/sdk";

const guardrails = new CostGuardrailsEngine({
  enabled: true,
  defaultSessionLimit: 1.0, // $1 max per session
  defaultUserLimit: 10.0, // $10 max per user per hour
  onLimitEnforced: (event) => {
    console.log("Cost limit hit:", event);
  },
});
```

## Best Practices

1. **Set userId for all sessions** - Enables per-user cost tracking
2. **Use featureId for segmentation** - Compare costs across features
3. **Set up cost alerts** - Get notified when spending spikes
4. **Review weekly** - Identify optimization opportunities
5. **Use cost guardrails** - Prevent unexpected charges

## Related

- [Cost Guardrails](/docs/guides/cost-guardrails) - Budget enforcement
- [API Metrics](/docs/api-reference/metrics) - Query cost data via API
- [Sessions](/docs/concepts/sessions) - Session-level cost tracking
