/**
 * AgentOps SDK - Root Cause Analysis Module
 *
 * ML-powered failure analysis exports.
 *
 * The module is structured as:
 * - RootCauseAnalyzer: Main facade class (use this for most use cases)
 * - PatternDetector: Pattern detection component
 * - RootCauseEngine: Root cause analysis component
 * - RemediationEngine: Remediation suggestion component
 * - RCAReportGenerator: Report generation component
 */

// Main facade
export { RootCauseAnalyzer } from "./analyzer.js";

// Component classes (for advanced use cases)
export { PatternDetector } from "./pattern-detector.js";
export { RootCauseEngine } from "./root-cause-engine.js";
export { RemediationEngine } from "./remediation-engine.js";
export { RCAReportGenerator } from "./report-generator.js";

// All types
export type {
  RCAConfig,
  ResolvedRCAConfig,
  FailureEvent,
  FailurePattern,
  PatternType,
  PatternAttribute,
  RootCauseAnalysis,
  RootCause,
  CauseCategory,
  Evidence,
  ContributingFactor,
  TimelineEvent,
  Remediation,
  RemediationType,
  RemediationStep,
  RCAReport,
} from "./types.js";
