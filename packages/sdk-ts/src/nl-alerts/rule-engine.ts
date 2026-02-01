/**
 * Natural Language Alert Rule Engine
 *
 * Bridges NL-parsed rules with the PredictiveAlertingEngine,
 * handling rule creation, validation, and management.
 */

import { generateEventId, now } from "../utils.js";
import type {
  AlertRule,
  AlertCondition,
  PredictiveAlertingEngine,
} from "../alerting/predictive.js";
import type { NLAlertParser } from "./parser.js";
import type {
  AlertRuleConfig,
  AlertFeedback,
  RuleEffectiveness,
  ParsedAlertRule,
} from "./types.js";

// ============================================================================
// Types
// ============================================================================

export interface NLRuleEngineConfig {
  /** Parser instance for NL processing */
  parser: NLAlertParser;

  /** Alerting engine for rule execution */
  alertingEngine: PredictiveAlertingEngine;

  /** Auto-enable rules above this confidence */
  autoEnableThreshold?: number;

  /** Maximum rules per organization */
  maxRulesPerOrg?: number;

  /** Callback when rule is created */
  onRuleCreated?: (rule: ManagedAlertRule) => void;

  /** Callback when rule is updated */
  onRuleUpdated?: (rule: ManagedAlertRule) => void;

  /** Callback when rule is deleted */
  onRuleDeleted?: (ruleId: string) => void;
}

export interface ManagedAlertRule {
  /** Unique rule ID */
  id: string;

  /** Organization ID */
  orgId: string;

  /** Original natural language query */
  originalQuery: string;

  /** Parsed rule configuration */
  config: AlertRuleConfig;

  /** Parse confidence */
  confidence: number;

  /** Rule status */
  status: "draft" | "pending_review" | "active" | "paused" | "disabled";

  /** Created timestamp */
  createdAt: number;

  /** Last updated timestamp */
  updatedAt: number;

  /** Created by user */
  createdBy?: string;

  /** Alert statistics */
  stats: RuleStats;

  /** Internal AlertRule ID (for linking to engine) */
  engineRuleId?: string;
}

export interface RuleStats {
  totalAlerts: number;
  alertsLast24h: number;
  alertsLast7d: number;
  lastAlertAt?: number;
  acknowledgedCount: number;
  falsePositiveCount: number;
  averageResponseTimeMs: number;
}

export interface CreateRuleResult {
  success: boolean;
  rule?: ManagedAlertRule;
  requiresReview: boolean;
  errors?: string[];
  ambiguities?: ParsedAlertRule["ambiguities"];
}

// ============================================================================
// NL Rule Engine
// ============================================================================

export class NLRuleEngine {
  private readonly config: Required<
    Omit<
      NLRuleEngineConfig,
      "onRuleCreated" | "onRuleUpdated" | "onRuleDeleted"
    >
  > & {
    onRuleCreated?: NLRuleEngineConfig["onRuleCreated"];
    onRuleUpdated?: NLRuleEngineConfig["onRuleUpdated"];
    onRuleDeleted?: NLRuleEngineConfig["onRuleDeleted"];
  };

  private rules: Map<string, ManagedAlertRule> = new Map();
  private rulesByOrg: Map<string, Set<string>> = new Map();
  private feedback: Map<string, AlertFeedback[]> = new Map();

  constructor(config: NLRuleEngineConfig) {
    this.config = {
      parser: config.parser,
      alertingEngine: config.alertingEngine,
      autoEnableThreshold: config.autoEnableThreshold ?? 0.85,
      maxRulesPerOrg: config.maxRulesPerOrg ?? 100,
      onRuleCreated: config.onRuleCreated,
      onRuleUpdated: config.onRuleUpdated,
      onRuleDeleted: config.onRuleDeleted,
    };
  }

