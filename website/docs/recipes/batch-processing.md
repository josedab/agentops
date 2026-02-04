---
title: Batch Processing
description: Track high-volume AI batch jobs efficiently
---

# Batch Processing

This recipe shows how to efficiently track high-volume batch AI operations.

## When to Use

- Processing thousands of items with AI
- Data enrichment pipelines
- Bulk content generation
- Large-scale evaluations

## Basic Batch Processing

```typescript
import { AgentOps } from "@agentops/sdk";
import OpenAI from "openai";

const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
  // Optimize for batch
  flushInterval: 10000, // Flush every 10s
  maxBatchSize: 200, // Larger batches
});

const openai = agentops.wrap(new OpenAI());

interface BatchItem {
  id: string;
  input: string;
}

interface BatchResult {
  id: string;
  output: string;
  success: boolean;
  error?: string;
}

async function processBatch(items: BatchItem[]): Promise<BatchResult[]> {
  const session = agentops.startSession({
    featureId: "batch-processing",
    tags: ["batch"],
    metadata: {
      batchSize: items.length,
      startTime: new Date().toISOString(),
    },
  });

  const results: BatchResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  // Track batch start
  session.trackCustom("batch_start", {
    itemCount: items.length,
  });

  for (const item of items) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: item.input }],
      });

      results.push({
        id: item.id,
        output: response.choices[0].message.content || "",
        success: true,
      });
      successCount++;
    } catch (error) {
      results.push({
        id: item.id,
        output: "",
        success: false,
        error: (error as Error).message,
      });
      errorCount++;

      session.trackError(error as Error, {
        itemId: item.id,
        context: "batch_item",
      });
    }

    // Progress tracking every 100 items
    if ((successCount + errorCount) % 100 === 0) {
      session.trackCustom("batch_progress", {
        processed: successCount + errorCount,
        total: items.length,
        successCount,
        errorCount,
        percentComplete: ((successCount + errorCount) / items.length) * 100,
      });
    }
  }

  // Track batch completion
  session.trackCustom("batch_complete", {
    totalItems: items.length,
    successCount,
    errorCount,
    successRate: successCount / items.length,
  });

  session.end({ status: errorCount === 0 ? "completed" : "partial" });

  return results;
}
```

## Concurrent Batch Processing

Process multiple items in parallel for speed:

```typescript
async function processBatchConcurrent(
  items: BatchItem[],
  concurrency: number = 10,
): Promise<BatchResult[]> {
  const session = agentops.startSession({
    featureId: "batch-concurrent",
    metadata: { batchSize: items.length, concurrency },
  });

  const results: BatchResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  // Process in chunks
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);

    const chunkPromises = chunk.map(async (item) => {
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: item.input }],
        });

        successCount++;
        return {
          id: item.id,
          output: response.choices[0].message.content || "",
          success: true,
        };
      } catch (error) {
        errorCount++;
        session.trackError(error as Error, { itemId: item.id });
        return {
          id: item.id,
          output: "",
          success: false,
          error: (error as Error).message,
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);

    // Track chunk completion
    session.trackCustom("chunk_complete", {
      chunkIndex: Math.floor(i / concurrency),
      processed: results.length,
      total: items.length,
    });
  }

  session.trackCustom("batch_complete", {
    totalItems: items.length,
    successCount,
    errorCount,
    concurrency,
  });

  session.end();
  return results;
}
```

## OpenAI Batch API

Use OpenAI's native batch API for large jobs:

```typescript
async function processWithBatchAPI(items: BatchItem[]): Promise<string> {
  const session = agentops.startSession({
    featureId: "openai-batch-api",
    metadata: { itemCount: items.length },
  });

  // Create batch file
  const requests = items.map((item, index) => ({
    custom_id: item.id,
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: item.input }],
    },
  }));

  session.trackCustom("batch_file_created", {
    requestCount: requests.length,
  });

  // Upload batch file
  const file = await openai.files.create({
    file: new Blob([requests.map((r) => JSON.stringify(r)).join("\n")]),
    purpose: "batch",
  });

  session.trackCustom("batch_file_uploaded", {
    fileId: file.id,
  });

  // Create batch
  const batch = await openai.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/chat/completions",
    completion_window: "24h",
  });

  session.trackCustom("batch_created", {
    batchId: batch.id,
    status: batch.status,
  });

  // Poll for completion
  let status = batch.status;
  while (status !== "completed" && status !== "failed") {
    await sleep(60000); // Check every minute

    const updated = await openai.batches.retrieve(batch.id);
    status = updated.status;

    session.trackCustom("batch_status", {
      batchId: batch.id,
      status,
      completedCount: updated.request_counts?.completed || 0,
      failedCount: updated.request_counts?.failed || 0,
    });
  }

  session.end({ status: status === "completed" ? "completed" : "failed" });

  return batch.id;
}
```

