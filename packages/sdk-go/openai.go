package agentops

import (
	"context"
	"time"

	"github.com/google/uuid"
	openai "github.com/sashabaranov/go-openai"
)

// OpenAIWrapper wraps an OpenAI client with automatic instrumentation.
type OpenAIWrapper struct {
	client  *openai.Client
	session *Session
}

// WrapOpenAI wraps an OpenAI client for automatic tracking.
func WrapOpenAI(client *openai.Client, session *Session) *OpenAIWrapper {
	return &OpenAIWrapper{
		client:  client,
		session: session,
	}
}

// CreateChatCompletion creates a chat completion with automatic tracking.
func (w *OpenAIWrapper) CreateChatCompletion(ctx context.Context, req openai.ChatCompletionRequest) (openai.ChatCompletionResponse, error) {
	startTime := time.Now()
	eventID := uuid.New().String()

	// Track prompt
	w.session.Track(Event{
		EventID:   eventID,
		EventType: EventTypePrompt,
		Model:     req.Model,
		Content:   formatMessages(req.Messages),
		Metadata: map[string]interface{}{
			"message_count": len(req.Messages),
		},
	})

	// Make the API call
	resp, err := w.client.CreateChatCompletion(ctx, req)

	duration := time.Since(startTime)

	if err != nil {
		w.session.Track(Event{
			ParentEventID: eventID,
			EventType:     EventTypeError,
			Model:         req.Model,
			DurationMs:    int(duration.Milliseconds()),
			Metadata: map[string]interface{}{
				"error_type":    "api_error",
				"error_message": err.Error(),
			},
		})
		return resp, err
	}

	// Calculate cost
	cost := CalculateCost(resp.Model, resp.Usage.PromptTokens, resp.Usage.CompletionTokens)

	// Track response
	content := ""
	if len(resp.Choices) > 0 {
		content = resp.Choices[0].Message.Content
	}

	w.session.Track(Event{
		ParentEventID: eventID,
		EventType:     EventTypeResponse,
		Model:         resp.Model,
		Content:       content,
		DurationMs:    int(duration.Milliseconds()),
		Cost:          cost,
		Tokens: &TokenUsage{
			PromptTokens:     resp.Usage.PromptTokens,
			CompletionTokens: resp.Usage.CompletionTokens,
			TotalTokens:      resp.Usage.TotalTokens,
		},
		Metadata: map[string]interface{}{
			"finish_reason": string(resp.Choices[0].FinishReason),
		},
	})

	// Track tool calls if any
	if len(resp.Choices) > 0 && len(resp.Choices[0].Message.ToolCalls) > 0 {
		for _, toolCall := range resp.Choices[0].Message.ToolCalls {
			w.session.Track(Event{
				ParentEventID: eventID,
				EventType:     EventTypeToolCall,
				ToolName:      toolCall.Function.Name,
				Model:         resp.Model,
				Metadata: map[string]interface{}{
					"tool_call_id": toolCall.ID,
					"arguments":    toolCall.Function.Arguments,
				},
			})
		}
	}

	return resp, nil
}

func formatMessages(messages []openai.ChatCompletionMessage) string {
	if len(messages) == 0 {
		return ""
	}
	// Return last message content for simplicity
	return messages[len(messages)-1].Content
}

// Client returns the underlying OpenAI client.
func (w *OpenAIWrapper) Client() *openai.Client {
	return w.client
}
