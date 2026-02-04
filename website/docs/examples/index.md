# Examples

Real-world examples to help you get started quickly.

## Quick Start Examples

- [Basic Usage](/docs/examples/basic-usage) - Manual session tracking
- [OpenAI Integration](/docs/examples/openai-integration) - Auto-instrumentation with OpenAI
- [Agent with Tools](/docs/examples/agent-with-tools) - Multi-step agent with function calling

## Running Examples

All examples are in the `examples/` directory. To run them:

```bash
# Clone the repo
git clone https://github.com/josedab/agentops.git
cd agentops

# Install dependencies
pnpm install

# Run an example
npx tsx examples/basic-usage.ts

# With OpenAI (requires API key)
OPENAI_API_KEY=sk-... npx tsx examples/openai-integration.ts
```

## Example Index

| Example            | Description                            | Features Demonstrated                    |
| ------------------ | -------------------------------------- | ---------------------------------------- |
| Basic Usage        | Manual session and event tracking      | Sessions, prompts, responses, tool calls |
| OpenAI Integration | Auto-instrumentation with OpenAI       | `wrap()`, automatic tracking             |
| Agent with Tools   | Multi-turn agent with function calling | Tool execution, agent loop               |
