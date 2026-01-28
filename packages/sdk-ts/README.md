# @agentops/sdk

> AI-native observability SDK for agent applications

## Installation

```bash
npm install @agentops/sdk
```

## Quick Start

```typescript
import { AgentOps } from '@agentops/sdk';

const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});

// Wrap any LLM client for automatic instrumentation
const client = agentops.wrap(yourLLMClient);

// Or use manual tracking
const session = agentops.startSession({ userId: 'user123' });
session.trackPrompt('Hello!');
session.trackResponse('Hi there!', { model: 'gpt-5', durationMs: 500 });
session.end();
```

See the [main README](../../README.md) for full documentation.

## API Reference

### `AgentOps`

Main client class for instrumentation.

#### Constructor

```typescript
new AgentOps(config: AgentOpsConfig)
```

#### Methods

- `wrap<T>(client: T, metadata?: SessionMetadata): T` - Wrap an LLM client for automatic tracking
- `startSession(metadata?: SessionMetadata): TrackedSession` - Start a manual session
- `trackEvent(event)` - Track a custom event
- `flush(): Promise<FlushResult>` - Manually flush buffered events
- `shutdown(): Promise<void>` - Graceful shutdown

### `TrackedSession`

Session for manual event tracking.

#### Properties

- `sessionId: string` - Unique session identifier
- `stats: SessionStats` - Current session statistics

#### Methods

- `trackPrompt(content, options?)` - Track a prompt
- `trackResponse(content, options)` - Track a response
- `trackToolCall(toolName, toolInput, options?)` - Track a tool call
- `trackToolResult(toolName, toolOutput, options)` - Track a tool result
- `trackError(error, options?)` - Track an error
- `trackCustom(name, data?, options?)` - Track a custom event
- `end(options?)` - End the session

## License

MIT
