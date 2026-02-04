# Semantic Diff

Compare agent behavior across versions, deployments, and time periods.

## Overview

Semantic Diff helps you understand how changes affect your agent:

- **Prompt changes** - Did the new system prompt improve responses?
- **Deployments** - Is the new version better or worse?
- **A/B testing** - Which variant performs better?

## Setup

```typescript
import { SemanticDiffEngine } from "@agentops/sdk";

const diffEngine = new SemanticDiffEngine({
  enabled: true,
});
```

## Comparing Prompt Versions

```typescript
const diff = await diffEngine.comparePromptVersions("v1.0", "v2.0");

console.log(diff.summary.assessment);
// 'improved' | 'degraded' | 'neutral' | 'mixed'

console.log(diff.summary);
// {
//   assessment: 'improved',
//   confidenceScore: 0.85,
//   sampleSize: { baseline: 500, comparison: 450 },
// }

console.log(diff.metrics);
// {
//   successRate: { baseline: 0.92, comparison: 0.96, change: +0.04 },
//   avgLatency: { baseline: 1200, comparison: 980, change: -220 },
//   avgCost: { baseline: 0.015, comparison: 0.012, change: -0.003 },
// }

console.log(diff.significantChanges);
// [
//   { metric: 'successRate', direction: 'improved', magnitude: 'moderate' },
//   { metric: 'latency', direction: 'improved', magnitude: 'significant' },
// ]
```

## Comparing Time Periods

Compare behavior before and after a deployment:

```typescript
const deploymentTimestamp = new Date("2024-01-15T10:00:00Z").getTime();

const timeDiff = await diffEngine.compareTimePeriods(deploymentTimestamp, {
  beforeDurationMs: 24 * 60 * 60 * 1000, // 24 hours before
  afterDurationMs: 24 * 60 * 60 * 1000, // 24 hours after
});

console.log(timeDiff.summary.assessment);
// 'improved' - deployment was positive

console.log(timeDiff.recommendations);
// ['Continue monitoring error rate', 'Cost reduction confirmed']
```

## Tracking Deployments

Record deployments for easy comparison:

```typescript
diffEngine.recordDeployment({
  version: "1.2.3",
  commitSha: "abc123",
  environment: "production",
  timestamp: Date.now(),
  metadata: {
    changes: ["Updated system prompt", "Added caching"],
  },
});

// Later, compare deployments
const versionDiff = await diffEngine.compareDeployments("1.2.2", "1.2.3");
```

## Metrics Compared

| Metric                  | Description                      |
| ----------------------- | -------------------------------- |
| Success Rate            | Percentage of non-error sessions |
| Latency (p50, p90, p99) | Response time percentiles        |
| Average Cost            | Cost per session                 |
| Token Efficiency        | Output tokens per prompt token   |
| Tool Usage              | Tool call patterns               |
| Error Types             | Distribution of error types      |

## Best Practices

1. **Wait for sufficient data** - Need at least 100 sessions per variant
2. **Control for variables** - Compare similar time periods/traffic
3. **Check confidence** - Low confidence means results may not be significant
4. **Review recommendations** - The engine provides actionable suggestions

## Related

- [AI Debugging](/docs/guides/debugging-with-copilot)
- [Sessions](/docs/concepts/sessions)
