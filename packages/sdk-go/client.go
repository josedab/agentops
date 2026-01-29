// Package agentops provides AI agent observability for Go applications.
package agentops

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Config holds the AgentOps client configuration.
type Config struct {
	APIKey        string
	Endpoint      string
	FlushInterval time.Duration
	MaxBatchSize  int
	Disabled      bool
	Debug         bool
}

// DefaultConfig returns the default configuration.
func DefaultConfig() *Config {
	return &Config{
		APIKey:        os.Getenv("AGENTOPS_API_KEY"),
		Endpoint:      getEnvOrDefault("AGENTOPS_ENDPOINT", "https://ingest.agentops.dev"),
		FlushInterval: time.Second,
		MaxBatchSize:  100,
		Disabled:      os.Getenv("AGENTOPS_DISABLED") == "true",
		Debug:         os.Getenv("AGENTOPS_DEBUG") == "true",
	}
}

func getEnvOrDefault(key, defaultValue string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultValue
}

// Client is the main AgentOps client.
type Client struct {
	config   *Config
	buffer   []Event
	bufferMu sync.Mutex
	client   *http.Client
	stopCh   chan struct{}
	wg       sync.WaitGroup
}

// New creates a new AgentOps client.
func New(config *Config) (*Client, error) {
	defaults := DefaultConfig()
	if config == nil {
		config = defaults
	} else {
		// Merge with defaults for missing values
		if config.Endpoint == "" {
			config.Endpoint = defaults.Endpoint
		}
		if config.FlushInterval == 0 {
			config.FlushInterval = defaults.FlushInterval
		}
		if config.MaxBatchSize == 0 {
			config.MaxBatchSize = defaults.MaxBatchSize
		}
		if config.APIKey == "" {
			config.APIKey = defaults.APIKey
		}
	}

	if config.APIKey == "" && !config.Disabled {
		return nil, fmt.Errorf("AGENTOPS_API_KEY is required")
	}

	c := &Client{
		config: config,
		buffer: make([]Event, 0, config.MaxBatchSize),
		client: &http.Client{Timeout: 30 * time.Second},
		stopCh: make(chan struct{}),
	}

	if !config.Disabled {
		c.wg.Add(1)
		go c.flushLoop()
	}

	return c, nil
}

// flushLoop periodically flushes the event buffer.
func (c *Client) flushLoop() {
	defer c.wg.Done()
	ticker := time.NewTicker(c.config.FlushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.Flush()
		case <-c.stopCh:
			c.Flush()
			return
		}
	}
}

// Track adds an event to the buffer.
func (c *Client) Track(event Event) {
	if c.config.Disabled {
		return
	}

	if event.EventID == "" {
		event.EventID = uuid.New().String()
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now().UTC()
	}

	c.bufferMu.Lock()
	c.buffer = append(c.buffer, event)
	shouldFlush := len(c.buffer) >= c.config.MaxBatchSize
	c.bufferMu.Unlock()

	if shouldFlush {
		c.Flush()
	}
}

// Flush sends all buffered events to the server.
func (c *Client) Flush() error {
	c.bufferMu.Lock()
	if len(c.buffer) == 0 {
		c.bufferMu.Unlock()
		return nil
	}
	events := c.buffer
	c.buffer = make([]Event, 0, c.config.MaxBatchSize)
	c.bufferMu.Unlock()

	return c.sendEvents(events)
}

func (c *Client) sendEvents(events []Event) error {
	payload := map[string]interface{}{
		"events": events,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal events: %w", err)
	}

	req, err := http.NewRequest("POST", c.config.Endpoint+"/v1/events", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.config.APIKey)
	req.Header.Set("User-Agent", "agentops-go/0.1.0")

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send events: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("server returned status %d", resp.StatusCode)
	}

	if c.config.Debug {
		fmt.Printf("[AgentOps] Sent %d events\n", len(events))
	}

	return nil
}

// Shutdown gracefully shuts down the client.
func (c *Client) Shutdown() {
	close(c.stopCh)
	c.wg.Wait()
}

// StartSession creates a new tracking session.
func (c *Client) StartSession(opts SessionOptions) *Session {
	session := &Session{
		ID:        uuid.New().String(),
		client:    c,
		UserID:    opts.UserID,
		FeatureID: opts.FeatureID,
		Tags:      opts.Tags,
		Metadata:  opts.Metadata,
		StartedAt: time.Now().UTC(),
		stats:     &SessionStats{},
	}

	if opts.SessionID != "" {
		session.ID = opts.SessionID
	}

	// Track session start via session.Track to update stats
	session.Track(Event{
		EventType: EventTypeSessionStart,
		Metadata: map[string]interface{}{
			"user_id":    session.UserID,
			"feature_id": session.FeatureID,
			"tags":       session.Tags,
		},
	})

	return session
}

// SessionOptions configures a new session.
type SessionOptions struct {
	SessionID string
	UserID    string
	FeatureID string
	Tags      []string
	Metadata  map[string]interface{}
}

// Global client instance
var defaultClient *Client
var defaultClientOnce sync.Once

// Init initializes the global client.
func Init(config *Config) error {
	var err error
	defaultClientOnce.Do(func() {
		defaultClient, err = New(config)
	})
	return err
}

// Track adds an event using the global client.
func Track(event Event) {
	if defaultClient != nil {
		defaultClient.Track(event)
	}
}

// Flush flushes the global client.
func Flush() error {
	if defaultClient != nil {
		return defaultClient.Flush()
	}
	return nil
}

// Shutdown shuts down the global client.
func Shutdown() {
	if defaultClient != nil {
		defaultClient.Shutdown()
	}
}

// StartSession creates a session using the global client.
func StartSession(opts SessionOptions) *Session {
	if defaultClient == nil {
		Init(nil)
	}
	return defaultClient.StartSession(opts)
}
