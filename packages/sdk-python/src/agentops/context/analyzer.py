"""
AgentOps SDK - Context Window Analyzer

Visualizes and optimizes context window usage.
"""

import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any


# Model context limits (in tokens)
MODEL_CONTEXT_LIMITS = {
    "gpt-4": 8192,
    "gpt-4-32k": 32768,
    "gpt-4-turbo": 128000,
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-5": 256000,
    "gpt-5-mini": 128000,
    "claude-3-opus": 200000,
    "claude-3-sonnet": 200000,
    "claude-3-haiku": 200000,
    "claude-sonnet-4": 200000,
    "claude-haiku-4": 200000,
    "unknown": 8192,
}

CHARS_PER_TOKEN = 4


@dataclass
class ContextSegment:
    """A segment of the context window."""
    id: str
    type: str  # system, user, assistant, tool_result, context
    label: str
    content: str
    estimated_tokens: int
    percentage: float
    start_index: int
    end_index: int
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ContextSuggestion:
    """An optimization suggestion."""
    type: str  # compress, remove, summarize, truncate, restructure
    priority: str  # high, medium, low
    description: str
    potential_savings: int
    target_segment_id: Optional[str] = None


@dataclass
class ContextOverflowEvent:
    """A context overflow event."""
    event_id: str
    session_id: str
    model: str
    attempted_tokens: int
    context_limit: int
    overflow_amount: int
    timestamp: int


@dataclass
class ContextAnalysis:
    """Analysis result for context window usage."""
    total_tokens: int
    context_limit: int
    usage_percent: float
    is_near_limit: bool
    has_overflowed: bool
    tokens_remaining: int
    segments: List[ContextSegment]
    waste: Dict[str, Any]
    suggestions: List[ContextSuggestion]
    analyzed_at: int


@dataclass
class ContextConfig:
    """Configuration for context analyzer."""
    enabled: bool = True
    warning_threshold: float = 80.0  # percentage
    critical_threshold: float = 95.0  # percentage
    track_overflows: bool = True
    on_warning: Optional[Callable[["ContextAnalysis"], None]] = None
    on_overflow: Optional[Callable[["ContextOverflowEvent"], None]] = None


