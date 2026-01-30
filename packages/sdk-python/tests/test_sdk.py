"""Tests for AgentOps Python SDK."""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime

from agentops import AgentOps, Session
from agentops.types import Event, EventType, TokenUsage
from agentops.pricing import calculate_cost, MODEL_PRICING


class TestAgentOps:
    """Tests for AgentOps client."""
    
    def test_init_with_api_key(self):
        """Should initialize with API key."""
        client = AgentOps(api_key="ao_test_key")
        assert client is not None
        assert client.config.api_key == "ao_test_key"
    
    def test_init_with_env_var(self, monkeypatch):
        """Should use environment variable for API key."""
        monkeypatch.setenv("AGENTOPS_API_KEY", "ao_env_key")
        client = AgentOps()
        assert client.config.api_key == "ao_env_key"
    
    def test_init_raises_without_key(self, monkeypatch):
        """Should raise error without API key."""
        monkeypatch.delenv("AGENTOPS_API_KEY", raising=False)
        with pytest.raises(ValueError):
            AgentOps()
    
    def test_start_session(self):
        """Should start a new session."""
        client = AgentOps(api_key="ao_test")
        session = client.start_session(
            user_id="user_123",
            feature_id="test",
        )
        
        assert isinstance(session, Session)
        assert session.user_id == "user_123"
        assert session.feature_id == "test"
    
    def test_session_id_generation(self):
        """Should generate session ID if not provided."""
        client = AgentOps(api_key="ao_test")
        session = client.start_session()
        
        assert session.session_id is not None
        assert len(session.session_id) > 0
    
    def test_disabled_mode(self):
        """Should not track when disabled."""
        client = AgentOps(api_key="ao_test", disabled=True)
        session = client.start_session()
        
        # Should still return session but not track
        assert isinstance(session, Session)


class TestSession:
    """Tests for Session class."""
    
    def test_session_metadata(self):
        """Should store session metadata."""
        session = Session(
            session_id="test_session",
            user_id="user_123",
            feature_id="chat",
            tags=["production"],
            metadata={"version": "1.0.0"},
        )
        
        assert session.session_id == "test_session"
        assert session.user_id == "user_123"
        assert session.feature_id == "chat"
        assert session.tags == ["production"]
        assert session.metadata == {"version": "1.0.0"}
    
    def test_session_start_event(self):
        """Should create start event."""
        session = Session(
            session_id="test",
            user_id="user_123",
        )
        
        event = session.start_event()
        
        assert event.event_type == EventType.SESSION_START
        assert event.session_id == "test"
        assert event.user_id == "user_123"
    
    def test_session_end_event(self):
        """Should create end event."""
        session = Session(session_id="test")
        
        event = session.end_event(status="completed")
        
        assert event.event_type == EventType.SESSION_END
        assert event.status == "completed"
        assert session.ended_at is not None
    
    def test_session_end_with_error(self):
        """Should create end event with error."""
        session = Session(session_id="test")
        
        event = session.end_event(
            status="error",
            error_message="Something went wrong"
        )
        
        assert event.status == "error"
        assert event.error_message == "Something went wrong"
    
    def test_track_event(self):
        """Should track events and update metrics."""
        session = Session(session_id="test")
        
        event = Event(
            session_id="test",
            event_type=EventType.RESPONSE,
            model="gpt-4o",
            tokens=TokenUsage(
                prompt_tokens=100,
                completion_tokens=50,
                total_tokens=150,
            ),
            cost=0.01,
        )
        
        session.track(event)
        
        assert session.event_count == 1
        assert session.total_tokens == 150
        assert session.total_cost == 0.01
        assert "gpt-4o" in session.models_used
    
    def test_track_tool(self):
        """Should track tool usage."""
        session = Session(session_id="test")
        
        session.track({
            "event_type": EventType.TOOL_CALL,
            "tool_name": "web_search",
        })
        
        assert "web_search" in session.tools_used
    
    def test_context_manager(self):
        """Should work as context manager."""
        with Session(session_id="test") as session:
            session.track({
                "event_type": EventType.PROMPT,
                "content": "Hello",
            })
        
        assert session.status == "completed"
        assert session.ended_at is not None
    
    def test_context_manager_with_error(self):
        """Should handle errors in context manager."""
        with pytest.raises(ValueError):
            with Session(session_id="test") as session:
                raise ValueError("Test error")
        
        assert session.status == "error"


class TestPricing:
    """Tests for cost calculation."""
    
    def test_gpt4o_cost(self):
        """Should calculate GPT-4o cost correctly."""
        cost = calculate_cost("gpt-4o", 1000, 500)
        
        # Input: 1000 * $0.005/1K = $0.005
        # Output: 500 * $0.015/1K = $0.0075
        # Total: $0.0125
        assert abs(cost - 0.0125) < 0.0001
    
    def test_gpt4o_mini_cost(self):
        """Should calculate GPT-4o-mini cost correctly."""
        cost = calculate_cost("gpt-4o-mini", 1000, 500)
        
        # Input: 1000 * $0.00015/1K = $0.00015
        # Output: 500 * $0.0006/1K = $0.0003
        # Total: $0.00045
        assert abs(cost - 0.00045) < 0.00001
    
    def test_claude_cost(self):
        """Should calculate Claude cost correctly."""
        cost = calculate_cost("claude-3-5-sonnet", 1000, 500)
        
        # Input: 1000 * $0.003/1K = $0.003
        # Output: 500 * $0.015/1K = $0.0075
        # Total: $0.0105
        assert abs(cost - 0.0105) < 0.0001
    
    def test_unknown_model(self):
        """Should return 0 for unknown model."""
        cost = calculate_cost("unknown-model", 1000, 500)
        assert cost == 0.0
    
    def test_zero_tokens(self):
        """Should handle zero tokens."""
        cost = calculate_cost("gpt-4o", 0, 0)
        assert cost == 0.0
    
    def test_model_pricing_exists(self):
        """Should have pricing for major models."""
        assert "gpt-4o" in MODEL_PRICING
        assert "gpt-4o-mini" in MODEL_PRICING
        assert "claude-3-5-sonnet" in MODEL_PRICING
        assert "claude-3-opus" in MODEL_PRICING


class TestEventTypes:
    """Tests for event type definitions."""
    
    def test_event_types_defined(self):
        """Should have all event types defined."""
        assert EventType.SESSION_START == "session_start"
        assert EventType.SESSION_END == "session_end"
        assert EventType.PROMPT == "prompt"
        assert EventType.RESPONSE == "response"
        assert EventType.TOOL_CALL == "tool_call"
        assert EventType.TOOL_RESULT == "tool_result"
        assert EventType.ERROR == "error"
        assert EventType.CUSTOM == "custom"
    
    def test_token_usage(self):
        """Should create token usage correctly."""
        tokens = TokenUsage(
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
        )
        
        assert tokens.prompt_tokens == 100
        assert tokens.completion_tokens == 50
        assert tokens.total_tokens == 150
    
    def test_event_creation(self):
        """Should create events correctly."""
        event = Event(
            session_id="test",
            event_type=EventType.PROMPT,
            content="Hello",
            model="gpt-4o",
        )
        
        assert event.session_id == "test"
        assert event.event_type == EventType.PROMPT
        assert event.content == "Hello"
        assert event.model == "gpt-4o"
        assert event.timestamp is not None
