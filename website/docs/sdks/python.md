# Python SDK

The Python SDK (`agentops`) provides first-class support for Python AI applications with async-first design.

## Installation

```bash
pip install agentops
# or
poetry add agentops
```

## Quick Start

```python
import agentops
from openai import OpenAI

# Initialize
agentops.init(api_key="ao_your_api_key")

# Wrap client for auto-instrumentation
client = agentops.wrap(OpenAI())

# Use normally - all calls tracked
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)

# Shutdown
await agentops.shutdown()
```

## Configuration

```python
import agentops

agentops.init(
    api_key="ao_yourkey...",
    endpoint="https://ingest.agentops.dev",  # Optional
    flush_interval=1.0,    # Seconds between flushes
    max_batch_size=100,    # Events per batch
    max_retries=3,         # Retry attempts
    disabled=False,        # Disable tracking
    debug=False,           # Debug logging
    default_tags=["prod"], # Tags for all events
)
```

## Session Management

### Auto Sessions

```python
client = agentops.wrap(OpenAI())

# Each call creates/uses a session automatically
response = client.chat.completions.create(...)
```

### Manual Sessions

```python
session = agentops.start_session(
    user_id="user_123",
    feature_id="chatbot",
    tags=["production"],
    metadata={"version": "1.0"},
)

session.track_prompt("Hello!", role="user", model="gpt-4o")
session.track_response(
    "Hi there!",
    model="gpt-4o",
    duration_ms=500,
    tokens={"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8}
)

session.end(status="completed")
```

### Context Manager

```python
with agentops.session(user_id="user_123") as session:
    session.track_prompt("Hello!")
    # ... do work ...
    # Session ends automatically
```

## Async Support

The SDK is async-first:

```python
import asyncio
import agentops
from openai import AsyncOpenAI

async def main():
    agentops.init(api_key="...")
    client = agentops.wrap(AsyncOpenAI())

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello!"}]
    )

    await agentops.shutdown()

asyncio.run(main())
```

## Supported Clients

### OpenAI

```python
from openai import OpenAI
client = agentops.wrap(OpenAI())
```

### Anthropic

```python
from anthropic import Anthropic
client = agentops.wrap(Anthropic())
```

### LangChain

```python
from langchain_openai import ChatOpenAI

# LangChain integration via callbacks
llm = ChatOpenAI(callbacks=[agentops.langchain_callback()])
```

## Event Tracking

```python
session = agentops.start_session()

# Prompts
session.track_prompt("User input", role="user", model="gpt-4o")

# Responses
session.track_response(
    "AI output",
    model="gpt-4o",
    duration_ms=500,
    tokens={"prompt_tokens": 10, "completion_tokens": 20}
)

# Tool calls
tool_id = session.track_tool_call("web_search", {"query": "news"})
session.track_tool_result(
    "web_search",
    {"results": [...]},
    status="success",
    duration_ms=1200,
    parent_event_id=tool_id
)

# Errors
try:
    await risky_operation()
except Exception as e:
    session.track_error(e)

# Custom events
session.track_custom("user_feedback", {"rating": 5})
```

## Environment Variables

```bash
export AGENTOPS_API_KEY=ao_your_api_key
export AGENTOPS_ENDPOINT=https://ingest.agentops.dev
export AGENTOPS_DISABLED=false
export AGENTOPS_DEBUG=false
```

## Related

- [Getting Started](/docs/getting-started) - Quick setup guide
- [OpenAI Integration](/docs/guides/openai-integration) - Detailed OpenAI setup
