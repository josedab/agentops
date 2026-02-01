# Python SDK Reference

> `agentops` - AI observability for Python applications

## Installation

```bash
pip install agentops
```

**Optional dependencies:**

```bash
pip install agentops[openai]      # OpenAI support
pip install agentops[anthropic]   # Anthropic support
pip install agentops[langchain]   # LangChain support
```

## Quick Start

```python
import agentops
from openai import OpenAI

# Initialize
agentops.init(api_key="ao_...")

# Wrap LLM client for auto-tracking
client = agentops.wrap(OpenAI())

# Use normally - everything is tracked
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)

# Shutdown
await agentops.shutdown()
```

---

## Core API

### Initialization

#### `agentops.init()`

Initialize the global AgentOps client.

```python
agentops.init(
    api_key: str = None,           # Required (or AGENTOPS_API_KEY env var)
    endpoint: str = "https://ingest.agentops.dev",
    flush_interval: float = 1.0,   # Seconds between auto-flushes
    max_batch_size: int = 100,     # Events per batch
    disabled: bool = False,        # Disable tracking
    debug: bool = False,           # Debug logging
)
```

**Environment Variables:**

```bash
AGENTOPS_API_KEY=ao_...
AGENTOPS_ENDPOINT=https://ingest.agentops.dev
AGENTOPS_FLUSH_INTERVAL=1.0
AGENTOPS_MAX_BATCH_SIZE=100
AGENTOPS_DISABLED=false
AGENTOPS_DEBUG=false
```

#### `agentops.get_client()`

Get the global client instance.

```python
client = agentops.get_client()
```

---

### AgentOps Class

For direct instantiation (non-global):

```python
from agentops import AgentOps

client = AgentOps(
    api_key="ao_...",
    debug=True,
)
```

#### Methods

##### `wrap(client, **metadata)`

Wrap an LLM client for automatic instrumentation.

```python
from openai import OpenAI

openai_client = client.wrap(OpenAI(), user_id="user_123")
```

**Supported Clients:**

- `openai.OpenAI`
- `anthropic.Anthropic`
- LangChain (via callbacks)

##### `start_session(**metadata)`

Create a new tracked session.

```python
session = client.start_session(
    user_id="user_123",
    feature_id="chat",
    tags=["production"],
    metadata={"version": "1.0"},
)
```

##### `track(event)`

Track a custom event.

```python
from agentops import Event, EventType

client.track(Event(
    event_type=EventType.CUSTOM,
    content="User clicked button",
    metadata={"button_id": "submit"},
))

# Or with dict
client.track({
    "event_type": "custom",
    "content": "User feedback",
    "metadata": {"rating": 5},
})
```

##### `flush()`

Manually flush buffered events (async).

```python
await client.flush()
```

##### `shutdown()`

Gracefully shut down (async).

```python
await client.shutdown()
```

---

### Session

Represents a tracked agent session.

```python
session = agentops.start_session(user_id="user_123")
```

#### Properties

| Property       | Type          | Description                          |
| -------------- | ------------- | ------------------------------------ |
| `session_id`   | `str`         | Unique identifier                    |
| `user_id`      | `str \| None` | User identifier                      |
| `feature_id`   | `str \| None` | Feature identifier                   |
| `status`       | `str`         | `"active"`, `"completed"`, `"error"` |
| `event_count`  | `int`         | Total events tracked                 |
| `total_tokens` | `int`         | Token count                          |
| `total_cost`   | `float`       | Cost in USD                          |
| `models_used`  | `set[str]`    | Models used                          |
| `tools_used`   | `set[str]`    | Tools invoked                        |

#### Context Manager

```python
with agentops.start_session(user_id="user_123") as session:
    # Track events
    session.track(prompt_event)
    session.track(response_event)
# Session automatically ended on exit
```

#### Methods

##### `track(event)`

Track an event within the session.

```python
from agentops import PromptEvent, ResponseEvent

session.track(PromptEvent(
    messages=[{"role": "user", "content": "Hello"}],
    model="gpt-4",
))

session.track(ResponseEvent(
    content="Hi there!",
    model="gpt-4",
    tokens=TokenUsage(prompt_tokens=5, completion_tokens=3, total_tokens=8),
    duration_ms=234,
))
```

##### `end(status, error_message=None)`

End the session.

```python
session.end("completed")
# or
session.end("error", error_message="Rate limit exceeded")
```

---

## Event Types

### Base Event

```python
from agentops import Event, EventType

class Event(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    session_id: str | None = None
    parent_event_id: str | None = None
    event_type: EventType
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    content: str | None = None
    metadata: dict | None = None
    tags: list[str] | None = None
    tokens: TokenUsage | None = None
    cost: float | None = None
    duration_ms: int | None = None
    model: str | None = None
    tool_name: str | None = None
    tool_status: str | None = None  # "success" | "error"
```

### EventType Enum

```python
class EventType(str, Enum):
    SESSION_START = "session_start"
    SESSION_END = "session_end"
    PROMPT = "prompt"
    RESPONSE = "response"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    ERROR = "error"
    CUSTOM = "custom"
```

### Specialized Events

