"""AgentOps type definitions."""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """Event types for tracking."""
    
    SESSION_START = "session_start"
    SESSION_END = "session_end"
    PROMPT = "prompt"
    RESPONSE = "response"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    ERROR = "error"
    CUSTOM = "custom"


class TokenUsage(BaseModel):
    """Token usage information."""
    
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class Event(BaseModel):
    """Base event model."""
    
    event_id: UUID | None = None
    session_id: str
    parent_event_id: str | None = None
    event_type: EventType
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    # Content
    content: str | dict[str, Any] | None = None
    
    # Metrics
    tokens: TokenUsage | None = None
    cost: float | None = None
    duration_ms: int | None = None
    
    # Model info
    model: str | None = None
    
    # Tool info
    tool_name: str | None = None
    tool_status: str | None = None
    
    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class SessionStartEvent(Event):
    """Session start event."""
    
    event_type: EventType = EventType.SESSION_START
    user_id: str | None = None
    feature_id: str | None = None


class SessionEndEvent(Event):
    """Session end event."""
    
    event_type: EventType = EventType.SESSION_END
    status: str = "completed"  # completed, error
    error_message: str | None = None


class PromptEvent(Event):
    """Prompt/request event."""
    
    event_type: EventType = EventType.PROMPT
    messages: list[dict[str, Any]] | None = None


class ResponseEvent(Event):
    """Response event."""
    
    event_type: EventType = EventType.RESPONSE
    choices: list[dict[str, Any]] | None = None


class ToolCallEvent(Event):
    """Tool call event."""
    
    event_type: EventType = EventType.TOOL_CALL
    tool_name: str
    tool_input: dict[str, Any] | None = None


class ToolResultEvent(Event):
    """Tool result event."""
    
    event_type: EventType = EventType.TOOL_RESULT
    tool_name: str
    tool_output: Any = None
    tool_status: str = "success"


class ErrorEvent(Event):
    """Error event."""
    
    event_type: EventType = EventType.ERROR
    error_type: str | None = None
    error_message: str | None = None
    error_stack: str | None = None
