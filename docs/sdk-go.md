# Go SDK Reference

> `github.com/josedab/agentops-go` - AI observability for Go applications

## Installation

```bash
go get github.com/josedab/agentops-go
```

## Quick Start

```go
package main

import (
    "github.com/josedab/agentops-go"
)

func main() {
    // Initialize
    agentops.Init(&agentops.Config{
        APIKey: "ao_...",
    })
    defer agentops.Shutdown()

    // Create session
    session := agentops.StartSession(agentops.SessionOptions{
        UserID:    "user_123",
        FeatureID: "chat",
    })

    // Track events
    session.TrackPrompt("Hello!", agentops.WithModel("gpt-4o"))
    // ... get response ...
    session.TrackResponse("Hi there!",
        agentops.WithModel("gpt-4o"),
        agentops.WithDuration(234),
    )

    session.End("completed")
}
```

---

## Core API

### Initialization

#### `Init(config *Config) error`

Initialize the global AgentOps client.

```go
err := agentops.Init(&agentops.Config{
    APIKey:        "ao_...",           // Required (or AGENTOPS_API_KEY)
    Endpoint:      "https://ingest.agentops.dev",
    FlushInterval: time.Second,        // Default: 1s
    MaxBatchSize:  100,                // Default: 100
    Disabled:      false,
    Debug:         false,
})
```

#### `DefaultConfig() *Config`

Load configuration from environment variables.

```go
config := agentops.DefaultConfig()
// Reads: AGENTOPS_API_KEY, AGENTOPS_ENDPOINT, AGENTOPS_DISABLED, AGENTOPS_DEBUG
```

#### `Shutdown()`

Gracefully shutdown (flushes pending events).

```go
defer agentops.Shutdown()
```

---

### Client

For non-global client instances:

```go
client, err := agentops.New(&agentops.Config{
    APIKey: "ao_...",
})
if err != nil {
    log.Fatal(err)
}
defer client.Shutdown()
```

#### Methods

##### `StartSession(opts SessionOptions) *Session`

Create a new tracked session.

```go
session := client.StartSession(agentops.SessionOptions{
    SessionID: "custom-id",    // Optional, auto-generated if empty
    UserID:    "user_123",
    FeatureID: "chat-agent",
    Tags:      []string{"production"},
    Metadata:  map[string]interface{}{"version": "1.0"},
})
```

##### `Track(event Event)`

Track an event with the client.

```go
client.Track(agentops.Event{
    SessionID: "sess_123",
    EventType: agentops.EventTypeCustom,
    Content:   "User action",
    Metadata:  map[string]interface{}{"action": "click"},
})
```

##### `Flush() error`

Manually flush buffered events.

```go
if err := client.Flush(); err != nil {
    log.Printf("Flush error: %v", err)
}
```

---

### Session

Represents a tracked agent session.

```go
session := agentops.StartSession(agentops.SessionOptions{
    UserID: "user_123",
})
```

#### Properties

```go
session.SessionID  // string - Unique identifier
session.UserID     // string - User identifier
session.FeatureID  // string - Feature identifier
session.Stats      // SessionStats - Aggregated metrics
```

#### SessionStats

```go
type SessionStats struct {
    EventCount       int
    PromptTokens     int
    CompletionTokens int
    TotalTokens      int
    TotalCost        float64
    DurationMs       int64
    ModelsUsed       []string
    ToolsUsed        []string
}
```

#### Methods

##### `TrackPrompt(content string, opts ...EventOption) string`

Track an input prompt.

```go
eventID := session.TrackPrompt("What is Go?",
    agentops.WithModel("gpt-4o"),
    agentops.WithMetadata(map[string]interface{}{"role": "user"}),
)
```

##### `TrackResponse(content string, opts ...EventOption) string`

Track a model response.

```go
session.TrackResponse("Go is a programming language...",
    agentops.WithModel("gpt-4o"),
    agentops.WithDuration(523),
    agentops.WithTokens(agentops.TokenUsage{
        PromptTokens:     15,
        CompletionTokens: 42,
        TotalTokens:      57,
    }),
    agentops.WithCost(0.002),
)
```

##### `TrackToolCall(name string, input interface{}, opts ...EventOption) string`

Track a tool invocation.

```go
toolEventID := session.TrackToolCall("web_search",
    map[string]string{"query": "latest news"},
)
```