```python
from agentops import (
    SessionStartEvent,
    SessionEndEvent,
    PromptEvent,
    ResponseEvent,
    ToolCallEvent,
    ToolResultEvent,
    ErrorEvent,
)

# Prompt
PromptEvent(
    messages=[{"role": "user", "content": "..."}],
    model="gpt-4",
)

# Response
ResponseEvent(
    content="...",
    choices=[{"message": {"content": "..."}}],
    model="gpt-4",
    tokens=TokenUsage(prompt_tokens=10, completion_tokens=20, total_tokens=30),
    duration_ms=500,
    cost=0.001,
)

# Tool Call
ToolCallEvent(
    tool_name="web_search",
    tool_input={"query": "latest news"},
)

# Tool Result
ToolResultEvent(
    tool_name="web_search",
    tool_output={"results": [...]},
    tool_status="success",
    duration_ms=1200,
)

# Error
ErrorEvent(
    error_type="RateLimitError",
    error_message="Rate limit exceeded",
    error_stack="Traceback...",
)
```

### TokenUsage

```python
from agentops import TokenUsage

tokens = TokenUsage(
    prompt_tokens=100,
    completion_tokens=50,
    total_tokens=150,
)
```

---

## Auto-Instrumentation

### OpenAI

```python
from openai import OpenAI
import agentops

agentops.init()
client = agentops.wrap(OpenAI())

# Automatically tracked
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}],
)
```

**Tracked automatically:**

- PromptEvent (messages, model)
- ResponseEvent (content, tokens, cost, duration)
- ToolCallEvent (for function calls)
- ErrorEvent (on exceptions)

### Anthropic

```python
from anthropic import Anthropic
import agentops

agentops.init()
client = agentops.wrap(Anthropic())

response = client.messages.create(
    model="claude-3-opus-20240229",
    messages=[{"role": "user", "content": "Hello"}],
)
```

### LangChain

```python
from langchain_openai import ChatOpenAI
from agentops.integrations.langchain import AgentOpsCallbackHandler

agentops.init()

llm = ChatOpenAI(
    callbacks=[AgentOpsCallbackHandler()],
)
```

---

## Feature Modules

### Quality Evaluation

```python
from agentops import QualityEvaluator, QualityRubric

evaluator = QualityEvaluator()

# Define rubric
rubric = QualityRubric(
    name="helpfulness",
    criteria=["relevance", "completeness", "accuracy"],
    scoring="1-5",
)

# Evaluate response
score = evaluator.evaluate(
    prompt="What is Python?",
    response="Python is a programming language...",
    rubric=rubric,
)
```

### Anomaly Detection

```python
from agentops import AnomalyDetector

detector = AnomalyDetector()

# Detect anomalies in metrics
anomalies = detector.detect(
    metric_snapshots=snapshots,
    sensitivity=0.8,
)

for anomaly in anomalies:
    print(f"{anomaly.metric}: {anomaly.severity}")
```

### Prompt Management

```python
from agentops import PromptRegistry, PromptTemplate

registry = PromptRegistry()

# Register template
template = PromptTemplate(
    name="greeting",
    version="1.0",
    template="Hello, {{name}}! How can I help you today?",
)
registry.register(template)

# Use template
prompt = registry.render("greeting", name="Alice")
```

---

## Configuration

### Config Class

```python
from agentops import Config

config = Config(
    api_key="ao_...",
    endpoint="https://ingest.agentops.dev",
    flush_interval=1.0,
    max_batch_size=100,
    disabled=False,
    debug=False,
)
```

### Async Support

The SDK is async-first but provides sync wrappers:

```python
# Async usage (recommended)
async def main():
    agentops.init()
    # ... your code ...
    await agentops.shutdown()

# Sync wrapper
import asyncio
asyncio.run(agentops.shutdown())
```

---

## Error Handling

```python
from agentops.exceptions import (
    AgentOpsError,
    ConfigurationError,
    AuthenticationError,
    RateLimitError,
)

try:
    agentops.init(api_key="invalid")
except ConfigurationError as e:
    print(f"Config error: {e}")
except AuthenticationError as e:
    print(f"Auth error: {e}")
```

---

## Best Practices

1. **Initialize early** - Call `agentops.init()` at application startup
2. **Use context managers** - Sessions auto-close on exit
3. **Wrap LLM clients** - Auto-instrumentation reduces boilerplate
4. **Shutdown gracefully** - Always call `await agentops.shutdown()`
5. **Use environment variables** - Keep API keys out of code

```python
import agentops
import atexit
import asyncio

# Initialize at startup
agentops.init()

# Register shutdown handler
atexit.register(lambda: asyncio.run(agentops.shutdown()))
```

---

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md) - System design, data flow, infrastructure
- [TypeScript SDK](./sdk-typescript.md) - TypeScript SDK reference (primary SDK, most features)
- [Go SDK](./sdk-go.md) - Go SDK reference
- [REST API](./api-reference.md) - Backend API reference
- [ADR-003: Event Buffering](./adr/003-event-buffering-strategy.md) - How SDK buffering works
- [ADR-004: Multi-SDK Architecture](./adr/004-multi-sdk-architecture.md) - Why we have multiple SDKs
