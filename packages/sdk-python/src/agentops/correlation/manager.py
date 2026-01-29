"""Trace manager for multi-agent correlation."""

import random
import time
import uuid
from typing import Any
from urllib.parse import quote, unquote

from .types import (
    AgentInfo,
    CorrelationConfig,
    SpanInfo,
    TraceContext,
    TraceStats,
)


def generate_trace_id() -> str:
    """Generate a unique trace ID."""
    return f"tr_{uuid.uuid4().hex[:28]}"


def generate_span_id() -> str:
    """Generate a unique span ID."""
    return f"sp_{uuid.uuid4().hex[:16]}"


class TraceManager:
    """Manages distributed traces across multi-agent systems."""

    def __init__(self, config: CorrelationConfig | None = None):
        self.config = config or CorrelationConfig()
        self._active_spans: dict[str, SpanInfo] = {}
        self._completed_spans: dict[str, list[SpanInfo]] = {}
        self._current_context: TraceContext | None = None

        if self.config.agent is None:
            self.config.agent = AgentInfo(
                agent_id=f"agent_{int(time.time())}",
                name="default-agent",
            )

    @property
    def is_enabled(self) -> bool:
        return self.config.enabled

    @property
    def agent(self) -> AgentInfo:
        return self.config.agent  # type: ignore

    def start_trace(
        self,
        name: str,
        attributes: dict[str, Any] | None = None,
    ) -> SpanInfo:
        """Start a new trace (root span)."""
        context = self._create_root_context()
        self._current_context = context
        return self._start_span_with_context(context, name, attributes)

    def continue_trace(
        self,
        incoming_context: TraceContext,
        name: str,
        attributes: dict[str, Any] | None = None,
    ) -> SpanInfo:
        """Continue a trace from an incoming context."""
        child_context = self._create_child_context(incoming_context)
        self._current_context = child_context
        return self._start_span_with_context(child_context, name, attributes)

    def start_span(
        self,
        name: str,
        attributes: dict[str, Any] | None = None,
    ) -> SpanInfo:
        """Start a new span within the current trace."""
        if not self._current_context:
            return self.start_trace(name, attributes)

        child_context = self._create_child_context(self._current_context)
        return self._start_span_with_context(child_context, name, attributes)

    def end_span(
        self,
        span_id: str,
        status: str = "ok",
        error_message: str | None = None,
    ) -> SpanInfo | None:
        """End a span."""
        span = self._active_spans.get(span_id)
        if not span:
            return None

        span.end_time = int(time.time() * 1000)
        span.duration_ms = span.end_time - span.start_time
        span.status = status
        if error_message:
            span.error_message = error_message

        del self._active_spans[span_id]

        if span.trace_id not in self._completed_spans:
            self._completed_spans[span.trace_id] = []
        self._completed_spans[span.trace_id].append(span)

        return span

    def get_current_context(self) -> TraceContext | None:
        return self._current_context

    def set_current_context(self, context: TraceContext) -> None:
        self._current_context = context

    def inject_context(
        self,
        headers: dict[str, str] | None = None,
    ) -> dict[str, str]:
        """Inject trace context into headers for outgoing requests."""
        result = dict(headers or {})
        
        if not self._current_context:
            return result

        ctx = self._current_context
        hdrs = self.config.propagation_headers

        result[hdrs["trace_id"]] = ctx.trace_id
        result[hdrs["span_id"]] = ctx.span_id
        result[hdrs["sampled"]] = "1" if ctx.sampled else "0"

        if ctx.parent_span_id:
            result[hdrs["parent_span_id"]] = ctx.parent_span_id

        if self.config.propagate_baggage and ctx.baggage:
            baggage_entries = [
                f"{quote(k)}={quote(v)}"
                for k, v in list(ctx.baggage.items())[:self.config.max_baggage_items]
            ]
            if baggage_entries:
                result[hdrs["baggage"]] = ",".join(baggage_entries)

        return result

    def extract_context(
        self,
        headers: dict[str, str | None],
    ) -> TraceContext | None:
        """Extract trace context from incoming headers."""
        hdrs = self.config.propagation_headers

        def get_header(name: str) -> str | None:
            return headers.get(name) or headers.get(name.lower())

        trace_id = get_header(hdrs["trace_id"])
        if not trace_id:
            return None

        span_id = get_header(hdrs["span_id"]) or generate_span_id()
        parent_span_id = get_header(hdrs["parent_span_id"])
        sampled = get_header(hdrs["sampled"]) != "0"
        baggage = self._parse_baggage(get_header(hdrs["baggage"]))

        return TraceContext(
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            sampled=sampled,
            baggage=baggage,
        )

    def add_baggage(self, key: str, value: str) -> None:
        """Add a baggage item to the current context."""
        if not self._current_context:
            return

        if len(self._current_context.baggage) >= self.config.max_baggage_items:
            return

        self._current_context.baggage[key] = value

    def get_baggage(self, key: str) -> str | None:
        """Get a baggage item from the current context."""
        if not self._current_context:
            return None
        return self._current_context.baggage.get(key)

    def get_trace_stats(self, trace_id: str) -> TraceStats | None:
        """Get statistics for a trace."""
        spans = self._completed_spans.get(trace_id)
        if not spans:
            return None

        agent_stats: dict[str, dict[str, int]] = {}
        agents: set[str] = set()
        error_count = 0
        total_duration_ms = 0

        for span in spans:
            agents.add(span.agent_id)

            if span.agent_id not in agent_stats:
                agent_stats[span.agent_id] = {
                    "span_count": 0,
                    "total_duration_ms": 0,
                    "error_count": 0,
                }

            agent_stats[span.agent_id]["span_count"] += 1
            agent_stats[span.agent_id]["total_duration_ms"] += span.duration_ms or 0

            if span.status == "error":
                agent_stats[span.agent_id]["error_count"] += 1
                error_count += 1

            end = span.end_time or 0
            total_duration_ms = max(total_duration_ms, end - spans[0].start_time)

        return TraceStats(
            span_count=len(spans),
            agent_count=len(agents),
            total_duration_ms=total_duration_ms,
            critical_path_ms=self._calculate_critical_path(spans),
            error_count=error_count,
            agent_stats=agent_stats,
        )

    def get_trace_spans(self, trace_id: str) -> list[SpanInfo]:
        return self._completed_spans.get(trace_id, [])

    def clear_trace(self, trace_id: str) -> None:
        self._completed_spans.pop(trace_id, None)

    def _create_root_context(self) -> TraceContext:
        sampled = random.random() < self.config.sampling_rate
        return TraceContext(
            trace_id=generate_trace_id(),
            span_id=generate_span_id(),
            sampled=sampled,
            baggage={},
        )

    def _create_child_context(self, parent: TraceContext) -> TraceContext:
        return TraceContext(
            trace_id=parent.trace_id,
            span_id=generate_span_id(),
            parent_span_id=parent.span_id,
            sampled=parent.sampled,
            baggage=dict(parent.baggage),
        )

    def _start_span_with_context(
        self,
        context: TraceContext,
        name: str,
        attributes: dict[str, Any] | None,
    ) -> SpanInfo:
        span = SpanInfo(
            span_id=context.span_id,
            parent_span_id=context.parent_span_id,
            trace_id=context.trace_id,
            name=name,
            agent_id=self.agent.agent_id,
            start_time=int(time.time() * 1000),
            status="in_progress",
            attributes=attributes or {},
        )

        self._active_spans[span.span_id] = span
        self._current_context = context

        return span

    def _parse_baggage(self, baggage_str: str | None) -> dict[str, str]:
        if not baggage_str:
            return {}

        result: dict[str, str] = {}
        for entry in baggage_str.split(",")[:self.config.max_baggage_items]:
            parts = entry.split("=", 1)
            if len(parts) == 2:
                try:
                    result[unquote(parts[0].strip())] = unquote(parts[1].strip())
                except Exception:
                    pass
        return result

    def _calculate_critical_path(self, spans: list[SpanInfo]) -> int:
        if not spans:
            return 0

        span_map = {s.span_id: s for s in spans}
        children: dict[str, list[SpanInfo]] = {}
        root_span: SpanInfo | None = None

        for span in spans:
            if not span.parent_span_id:
                root_span = span
            else:
                if span.parent_span_id not in children:
                    children[span.parent_span_id] = []
                children[span.parent_span_id].append(span)

        if not root_span:
            return max(s.duration_ms or 0 for s in spans)

        def find_longest_path(span: SpanInfo) -> int:
            child_spans = children.get(span.span_id, [])
            if not child_spans:
                return span.duration_ms or 0

            max_child = max(find_longest_path(c) for c in child_spans)
            return (span.duration_ms or 0) + max_child

        return find_longest_path(root_span)
