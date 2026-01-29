# AgentOps Python SDK

AI agent observability SDK for Python. Track LLM calls, costs, and performance with zero-config instrumentation.

## Installation

```bash
pip install agentops
```

## Quick Start

```python
import agentops
from openai import OpenAI

# Initialize AgentOps
agentops.init(api_key="your-api-key")

# Wrap your OpenAI client
client = agentops.wrap(OpenAI())

# All calls are automatically tracked
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

## Features

- **Zero-config instrumentation**: Wrap your LLM client and all calls are tracked
- **Cost tracking**: Automatic cost calculation for all major models
- **Session tracing**: Full visibility into agent decision trees
- **Tool call tracking**: Track MCP and function call executions
- **Quality metrics**: LLM-as-judge quality scoring

## Supported Providers

- OpenAI
- Anthropic
- LangChain
- LlamaIndex

## Documentation

Visit [docs.agentops.dev](https://docs.agentops.dev) for full documentation.
