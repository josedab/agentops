package agentops

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClientNew(t *testing.T) {
	t.Run("creates client with API key", func(t *testing.T) {
		client, err := New(&Config{
			APIKey:   "ao_test_123456789012345678901234567890",
			Disabled: true, // Don't start flush loop for test
		})
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if client == nil {
			t.Fatal("expected client to be non-nil")
		}
	})

	t.Run("returns error without API key", func(t *testing.T) {
		_, err := New(&Config{
			APIKey:   "",
			Disabled: false,
		})
		if err == nil {
			t.Fatal("expected error for missing API key")
		}
	})

	t.Run("uses default config when nil", func(t *testing.T) {
		t.Setenv("AGENTOPS_API_KEY", "ao_test_env_key_12345678901234567890")
		t.Setenv("AGENTOPS_DISABLED", "true")
		
		client, err := New(nil)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if client.config.APIKey != "ao_test_env_key_12345678901234567890" {
			t.Errorf("expected API key from env, got %s", client.config.APIKey)
		}
	})
}

func TestClientTrack(t *testing.T) {
	t.Run("adds event to buffer", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			MaxBatchSize:  100,
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		client.Track(Event{
			SessionID: "sess_123",
			EventType: EventTypePrompt,
			Content:   "Hello",
		})

		client.bufferMu.Lock()
		bufLen := len(client.buffer)
		client.bufferMu.Unlock()

		if bufLen != 1 {
			t.Errorf("expected 1 event in buffer, got %d", bufLen)
		}
	})

	t.Run("auto-generates event ID", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		client.Track(Event{
			SessionID: "sess_123",
			EventType: EventTypePrompt,
		})

		client.bufferMu.Lock()
		eventID := ""
		if len(client.buffer) > 0 {
			eventID = client.buffer[0].EventID
		}
		client.bufferMu.Unlock()

		if eventID == "" {
			t.Error("expected event ID to be generated")
		}
	})

	t.Run("auto-generates timestamp", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		client.Track(Event{
			SessionID: "sess_123",
			EventType: EventTypePrompt,
		})

		client.bufferMu.Lock()
		var timestamp time.Time
		if len(client.buffer) > 0 {
			timestamp = client.buffer[0].Timestamp
		}
		client.bufferMu.Unlock()

		if timestamp.IsZero() {
			t.Error("expected timestamp to be set")
		}
	})

	t.Run("does nothing when disabled", func(t *testing.T) {
		disabledClient, _ := New(&Config{
			APIKey:   "ao_test_123456789012345678901234567890",
			Disabled: true,
		})

		disabledClient.Track(Event{
			SessionID: "sess_123",
			EventType: EventTypePrompt,
		})

		if len(disabledClient.buffer) != 0 {
			t.Errorf("expected empty buffer when disabled, got %d", len(disabledClient.buffer))
		}
	})
}

func TestClientFlush(t *testing.T) {
	t.Run("sends events to server", func(t *testing.T) {
		var receivedEvents []Event

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != "POST" {
				t.Errorf("expected POST, got %s", r.Method)
			}
			if r.URL.Path != "/v1/events" {
				t.Errorf("expected /v1/events, got %s", r.URL.Path)
			}
			if r.Header.Get("Authorization") != "Bearer ao_test_123456789012345678901234567890" {
				t.Errorf("unexpected auth header: %s", r.Header.Get("Authorization"))
			}

			var payload struct {
				Events []Event `json:"events"`
			}
			json.NewDecoder(r.Body).Decode(&payload)
			receivedEvents = payload.Events

			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		client, _ := New(&Config{
			APIKey:   "ao_test_123456789012345678901234567890",
			Endpoint: server.URL,
			Disabled: true,
		})
		client.config.Disabled = false // Enable for this test

		client.Track(Event{
			SessionID: "sess_123",
			EventType: EventTypePrompt,
			Content:   "Hello",
		})
		client.Track(Event{
			SessionID: "sess_123",
			EventType: EventTypeResponse,
			Content:   "World",
		})

		err := client.Flush()
		if err != nil {
			t.Fatalf("flush failed: %v", err)
		}

		if len(receivedEvents) != 2 {
			t.Errorf("expected 2 events, got %d", len(receivedEvents))
		}
	})

	t.Run("clears buffer after flush", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		client, _ := New(&Config{
			APIKey:   "ao_test_123456789012345678901234567890",
			Endpoint: server.URL,
			Disabled: true,
		})
		client.config.Disabled = false

		client.Track(Event{SessionID: "sess_123", EventType: EventTypePrompt})
		client.Flush()

		if len(client.buffer) != 0 {
			t.Errorf("expected empty buffer after flush, got %d", len(client.buffer))
		}
	})

	t.Run("handles empty buffer gracefully", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:   "ao_test_123456789012345678901234567890",
			Disabled: true,
		})

		err := client.Flush()
		if err != nil {
			t.Errorf("expected no error for empty buffer, got %v", err)
		}
	})
}

