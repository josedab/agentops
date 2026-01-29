package agentops

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSession(t *testing.T) {
	t.Run("tracks prompt event", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			Endpoint:      server.URL,
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		session := client.StartSession(SessionOptions{})

		eventID := session.TrackPrompt("Hello, AI!", WithModel("gpt-4o"))

		if eventID == "" {
			t.Error("expected event ID to be returned")
		}

		// Check stats instead of buffer
		stats := session.Stats()
		if stats.EventCount < 2 { // session_start + prompt
			t.Errorf("expected at least 2 events tracked, got %d", stats.EventCount)
		}
	})

	t.Run("tracks response event with tokens and cost", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		session := client.StartSession(SessionOptions{})

		session.TrackResponse("Hello, human!",
			WithModel("gpt-4o"),
			WithTokens(100, 50, 150),
			WithDuration(500),
			WithCost(0.0125),
		)

		stats := session.Stats()
		if stats.TotalTokens != 150 {
			t.Errorf("expected 150 tokens, got %d", stats.TotalTokens)
		}
		if stats.TotalCost != 0.0125 {
			t.Errorf("expected 0.0125 cost, got %f", stats.TotalCost)
		}
	})

	t.Run("tracks tool call and result", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		session := client.StartSession(SessionOptions{})

		callID := session.TrackToolCall("web_search", map[string]string{"query": "golang testing"})
		session.TrackToolResult("web_search", []string{"result1", "result2"}, "success",
			WithParentEventID(callID),
			WithDuration(350),
		)

		if callID == "" {
			t.Error("expected tool call ID to be returned")
		}

		stats := session.Stats()
		if len(stats.Tools) != 1 || stats.Tools[0] != "web_search" {
			t.Errorf("expected web_search in tools, got %v", stats.Tools)
		}
	})

	t.Run("tracks error event", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		session := client.StartSession(SessionOptions{})

		errorID := session.TrackError(errors.New("something went wrong"))

		if errorID == "" {
			t.Error("expected error event ID to be returned")
		}

		stats := session.Stats()
		if stats.EventCount < 2 { // session_start + error
			t.Errorf("expected at least 2 events, got %d", stats.EventCount)
		}
	})

	t.Run("ends session with stats", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		session := client.StartSession(SessionOptions{})

		session.TrackPrompt("Hello", WithModel("gpt-4o"))
		session.TrackResponse("Hi!", WithModel("gpt-4o"), WithTokens(10, 5, 15), WithCost(0.001))
		session.TrackToolCall("calculator", map[string]int{"a": 1, "b": 2})

		session.End("completed")

		if session.Status != "completed" {
			t.Errorf("expected completed status, got %s", session.Status)
		}
		if session.EndedAt.IsZero() {
			t.Error("expected ended_at to be set")
		}

		stats := session.Stats()
		if stats.TotalCost != 0.001 {
			t.Errorf("expected 0.001 cost, got %f", stats.TotalCost)
		}
	})
}

