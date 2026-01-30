/**
 * AgentOps SDK - Enhanced Prompt Version Control
 *
 * Git-like version control for prompts with branches, tags, and diffs.
 */

import type { PromptTemplate } from "./types.js";
import { now } from "../utils.js";
import { nanoid } from "nanoid";

// ============================================================================
// Types
// ============================================================================

export interface PromptBranch {
  name: string;
  headVersion: string;
  createdAt: number;
  createdFrom?: string;
  description?: string;
}

export interface PromptTag {
  name: string;
  version: string;
  promptId: string;
  createdAt: number;
  message?: string;
}

export interface VersionDiff {
  fromVersion: string;
  toVersion: string;
  additions: DiffLine[];
  deletions: DiffLine[];
  unchanged: DiffLine[];
  stats: {
    linesAdded: number;
    linesDeleted: number;
    linesChanged: number;
    tokenDelta: number;
  };
}

export interface DiffLine {
  lineNumber: number;
  content: string;
  type: "add" | "delete" | "unchanged";
}

export interface VersionedPrompt extends Omit<PromptTemplate, "tags"> {
  /** Category tags for the prompt */
  categoryTags?: string[];
  /** Branch information */
  branches: Map<string, PromptBranch>;
  currentBranch: string;
  /** Version tags (releases) */
  versionTags: Map<string, PromptTag>;
  commits: PromptCommit[];
}

export interface PromptCommit {
  id: string;
  version: string;
  parentVersion?: string;
  branch: string;
  message: string;
  author?: string;
  timestamp: number;
  template: string;
  metadata?: Record<string, unknown>;
}

export interface MergeResult {
  success: boolean;
  conflicts?: MergeConflict[];
  mergedTemplate?: string;
  mergedVersion?: string;
}

export interface MergeConflict {
  lineNumber: number;
  ours: string;
  theirs: string;
  base?: string;
}

// ============================================================================
// Version Control Registry
// ============================================================================

export class VersionControlledRegistry {
  private prompts: Map<string, VersionedPrompt> = new Map();

  /**
   * Create a new versioned prompt
   */
  create(
    name: string,
    template: string,
    options?: {
      id?: string;
      description?: string;
      tags?: string[];
      author?: string;
      commitMessage?: string;
    },
  ): VersionedPrompt {
    const id = options?.id ?? `prompt_${nanoid(12)}`;
    const timestamp = now();
    const version = "1.0.0";
    const commitId = `commit_${nanoid(8)}`;

    const prompt: VersionedPrompt = {
      id,
      name,
      template,
      variables: this.extractVariables(template),
      version,
      description: options?.description,
      categoryTags: options?.tags,
      createdAt: timestamp,
      updatedAt: timestamp,
      branches: new Map([
        [
          "main",
          {
            name: "main",
            headVersion: version,
            createdAt: timestamp,
          },
        ],
      ]),
      currentBranch: "main",
      versionTags: new Map(),
      commits: [
        {
          id: commitId,
          version,
          branch: "main",
          message: options?.commitMessage ?? "Initial commit",
          author: options?.author,
          timestamp,
          template,
        },
      ],
    };

    this.prompts.set(id, prompt);
    return prompt;
  }

  /**
   * Get a prompt by ID
   */
  get(id: string): VersionedPrompt | undefined {
    return this.prompts.get(id);
  }

