"""
AgentOps SDK - Anomaly Detector

Statistical anomaly detection for LLM operations.
"""

import math
import time
import uuid
from collections import deque
from typing import Dict, List, Optional
from .types import (
    AnomalyConfig,
    MetricSnapshot,
    DetectedAnomaly,
    AnomalyType,
    AnomalySeverity,
    MetricTimeSeries,
)


class AnomalyDetector:
    """
    Real-time anomaly detection for LLM operations.
    
    Uses statistical methods (z-score, threshold) to detect anomalies
    in latency, token usage, error rates, and costs.
    """

    def __init__(self, config: Optional[AnomalyConfig] = None):
        self._config = config or AnomalyConfig()
        self._metrics: Dict[str, deque] = {
            "latency": deque(maxlen=self._config.baseline_window_size),
            "tokens_input": deque(maxlen=self._config.baseline_window_size),
            "tokens_output": deque(maxlen=self._config.baseline_window_size),
            "cost": deque(maxlen=self._config.baseline_window_size),
            "quality": deque(maxlen=self._config.baseline_window_size),
            "error_rate": deque(maxlen=self._config.baseline_window_size),
        }
        self._active_anomalies: Dict[str, DetectedAnomaly] = {}
        self._anomaly_history: List[DetectedAnomaly] = []
        self._error_count = 0
        self._total_count = 0

    @property
    def is_enabled(self) -> bool:
        """Check if anomaly detection is enabled."""
        return self._config.enabled

    def record_metrics(self, snapshot: MetricSnapshot) -> List[DetectedAnomaly]:
        """
        Record a metric snapshot and check for anomalies.
        
        Args:
            snapshot: The metric snapshot to record
            
        Returns:
            List of newly detected anomalies
        """
        if not self._config.enabled:
            return []

        detected = []
        self._total_count += 1
        
        if snapshot.error_occurred:
            self._error_count += 1

        # Record metrics
        if snapshot.latency_ms is not None:
            self._metrics["latency"].append({
                "value": snapshot.latency_ms,
                "timestamp": snapshot.timestamp,
            })
            anomaly = self._check_metric(
                "latency",
                snapshot.latency_ms,
                snapshot.timestamp,
                AnomalyType.LATENCY_SPIKE,
                threshold=self._config.latency_threshold_ms,
            )
            if anomaly:
                detected.append(anomaly)

        if snapshot.tokens_input is not None:
            self._metrics["tokens_input"].append({
                "value": snapshot.tokens_input,
                "timestamp": snapshot.timestamp,
            })
            anomaly = self._check_metric(
                "tokens_input",
                snapshot.tokens_input,
                snapshot.timestamp,
                AnomalyType.TOKEN_EXPLOSION,
                threshold=self._config.token_threshold,
            )
            if anomaly:
                detected.append(anomaly)

        if snapshot.tokens_output is not None:
            self._metrics["tokens_output"].append({
                "value": snapshot.tokens_output,
                "timestamp": snapshot.timestamp,
            })
            anomaly = self._check_metric(
                "tokens_output",
                snapshot.tokens_output,
                snapshot.timestamp,
                AnomalyType.TOKEN_EXPLOSION,
                threshold=self._config.token_threshold,
            )
            if anomaly:
                detected.append(anomaly)

        if snapshot.cost is not None:
            self._metrics["cost"].append({
                "value": snapshot.cost,
                "timestamp": snapshot.timestamp,
            })
            anomaly = self._check_metric(
                "cost",
                snapshot.cost,
                snapshot.timestamp,
                AnomalyType.COST_SURGE,
                threshold=self._config.cost_threshold,
            )
            if anomaly:
                detected.append(anomaly)

        if snapshot.quality_score is not None:
            self._metrics["quality"].append({
                "value": snapshot.quality_score,
                "timestamp": snapshot.timestamp,
            })
            # Quality degrades when it drops (invert logic)
            anomaly = self._check_quality_degradation(
                snapshot.quality_score,
                snapshot.timestamp,
            )
            if anomaly:
                detected.append(anomaly)

        # Check error rate
        if self._total_count >= 10:
            error_rate = self._error_count / self._total_count
            self._metrics["error_rate"].append({
                "value": error_rate,
                "timestamp": snapshot.timestamp,
            })
            if error_rate > self._config.error_rate_threshold:
                anomaly = self._create_anomaly(
                    AnomalyType.ERROR_RATE_INCREASE,
                    "error_rate",
                    error_rate,
                    self._config.error_rate_threshold,
                    snapshot.timestamp,
                )
                if anomaly:
                    detected.append(anomaly)

        # Trigger callback
        for anomaly in detected:
            if self._config.on_anomaly:
                self._config.on_anomaly(anomaly)

        return detected

    def get_active_anomalies(self) -> List[DetectedAnomaly]:
        """Get all currently active anomalies."""
        return list(self._active_anomalies.values())

    def resolve_anomaly(self, anomaly_id: str) -> Optional[DetectedAnomaly]:
        """
        Mark an anomaly as resolved.
        
        Args:
            anomaly_id: The ID of the anomaly to resolve
            
        Returns:
            The resolved anomaly, or None if not found
        """
        anomaly = self._active_anomalies.pop(anomaly_id, None)
        if anomaly:
            anomaly.is_active = False
            anomaly.resolved_at = int(time.time() * 1000)
        return anomaly

    def get_anomaly_history(self) -> List[DetectedAnomaly]:
        """Get historical anomalies."""
        return list(self._anomaly_history)

    def get_metric_time_series(
        self,
        metric_name: str,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
    ) -> MetricTimeSeries:
        """
        Get time series data for a metric.
        
        Args:
            metric_name: Name of the metric
            start_time: Start timestamp (ms)
            end_time: End timestamp (ms)
            
        Returns:
            Time series data with statistics
        """
        data = list(self._metrics.get(metric_name, []))
        
        # Filter by time range
        if start_time is not None:
            data = [d for d in data if d["timestamp"] >= start_time]
        if end_time is not None:
            data = [d for d in data if d["timestamp"] <= end_time]

        values = [d["value"] for d in data if d["value"] is not None]
        
        statistics = {}
        if values:
            statistics = {
                "mean": sum(values) / len(values),
                "min": min(values),
                "max": max(values),
                "count": len(values),
            }
            if len(values) > 1:
                mean = statistics["mean"]
                variance = sum((x - mean) ** 2 for x in values) / (len(values) - 1)
                statistics["std_dev"] = math.sqrt(variance)
            else:
                statistics["std_dev"] = 0.0

        return MetricTimeSeries(
            metric_name=metric_name,
            data_points=data,
            statistics=statistics,
        )

    def get_baseline(self, metric_name: str) -> Dict[str, float]:
        """
        Get baseline statistics for a metric.
        
        Args:
            metric_name: Name of the metric
            
        Returns:
            Dictionary with mean, std_dev, min, max
        """
        series = self.get_metric_time_series(metric_name)
        return series.statistics

    def clear_baseline(self, metric_name: Optional[str] = None) -> None:
        """
        Clear baseline data.
        
        Args:
            metric_name: Specific metric to clear, or all if None
        """
        if metric_name:
            if metric_name in self._metrics:
                self._metrics[metric_name].clear()
        else:
            for metric in self._metrics.values():
                metric.clear()

    def _check_metric(
        self,
        metric_name: str,
        value: float,
        timestamp: int,
        anomaly_type: AnomalyType,
        threshold: float,
    ) -> Optional[DetectedAnomaly]:
        """Check a metric for anomalies using z-score and threshold."""
        data = self._metrics.get(metric_name, [])
        
        # Need enough data for z-score
        if len(data) < 3:
            # Fall back to threshold check
            if value > threshold:
                return self._create_anomaly(
                    anomaly_type,
                    metric_name,
                    value,
                    threshold,
                    timestamp,
                )
            return None

        # Calculate z-score
        values = [d["value"] for d in data if d["value"] is not None]
        if not values:
            return None
            
        mean = sum(values) / len(values)
        if len(values) > 1:
            variance = sum((x - mean) ** 2 for x in values) / (len(values) - 1)
            std_dev = math.sqrt(variance)
        else:
            std_dev = 0.0

        # Sensitivity adjusts z-score threshold (3.0 at 0.5, 2.0 at 1.0, 4.0 at 0.0)
        z_threshold = 4.0 - (2.0 * self._config.sensitivity)
        
        if std_dev > 0:
            z_score = (value - mean) / std_dev
            if abs(z_score) > z_threshold:
                return self._create_anomaly(
                    anomaly_type,
                    metric_name,
                    value,
                    mean,
                    timestamp,
                    z_score=z_score,
                )

        # Also check hard threshold
        if value > threshold:
            return self._create_anomaly(
                anomaly_type,
                metric_name,
                value,
                threshold,
                timestamp,
            )

        return None

    def _check_quality_degradation(
        self,
        quality: float,
        timestamp: int,
    ) -> Optional[DetectedAnomaly]:
        """Check for quality score degradation."""
        data = self._metrics.get("quality", [])
        
        if len(data) < 5:
            return None

        values = [d["value"] for d in data if d["value"] is not None]
        if not values:
            return None
            
        mean = sum(values) / len(values)
        
        # Quality degradation: significant drop below mean
        threshold = mean * 0.8  # 20% degradation
        if quality < threshold:
            return self._create_anomaly(
                AnomalyType.QUALITY_DEGRADATION,
                "quality",
                quality,
                mean,
                timestamp,
            )
        return None

    def _create_anomaly(
        self,
        anomaly_type: AnomalyType,
        metric_name: str,
        observed: float,
        expected: float,
        timestamp: int,
        z_score: Optional[float] = None,
    ) -> DetectedAnomaly:
        """Create a new anomaly object."""
        anomaly_id = f"an_{uuid.uuid4().hex[:12]}"
        
        deviation = abs(observed - expected)
        if expected != 0:
            deviation_pct = (deviation / abs(expected)) * 100
        else:
            deviation_pct = 100.0

        # Determine severity
        if deviation_pct > 200 or (z_score and abs(z_score) > 4):
            severity = AnomalySeverity.CRITICAL
        elif deviation_pct > 100 or (z_score and abs(z_score) > 3):
            severity = AnomalySeverity.HIGH
        elif deviation_pct > 50 or (z_score and abs(z_score) > 2):
            severity = AnomalySeverity.MEDIUM
        else:
            severity = AnomalySeverity.LOW

        description = self._generate_description(anomaly_type, metric_name, observed, expected)
        suggested_action = self._suggest_action(anomaly_type)

        anomaly = DetectedAnomaly(
            id=anomaly_id,
            type=anomaly_type,
            severity=severity,
            metric_name=metric_name,
            observed_value=observed,
            expected_value=expected,
            deviation=deviation,
            z_score=z_score,
            detected_at=timestamp,
            is_active=True,
            description=description,
            suggested_action=suggested_action,
        )

        self._active_anomalies[anomaly_id] = anomaly
        self._anomaly_history.append(anomaly)

        return anomaly

    def _generate_description(
        self,
        anomaly_type: AnomalyType,
        metric_name: str,
        observed: float,
        expected: float,
    ) -> str:
        """Generate a human-readable description."""
        descriptions = {
            AnomalyType.LATENCY_SPIKE: f"Latency spike detected: {observed:.1f}ms vs expected {expected:.1f}ms",
            AnomalyType.TOKEN_EXPLOSION: f"Token usage anomaly in {metric_name}: {observed:.0f} vs expected {expected:.0f}",
            AnomalyType.ERROR_RATE_INCREASE: f"Error rate increased to {observed*100:.1f}% (threshold: {expected*100:.1f}%)",
            AnomalyType.COST_SURGE: f"Cost anomaly: ${observed:.4f} vs expected ${expected:.4f}",
            AnomalyType.QUALITY_DEGRADATION: f"Quality degraded to {observed:.2f} from baseline {expected:.2f}",
            AnomalyType.PATTERN_CHANGE: f"Pattern change detected in {metric_name}",
        }
        return descriptions.get(anomaly_type, f"Anomaly in {metric_name}")

    def _suggest_action(self, anomaly_type: AnomalyType) -> str:
        """Suggest remediation action."""
        actions = {
            AnomalyType.LATENCY_SPIKE: "Check for rate limiting, network issues, or model overload",
            AnomalyType.TOKEN_EXPLOSION: "Review prompt length, check for prompt injection, verify context limits",
            AnomalyType.ERROR_RATE_INCREASE: "Check API status, review error logs, verify input validation",
            AnomalyType.COST_SURGE: "Review token usage, check for runaway processes, verify rate limits",
            AnomalyType.QUALITY_DEGRADATION: "Review prompt quality, check model responses, consider prompt refinement",
            AnomalyType.PATTERN_CHANGE: "Investigate recent changes, review data patterns",
        }
        return actions.get(anomaly_type, "Investigate the anomaly")
