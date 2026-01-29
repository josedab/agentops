"""AgentOps session management."""

import uuid
from datetime import datetime
from typing import Any

from agentops.types import (
    Event,
    EventType,
    SessionEndEvent,
    SessionStartEvent,
    TokenUsage,
)


class Session:
    """A tracking session for a sequence of agent interactions."""
    
    def __init__(
        self,
        session_id: str | None = None,
        user_id: str | None = None,
        feature_id: str | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ):
        """Create a new session.
        
        Args:
            session_id: Optional custom session ID. Auto-generated if not provided.
            user_id: User identifier for attribution.
            feature_id: Feature/flow identifier.
            tags: Tags for filtering/grouping.
            metadata: Additional metadata.
        """
        self.session_id = session_id or str(uuid.uuid4())
        self.user_id = user_id
        self.feature_id = feature_id
        self.tags = tags or []
        self.metadata = metadata or {}
        
        self.started_at = datetime.utcnow()
        self.ended_at: datetime | None = None
        self.status = "active"
        
        # Aggregated metrics
        self.event_count = 0
        self.total_tokens = 0
        self.total_cost = 0.0
        self.models_used: set[str] = set()
        self.tools_used: set[str] = set()
        
        # Event tracking callback
        self._track_callback: Any = None
    
    def _set_track_callback(self, callback: Any) -> None:
        """Set the callback for tracking events."""
        self._track_callback = callback
    
    def start_event(self) -> SessionStartEvent:
        """Create a session start event."""
        return SessionStartEvent(
            session_id=self.session_id,
            user_id=self.user_id,
            feature_id=self.feature_id,
            tags=self.tags,
            metadata=self.metadata,
        )
    
    def end_event(
        self,
        status: str = "completed",
        error_message: str | None = None,
    ) -> SessionEndEvent:
        """Create a session end event."""
        self.ended_at = datetime.utcnow()
        self.status = status
        
        duration_ms = int((self.ended_at - self.started_at).total_seconds() * 1000)
        
        return SessionEndEvent(
            session_id=self.session_id,
            status=status,
            error_message=error_message,
            duration_ms=duration_ms,
            metadata={
                **self.metadata,
                "total_events": self.event_count,
                "total_tokens": self.total_tokens,
                "total_cost": self.total_cost,
                "models_used": list(self.models_used),
                "tools_used": list(self.tools_used),
            },
        )
    
    def track(self, event: Event | dict[str, Any]) -> None:
        """Track an event in this session.
        
        Args:
            event: The event to track.
        """
        if isinstance(event, dict):
            event = Event(session_id=self.session_id, **event)
        else:
            event.session_id = self.session_id
        
        # Update aggregated metrics
        self.event_count += 1
        
        if event.tokens:
            self.total_tokens += event.tokens.total_tokens
        
        if event.cost:
            self.total_cost += event.cost
        
        if event.model:
            self.models_used.add(event.model)
        
        if event.tool_name:
            self.tools_used.add(event.tool_name)
        
        # Send to client
        if self._track_callback:
            self._track_callback(event)
    
    def end(
        self,
        status: str = "completed",
        error_message: str | None = None,
    ) -> None:
        """End this session.
        
        Args:
            status: Final status ('completed' or 'error').
            error_message: Error message if status is 'error'.
        """
        end_event = self.end_event(status=status, error_message=error_message)
        if self._track_callback:
            self._track_callback(end_event)
    
    def __enter__(self) -> "Session":
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        if exc_type:
            self.end(status="error", error_message=str(exc_val))
        else:
            self.end(status="completed")
