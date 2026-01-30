"""
AgentOps SDK - Compliance Manager

PII detection, data retention, and audit logging.
"""

import re
import time
import uuid
from typing import Dict, List, Optional, Any
from .types import (
    ComplianceConfig,
    PIIDetectionResult,
    PIIMatch,
    PIIType,
    AuditLogEntry,
    AuditAction,
    DataRetentionPolicy,
    ComplianceReport,
)


# PII detection patterns
PII_PATTERNS = {
    PIIType.EMAIL: r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
    PIIType.PHONE: r'\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b',
    PIIType.SSN: r'\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b',
    PIIType.CREDIT_CARD: r'\b(?:\d{4}[-\s]?){3}\d{4}\b',
    PIIType.IP_ADDRESS: r'\b(?:\d{1,3}\.){3}\d{1,3}\b',
    PIIType.API_KEY: r'\b(?:sk|pk|api)[_-]?[A-Za-z0-9]{20,}\b',
    PIIType.PASSWORD: r'(?:password|passwd|pwd)\s*[:=]\s*[^\s]+',
}


class ComplianceManager:
    """
    Compliance and audit management for LLM operations.
    
    Provides PII detection, data retention, and audit logging
    for regulatory compliance (GDPR, HIPAA, etc.).
    """

    def __init__(self, config: Optional[ComplianceConfig] = None):
        self._config = config or ComplianceConfig()
        self._audit_log: List[AuditLogEntry] = []
        self._patterns = {**PII_PATTERNS}
        
        # Add custom patterns
        for name, pattern in self._config.custom_pii_patterns.items():
            self._patterns[PIIType.CUSTOM] = pattern

    @property
    def is_enabled(self) -> bool:
        """Check if compliance is enabled."""
        return self._config.enabled

    def scan_for_pii(self, text: str) -> PIIDetectionResult:
        """
        Scan text for PII.
        
        Args:
            text: Text to scan
            
        Returns:
            Detection result with matches
        """
        matches: List[PIIMatch] = []
        redacted_text = text
        types_found: List[PIIType] = []

        for pii_type, pattern in self._patterns.items():
            for match in re.finditer(pattern, text, re.IGNORECASE):
                value = match.group()
                redacted = self._redact_value(pii_type, value)
                
                matches.append(PIIMatch(
                    type=pii_type,
                    value=value,
                    redacted=redacted,
                    start_index=match.start(),
                    end_index=match.end(),
                    confidence=0.9,  # High confidence for regex matches
                ))
                
                if pii_type not in types_found:
                    types_found.append(pii_type)

        # Sort matches by position (reverse for redaction)
        matches.sort(key=lambda m: m.start_index, reverse=True)
        
        # Redact if configured
        if self._config.auto_redact:
            for match in matches:
                redacted_text = (
                    redacted_text[:match.start_index]
                    + match.redacted
                    + redacted_text[match.end_index:]
                )

        # Re-sort for result
        matches.sort(key=lambda m: m.start_index)

        result = PIIDetectionResult(
            original_text=text,
            redacted_text=redacted_text if self._config.auto_redact else text,
            matches=matches,
            has_pii=len(matches) > 0,
            pii_count=len(matches),
            types_found=types_found,
        )

        # Trigger callback
        if result.has_pii and self._config.on_pii_detected:
            self._config.on_pii_detected(result)

        return result

    def redact_pii(self, text: str) -> str:
        """
        Redact all PII from text.
        
        Args:
            text: Text to redact
            
        Returns:
            Redacted text
        """
        result = self.scan_for_pii(text)
        redacted = text

        # Apply redactions in reverse order to preserve indices
        for match in sorted(result.matches, key=lambda m: m.start_index, reverse=True):
            redacted = (
                redacted[:match.start_index]
                + match.redacted
                + redacted[match.end_index:]
            )

        return redacted

    def log_audit_event(
        self,
        action: AuditAction,
        resource_type: str,
        resource_id: str,
        actor_id: str,
        actor_name: str,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> AuditLogEntry:
        """
        Log an audit event.
        
        Args:
            action: Type of action
            resource_type: Type of resource (session, prompt, etc.)
            resource_id: ID of the resource
            actor_id: ID of the actor
            actor_name: Name of the actor
            details: Additional details
            ip_address: Client IP address
            user_agent: Client user agent
            session_id: Session ID if applicable
            
        Returns:
            The created audit log entry
        """
        entry = AuditLogEntry(
            id=f"audit_{uuid.uuid4().hex[:12]}",
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            actor_id=actor_id,
            actor_name=actor_name,
            details=details or {},
            ip_address=ip_address,
            user_agent=user_agent,
            timestamp=int(time.time() * 1000),
            session_id=session_id,
        )

        if self._config.audit_logging:
            self._audit_log.append(entry)

        return entry

    def get_audit_log(
        self,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        actor_id: Optional[str] = None,
        action: Optional[AuditAction] = None,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
    ) -> List[AuditLogEntry]:
        """
        Query audit log entries.
        
        Args:
            resource_type: Filter by resource type
            resource_id: Filter by resource ID
            actor_id: Filter by actor ID
            action: Filter by action type
            start_time: Filter by start time
            end_time: Filter by end time
            
        Returns:
            List of matching entries
        """
        entries = list(self._audit_log)

        if resource_type:
            entries = [e for e in entries if e.resource_type == resource_type]
        if resource_id:
            entries = [e for e in entries if e.resource_id == resource_id]
        if actor_id:
            entries = [e for e in entries if e.actor_id == actor_id]
        if action:
            entries = [e for e in entries if e.action == action]
        if start_time:
            entries = [e for e in entries if e.timestamp >= start_time]
        if end_time:
            entries = [e for e in entries if e.timestamp <= end_time]

        return sorted(entries, key=lambda e: e.timestamp, reverse=True)

    def set_retention_policy(self, policy: DataRetentionPolicy) -> None:
        """
        Set data retention policy.
        
        Args:
            policy: Retention policy configuration
        """
        self._config.retention_policy = policy

    def get_retention_policy(self) -> Optional[DataRetentionPolicy]:
        """Get current retention policy."""
        return self._config.retention_policy

    def apply_retention_policy(
        self,
        data: List[Dict[str, Any]],
        timestamp_field: str = "timestamp",
    ) -> Dict[str, Any]:
        """
        Apply retention policy to data.
        
        Args:
            data: List of records
            timestamp_field: Field containing timestamp
            
        Returns:
            Result with retained and deleted records
        """
        policy = self._config.retention_policy
        if not policy:
            return {"retained": data, "deleted": [], "archived": []}

        cutoff = int(time.time() * 1000) - (policy.retention_days * 24 * 60 * 60 * 1000)
        
        retained = []
        deleted = []
        archived = []

        for record in data:
            timestamp = record.get(timestamp_field, 0)
            record_type = record.get("type", "unknown")

            if record_type in policy.exempt_types:
                retained.append(record)
            elif timestamp < cutoff:
                if policy.archive_before_delete:
                    archived.append(record)
                deleted.append(record)
            else:
                retained.append(record)

        return {
            "retained": retained,
            "deleted": deleted,
            "archived": archived,
        }

    def generate_compliance_report(
        self,
        report_type: str,
        start_date: int,
        end_date: int,
    ) -> ComplianceReport:
        """
        Generate a compliance report.
        
        Args:
            report_type: Type of report (pii_audit, retention, access)
            start_date: Start date timestamp
            end_date: End date timestamp
            
        Returns:
            The generated report
        """
        # Filter audit log by date range
        entries = self.get_audit_log(start_time=start_date, end_time=end_date)
        
        pii_detections = 0
        data_deletions = 0
        access_events = 0
        findings = []

        for entry in entries:
            if entry.action == AuditAction.ACCESS:
                access_events += 1
            elif entry.action == AuditAction.DELETE:
                data_deletions += 1
            
            if entry.details.get("pii_detected"):
                pii_detections += 1
                findings.append({
                    "type": "pii_detection",
                    "timestamp": entry.timestamp,
                    "resource": f"{entry.resource_type}/{entry.resource_id}",
                })

        return ComplianceReport(
            id=f"report_{uuid.uuid4().hex[:12]}",
            report_type=report_type,
            start_date=start_date,
            end_date=end_date,
            total_records=len(entries),
            pii_detections=pii_detections,
            data_deletions=data_deletions,
            access_events=access_events,
            findings=findings,
        )

    def add_custom_pii_pattern(self, name: str, pattern: str) -> None:
        """
        Add a custom PII detection pattern.
        
        Args:
            name: Name for the pattern
            pattern: Regex pattern
        """
        self._config.custom_pii_patterns[name] = pattern
        # Note: Custom patterns all use CUSTOM type for simplicity

    def _redact_value(self, pii_type: PIIType, value: str) -> str:
        """Generate redacted value for PII."""
        redact_formats = {
            PIIType.EMAIL: "[REDACTED_EMAIL]",
            PIIType.PHONE: "[REDACTED_PHONE]",
            PIIType.SSN: "[REDACTED_SSN]",
            PIIType.CREDIT_CARD: "[REDACTED_CC]",
            PIIType.IP_ADDRESS: "[REDACTED_IP]",
            PIIType.NAME: "[REDACTED_NAME]",
            PIIType.ADDRESS: "[REDACTED_ADDRESS]",
            PIIType.DATE_OF_BIRTH: "[REDACTED_DOB]",
            PIIType.API_KEY: "[REDACTED_API_KEY]",
            PIIType.PASSWORD: "[REDACTED_PASSWORD]",
            PIIType.CUSTOM: "[REDACTED]",
        }
        return redact_formats.get(pii_type, "[REDACTED]")