class ContextWindowAnalyzer:
    """
    Analyzes and optimizes LLM context window usage.
    
    Provides visibility into token usage, waste detection,
    and optimization suggestions.
    """

    def __init__(self, config: Optional[ContextConfig] = None):
        self._config = config or ContextConfig()
        self._overflow_history: List[ContextOverflowEvent] = []

    def analyze(
        self,
        messages: List[Dict[str, Any]],
        model: str = "gpt-4",
    ) -> ContextAnalysis:
        """
        Analyze context window usage for a set of messages.
        
        Args:
            messages: List of messages with role and content
            model: Model name for context limit lookup
            
        Returns:
            Analysis result
        """
        context_limit = self.get_context_limit(model)
        segments: List[ContextSegment] = []
        total_tokens = 0
        current_index = 0

        for i, msg in enumerate(messages):
            content = msg.get("content", "")
            tokens = self.estimate_tokens(content)
            percentage = (tokens / context_limit) * 100 if context_limit > 0 else 0

            msg_type = msg.get("role", "user")
            if msg_type == "tool":
                msg_type = "tool_result"

            segments.append(ContextSegment(
                id=f"seg_{i}",
                type=msg_type,
                label=msg.get("name") or f"{msg_type} message {i + 1}",
                content=content,
                estimated_tokens=tokens,
                percentage=percentage,
                start_index=current_index,
                end_index=current_index + len(content),
            ))

            total_tokens += tokens
            current_index += len(content)

        usage_percent = (total_tokens / context_limit) * 100 if context_limit > 0 else 0
        is_near_limit = usage_percent >= self._config.warning_threshold
        has_overflowed = total_tokens > context_limit
        tokens_remaining = max(0, context_limit - total_tokens)

        waste = self._analyze_waste(messages)
        suggestions = self._generate_suggestions(segments, waste, usage_percent, context_limit)

        analysis = ContextAnalysis(
            total_tokens=total_tokens,
            context_limit=context_limit,
            usage_percent=usage_percent,
            is_near_limit=is_near_limit,
            has_overflowed=has_overflowed,
            tokens_remaining=tokens_remaining,
            segments=segments,
            waste=waste,
            suggestions=suggestions,
            analyzed_at=int(time.time() * 1000),
        )

        # Trigger callbacks
        if is_near_limit and self._config.on_warning:
            self._config.on_warning(analysis)

        return analysis

    def check_overflow(
        self,
        current_tokens: int,
        additional_content: str,
        model: str = "gpt-4",
    ) -> Dict[str, Any]:
        """
        Check if adding content would overflow the context.
        
        Args:
            current_tokens: Current token count
            additional_content: Content to add
            model: Model name
            
        Returns:
            Dictionary with overflow check results
        """
        limit = self.get_context_limit(model)
        additional_tokens = self.estimate_tokens(additional_content)
        total_needed = current_tokens + additional_tokens

        return {
            "would_overflow": total_needed > limit,
            "tokens_needed": total_needed,
            "tokens_available": limit - current_tokens,
        }

    def record_overflow(
        self,
        session_id: str,
        model: str,
        attempted_tokens: int,
    ) -> ContextOverflowEvent:
        """
        Record a context overflow event.
        
        Args:
            session_id: Session ID
            model: Model name
            attempted_tokens: Tokens attempted
            
        Returns:
            The overflow event
        """
        context_limit = self.get_context_limit(model)
        event = ContextOverflowEvent(
            event_id=f"ovf_{uuid.uuid4().hex[:12]}",
            session_id=session_id,
            model=model,
            attempted_tokens=attempted_tokens,
            context_limit=context_limit,
            overflow_amount=attempted_tokens - context_limit,
            timestamp=int(time.time() * 1000),
        )

        if self._config.track_overflows:
            self._overflow_history.append(event)

        if self._config.on_overflow:
            self._config.on_overflow(event)

        return event

    def get_overflow_history(self) -> List[ContextOverflowEvent]:
        """Get overflow event history."""
        return list(self._overflow_history)

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count for text."""
        return len(text) // CHARS_PER_TOKEN

    def get_context_limit(self, model: str) -> int:
        """Get context limit for a model."""
        if model in MODEL_CONTEXT_LIMITS:
            return MODEL_CONTEXT_LIMITS[model]

        # Try partial match
        model_lower = model.lower()
        for key, limit in MODEL_CONTEXT_LIMITS.items():
            if key.lower() in model_lower:
                return limit

        return MODEL_CONTEXT_LIMITS["unknown"]

    def suggest_compression(
        self,
        content: str,
        target_reduction: float = 0.3,
    ) -> Dict[str, Any]:
        """
        Suggest compression for content.
        
        Args:
            content: Content to compress
            target_reduction: Target reduction percentage
            
        Returns:
            Compression result with techniques used
        """
        compressed = content
        techniques = []
        original_tokens = self.estimate_tokens(content)

        # Remove excessive whitespace
        before = compressed
        compressed = re.sub(r'\n{3,}', '\n\n', compressed)
        compressed = re.sub(r'[ \t]{2,}', ' ', compressed)
        if compressed != before:
            techniques.append("Removed excessive whitespace")

        # Remove filler phrases
        fillers = [
            r'\bplease note that\b',
            r'\bit is important to note that\b',
            r'\bas mentioned (?:earlier|above|before)\b',
            r'\bin order to\b',
        ]
        for filler in fillers:
            if re.search(filler, compressed, re.IGNORECASE):
                compressed = re.sub(filler, '', compressed, flags=re.IGNORECASE)
                techniques.append(f"Removed filler: {filler}")

        return {
            "compressed": compressed,
            "tokens_saved": original_tokens - self.estimate_tokens(compressed),
            "techniques": techniques,
        }

    def _analyze_waste(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze waste in the context."""
        duplicate_content = 0
        excessive_whitespace = 0
        redundant_instructions = 0

        content_hashes = set()

        for msg in messages:
            content = msg.get("content", "")
            
            # Check for duplicates
            content_hash = hash(content.lower().strip())
            if content_hash in content_hashes:
                duplicate_content += self.estimate_tokens(content)
            content_hashes.add(content_hash)

            # Check for excessive whitespace
            trimmed = re.sub(r'\s+', ' ', content)
            whitespace_waste = self.estimate_tokens(content) - self.estimate_tokens(trimmed)
            excessive_whitespace += whitespace_waste

        total = duplicate_content + excessive_whitespace + redundant_instructions
        all_content = "".join(msg.get("content", "") for msg in messages)
        total_tokens = self.estimate_tokens(all_content)

        return {
            "duplicate_content": duplicate_content,
            "excessive_whitespace": excessive_whitespace,
            "redundant_instructions": redundant_instructions,
            "total": total,
            "percentage": (total / total_tokens * 100) if total_tokens > 0 else 0,
        }

    def _generate_suggestions(
        self,
        segments: List[ContextSegment],
        waste: Dict[str, Any],
        usage_percent: float,
        context_limit: int,
    ) -> List[ContextSuggestion]:
        """Generate optimization suggestions."""
        suggestions = []

        if waste["duplicate_content"] > 100:
            suggestions.append(ContextSuggestion(
                type="remove",
                priority="high",
                description=f"Remove duplicate content (~{waste['duplicate_content']} tokens)",
                potential_savings=waste["duplicate_content"],
            ))

        if waste["excessive_whitespace"] > 50:
            suggestions.append(ContextSuggestion(
                type="compress",
                priority="medium",
                description=f"Compress whitespace (~{waste['excessive_whitespace']} tokens)",
                potential_savings=waste["excessive_whitespace"],
            ))

        # Check for large segments
        for seg in segments:
            if seg.percentage > 30:
                suggestions.append(ContextSuggestion(
                    type="summarize",
                    priority="high" if usage_percent > 90 else "medium",
                    description=f"Consider summarizing '{seg.label}' ({seg.estimated_tokens} tokens, {seg.percentage:.1f}%)",
                    potential_savings=seg.estimated_tokens // 2,
                    target_segment_id=seg.id,
                ))

        if usage_percent > self._config.critical_threshold:
            tokens_to_free = int((usage_percent - 80) / 100 * context_limit)
            suggestions.append(ContextSuggestion(
                type="truncate",
                priority="high",
                description=f"Free up ~{tokens_to_free} tokens to get below 80% usage",
                potential_savings=tokens_to_free,
            ))

        # Sort by priority
        priority_order = {"high": 0, "medium": 1, "low": 2}
        suggestions.sort(key=lambda s: priority_order.get(s.priority, 2))

        return suggestions