func TestClientStartSession(t *testing.T) {
	t.Run("creates session with options", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		session := client.StartSession(SessionOptions{
			UserID:    "user_123",
			FeatureID: "chat",
			Tags:      []string{"production"},
			Metadata:  map[string]interface{}{"version": "1.0"},
		})

		if session == nil {
			t.Fatal("expected session to be non-nil")
		}
		if session.ID == "" {
			t.Error("expected session ID to be generated")
		}
		if session.UserID != "user_123" {
			t.Errorf("expected user_123, got %s", session.UserID)
		}
		if session.FeatureID != "chat" {
			t.Errorf("expected chat, got %s", session.FeatureID)
		}
	})

	t.Run("uses provided session ID", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		session := client.StartSession(SessionOptions{
			SessionID: "custom_session_id",
		})

		if session.ID != "custom_session_id" {
			t.Errorf("expected custom_session_id, got %s", session.ID)
		}
	})

	t.Run("tracks session start event", func(t *testing.T) {
		client, _ := New(&Config{
			APIKey:        "ao_test_123456789012345678901234567890",
			FlushInterval: time.Hour,
		})
		defer client.Shutdown()

		client.StartSession(SessionOptions{
			UserID: "user_123",
		})

		client.bufferMu.Lock()
		bufLen := len(client.buffer)
		var eventType EventType
		if bufLen > 0 {
			eventType = client.buffer[0].EventType
		}
		client.bufferMu.Unlock()

		if bufLen != 1 {
			t.Fatalf("expected 1 event, got %d", bufLen)
		}
		if eventType != EventTypeSessionStart {
			t.Errorf("expected session_start, got %s", eventType)
		}
	})
}

func TestClientShutdown(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client, _ := New(&Config{
		APIKey:        "ao_test_123456789012345678901234567890",
		Endpoint:      server.URL,
		FlushInterval: time.Hour, // Long interval so manual shutdown controls flush
	})

	client.Track(Event{SessionID: "sess_123", EventType: EventTypePrompt})

	// Should flush remaining events on shutdown
	client.Shutdown()

	// Buffer should be empty after shutdown
	if len(client.buffer) != 0 {
		t.Errorf("expected empty buffer after shutdown, got %d", len(client.buffer))
	}
}

func TestDefaultConfig(t *testing.T) {
	t.Run("returns default values", func(t *testing.T) {
		config := DefaultConfig()

		if config.Endpoint != "https://ingest.agentops.dev" {
			t.Errorf("unexpected default endpoint: %s", config.Endpoint)
		}
		if config.FlushInterval != time.Second {
			t.Errorf("unexpected flush interval: %v", config.FlushInterval)
		}
		if config.MaxBatchSize != 100 {
			t.Errorf("unexpected max batch size: %d", config.MaxBatchSize)
		}
	})

	t.Run("reads from environment", func(t *testing.T) {
		t.Setenv("AGENTOPS_API_KEY", "ao_env_key")
		t.Setenv("AGENTOPS_ENDPOINT", "https://custom.endpoint")
		t.Setenv("AGENTOPS_DISABLED", "true")
		t.Setenv("AGENTOPS_DEBUG", "true")

		config := DefaultConfig()

		if config.APIKey != "ao_env_key" {
			t.Errorf("expected ao_env_key, got %s", config.APIKey)
		}
		if config.Endpoint != "https://custom.endpoint" {
			t.Errorf("expected custom endpoint, got %s", config.Endpoint)
		}
		if !config.Disabled {
			t.Error("expected disabled to be true")
		}
		if !config.Debug {
			t.Error("expected debug to be true")
		}
	})
}
