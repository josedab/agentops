/**
 * AgentOps SDK - Prompt Firewall Engine
 *
 * Scans prompts for injection attacks, jailbreaks, data exfiltration,
 * and other adversarial patterns. Supports monitor, enforce, and block modes.
 *
 * @packageDocumentation
 */

import type {
  FirewallConfig,
  ResolvedFirewallConfig,
  AttackPattern,
  AttackCategory,
  ThreatSeverity,
  ThreatIncident,
  PatternMatch,
  ScanResult,
  FirewallMetrics,
} from "./types.js";
import { generateEventId, now } from "../utils.js";

// ============================================================================
// Built-in Attack Patterns
// ============================================================================

const BUILTIN_PATTERNS: AttackPattern[] = [
  // --- Prompt Injection (5) ---
  {
    id: "pi-001",
    name: "Ignore Previous Instructions",
    description: "Attempts to override prior instructions",
    category: "prompt_injection",
    pattern:
      "ignore\\s+(all\\s+)?(previous|prior|above|earlier)\\s+(instructions|prompts|rules|directives)",
    severity: "critical",
    enabled: true,
  },
  {
    id: "pi-002",
    name: "Disregard Instructions",
    description: "Attempts to disregard established instructions",
    category: "prompt_injection",
    pattern:
      "disregard\\s+(the\\s+)?(above|previous|prior|earlier|all)\\s*(instructions|prompts|rules|directives)?",
    severity: "critical",
    enabled: true,
  },
  {
    id: "pi-003",
    name: "Forget Instructions",
    description: "Attempts to clear AI memory of instructions",
    category: "prompt_injection",
    pattern:
      "forget\\s+(everything|all|your\\s+instructions|your\\s+rules|what\\s+you\\s+were\\s+told)",
    severity: "critical",
    enabled: true,
  },
  {
    id: "pi-004",
    name: "New Instructions Injection",
    description: "Injects new instructions mid-prompt",
    category: "prompt_injection",
    pattern: "new\\s+instructions\\s*:",
    severity: "high",
    enabled: true,
  },
  {
    id: "pi-005",
    name: "System Prompt Override",
    description: "Attempts to override system prompt",
    category: "prompt_injection",
    pattern: "system\\s+prompt\\s+override",
    severity: "critical",
    enabled: true,
  },

  // --- Jailbreak (3) ---
  {
    id: "jb-001",
    name: "DAN Mode",
    description: "Do Anything Now jailbreak attempt",
    category: "jailbreak",
    pattern: "(do\\s+anything\\s+now|DAN\\s+mode|DAN\\s*\\d*\\.?\\d*)",
    severity: "critical",
    enabled: true,
  },
  {
    id: "jb-002",
    name: "No Restrictions Pretend",
    description: "Pretend to have no restrictions",
    category: "jailbreak",
    pattern:
      "pretend\\s+(you\\s+have|there\\s+are)\\s+no\\s+(restrictions|limitations|rules|guidelines|filters)",
    severity: "high",
    enabled: true,
  },
  {
    id: "jb-003",
    name: "No Guidelines Act",
    description: "Act as if guidelines don't apply",
    category: "jailbreak",
    pattern:
      "act\\s+as\\s+if\\s+you\\s+have\\s+no\\s+(guidelines|restrictions|rules|limitations)",
    severity: "high",
    enabled: true,
  },

  // --- Data Exfiltration (3) ---
  {
    id: "de-001",
    name: "Repeat System Prompt",
    description: "Attempts to extract system prompt",
    category: "data_exfiltration",
    pattern:
      "repeat\\s+(the|your)\\s+(system|initial|original)\\s+(prompt|instructions|message)",
    severity: "high",
    enabled: true,
  },
  {
    id: "de-002",
    name: "Show Instructions",
    description: "Attempts to reveal hidden instructions",
    category: "data_exfiltration",
    pattern:
      "show\\s+me\\s+your\\s+(prompt|instructions|rules|system\\s+prompt|system\\s+message)",
    severity: "high",
    enabled: true,
  },
  {
    id: "de-003",
    name: "What Were You Told",
    description: "Probing for system instructions",
    category: "data_exfiltration",
    pattern: "what\\s+were\\s+you\\s+told\\s+to",
    severity: "medium",
    enabled: true,
  },

  // --- Role Manipulation (3) ---
  {
    id: "rm-001",
    name: "You Are Now",
    description: "Attempts to reassign AI role",
    category: "role_manipulation",
    pattern: "you\\s+are\\s+now\\s+(?:a\\s+)?\\w+",
    severity: "high",
    enabled: true,
  },
  {
    id: "rm-002",
    name: "Switch Mode",
    description: "Attempts to switch operational mode",
    category: "role_manipulation",
    pattern: "switch\\s+to\\s*.*?\\s*mode",
    severity: "medium",
    enabled: true,
  },
  {
    id: "rm-003",
    name: "New Role Assignment",
    description: "Attempts to assign a new role",
    category: "role_manipulation",
    pattern: "your\\s+new\\s+role\\s+is",
    severity: "high",
    enabled: true,
  },

  // --- Instruction Override (2) ---
  {
    id: "io-001",
    name: "Override Safety",
    description: "Attempts to override safety measures",
    category: "instruction_override",
    pattern: "override\\s*.*?\\s*safety",
    severity: "critical",
    enabled: true,
  },
  {
    id: "io-002",
    name: "Bypass Filter",
    description: "Attempts to bypass content filters",
    category: "instruction_override",
    pattern: "bypass\\s*.*?\\s*filter",
    severity: "critical",
    enabled: true,
  },

  // --- Encoding Attack (2) ---
  {
    id: "ea-001",
    name: "Base64 Decode Reference",
    description:
      "References to base64 decode functions suggesting encoded payloads",
    category: "encoding_attack",
    pattern: "(atob|btoa|base64_decode|base64\\.b64decode)\\s*\\(",
    severity: "medium",
    enabled: true,
  },
  {
    id: "ea-002",
    name: "Unicode Homoglyph Abuse",
    description: "Detects mixed script unicode that may be homoglyph attacks",
    category: "encoding_attack",
    pattern:
      "[\\u0400-\\u04FF][\\u0000-\\u007F]{2,}[\\u0400-\\u04FF]|[\\u0000-\\u007F][\\u0400-\\u04FF]{2,}[\\u0000-\\u007F]",
    severity: "medium",
    enabled: true,
  },

  // --- Context Manipulation (2) ---
  {
    id: "cm-001",
    name: "Conversation Reset",
    description: "Attempts to reset conversation context",
    category: "context_manipulation",
    pattern:
      "(end\\s+of\\s+conversation|conversation\\s+reset|start\\s+new\\s+conversation)",
    severity: "medium",
    enabled: true,
  },
  {
    id: "cm-002",
    name: "Section Break Injection",
    description: "Uses section breaks to inject new instructions",
    category: "context_manipulation",
    pattern:
      "(?:^|\\n)\\s*(?:-{3,}|={3,})\\s*\\n\\s*(?:new|actual|real|updated)\\s+instructions",
    severity: "high",
    enabled: true,
  },
];

