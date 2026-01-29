package agentops

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// Session represents a tracking session.
type Session struct {
	ID        string
	client    *Client
	UserID    string
	FeatureID string
	Tags      []string
	Metadata  map[string]interface{}
	StartedAt time.Time
	EndedAt   time.Time
	Status    string

	stats   *SessionStats
	statsMu sync.Mutex
}

// SessionStats holds aggregated session statistics.
type SessionStats struct {
	EventCount       int
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
	TotalCost        float64
	Models           []string
	Tools            []string
}

// Track adds an event to this session.
func (s *Session) Track(event Event) {
	event.SessionID = s.ID
	s.updateStats(event)
	s.client.Track(event)
}

func (s *Session) updateStats(event Event) {
	s.statsMu.Lock()
	defer s.statsMu.Unlock()

	s.stats.EventCount++

	if event.Tokens != nil {
		s.stats.PromptTokens += event.Tokens.PromptTokens
		s.stats.CompletionTokens += event.Tokens.CompletionTokens
		s.stats.TotalTokens += event.Tokens.TotalTokens
	}

	if event.Cost > 0 {
		s.stats.TotalCost += event.Cost
	}

	if event.Model != "" {
		found := false
		for _, m := range s.stats.Models {
			if m == event.Model {
				found = true
				break
			}
		}
		if !found {
			s.stats.Models = append(s.stats.Models, event.Model)
		}
	}

	if event.ToolName != "" {
		found := false
		for _, t := range s.stats.Tools {
			if t == event.ToolName {
				found = true
				break
			}
		}
		if !found {
			s.stats.Tools = append(s.stats.Tools, event.ToolName)
		}
	}
}

// TrackPrompt tracks a prompt/request event.
func (s *Session) TrackPrompt(content string, opts ...EventOption) string {
	event := Event{
		EventID:   uuid.New().String(),
		EventType: EventTypePrompt,
		Content:   content,
	}
	for _, opt := range opts {
		opt(&event)
	}
	s.Track(event)
	return event.EventID
}

// TrackResponse tracks a response event.
func (s *Session) TrackResponse(content string, opts ...EventOption) string {
	event := Event{
		EventID:   uuid.New().String(),
		EventType: EventTypeResponse,
		Content:   content,
	}
	for _, opt := range opts {
		opt(&event)
	}
	s.Track(event)
	return event.EventID
}

// TrackToolCall tracks a tool call event.
func (s *Session) TrackToolCall(toolName string, input interface{}, opts ...EventOption) string {
	event := Event{
		EventID:   uuid.New().String(),
		EventType: EventTypeToolCall,
		ToolName:  toolName,
		Metadata: map[string]interface{}{
			"input": input,
		},
	}
	for _, opt := range opts {
		opt(&event)
	}
	s.Track(event)
	return event.EventID
}

// TrackToolResult tracks a tool result event.
func (s *Session) TrackToolResult(toolName string, output interface{}, status string, opts ...EventOption) string {
	event := Event{
		EventID:    uuid.New().String(),
		EventType:  EventTypeToolResult,
		ToolName:   toolName,
		ToolStatus: status,
		Metadata: map[string]interface{}{
			"output": output,
		},
	}
	for _, opt := range opts {
		opt(&event)
	}
	s.Track(event)
	return event.EventID
}

// TrackError tracks an error event.
func (s *Session) TrackError(err error, opts ...EventOption) string {
	event := Event{
		EventID:   uuid.New().String(),
		EventType: EventTypeError,
		Metadata: map[string]interface{}{
			"error_type":    "error",
			"error_message": err.Error(),
		},
	}
	for _, opt := range opts {
		opt(&event)
	}
	s.Track(event)
	return event.EventID
}

// End ends the session.
func (s *Session) End(status string) {
	s.EndedAt = time.Now().UTC()
	s.Status = status

	durationMs := s.EndedAt.Sub(s.StartedAt).Milliseconds()

	s.statsMu.Lock()
	stats := *s.stats
	s.statsMu.Unlock()

	s.client.Track(Event{
		SessionID:  s.ID,
		EventType:  EventTypeSessionEnd,
		DurationMs: int(durationMs),
		Metadata: map[string]interface{}{
			"status":            status,
			"event_count":       stats.EventCount,
			"total_tokens":      stats.TotalTokens,
			"total_cost":        stats.TotalCost,
			"models_used":       stats.Models,
			"tools_used":        stats.Tools,
		},
	})
}

// Stats returns the session statistics.
func (s *Session) Stats() SessionStats {
	s.statsMu.Lock()
	defer s.statsMu.Unlock()
	return *s.stats
}

// EventOption is a function that modifies an event.
type EventOption func(*Event)

// WithModel sets the model for an event.
func WithModel(model string) EventOption {
	return func(e *Event) {
		e.Model = model
	}
}

// WithTokens sets the token usage for an event.
func WithTokens(prompt, completion, total int) EventOption {
	return func(e *Event) {
		e.Tokens = &TokenUsage{
			PromptTokens:     prompt,
			CompletionTokens: completion,
			TotalTokens:      total,
		}
	}
}

// WithDuration sets the duration for an event.
func WithDuration(ms int) EventOption {
	return func(e *Event) {
		e.DurationMs = ms
	}
}

// WithCost sets the cost for an event.
func WithCost(cost float64) EventOption {
	return func(e *Event) {
		e.Cost = cost
	}
}

// WithParentEventID sets the parent event ID.
func WithParentEventID(id string) EventOption {
	return func(e *Event) {
		e.ParentEventID = id
	}
}

// WithMetadata adds metadata to an event.
func WithMetadata(key string, value interface{}) EventOption {
	return func(e *Event) {
		if e.Metadata == nil {
			e.Metadata = make(map[string]interface{})
		}
		e.Metadata[key] = value
	}
}
