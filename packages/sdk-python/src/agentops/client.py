"""AgentOps client - main entry point."""

import asyncio
import logging
import uuid
from functools import wraps
from typing import Any, Callable, TypeVar

from agentops.config import Config
from agentops.pricing import calculate_cost
from agentops.session import Session
from agentops.transport import EventBuffer, HttpTransport
from agentops.types import (
    ErrorEvent,
    Event,
    EventType,
    PromptEvent,
    ResponseEvent,
    TokenUsage,
    ToolCallEvent,
    ToolResultEvent,
)

logger = logging.getLogger("agentops")

T = TypeVar("T")


class AgentOps:
    """Main AgentOps client for tracking AI agent interactions."""
    
    def __init__(
        self,
        api_key: str | None = None,
        endpoint: str = "https://ingest.agentops.dev",
        flush_interval: float = 1.0,
        max_batch_size: int = 100,
        disabled: bool = False,
        debug: bool = False,
    ):
        """Initialize the AgentOps client.
        
        Args:
            api_key: Your AgentOps API key.
            endpoint: The ingestion endpoint URL.
            flush_interval: How often to flush events (seconds).
            max_batch_size: Maximum events per batch.
            disabled: Disable all tracking.
            debug: Enable debug logging.
        """
        self.config = Config.from_env(
            api_key=api_key,
            endpoint=endpoint,
            flush_interval=flush_interval,
            max_batch_size=max_batch_size,
            disabled=disabled,
            debug=debug,
        )
        
        if debug:
            logging.basicConfig(level=logging.DEBUG)
            logger.setLevel(logging.DEBUG)
        
        self._transport = HttpTransport(
            endpoint=self.config.endpoint,
            api_key=self.config.api_key,
        )
        
        self._buffer = EventBuffer(
            max_size=self.config.max_batch_size,
            flush_interval=self.config.flush_interval,
            on_flush=self._send_events,
        )
        
        self._sessions: dict[str, Session] = {}
        self._current_session: Session | None = None
    
    async def _send_events(self, events: list[Event]) -> None:
        """Send events via transport."""
        await self._transport.send(events)
    
    def wrap(self, client: T, **metadata: Any) -> T:
        """Wrap an LLM client for automatic instrumentation.
        
        Supports:
        - OpenAI (openai.OpenAI, openai.AsyncOpenAI)
        - Anthropic (anthropic.Anthropic, anthropic.AsyncAnthropic)
        
        Args:
            client: The LLM client to wrap.
            **metadata: Session metadata (user_id, feature_id, tags).
        
        Returns:
            The wrapped client with automatic instrumentation.
        """
        if self.config.disabled:
            return client
        
        client_type = type(client).__name__
        module_name = type(client).__module__
        
        # OpenAI
        if "openai" in module_name:
            return self._wrap_openai(client, **metadata)  # type: ignore
        
        # Anthropic
        if "anthropic" in module_name:
            return self._wrap_anthropic(client, **metadata)  # type: ignore
        
        logger.warning(f"Unknown client type: {client_type}. Returning unwrapped.")
        return client
    
    def _wrap_openai(self, client: T, **metadata: Any) -> T:
        """Wrap an OpenAI client."""
        original_create = client.chat.completions.create  # type: ignore
        
        @wraps(original_create)
        def wrapped_create(*args: Any, **kwargs: Any) -> Any:
            session = self._get_or_create_session(**metadata)
            event_id = str(uuid.uuid4())
            start_time = asyncio.get_event_loop().time() * 1000
            
            # Track prompt
            session.track(PromptEvent(
                event_id=uuid.UUID(event_id),
                session_id=session.session_id,
                event_type=EventType.PROMPT,
                content=str(kwargs.get("messages", [])),
                messages=kwargs.get("messages"),
                model=kwargs.get("model"),
            ))
            
            try:
                response = original_create(*args, **kwargs)
                end_time = asyncio.get_event_loop().time() * 1000
                
                # Extract usage
                usage = response.usage
                tokens = TokenUsage(
                    prompt_tokens=usage.prompt_tokens if usage else 0,
                    completion_tokens=usage.completion_tokens if usage else 0,
                    total_tokens=usage.total_tokens if usage else 0,
                ) if usage else None
                
                # Calculate cost
                cost = None
                if tokens and response.model:
                    cost = calculate_cost(
                        response.model,
                        tokens.prompt_tokens,
                        tokens.completion_tokens,
                    )
                
                # Track response
                session.track(ResponseEvent(
                    session_id=session.session_id,
                    parent_event_id=event_id,
                    event_type=EventType.RESPONSE,
                    content=response.choices[0].message.content if response.choices else None,
                    tokens=tokens,
                    cost=cost,
                    duration_ms=int(end_time - start_time),
                    model=response.model,
                    choices=[c.model_dump() for c in response.choices] if response.choices else None,
                ))
                
                # Track tool calls
                if response.choices and response.choices[0].message.tool_calls:
                    for tool_call in response.choices[0].message.tool_calls:
                        session.track(ToolCallEvent(
                            session_id=session.session_id,
                            parent_event_id=event_id,
                            event_type=EventType.TOOL_CALL,
                            tool_name=tool_call.function.name,
                            tool_input={"arguments": tool_call.function.arguments},
                        ))
                
                return response
                
            except Exception as e:
                session.track(ErrorEvent(
                    session_id=session.session_id,
                    parent_event_id=event_id,
                    event_type=EventType.ERROR,
                    error_type=type(e).__name__,
                    error_message=str(e),
                ))
                raise
        
        # Replace the method
        client.chat.completions.create = wrapped_create  # type: ignore
        return client
    
    def _wrap_anthropic(self, client: T, **metadata: Any) -> T:
        """Wrap an Anthropic client."""
        original_create = client.messages.create  # type: ignore
        
        @wraps(original_create)
        def wrapped_create(*args: Any, **kwargs: Any) -> Any:
            session = self._get_or_create_session(**metadata)
            event_id = str(uuid.uuid4())
            start_time = asyncio.get_event_loop().time() * 1000
            
            # Track prompt
            session.track(PromptEvent(
                event_id=uuid.UUID(event_id),
                session_id=session.session_id,
                event_type=EventType.PROMPT,
                content=str(kwargs.get("messages", [])),
                messages=kwargs.get("messages"),
                model=kwargs.get("model"),
            ))
            
            try:
                response = original_create(*args, **kwargs)
                end_time = asyncio.get_event_loop().time() * 1000
                
                # Extract usage
                usage = response.usage
                tokens = TokenUsage(
                    prompt_tokens=usage.input_tokens if usage else 0,
                    completion_tokens=usage.output_tokens if usage else 0,
                    total_tokens=(usage.input_tokens + usage.output_tokens) if usage else 0,
                ) if usage else None
                
                # Calculate cost
                cost = None
                if tokens and response.model:
                    cost = calculate_cost(
                        response.model,
                        tokens.prompt_tokens,
                        tokens.completion_tokens,
                    )
                
                # Track response
                content = ""
                if response.content:
                    content = response.content[0].text if hasattr(response.content[0], 'text') else str(response.content[0])
                
                session.track(ResponseEvent(
                    session_id=session.session_id,
                    parent_event_id=event_id,
                    event_type=EventType.RESPONSE,
                    content=content,
                    tokens=tokens,
                    cost=cost,
                    duration_ms=int(end_time - start_time),
                    model=response.model,
                ))
                
                # Track tool use
                for block in (response.content or []):
                    if hasattr(block, 'type') and block.type == 'tool_use':
                        session.track(ToolCallEvent(
                            session_id=session.session_id,
                            parent_event_id=event_id,
                            event_type=EventType.TOOL_CALL,
                            tool_name=block.name,
                            tool_input=block.input,
                        ))
                
                return response
                
            except Exception as e:
                session.track(ErrorEvent(
                    session_id=session.session_id,
                    parent_event_id=event_id,
                    event_type=EventType.ERROR,
                    error_type=type(e).__name__,
                    error_message=str(e),
                ))
                raise
        
        # Replace the method
        client.messages.create = wrapped_create  # type: ignore
        return client
    
    def _get_or_create_session(self, **metadata: Any) -> Session:
        """Get current session or create a new one."""
        if self._current_session is None:
            self._current_session = self.start_session(**metadata)
        return self._current_session
    
    def start_session(
        self,
        session_id: str | None = None,
        user_id: str | None = None,
        feature_id: str | None = None,
        tags: list[str] | None = None,
        **metadata: Any,
    ) -> Session:
        """Start a new tracking session.
        
        Args:
            session_id: Optional custom session ID.
            user_id: User identifier.
            feature_id: Feature/flow identifier.
            tags: Tags for filtering.
            **metadata: Additional metadata.
        
        Returns:
            The new session.
        """
        session = Session(
            session_id=session_id,
            user_id=user_id,
            feature_id=feature_id,
            tags=tags,
            metadata=metadata,
        )
        
        session._set_track_callback(self.track)
        self._sessions[session.session_id] = session
        self._current_session = session
        
        # Track session start
        self.track(session.start_event())
        
        return session
    
    def track(self, event: Event | dict[str, Any]) -> None:
        """Track an event.
        
        Args:
            event: The event to track.
        """
        if self.config.disabled:
            return
        
        if isinstance(event, dict):
            event = Event(**event)
        
        # Add to buffer synchronously (thread-safe)
        self._buffer.add_sync(event)
    
    async def flush(self) -> None:
        """Flush all buffered events."""
        await self._buffer.flush()
    
    async def shutdown(self) -> None:
        """Shutdown the client and flush remaining events."""
        self._buffer.stop()
        await self.flush()
        await self._transport.close()
    
    def __enter__(self) -> "AgentOps":
        """Context manager entry."""
        self._buffer.start()
        return self
    
    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        asyncio.run(self.shutdown())
