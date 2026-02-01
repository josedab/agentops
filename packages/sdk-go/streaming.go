package agentops

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// ConnectionState represents the WebSocket connection state.
type ConnectionState string

const (
	ConnectionStateDisconnected ConnectionState = "disconnected"
	ConnectionStateConnecting   ConnectionState = "connecting"
	ConnectionStateConnected    ConnectionState = "connected"
	ConnectionStateReconnecting ConnectionState = "reconnecting"
	ConnectionStateError        ConnectionState = "error"
)

// StreamingEventType represents the type of streaming event.
type StreamingEventType string

const (
	StreamingEventTypeSessionStart StreamingEventType = "session_start"
	StreamingEventTypeSessionEnd   StreamingEventType = "session_end"
	StreamingEventTypePrompt       StreamingEventType = "prompt"
	StreamingEventTypeResponse     StreamingEventType = "response"
	StreamingEventTypeToolCall     StreamingEventType = "tool_call"
	StreamingEventTypeToolResult   StreamingEventType = "tool_result"
	StreamingEventTypeError        StreamingEventType = "error"
	StreamingEventTypeCustom       StreamingEventType = "custom"
)

// StreamingEvent represents a real-time event from a streaming session.
type StreamingEvent struct {
	EventID       string                 `json:"event_id"`
	SessionID     string                 `json:"session_id"`
	EventType     StreamingEventType     `json:"event_type"`
	Timestamp     float64                `json:"timestamp"`
	Data          map[string]interface{} `json:"data,omitempty"`
	ParentEventID string                 `json:"parent_event_id,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

// TokenChunk represents a chunk of tokens from a streaming response.
type TokenChunk struct {
	SessionID   string  `json:"session_id"`
	EventID     string  `json:"event_id"`
	Chunk       string  `json:"chunk"`
	Index       int     `json:"index"`
	IsComplete  bool    `json:"is_complete"`
	TotalTokens *int    `json:"total_tokens,omitempty"`
	Timestamp   float64 `json:"timestamp"`
}

// StreamingFilters represents filters for streaming subscriptions.
type StreamingFilters struct {
	EventTypes      []StreamingEventType   `json:"event_types,omitempty"`
	IncludeTokens   bool                   `json:"include_tokens"`
	MinDurationMs   *int                   `json:"min_duration_ms,omitempty"`
	MetadataFilters map[string]interface{} `json:"metadata_filters,omitempty"`
}

// Subscription represents a streaming subscription.
type Subscription struct {
	ID        string            `json:"id"`
	SessionID string            `json:"session_id,omitempty"`
	UserID    string            `json:"user_id,omitempty"`
	FeatureID string            `json:"feature_id,omitempty"`
	Filters   *StreamingFilters `json:"filters,omitempty"`
	CreatedAt float64           `json:"created_at"`
}

// ConnectionInfo contains information about the current connection.
type ConnectionInfo struct {
	State             ConnectionState  `json:"state"`
	ConnectionID      string           `json:"connection_id,omitempty"`
	ConnectedAt       *float64         `json:"connected_at,omitempty"`
	ReconnectAttempts int              `json:"reconnect_attempts"`
	Subscriptions     map[string]bool  `json:"subscriptions"`
}

// StreamingConfig contains configuration for the streaming client.
type StreamingConfig struct {
	Endpoint             string
	APIKey               string
	AutoReconnect        bool
	MaxReconnectAttempts int
	ReconnectBaseDelay   time.Duration
	ReconnectMaxDelay    time.Duration
	HeartbeatInterval    time.Duration
	ConnectionTimeout    time.Duration
	Debug                bool
	OfflineBufferSize    int
}

// DefaultStreamingConfig returns default streaming configuration.
func DefaultStreamingConfig() StreamingConfig {
	return StreamingConfig{
		AutoReconnect:        true,
		MaxReconnectAttempts: 10,
		ReconnectBaseDelay:   time.Second,
		ReconnectMaxDelay:    30 * time.Second,
		HeartbeatInterval:    30 * time.Second,
		ConnectionTimeout:    10 * time.Second,
		Debug:                false,
		OfflineBufferSize:    1000,
	}
}

// StreamingError represents an error from the streaming connection.
type StreamingError struct {
	Code        string                 `json:"code"`
	Message     string                 `json:"message"`
	Details     map[string]interface{} `json:"details,omitempty"`
	Recoverable bool                   `json:"recoverable"`
}

func (e *StreamingError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// StreamingHandlers contains callbacks for streaming events.
type StreamingHandlers struct {
	OnConnect          func()
	OnDisconnect       func(reason string)
	OnEvent            func(event *StreamingEvent)
	OnTokenChunk       func(chunk *TokenChunk)
	OnReconnecting     func(attempt int)
	OnError            func(err *StreamingError)
	OnConnectionChange func(state ConnectionState, info *ConnectionInfo)
	OnSessionStart     func(sessionID string, event *StreamingEvent)
	OnSessionEnd       func(sessionID string, event *StreamingEvent)
}

// StreamingClient handles WebSocket connections for real-time streaming.
type StreamingClient struct {
	config            StreamingConfig
	handlers          *StreamingHandlers
	conn              *websocket.Conn
	connectionID      string
	state             ConnectionState
	connectedAt       *float64
	reconnectAttempts int
	subscriptions     map[string]*Subscription
	shouldReconnect   bool
	offlineBuffer     []map[string]interface{}
	mu                sync.RWMutex
	done              chan struct{}
	heartbeatTicker   *time.Ticker
}

// NewStreamingClient creates a new streaming client.
func NewStreamingClient(config StreamingConfig) *StreamingClient {
	if config.Endpoint == "" {
		config.Endpoint = "wss://stream.agentops.dev"
	}
	cfg := DefaultStreamingConfig()
	if config.AutoReconnect {
		cfg.AutoReconnect = config.AutoReconnect
	}
	if config.MaxReconnectAttempts > 0 {
		cfg.MaxReconnectAttempts = config.MaxReconnectAttempts
	}
	cfg.Endpoint = config.Endpoint
	cfg.APIKey = config.APIKey
	cfg.Debug = config.Debug
	if config.OfflineBufferSize > 0 {
		cfg.OfflineBufferSize = config.OfflineBufferSize
	}

	return &StreamingClient{
		config:          cfg,
		handlers:        &StreamingHandlers{},
		state:           ConnectionStateDisconnected,
		subscriptions:   make(map[string]*Subscription),
		shouldReconnect: true,
		offlineBuffer:   make([]map[string]interface{}, 0),
		done:            make(chan struct{}),
	}
}

// SetHandlers sets the event handlers.
func (c *StreamingClient) SetHandlers(handlers *StreamingHandlers) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.handlers = handlers
}

// State returns the current connection state.
func (c *StreamingClient) State() ConnectionState {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.state
}

// Connection returns current connection information.
func (c *StreamingClient) Connection() *ConnectionInfo {
	c.mu.RLock()
	defer c.mu.RUnlock()

	subs := make(map[string]bool)
	for id := range c.subscriptions {
		subs[id] = true
	}

	return &ConnectionInfo{
		State:             c.state,
		ConnectionID:      c.connectionID,
		ConnectedAt:       c.connectedAt,
		ReconnectAttempts: c.reconnectAttempts,
		Subscriptions:     subs,
	}
}

// Connect establishes the WebSocket connection.
func (c *StreamingClient) Connect() error {
	c.mu.Lock()
	if c.state == ConnectionStateConnected || c.state == ConnectionStateConnecting {
		c.mu.Unlock()
		return nil
	}
	c.updateState(ConnectionStateConnecting)
	c.mu.Unlock()

	// Build WebSocket URL
	wsURL := c.buildWSURL()

	// Create WebSocket connection
	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = c.config.ConnectionTimeout

	headers := map[string][]string{
		"Authorization": {fmt.Sprintf("Bearer %s", c.config.APIKey)},
	}

	conn, _, err := dialer.Dial(wsURL, headers)
	if err != nil {
		c.updateState(ConnectionStateError)
		if c.handlers.OnError != nil {
			c.handlers.OnError(&StreamingError{
				Code:        "CONNECTION_FAILED",
				Message:     err.Error(),
				Recoverable: true,
			})
		}
		if c.config.AutoReconnect {
			go c.scheduleReconnect()
		}
		return err
	}

	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()

	// Wait for connected message
	_, msg, err := conn.ReadMessage()
	if err != nil {
		c.updateState(ConnectionStateError)
		return err
	}

	var connectMsg map[string]interface{}
	if err := json.Unmarshal(msg, &connectMsg); err != nil {
		return err
	}

	if connectMsg["type"] == "connected" {
		c.mu.Lock()
		c.connectionID = connectMsg["connectionId"].(string)
		now := float64(time.Now().UnixMilli())
		c.connectedAt = &now
		c.reconnectAttempts = 0
		c.updateState(ConnectionStateConnected)
		c.mu.Unlock()

		// Start background goroutines
		go c.receiveLoop()
		go c.heartbeatLoop()

		// Resubscribe to existing subscriptions
		c.resubscribeAll()

		// Flush offline buffer
		c.flushOfflineBuffer()

		if c.handlers.OnConnect != nil {
			c.handlers.OnConnect()
		}
	}

	return nil
}

// Disconnect closes the WebSocket connection.
func (c *StreamingClient) Disconnect() {
	c.mu.Lock()
	c.shouldReconnect = false
	c.mu.Unlock()

	// Stop heartbeat
	if c.heartbeatTicker != nil {
		c.heartbeatTicker.Stop()
	}

	// Close done channel
	select {
	case <-c.done:
	default:
		close(c.done)
	}

	// Close connection
	c.mu.Lock()
	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}
	c.connectionID = ""
	c.connectedAt = nil
	c.updateState(ConnectionStateDisconnected)
	c.mu.Unlock()

	if c.handlers.OnDisconnect != nil {
		c.handlers.OnDisconnect("Client disconnected")
	}
}

// Subscribe creates a new subscription.
func (c *StreamingClient) Subscribe(sessionID, userID, featureID string, filters *StreamingFilters) (*Subscription, error) {
	sub := &Subscription{
		ID:        uuid.New().String(),
		SessionID: sessionID,
		UserID:    userID,
		FeatureID: featureID,
		Filters:   filters,
		CreatedAt: float64(time.Now().UnixMilli()),
	}

	c.mu.Lock()
	c.subscriptions[sub.ID] = sub
	state := c.state
	c.mu.Unlock()

	if state == ConnectionStateConnected {
		if err := c.sendSubscribe(sub); err != nil {
			return nil, err
		}
	}

	return sub, nil
}

// Unsubscribe removes a subscription.
func (c *StreamingClient) Unsubscribe(subscriptionID string) error {
	c.mu.Lock()
	_, exists := c.subscriptions[subscriptionID]
	if !exists {
		c.mu.Unlock()
		return nil
	}
	delete(c.subscriptions, subscriptionID)
	state := c.state
	c.mu.Unlock()

	if state == ConnectionStateConnected {
		msg := map[string]interface{}{
			"type":           "unsubscribe",
			"subscriptionId": subscriptionID,
		}
		return c.send(msg)
	}

	return nil
}

// SendEvent sends an event to the server.
func (c *StreamingClient) SendEvent(event *StreamingEvent) error {
	msg := map[string]interface{}{
		"type": "event",
		"event": map[string]interface{}{
			"eventId":       event.EventID,
			"sessionId":     event.SessionID,
			"eventType":     event.EventType,
			"timestamp":     event.Timestamp,
			"data":          event.Data,
			"parentEventId": event.ParentEventID,
			"metadata":      event.Metadata,
		},
	}

	c.mu.RLock()
	state := c.state
	c.mu.RUnlock()

	if state == ConnectionStateConnected {
		return c.send(msg)
	}

	// Buffer for later
	c.mu.Lock()
	if len(c.offlineBuffer) < c.config.OfflineBufferSize {
		c.offlineBuffer = append(c.offlineBuffer, msg)
	}
	c.mu.Unlock()

	return nil
}

// SendTokenChunk sends a token chunk to the server.
func (c *StreamingClient) SendTokenChunk(chunk *TokenChunk) error {
	msg := map[string]interface{}{
		"type":        "token_chunk",
		"sessionId":   chunk.SessionID,
		"eventId":     chunk.EventID,
		"chunk":       chunk.Chunk,
		"index":       chunk.Index,
		"isComplete":  chunk.IsComplete,
		"totalTokens": chunk.TotalTokens,
		"timestamp":   chunk.Timestamp,
	}

	c.mu.RLock()
	state := c.state
	c.mu.RUnlock()

	if state == ConnectionStateConnected {
		return c.send(msg)
	}

	// Buffer for later
	c.mu.Lock()
	if len(c.offlineBuffer) < c.config.OfflineBufferSize {
		c.offlineBuffer = append(c.offlineBuffer, msg)
	}
	c.mu.Unlock()

	return nil
}

func (c *StreamingClient) buildWSURL() string {
	endpoint := c.config.Endpoint
	return fmt.Sprintf("%s/v1/streaming", endpoint)
}

func (c *StreamingClient) updateState(state ConnectionState) {
	c.state = state
	if c.handlers.OnConnectionChange != nil {
		c.handlers.OnConnectionChange(state, c.Connection())
	}
}

func (c *StreamingClient) send(msg map[string]interface{}) error {
	c.mu.RLock()
	conn := c.conn
	c.mu.RUnlock()

	if conn == nil {
		return fmt.Errorf("not connected")
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	return conn.WriteMessage(websocket.TextMessage, data)
}

func (c *StreamingClient) sendSubscribe(sub *Subscription) error {
	var filtersMap map[string]interface{}
	if sub.Filters != nil {
		eventTypes := make([]string, len(sub.Filters.EventTypes))
		for i, et := range sub.Filters.EventTypes {
			eventTypes[i] = string(et)
		}
		filtersMap = map[string]interface{}{
			"eventTypes":      eventTypes,
			"includeTokens":   sub.Filters.IncludeTokens,
			"minDurationMs":   sub.Filters.MinDurationMs,
			"metadataFilters": sub.Filters.MetadataFilters,
		}
	}

	msg := map[string]interface{}{
		"type":           "subscribe",
		"subscriptionId": sub.ID,
		"sessionId":      sub.SessionID,
		"userId":         sub.UserID,
		"featureId":      sub.FeatureID,
		"filters":        filtersMap,
	}

	return c.send(msg)
}

func (c *StreamingClient) resubscribeAll() {
	c.mu.RLock()
	subs := make([]*Subscription, 0, len(c.subscriptions))
	for _, sub := range c.subscriptions {
		subs = append(subs, sub)
	}
	c.mu.RUnlock()

	for _, sub := range subs {
		c.sendSubscribe(sub)
	}
}

func (c *StreamingClient) flushOfflineBuffer() {
	c.mu.Lock()
	buffer := c.offlineBuffer
	c.offlineBuffer = make([]map[string]interface{}, 0)
	c.mu.Unlock()

	for _, msg := range buffer {
		c.send(msg)
	}
}

func (c *StreamingClient) receiveLoop() {
	for {
		select {
		case <-c.done:
			return
		default:
		}

		c.mu.RLock()
		conn := c.conn
		state := c.state
		c.mu.RUnlock()

		if conn == nil || state != ConnectionStateConnected {
			return
		}

		_, msg, err := conn.ReadMessage()
		if err != nil {
			if c.config.Debug {
				log.Printf("Receive error: %v", err)
			}
			c.handleConnectionError(err)
			return
		}

		c.handleMessage(msg)
	}
}

func (c *StreamingClient) handleMessage(data []byte) {
	var msg map[string]interface{}
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}

	msgType, _ := msg["type"].(string)

	switch msgType {
	case "event":
		eventData, _ := msg["event"].(map[string]interface{})
		event := &StreamingEvent{
			EventID:       getString(eventData, "eventId"),
			SessionID:     getString(eventData, "sessionId"),
			EventType:     StreamingEventType(getString(eventData, "eventType")),
			Timestamp:     getFloat(eventData, "timestamp"),
			Data:          getMap(eventData, "data"),
			ParentEventID: getString(eventData, "parentEventId"),
			Metadata:      getMap(eventData, "metadata"),
		}

		if c.handlers.OnEvent != nil {
			c.handlers.OnEvent(event)
		}

		if event.EventType == StreamingEventTypeSessionStart && c.handlers.OnSessionStart != nil {
			c.handlers.OnSessionStart(event.SessionID, event)
		} else if event.EventType == StreamingEventTypeSessionEnd && c.handlers.OnSessionEnd != nil {
			c.handlers.OnSessionEnd(event.SessionID, event)
		}

	case "token_chunk":
		chunk := &TokenChunk{
			SessionID:  getString(msg, "sessionId"),
			EventID:    getString(msg, "eventId"),
			Chunk:      getString(msg, "chunk"),
			Index:      int(getFloat(msg, "index")),
			IsComplete: getBool(msg, "isComplete"),
			Timestamp:  getFloat(msg, "timestamp"),
		}
		if totalTokens, ok := msg["totalTokens"].(float64); ok {
			t := int(totalTokens)
			chunk.TotalTokens = &t
		}

		if c.handlers.OnTokenChunk != nil {
			c.handlers.OnTokenChunk(chunk)
		}

	case "error":
		err := &StreamingError{
			Code:        getString(msg, "code"),
			Message:     getString(msg, "message"),
			Details:     getMap(msg, "details"),
			Recoverable: getBool(msg, "recoverable"),
		}
		if c.handlers.OnError != nil {
			c.handlers.OnError(err)
		}

	case "heartbeat":
		// Respond to heartbeat
		c.send(map[string]interface{}{"type": "heartbeat_ack"})
	}
}

func (c *StreamingClient) heartbeatLoop() {
	c.heartbeatTicker = time.NewTicker(c.config.HeartbeatInterval)
	defer c.heartbeatTicker.Stop()

	for {
		select {
		case <-c.done:
			return
		case <-c.heartbeatTicker.C:
			c.mu.RLock()
			state := c.state
			c.mu.RUnlock()

			if state == ConnectionStateConnected {
				c.send(map[string]interface{}{
					"type":      "heartbeat",
					"timestamp": float64(time.Now().UnixMilli()),
				})
			}
		}
	}
}

func (c *StreamingClient) handleConnectionError(err error) {
	c.mu.Lock()
	if c.state == ConnectionStateConnected {
		c.updateState(ConnectionStateDisconnected)
		c.mu.Unlock()

		if c.handlers.OnDisconnect != nil {
			c.handlers.OnDisconnect(err.Error())
		}

		c.mu.RLock()
		shouldReconnect := c.shouldReconnect && c.config.AutoReconnect
		c.mu.RUnlock()

		if shouldReconnect {
			go c.scheduleReconnect()
		}
	} else {
		c.mu.Unlock()
	}
}

func (c *StreamingClient) scheduleReconnect() {
	c.mu.Lock()
	if c.reconnectAttempts >= c.config.MaxReconnectAttempts {
		c.mu.Unlock()
		if c.handlers.OnError != nil {
			c.handlers.OnError(&StreamingError{
				Code:        "MAX_RECONNECT_ATTEMPTS",
				Message:     "Maximum reconnection attempts reached",
				Recoverable: false,
			})
		}
		return
	}

	c.updateState(ConnectionStateReconnecting)
	c.reconnectAttempts++
	attempts := c.reconnectAttempts
	c.mu.Unlock()

	if c.handlers.OnReconnecting != nil {
		c.handlers.OnReconnecting(attempts)
	}

	// Exponential backoff
	delay := c.config.ReconnectBaseDelay * time.Duration(1<<(attempts-1))
	if delay > c.config.ReconnectMaxDelay {
		delay = c.config.ReconnectMaxDelay
	}

	time.Sleep(delay)

	c.mu.RLock()
	shouldReconnect := c.shouldReconnect
	c.mu.RUnlock()

	if shouldReconnect {
		c.Connect()
	}
}

// Helper functions
func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func getFloat(m map[string]interface{}, key string) float64 {
	if v, ok := m[key].(float64); ok {
		return v
	}
	return 0
}

func getBool(m map[string]interface{}, key string) bool {
	if v, ok := m[key].(bool); ok {
		return v
	}
	return false
}

func getMap(m map[string]interface{}, key string) map[string]interface{} {
	if v, ok := m[key].(map[string]interface{}); ok {
		return v
	}
	return nil
}
