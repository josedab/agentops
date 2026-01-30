"""
Type definitions for collaboration module.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, List, Any
import time


class InvestigationStatus(str, Enum):
    """Status of an investigation."""
    OPEN = "open"
    IN_PROGRESS = "in-progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class InvestigationPriority(str, Enum):
    """Priority of an investigation."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AnnotationType(str, Enum):
    """Type of annotation."""
    NOTE = "note"
    ISSUE = "issue"
    QUESTION = "question"
    HIGHLIGHT = "highlight"


class AnnotationVisibility(str, Enum):
    """Visibility of annotation."""
    PRIVATE = "private"
    TEAM = "team"
    PUBLIC = "public"


@dataclass
class TeamMember:
    """A team member."""
    id: str
    name: str
    email: str
    role: str = "member"
    avatar_url: Optional[str] = None


@dataclass
class TimelineEntry:
    """An entry in the investigation timeline."""
    id: str
    type: str
    description: str
    actor: TeamMember
    timestamp: int
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Comment:
    """A comment on an investigation or annotation."""
    id: str
    content: str
    author: TeamMember
    mentions: List[TeamMember] = field(default_factory=list)
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    reactions: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class AnnotationTarget:
    """Target of an annotation."""
    type: str  # session, event, span
    id: str


@dataclass
class AnnotationPosition:
    """Position of an annotation."""
    start: int
    end: int


@dataclass
class Annotation:
    """An annotation on a session or event."""
    id: str
    type: AnnotationType
    content: str
    target: AnnotationTarget
    author: TeamMember
    position: Optional[AnnotationPosition] = None
    mentions: List[TeamMember] = field(default_factory=list)
    visibility: AnnotationVisibility = AnnotationVisibility.TEAM
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    replies: List[Comment] = field(default_factory=list)


@dataclass
class Investigation:
    """An investigation into an issue."""
    id: str
    title: str
    description: Optional[str] = None
    status: InvestigationStatus = InvestigationStatus.OPEN
    priority: InvestigationPriority = InvestigationPriority.MEDIUM
    created_by: Optional[TeamMember] = None
    assignees: List[TeamMember] = field(default_factory=list)
    session_ids: List[str] = field(default_factory=list)
    anomaly_ids: Optional[List[str]] = None
    tags: List[str] = field(default_factory=list)
    timeline: List[TimelineEntry] = field(default_factory=list)
    comments: List[Comment] = field(default_factory=list)
    attachments: List[Dict[str, Any]] = field(default_factory=list)
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    updated_at: int = field(default_factory=lambda: int(time.time() * 1000))
    resolved_at: Optional[int] = None
    resolution: Optional[str] = None


@dataclass
class ShareableLink:
    """A shareable link to a session or investigation."""
    id: str
    type: str  # session, investigation, dashboard
    target_id: str
    access_level: str = "view"  # view, comment, edit
    expires_at: Optional[int] = None
    password: Optional[str] = None
    created_by: Optional[TeamMember] = None
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    access_count: int = 0


@dataclass
class Notification:
    """A notification for a team member."""
    id: str
    type: str  # mention, assignment, comment, status_change
    title: str
    message: str
    link: Optional[str] = None
    is_read: bool = False
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class KnowledgeArticle:
    """A knowledge base article."""
    id: str
    title: str
    content: str
    category: str
    tags: List[str] = field(default_factory=list)
    author: Optional[TeamMember] = None
    related_session_ids: Optional[List[str]] = None
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    updated_at: int = field(default_factory=lambda: int(time.time() * 1000))
    view_count: int = 0


@dataclass
class CollaborationConfig:
    """Configuration for collaboration features."""
    enabled: bool = True
    team_id: Optional[str] = None
    current_user: Optional[TeamMember] = None
    enable_notifications: bool = True
    enable_realtime: bool = False
