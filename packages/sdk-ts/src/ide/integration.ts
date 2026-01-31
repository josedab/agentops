/**
 * AgentOps SDK - IDE Integration Types
 *
 * Types and utilities for VS Code/JetBrains plugin integration.
 */

import { generateEventId, now } from "../utils.js";

// ============================================================================
// Types
// ============================================================================

export interface IDEIntegrationConfig {
  enabled: boolean;
  apiKey?: string;
  showInlineMetrics?: boolean;
  showCostEstimates?: boolean;
  linkToDashboard?: boolean;
  dashboardBaseUrl?: string;
  refreshInterval?: number;
}

export interface InlineAnnotation {
  id: string;
  type: "cost" | "latency" | "quality" | "warning" | "info";
  text: string;
  file: string;
  line: number;
  column?: number;
  tooltip?: string;
  severity?: "info" | "warning" | "error";
  dashboardLink?: string;
}

export interface SessionLink {
  sessionId: string;
  url: string;
  text: string;
  timestamp: number;
  status?: "active" | "completed" | "error";
  quickStats?: {
    cost: number;
    latency: number;
    tokens: number;
    events: number;
  };
}

export interface CostEstimate {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  suggestions: CostSuggestion[];
}

export interface CostSuggestion {
  type: "model_downgrade" | "prompt_shorten" | "use_cache";
  description: string;
  potentialSavings: number;
}

export interface PromptHover {
  promptId: string;
  name: string;
  version: string;
  stats: {
    avgLatency: number;
    avgCost: number;
    avgQuality: number;
    usageCount: number;
  };
  lastUsed: number;
  variations?: number;
}

export interface DiagnosticInfo {
  id: string;
  file: string;
  line: number;
  column: number;
  severity: "info" | "warning" | "error";
  message: string;
  source: string;
  code?: string;
  quickFixes?: QuickFix[];
}

export interface QuickFix {
  id: string;
  title: string;
  description: string;
  edit?: CodeEdit;
  command?: string;
}

export interface CodeEdit {
  file: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  newText: string;
}

// ============================================================================
// IDE Integration Service
// ============================================================================

export class IDEIntegrationService {
  private readonly config: Required<Omit<IDEIntegrationConfig, "apiKey">> & {
    apiKey?: string;
  };
  private annotations: Map<string, InlineAnnotation[]> = new Map();
  private diagnostics: Map<string, DiagnosticInfo[]> = new Map();