##### `TrackToolResult(name string, output interface{}, opts ...EventOption) string`

Track a tool result.

```go
session.TrackToolResult("web_search",
    map[string]interface{}{"results": results},
    agentops.WithDuration(1200),
    agentops.WithParentEventID(toolEventID),
)
```

##### `TrackError(err error, opts ...EventOption) string`

Track an error.

```go
session.TrackError(errors.New("rate limit exceeded"),
    agentops.WithDuration(100),
)
```

##### `TrackCustom(name string, data interface{}, opts ...EventOption) string`

Track a custom event.

```go
session.TrackCustom("user_feedback",
    map[string]interface{}{"rating": 5},
)
```

##### `End(status string)`

End the session.

```go
session.End("completed")
// or
session.End("error")
```

---

## Event Options

Functional options pattern for event configuration:

```go
// Model
agentops.WithModel("gpt-4o")

// Duration
agentops.WithDuration(523)  // milliseconds

// Token usage
agentops.WithTokens(agentops.TokenUsage{
    PromptTokens:     100,
    CompletionTokens: 50,
    TotalTokens:      150,
})

// Cost
agentops.WithCost(0.005)  // USD

// Parent event (for nesting)
agentops.WithParentEventID("evt_abc123")

// Custom metadata
agentops.WithMetadata(map[string]interface{}{
    "key": "value",
})

// Tags
agentops.WithTags([]string{"important", "v2"})
```

---

## Event Types

```go
type EventType string

const (
    EventTypeSessionStart EventType = "session_start"
    EventTypeSessionEnd   EventType = "session_end"
    EventTypePrompt       EventType = "prompt"
    EventTypeResponse     EventType = "response"
    EventTypeToolCall     EventType = "tool_call"
    EventTypeToolResult   EventType = "tool_result"
    EventTypeError        EventType = "error"
    EventTypeCustom       EventType = "custom"
)
```

### Event Struct

```go
type Event struct {
    EventID       string                 `json:"event_id"`
    SessionID     string                 `json:"session_id"`
    ParentEventID string                 `json:"parent_event_id,omitempty"`
    EventType     EventType              `json:"event_type"`
    Timestamp     time.Time              `json:"timestamp"`
    Content       string                 `json:"content,omitempty"`
    Model         string                 `json:"model,omitempty"`
    Tokens        *TokenUsage            `json:"tokens,omitempty"`
    Cost          float64                `json:"cost,omitempty"`
    DurationMs    int64                  `json:"duration_ms,omitempty"`
    ToolName      string                 `json:"tool_name,omitempty"`
    ToolStatus    string                 `json:"tool_status,omitempty"`
    Metadata      map[string]interface{} `json:"metadata,omitempty"`
    Tags          []string               `json:"tags,omitempty"`
}
```

### TokenUsage

```go
type TokenUsage struct {
    PromptTokens     int `json:"prompt_tokens"`
    CompletionTokens int `json:"completion_tokens"`
    TotalTokens      int `json:"total_tokens"`
}
```

---

## OpenAI Wrapper

Automatic instrumentation for OpenAI Go client.

```go
import (
    "github.com/josedab/agentops-go"
    "github.com/sashabaranov/go-openai"
)

func main() {
    agentops.Init(&agentops.Config{APIKey: "ao_..."})
    defer agentops.Shutdown()

    // Create session
    session := agentops.StartSession(agentops.SessionOptions{
        UserID: "user_123",
    })

    // Wrap OpenAI client
    openaiClient := openai.NewClient("sk-...")
    wrapped := agentops.WrapOpenAI(openaiClient, session)

    // Use wrapped client - automatically tracked
    resp, err := wrapped.CreateChatCompletion(
        context.Background(),
        openai.ChatCompletionRequest{
            Model: openai.GPT4o,
            Messages: []openai.ChatCompletionMessage{
                {Role: "user", Content: "Hello!"},
            },
        },
    )
    // Prompt, response, tokens, cost all tracked automatically
}
```

**Supported Models with Pricing:**

- GPT-4o, GPT-4o-mini
- GPT-4-turbo, GPT-4
- GPT-3.5-turbo
- O1, O1-mini, O1-preview
- Claude-3.5-sonnet (via API)

---

## Feature Modules

### Test Runner

Execute regression test suites.