  /**
   * List all prompts
   */
  list(): VersionedPrompt[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Commit changes to a prompt (creates new version)
   */
  commit(
    id: string,
    template: string,
    message: string,
    options?: {
      author?: string;
      branch?: string;
      metadata?: Record<string, unknown>;
    },
  ): PromptCommit | null {
    const prompt = this.prompts.get(id);
    if (!prompt) return null;

    const branch = options?.branch ?? prompt.currentBranch;
    const branchInfo = prompt.branches.get(branch);
    if (!branchInfo) return null;

    const parentVersion = branchInfo.headVersion;
    const newVersion = this.incrementVersion(parentVersion);
    const timestamp = now();
    const commitId = `commit_${nanoid(8)}`;

    const commit: PromptCommit = {
      id: commitId,
      version: newVersion,
      parentVersion,
      branch,
      message,
      author: options?.author,
      timestamp,
      template,
      metadata: options?.metadata,
    };

    prompt.commits.push(commit);
    branchInfo.headVersion = newVersion;

    // Update prompt if on current branch
    if (branch === prompt.currentBranch) {
      prompt.template = template;
      prompt.version = newVersion;
      prompt.variables = this.extractVariables(template);
      prompt.updatedAt = timestamp;
    }

    return commit;
  }

  /**
   * Create a new branch
   */
  createBranch(
    id: string,
    branchName: string,
    options?: {
      fromBranch?: string;
      description?: string;
    },
  ): PromptBranch | null {
    const prompt = this.prompts.get(id);
    if (!prompt) return null;

    if (prompt.branches.has(branchName)) {
      return null; // Branch already exists
    }

    const fromBranch = options?.fromBranch ?? prompt.currentBranch;
    const sourceBranch = prompt.branches.get(fromBranch);
    if (!sourceBranch) return null;

    const branch: PromptBranch = {
      name: branchName,
      headVersion: sourceBranch.headVersion,
      createdAt: now(),
      createdFrom: fromBranch,
      description: options?.description,
    };

    prompt.branches.set(branchName, branch);
    return branch;
  }

  /**
   * Switch to a different branch
   */
  checkout(id: string, branchName: string): boolean {
    const prompt = this.prompts.get(id);
    if (!prompt) return false;

    const branch = prompt.branches.get(branchName);
    if (!branch) return false;

    // Find the commit for this branch's head
    const headCommit =
      prompt.commits.find(
        (c) => c.version === branch.headVersion && c.branch === branchName,
      ) ?? prompt.commits.find((c) => c.version === branch.headVersion);

    if (!headCommit) return false;

    prompt.currentBranch = branchName;
    prompt.template = headCommit.template;
    prompt.version = headCommit.version;
    prompt.variables = this.extractVariables(headCommit.template);

    return true;
  }

  /**
   * List all branches for a prompt
   */
  listBranches(id: string): PromptBranch[] {
    const prompt = this.prompts.get(id);
    if (!prompt) return [];
    return Array.from(prompt.branches.values());
  }

  /**
   * Delete a branch
   */
  deleteBranch(id: string, branchName: string): boolean {
    const prompt = this.prompts.get(id);
    if (!prompt) return false;

    if (branchName === "main" || branchName === prompt.currentBranch) {
      return false; // Can't delete main or current branch
    }

    return prompt.branches.delete(branchName);
  }

  /**
   * Create a tag for a specific version
   */
  tag(
    id: string,
    tagName: string,
    options?: {
      version?: string;
      message?: string;
    },
  ): PromptTag | null {
    const prompt = this.prompts.get(id);
    if (!prompt) return null;

    if (prompt.versionTags.has(tagName)) {
      return null; // Tag already exists
    }

    const version = options?.version ?? prompt.version;
    const commit = prompt.commits.find((c) => c.version === version);
    if (!commit) return null;

    const tag: PromptTag = {
      name: tagName,
      version,
      promptId: id,
      createdAt: now(),
      message: options?.message,
    };

    prompt.versionTags.set(tagName, tag);
    return tag;
  }

  /**
   * Get all tags for a prompt
   */
  listTags(id: string): PromptTag[] {
    const prompt = this.prompts.get(id);
    if (!prompt) return [];
    return Array.from(prompt.versionTags.values());
  }

  /**
   * Delete a tag
   */
  deleteTag(id: string, tagName: string): boolean {
    const prompt = this.prompts.get(id);
    if (!prompt) return false;
    return prompt.versionTags.delete(tagName);
  }

  /**
   * Checkout a specific version or tag
   */
  checkoutVersion(id: string, versionOrTag: string): boolean {
    const prompt = this.prompts.get(id);
    if (!prompt) return false;

    // Check if it's a tag
    const tag = prompt.versionTags.get(versionOrTag);
    const version = tag?.version ?? versionOrTag;

    const commit = prompt.commits.find((c) => c.version === version);
    if (!commit) return false;

    prompt.template = commit.template;
    prompt.version = commit.version;
    prompt.variables = this.extractVariables(commit.template);

    return true;
  }

  /**
   * Get commit history
   */
  getHistory(
    id: string,
    options?: {
      branch?: string;
      limit?: number;
    },
  ): PromptCommit[] {
    const prompt = this.prompts.get(id);
    if (!prompt) return [];

    let commits = [...prompt.commits];

    if (options?.branch) {
      commits = commits.filter((c) => c.branch === options.branch);
    }

    commits.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit) {
      commits = commits.slice(0, options.limit);
    }

    return commits;
  }

