# Cost Guardrails

Prevent runaway costs with real-time spending limits and budget enforcement.

## Overview

Cost Guardrails protect you from unexpected charges by:

- Setting per-session spending limits
- Enforcing per-user hourly/daily budgets
- Warning before limits are reached
- Blocking requests that exceed budgets

## Setup

```typescript
import { CostGuardrailsEngine } from "@agentops/sdk";

const guardrails = new CostGuardrailsEngine({
  enabled: true,
  defaultSessionLimit: 1.0, // $1 max per session
  defaultUserLimit: 10.0, // $10 max per user per hour
  defaultAction: "soft_block",
  warningThreshold: 0.8, // Warn at 80% of limit
  onWarning: (warning) => {
    console.log("Budget warning:", warning);
  },
  onLimitEnforced: (enforcement) => {
    console.log("Limit enforced:", enforcement);
  },
});
```

## Enforcement Actions

| Action       | Behavior                   |
| ------------ | -------------------------- |
| `warn`       | Log warning, allow request |
| `throttle`   | Add delay before request   |
| `soft_block` | Block but allow override   |
| `hard_block` | Block completely           |

## Checking Before Requests

```typescript
const check = guardrails.checkCost({
  sessionId: 'sess_123',
  userId: 'user_456',
  estimatedCost: 0.05,
});

if (!check.allowed) {
  console.log('Request blocked:', check.message);
  // Handle blocked request
  return;
}

// Proceed with LLM call
const response = await openai.chat.completions.create({...});

// Record actual cost
guardrails.recordCost({
  sessionId: 'sess_123',
  userId: 'user_456',
  cost: response.usage.total_tokens * 0.00001, // Calculate actual cost
  timestamp: Date.now(),
});
```

## Custom Limits

### Per-User Limits

```typescript
// Premium users get higher limits
guardrails.setUserLimit({
  userId: "premium_user_123",
  maxCost: 100.0,
  windowMs: 24 * 60 * 60 * 1000, // 24-hour rolling window
});

// Free tier users get lower limits
guardrails.setUserLimit({
  userId: "free_user_456",
  maxCost: 1.0,
  windowMs: 60 * 60 * 1000, // 1-hour window
});
```

### Per-Session Limits

```typescript
guardrails.setSessionLimit({
  sessionId: "sess_789",
  maxCost: 5.0, // This specific session can spend $5
});
```

### Per-Feature Limits

```typescript
guardrails.setFeatureLimit({
  featureId: "expensive-agent",
  maxCost: 50.0,
  windowMs: 60 * 60 * 1000,
});
```

## Spending Summaries

```typescript
const summary = guardrails.getSpendingSummary(
  Date.now() - 86400000, // Last 24 hours
  Date.now(),
);

console.log(summary);
// {
//   total: 156.78,
//   byUser: [
//     { userId: 'user_123', cost: 45.23 },
//     { userId: 'user_456', cost: 32.10 },
//   ],
//   byFeature: [
//     { featureId: 'chatbot', cost: 89.50 },
//     { featureId: 'analyzer', cost: 67.28 },
//   ],
//   byModel: [
//     { model: 'gpt-4o', cost: 120.00 },
//     { model: 'gpt-4o-mini', cost: 36.78 },
//   ],
// }
```

## Handling Warnings

```typescript
const guardrails = new CostGuardrailsEngine({
  warningThreshold: 0.8,
  onWarning: (warning) => {
    // Send Slack notification
    slack.send({
      channel: "#alerts",
      text: `⚠️ User ${warning.userId} at ${warning.percentUsed}% of budget`,
    });
  },
});
```

## Handling Enforcement

```typescript
const guardrails = new CostGuardrailsEngine({
  onLimitEnforced: (enforcement) => {
    // Log for audit
    logger.warn("Cost limit enforced", enforcement);

    // Notify user
    if (enforcement.action === "soft_block") {
      notifyUser(enforcement.userId, "Budget limit reached");
    }
  },
});
```

## Best Practices

1. **Start with soft blocks** - Let users override initially
2. **Set conservative defaults** - Increase limits as needed
3. **Monitor warnings** - Warnings indicate users approaching limits
4. **Review weekly** - Adjust limits based on usage patterns
5. **Communicate limits** - Show users their remaining budget

## Related

- [Cost Tracking](/docs/concepts/cost-tracking)
- [API Metrics](/docs/api-reference/metrics)
