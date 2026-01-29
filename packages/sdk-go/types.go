package agentops

import "time"

// EventType represents the type of event.
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

// Event represents a trackable event.
type Event struct {
	EventID       string                 `json:"event_id,omitempty"`
	SessionID     string                 `json:"session_id"`
	ParentEventID string                 `json:"parent_event_id,omitempty"`
	EventType     EventType              `json:"event_type"`
	Timestamp     time.Time              `json:"timestamp"`
	Content       string                 `json:"content,omitempty"`
	Model         string                 `json:"model,omitempty"`
	Tokens        *TokenUsage            `json:"tokens,omitempty"`
	Cost          float64                `json:"cost,omitempty"`
	DurationMs    int                    `json:"duration_ms,omitempty"`
	ToolName      string                 `json:"tool_name,omitempty"`
	ToolStatus    string                 `json:"tool_status,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
	Tags          []string               `json:"tags,omitempty"`
}

// TokenUsage represents token usage statistics.
type TokenUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}
