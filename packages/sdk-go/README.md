# AgentOps Go SDK

AI agent observability SDK for Go applications.

## Installation

```bash
go get github.com/josedab/agentops-go
```

## Quick Start

```go
package main

import (
    "context"
    "log"
    "os"

    agentops "github.com/josedab/agentops-go"
    openai "github.com/sashabaranov/go-openai"
)

func main() {
    // Initialize AgentOps
    err := agentops.Init(&agentops.Config{
        APIKey: os.Getenv("AGENTOPS_API_KEY"),
    })
    if err != nil {
        log.Fatal(err)
    }
    defer agentops.Shutdown()

    // Create a session
    session := agentops.StartSession(agentops.SessionOptions{
        UserID:    "user_123",
        FeatureID: "chat",
        Tags:      []string{"production"},
    })

    // Wrap OpenAI client
    openaiClient := openai.NewClient(os.Getenv("OPENAI_API_KEY"))
    client := agentops.WrapOpenAI(openaiClient, session)

    // All calls are automatically tracked
    resp, err := client.CreateChatCompletion(context.Background(), openai.ChatCompletionRequest{
        Model: "gpt-4o",
        Messages: []openai.ChatCompletionMessage{
            {Role: openai.ChatMessageRoleUser, Content: "Hello!"},
        },
    })
    if err != nil {
        log.Fatal(err)
    }

    log.Println("Response:", resp.Choices[0].Message.Content)

    // End session
    session.End("completed")
}
```

## Manual Tracking

```go
session := agentops.StartSession(agentops.SessionOptions{
    UserID: "user_123",
})

// Track events manually
session.TrackPrompt("What is Go?", agentops.WithModel("gpt-4o"))

session.TrackResponse("Go is a programming language...",
    agentops.WithModel("gpt-4o"),
    agentops.WithTokens(10, 50, 60),
    agentops.WithCost(0.001),
    agentops.WithDuration(500),
)

// Track tool calls
callID := session.TrackToolCall("web_search", map[string]string{"query": "Go lang"})
session.TrackToolResult("web_search", results, "success",
    agentops.WithParentEventID(callID),
)

// Track errors
session.TrackError(errors.New("something went wrong"))

// End session
session.End("completed")
```

## Configuration

```go
client, _ := agentops.New(&agentops.Config{
    APIKey:        "ao_your_key",
    Endpoint:      "https://ingest.agentops.dev",
    FlushInterval: time.Second,
    MaxBatchSize:  100,
    Disabled:      false,
    Debug:         true,
})
```

## Environment Variables

- `AGENTOPS_API_KEY` - Your API key
- `AGENTOPS_ENDPOINT` - Custom endpoint
- `AGENTOPS_DISABLED` - Disable tracking ("true")
- `AGENTOPS_DEBUG` - Enable debug logging ("true")
