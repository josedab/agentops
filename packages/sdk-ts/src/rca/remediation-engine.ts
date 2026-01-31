/**
 * AgentOps SDK - Remediation Engine
 *
 * Single-responsibility class for suggesting and managing remediations.
 * Extracted from RootCauseAnalyzer for better maintainability.
 */

import { now, generateEventId } from "../utils.js";
import {
  FailurePattern,
  RootCause,
  RootCauseAnalysis,
  Remediation,
  RemediationType,
  ResolvedRCAConfig,
} from "./types.js";

/**
 * Generates and manages remediation suggestions for failure patterns.
 */
export class RemediationEngine {
  private remediations = new Map<string, Remediation>();

  constructor(
    private readonly config: ResolvedRCAConfig,
    private readonly patterns: Map<string, FailurePattern>,
  ) {}

  /**
   * Suggest remediations for a root cause analysis
   */
  suggestRemediations(analysis: RootCauseAnalysis): Remediation[] {
    if (!this.config.autoSuggestRemediation) return [];

    const pattern = this.patterns.get(analysis.patternId);
    if (!pattern) return [];

    const suggestions: Remediation[] = [];

    for (const rootCause of analysis.rootCauses) {
      const remediation = this.createRemediationForCause(
        pattern,
        rootCause,
        analysis,
      );
      if (remediation) {
        this.remediations.set(remediation.id, remediation);
        suggestions.push(remediation);
      }
    }

    return suggestions;
  }

  /**
   * Get a remediation by ID
   */
  getRemediation(remediationId: string): Remediation | undefined {
    return this.remediations.get(remediationId);
  }

  /**
   * Get all remediations
   */
  getAllRemediations(): Remediation[] {
    return Array.from(this.remediations.values());
  }

