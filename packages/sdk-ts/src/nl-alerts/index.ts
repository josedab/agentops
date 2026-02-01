/**
 * Natural Language Alert Configuration Module
 *
 * Enables users to create and manage alerts using natural language,
 * with LLM-enhanced parsing, rule engine integration, and feedback loops.
 *
 * @example
 * ```typescript
 * import { NLAlertParser, NLRuleEngine, FeedbackCollector } from '@agentops/sdk';
 *
 * // Create parser
 * const parser = new NLAlertParser({
 *   fuzzyMatching: true,
 *   confidenceThreshold: 0.7,
 * });
 *
 * // Parse natural language
 * const parsed = await parser.parse("Alert me when costs exceed $10 per hour");
 * console.log(parsed.rule); // Structured alert rule
 * console.log(parsed.confidence); // Parse confidence
 *
 * // Create rule engine with alerting integration
 * const ruleEngine = new NLRuleEngine({
 *   parser,
 *   alertingEngine: myAlertingEngine,
 *   autoEnableThreshold: 0.85,
 * });
 *
 * // Create rule from natural language
 * const result = await ruleEngine.createFromNL(
 *   "Warn me if error rate goes above 5% in production",
 *   "org-123"
 * );
 *
 * if (result.requiresReview) {
 *   // Show ambiguities to user for clarification
 *   console.log(result.ambiguities);
 * }
 *
 * // Set up feedback collection
 * const feedback = new FeedbackCollector({
 *   autoTuning: true,
 *   onSuggestion: (ruleId, suggestion) => {
 *     console.log(`Improvement for ${ruleId}:`, suggestion.description);
 *   },
 * });
 *
 * // Record user feedback
 * feedback.recordFeedback({
 *   alertId: "alert-456",
 *   ruleId: "rule-123",
 *   type: "helpful",
 *   timestamp: Date.now(),
 * });
 * ```
 */

// Types
export type {
  // Parser types
  ParsedAlertRule,
  AlertRuleConfig,
  MetricSpec,
  MetricType,
  ConditionSpec,
  FilterSpec,
  NotificationSpec,
  Ambiguity,
  ParseMetadata,
  ExtractedEntity,
  NLAlertParserConfig,
  LLMProvider,
  MetricDefinition,
  KnownEntities,
  // Feedback types
  AlertFeedback,
  RuleEffectiveness,
} from "./types.js";

// Parser
export { NLAlertParser } from "./parser.js";

// Rule Engine
export {
  NLRuleEngine,
  type NLRuleEngineConfig,
  type ManagedAlertRule,
  type RuleStats,
  type CreateRuleResult,
} from "./rule-engine.js";

// Feedback System
export {
  FeedbackCollector,
  type FeedbackSystemConfig,
  type RuleSuggestion,
  type FeedbackAnalysis,
  type FeedbackMetrics,
  type FeedbackPattern,
  type ParseCorrection,
  type ParserImprovement,
} from "./feedback.js";

// Example queries for documentation/testing
export { EXAMPLE_QUERIES } from "./types.js";
