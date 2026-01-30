"""
AgentOps SDK - Collaboration Hub

Team collaboration features for shared debugging and investigation.
"""

import time
import uuid
from typing import Dict, List, Optional, Any
from .types import (
    CollaborationConfig,
    TeamMember,
    Investigation,
    InvestigationStatus,
    InvestigationPriority,
    Annotation,
    AnnotationType,
    AnnotationTarget,
    AnnotationPosition,
    AnnotationVisibility,
    Comment,
    ShareableLink,
    Notification,
    KnowledgeArticle,
    TimelineEntry,
)


def _now() -> int:
    return int(time.time() * 1000)


def _generate_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


class CollaborationHub:
    """
    Team collaboration hub for shared debugging and investigation.
    
    Provides investigation management, annotations, sharing,
    and knowledge base features.
    """

    def __init__(self, config: Optional[CollaborationConfig] = None):
        self._config = config or CollaborationConfig()
        self._investigations: Dict[str, Investigation] = {}
        self._annotations: Dict[str, Annotation] = {}
        self._shareable_links: Dict[str, ShareableLink] = {}
        self._notifications: Dict[str, List[Notification]] = {}
        self._knowledge_base: Dict[str, KnowledgeArticle] = {}

    @property
    def is_enabled(self) -> bool:
        """Check if collaboration is enabled."""
        return self._config.enabled

    @property
    def current_user(self) -> Optional[TeamMember]:
        """Get the current user."""
        return self._config.current_user

    # =========================================================================
    # Investigation Management
    # =========================================================================

    def create_investigation(
        self,
        title: str,
        description: Optional[str] = None,
        priority: InvestigationPriority = InvestigationPriority.MEDIUM,
        session_ids: Optional[List[str]] = None,
        anomaly_ids: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        assignees: Optional[List[TeamMember]] = None,
    ) -> Investigation:
        """
        Create a new investigation.
        
        Args:
            title: Investigation title
            description: Optional description
            priority: Priority level
            session_ids: Related session IDs
            anomaly_ids: Related anomaly IDs
            tags: Tags for categorization
            assignees: Team members to assign
            
        Returns:
            The created investigation
        """
        if not self._config.current_user:
            raise RuntimeError("Current user not set")

        investigation_id = f"inv_{_generate_id()}"
        timestamp = _now()

        investigation = Investigation(
            id=investigation_id,
            title=title,
            description=description,
            status=InvestigationStatus.OPEN,
            priority=priority,
            created_by=self._config.current_user,
            assignees=assignees or [],
            session_ids=session_ids or [],
            anomaly_ids=anomaly_ids,
            tags=tags or [],
            timeline=[TimelineEntry(
                id=_generate_id(),
                type="created",
                description=f"Investigation created by {self._config.current_user.name}",
                actor=self._config.current_user,
                timestamp=timestamp,
            )],
            comments=[],
            attachments=[],
            created_at=timestamp,
            updated_at=timestamp,
        )

        self._investigations[investigation_id] = investigation
        self._notify_assignees(investigation, "assignment")

        return investigation

    def get_investigation(self, investigation_id: str) -> Optional[Investigation]:
        """Get an investigation by ID."""
        return self._investigations.get(investigation_id)

    def update_investigation_status(
        self,
        investigation_id: str,
        status: InvestigationStatus,
        resolution: Optional[str] = None,
    ) -> Optional[Investigation]:
        """
        Update investigation status.
        
        Args:
            investigation_id: Investigation ID
            status: New status
            resolution: Resolution note (for resolved status)
            
        Returns:
            The updated investigation
        """
        investigation = self._investigations.get(investigation_id)
        if not investigation or not self._config.current_user:
            return None

        investigation.status = status
        investigation.updated_at = _now()

        if status == InvestigationStatus.RESOLVED:
            investigation.resolved_at = _now()
            investigation.resolution = resolution

        investigation.timeline.append(TimelineEntry(
            id=_generate_id(),
            type="status_changed",
            description=f"Status changed to {status.value} by {self._config.current_user.name}",
            actor=self._config.current_user,
            timestamp=_now(),
            metadata={"old_status": investigation.status.value, "new_status": status.value},
        ))

        return investigation

    def add_session_to_investigation(
        self,
        investigation_id: str,
        session_id: str,
    ) -> bool:
        """Add a session to an investigation."""
        investigation = self._investigations.get(investigation_id)
        if not investigation or not self._config.current_user:
            return False

        if session_id not in investigation.session_ids:
            investigation.session_ids.append(session_id)
            investigation.updated_at = _now()
            investigation.timeline.append(TimelineEntry(
                id=_generate_id(),
                type="session_added",
                description=f"Session {session_id} added by {self._config.current_user.name}",
                actor=self._config.current_user,
                timestamp=_now(),
            ))

        return True

    def add_comment(
        self,
        investigation_id: str,
        content: str,
        mentions: Optional[List[TeamMember]] = None,
    ) -> Optional[Comment]:
        """
        Add a comment to an investigation.
        
        Args:
            investigation_id: Investigation ID
            content: Comment content
            mentions: Team members to mention
            
        Returns:
            The created comment
        """
        investigation = self._investigations.get(investigation_id)
        if not investigation or not self._config.current_user:
            return None

        comment = Comment(
            id=_generate_id(),
            content=content,
            author=self._config.current_user,
            mentions=mentions or [],
            created_at=_now(),
            reactions=[],
        )

        investigation.comments.append(comment)
        investigation.updated_at = _now()
        investigation.timeline.append(TimelineEntry(
            id=_generate_id(),
            type="comment",
            description=f"Comment added by {self._config.current_user.name}",
            actor=self._config.current_user,
            timestamp=_now(),
        ))

        # Notify mentioned users
        for mentioned in mentions or []:
            self._add_notification(mentioned.id, Notification(
                id=_generate_id(),
                type="mention",
                title="You were mentioned",
                message=f"{self._config.current_user.name} mentioned you in investigation '{investigation.title}'",
                link=f"/investigations/{investigation_id}",
            ))

        return comment

    def list_investigations(
        self,
        status: Optional[InvestigationStatus] = None,
        assignee_id: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> List[Investigation]:
        """
        List investigations with optional filters.
        
        Args:
            status: Filter by status
            assignee_id: Filter by assignee
            tag: Filter by tag
            
        Returns:
            List of matching investigations
        """
        investigations = list(self._investigations.values())

        if status:
            investigations = [i for i in investigations if i.status == status]
        if assignee_id:
            investigations = [i for i in investigations if any(a.id == assignee_id for a in i.assignees)]
        if tag:
            investigations = [i for i in investigations if tag in i.tags]

        return sorted(investigations, key=lambda i: i.updated_at, reverse=True)

    # =========================================================================
    # Annotation Management
    # =========================================================================

    def create_annotation(
        self,
        annotation_type: AnnotationType,
        content: str,
        target: AnnotationTarget,
        position: Optional[AnnotationPosition] = None,
        mentions: Optional[List[TeamMember]] = None,
        visibility: AnnotationVisibility = AnnotationVisibility.TEAM,
    ) -> Annotation:
        """
        Create an annotation.
        
        Args:
            annotation_type: Type of annotation
            content: Annotation content
            target: Target (session, event, span)
            position: Optional position in content
            mentions: Team members to mention
            visibility: Visibility level
            
        Returns:
            The created annotation
        """
        if not self._config.current_user:
            raise RuntimeError("Current user not set")

        annotation = Annotation(
            id=_generate_id("ann_"),
            type=annotation_type,
            content=content,
            target=target,
            position=position,
            author=self._config.current_user,
            mentions=mentions or [],
            visibility=visibility,
            created_at=_now(),
            replies=[],
        )

        self._annotations[annotation.id] = annotation

        # Notify mentioned users
        for mentioned in mentions or []:
            self._add_notification(mentioned.id, Notification(
                id=_generate_id(),
                type="mention",
                title="You were mentioned",
                message=f"{self._config.current_user.name} mentioned you in an annotation",
                link=f"/{target.type}s/{target.id}#annotation-{annotation.id}",
            ))

        return annotation

    def get_annotations(self, target: AnnotationTarget) -> List[Annotation]:
        """Get annotations for a target."""
        return sorted(
            [a for a in self._annotations.values() if a.target.type == target.type and a.target.id == target.id],
            key=lambda a: a.created_at,
        )

    def reply_to_annotation(
        self,
        annotation_id: str,
        content: str,
        mentions: Optional[List[TeamMember]] = None,
    ) -> Optional[Comment]:
        """Reply to an annotation."""
        annotation = self._annotations.get(annotation_id)
        if not annotation or not self._config.current_user:
            return None

        reply = Comment(
            id=_generate_id(),
            content=content,
            author=self._config.current_user,
            mentions=mentions or [],
            created_at=_now(),
            reactions=[],
        )

        annotation.replies.append(reply)
        return reply

    # =========================================================================
    # Sharing
    # =========================================================================

    def create_shareable_link(
        self,
        link_type: str,
        target_id: str,
        access_level: str = "view",
        expires_in: Optional[int] = None,
        password: Optional[str] = None,
    ) -> ShareableLink:
        """
        Create a shareable link.
        
        Args:
            link_type: Type (session, investigation, dashboard)
            target_id: Target ID
            access_level: Access level (view, comment, edit)
            expires_in: Expiration time in milliseconds
            password: Optional password
            
        Returns:
            The created link
        """
        if not self._config.current_user:
            raise RuntimeError("Current user not set")

        link = ShareableLink(
            id=_generate_id("lnk_"),
            type=link_type,
            target_id=target_id,
            access_level=access_level,
            expires_at=_now() + expires_in if expires_in else None,
            password=password,
            created_by=self._config.current_user,
            created_at=_now(),
            access_count=0,
        )

        self._shareable_links[link.id] = link
        return link

    def access_shareable_link(
        self,
        link_id: str,
        password: Optional[str] = None,
    ) -> Optional[ShareableLink]:
        """
        Access a shareable link.
        
        Args:
            link_id: Link ID
            password: Password if required
            
        Returns:
            The link if valid, None otherwise
        """
        link = self._shareable_links.get(link_id)
        if not link:
            return None

        # Check expiration
        if link.expires_at and _now() > link.expires_at:
            return None

        # Check password
        if link.password and link.password != password:
            return None

        link.access_count += 1
        return link

    # =========================================================================
    # Notifications
    # =========================================================================

    def get_notifications(
        self,
        user_id: str,
        unread_only: bool = False,
    ) -> List[Notification]:
        """Get notifications for a user."""
        notifications = self._notifications.get(user_id, [])
        if unread_only:
            return [n for n in notifications if not n.is_read]
        return notifications

    def mark_notification_read(
        self,
        user_id: str,
        notification_id: str,
    ) -> bool:
        """Mark a notification as read."""
        notifications = self._notifications.get(user_id, [])
        for notification in notifications:
            if notification.id == notification_id:
                notification.is_read = True
                return True
        return False

    # =========================================================================
    # Knowledge Base
    # =========================================================================

    def create_knowledge_article(
        self,
        title: str,
        content: str,
        category: str,
        tags: Optional[List[str]] = None,
        related_session_ids: Optional[List[str]] = None,
    ) -> KnowledgeArticle:
        """
        Create a knowledge base article.
        
        Args:
            title: Article title
            content: Article content
            category: Category
            tags: Tags
            related_session_ids: Related session IDs
            
        Returns:
            The created article
        """
        if not self._config.current_user:
            raise RuntimeError("Current user not set")

        article = KnowledgeArticle(
            id=_generate_id("kb_"),
            title=title,
            content=content,
            category=category,
            tags=tags or [],
            author=self._config.current_user,
            related_session_ids=related_session_ids,
            created_at=_now(),
            updated_at=_now(),
            view_count=0,
        )

        self._knowledge_base[article.id] = article
        return article

    def search_knowledge(self, query: str) -> List[KnowledgeArticle]:
        """
        Search the knowledge base.
        
        Args:
            query: Search query
            
        Returns:
            Matching articles
        """
        query_lower = query.lower()
        return sorted(
            [
                a for a in self._knowledge_base.values()
                if query_lower in a.title.lower()
                or query_lower in a.content.lower()
                or any(query_lower in t.lower() for t in a.tags)
            ],
            key=lambda a: a.view_count,
            reverse=True,
        )

    def get_knowledge_article(self, article_id: str) -> Optional[KnowledgeArticle]:
        """Get an article by ID."""
        article = self._knowledge_base.get(article_id)
        if article:
            article.view_count += 1
        return article

    # =========================================================================
    # Private Helpers
    # =========================================================================

    def _add_notification(self, user_id: str, notification: Notification) -> None:
        """Add a notification for a user."""
        if not self._config.enable_notifications:
            return

        if user_id not in self._notifications:
            self._notifications[user_id] = []
        self._notifications[user_id].insert(0, notification)

    def _notify_assignees(self, investigation: Investigation, notification_type: str) -> None:
        """Notify assignees of an investigation."""
        for assignee in investigation.assignees:
            if assignee.id != self._config.current_user.id if self._config.current_user else True:
                self._add_notification(assignee.id, Notification(
                    id=_generate_id(),
                    type=notification_type,
                    title="New Assignment",
                    message=f"You were assigned to investigation '{investigation.title}'",
                    link=f"/investigations/{investigation.id}",
                ))