  /**
   * Create a rule from natural language
   */
  async createFromNL(
    query: string,
    orgId: string,
    options?: { userId?: string; useLLM?: boolean },
  ): Promise<CreateRuleResult> {
    // Check org rule limit
    const orgRules = this.rulesByOrg.get(orgId);
    if (orgRules && orgRules.size >= this.config.maxRulesPerOrg) {
      return {
        success: false,
        requiresReview: false,
        errors: [
          `Maximum rules limit (${this.config.maxRulesPerOrg}) reached for organization`,
        ],
      };
    }

    // Parse the query
    const parsed = options?.useLLM
      ? await this.config.parser.parseWithLLM(query)
      : await this.config.parser.parse(query);

    // Validate the parsed rule
    const validation = this.config.parser.validateRule(parsed.rule);
    if (!validation.valid) {
      return {
        success: false,
        requiresReview: false,
        errors: validation.errors,
        ambiguities: parsed.ambiguities,
      };
    }

    // Determine if auto-enable or needs review
    const requiresReview =
      parsed.confidence < this.config.autoEnableThreshold ||
      parsed.ambiguities.length > 0;

    // Create managed rule
    const managedRule: ManagedAlertRule = {
      id: generateEventId(),
      orgId,
      originalQuery: query,
      config: parsed.rule,
      confidence: parsed.confidence,
      status: requiresReview ? "pending_review" : "active",
      createdAt: now(),
      updatedAt: now(),
      createdBy: options?.userId,
      stats: {
        totalAlerts: 0,
        alertsLast24h: 0,
        alertsLast7d: 0,
        acknowledgedCount: 0,
        falsePositiveCount: 0,
        averageResponseTimeMs: 0,
      },
    };

    // Store the rule
    this.rules.set(managedRule.id, managedRule);

    if (!this.rulesByOrg.has(orgId)) {
      this.rulesByOrg.set(orgId, new Set());
    }
    this.rulesByOrg.get(orgId)!.add(managedRule.id);

    // If active, register with alerting engine
    if (managedRule.status === "active") {
      this.registerWithEngine(managedRule);
    }

    // Notify
    this.config.onRuleCreated?.(managedRule);

    return {
      success: true,
      rule: managedRule,
      requiresReview,
      ambiguities:
        parsed.ambiguities.length > 0 ? parsed.ambiguities : undefined,
    };
  }

  /**
   * Resolve ambiguities and update rule
   */
  resolveAmbiguity(
    ruleId: string,
    ambiguityType: string,
    value: string | number,
  ): CreateRuleResult {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return {
        success: false,
        requiresReview: false,
        errors: ["Rule not found"],
      };
    }

    // Re-parse with resolved ambiguity
    const currentParsed: ParsedAlertRule = {
      rule: rule.config,
      originalQuery: rule.originalQuery,
      confidence: rule.confidence,
      ambiguities: [], // Will be recalculated
      suggestions: [],
      metadata: { parseTimeMs: 0, extractedEntities: [] },
    };

    const resolved = this.config.parser.resolveAmbiguity(
      currentParsed,
      ambiguityType,
      value,
    );

    // Update rule
    rule.config = resolved.rule;
    rule.confidence = resolved.confidence;
    rule.updatedAt = now();

    // Check if now ready to activate
    if (
      rule.status === "pending_review" &&
      resolved.ambiguities.length === 0 &&
      resolved.confidence >= this.config.autoEnableThreshold
    ) {
      rule.status = "active";
      this.registerWithEngine(rule);
    }

    this.config.onRuleUpdated?.(rule);

