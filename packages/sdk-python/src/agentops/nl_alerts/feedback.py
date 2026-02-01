"""Feedback collection for alert quality improvement."""

import logging
from datetime import datetime
from typing import Any

from .types import AlertFeedback, FeedbackStats


logger = logging.getLogger(__name__)


class FeedbackCollector:
    """Collects and analyzes user feedback on alerts."""

    def __init__(self):
        """Initialize the feedback collector."""
        self._feedback: dict[str, list[AlertFeedback]] = {}  # rule_id -> feedback list
        self._stats_cache: dict[str, FeedbackStats] = {}

    def record_feedback(self, feedback: AlertFeedback) -> None:
        """
        Record user feedback on an alert.

        Args:
            feedback: Feedback to record
        """
        if feedback.rule_id not in self._feedback:
            self._feedback[feedback.rule_id] = []

        self._feedback[feedback.rule_id].append(feedback)

        # Invalidate stats cache
        self._stats_cache.pop(feedback.rule_id, None)

        logger.debug(f"Recorded feedback for rule {feedback.rule_id}: helpful={feedback.helpful}")

    def get_feedback(
        self,
        rule_id: str,
        limit: int | None = None,
    ) -> list[AlertFeedback]:
        """
        Get feedback for a rule.

        Args:
            rule_id: Rule ID
            limit: Optional limit on number of results

        Returns:
            List of feedback entries
        """
        feedback_list = self._feedback.get(rule_id, [])

        if limit:
            return feedback_list[-limit:]

        return feedback_list.copy()

    def get_stats(self, rule_id: str) -> FeedbackStats:
        """
        Get feedback statistics for a rule.

        Args:
            rule_id: Rule ID

        Returns:
            Feedback statistics
        """
        if rule_id in self._stats_cache:
            return self._stats_cache[rule_id]

        feedback_list = self._feedback.get(rule_id, [])

        if not feedback_list:
            return FeedbackStats()

        stats = FeedbackStats(
            total_feedback=len(feedback_list),
            helpful_count=sum(1 for f in feedback_list if f.helpful),
            not_helpful_count=sum(1 for f in feedback_list if not f.helpful),
            false_positive_count=sum(1 for f in feedback_list if f.feedback_type == "false_positive"),
            too_sensitive_count=sum(1 for f in feedback_list if f.feedback_type == "too_sensitive"),
            missed_issue_count=sum(1 for f in feedback_list if f.feedback_type == "missed_issue"),
        )

        if stats.total_feedback > 0:
            stats.helpfulness_rate = stats.helpful_count / stats.total_feedback

        self._stats_cache[rule_id] = stats
        return stats

    def get_improvement_suggestions(self, rule_id: str) -> list[str]:
        """
        Get suggestions for improving a rule based on feedback.

        Args:
            rule_id: Rule ID

        Returns:
            List of improvement suggestions
        """
        stats = self.get_stats(rule_id)
        suggestions: list[str] = []

        if stats.total_feedback < 5:
            return ["Not enough feedback to make suggestions"]

        if stats.helpfulness_rate < 0.5:
            suggestions.append("This rule has low helpfulness - consider reviewing the threshold")

        if stats.false_positive_count > stats.total_feedback * 0.3:
            suggestions.append("High false positive rate - consider increasing the threshold")

        if stats.too_sensitive_count > stats.total_feedback * 0.2:
            suggestions.append("Rule may be too sensitive - consider adjusting the time window or threshold")

        if stats.missed_issue_count > stats.total_feedback * 0.1:
            suggestions.append("Rule may be missing issues - consider lowering the threshold")

        if not suggestions:
            suggestions.append("Rule appears to be performing well based on feedback")

        return suggestions

    def should_adjust_threshold(self, rule_id: str) -> tuple[bool, float]:
        """
        Determine if a rule's threshold should be adjusted.

        Args:
            rule_id: Rule ID

        Returns:
            Tuple of (should_adjust, suggested_multiplier)
        """
        stats = self.get_stats(rule_id)

        if stats.total_feedback < 10:
            return False, 1.0

        # Calculate adjustment based on feedback patterns
        false_positive_rate = stats.false_positive_count / stats.total_feedback
        missed_issue_rate = stats.missed_issue_count / stats.total_feedback

        if false_positive_rate > 0.3:
            # Too many false positives - increase threshold
            return True, 1.2

        if missed_issue_rate > 0.2:
            # Missing too many issues - decrease threshold
            return True, 0.8

        if stats.too_sensitive_count > stats.total_feedback * 0.25:
            # Too sensitive - increase threshold slightly
            return True, 1.1

        return False, 1.0

    def clear_feedback(self, rule_id: str) -> None:
        """
        Clear all feedback for a rule.

        Args:
            rule_id: Rule ID
        """
        self._feedback.pop(rule_id, None)
        self._stats_cache.pop(rule_id, None)

    def export_feedback(
        self,
        rule_id: str | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        """
        Export feedback data.

        Args:
            rule_id: Optional specific rule ID

        Returns:
            Dictionary of rule_id -> feedback list (as dicts)
        """
        if rule_id:
            feedback_list = self._feedback.get(rule_id, [])
            return {
                rule_id: [
                    {
                        "alert_id": f.alert_id,
                        "rule_id": f.rule_id,
                        "helpful": f.helpful,
                        "feedback_type": f.feedback_type,
                        "comment": f.comment,
                        "timestamp": f.timestamp,
                    }
                    for f in feedback_list
                ]
            }

        return {
            rid: [
                {
                    "alert_id": f.alert_id,
                    "rule_id": f.rule_id,
                    "helpful": f.helpful,
                    "feedback_type": f.feedback_type,
                    "comment": f.comment,
                    "timestamp": f.timestamp,
                }
                for f in feedback_list
            ]
            for rid, feedback_list in self._feedback.items()
        }


def create_feedback_collector() -> FeedbackCollector:
    """
    Create a feedback collector.

    Returns:
        FeedbackCollector instance
    """
    return FeedbackCollector()