  /**
   * Get a specific commit
   */
  getCommit(id: string, commitId: string): PromptCommit | undefined {
    const prompt = this.prompts.get(id);
    if (!prompt) return undefined;
    return prompt.commits.find((c) => c.id === commitId);
  }

  /**
   * Generate diff between two versions
   */
  diff(id: string, fromVersion: string, toVersion: string): VersionDiff | null {
    const prompt = this.prompts.get(id);
    if (!prompt) return null;

    const fromCommit = prompt.commits.find((c) => c.version === fromVersion);
    const toCommit = prompt.commits.find((c) => c.version === toVersion);
    if (!fromCommit || !toCommit) return null;

    const fromLines = fromCommit.template.split("\n");
    const toLines = toCommit.template.split("\n");

    const { additions, deletions, unchanged } = this.computeLineDiff(
      fromLines,
      toLines,
    );

    const fromTokens = this.estimateTokens(fromCommit.template);
    const toTokens = this.estimateTokens(toCommit.template);

    return {
      fromVersion,
      toVersion,
      additions,
      deletions,
      unchanged,
      stats: {
        linesAdded: additions.length,
        linesDeleted: deletions.length,
        linesChanged: Math.min(additions.length, deletions.length),
        tokenDelta: toTokens - fromTokens,
      },
    };
  }

  /**
   * Merge a branch into the current branch
   */
  merge(
    id: string,
    sourceBranch: string,
    options?: {
      strategy?: "ours" | "theirs" | "manual";
      message?: string;
      author?: string;
    },
  ): MergeResult {
    const prompt = this.prompts.get(id);
    if (!prompt) {
      return { success: false };
    }

    const source = prompt.branches.get(sourceBranch);
    const target = prompt.branches.get(prompt.currentBranch);
    if (!source || !target) {
      return { success: false };
    }

    const sourceCommit = prompt.commits.find(
      (c) => c.version === source.headVersion,
    );
    const targetCommit = prompt.commits.find(
      (c) => c.version === target.headVersion,
    );

    if (!sourceCommit || !targetCommit) {
      return { success: false };
    }

    // Find common ancestor (simple approach - look for where branches diverged)
    const commonAncestor = this.findCommonAncestor(
      prompt,
      sourceBranch,
      prompt.currentBranch,
    );

    const sourceLines = sourceCommit.template.split("\n");
    const targetLines = targetCommit.template.split("\n");
    const baseLines = commonAncestor?.template.split("\n") ?? [];

    const mergeResult = this.threeWayMerge(
      baseLines,
      sourceLines,
      targetLines,
      options?.strategy,
    );

    if (mergeResult.conflicts && mergeResult.conflicts.length > 0) {
      return {
        success: false,
        conflicts: mergeResult.conflicts,
      };
    }

    // Create merge commit
    const mergedTemplate = mergeResult.merged.join("\n");
    const commit = this.commit(
      id,
      mergedTemplate,
      options?.message ??
        `Merge branch '${sourceBranch}' into '${prompt.currentBranch}'`,
      { author: options?.author },
    );

    return {
      success: true,
      mergedTemplate,
      mergedVersion: commit?.version,
    };
  }

  /**
   * Rollback to a previous version
   */
  rollback(
    id: string,
    version: string,
    options?: {
      message?: string;
      author?: string;
    },
  ): PromptCommit | null {
    const prompt = this.prompts.get(id);
    if (!prompt) return null;

    const targetCommit = prompt.commits.find((c) => c.version === version);
    if (!targetCommit) return null;

    return this.commit(
      id,
      targetCommit.template,
      options?.message ?? `Rollback to version ${version}`,
      { author: options?.author },
    );
  }

  /**
   * Cherry-pick a specific commit to current branch
   */
  cherryPick(
    id: string,
    commitId: string,
    options?: {
      message?: string;
      author?: string;
    },
  ): PromptCommit | null {
    const prompt = this.prompts.get(id);
    if (!prompt) return null;

    const sourceCommit = prompt.commits.find((c) => c.id === commitId);
    if (!sourceCommit) return null;

    return this.commit(
      id,
      sourceCommit.template,
      options?.message ?? `Cherry-pick: ${sourceCommit.message}`,
      { author: options?.author, metadata: { cherryPickedFrom: commitId } },
    );
  }

