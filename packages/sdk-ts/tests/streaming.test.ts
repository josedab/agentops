import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StreamingClient } from "../src/streaming/client";
import type { StreamingEvent } from "../src/streaming/types";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    // Simulate connection after a tick
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event("open"));
      // Send connected message
      this.simulateMessage({ type: "connected", connectionId: "conn-123" });
    }, 10);
  }

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close", { code: 1000 }));
  });

  // Helper to simulate receiving a message
  simulateMessage(data: unknown) {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }

  // Helper to simulate error
  simulateError() {
    this.onerror?.(new Event("error"));
  }
}

describe("StreamingClient", () => {
  let client: StreamingClient;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    // @ts-expect-error - Mocking WebSocket
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(async () => {
    try {
      await client?.disconnect();
    } catch {
      // Ignore disconnect errors in cleanup
    }
    vi.unstubAllGlobals();
  });

  describe("connection", () => {
    it("should connect to WebSocket endpoint", async () => {
      client = new StreamingClient({
        endpoint: "wss://test.agentops.io/streaming",
        apiKey: "ao_test_key",
      });

      const onConnect = vi.fn();
      client.setHandlers({ onConnect });

      await client.connect();
      await new Promise((r) => setTimeout(r, 50));

      expect(client.isConnected).toBe(true);
    });

    it("should report disconnected state initially", () => {
      client = new StreamingClient({
        endpoint: "wss://test.agentops.io/streaming",
        apiKey: "ao_test_key",
      });

      expect(client.state).toBe("disconnected");
    });

    it("should transition to disconnected state on close", async () => {
      client = new StreamingClient({
        endpoint: "wss://test.agentops.io/streaming",
        apiKey: "ao_test_key",
      });

      await client.connect();
      await new Promise((r) => setTimeout(r, 50));

      expect(client.state).toBe("connected");

      await client.disconnect();

      expect(client.state).toBe("disconnected");
    });
  });

  describe("subscriptions", () => {
    it("should subscribe to session events", async () => {
      client = new StreamingClient({
        endpoint: "wss://test.agentops.io/streaming",
        apiKey: "ao_test_key",
      });

      await client.connect();
      await new Promise((r) => setTimeout(r, 50));

      // Get the mock WebSocket instance
      mockWs = (client as any).ws;

      const subscription = client.subscribe({ sessionId: "session-123" });

      expect(subscription.id).toBeDefined();
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining("subscribe"),
      );
    });

    it("should unsubscribe from session events", async () => {
      client = new StreamingClient({
        endpoint: "wss://test.agentops.io/streaming",
        apiKey: "ao_test_key",
      });

      await client.connect();
      await new Promise((r) => setTimeout(r, 50));

      mockWs = (client as any).ws;

      const subscription = client.subscribe({ sessionId: "session-123" });
      client.unsubscribe(subscription.id);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining("unsubscribe"),
      );
    });
  });

  describe("event handling", () => {
    it("should emit events when received", async () => {
      client = new StreamingClient({
        endpoint: "wss://test.agentops.io/streaming",
        apiKey: "ao_test_key",
      });

      const onEvent = vi.fn();
      client.setHandlers({ onEvent });

      await client.connect();
      await new Promise((r) => setTimeout(r, 50));

      mockWs = (client as any).ws;

      const testEvent: StreamingEvent = {
        eventId: "evt-1",
        sessionId: "session-123",
        type: "prompt",
        timestamp: Date.now(),
        data: { content: "Hello" },
      };

      mockWs.simulateMessage({
        type: "event",
        event: testEvent,
      });

      expect(onEvent).toHaveBeenCalledWith(testEvent);
    });

    it("should handle event batches", async () => {
      client = new StreamingClient({
        endpoint: "wss://test.agentops.io/streaming",
        apiKey: "ao_test_key",
      });

      const onEvent = vi.fn();
      client.setHandlers({ onEvent });

      await client.connect();
      await new Promise((r) => setTimeout(r, 50));

      mockWs = (client as any).ws;

      const events: StreamingEvent[] = [
        {
          eventId: "evt-1",
          sessionId: "s1",
          type: "prompt",
          timestamp: 1,
          data: {},
        },
        {
          eventId: "evt-2",
          sessionId: "s1",
          type: "response",
          timestamp: 2,
          data: {},
        },
      ];

      mockWs.simulateMessage({
        type: "event_batch",
        events: events.map((e) => ({ event: e })),
      });

      expect(onEvent).toHaveBeenCalledTimes(2);
    });

    it("should emit token chunks", async () => {
      client = new StreamingClient({
        endpoint: "wss://test.agentops.io/streaming",
        apiKey: "ao_test_key",
      });

      const onTokenChunk = vi.fn();
      client.setHandlers({ onTokenChunk });

      await client.connect();
      await new Promise((r) => setTimeout(r, 50));

      mockWs = (client as any).ws;

      mockWs.simulateMessage({
        type: "token_chunk",
        sessionId: "s1",
        eventId: "evt-1",
        chunk: "Hello",
        index: 0,
        isComplete: false,
      });

      expect(onTokenChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          chunk: "Hello",
          index: 0,
        }),
      );
    });
  });

  describe("reconnection", () => {
    it("should support auto-reconnect configuration", async () => {
      // Test that client accepts reconnection configuration
      client = new StreamingClient({
        endpoint: "wss://test.agentops.io/streaming",
        apiKey: "ao_test_key",
        maxReconnectAttempts: 3,
        autoReconnect: true,
        reconnectBaseDelay: 100,
      });

      // Verify client is created with reconnect config
      expect(client).toBeDefined();
      expect(client.state).toBe("disconnected");
    });
  });

  describe("state", () => {
    it("should track connection state", async () => {
      client = new StreamingClient({
        endpoint: "wss://test.agentops.io/streaming",
        apiKey: "ao_test_key",
      });

      expect(client.state).toBe("disconnected");

      const connectPromise = client.connect();
      // State changes to connecting immediately
      expect(client.state).toBe("connecting");

      await connectPromise;
      await new Promise((r) => setTimeout(r, 50));
      expect(client.state).toBe("connected");

      await client.disconnect();
      expect(client.state).toBe("disconnected");
    });

    it("should provide connection info", async () => {
      client = new StreamingClient({
        endpoint: "wss://test.agentops.io/streaming",
        apiKey: "ao_test_key",
      });

      await client.connect();
      await new Promise((r) => setTimeout(r, 50));

      const info = client.connection;

      expect(info.state).toBe("connected");
      expect(info.connectionId).toBeDefined();
    });
  });
});