    return {
      success: true,
      rule,
      requiresReview: rule.status === "pending_review",
      ambiguities:
        resolved.ambiguities.length > 0 ? resolved.ambiguities : undefined,
    };
  }

  /**
   * Activate a pending rule
   */
  activateRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    if (
      rule.status === "pending_review" ||
      rule.status === "paused" ||
      rule.status === "draft"
    ) {
      rule.status = "active";
      rule.updatedAt = now();
      this.registerWithEngine(rule);
      this.config.onRuleUpdated?.(rule);
      return true;
    }

    return false;
  }

  /**
   * Pause an active rule
   */
  pauseRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    if (rule.status === "active") {
      rule.status = "paused";
      rule.updatedAt = now();
      this.unregisterFromEngine(rule);
      this.config.onRuleUpdated?.(rule);
      return true;
    }

    return false;
  }

  /**
   * Delete a rule
   */
  deleteRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    // Unregister from engine
    this.unregisterFromEngine(rule);

    // Remove from storage
    this.rules.delete(ruleId);
    this.rulesByOrg.get(rule.orgId)?.delete(ruleId);
    this.feedback.delete(ruleId);

    this.config.onRuleDeleted?.(ruleId);

    return true;
  }

  /**
   * Update rule from natural language
   */
  async updateFromNL(ruleId: string, query: string): Promise<CreateRuleResult> {
    const existing = this.rules.get(ruleId);
    if (!existing) {
      return {
        success: false,
        requiresReview: false,
        errors: ["Rule not found"],
      };
    }

    const parsed = await this.config.parser.parse(query);
    const validation = this.config.parser.validateRule(parsed.rule);

    if (!validation.valid) {
      return {
        success: false,
        requiresReview: false,
        errors: validation.errors,
        ambiguities: parsed.ambiguities,
      };
    }

    // Update the rule
    existing.originalQuery = query;
    existing.config = parsed.rule;
    existing.confidence = parsed.confidence;
    existing.updatedAt = now();

    // Re-check if needs review
    const requiresReview =
      parsed.confidence < this.config.autoEnableThreshold ||
      parsed.ambiguities.length > 0;

    if (requiresReview && existing.status === "active") {
      existing.status = "pending_review";
      this.unregisterFromEngine(existing);
    }

    this.config.onRuleUpdated?.(existing);

    return {
      success: true,
      rule: existing,
      requiresReview,
      ambiguities:
        parsed.ambiguities.length > 0 ? parsed.ambiguities : undefined,
    };
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId: string): ManagedAlertRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all rules for an organization
   */
  getRulesForOrg(orgId: string): ManagedAlertRule[] {
    const ruleIds = this.rulesByOrg.get(orgId);
    if (!ruleIds) return [];

    return Array.from(ruleIds)
      .map((id) => this.rules.get(id))
      .filter((r): r is ManagedAlertRule => r !== undefined);
  }

  /**
   * Record feedback for an alert
   */
  recordFeedback(feedback: AlertFeedback): void {
    // Find rule by alert
    const rule = Array.from(this.rules.values()).find(
      (r) => r.id === feedback.ruleId,
    );

    if (!rule) return;

    // Store feedback
    if (!this.feedback.has(rule.id)) {
      this.feedback.set(rule.id, []);
    }
    this.feedback.get(rule.id)!.push(feedback);

    // Update stats
    rule.stats.totalAlerts++;

    if (feedback.type === "helpful") {
      rule.stats.acknowledgedCount++;
    } else if (feedback.type === "false_positive") {
      rule.stats.falsePositiveCount++;
    }

    rule.stats.lastAlertAt = feedback.timestamp;
    rule.updatedAt = now();
  }

  /**
   * Calculate rule effectiveness
   */
  getRuleEffectiveness(ruleId: string): RuleEffectiveness | undefined {
    const rule = this.rules.get(ruleId);
    if (!rule) return undefined;

    const ruleFeedback = this.feedback.get(ruleId) || [];

    // Calculate feedback score (helpful - not_helpful - false_positives)
    let feedbackScore = 0;
    for (const fb of ruleFeedback) {
      if (fb.type === "helpful") feedbackScore += 1;
      else if (fb.type === "not_helpful") feedbackScore -= 0.5;
      else if (fb.type === "false_positive") feedbackScore -= 1;
      else if (fb.type === "too_late") feedbackScore -= 0.3;
      else if (fb.type === "too_early") feedbackScore -= 0.2;
    }

    // Normalize to 0-10 scale
    const normalizedScore = Math.max(0, Math.min(10, 5 + feedbackScore));

    // Generate recommendations
    const recommendations: string[] = [];

    if (rule.stats.falsePositiveCount > rule.stats.totalAlerts * 0.3) {
      recommendations.push(
        "Consider increasing the threshold to reduce false positives",
      );
    }

    if (ruleFeedback.filter((f) => f.type === "too_late").length > 2) {
      recommendations.push(
        "Consider lowering the threshold for earlier detection",
      );
    }

    if (
      rule.stats.totalAlerts > 50 &&
      rule.stats.acknowledgedCount < rule.stats.totalAlerts * 0.2
    ) {
      recommendations.push(
        "Alert fatigue detected - consider consolidating or adjusting severity",
      );
    }

    return {
      ruleId,
      totalAlerts: rule.stats.totalAlerts,
      acknowledgedAlerts: rule.stats.acknowledgedCount,
      falsePositives: rule.stats.falsePositiveCount,
      averageResponseTimeMs: rule.stats.averageResponseTimeMs,
      feedbackScore: normalizedScore,
      recommendations,
    };
  }

  /**
   * Get suggested rule improvements based on feedback
   */
  getSuggestedImprovements(ruleId: string): string[] {
    const effectiveness = this.getRuleEffectiveness(ruleId);
    return effectiveness?.recommendations || [];
  }

  // Private methods

  private registerWithEngine(rule: ManagedAlertRule): void {
    // Convert to engine AlertRule format
    const engineRule: AlertRule = {
      id: generateEventId(),
      name: rule.config.name,
      metricId: rule.config.metric.name,
      condition: this.convertCondition(rule.config.condition),
      severity: rule.config.severity,
      enabled: true,
      cooldownMs: rule.config.cooldownMs,
    };

    rule.engineRuleId = engineRule.id;

    // Register with engine (engine API may vary)
    // For now, we store the mapping
    // In production, this would call: this.config.alertingEngine.addRule(engineRule)
  }

  private unregisterFromEngine(rule: ManagedAlertRule): void {
    if (rule.engineRuleId) {
      // In production: this.config.alertingEngine.removeRule(rule.engineRuleId)
      rule.engineRuleId = undefined;
    }
  }

  private convertCondition(spec: AlertRuleConfig["condition"]): AlertCondition {
    return {
      type:
        spec.type === "rate_of_change"
          ? "trend"
          : (spec.type as AlertCondition["type"]),
      operator: spec.operator as AlertCondition["operator"],
      value: spec.value,
      duration: spec.duration,
    };
  }
}
