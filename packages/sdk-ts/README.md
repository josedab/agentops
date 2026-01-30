# @agentops/sdk

> AI-native observability SDK for agent applications

## Installation

```bash
npm install @agentops/sdk
```

## Quick Start

```typescript
import { AgentOps } from "@agentops/sdk";

const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});

// Wrap any LLM client for automatic instrumentation
const client = agentops.wrap(yourLLMClient);

// Or use manual tracking
const session = agentops.startSession({ userId: "user123" });
session.trackPrompt("Hello!");
session.trackResponse("Hi there!", { model: "gpt-5", durationMs: 500 });
session.end();
```

See the [main README](../../README.md) for full documentation.

## Features

### Core Tracking

- Session and event tracking
- Automatic LLM client instrumentation
- Cost attribution and token tracking

### Streaming Trace Visualization

Real-time WebSocket-based trace rendering showing agent decisions as they happen:

```typescript
import { StreamingClient } from "@agentops/sdk";

const streaming = new StreamingClient({
  endpoint: "wss://api.agentops.io/streaming",
  apiKey: process.env.AGENTOPS_API_KEY!,
  autoReconnect: true,
});

// Set up handlers for real-time events
streaming.setHandlers({
  onEvent: (event) => console.log("Event:", event),
  onTokenChunk: (chunk) => process.stdout.write(chunk.chunk),
  onError: (error) => console.error("Error:", error),
});

// Connect and subscribe to a session
await streaming.connect();
const subscription = streaming.subscribe({ sessionId: "sess_123" });

// Clean up
streaming.unsubscribe(subscription.id);
await streaming.disconnect();
```

### Prompt Regression Testing

CI/CD-ready prompt regression testing framework:

```typescript
import { TestRunner, parseTestSuiteYaml } from "@agentops/sdk";

// Define tests in YAML
const yaml = `
version: "1.0"
name: "Agent Tests"
tests:
  - id: greeting_test
    name: "Agent responds to greetings"
    input:
      messages:
        - role: user
          content: "Hello!"
    assertions:
      - type: contains
        value: "hello"
      - type: latency
        value:
          maxMs: 5000
`;

// Parse and run tests
const suite = parseTestSuiteYaml(yaml);
const runner = new TestRunner({
  llmClient: yourLLMClient,
  config: { parallel: true, maxConcurrency: 5 },
});

const results = await runner.runSuite(suite);
console.log(`Passed: ${results.summary.passed}/${results.summary.total}`);

// Generate GitHub Actions workflow
import { generateWorkflow } from "@agentops/sdk";
const workflow = generateWorkflow({
  nodeVersion: "20",
  testPattern: "**/*.test.yaml",
});
```

### Natural Language Alert Configuration

Configure alerts using natural language:

```typescript
import { NLAlertParser, NLRuleEngine } from "@agentops/sdk";

const parser = new NLAlertParser();
const engine = new NLRuleEngine({ parser });

// Parse natural language alert rules
const result = await parser.parse(
  "Alert me when costs exceed $100 per day for production",
);

console.log(result.rule);
// { metric: { type: 'cost' }, condition: { operator: 'gt', value: 100 }, ... }

// Create and manage rules
const rule = await engine.createFromNL(
  "Warn me via Slack when latency exceeds 2 seconds",
  "org_123",
);

// Provide feedback to improve parsing
engine.recordFeedback(rule.rule.id, { helpful: true });
```

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

### `StreamingClient`

WebSocket client for real-time event streaming.

#### Constructor

```typescript
new StreamingClient(config: StreamingConfig)
```

#### Methods

- `connect(): Promise<void>` - Connect to the streaming server
- `disconnect(): Promise<void>` - Disconnect from the server
- `subscribe(options): Subscription` - Subscribe to events
- `unsubscribe(subscriptionId)` - Unsubscribe from events
- `setHandlers(handlers)` - Set event handlers

### `TestRunner`

Test execution engine for prompt regression tests.

#### Constructor

```typescript
new TestRunner(options: TestRunnerOptions)
```

#### Methods

- `runSuite(suite): Promise<TestRun>` - Run a test suite
- `runTestCase(testCase): Promise<TestResult>` - Run a single test case

### `NLAlertParser`

Natural language alert configuration parser.

#### Methods

- `parse(query): Promise<ParsedAlertRule>` - Parse a natural language query
- `parseWithLLM(query): Promise<ParsedAlertRule>` - Parse with LLM enhancement
- `validateRule(rule): ValidationResult` - Validate a parsed rule

## License

MIT