// ============================================================================
// Severity ordering
// ============================================================================

const SEVERITY_ORDER: Record<ThreatSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: ResolvedFirewallConfig = {
  enabled: true,
  mode: "monitor",
  patterns: [],
  sensitivity: "medium",
  allowList: [],
  maxContentLength: 100_000,
  debug: false,
};

const MAX_INCIDENTS = 1000;
const CONTENT_TRUNCATE_LENGTH = 200;

// ============================================================================
// Compiled pattern (internal)
// ============================================================================

interface CompiledPattern {
  definition: AttackPattern;
  regex: RegExp;
}

// ============================================================================
// PromptFirewallEngine
// ============================================================================

export class PromptFirewallEngine {
  private readonly config: ResolvedFirewallConfig;
  private readonly patternMap: Map<string, AttackPattern> = new Map();
  private compiledPatterns: CompiledPattern[] = [];
  private readonly incidents: ThreatIncident[] = [];
  private readonly falsePositives: Set<string> = new Set();
  private readonly allowListPatterns: RegExp[] = [];

  // Metrics counters
  private totalScans = 0;
  private threatsDetected = 0;
  private blockedCount = 0;
  private flaggedCount = 0;
  private sanitizedCount = 0;
  private allowedCount = 0;
  private totalScanDurationMs = 0;

