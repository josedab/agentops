"""AgentOps HTTP transport."""

import asyncio
import logging
from typing import Any

import httpx

from agentops.types import Event

logger = logging.getLogger("agentops")


class HttpTransport:
    """HTTP transport for sending events to AgentOps."""
    
    def __init__(
        self,
        endpoint: str,
        api_key: str,
        timeout: float = 30.0,
        max_retries: int = 3,
    ):
        """Initialize the transport.
        
        Args:
            endpoint: The ingestion endpoint URL.
            api_key: The API key for authentication.
            timeout: Request timeout in seconds.
            max_retries: Maximum retry attempts.
        """
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        
        self._client: httpx.AsyncClient | None = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "agentops-python/0.1.0",
                },
            )
        return self._client
    
    async def send(self, events: list[Event]) -> bool:
        """Send a batch of events.
        
        Args:
            events: List of events to send.
        
        Returns:
            True if successful, False otherwise.
        """
        if not events:
            return True
        
        client = await self._get_client()
        payload = [event.model_dump(mode="json", exclude_none=True) for event in events]
        
        for attempt in range(self.max_retries):
            try:
                response = await client.post(
                    f"{self.endpoint}/v1/events",
                    json={"events": payload},
                )
                
                if response.status_code == 200:
                    logger.debug(f"Successfully sent {len(events)} events")
                    return True
                elif response.status_code == 429:
                    # Rate limited, wait and retry
                    retry_after = int(response.headers.get("Retry-After", "1"))
                    logger.warning(f"Rate limited, retrying in {retry_after}s")
                    await asyncio.sleep(retry_after)
                else:
                    logger.error(f"Failed to send events: {response.status_code} - {response.text}")
                    
            except httpx.TimeoutException:
                logger.warning(f"Request timed out, attempt {attempt + 1}/{self.max_retries}")
            except httpx.RequestError as e:
                logger.error(f"Request error: {e}")
            
            # Exponential backoff
            if attempt < self.max_retries - 1:
                await asyncio.sleep(2 ** attempt)
        
        return False
    
    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


class EventBuffer:
    """Buffer for batching events before sending."""
    
    def __init__(
        self,
        max_size: int = 100,
        flush_interval: float = 1.0,
        on_flush: Any = None,
    ):
        """Initialize the buffer.
        
        Args:
            max_size: Maximum events before auto-flush.
            flush_interval: Time between auto-flushes in seconds.
            on_flush: Callback when flushing (receives list of events).
        """
        import threading
        
        self.max_size = max_size
        self.flush_interval = flush_interval
        self.on_flush = on_flush
        
        self._buffer: list[Event] = []
        self._lock = asyncio.Lock()
        self._sync_lock = threading.Lock()
        self._flush_task: asyncio.Task[None] | None = None
        self._running = False
    
    def start(self) -> None:
        """Start the auto-flush background task."""
        if self._running:
            return
        self._running = True
        self._flush_task = asyncio.create_task(self._auto_flush_loop())
    
    def stop(self) -> None:
        """Stop the auto-flush background task."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            self._flush_task = None
    
    async def _auto_flush_loop(self) -> None:
        """Background task for periodic flushing."""
        while self._running:
            await asyncio.sleep(self.flush_interval)
            await self.flush()
    
    async def add(self, event: Event) -> None:
        """Add an event to the buffer.
        
        Args:
            event: The event to buffer.
        """
        async with self._lock:
            self._buffer.append(event)
            
            if len(self._buffer) >= self.max_size:
                await self._do_flush()
    
    def add_sync(self, event: Event) -> None:
        """Add an event to the buffer synchronously (thread-safe).
        
        Args:
            event: The event to buffer.
        """
        with self._sync_lock:
            self._buffer.append(event)
    
    async def add_all(self, events: list[Event]) -> None:
        """Add multiple events to the buffer.
        
        Args:
            events: The events to buffer.
        """
        async with self._lock:
            self._buffer.extend(events)
            
            if len(self._buffer) >= self.max_size:
                await self._do_flush()
    
    async def flush(self) -> list[Event]:
        """Flush all buffered events.
        
        Returns:
            The flushed events.
        """
        async with self._lock:
            return await self._do_flush()
    
    async def _do_flush(self) -> list[Event]:
        """Internal flush implementation (must be called with lock held)."""
        if not self._buffer:
            return []
        
        events = self._buffer.copy()
        self._buffer.clear()
        
        if self.on_flush:
            await self.on_flush(events)
        
        return events
    
    def drain(self) -> list[Event]:
        """Synchronously drain all buffered events.
        
        Returns:
            The drained events.
        """
        events = self._buffer.copy()
        self._buffer.clear()
        return events
