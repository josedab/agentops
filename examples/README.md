# AgentOps Examples

Usage examples for the AgentOps SDK.

## Prerequisites

From the repository root, install dependencies and build the SDK:

```bash
pnpm install
pnpm build
```

Set your API key (or use the default test key included in examples):

```bash
export AGENTOPS_API_KEY=ao_your_key_here
```

## Running Examples

```bash
# Basic session tracking
npx tsx examples/basic-usage.ts

# OpenAI integration (requires OPENAI_API_KEY)
OPENAI_API_KEY=sk-... npx tsx examples/openai-integration.ts

# Multi-step agent with tool calling
npx tsx examples/agent-with-tools.ts

# Python code reviewer example
cd packages/sdk-python
pip install -e ".[dev]"
python ../../examples/code-reviewer.py
```

## What Each Example Demonstrates

| Example                 | Features                                               |
| ----------------------- | ------------------------------------------------------ |
| `basic-usage.ts`        | Manual session tracking, events, cost attribution      |
| `openai-integration.ts` | Automatic OpenAI instrumentation via `agentops.wrap()` |
| `agent-with-tools.ts`   | Tool calling, multi-step agents, error handling        |
| `code-reviewer.py`      | Python SDK usage with async patterns                   |