```go
import "github.com/josedab/agentops-go/regression"

runner := regression.NewTestRunner(llmClient)

suite := regression.TestSuite{
    Name: "Chat Quality Tests",
    Cases: []regression.TestCase{
        {
            Name:   "Greeting",
            Input:  "Hello",
            Assertions: []regression.Assertion{
                {Type: "contains", Value: "Hi"},
                {Type: "regex", Value: `(?i)hello|hi|hey`},
            },
        },
    },
}

results := runner.Run(suite)
for _, result := range results {
    fmt.Printf("%s: %v\n", result.Name, result.Passed)
}
```

**Assertion Types:**

- `equals` - Exact match
- `contains` - Substring match
- `regex` - Regular expression
- `not_contains` - Negative substring
- `length_min`, `length_max` - Length constraints
- `similarity` - Semantic similarity (0-1)

### Streaming Client

Real-time event streaming via WebSocket.

```go
import "github.com/josedab/agentops-go/streaming"

client := streaming.NewClient(&streaming.Config{
    Endpoint: "wss://stream.agentops.dev",
    APIKey:   "ao_...",
})

// Subscribe to events
sub := client.Subscribe(streaming.Filter{
    SessionID: "sess_123",
    EventTypes: []string{"response", "error"},
})

// Handle events
for event := range sub.Events() {
    fmt.Printf("Event: %s\n", event.EventType)
}
```

### Natural Language Alerts

Parse natural language to alert rules.

```go
import "github.com/josedab/agentops-go/alerts"

parser := alerts.NewNLAlertParser()

// Parse natural language
rule, err := parser.Parse("Alert when cost exceeds $100 per hour")
// rule.Metric = "cost"
// rule.Threshold = 100.0
// rule.Window = time.Hour

// Create rule engine
engine := alerts.NewRuleEngine()
engine.AddRule(rule)

// Evaluate
triggered := engine.Evaluate(currentMetrics)
```

---

## Configuration

### Environment Variables

```bash
AGENTOPS_API_KEY=ao_...           # Required
AGENTOPS_ENDPOINT=https://ingest.agentops.dev
AGENTOPS_DISABLED=false
AGENTOPS_DEBUG=false
```

### Config Struct

```go
type Config struct {
    APIKey        string        // API key (required)
    Endpoint      string        // Ingestion endpoint
    FlushInterval time.Duration // Time between flushes
    MaxBatchSize  int           // Max events per batch
    Disabled      bool          // Disable tracking
    Debug         bool          // Debug logging
}
```

---

## Error Handling

```go
// Init errors
err := agentops.Init(config)
if err != nil {
    if errors.Is(err, agentops.ErrMissingAPIKey) {
        log.Fatal("API key required")
    }
    log.Fatal(err)
}

// Flush errors
if err := agentops.Flush(); err != nil {
    log.Printf("Flush failed: %v", err)
}
```

---

## Concurrency

The SDK is thread-safe:

```go
// Safe to use from multiple goroutines
var wg sync.WaitGroup

for i := 0; i < 10; i++ {
    wg.Add(1)
    go func(id int) {
        defer wg.Done()
        session := agentops.StartSession(agentops.SessionOptions{
            UserID: fmt.Sprintf("user_%d", id),
        })
        session.TrackPrompt("Hello")
        session.End("completed")
    }(i)
}

wg.Wait()
agentops.Shutdown()
```

---

## Best Practices

1. **Use `defer Shutdown()`** - Ensures events are flushed
2. **Set reasonable flush intervals** - Balance latency vs. batching
3. **Use functional options** - Clean, readable event tracking
4. **Handle errors** - Check Init and Flush errors
5. **Use environment variables** - Keep API keys secure

```go
func main() {
    // Load from env
    config := agentops.DefaultConfig()
    if err := agentops.Init(config); err != nil {
        log.Fatal(err)
    }
    defer agentops.Shutdown()

    // Your application code
}
```

---

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md) - System design, data flow, infrastructure
- [TypeScript SDK](./sdk-typescript.md) - TypeScript SDK reference (primary SDK, most features)
- [Python SDK](./sdk-python.md) - Python SDK reference
- [REST API](./api-reference.md) - Backend API reference
- [ADR-003: Event Buffering](./adr/003-event-buffering-strategy.md) - How SDK buffering works
- [ADR-004: Multi-SDK Architecture](./adr/004-multi-sdk-architecture.md) - Why we have multiple SDKs
