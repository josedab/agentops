# Go SDK

The Go SDK provides high-performance observability for Go applications.

## Installation

```bash
go get github.com/josedab/agentops-go
```

## Quick Start

```go
package main

import (
    "github.com/josedab/agentops-go"
    "github.com/sashabaranov/go-openai"
)

func main() {
    // Initialize
    agentops.Init(&agentops.Config{
        APIKey: os.Getenv("AGENTOPS_API_KEY"),
    })
    defer agentops.Shutdown()

    // Create wrapped OpenAI client
    client := agentops.WrapOpenAI(openai.NewClient(os.Getenv("OPENAI_API_KEY")))

    // Use normally - all calls tracked
    resp, err := client.CreateChatCompletion(
        context.Background(),
        openai.ChatCompletionRequest{
            Model: openai.GPT4o,
            Messages: []openai.ChatCompletionMessage{
                {Role: openai.ChatMessageRoleUser, Content: "Hello!"},
            },
        },
    )
}
```

## Configuration

```go
agentops.Init(&agentops.Config{
    APIKey:        "ao_yourkey...",
    Endpoint:      "https://ingest.agentops.dev", // Optional
    FlushInterval: time.Second,                   // Default: 1s
    MaxBatchSize:  100,                           // Default: 100
    MaxRetries:    3,                             // Default: 3
    Disabled:      false,
    Debug:         false,
    DefaultTags:   []string{"production"},
})
```

## Session Management

### Using Functional Options

```go
session := agentops.StartSession(
    agentops.WithUserID("user_123"),
    agentops.WithFeatureID("chatbot"),
    agentops.WithTags("production", "v2"),
    agentops.WithMetadata(map[string]any{"source": "api"}),
)

// Track events
session.TrackPrompt("Hello!", agentops.WithModel("gpt-4o"))
session.TrackResponse("Hi there!",
    agentops.WithModel("gpt-4o"),
    agentops.WithDuration(500*time.Millisecond),
    agentops.WithTokens(5, 3),
)

// End session
session.End("completed")
```

### Context Integration

```go
ctx := agentops.WithSession(context.Background(), session)

// Later retrieve the session
session := agentops.SessionFromContext(ctx)
```

## Event Tracking

```go
// Prompts
session.TrackPrompt("User input",
    agentops.WithRole("user"),
    agentops.WithModel("gpt-4o"),
)

// Responses
session.TrackResponse("AI output",
    agentops.WithModel("gpt-4o"),
    agentops.WithDuration(500*time.Millisecond),
    agentops.WithTokens(10, 20),
    agentops.WithFinishReason("stop"),
)

// Tool calls
toolID := session.TrackToolCall("web_search", map[string]any{"query": "news"})
session.TrackToolResult("web_search", results,
    agentops.WithStatus("success"),
    agentops.WithDuration(1200*time.Millisecond),
    agentops.WithParentEventID(toolID),
)

// Errors
session.TrackError(err)

// Custom events
session.TrackCustom("user_feedback", map[string]any{"rating": 5})
```

## Wrapped Clients

### OpenAI

```go
import "github.com/sashabaranov/go-openai"

client := agentops.WrapOpenAI(openai.NewClient(apiKey))

// All calls automatically tracked
resp, err := client.CreateChatCompletion(ctx, req)
```

### Generic Wrapping

```go
// Wrap any function
wrapped := agentops.WrapFunc(myLLMCall, "my_llm")
result, err := wrapped(ctx, input)
```

## Middleware

### HTTP Middleware

```go
import "net/http"

handler := agentops.HTTPMiddleware(yourHandler)
http.ListenAndServe(":8080", handler)
```

### gRPC Interceptor

```go
import "google.golang.org/grpc"

server := grpc.NewServer(
    grpc.UnaryInterceptor(agentops.UnaryServerInterceptor()),
)
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
- [Architecture](/docs/architecture) - System design
