"""
Type definitions for compliance module.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, List, Any, Callable
import time


class PIIType(str, Enum):
    """Types of PII that can be detected."""
    EMAIL = "email"
    PHONE = "phone"
    SSN = "ssn"
    CREDIT_CARD = "credit_card"
    IP_ADDRESS = "ip_address"
    NAME = "name"
    ADDRESS = "address"
    DATE_OF_BIRTH = "date_of_birth"
    API_KEY = "api_key"
    PASSWORD = "password"
    CUSTOM = "custom"


class AuditAction(str, Enum):
    """Types of audit actions."""
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    EXPORT = "export"
    SHARE = "share"
    ACCESS = "access"


@dataclass
class PIIMatch:
    """A PII match found in content."""
    type: PIIType
    value: str
    redacted: str
    start_index: int
    end_index: int
    confidence: float


@dataclass
class PIIDetectionResult:
    """Result of PII detection."""
    original_text: str
    redacted_text: str
    matches: List[PIIMatch]
    has_pii: bool
    pii_count: int
    types_found: List[PIIType]
    scanned_at: int = field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class AuditLogEntry:
    """An audit log entry."""
    id: str
    action: AuditAction
    resource_type: str
    resource_id: str
    actor_id: str
    actor_name: str
    details: Dict[str, Any] = field(default_factory=dict)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: int = field(default_factory=lambda: int(time.time() * 1000))
    session_id: Optional[str] = None


@dataclass
class DataRetentionPolicy:
    """Data retention policy configuration."""
    retention_days: int = 90
    auto_delete: bool = True
    exempt_types: List[str] = field(default_factory=list)
    archive_before_delete: bool = True


@dataclass
class ComplianceReport:
    """A compliance report."""
    id: str
    report_type: str  # pii_audit, retention, access
    start_date: int
    end_date: int
    total_records: int
    pii_detections: int
    data_deletions: int
    access_events: int
    findings: List[Dict[str, Any]] = field(default_factory=list)
    generated_at: int = field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class ComplianceConfig:
    """Configuration for compliance features."""
    enabled: bool = True
    detect_pii: bool = True
    auto_redact: bool = False
    retention_policy: Optional[DataRetentionPolicy] = None
    audit_logging: bool = True
    custom_pii_patterns: Dict[str, str] = field(default_factory=dict)
    on_pii_detected: Optional[Callable[["PIIDetectionResult"], None]] = None
