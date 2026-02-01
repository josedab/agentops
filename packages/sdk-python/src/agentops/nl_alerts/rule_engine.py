"""Rule engine for managing and evaluating alert rules."""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any, Callable

from .types import (
    AlertChannel,
    AlertCondition,
    AlertEvent,
    AlertMetric,
    AlertRuleConfig,
    AlertSeverity,
    RuleEngineCallbacks,
    RuleEngineConfig,
)


logger = logging.getLogger(__name__)


class NLRuleEngine:
    """Engine for managing and evaluating natural language alert rules."""

    def __init__(
        self,
        config: RuleEngineConfig | None = None,
        callbacks: RuleEngineCallbacks | None = None,
        metrics_provider: Callable[[str, AlertMetric, str | None], float] | None = None,
    ):
        """
        Initialize the rule engine.

        Args:
            config: Rule engine configuration
            callbacks: Optional callbacks for rule events
            metrics_provider: Async function to fetch metric values
        """
        self._config = config or RuleEngineConfig()
        self._callbacks = callbacks or RuleEngineCallbacks()
        self._metrics_provider = metrics_provider

        self._rules: dict[str, dict[str, AlertRuleConfig]] = {}  # org_id -> rule_id -> rule
        self._last_triggered: dict[str, float] = {}  # rule_id -> timestamp
        self._evaluation_task: asyncio.Task | None = None
        self._running = False

    def add_rule(
        self,
        org_id: str,
        rule: AlertRuleConfig,
        rule_id: str | None = None,
    ) -> str:
        """
        Add an alert rule for an organization.

        Args:
            org_id: Organization ID
            rule: Alert rule configuration
            rule_id: Optional rule ID (generated if not provided)

        Returns:
            Rule ID

        Raises:
            ValueError: If max rules exceeded
        """
        if org_id not in self._rules:
            self._rules[org_id] = {}

        if len(self._rules[org_id]) >= self._config.max_rules_per_org:
            raise ValueError(
                f"Maximum rules ({self._config.max_rules_per_org}) reached for organization"
            )

        rule_id = rule_id or str(uuid.uuid4())
        self._rules[org_id][rule_id] = rule

        if self._callbacks.on_rule_added:
            self._callbacks.on_rule_added(rule_id, rule)

        return rule_id

    def remove_rule(self, org_id: str, rule_id: str) -> bool:
        """
        Remove an alert rule.

        Args:
            org_id: Organization ID
            rule_id: Rule ID to remove

        Returns:
            True if removed, False if not found
        """
        if org_id not in self._rules:
            return False

        if rule_id not in self._rules[org_id]:
            return False

        del self._rules[org_id][rule_id]
        self._last_triggered.pop(rule_id, None)

        if self._callbacks.on_rule_removed:
            self._callbacks.on_rule_removed(rule_id)

        return True

    def get_rule(self, org_id: str, rule_id: str) -> AlertRuleConfig | None:
        """
        Get a specific rule.

        Args:
            org_id: Organization ID
            rule_id: Rule ID

        Returns:
            Rule configuration or None if not found
        """
        return self._rules.get(org_id, {}).get(rule_id)

    def get_rules(self, org_id: str) -> dict[str, AlertRuleConfig]:
        """
        Get all rules for an organization.

        Args:
            org_id: Organization ID

        Returns:
            Dictionary of rule_id -> rule
        """
        return self._rules.get(org_id, {}).copy()

    def update_rule(
        self,
        org_id: str,
        rule_id: str,
        updates: dict[str, Any],
    ) -> bool:
        """
        Update an existing rule.

        Args:
            org_id: Organization ID
            rule_id: Rule ID
            updates: Fields to update

        Returns:
            True if updated, False if not found
        """
        rule = self.get_rule(org_id, rule_id)
        if rule is None:
            return False

        # Update fields
        for key, value in updates.items():
            if hasattr(rule, key):
                setattr(rule, key, value)

        return True

    async def evaluate_rules(
        self,
        org_id: str,
        metrics: dict[AlertMetric | str, float] | None = None,
    ) -> list[AlertEvent]:
        """
        Evaluate all rules for an organization.

        Args:
            org_id: Organization ID
            metrics: Optional pre-fetched metrics

        Returns:
            List of triggered alert events
        """
        events: list[AlertEvent] = []
        rules = self.get_rules(org_id)
        now = datetime.now().timestamp() * 1000

        for rule_id, rule in rules.items():
            if not rule.enabled:
                continue

            # Check cooldown
            last_triggered = self._last_triggered.get(rule_id, 0)
            cooldown_ms = rule.notification_cooldown_minutes * 60 * 1000
            if now - last_triggered < cooldown_ms:
                continue

            # Get metric value
            metric_key = rule.metric if isinstance(rule.metric, AlertMetric) else AlertMetric(rule.metric)

            if metrics and metric_key in metrics:
                metric_value = metrics[metric_key]
            elif metrics and rule.metric in metrics:
                metric_value = metrics[rule.metric]
            elif self._metrics_provider:
                metric_value = await asyncio.to_thread(
                    self._metrics_provider,
                    org_id,
                    metric_key,
                    rule.time_window.value if hasattr(rule.time_window, 'value') else rule.time_window,
                )
            else:
                continue

            # Evaluate condition
            triggered = self._evaluate_condition(
                rule.condition,
                metric_value,
                rule.threshold,
            )

            if triggered:
                event = AlertEvent(
                    rule_id=rule_id,
                    rule_config=rule,
                    triggered_at=now,
                    metric_value=metric_value,
                    threshold=rule.threshold,
                    message=self._build_alert_message(rule, metric_value),
                    metadata={
                        "org_id": org_id,
                        "user_id": rule.user_id,
                        "feature_id": rule.feature_id,
                        "model": rule.model,
                    },
                )
                events.append(event)
                self._last_triggered[rule_id] = now

                if self._callbacks.on_rule_triggered:
                    self._callbacks.on_rule_triggered(event)

        return events

    def _evaluate_condition(
        self,
        condition: AlertCondition | str,
        actual: float,
        threshold: float,
    ) -> bool:
        """Evaluate a condition against actual value."""
        cond = condition if isinstance(condition, AlertCondition) else AlertCondition(condition)

        if cond == AlertCondition.EXCEEDS:
            return actual > threshold
        elif cond == AlertCondition.FALLS_BELOW:
            return actual < threshold
        elif cond == AlertCondition.EQUALS:
            return abs(actual - threshold) < 0.001
        elif cond == AlertCondition.CHANGES_BY:
            # Would need previous value - simplified implementation
            return False
        elif cond == AlertCondition.ANOMALY:
            # Would need statistical analysis - simplified implementation
            return False

        return False

    def _build_alert_message(
        self,
        rule: AlertRuleConfig,
        actual_value: float,
    ) -> str:
        """Build a human-readable alert message."""
        metric_name = rule.metric.value if isinstance(rule.metric, AlertMetric) else rule.metric
        condition_name = rule.condition.value if isinstance(rule.condition, AlertCondition) else rule.condition

        # Format value based on metric type
        if rule.metric in (AlertMetric.COST, "cost"):
            actual_str = f"${actual_value:.2f}"
            threshold_str = f"${rule.threshold:.2f}"
        elif rule.metric in (AlertMetric.LATENCY, "latency"):
            actual_str = f"{actual_value:.0f}ms"
            threshold_str = f"{rule.threshold:.0f}ms"
        elif rule.metric in (AlertMetric.ERROR_RATE, AlertMetric.SUCCESS_RATE, "error_rate", "success_rate"):
            actual_str = f"{actual_value:.1f}%"
            threshold_str = f"{rule.threshold:.1f}%"
        else:
            actual_str = f"{actual_value:.2f}"
            threshold_str = f"{rule.threshold:.2f}"

        message = f"Alert: {metric_name} {condition_name} threshold - "
        message += f"actual: {actual_str}, threshold: {threshold_str}"

        if rule.user_id:
            message += f" (user: {rule.user_id})"
        if rule.feature_id:
            message += f" (feature: {rule.feature_id})"

        return message

    async def start_evaluation_loop(self, org_ids: list[str]) -> None:
        """
        Start the background evaluation loop.

        Args:
            org_ids: Organization IDs to evaluate
        """
        self._running = True

        while self._running:
            try:
                for org_id in org_ids:
                    events = await self.evaluate_rules(org_id)

                    if events and self._config.enable_notifications:
                        for event in events:
                            await self._send_notifications(event)

                await asyncio.sleep(self._config.evaluation_interval_seconds)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Evaluation loop error: {e}")
                await asyncio.sleep(self._config.evaluation_interval_seconds)

    def stop_evaluation_loop(self) -> None:
        """Stop the background evaluation loop."""
        self._running = False
        if self._evaluation_task:
            self._evaluation_task.cancel()

    async def _send_notifications(self, event: AlertEvent) -> None:
        """Send notifications for an alert event."""
        channels = event.rule_config.channels or self._config.default_channels

        for channel in channels:
            try:
                channel_enum = channel if isinstance(channel, AlertChannel) else AlertChannel(channel)

                if channel_enum == AlertChannel.EMAIL:
                    # Would integrate with email service
                    logger.info(f"Sending email notification: {event.message}")
                elif channel_enum == AlertChannel.SLACK:
                    # Would integrate with Slack
                    logger.info(f"Sending Slack notification: {event.message}")
                elif channel_enum == AlertChannel.WEBHOOK:
                    # Would call webhook URL
                    logger.info(f"Sending webhook notification: {event.message}")

                if self._callbacks.on_alert_sent:
                    self._callbacks.on_alert_sent(event, channel_enum)

            except Exception as e:
                logger.error(f"Failed to send notification via {channel}: {e}")


def create_rule_engine(
    config: RuleEngineConfig | None = None,
    callbacks: RuleEngineCallbacks | None = None,
    metrics_provider: Callable[[str, AlertMetric, str | None], float] | None = None,
) -> NLRuleEngine:
    """
    Create a rule engine.

    Args:
        config: Rule engine configuration
        callbacks: Optional callbacks
        metrics_provider: Function to fetch metric values

    Returns:
        NLRuleEngine instance
    """
    return NLRuleEngine(
        config=config,
        callbacks=callbacks,
        metrics_provider=metrics_provider,
    )
