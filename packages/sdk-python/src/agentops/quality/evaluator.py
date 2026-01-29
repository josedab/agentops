"""Quality evaluator for AgentOps Python SDK."""

import asyncio
import json
import time
import uuid
from typing import Any

import httpx

from .types import (
    CriterionScore,
    QualityConfig,
    QualityRubric,
    QualityScore,
    DEFAULT_RUBRIC,
)


class QualityEvaluator:
    """LLM-as-judge evaluation engine for quality scoring."""

    def __init__(self, config: QualityConfig | None = None):
        self.config = config or QualityConfig()
        self._pending: dict[str, asyncio.Task[QualityScore]] = {}
        self._queue: list[dict[str, Any]] = []
        self._processing = False

    @property
    def is_enabled(self) -> bool:
        return self.config.enabled

    async def evaluate(
        self,
        event_id: str,
        session_id: str,
        prompt: str,
        response: str,
        context: str | None = None,
    ) -> QualityScore:
        """Evaluate a response quality using LLM-as-judge."""
        if not self.config.enabled:
            raise RuntimeError("Quality evaluation is not enabled")

        # Check sampling rate
        import random
        if random.random() > self.config.sampling_rate:
            return self._create_skipped_score(event_id, session_id, "Skipped due to sampling")

        # Check if already evaluating
        if event_id in self._pending:
            return await self._pending[event_id]

        # Create evaluation task
        task = asyncio.create_task(
            self._do_evaluate(event_id, session_id, prompt, response, context)
        )
        self._pending[event_id] = task

        try:
            return await task
        finally:
            self._pending.pop(event_id, None)

    def queue_evaluation(
        self,
        event_id: str,
        session_id: str,
        prompt: str,
        response: str,
        context: str | None = None,
    ) -> None:
        """Queue an evaluation for async processing."""
        if not self.config.enabled:
            return

        import random
        if random.random() > self.config.sampling_rate:
            return

        self._queue.append({
            "event_id": event_id,
            "session_id": session_id,
            "prompt": prompt,
            "response": response,
            "context": context,
        })
        asyncio.create_task(self._process_queue())

    def get_rubric(self) -> QualityRubric:
        return self.config.rubric

    def set_rubric(self, rubric: QualityRubric) -> None:
        self.config.rubric = rubric

    async def _process_queue(self) -> None:
        if self._processing:
            return
        self._processing = True

        while self._queue:
            batch = self._queue[:self.config.max_concurrent]
            self._queue = self._queue[self.config.max_concurrent:]

            await asyncio.gather(
                *[self.evaluate(**item) for item in batch],
                return_exceptions=True,
            )

        self._processing = False

    async def _do_evaluate(
        self,
        event_id: str,
        session_id: str,
        prompt: str,
        response: str,
        context: str | None,
    ) -> QualityScore:
        start_time = int(time.time() * 1000)

        try:
            evaluation_prompt = self._build_evaluation_prompt(prompt, response, context)
            raw_response = await self._call_judge_model(evaluation_prompt)
            parsed = self._parse_judge_response(raw_response)
            overall_score = self._calculate_overall_score(parsed)

            return QualityScore(
                event_id=str(uuid.uuid4()),
                session_id=session_id,
                overall_score=overall_score,
                criterion_scores=parsed,
                rubric_id=self.config.rubric.id,
                judge_model=self.config.judge_model,
                evaluated_at=int(time.time() * 1000),
                evaluation_duration_ms=int(time.time() * 1000) - start_time,
                raw_response=raw_response,
            )
        except Exception as e:
            return self._create_error_score(
                event_id,
                session_id,
                str(e),
                int(time.time() * 1000) - start_time,
            )

    def _build_evaluation_prompt(
        self,
        prompt: str,
        response: str,
        context: str | None,
    ) -> str:
        criteria_text = "\n".join(
            f"- {c.name} ({c.id}): {c.description}"
            for c in self.config.rubric.criteria
        )

        context_section = f"\n## Context\n{context}\n" if context else ""

        return f"""You are an AI response quality evaluator. Evaluate the following AI response based on the given criteria.

## Criteria
{criteria_text}

## User Prompt
{prompt}
{context_section}
## AI Response
{response}

## Instructions
For each criterion, provide:
1. A score from 1-10 (1=very poor, 10=excellent)
2. A brief reasoning (1-2 sentences)

Respond in JSON format:
{{
  "scores": [
    {{"criterionId": "accuracy", "score": 8, "reasoning": "..."}},
    {{"criterionId": "helpfulness", "score": 7, "reasoning": "..."}},
    ...
  ]
}}"""

    async def _call_judge_model(self, prompt: str) -> str:
        endpoint = self.config.judge_endpoint or "https://api.openai.com/v1/chat/completions"

        async with httpx.AsyncClient(timeout=self.config.timeout_ms / 1000) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.config.judge_api_key}",
                },
                json={
                    "model": self.config.judge_model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a quality evaluation assistant. Always respond with valid JSON.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    def _parse_judge_response(self, response: str) -> list[CriterionScore]:
        try:
            parsed = json.loads(response)
            scores = parsed.get("scores", [])
            
            return [
                CriterionScore(
                    criterion_id=str(s.get("criterionId", "")),
                    score=max(1, min(10, int(s.get("score", 5)))),
                    reasoning=str(s.get("reasoning", "No reasoning provided")),
                )
                for s in scores
            ]
        except (json.JSONDecodeError, KeyError):
            return [
                CriterionScore(
                    criterion_id=c.id,
                    score=5,
                    reasoning="Unable to parse evaluation response",
                )
                for c in self.config.rubric.criteria
            ]

    def _calculate_overall_score(self, scores: list[CriterionScore]) -> float:
        if not scores:
            return 5.0

        total_weight = 0.0
        weighted_sum = 0.0

        for score in scores:
            criterion = next(
                (c for c in self.config.rubric.criteria if c.id == score.criterion_id),
                None,
            )
            weight = criterion.weight if criterion else 1 / len(scores)
            weighted_sum += score.score * weight
            total_weight += weight

        return round(weighted_sum / total_weight, 1) if total_weight > 0 else 5.0

    def _create_skipped_score(
        self,
        event_id: str,
        session_id: str,
        reason: str,
    ) -> QualityScore:
        return QualityScore(
            event_id=str(uuid.uuid4()),
            session_id=session_id,
            overall_score=0,
            criterion_scores=[],
            rubric_id=self.config.rubric.id,
            judge_model=self.config.judge_model,
            evaluated_at=int(time.time() * 1000),
            evaluation_duration_ms=0,
            error=reason,
        )

    def _create_error_score(
        self,
        event_id: str,
        session_id: str,
        error: str,
        duration_ms: int,
    ) -> QualityScore:
        return QualityScore(
            event_id=str(uuid.uuid4()),
            session_id=session_id,
            overall_score=0,
            criterion_scores=[],
            rubric_id=self.config.rubric.id,
            judge_model=self.config.judge_model,
            evaluated_at=int(time.time() * 1000),
            evaluation_duration_ms=duration_ms,
            error=error,
        )