  /**
   * Update remediation status
   */
  updateRemediationStatus(
    remediationId: string,
    status: Remediation["status"],
  ): boolean {
    const remediation = this.remediations.get(remediationId);
    if (!remediation) return false;
    remediation.status = status;
    return true;
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private createRemediationForCause(
    pattern: FailurePattern,
    rootCause: RootCause,
    analysis: RootCauseAnalysis,
  ): Remediation | null {
    const baseRemediation: Partial<Remediation> = {
      id: generateEventId(),
      patternId: pattern.id,
      rootCauseId: rootCause.id,
      priority: rootCause.impact,
      createdAt: now(),
      status: "suggested",
    };

    switch (rootCause.category) {
      case "rate_limiting":
        return this.createRateLimitRemediation(
          baseRemediation,
          rootCause,
          analysis,
        );
      case "prompt_design":
        return this.createPromptRemediation(baseRemediation, rootCause);
      case "context_management":
        return this.createContextRemediation(baseRemediation, rootCause);
      case "tool_configuration":
        return this.createToolRemediation(baseRemediation, rootCause);
      case "model_provider":
        return this.createModelRemediation(baseRemediation, rootCause);
      case "infrastructure":
        return this.createInfrastructureRemediation(baseRemediation, rootCause);
      default:
        return this.createGenericRemediation(baseRemediation, rootCause);
    }
  }

  private createRateLimitRemediation(
    base: Partial<Remediation>,
    _rootCause: RootCause,
    analysis: RootCauseAnalysis,
  ): Remediation {
    const hasRapidRequests = analysis.contributingFactors.some((f) =>
      f.factor.toLowerCase().includes("rapid"),
    );

    return {
      ...base,
      title: "Implement Rate Limiting Controls",
      description:
        "Add request throttling and queue management to prevent rate limit errors",
      type: "rate_limit_adjustment" as RemediationType,
      steps: [
        {
          order: 1,
          action: "Configure request throttling",
          details: "Set maximum requests per second based on provider limits",
          automated: true,
          command: hasRapidRequests
            ? "setRequestThrottle({ maxRequestsPerSecond: 10 })"
            : undefined,
        },
        {
          order: 2,
          action: "Implement request queue",
          details: "Queue requests when approaching rate limits",
          automated: true,
        },
        {
          order: 3,
          action: "Add exponential backoff",
          details: "Implement retry logic with exponential backoff",
          automated: true,
        },
        {
          order: 4,
          action: "Monitor rate limit metrics",
          details: "Set up alerts for rate limit approach",
          automated: false,
        },
      ],
      estimatedEffort: "hours",
      expectedImpact: "Reduce rate limit errors by 80-90%",
      implementationRisk: "low",
      canAutomate: true,
    } as Remediation;
  }

  private createPromptRemediation(
    base: Partial<Remediation>,
    _rootCause: RootCause,
  ): Remediation {
    return {
      ...base,
      title: "Optimize Prompt Design",
      description: "Reduce prompt size and improve efficiency",
      type: "prompt_update" as RemediationType,
      steps: [
        {
          order: 1,
          action: "Analyze prompt templates",
          details: "Identify redundant or verbose sections in prompts",
          automated: false,
        },
        {
          order: 2,
          action: "Implement prompt compression",
          details: "Use summarization or truncation for long contexts",
          automated: true,
        },
        {
          order: 3,
          action: "Add prompt caching",
          details: "Cache common prompt components",
          automated: true,
        },
        {
          order: 4,
          action: "Test compressed prompts",
          details: "Verify output quality with optimized prompts",
          automated: false,
          verification: "Run A/B tests comparing original vs optimized prompts",
        },
      ],
      estimatedEffort: "days",
      expectedImpact: "Reduce timeout errors by 50-70%",
      implementationRisk: "medium",
      canAutomate: false,
    } as Remediation;
  }

  private createContextRemediation(
    base: Partial<Remediation>,
    _rootCause: RootCause,
  ): Remediation {
    return {
      ...base,
      title: "Implement Context Window Management",
      description: "Add intelligent context truncation and management",
      type: "config_change" as RemediationType,
      steps: [
        {
          order: 1,
          action: "Enable token counting",
          details: "Track token usage before each request",
          automated: true,
        },
        {
          order: 2,
          action: "Implement sliding window",
          details: "Use sliding window to manage conversation history",
          automated: true,
        },
        {
          order: 3,
          action: "Add context summarization",
          details: "Summarize older messages instead of truncating",
          automated: true,
        },
        {
          order: 4,
          action: "Configure safety margin",
          details: "Reserve 10-20% of context for response",
          automated: true,
        },
      ],
      estimatedEffort: "hours",
      expectedImpact: "Eliminate context overflow errors",
      implementationRisk: "low",
      canAutomate: true,
    } as Remediation;
  }

  private createToolRemediation(
    base: Partial<Remediation>,
    rootCause: RootCause,
  ): Remediation {
    const tools =
      rootCause.affectedComponents.length > 0
        ? rootCause.affectedComponents.join(", ")
        : "affected tools";

    return {
      ...base,
      title: `Fix Tool Configuration: ${tools}`,
      description: "Review and fix tool configurations causing failures",
      type: "config_change" as RemediationType,
      steps: [
        {
          order: 1,
          action: "Review tool definitions",
          details: "Check tool schemas and parameter definitions",
          automated: false,
        },
        {
          order: 2,
          action: "Add input validation",
          details: "Validate tool inputs before execution",
          automated: true,
        },
        {
          order: 3,
          action: "Implement tool timeouts",
          details: "Add timeout handling for long-running tools",
          automated: true,
        },
        {
          order: 4,
          action: "Add fallback handling",
          details: "Gracefully handle tool failures with fallbacks",
          automated: true,
        },
      ],
      estimatedEffort: "hours",
      expectedImpact: "Reduce tool failures by 60-80%",
      implementationRisk: "medium",
      canAutomate: false,
    } as Remediation;
  }

  private createModelRemediation(
    base: Partial<Remediation>,
    rootCause: RootCause,
  ): Remediation {
    // Check if this is a timeout-related model issue
    const isTimeoutRelated = rootCause.description
      .toLowerCase()
      .includes("timeout");

    return {
      ...base,
      title: isTimeoutRelated
        ? "Address Model Timeout Issues"
        : "Configure Model Fallbacks",
      description: isTimeoutRelated
        ? "Implement timeout handling and fallback models for slow responses"
        : "Set up fallback models for reliability",
      type: "model_switch" as RemediationType,
      steps: [
        {
          order: 1,
          action: isTimeoutRelated
            ? "Configure request timeouts"
            : "Identify fallback models",
          details: isTimeoutRelated
            ? "Set appropriate timeout values based on expected response times"
            : "Select alternative models with similar capabilities",
          automated: isTimeoutRelated,
        },
        {
          order: 2,
          action: "Configure model router",
          details: "Set up automatic failover to fallback models",
          automated: true,
        },
        {
          order: 3,
          action: "Add health checks",
          details: "Monitor model availability and performance",
          automated: true,
        },
        {
          order: 4,
          action: "Test fallback scenarios",
          details: "Verify failover works correctly",
          automated: false,
          verification: "Simulate model failures and verify fallback behavior",
        },
      ],
      estimatedEffort: "days",
      expectedImpact: isTimeoutRelated
        ? "Reduce timeout errors and improve response time reliability"
        : "Improve availability to 99.9%",
      implementationRisk: "low",
      canAutomate: true,
    } as Remediation;
  }

  private createInfrastructureRemediation(
    base: Partial<Remediation>,
    _rootCause: RootCause,
  ): Remediation {
    return {
      ...base,
      title: "Address Infrastructure Issues",
      description: "Review and address infrastructure-related failure patterns",
      type: "monitoring_alert" as RemediationType,
      steps: [
        {
          order: 1,
          action: "Set up monitoring",
          details: "Add detailed monitoring for infrastructure components",
          automated: true,
        },
        {
          order: 2,
          action: "Configure alerts",
          details: "Set up alerts for anomalies during peak hours",
          automated: true,
        },
        {
          order: 3,
          action: "Review capacity",
          details: "Evaluate if additional capacity is needed",
          automated: false,
        },
        {
          order: 4,
          action: "Implement load balancing",
          details: "Distribute load across multiple instances if applicable",
          automated: false,
        },
      ],
      estimatedEffort: "days",
      expectedImpact: "Reduce infrastructure-related failures by 50%",
      implementationRisk: "medium",
      canAutomate: false,
    } as Remediation;
  }

  private createGenericRemediation(
    base: Partial<Remediation>,
    rootCause: RootCause,
  ): Remediation {
    return {
      ...base,
      title: "Investigate and Address Pattern",
      description: rootCause.description,
      type: "manual_intervention" as RemediationType,
      steps: [
        {
          order: 1,
          action: "Review failure logs",
          details: "Examine detailed logs for the failure pattern",
          automated: false,
        },
        {
          order: 2,
          action: "Identify root cause",
          details: "Conduct deeper investigation into the cause",
          automated: false,
        },
        {
          order: 3,
          action: "Implement fix",
          details: "Apply appropriate fix based on investigation",
          automated: false,
        },
        {
          order: 4,
          action: "Monitor resolution",
          details: "Verify the fix addresses the pattern",
          automated: false,
          verification: "Monitor for 24-48 hours to confirm resolution",
        },
      ],
      estimatedEffort: "days",
      expectedImpact: "Address recurring failure pattern",
      implementationRisk: "medium",
      canAutomate: false,
    } as Remediation;
  }
}