  constructor(config: IDEIntegrationConfig) {
    this.config = {
      enabled: config.enabled,
      apiKey: config.apiKey,
      showInlineMetrics: config.showInlineMetrics ?? true,
      showCostEstimates: config.showCostEstimates ?? true,
      linkToDashboard: config.linkToDashboard ?? true,
      dashboardBaseUrl: config.dashboardBaseUrl ?? "https://app.agentops.ai",
      refreshInterval: config.refreshInterval ?? 5000,
    };
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  // =========================================================================
  // Annotation Management
  // =========================================================================

  addAnnotation(annotation: InlineAnnotation): InlineAnnotation {
    const fileAnnotations = this.annotations.get(annotation.file) ?? [];
    fileAnnotations.push(annotation);
    this.annotations.set(annotation.file, fileAnnotations);
    return annotation;
  }

  getAnnotations(file: string): InlineAnnotation[] {
    return this.annotations.get(file) ?? [];
  }

  clearAnnotations(file?: string): void {
    if (file) {
      this.annotations.delete(file);
    } else {
      this.annotations.clear();
    }
  }

  // =========================================================================
  // Session Links
  // =========================================================================

  getSessionLink(sessionId: string): SessionLink {
    const url = `${this.config.dashboardBaseUrl}/sessions/${sessionId}`;
    return {
      sessionId,
      url,
      text: `View session ${sessionId}`,
      timestamp: now(),
    };
  }

  getTraceLink(sessionId: string, traceId: string): SessionLink {
    const url = `${this.config.dashboardBaseUrl}/sessions/${sessionId}/traces/${traceId}`;
    return {
      sessionId,
      url,
      text: `View trace ${traceId}`,
      timestamp: now(),
    };
  }

  // =========================================================================
  // Cost Estimation
  // =========================================================================

  estimateCost(
    model: string,
    prompt: string,
    expectedOutputTokens: number = 100,
  ): CostEstimate {
    const pricing: Record<string, { input: number; output: number }> = {
      "gpt-4": { input: 0.03, output: 0.06 },
      "gpt-4-turbo": { input: 0.01, output: 0.03 },
      "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
      "claude-3-opus": { input: 0.015, output: 0.075 },
      "claude-3-sonnet": { input: 0.003, output: 0.015 },
    };

    const modelPricing = pricing[model] ?? { input: 0.001, output: 0.002 };
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = expectedOutputTokens;

    const inputCost = (inputTokens / 1000) * modelPricing.input;
    const outputCost = (outputTokens / 1000) * modelPricing.output;

    const suggestions: CostSuggestion[] = [];

    // Generate suggestions for expensive prompts
    if (inputTokens > 1000 && model === "gpt-4") {
      suggestions.push({
        type: "model_downgrade",
        description: "Consider using gpt-3.5-turbo for simpler queries",
        potentialSavings: inputCost * 0.9,
      });
    }

    if (prompt.length > 5000) {
      suggestions.push({
        type: "prompt_shorten",
        description: "Long prompt detected. Consider summarizing context.",
        potentialSavings: inputCost * 0.3,
      });
    }

    return {
      model,
      inputTokens,
      outputTokens,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      suggestions,
    };
  }

  // =========================================================================
  // Diagnostics
  // =========================================================================

  registerDiagnostic(diagnostic: DiagnosticInfo): void {
    const fileDiagnostics = this.diagnostics.get(diagnostic.file) ?? [];
    fileDiagnostics.push(diagnostic);
    this.diagnostics.set(diagnostic.file, fileDiagnostics);
  }

  getDiagnostics(file: string): DiagnosticInfo[] {
    return this.diagnostics.get(file) ?? [];
  }

  clearDiagnostics(file?: string): void {
    if (file) {
      this.diagnostics.delete(file);
    } else {
      this.diagnostics.clear();
    }
  }

  // =========================================================================
  // Prompt Hover
  // =========================================================================

  getPromptHover(promptId: string): PromptHover {
    return {
      promptId,
      name: `Prompt ${promptId}`,
      version: "1.0.0",
      stats: {
        avgLatency: 150,
        avgCost: 0.02,
        avgQuality: 0.85,
        usageCount: 100,
      },
      lastUsed: now(),
    };
  }

  // =========================================================================
  // Quick Fixes
  // =========================================================================

  getQuickFixes(diagnosticId: string): QuickFix[] {
    // Find the diagnostic
    for (const [_file, diagnostics] of this.diagnostics) {
      const diagnostic = diagnostics.find((d) => d.id === diagnosticId);
      if (diagnostic) {
        return this.generateQuickFixes(diagnostic);
      }
    }
    return [];
  }

  private generateQuickFixes(diagnostic: DiagnosticInfo): QuickFix[] {
    const fixes: QuickFix[] = [];

    if (diagnostic.code === "AO001") {
      fixes.push({
        id: generateEventId(),
        title: "Switch to cheaper model",
        description: "Replace gpt-4 with gpt-3.5-turbo for cost savings",
        edit: {
          file: diagnostic.file,
          range: {
            startLine: diagnostic.line,
            startColumn: diagnostic.column,
            endLine: diagnostic.line,
            endColumn: diagnostic.column + 5,
          },
          newText: "gpt-3.5-turbo",
        },
      });
    }

    // Always provide a suppress option
    fixes.push({
      id: generateEventId(),
      title: "Suppress this warning",
      description: "Add // agentops-ignore to suppress",
    });

    return fixes;
  }

  // =========================================================================
  // Dashboard URL generation
  // =========================================================================

  getDashboardUrl(
    type: "session" | "prompt" | "experiment",
    id: string,
  ): string {
    return `${this.config.dashboardBaseUrl}/${type}s/${id}`;
  }
}
