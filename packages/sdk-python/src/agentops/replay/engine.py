"""
AgentOps SDK - Replay Engine

Session replay and what-if simulation capabilities.
"""

import time
import uuid
from typing import Dict, List, Optional, Callable, Any
from .types import (
    ReplayConfig,
    CapturedSession,
    CapturedEvent,
    SimulationResult,
    ReplayMode,
)


class ReplayEngine:
    """
    Session replay and what-if simulation engine.
    
    Captures session events and enables replay for debugging
    and simulation for cost/performance analysis.
    """

    def __init__(self, config: Optional[ReplayConfig] = None):
        self._config = config or ReplayConfig()
        self._sessions: Dict[str, CapturedSession] = {}
        self._active_capture: Optional[str] = None

    @property
    def is_enabled(self) -> bool:
        """Check if replay is enabled."""
        return self._config.enabled

    def start_capture(
        self,
        session_id: Optional[str] = None,
        name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> CapturedSession:
        """
        Start capturing a session.
        
        Args:
            session_id: Optional session ID (auto-generated if not provided)
            name: Optional name for the session
            metadata: Optional metadata
            
        Returns:
            The created session
        """
        if not self._config.capture_enabled:
            raise RuntimeError("Capture is disabled")

        session_id = session_id or f"sess_{uuid.uuid4().hex[:12]}"
        
        session = CapturedSession(
            id=session_id,
            name=name,
            events=[],
            start_time=int(time.time() * 1000),
            metadata=metadata or {},
        )

        self._sessions[session_id] = session
        self._active_capture = session_id

        # Enforce storage limit
        if len(self._sessions) > self._config.storage_limit:
            oldest_id = min(self._sessions.keys(), key=lambda k: self._sessions[k].start_time)
            del self._sessions[oldest_id]

        return session

    def capture_event(
        self,
        event_type: str,
        data: Dict[str, Any],
        session_id: Optional[str] = None,
        model: Optional[str] = None,
        latency_ms: Optional[float] = None,
        tokens_input: Optional[int] = None,
        tokens_output: Optional[int] = None,
        cost: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> CapturedEvent:
        """
        Capture an event in a session.
        
        Args:
            event_type: Type of event (prompt, response, tool_call, etc.)
            data: Event data
            session_id: Session to capture to (uses active session if not provided)
            model: Model used
            latency_ms: Latency in milliseconds
            tokens_input: Input tokens
            tokens_output: Output tokens
            cost: Cost of the event
            metadata: Additional metadata
            
        Returns:
            The captured event
        """
        target_session_id = session_id or self._active_capture
        if not target_session_id or target_session_id not in self._sessions:
            raise RuntimeError("No active capture session")

        event = CapturedEvent(
            id=f"evt_{uuid.uuid4().hex[:12]}",
            type=event_type,
            timestamp=int(time.time() * 1000),
            data=data if self._config.include_responses else {},
            model=model,
            latency_ms=latency_ms,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            cost=cost,
            metadata=metadata or {} if self._config.include_metadata else {},
        )

        self._sessions[target_session_id].events.append(event)
        return event

    def stop_capture(self, session_id: Optional[str] = None) -> CapturedSession:
        """
        Stop capturing a session.
        
        Args:
            session_id: Session to stop (uses active session if not provided)
            
        Returns:
            The completed session
        """
        target_session_id = session_id or self._active_capture
        if not target_session_id or target_session_id not in self._sessions:
            raise RuntimeError("No active capture session")

        session = self._sessions[target_session_id]
        session.end_time = int(time.time() * 1000)

        if self._active_capture == target_session_id:
            self._active_capture = None

        return session

    def get_session(self, session_id: str) -> Optional[CapturedSession]:
        """Get a captured session by ID."""
        return self._sessions.get(session_id)

    def list_sessions(
        self,
        tags: Optional[List[str]] = None,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
    ) -> List[CapturedSession]:
        """
        List captured sessions.
        
        Args:
            tags: Filter by tags
            start_time: Filter by start time
            end_time: Filter by end time
            
        Returns:
            List of matching sessions
        """
        sessions = list(self._sessions.values())

        if tags:
            sessions = [s for s in sessions if any(t in s.tags for t in tags)]
        if start_time:
            sessions = [s for s in sessions if s.start_time >= start_time]
        if end_time:
            sessions = [s for s in sessions if s.start_time <= end_time]

        return sorted(sessions, key=lambda s: s.start_time, reverse=True)

    def replay(
        self,
        session_id: str,
        mode: ReplayMode = ReplayMode.CONTINUOUS,
        speed_multiplier: float = 1.0,
        event_callback: Optional[Callable[[CapturedEvent, int], None]] = None,
    ) -> List[CapturedEvent]:
        """
        Replay a captured session.
        
        Args:
            session_id: Session to replay
            mode: Replay mode
            speed_multiplier: Speed multiplier (1.0 = real-time)
            event_callback: Callback for each event (event, delay_ms)
            
        Returns:
            List of replayed events
        """
        session = self._sessions.get(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        events = session.events
        if not events:
            return []

        replayed = []
        prev_timestamp = events[0].timestamp

        for event in events:
            delay_ms = 0
            if mode != ReplayMode.FAST_FORWARD:
                delay_ms = int((event.timestamp - prev_timestamp) / speed_multiplier)

            if event_callback:
                event_callback(event, delay_ms)
            elif self._config.on_replay_event:
                self._config.on_replay_event(event)

            replayed.append(event)
            prev_timestamp = event.timestamp

        return replayed

    def simulate(
        self,
        session_id: str,
        modifications: Optional[Dict[str, Any]] = None,
    ) -> SimulationResult:
        """
        Run a what-if simulation on a session.
        
        Args:
            session_id: Session to simulate
            modifications: Modifications to apply (e.g., {"model": "gpt-4o-mini"})
            
        Returns:
            Simulation result with cost/latency comparison
        """
        session = self._sessions.get(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        modifications = modifications or {}
        events = session.events

        # Calculate original metrics
        original_cost = sum(e.cost or 0 for e in events)
        original_latency = sum(e.latency_ms or 0 for e in events)
        original_tokens = sum((e.tokens_input or 0) + (e.tokens_output or 0) for e in events)

        # Apply modifications and calculate simulated metrics
        simulated_cost = original_cost
        simulated_latency = original_latency
        simulated_tokens = original_tokens
        events_modified = 0
        differences = []

        # Model cost multipliers (simplified)
        model_cost_multipliers = {
            "gpt-4": 1.0,
            "gpt-4-turbo": 0.5,
            "gpt-4o": 0.4,
            "gpt-4o-mini": 0.1,
            "gpt-3.5-turbo": 0.05,
            "claude-3-opus": 1.2,
            "claude-3-sonnet": 0.3,
            "claude-3-haiku": 0.05,
        }

        if "model" in modifications:
            new_model = modifications["model"]
            multiplier = model_cost_multipliers.get(new_model, 1.0)
            simulated_cost = original_cost * multiplier
            events_modified = len(events)
            differences.append({
                "type": "model_change",
                "original": "various",
                "simulated": new_model,
                "cost_impact": simulated_cost - original_cost,
            })

        if "latency_multiplier" in modifications:
            simulated_latency = original_latency * modifications["latency_multiplier"]
            differences.append({
                "type": "latency_change",
                "multiplier": modifications["latency_multiplier"],
            })

        return SimulationResult(
            session_id=session_id,
            original_cost=original_cost,
            simulated_cost=simulated_cost,
            original_latency_ms=original_latency,
            simulated_latency_ms=simulated_latency,
            original_tokens=original_tokens,
            simulated_tokens=simulated_tokens,
            events_replayed=len(events),
            events_modified=events_modified,
            differences=differences,
        )

    def delete_session(self, session_id: str) -> bool:
        """
        Delete a captured session.
        
        Args:
            session_id: Session to delete
            
        Returns:
            True if deleted, False if not found
        """
        if session_id in self._sessions:
            del self._sessions[session_id]
            return True
        return False

    def export_session(self, session_id: str) -> Dict[str, Any]:
        """
        Export a session as a dictionary.
        
        Args:
            session_id: Session to export
            
        Returns:
            Session data as dictionary
        """
        session = self._sessions.get(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        return {
            "id": session.id,
            "name": session.name,
            "start_time": session.start_time,
            "end_time": session.end_time,
            "metadata": session.metadata,
            "tags": session.tags,
            "events": [
                {
                    "id": e.id,
                    "type": e.type,
                    "timestamp": e.timestamp,
                    "data": e.data,
                    "model": e.model,
                    "latency_ms": e.latency_ms,
                    "tokens_input": e.tokens_input,
                    "tokens_output": e.tokens_output,
                    "cost": e.cost,
                    "metadata": e.metadata,
                }
                for e in session.events
            ],
        }

    def import_session(self, data: Dict[str, Any]) -> CapturedSession:
        """
        Import a session from a dictionary.
        
        Args:
            data: Session data
            
        Returns:
            The imported session
        """
        events = [
            CapturedEvent(
                id=e["id"],
                type=e["type"],
                timestamp=e["timestamp"],
                data=e.get("data", {}),
                model=e.get("model"),
                latency_ms=e.get("latency_ms"),
                tokens_input=e.get("tokens_input"),
                tokens_output=e.get("tokens_output"),
                cost=e.get("cost"),
                metadata=e.get("metadata", {}),
            )
            for e in data.get("events", [])
        ]

        session = CapturedSession(
            id=data["id"],
            name=data.get("name"),
            events=events,
            start_time=data.get("start_time", int(time.time() * 1000)),
            end_time=data.get("end_time"),
            metadata=data.get("metadata", {}),
            tags=data.get("tags", []),
        )

        self._sessions[session.id] = session
        return session
