"""
AgentOps SDK - Budget Manager

Cost management, budgets, and spending forecasts.
"""

import time
import uuid
from typing import Dict, List, Optional, Any
from .types import (
    BudgetConfig,
    Budget,
    BudgetPeriod,
    BudgetAlert,
    AlertSeverity,
    CostForecast,
    SpendingBreakdown,
)


# Model pricing (per 1K tokens)
MODEL_PRICING = {
    "gpt-4": {"input": 0.03, "output": 0.06},
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-4o": {"input": 0.005, "output": 0.015},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    "claude-3-opus": {"input": 0.015, "output": 0.075},
    "claude-3-sonnet": {"input": 0.003, "output": 0.015},
    "claude-3-haiku": {"input": 0.00025, "output": 0.00125},
    "claude-sonnet-4": {"input": 0.003, "output": 0.015},
}


class BudgetManager:
    """
    Budget and cost management for LLM operations.
    
    Provides budget tracking, alerts, and cost forecasting.
    """

    def __init__(self, config: Optional[BudgetConfig] = None):
        self._config = config or BudgetConfig()
        self._budgets: Dict[str, Budget] = {}
        self._alerts: List[BudgetAlert] = []
        self._spending_history: List[Dict[str, Any]] = []
        self._triggered_thresholds: Dict[str, List[float]] = {}

    @property
    def is_enabled(self) -> bool:
        """Check if budget management is enabled."""
        return self._config.enabled

    def create_budget(
        self,
        name: str,
        amount: float,
        period: BudgetPeriod,
        tags: Optional[List[str]] = None,
        model_filter: Optional[List[str]] = None,
    ) -> Budget:
        """
        Create a new budget.
        
        Args:
            name: Budget name
            amount: Budget amount in default currency
            period: Budget period (daily, weekly, etc.)
            tags: Tags for categorization
            model_filter: Models this budget applies to
            
        Returns:
            The created budget
        """
        budget_id = f"bud_{uuid.uuid4().hex[:12]}"
        
        budget = Budget(
            id=budget_id,
            name=name,
            amount=amount,
            period=period,
            spent=0.0,
            remaining=amount,
            usage_percent=0.0,
            tags=tags or [],
            model_filter=model_filter,
            is_active=True,
            created_at=int(time.time() * 1000),
        )

        self._budgets[budget_id] = budget
        self._triggered_thresholds[budget_id] = []

        return budget

    def get_budget(self, budget_id: str) -> Optional[Budget]:
        """Get a budget by ID."""
        return self._budgets.get(budget_id)

    def list_budgets(
        self,
        active_only: bool = True,
        tag: Optional[str] = None,
    ) -> List[Budget]:
        """
        List budgets.
        
        Args:
            active_only: Only return active budgets
            tag: Filter by tag
            
        Returns:
            List of matching budgets
        """
        budgets = list(self._budgets.values())

        if active_only:
            budgets = [b for b in budgets if b.is_active]
        if tag:
            budgets = [b for b in budgets if tag in b.tags]

        return budgets

    def record_spend(
        self,
        amount: float,
        model: Optional[str] = None,
        operation: Optional[str] = None,
        session_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> List[BudgetAlert]:
        """
        Record spending against budgets.
        
        Args:
            amount: Amount spent
            model: Model used
            operation: Operation type
            session_id: Session ID
            metadata: Additional metadata
            
        Returns:
            List of triggered alerts
        """
        timestamp = int(time.time() * 1000)
        
        # Record to history
        self._spending_history.append({
            "amount": amount,
            "model": model,
            "operation": operation,
            "session_id": session_id,
            "timestamp": timestamp,
            "metadata": metadata or {},
        })

        alerts = []

        # Update applicable budgets
        for budget in self._budgets.values():
            if not budget.is_active:
                continue

            # Check model filter
            if budget.model_filter and model and model not in budget.model_filter:
                continue

            # Update budget
            budget.spent += amount
            budget.remaining = max(0, budget.amount - budget.spent)
            budget.usage_percent = (budget.spent / budget.amount * 100) if budget.amount > 0 else 0

            # Check for alerts
            new_alerts = self._check_alerts(budget)
            alerts.extend(new_alerts)

        return alerts

    def calculate_cost(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
    ) -> float:
        """
        Calculate cost for token usage.
        
        Args:
            model: Model name
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            
        Returns:
            Cost in default currency
        """
        pricing = MODEL_PRICING.get(model, {"input": 0.01, "output": 0.03})
        
        input_cost = (input_tokens / 1000) * pricing["input"]
        output_cost = (output_tokens / 1000) * pricing["output"]

        return input_cost + output_cost

    def forecast_spend(
        self,
        budget_id: Optional[str] = None,
        days_ahead: int = 30,
    ) -> CostForecast:
        """
        Forecast future spending.
        
        Args:
            budget_id: Budget to forecast for (or all if None)
            days_ahead: Days to forecast
            
        Returns:
            Cost forecast
        """
        now = int(time.time() * 1000)
        day_ms = 24 * 60 * 60 * 1000
        
        # Get relevant spending history
        if budget_id:
            budget = self._budgets.get(budget_id)
            if budget and budget.model_filter:
                history = [h for h in self._spending_history if h.get("model") in budget.model_filter]
            else:
                history = self._spending_history
        else:
            history = self._spending_history

        if not history:
            return CostForecast(
                current_spend=0,
                projected_spend=0,
                projected_end_date=now + (days_ahead * day_ms),
                daily_average=0,
                trend="stable",
                confidence=0.0,
                forecast_period_days=days_ahead,
                data_points_used=0,
            )

        # Calculate daily spending
        daily_totals: Dict[int, float] = {}
        for record in history:
            day = record["timestamp"] // day_ms
            daily_totals[day] = daily_totals.get(day, 0) + record["amount"]

        daily_amounts = list(daily_totals.values())
        current_spend = sum(daily_amounts)
        
        if len(daily_amounts) == 0:
            daily_average = 0.0
        else:
            daily_average = current_spend / len(daily_amounts)

        # Determine trend
        if len(daily_amounts) >= 3:
            recent = daily_amounts[-3:]
            older = daily_amounts[:-3] if len(daily_amounts) > 3 else daily_amounts[:1]
            recent_avg = sum(recent) / len(recent)
            older_avg = sum(older) / len(older) if older else recent_avg
            
            if recent_avg > older_avg * 1.1:
                trend = "increasing"
            elif recent_avg < older_avg * 0.9:
                trend = "decreasing"
            else:
                trend = "stable"
        else:
            trend = "stable"

        projected_spend = current_spend + (daily_average * days_ahead)
        confidence = min(0.95, len(daily_amounts) / 30)  # More data = higher confidence

        return CostForecast(
            current_spend=current_spend,
            projected_spend=projected_spend,
            projected_end_date=now + (days_ahead * day_ms),
            daily_average=daily_average,
            trend=trend,
            confidence=confidence,
            forecast_period_days=days_ahead,
            data_points_used=len(history),
        )

    def get_spending_breakdown(
        self,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
    ) -> SpendingBreakdown:
        """
        Get spending breakdown by category.
        
        Args:
            start_time: Start timestamp
            end_time: End timestamp
            
        Returns:
            Spending breakdown
        """
        history = self._spending_history

        if start_time:
            history = [h for h in history if h["timestamp"] >= start_time]
        if end_time:
            history = [h for h in history if h["timestamp"] <= end_time]

        by_model: Dict[str, float] = {}
        by_operation: Dict[str, float] = {}
        by_session: Dict[str, float] = {}
        by_day: Dict[int, float] = {}
        total = 0.0

        day_ms = 24 * 60 * 60 * 1000

        for record in history:
            amount = record["amount"]
            total += amount

            model = record.get("model", "unknown")
            operation = record.get("operation", "unknown")
            session_id = record.get("session_id", "unknown")
            day = record["timestamp"] // day_ms

            by_model[model] = by_model.get(model, 0) + amount
            by_operation[operation] = by_operation.get(operation, 0) + amount
            by_session[session_id] = by_session.get(session_id, 0) + amount
            by_day[day] = by_day.get(day, 0) + amount

        return SpendingBreakdown(
            total=total,
            by_model=by_model,
            by_operation=by_operation,
            by_session=by_session,
            by_day=[{"day": d, "amount": a} for d, a in sorted(by_day.items())],
            period_start=start_time or 0,
            period_end=end_time or int(time.time() * 1000),
        )

    def get_alerts(
        self,
        budget_id: Optional[str] = None,
        unacknowledged_only: bool = False,
    ) -> List[BudgetAlert]:
        """
        Get budget alerts.
        
        Args:
            budget_id: Filter by budget
            unacknowledged_only: Only return unacknowledged alerts
            
        Returns:
            List of alerts
        """
        alerts = self._alerts

        if budget_id:
            alerts = [a for a in alerts if a.budget_id == budget_id]
        if unacknowledged_only:
            alerts = [a for a in alerts if not a.acknowledged]

        return sorted(alerts, key=lambda a: a.triggered_at, reverse=True)

    def acknowledge_alert(self, alert_id: str) -> bool:
        """
        Acknowledge an alert.
        
        Args:
            alert_id: Alert ID
            
        Returns:
            True if acknowledged, False if not found
        """
        for alert in self._alerts:
            if alert.id == alert_id:
                alert.acknowledged = True
                return True
        return False

    def update_budget(
        self,
        budget_id: str,
        amount: Optional[float] = None,
        is_active: Optional[bool] = None,
    ) -> Optional[Budget]:
        """
        Update a budget.
        
        Args:
            budget_id: Budget ID
            amount: New amount
            is_active: Active status
            
        Returns:
            Updated budget or None
        """
        budget = self._budgets.get(budget_id)
        if not budget:
            return None

        if amount is not None:
            budget.amount = amount
            budget.remaining = max(0, amount - budget.spent)
            budget.usage_percent = (budget.spent / amount * 100) if amount > 0 else 0

        if is_active is not None:
            budget.is_active = is_active

        return budget

    def delete_budget(self, budget_id: str) -> bool:
        """
        Delete a budget.
        
        Args:
            budget_id: Budget ID
            
        Returns:
            True if deleted, False if not found
        """
        if budget_id in self._budgets:
            del self._budgets[budget_id]
            return True
        return False

    def _check_alerts(self, budget: Budget) -> List[BudgetAlert]:
        """Check budget thresholds and create alerts."""
        alerts = []
        triggered = self._triggered_thresholds.get(budget.id, [])

        for threshold in self._config.alert_thresholds:
            if budget.usage_percent >= threshold and threshold not in triggered:
                # Determine severity
                if threshold >= 100:
                    severity = AlertSeverity.CRITICAL
                elif threshold >= 90:
                    severity = AlertSeverity.WARNING
                else:
                    severity = AlertSeverity.INFO

                alert = BudgetAlert(
                    id=f"alert_{uuid.uuid4().hex[:12]}",
                    budget_id=budget.id,
                    budget_name=budget.name,
                    threshold_percent=threshold,
                    current_percent=budget.usage_percent,
                    severity=severity,
                    message=f"Budget '{budget.name}' has reached {budget.usage_percent:.1f}% ({threshold}% threshold)",
                )

                self._alerts.append(alert)
                alerts.append(alert)
                triggered.append(threshold)

                # Trigger callbacks
                if self._config.on_alert:
                    self._config.on_alert(alert)

                if threshold >= 100 and self._config.on_budget_exceeded:
                    self._config.on_budget_exceeded(budget)

        self._triggered_thresholds[budget.id] = triggered
        return alerts
