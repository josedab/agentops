"""Streaming module types."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, TypeAlias


class ConnectionState(str, Enum):
    """WebSocket connection state."""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    ERROR = "error"


class StreamingEventType(str, Enum):
    """Types of streaming events."""
    SESSION_START = "session_start"
    SESSION_END = "session_end"
    PROMPT = "prompt"
    RESPONSE = "response"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    ERROR = "error"
    CUSTOM = "custom"


@dataclass
class StreamingEvent:
    """Real-time event from a streaming session."""
    event_id: str
    session_id: str
    event_type: StreamingEventType | str
    timestamp: float
    data: dict[str, Any] = field(default_factory=dict)
    parent_event_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TokenChunk:
    """A chunk of tokens from a streaming response."""
    session_id: str
    event_id: str
    chunk: str
    index: int
    is_complete: bool
    total_tokens: int | None = None
    timestamp: float = field(default_factory=lambda: datetime.now().timestamp() * 1000)


@dataclass
class StreamingFilters:
    """Filters for streaming subscriptions."""
    event_types: list[StreamingEventType | str] | None = None
    include_tokens: bool = True
    min_duration_ms: int | None = None
    metadata_filters: dict[str, Any] | None = None


@dataclass
class Subscription:
    """A streaming subscription."""
    id: str
    session_id: str | None = None
    user_id: str | None = None
    feature_id: str | None = None
    filters: StreamingFilters | None = None
    created_at: float = field(default_factory=lambda: datetime.now().timestamp() * 1000)


@dataclass
class ConnectionInfo:
    """Information about the current connection."""
    state: ConnectionState
    connection_id: str | None = None
    connected_at: float | None = None
    reconnect_attempts: int = 0
    subscriptions: set[str] = field(default_factory=set)


@dataclass
class StreamingConfig:
    """Configuration for the streaming client."""
    endpoint: str
    api_key: str
    auto_reconnect: bool = True
    max_reconnect_attempts: int = 10
    reconnect_base_delay: float = 1.0
    reconnect_max_delay: float = 30.0
    heartbeat_interval: float = 30.0
    connection_timeout: float = 10.0
    debug: bool = False
    offline_buffer_size: int = 1000


@dataclass
class StreamingError:
    """Error from the streaming connection."""
    code: str
    message: str
    details: dict[str, Any] | None = None
    recoverable: bool = True


# Handler type aliases
OnConnectHandler: TypeAlias = Callable[[], None]
OnDisconnectHandler: TypeAlias = Callable[[str | None], None]
OnEventHandler: TypeAlias = Callable[[StreamingEvent], None]
OnTokenChunkHandler: TypeAlias = Callable[[TokenChunk], None]
OnReconnectingHandler: TypeAlias = Callable[[int], None]
OnErrorHandler: TypeAlias = Callable[[StreamingError], None]
OnConnectionChangeHandler: TypeAlias = Callable[[ConnectionState, ConnectionInfo], None]


@dataclass
class StreamingHandlers:
    """Event handlers for streaming events."""
    on_connect: OnConnectHandler | None = None
    on_disconnect: OnDisconnectHandler | None = None
    on_event: OnEventHandler | None = None
    on_token_chunk: OnTokenChunkHandler | None = None
    on_reconnecting: OnReconnectingHandler | None = None
    on_error: OnErrorHandler | None = None
    on_connection_change: OnConnectionChangeHandler | None = None
    on_session_start: Callable[[str, StreamingEvent], None] | None = None
    on_session_end: Callable[[str, StreamingEvent], None] | None = None


# Server message types
@dataclass
class ConnectedMessage:
    """Server message indicating successful connection."""
    type: str = "connected"
    connection_id: str = ""


@dataclass
class SubscribedMessage:
    """Server message confirming subscription."""
    type: str = "subscribed"
    subscription_id: str = ""


@dataclass
class UnsubscribedMessage:
    """Server message confirming unsubscription."""
    type: str = "unsubscribed"
    subscription_id: str = ""


@dataclass
class EventMessage:
    """Server message containing an event."""
    type: str = "event"
    event: StreamingEvent | None = None


@dataclass
class TokenChunkMessage:
    """Server message containing a token chunk."""
    type: str = "token_chunk"
    session_id: str = ""
    event_id: str = ""
    chunk: str = ""
    index: int = 0
    is_complete: bool = False
    total_tokens: int | None = None


@dataclass
class ErrorMessage:
    """Server message indicating an error."""
    type: str = "error"
    code: str = ""
    message: str = ""
    details: dict[str, Any] | None = None
    recoverable: bool = True


@dataclass
class HeartbeatMessage:
    """Heartbeat message."""
    type: str = "heartbeat"
    timestamp: float = field(default_factory=lambda: datetime.now().timestamp() * 1000)
