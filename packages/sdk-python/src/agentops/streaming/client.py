"""Streaming WebSocket client for real-time trace visualization."""

import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Any

try:
    import websockets
    from websockets.asyncio.client import connect
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False
    websockets = None
    connect = None

from .types import (
    ConnectionState,
    ConnectionInfo,
    StreamingConfig,
    StreamingEvent,
    StreamingEventType,
    StreamingFilters,
    StreamingHandlers,
    StreamingError,
    Subscription,
    TokenChunk,
)


logger = logging.getLogger(__name__)


class StreamingClient:
    """WebSocket client for real-time streaming events with auto-reconnect."""

    def __init__(self, config: StreamingConfig):
        """
        Initialize the streaming client.

        Args:
            config: Streaming configuration
        """
        if not HAS_WEBSOCKETS:
            raise ImportError(
                "websockets package is required for streaming. "
                "Install it with: pip install agentops[streaming]"
            )

        self._config = config
        self._handlers = StreamingHandlers()
        self._connection: Any = None
        self._connection_id: str | None = None
        self._state = ConnectionState.DISCONNECTED
        self._connected_at: float | None = None
        self._reconnect_attempts = 0
        self._subscriptions: dict[str, Subscription] = {}
        self._pending_subscriptions: list[Subscription] = []
        self._heartbeat_task: asyncio.Task | None = None
        self._receive_task: asyncio.Task | None = None
        self._reconnect_task: asyncio.Task | None = None
        self._should_reconnect = True
        self._offline_buffer: list[dict[str, Any]] = []
        self._lock = asyncio.Lock()

    @property
    def state(self) -> ConnectionState:
        """Get the current connection state."""
        return self._state

    @property
    def connection(self) -> ConnectionInfo:
        """Get current connection information."""
        return ConnectionInfo(
            state=self._state,
            connection_id=self._connection_id,
            connected_at=self._connected_at,
            reconnect_attempts=self._reconnect_attempts,
            subscriptions=set(self._subscriptions.keys()),
        )

    def set_handlers(self, handlers: StreamingHandlers) -> None:
        """Set event handlers."""
        self._handlers = handlers

    async def connect(self) -> None:
        """Connect to the streaming server."""
        if self._state in (ConnectionState.CONNECTED, ConnectionState.CONNECTING):
            logger.debug("Already connected or connecting")
            return

        self._update_state(ConnectionState.CONNECTING)

        try:
            ws_url = self._build_ws_url()
            self._connection = await asyncio.wait_for(
                connect(
                    ws_url,
                    additional_headers={"Authorization": f"Bearer {self._config.api_key}"},
                ),
                timeout=self._config.connection_timeout,
            )

            # Wait for connected message
            raw_message = await asyncio.wait_for(
                self._connection.recv(),
                timeout=self._config.connection_timeout,
            )
            message = json.loads(raw_message)

            if message.get("type") == "connected":
                self._connection_id = message.get("connectionId")
                self._connected_at = datetime.now().timestamp() * 1000
                self._reconnect_attempts = 0
                self._update_state(ConnectionState.CONNECTED)

                # Start background tasks
                self._receive_task = asyncio.create_task(self._receive_loop())
                self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

                # Resubscribe to pending subscriptions
                await self._resubscribe_all()

                # Flush offline buffer
                await self._flush_offline_buffer()

                if self._handlers.on_connect:
                    self._handlers.on_connect()
            else:
                raise ConnectionError(f"Unexpected message: {message}")

        except Exception as e:
            logger.error(f"Connection failed: {e}")
            self._update_state(ConnectionState.ERROR)
            if self._handlers.on_error:
                self._handlers.on_error(StreamingError(
                    code="CONNECTION_FAILED",
                    message=str(e),
                    recoverable=True,
                ))
            if self._config.auto_reconnect:
                await self._schedule_reconnect()

    async def disconnect(self) -> None:
        """Disconnect from the streaming server."""
        self._should_reconnect = False

        # Cancel background tasks
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
            self._heartbeat_task = None

        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
            self._receive_task = None

        if self._reconnect_task:
            self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except asyncio.CancelledError:
                pass
            self._reconnect_task = None

        # Close connection
        if self._connection:
            await self._connection.close()
            self._connection = None

        self._connection_id = None
        self._connected_at = None
        self._update_state(ConnectionState.DISCONNECTED)

        if self._handlers.on_disconnect:
            self._handlers.on_disconnect("Client disconnected")

    async def subscribe(
        self,
        session_id: str | None = None,
        user_id: str | None = None,
        feature_id: str | None = None,
        filters: StreamingFilters | None = None,
    ) -> Subscription:
        """
        Subscribe to streaming events.

        Args:
            session_id: Subscribe to events for a specific session
            user_id: Subscribe to events for a specific user
            feature_id: Subscribe to events for a specific feature
            filters: Additional filters for events

        Returns:
            Subscription object
        """
        subscription = Subscription(
            id=str(uuid.uuid4()),
            session_id=session_id,
            user_id=user_id,
            feature_id=feature_id,
            filters=filters,
        )

        if self._state == ConnectionState.CONNECTED:
            await self._send_subscribe(subscription)
        else:
            self._pending_subscriptions.append(subscription)

        self._subscriptions[subscription.id] = subscription
        return subscription

    async def unsubscribe(self, subscription_id: str) -> None:
        """
        Unsubscribe from streaming events.

        Args:
            subscription_id: ID of the subscription to remove
        """
        if subscription_id not in self._subscriptions:
            return

        if self._state == ConnectionState.CONNECTED:
            message = {
                "type": "unsubscribe",
                "subscriptionId": subscription_id,
            }
            await self._send(message)

        del self._subscriptions[subscription_id]

        # Also remove from pending
        self._pending_subscriptions = [
            s for s in self._pending_subscriptions if s.id != subscription_id
        ]

    async def send_event(self, event: StreamingEvent) -> None:
        """
        Send an event to the server.

        Args:
            event: Event to send
        """
        message = {
            "type": "event",
            "event": {
                "eventId": event.event_id,
                "sessionId": event.session_id,
                "eventType": event.event_type.value if isinstance(event.event_type, StreamingEventType) else event.event_type,
                "timestamp": event.timestamp,
                "data": event.data,
                "parentEventId": event.parent_event_id,
                "metadata": event.metadata,
            },
        }

        if self._state == ConnectionState.CONNECTED:
            await self._send(message)
        else:
            # Buffer for when we reconnect
            if len(self._offline_buffer) < self._config.offline_buffer_size:
                self._offline_buffer.append(message)

    async def send_token_chunk(self, chunk: TokenChunk) -> None:
        """
        Send a token chunk to the server.

        Args:
            chunk: Token chunk to send
        """
        message = {
            "type": "token_chunk",
            "sessionId": chunk.session_id,
            "eventId": chunk.event_id,
            "chunk": chunk.chunk,
            "index": chunk.index,
            "isComplete": chunk.is_complete,
            "totalTokens": chunk.total_tokens,
            "timestamp": chunk.timestamp,
        }

        if self._state == ConnectionState.CONNECTED:
            await self._send(message)
        else:
            if len(self._offline_buffer) < self._config.offline_buffer_size:
                self._offline_buffer.append(message)

    def _build_ws_url(self) -> str:
        """Build the WebSocket URL."""
        endpoint = self._config.endpoint
        if endpoint.startswith("http://"):
            endpoint = "ws://" + endpoint[7:]
        elif endpoint.startswith("https://"):
            endpoint = "wss://" + endpoint[8:]
        elif not endpoint.startswith(("ws://", "wss://")):
            endpoint = "wss://" + endpoint

        return f"{endpoint}/v1/streaming"

    def _update_state(self, new_state: ConnectionState) -> None:
        """Update connection state and notify handlers."""
        old_state = self._state
        self._state = new_state

        if self._config.debug:
            logger.debug(f"State change: {old_state} -> {new_state}")

        if self._handlers.on_connection_change:
            self._handlers.on_connection_change(new_state, self.connection)

    async def _send(self, message: dict[str, Any]) -> None:
        """Send a message to the server."""
        if self._connection and self._state == ConnectionState.CONNECTED:
            try:
                await self._connection.send(json.dumps(message))
            except Exception as e:
                logger.error(f"Failed to send message: {e}")
                await self._handle_connection_error(e)

    async def _send_subscribe(self, subscription: Subscription) -> None:
        """Send a subscription request."""
        filters_dict = None
        if subscription.filters:
            event_types = None
            if subscription.filters.event_types:
                event_types = [
                    et.value if isinstance(et, StreamingEventType) else et
                    for et in subscription.filters.event_types
                ]
            filters_dict = {
                "eventTypes": event_types,
                "includeTokens": subscription.filters.include_tokens,
                "minDurationMs": subscription.filters.min_duration_ms,
                "metadataFilters": subscription.filters.metadata_filters,
            }

        message = {
            "type": "subscribe",
            "subscriptionId": subscription.id,
            "sessionId": subscription.session_id,
            "userId": subscription.user_id,
            "featureId": subscription.feature_id,
            "filters": filters_dict,
        }
        await self._send(message)

    async def _resubscribe_all(self) -> None:
        """Resubscribe to all active subscriptions."""
        for subscription in list(self._subscriptions.values()):
            await self._send_subscribe(subscription)

        for subscription in self._pending_subscriptions:
            await self._send_subscribe(subscription)
        self._pending_subscriptions.clear()

    async def _flush_offline_buffer(self) -> None:
        """Flush buffered messages."""
        async with self._lock:
            for message in self._offline_buffer:
                await self._send(message)
            self._offline_buffer.clear()

    async def _receive_loop(self) -> None:
        """Background loop for receiving messages."""
        try:
            while self._connection and self._state == ConnectionState.CONNECTED:
                try:
                    raw_message = await self._connection.recv()
                    message = json.loads(raw_message)
                    await self._handle_message(message)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Receive error: {e}")
                    await self._handle_connection_error(e)
                    break
        except Exception as e:
            logger.error(f"Receive loop error: {e}")

    async def _handle_message(self, message: dict[str, Any]) -> None:
        """Handle an incoming message."""
        msg_type = message.get("type")

        if msg_type == "event":
            event_data = message.get("event", {})
            event = StreamingEvent(
                event_id=event_data.get("eventId", ""),
                session_id=event_data.get("sessionId", ""),
                event_type=event_data.get("eventType", "custom"),
                timestamp=event_data.get("timestamp", 0),
                data=event_data.get("data", {}),
                parent_event_id=event_data.get("parentEventId"),
                metadata=event_data.get("metadata", {}),
            )

            if self._handlers.on_event:
                self._handlers.on_event(event)

            # Also call specific handlers
            if event.event_type in ("session_start", StreamingEventType.SESSION_START):
                if self._handlers.on_session_start:
                    self._handlers.on_session_start(event.session_id, event)
            elif event.event_type in ("session_end", StreamingEventType.SESSION_END):
                if self._handlers.on_session_end:
                    self._handlers.on_session_end(event.session_id, event)

        elif msg_type == "token_chunk":
            chunk = TokenChunk(
                session_id=message.get("sessionId", ""),
                event_id=message.get("eventId", ""),
                chunk=message.get("chunk", ""),
                index=message.get("index", 0),
                is_complete=message.get("isComplete", False),
                total_tokens=message.get("totalTokens"),
                timestamp=message.get("timestamp", datetime.now().timestamp() * 1000),
            )
            if self._handlers.on_token_chunk:
                self._handlers.on_token_chunk(chunk)

        elif msg_type == "error":
            error = StreamingError(
                code=message.get("code", "UNKNOWN"),
                message=message.get("message", "Unknown error"),
                details=message.get("details"),
                recoverable=message.get("recoverable", True),
            )
            if self._handlers.on_error:
                self._handlers.on_error(error)

        elif msg_type == "heartbeat":
            # Respond to heartbeat
            await self._send({"type": "heartbeat_ack"})

        elif msg_type == "subscribed":
            if self._config.debug:
                logger.debug(f"Subscribed: {message.get('subscriptionId')}")

        elif msg_type == "unsubscribed":
            if self._config.debug:
                logger.debug(f"Unsubscribed: {message.get('subscriptionId')}")

    async def _heartbeat_loop(self) -> None:
        """Background loop for sending heartbeats."""
        try:
            while self._state == ConnectionState.CONNECTED:
                await asyncio.sleep(self._config.heartbeat_interval)
                if self._state == ConnectionState.CONNECTED:
                    await self._send({
                        "type": "heartbeat",
                        "timestamp": datetime.now().timestamp() * 1000,
                    })
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Heartbeat error: {e}")

    async def _handle_connection_error(self, error: Exception) -> None:
        """Handle a connection error."""
        if self._state == ConnectionState.CONNECTED:
            self._update_state(ConnectionState.DISCONNECTED)
            if self._handlers.on_disconnect:
                self._handlers.on_disconnect(str(error))

            if self._should_reconnect and self._config.auto_reconnect:
                await self._schedule_reconnect()

    async def _schedule_reconnect(self) -> None:
        """Schedule a reconnection attempt."""
        if self._reconnect_attempts >= self._config.max_reconnect_attempts:
            logger.error("Max reconnection attempts reached")
            if self._handlers.on_error:
                self._handlers.on_error(StreamingError(
                    code="MAX_RECONNECT_ATTEMPTS",
                    message="Maximum reconnection attempts reached",
                    recoverable=False,
                ))
            return

        self._update_state(ConnectionState.RECONNECTING)
        self._reconnect_attempts += 1

        if self._handlers.on_reconnecting:
            self._handlers.on_reconnecting(self._reconnect_attempts)

        # Exponential backoff with jitter
        delay = min(
            self._config.reconnect_base_delay * (2 ** (self._reconnect_attempts - 1)),
            self._config.reconnect_max_delay,
        )

        if self._config.debug:
            logger.debug(f"Reconnecting in {delay}s (attempt {self._reconnect_attempts})")

        await asyncio.sleep(delay)

        if self._should_reconnect:
            await self.connect()

    async def __aenter__(self) -> "StreamingClient":
        """Async context manager entry."""
        await self.connect()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.disconnect()


def create_streaming_client(
    endpoint: str,
    api_key: str,
    **kwargs: Any,
) -> StreamingClient:
    """
    Create a streaming client.

    Args:
        endpoint: WebSocket endpoint URL
        api_key: API key for authentication
        **kwargs: Additional configuration options

    Returns:
        StreamingClient instance
    """
    config = StreamingConfig(
        endpoint=endpoint,
        api_key=api_key,
        **kwargs,
    )
    return StreamingClient(config)
