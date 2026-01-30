"""Prompt registry for version-controlled prompt management."""

from __future__ import annotations

import re
import time
import uuid
from typing import Any

from .types import PromptTemplate, PromptVersion


class PromptRegistry:
    """Version-controlled storage and management of prompt templates."""

    def __init__(self) -> None:
        self._templates: dict[str, PromptTemplate] = {}
        self._versions: dict[str, list[PromptVersion]] = {}

    def register(
        self,
        name: str,
        template: str,
        *,
        id: str | None = None,
        description: str | None = None,
        tags: list[str] | None = None,
        target_model: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> PromptTemplate:
        """Register a new prompt template."""
        template_id = id or f"prompt_{uuid.uuid4().hex[:12]}"
        variables = self._extract_variables(template)
        timestamp = int(time.time() * 1000)

        prompt_template = PromptTemplate(
            id=template_id,
            name=name,
            template=template,
            variables=variables,
            version="1.0.0",
            description=description,
            tags=tags or [],
            target_model=target_model,
            created_at=timestamp,
            updated_at=timestamp,
            metadata=metadata or {},
        )

        self._templates[template_id] = prompt_template
        self._versions[template_id] = [
            PromptVersion(
                version="1.0.0",
                template=template,
                created_at=timestamp,
            )
        ]

        return prompt_template

    def get(self, id: str) -> PromptTemplate | None:
        """Get a prompt template by ID."""
        return self._templates.get(id)

    def get_by_name(self, name: str) -> PromptTemplate | None:
        """Get a prompt template by name."""
        for template in self._templates.values():
            if template.name == name:
                return template
        return None

    def list(
        self,
        *,
        tags: list[str] | None = None,
        target_model: str | None = None,
    ) -> list[PromptTemplate]:
        """List all templates with optional filtering."""
        templates = list(self._templates.values())

        if tags:
            templates = [
                t for t in templates
                if any(tag in t.tags for tag in tags)
            ]

        if target_model:
            templates = [
                t for t in templates
                if t.target_model == target_model
            ]

        return templates

    def update(
        self,
        id: str,
        template: str,
        change_description: str | None = None,
    ) -> PromptTemplate | None:
        """Update a prompt template (creates new version)."""
        existing = self._templates.get(id)
        if not existing:
            return None

        new_version = self._increment_version(existing.version)
        timestamp = int(time.time() * 1000)

        updated = PromptTemplate(
            id=existing.id,
            name=existing.name,
            template=template,
            variables=self._extract_variables(template),
            version=new_version,
            description=existing.description,
            tags=existing.tags,
            target_model=existing.target_model,
            created_at=existing.created_at,
            updated_at=timestamp,
            metadata=existing.metadata,
        )

        self._templates[id] = updated

        if id not in self._versions:
            self._versions[id] = []
        self._versions[id].append(
            PromptVersion(
                version=new_version,
                template=template,
                created_at=timestamp,
                change_description=change_description,
            )
        )

        return updated

    def get_version_history(self, id: str) -> list[PromptVersion]:
        """Get version history for a template."""
        return self._versions.get(id, [])

    def get_version(self, id: str, version: str) -> PromptVersion | None:
        """Get a specific version of a template."""
        history = self._versions.get(id, [])
        for v in history:
            if v.version == version:
                return v
        return None

    def rollback(self, id: str, version: str) -> PromptTemplate | None:
        """Rollback to a previous version."""
        target_version = self.get_version(id, version)
        if not target_version:
            return None

        return self.update(id, target_version.template, f"Rollback to version {version}")

    def delete(self, id: str) -> bool:
        """Delete a template."""
        deleted = id in self._templates
        self._templates.pop(id, None)
        self._versions.pop(id, None)
        return deleted

    def render(
        self,
        id: str,
        variables: dict[str, str],
    ) -> str | None:
        """Render a template with variables."""
        template = self._templates.get(id)
        if not template:
            return None

        return self.render_template(template.template, variables)

    def render_template(
        self,
        template: str,
        variables: dict[str, str],
    ) -> str:
        """Render a template string directly."""
        result = template
        for key, value in variables.items():
            pattern = r"\{\{\s*" + re.escape(key) + r"\s*\}\}"
            result = re.sub(pattern, value, result)
        return result

    def diff(
        self,
        id: str,
        version1: str,
        version2: str,
    ) -> dict[str, list[str]] | None:
        """Compare two versions of a template."""
        v1 = self.get_version(id, version1)
        v2 = self.get_version(id, version2)

        if not v1 or not v2:
            return None

        lines1 = v1.template.split("\n")
        lines2 = v2.template.split("\n")
        set1 = set(lines1)
        set2 = set(lines2)

        return {
            "added": [line for line in lines2 if line not in set1],
            "removed": [line for line in lines1 if line not in set2],
            "unchanged": [line for line in lines1 if line in set2],
        }

    def export_all(self) -> dict[str, PromptTemplate]:
        """Export all templates."""
        return dict(self._templates)

    def import_all(self, templates: dict[str, PromptTemplate]) -> None:
        """Import templates."""
        for id, template in templates.items():
            self._templates[id] = template
            self._versions[id] = [
                PromptVersion(
                    version=template.version,
                    template=template.template,
                    created_at=template.created_at,
                )
            ]

    def _extract_variables(self, template: str) -> list[str]:
        pattern = r"\{\{\s*(\w+)\s*\}\}"
        return list(set(re.findall(pattern, template)))

    def _increment_version(self, version: str) -> str:
        parts = [int(x) for x in version.split(".")]
        parts[-1] += 1
        return ".".join(str(x) for x in parts)
