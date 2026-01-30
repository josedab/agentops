/**
 * AgentOps SDK - Prompt Registry
 *
 * Version-controlled storage and management of prompt templates.
 */

import type { PromptTemplate, PromptVersion } from "./types.js";
import { now } from "../utils.js";
import { nanoid } from "nanoid";

export class PromptRegistry {
  private templates: Map<string, PromptTemplate> = new Map();
  private versions: Map<string, PromptVersion[]> = new Map();

  /**
   * Register a new prompt template
   */
  register(
    name: string,
    template: string,
    options?: {
      id?: string;
      description?: string;
      tags?: string[];
      targetModel?: string;
      metadata?: Record<string, unknown>;
    },
  ): PromptTemplate {
    const id = options?.id ?? `prompt_${nanoid(12)}`;
    const variables = this.extractVariables(template);
    const timestamp = now();

    const promptTemplate: PromptTemplate = {
      id,
      name,
      template,
      variables,
      version: "1.0.0",
      description: options?.description,
      tags: options?.tags,
      targetModel: options?.targetModel,
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: options?.metadata,
    };

    this.templates.set(id, promptTemplate);
    this.versions.set(id, [
      {
        version: "1.0.0",
        template,
        createdAt: timestamp,
      },
    ]);

    return promptTemplate;
  }

  /**
   * Get a prompt template by ID
   */
  get(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get a prompt template by name
   */
  getByName(name: string): PromptTemplate | undefined {
    for (const template of this.templates.values()) {
      if (template.name === name) {
        return template;
      }
    }
    return undefined;
  }

  /**
   * List all templates
   */
  list(filter?: { tags?: string[]; targetModel?: string }): PromptTemplate[] {
    let templates = Array.from(this.templates.values());

    if (filter?.tags && filter.tags.length > 0) {
      templates = templates.filter((t) =>
        filter.tags!.some((tag) => t.tags?.includes(tag)),
      );
    }

    if (filter?.targetModel) {
      templates = templates.filter((t) => t.targetModel === filter.targetModel);
    }

    return templates;
  }

  /**
   * Update a prompt template (creates new version)
   */
  update(
    id: string,
    template: string,
    changeDescription?: string,
  ): PromptTemplate | null {
    const existing = this.templates.get(id);
    if (!existing) {
      return null;
    }

    const newVersion = this.incrementVersion(existing.version);
    const timestamp = now();

    const updated: PromptTemplate = {
      ...existing,
      template,
      variables: this.extractVariables(template),
      version: newVersion,
      updatedAt: timestamp,
    };

    this.templates.set(id, updated);

    // Add version history
    const history = this.versions.get(id) || [];
    history.push({
      version: newVersion,
      template,
      createdAt: timestamp,
      changeDescription,
    });
    this.versions.set(id, history);

    return updated;
  }

  /**
   * Get version history for a template
   */
  getVersionHistory(id: string): PromptVersion[] {
    return this.versions.get(id) || [];
  }

  /**
   * Get a specific version of a template
   */
  getVersion(id: string, version: string): PromptVersion | undefined {
    const history = this.versions.get(id);
    return history?.find((v) => v.version === version);
  }

  /**
   * Rollback to a previous version
   */
  rollback(id: string, version: string): PromptTemplate | null {
    const targetVersion = this.getVersion(id, version);
    if (!targetVersion) {
      return null;
    }

    return this.update(
      id,
      targetVersion.template,
      `Rollback to version ${version}`,
    );
  }

  /**
   * Delete a template
   */
  delete(id: string): boolean {
    const deleted = this.templates.delete(id);
    this.versions.delete(id);
    return deleted;
  }

  /**
   * Render a template with variables
   */
  render(id: string, variables: Record<string, string>): string | null {
    const template = this.templates.get(id);
    if (!template) {
      return null;
    }

    return this.renderTemplate(template.template, variables);
  }

  /**
   * Render a template string directly
   */
  renderTemplate(template: string, variables: Record<string, string>): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
      result = result.replace(pattern, value);
    }

    return result;
  }

  /**
   * Compare two versions of a template
   */
  diff(
    id: string,
    version1: string,
    version2: string,
  ): {
    added: string[];
    removed: string[];
    unchanged: string[];
  } | null {
    const v1 = this.getVersion(id, version1);
    const v2 = this.getVersion(id, version2);

    if (!v1 || !v2) {
      return null;
    }

    const lines1 = v1.template.split("\n");
    const lines2 = v2.template.split("\n");
    const set1 = new Set(lines1);
    const set2 = new Set(lines2);

    return {
      added: lines2.filter((line) => !set1.has(line)),
      removed: lines1.filter((line) => !set2.has(line)),
      unchanged: lines1.filter((line) => set2.has(line)),
    };
  }

  /**
   * Export all templates
   */
  export(): Record<string, PromptTemplate> {
    const result: Record<string, PromptTemplate> = {};
    for (const [id, template] of this.templates) {
      result[id] = template;
    }
    return result;
  }

  /**
   * Import templates
   */
  import(templates: Record<string, PromptTemplate>): void {
    for (const [id, template] of Object.entries(templates)) {
      this.templates.set(id, template);
      this.versions.set(id, [
        {
          version: template.version,
          template: template.template,
          createdAt: template.createdAt,
        },
      ]);
    }
  }

  private extractVariables(template: string): string[] {
    const pattern = /\{\{\s*(\w+)\s*\}\}/g;
    const variables: Set<string> = new Set();
    let match;

    while ((match = pattern.exec(template)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  private incrementVersion(version: string): string {
    const parts = version.split(".").map(Number);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join(".");
  }
}
