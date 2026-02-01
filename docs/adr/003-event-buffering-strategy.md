# ADR-003: Event Buffering Strategy

## Status

Accepted

## Context

The SDK needs to send events to the AgentOps backend efficiently. Challenges:

1. **High event volume** - Agent sessions can generate hundreds of events per second
2. **Network efficiency** - HTTP overhead makes per-event requests expensive
3. **Reliability** - Events shouldn't be lost on transient failures
4. **Low latency** - Events should appear in dashboards quickly
5. **Graceful shutdown** - Buffered events must be flushed on process exit

Alternatives considered:

1. **Immediate send** - Send each event immediately
   - Pro: Simplest implementation
   - Con: High network overhead, poor performance

2. **Fixed batching** - Collect N events, then send
   - Pro: Predictable batch sizes
   - Con: High latency for low-volume sessions

3. **Time-based batching** - Send every N milliseconds
   - Pro: Bounded latency
   - Con: Many small batches during bursts

4. **WebSocket streaming** - Maintain persistent connection
   - Pro: Low latency, bidirectional
   - Con: Connection management complexity, firewall issues

## Decision

We implement **hybrid buffering** combining time-based and size-based triggers:

```typescript
class EventBuffer {
  private buffer: Event[] = [];
  private flushTimer: Timer;

  constructor(config: {
    maxSize: number; // Flush when buffer reaches this size
    flushInterval: number; // Flush every N milliseconds regardless
  }) {
    this.startFlushTimer();
  }

  add(event: Event): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.config.maxSize) {
      this.flush(); // Size trigger
    }
  }

  // Timer trigger runs independently
}
```

Default configuration:

- `flushInterval`: 1000ms (1 second)
- `maxBatchSize`: 100 events

Additional features:

- **Exponential backoff** on failed sends
- **Automatic retry** for transient failures
- **Graceful shutdown** hooks for process exit
- **`unref()` timer** to not block process exit

## Consequences

### Positive

- **Bounded latency** - Events delivered within 1 second max
- **Network efficiency** - Batching reduces HTTP overhead by 10-100x
- **Burst handling** - Size trigger prevents memory buildup during high volume
- **Configurable** - Users can tune for their use case
- **Reliable** - Retry logic handles transient failures

### Negative

- **Complexity** - More moving parts than immediate send
- **Potential data loss** - Events in buffer lost on hard crash
- **Memory usage** - Buffer consumes memory during bursts
- **Timing edge cases** - Shutdown must wait for pending flush

### Mitigation

- **Hard crash protection**: Consider optional disk persistence (future work)
- **Memory limits**: `maxBatchSize` caps buffer growth
- **Shutdown handling**: Flush on SIGTERM/SIGINT, beforeExit
- **Monitoring**: Expose buffer size in SDK stats

## Configuration Examples

```typescript
// Low-latency dashboard (more network traffic)
new AgentOps({ flushInterval: 100, maxBatchSize: 10 });

// High-throughput batch jobs (fewer requests)
new AgentOps({ flushInterval: 5000, maxBatchSize: 500 });

// Default (balanced)
new AgentOps({ flushInterval: 1000, maxBatchSize: 100 });
```