func TestSessionStats(t *testing.T) {
	t.Run("aggregates token counts", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		session := client.StartSession(SessionOptions{})

		session.TrackResponse("Response 1", WithTokens(100, 50, 150), WithCost(0.01))
		session.TrackResponse("Response 2", WithTokens(200, 100, 300), WithCost(0.02))

		stats := session.Stats()

		if stats.PromptTokens != 300 {
			t.Errorf("expected 300 prompt tokens, got %d", stats.PromptTokens)
		}
		if stats.CompletionTokens != 150 {
			t.Errorf("expected 150 completion tokens, got %d", stats.CompletionTokens)
		}
		if stats.TotalTokens != 450 {
			t.Errorf("expected 450 total tokens, got %d", stats.TotalTokens)
		}
	})

	t.Run("aggregates costs", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		session := client.StartSession(SessionOptions{})

		session.TrackResponse("R1", WithCost(0.01))
		session.TrackResponse("R2", WithCost(0.02))
		session.TrackResponse("R3", WithCost(0.005))

		stats := session.Stats()

		expected := 0.035
		if stats.TotalCost < expected-0.0001 || stats.TotalCost > expected+0.0001 {
			t.Errorf("expected ~0.035 cost, got %f", stats.TotalCost)
		}
	})

	t.Run("tracks unique models", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		session := client.StartSession(SessionOptions{})

		session.TrackResponse("R1", WithModel("gpt-4o"))
		session.TrackResponse("R2", WithModel("claude-3-5-sonnet"))
		session.TrackResponse("R3", WithModel("gpt-4o")) // Duplicate

		stats := session.Stats()

		if len(stats.Models) != 2 {
			t.Errorf("expected 2 unique models, got %d", len(stats.Models))
		}
	})

	t.Run("tracks unique tools", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		session := client.StartSession(SessionOptions{})

		session.TrackToolCall("web_search", nil)
		session.TrackToolCall("calculator", nil)
		session.TrackToolCall("web_search", nil) // Duplicate

		stats := session.Stats()

		if len(stats.Tools) != 2 {
			t.Errorf("expected 2 unique tools, got %d", len(stats.Tools))
		}
	})

	t.Run("counts all events", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		session := client.StartSession(SessionOptions{})

		session.TrackPrompt("P1")
		session.TrackResponse("R1")
		session.TrackToolCall("tool1", nil)
		session.TrackToolResult("tool1", nil, "success")

		stats := session.Stats()

		// 1 session_start + 4 tracked = 5 total
		if stats.EventCount != 5 {
			t.Errorf("expected 5 events, got %d", stats.EventCount)
		}
	})
}

func TestEventOptions(t *testing.T) {
	t.Run("WithModel sets model", func(t *testing.T) {
		event := Event{}
		WithModel("gpt-4o")(&event)
		if event.Model != "gpt-4o" {
			t.Errorf("expected gpt-4o, got %s", event.Model)
		}
	})

	t.Run("WithTokens sets token usage", func(t *testing.T) {
		event := Event{}
		WithTokens(100, 50, 150)(&event)
		if event.Tokens == nil {
			t.Fatal("expected tokens to be set")
		}
		if event.Tokens.PromptTokens != 100 {
			t.Errorf("expected 100, got %d", event.Tokens.PromptTokens)
		}
		if event.Tokens.CompletionTokens != 50 {
			t.Errorf("expected 50, got %d", event.Tokens.CompletionTokens)
		}
		if event.Tokens.TotalTokens != 150 {
			t.Errorf("expected 150, got %d", event.Tokens.TotalTokens)
		}
	})

	t.Run("WithDuration sets duration", func(t *testing.T) {
		event := Event{}
		WithDuration(500)(&event)
		if event.DurationMs != 500 {
			t.Errorf("expected 500, got %d", event.DurationMs)
		}
	})

	t.Run("WithCost sets cost", func(t *testing.T) {
		event := Event{}
		WithCost(0.0125)(&event)
		if event.Cost != 0.0125 {
			t.Errorf("expected 0.0125, got %f", event.Cost)
		}
	})

	t.Run("WithParentEventID sets parent", func(t *testing.T) {
		event := Event{}
		WithParentEventID("evt_123")(&event)
		if event.ParentEventID != "evt_123" {
			t.Errorf("expected evt_123, got %s", event.ParentEventID)
		}
	})

	t.Run("WithMetadata adds metadata", func(t *testing.T) {
		event := Event{}
		WithMetadata("key1", "value1")(&event)
		WithMetadata("key2", 42)(&event)

		if event.Metadata["key1"] != "value1" {
			t.Errorf("expected value1, got %v", event.Metadata["key1"])
		}
		if event.Metadata["key2"] != 42 {
			t.Errorf("expected 42, got %v", event.Metadata["key2"])
		}
	})
}

func TestSessionDuration(t *testing.T) {
	client, _ := New(&Config{
		APIKey:        "ao_test_123456789012345678901234567890",
		FlushInterval: time.Hour,
	})
	defer client.Shutdown()

	session := client.StartSession(SessionOptions{})
	time.Sleep(50 * time.Millisecond)
	session.End("completed")

	duration := session.EndedAt.Sub(session.StartedAt)
	if duration < 50*time.Millisecond {
		t.Errorf("expected duration >= 50ms, got %v", duration)
	}
}
