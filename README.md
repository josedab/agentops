# AgentOps

> AI-native observability platform for AI agent applications

[![npm version](https://badge.fury.io/js/@agentops%2Fsdk.svg)](https://www.npmjs.com/package/@agentops/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AgentOps provides comprehensive monitoring, debugging, and optimization capabilities specifically designed for AI-powered systems—tracking prompt quality, model costs, tool execution, decision paths, and outcome metrics in a unified dashboard.

## Features

- 🔍 **Session Tracing** - Visualize complete agent decision trees
- 💰 **Cost Attribution** - Track costs by feature, user, and model
- 🔧 **Tool Tracking** - Monitor MCP tool execution
- 📊 **Real-time Dashboards** - Live metrics and alerts
- 🚀 **Low Overhead** - <1% performance impact
- 🔌 **Framework Agnostic** - Works with Copilot SDK, OpenAI, Anthropic, and more

## Quick Start

### Installation

```bash
npm install @agentops/sdk
# or
pnpm add @agentops/sdk
# or
yarn add @agentops/sdk
```

### Basic Usage

```typescript
import { AgentOps } from '@agentops/sdk';

// Initialize
const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});

// Option 1: Wrap your LLM client for automatic instrumentation
const client = agentops.wrap(yourLLMClient);

// Option 2: Manual tracking
const session = agentops.startSession({
  userId: 'user123',
  featureId: 'chat-agent',
  tags: ['production'],
});

session.trackPrompt('What is the capital of France?');
session.trackResponse('The capital of France is Paris.', {
  model: 'gpt-5',
  durationMs: 500,
  tokens: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
});

session.end();

// Graceful shutdown
await agentops.shutdown();
```

### With GitHub Copilot SDK

```typescript
import { CopilotClient } from '@github/copilot-sdk';
import { AgentOps } from '@agentops/sdk';

const agentops = new AgentOps({ apiKey: process.env.AGENTOPS_API_KEY! });

// Wrap the Copilot client - all sessions are automatically tracked
const client = agentops.wrap(new CopilotClient());

// Use normally - everything is tracked automatically
const session = await client.createSession({ model: 'gpt-5' });
const response = await session.sendAndWait('Hello!');
```

### With OpenAI

```typescript
import OpenAI from 'openai';
import { AgentOps } from '@agentops/sdk';

const agentops = new AgentOps({ apiKey: process.env.AGENTOPS_API_KEY! });
const openai = agentops.wrap(new OpenAI());

// Automatic tracking of all completions
const completion = await openai.chat.completions.create({
  model: 'gpt-5',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Singleton API

```typescript
import { init, wrap, startSession, shutdown } from '@agentops/sdk';

// Initialize once at startup
init({ apiKey: process.env.AGENTOPS_API_KEY! });

// Use convenience functions anywhere
const client = wrap(yourLLMClient);
const session = startSession({ userId: 'user123' });

// Shutdown on exit
await shutdown();
```

## Configuration

```typescript
const agentops = new AgentOps({
  // Required
  apiKey: 'ao_yourkey...',
  
  // Optional
  endpoint: 'https://ingest.agentops.dev', // Custom endpoint
  flushInterval: 1000,                      // Ms between flushes
  maxBatchSize: 100,                        // Events per batch
  maxRetries: 3,                            // Retry attempts
  disabled: false,                          // Disable tracking
  debug: false,                             // Debug logging
  defaultTags: ['production'],              // Tags for all events
  defaultMetadata: { version: '1.0.0' },    // Metadata for all events
});
```

## Session API

```typescript
const session = agentops.startSession({
  userId: 'user123',
  featureId: 'chat-agent',
  tags: ['experiment-a'],
  metadata: { source: 'web' },
});

// Track prompts
session.trackPrompt('User message', {
  role: 'user',
  model: 'gpt-5',
});

// Track responses
session.trackResponse('AI response', {
  model: 'gpt-5',
  durationMs: 500,
  tokens: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  finishReason: 'stop',
});

// Track tool calls
const toolEventId = session.trackToolCall('web_search', { query: 'latest news' });
session.trackToolResult('web_search', { results: [...] }, {
  status: 'success',
  durationMs: 1200,
  parentEventId: toolEventId,
});

// Track errors
session.trackError(new Error('Something went wrong'));

// Track custom events
session.trackCustom('user_feedback', { rating: 5, comment: 'Great!' });

// End session
session.end({ status: 'completed' });

// Get session stats
console.log(session.stats);
// { eventCount: 5, promptTokens: 10, completionTokens: 20, ... }
```

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local infrastructure)

### Setup

```bash
# Clone the repository
git clone https://github.com/josedab/agentops.git
cd agentops

# Install dependencies
pnpm install

# Start infrastructure (ClickHouse, PostgreSQL, Redis, Redpanda)
cd infrastructure/docker
docker-compose up -d

# Start development
pnpm dev
```

### Project Structure

```
agentops/
├── packages/
│   ├── sdk-ts/          # TypeScript SDK
│   ├── sdk-python/      # Python SDK (coming soon)
│   └── shared/          # Shared types and utilities
├── apps/
│   ├── web/             # Dashboard (Next.js)
│   ├── api/             # API server
│   ├── ingest/          # Ingestion workers
│   └── docs/            # Documentation
└── infrastructure/
    ├── terraform/       # Cloud infrastructure
    └── docker/          # Local development
```

## Pricing

| Tier | Platform Fee | Events | Features |
|------|--------------|--------|----------|
| Free | $0 | 100K/mo | Basic tracing, 7-day retention |
| Pro | $49/mo | 500K | 30-day retention, alerts, API |
| Team | $199/mo | 2M | 90-day retention, SSO |
| Enterprise | Custom | Unlimited | Custom retention, SLAs |

## License

MIT © Jose David Baena

## Links

- [Documentation](https://docs.agentops.dev)
- [Dashboard](https://app.agentops.dev)
- [Discord Community](https://discord.gg/agentops)
- [GitHub](https://github.com/josedab/agentops)
