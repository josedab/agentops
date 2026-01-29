package agentops

import (
	"testing"
	"time"

	openai "github.com/sashabaranov/go-openai"
)

func TestWrapOpenAI(t *testing.T) {
	client, _ := New(&Config{
		APIKey:   "ao_test_123456789012345678901234567890",
		Disabled: true,
	})
	session := client.StartSession(SessionOptions{})

	// Create a mock OpenAI client
	openaiClient := openai.NewClient("sk-test")

	wrapper := WrapOpenAI(openaiClient, session)

	if wrapper == nil {
		t.Fatal("expected wrapper to be non-nil")
	}

	if wrapper.client != openaiClient {
		t.Error("expected client to be set")
	}

	if wrapper.session != session {
		t.Error("expected session to be set")
	}
}

func TestOpenAIWrapperClient(t *testing.T) {
	client, _ := New(&Config{
		APIKey:   "ao_test_123456789012345678901234567890",
		Disabled: true,
	})
	session := client.StartSession(SessionOptions{})

	openaiClient := openai.NewClient("sk-test")
	wrapper := WrapOpenAI(openaiClient, session)

	if wrapper.Client() != openaiClient {
		t.Error("Client() should return the underlying OpenAI client")
	}
}

func TestFormatMessages(t *testing.T) {
	t.Run("empty messages", func(t *testing.T) {
		result := formatMessages([]openai.ChatCompletionMessage{})
		if result != "" {
			t.Errorf("expected empty string, got %s", result)
		}
	})

	t.Run("single message", func(t *testing.T) {
		messages := []openai.ChatCompletionMessage{
			{Role: "user", Content: "Hello"},
		}
		result := formatMessages(messages)
		if result != "Hello" {
			t.Errorf("expected 'Hello', got %s", result)
		}
	})

	t.Run("multiple messages returns last", func(t *testing.T) {
		messages := []openai.ChatCompletionMessage{
			{Role: "system", Content: "You are helpful"},
			{Role: "user", Content: "Hello"},
			{Role: "user", Content: "How are you?"},
		}
		result := formatMessages(messages)
		if result != "How are you?" {
			t.Errorf("expected 'How are you?', got %s", result)
		}
	})
}

func TestOpenAIWrapperTracksSession(t *testing.T) {
	agentOpsClient, _ := New(&Config{
		APIKey:        "ao_test_123456789012345678901234567890",
		FlushInterval: time.Hour,
	})
	defer agentOpsClient.Shutdown()
	
	session := agentOpsClient.StartSession(SessionOptions{
		UserID:    "user_123",
		FeatureID: "chat",
	})
	agentOpsClient.bufferMu.Lock()
	agentOpsClient.buffer = nil // Clear session start event
	agentOpsClient.bufferMu.Unlock()

	openaiClient := openai.NewClient("sk-test")
	wrapper := WrapOpenAI(openaiClient, session)

	// Verify wrapper is connected to the right session
	if wrapper.session.UserID != "user_123" {
		t.Errorf("expected user_123, got %s", wrapper.session.UserID)
	}
	if wrapper.session.FeatureID != "chat" {
		t.Errorf("expected chat, got %s", wrapper.session.FeatureID)
	}
}