## Checkpoint and Resume

For very large batches, implement checkpointing:

```typescript
interface BatchCheckpoint {
  batchId: string;
  processedIds: string[];
  results: BatchResult[];
  sessionId: string;
}

async function processBatchWithCheckpoint(
  items: BatchItem[],
  batchId: string,
  checkpointPath: string,
): Promise<BatchResult[]> {
  // Load checkpoint if exists
  let checkpoint: BatchCheckpoint | null = null;
  try {
    checkpoint = JSON.parse(await fs.readFile(checkpointPath, "utf-8"));
  } catch {
    // No checkpoint, start fresh
  }

  const session = checkpoint
    ? agentops.resumeSession(checkpoint.sessionId)
    : agentops.startSession({
        featureId: "batch-checkpoint",
        metadata: { batchId, totalItems: items.length },
      });

  const processedIds = new Set(checkpoint?.processedIds || []);
  const results = checkpoint?.results || [];

  session.trackCustom("batch_resumed", {
    previouslyProcessed: processedIds.size,
    remaining: items.length - processedIds.size,
  });

  for (const item of items) {
    if (processedIds.has(item.id)) continue;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: item.input }],
      });

      results.push({
        id: item.id,
        output: response.choices[0].message.content || "",
        success: true,
      });
      processedIds.add(item.id);
    } catch (error) {
      results.push({
        id: item.id,
        output: "",
        success: false,
        error: (error as Error).message,
      });
      processedIds.add(item.id);
    }

    // Save checkpoint every 50 items
    if (results.length % 50 === 0) {
      await fs.writeFile(
        checkpointPath,
        JSON.stringify({
          batchId,
          processedIds: Array.from(processedIds),
          results,
          sessionId: session.sessionId,
        }),
      );

      session.trackCustom("checkpoint_saved", {
        processedCount: results.length,
      });
    }
  }

  // Clean up checkpoint
  await fs.unlink(checkpointPath).catch(() => {});

  session.end();
  return results;
}
```

## Cost Monitoring

Track costs during batch processing:

```typescript
async function processBatchWithCostLimit(
  items: BatchItem[],
  maxCostUsd: number,
): Promise<BatchResult[]> {
  const session = agentops.startSession({
    featureId: "batch-cost-limited",
    metadata: { maxCostUsd },
  });

  const results: BatchResult[] = [];
  let totalCost = 0;

  for (const item of items) {
    // Check cost limit before each request
    if (totalCost >= maxCostUsd) {
      session.trackCustom("cost_limit_reached", {
        totalCost,
        maxCostUsd,
        processedItems: results.length,
        remainingItems: items.length - results.length,
      });
      break;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: item.input }],
    });

    // Calculate cost (gpt-4o-mini: $0.15/1M input, $0.60/1M output)
    const inputCost = ((response.usage?.prompt_tokens || 0) * 0.15) / 1_000_000;
    const outputCost =
      ((response.usage?.completion_tokens || 0) * 0.6) / 1_000_000;
    totalCost += inputCost + outputCost;

    results.push({
      id: item.id,
      output: response.choices[0].message.content || "",
      success: true,
    });
  }

  session.trackCustom("batch_complete", {
    totalCost,
    itemsProcessed: results.length,
    costPerItem: totalCost / results.length,
  });

  session.end();
  return results;
}
```

## Sampling for Large Batches

For very high volume, sample tracking:

```typescript
const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
  sampleRate: 0.1, // Track 10% of events
});
```

## Best Practices

1. **Use appropriate flush intervals** - Don't overwhelm the API
2. **Implement checkpointing** - Resume from failures
3. **Track progress** - Know where you are in large batches
4. **Set cost limits** - Prevent runaway spending
5. **Use concurrency wisely** - Balance speed vs rate limits
6. **Sample at high volume** - Don't track every event if unnecessary

## Related

- [Cost Guardrails](/docs/guides/cost-guardrails) - Automatic cost limits
- [Benchmarks](/docs/benchmarks) - SDK overhead at scale