  constructor(config: FirewallConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      mode: config.mode ?? DEFAULT_CONFIG.mode,
      patterns: [...(config.patterns ?? [])],
      sensitivity: config.sensitivity ?? DEFAULT_CONFIG.sensitivity,
      allowList: [...(config.allowList ?? [])],
      maxContentLength:
        config.maxContentLength ?? DEFAULT_CONFIG.maxContentLength,
      debug: config.debug ?? DEFAULT_CONFIG.debug,
    };

    // Load built-in patterns
    for (const p of BUILTIN_PATTERNS) {
      this.patternMap.set(p.id, { ...p });
    }

    // Load custom patterns
    for (const p of this.config.patterns) {
      this.patternMap.set(p.id, { ...p });
    }

    // Compile all patterns
    this.recompilePatterns();

    // Compile allow-list
    for (const a of this.config.allowList) {
      this.allowListPatterns.push(new RegExp(a, "i"));
    }
  }

  // ==========================================================================
  // Scan
  // ==========================================================================

  /** Scan content for threats */
  scan(content: string, options?: { sessionId?: string }): ScanResult {
    const startTime = now();

    // Content length check
    if (content.length > this.config.maxContentLength) {
      const result: ScanResult = {
        safe: false,
        threats: [],
        severity: "high",
        action: "blocked",
        sanitizedContent: null,
        scanDurationMs: now() - startTime,
      };
      this.totalScans++;
      this.blockedCount++;
      return result;
    }

    const matches = this.findMatches(content);
    const filteredMatches = this.applyAllowList(matches, content);
    const filteredBySensitivity = this.applySensitivity(filteredMatches);

    const safe = filteredBySensitivity.length === 0;
    const severity = safe ? null : this.highestSeverity(filteredBySensitivity);
    const action = safe ? "allowed" : this.determineAction(severity!);

    const scanDurationMs = now() - startTime;

    // Record incident if threats found
    if (!safe) {
      const incident: ThreatIncident = {
        id: generateEventId(),
        timestamp: now(),
        sessionId: options?.sessionId,
        content: content.slice(0, CONTENT_TRUNCATE_LENGTH),
        matchedPatterns: filteredBySensitivity,
        severity: severity!,
        action,
      };

      this.recordIncident(incident);

      if (action === "blocked") {
        this.config.onBlocked?.(incident);
      }
      this.config.onThreatDetected?.(incident);
    }

    // Update metrics
    this.totalScans++;
    this.totalScanDurationMs += scanDurationMs;
    if (!safe) this.threatsDetected++;
    if (action === "blocked") this.blockedCount++;
    else if (action === "flagged") this.flaggedCount++;
    else this.allowedCount++;

    return {
      safe,
      threats: filteredBySensitivity,
      severity,
      action,
      sanitizedContent: null,
      scanDurationMs,
    };
  }

  /** Scan and return sanitized content */
  scanAndSanitize(
    content: string,
    options?: { sessionId?: string },
  ): { result: ScanResult; output: string } {
    const startTime = now();

    if (content.length > this.config.maxContentLength) {
      const result: ScanResult = {
        safe: false,
        threats: [],
        severity: "high",
        action: "blocked",
        sanitizedContent: null,
        scanDurationMs: now() - startTime,
      };
      this.totalScans++;
      this.blockedCount++;
      return { result, output: "" };
    }

    const matches = this.findMatches(content);
    const filteredMatches = this.applyAllowList(matches, content);
    const filteredBySensitivity = this.applySensitivity(filteredMatches);

    const safe = filteredBySensitivity.length === 0;
    const severity = safe ? null : this.highestSeverity(filteredBySensitivity);
    const action = safe ? "allowed" : "sanitized";

    // Build sanitized content by replacing matched text
    let sanitized = content;
    if (!safe) {
      // Sort matches by position descending so replacements don't shift indices
      const sorted = [...filteredBySensitivity].sort(
        (a, b) => b.position.start - a.position.start,
      );
      for (const match of sorted) {
        sanitized =
          sanitized.slice(0, match.position.start) +
          "[REDACTED]" +
          sanitized.slice(match.position.end);
      }
    }

    const scanDurationMs = now() - startTime;

    // Record incident if threats found
    if (!safe) {
      const incident: ThreatIncident = {
        id: generateEventId(),
        timestamp: now(),
        sessionId: options?.sessionId,
        content: content.slice(0, CONTENT_TRUNCATE_LENGTH),
        matchedPatterns: filteredBySensitivity,
        severity: severity!,
        action,
      };

      this.recordIncident(incident);
      this.config.onThreatDetected?.(incident);
    }

    // Update metrics
    this.totalScans++;
    this.totalScanDurationMs += scanDurationMs;
    if (!safe) {
      this.threatsDetected++;
      this.sanitizedCount++;
    } else {
      this.allowedCount++;
    }

    const result: ScanResult = {
      safe,
      threats: filteredBySensitivity,
      severity,
      action,
      sanitizedContent: safe ? null : sanitized,
      scanDurationMs,
    };

    return { result, output: safe ? content : sanitized };
  }

  // ==========================================================================
  // Pattern Management
  // ==========================================================================

  /** Add a custom pattern */
  addPattern(pattern: AttackPattern): void {
    this.patternMap.set(pattern.id, { ...pattern });
    this.recompilePatterns();
  }

  /** Remove a pattern by id */
  removePattern(id: string): boolean {
    const deleted = this.patternMap.delete(id);
    if (deleted) this.recompilePatterns();
    return deleted;
  }

  /** Get all registered patterns */
  getPatterns(): AttackPattern[] {
    return Array.from(this.patternMap.values());
  }

  /** Enable a pattern by id */
  enablePattern(id: string): void {
    const pattern = this.patternMap.get(id);
    if (pattern) {
      pattern.enabled = true;
      this.recompilePatterns();
    }
  }

  /** Disable a pattern by id */
  disablePattern(id: string): void {
    const pattern = this.patternMap.get(id);
    if (pattern) {
      pattern.enabled = false;
      this.recompilePatterns();
    }
  }

  // ==========================================================================
  // Allow-List Management
  // ==========================================================================

  /** Add a pattern to the allow list */
  addToAllowList(pattern: string): void {
    this.config.allowList.push(pattern);
    this.allowListPatterns.push(new RegExp(pattern, "i"));
  }

  /** Remove a pattern from the allow list */
  removeFromAllowList(pattern: string): boolean {
    const idx = this.config.allowList.indexOf(pattern);
    if (idx === -1) return false;
    this.config.allowList.splice(idx, 1);
    this.allowListPatterns.splice(idx, 1);
    return true;
  }

  // ==========================================================================
  // False Positive Reporting
  // ==========================================================================

  /** Report a false positive by incident id */
  reportFalsePositive(incidentId: string): boolean {
    const incident = this.incidents.find((i) => i.id === incidentId);
    if (!incident) return false;
    this.falsePositives.add(incidentId);
    return true;
  }

  // ==========================================================================
  // Incident & Metrics
  // ==========================================================================

  /** Get incidents with optional filters */
  getIncidents(filter?: {
    severity?: ThreatSeverity;
    category?: AttackCategory;
    since?: number;
  }): ThreatIncident[] {
    let result = [...this.incidents];

    if (filter?.severity) {
      result = result.filter((i) => i.severity === filter.severity);
    }
    if (filter?.category) {
      result = result.filter((i) =>
        i.matchedPatterns.some((m) => m.category === filter.category),
      );
    }
    if (filter?.since != null) {
      result = result.filter((i) => i.timestamp >= filter.since!);
    }

    return result;
  }

  /** Get firewall metrics */
  getMetrics(): FirewallMetrics {
    // Compute top categories
    const categoryCount = new Map<AttackCategory, number>();
    for (const incident of this.incidents) {
      for (const match of incident.matchedPatterns) {
        categoryCount.set(
          match.category,
          (categoryCount.get(match.category) ?? 0) + 1,
        );
      }
    }
    const topCategories = Array.from(categoryCount.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalScans: this.totalScans,
      threatsDetected: this.threatsDetected,
      blocked: this.blockedCount,
      flagged: this.flaggedCount,
      sanitized: this.sanitizedCount,
      allowed: this.allowedCount,
      falsePositivesReported: this.falsePositives.size,
      avgScanDurationMs:
        this.totalScans > 0 ? this.totalScanDurationMs / this.totalScans : 0,
      topCategories,
      incidentHistory: this.incidents.slice(-100),
    };
  }

  /** Reset all state */
  reset(): void {
    this.incidents.length = 0;
    this.falsePositives.clear();
    this.totalScans = 0;
    this.threatsDetected = 0;
    this.blockedCount = 0;
    this.flaggedCount = 0;
    this.sanitizedCount = 0;
    this.allowedCount = 0;
    this.totalScanDurationMs = 0;
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  private recompilePatterns(): void {
    this.compiledPatterns = [];
    for (const pattern of this.patternMap.values()) {
      if (!pattern.enabled) continue;
      try {
        this.compiledPatterns.push({
          definition: pattern,
          regex: new RegExp(pattern.pattern, "gi"),
        });
      } catch {
        // Skip invalid regex patterns
        if (this.config.debug) {
          console.warn(
            `Invalid regex pattern: ${pattern.id} - ${pattern.pattern}`,
          );
        }
      }
    }
  }

  private findMatches(content: string): PatternMatch[] {
    const matches: PatternMatch[] = [];

    for (const compiled of this.compiledPatterns) {
      // Reset lastIndex for global regex
      compiled.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = compiled.regex.exec(content)) !== null) {
        matches.push({
          patternId: compiled.definition.id,
          patternName: compiled.definition.name,
          category: compiled.definition.category,
          severity: compiled.definition.severity,
          matchedText: match[0],
          position: { start: match.index, end: match.index + match[0].length },
        });

        // Prevent infinite loops for zero-length matches
        if (match[0].length === 0) {
          compiled.regex.lastIndex++;
        }
      }
    }

    return matches;
  }

  private applyAllowList(
    matches: PatternMatch[],
    content: string,
  ): PatternMatch[] {
    if (this.allowListPatterns.length === 0) return matches;

    // If any allow-list pattern matches the content, bypass all threat matches
    for (const allowPattern of this.allowListPatterns) {
      allowPattern.lastIndex = 0;
      if (allowPattern.test(content)) {
        return [];
      }
    }

    return matches;
  }

  private applySensitivity(matches: PatternMatch[]): PatternMatch[] {
    const minSeverity = this.getMinSeverityForSensitivity();
    return matches.filter(
      (m) => SEVERITY_ORDER[m.severity] >= SEVERITY_ORDER[minSeverity],
    );
  }

  private getMinSeverityForSensitivity(): ThreatSeverity {
    switch (this.config.sensitivity) {
      case "low":
        return "critical";
      case "medium":
        return "high";
      case "high":
        return "low";
    }
  }

  private highestSeverity(matches: PatternMatch[]): ThreatSeverity {
    let highest: ThreatSeverity = "low";
    for (const m of matches) {
      if (SEVERITY_ORDER[m.severity] > SEVERITY_ORDER[highest]) {
        highest = m.severity;
      }
    }
    return highest;
  }

  private determineAction(
    severity: ThreatSeverity,
  ): "allowed" | "flagged" | "blocked" {
    switch (this.config.mode) {
      case "monitor":
        return "flagged";
      case "enforce":
        return SEVERITY_ORDER[severity] >= SEVERITY_ORDER["high"]
          ? "blocked"
          : "flagged";
      case "block":
        return "blocked";
    }
  }

  private recordIncident(incident: ThreatIncident): void {
    this.incidents.push(incident);
    // Keep last MAX_INCIDENTS
    if (this.incidents.length > MAX_INCIDENTS) {
      this.incidents.splice(0, this.incidents.length - MAX_INCIDENTS);
    }
  }
}