  /**
   * Render a template with variables
   */
  render(id: string, variables: Record<string, string>): string | null {
    const prompt = this.prompts.get(id);
    if (!prompt) return null;
    return this.renderTemplate(prompt.template, variables);
  }

  /**
   * Render any template string with variables
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
   * Export prompt with full history
   */
  export(id: string): {
    prompt: Omit<VersionedPrompt, "branches" | "versionTags">;
    branches: PromptBranch[];
    tags: PromptTag[];
  } | null {
    const prompt = this.prompts.get(id);
    if (!prompt) return null;

    const { branches, versionTags, ...rest } = prompt;
    return {
      prompt: rest,
      branches: Array.from(branches.values()),
      tags: Array.from(versionTags.values()),
    };
  }

  /**
   * Import a prompt with history
   */
  import(data: {
    prompt: Omit<VersionedPrompt, "branches" | "versionTags">;
    branches: PromptBranch[];
    tags: PromptTag[];
  }): VersionedPrompt {
    const prompt: VersionedPrompt = {
      ...data.prompt,
      branches: new Map(data.branches.map((b) => [b.name, b])),
      versionTags: new Map(data.tags.map((t) => [t.name, t])),
    };
    this.prompts.set(prompt.id, prompt);
    return prompt;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

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

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private computeLineDiff(
    fromLines: string[],
    toLines: string[],
  ): { additions: DiffLine[]; deletions: DiffLine[]; unchanged: DiffLine[] } {
    const additions: DiffLine[] = [];
    const deletions: DiffLine[] = [];
    const unchanged: DiffLine[] = [];

    const fromSet = new Set(fromLines);
    const toSet = new Set(toLines);

    // Find deletions
    fromLines.forEach((line, i) => {
      if (!toSet.has(line)) {
        deletions.push({ lineNumber: i + 1, content: line, type: "delete" });
      }
    });

    // Find additions and unchanged
    toLines.forEach((line, i) => {
      if (!fromSet.has(line)) {
        additions.push({ lineNumber: i + 1, content: line, type: "add" });
      } else {
        unchanged.push({ lineNumber: i + 1, content: line, type: "unchanged" });
      }
    });

    return { additions, deletions, unchanged };
  }

  private findCommonAncestor(
    prompt: VersionedPrompt,
    branch1: string,
    branch2: string,
  ): PromptCommit | undefined {
    const branch1Commits = new Set(
      prompt.commits.filter((c) => c.branch === branch1).map((c) => c.version),
    );

    // Walk back through branch2 commits to find first match
    for (const commit of prompt.commits.filter((c) => c.branch === branch2)) {
      if (branch1Commits.has(commit.version)) {
        return commit;
      }
      if (commit.parentVersion && branch1Commits.has(commit.parentVersion)) {
        return prompt.commits.find((c) => c.version === commit.parentVersion);
      }
    }

    // Return first commit as fallback
    return prompt.commits[0];
  }

  private threeWayMerge(
    base: string[],
    ours: string[],
    theirs: string[],
    strategy?: "ours" | "theirs" | "manual",
  ): { merged: string[]; conflicts?: MergeConflict[] } {
    const conflicts: MergeConflict[] = [];
    const merged: string[] = [];

    const maxLen = Math.max(base.length, ours.length, theirs.length);

    for (let i = 0; i < maxLen; i++) {
      const baseLine = base[i] ?? "";
      const ourLine = ours[i] ?? "";
      const theirLine = theirs[i] ?? "";

      if (ourLine === theirLine) {
        merged.push(ourLine);
      } else if (ourLine === baseLine) {
        merged.push(theirLine);
      } else if (theirLine === baseLine) {
        merged.push(ourLine);
      } else {
        // Conflict
        if (strategy === "ours") {
          merged.push(ourLine);
        } else if (strategy === "theirs") {
          merged.push(theirLine);
        } else {
          conflicts.push({
            lineNumber: i + 1,
            ours: ourLine,
            theirs: theirLine,
            base: baseLine,
          });
          merged.push(
            `<<<<<<< OURS\n${ourLine}\n=======\n${theirLine}\n>>>>>>> THEIRS`,
          );
        }
      }
    }

    return { merged, conflicts: conflicts.length > 0 ? conflicts : undefined };
  }
}
