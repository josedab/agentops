/**
 * AgentOps SDK - Embedded Agent Analytics Types
 *
 * Type definitions for embeddable analytics widgets,
 * token-based access control, and widget rendering.
 *
 * @packageDocumentation
 */

// ============================================================================
// Configuration
// ============================================================================

export interface EmbedConfig {
  /** API endpoint for the embed service */
  apiEndpoint: string;

  /** Enable debug mode */
  debug: boolean;
}

// ============================================================================
// Token & Scope
// ============================================================================

export interface EmbedToken {
  /** The signed token string */
  token: string;

  /** Tenant this token belongs to */
  tenantId: string;

  /** Scopes granted to this token */
  scopes: EmbedScope[];

  /** Expiration timestamp (ms since epoch) */
  expiresAt: number;

  /** Issuance timestamp (ms since epoch) */
  issuedAt: number;
}

export interface EmbedScope {
  /** Scope type */
  type: "session" | "user" | "feature" | "global";

  /** Scope value (e.g. specific sessionId or userId) */
  value: string;

  /** Permissions granted */
  permissions: ("read" | "read_write")[];
}

// ============================================================================
// Widget Configuration
// ============================================================================

export type WidgetType =
  | "session_timeline"
  | "cost_breakdown"
  | "quality_score"
  | "usage_chart"
  | "error_feed";

export interface WidgetConfig {
  /** Widget type */
  type: WidgetType;

  /** Optional display title */
  title?: string;

  /** Optional width (CSS value) */
  width?: string;

  /** Optional height (CSS value) */
  height?: string;

  /** Widget theme */
  theme?: WidgetTheme;

  /** Auto-refresh interval in ms */
  refreshInterval?: number;

  /** Data filters */
  filters?: WidgetFilter[];
}

export interface WidgetTheme {
  /** Color mode */
  mode: "light" | "dark" | "auto";

  /** Primary accent color */
  primaryColor: string;

  /** Background color */
  backgroundColor: string;

  /** Font family */
  fontFamily: string;

  /** Border radius in px */
  borderRadius: number;
}

export interface WidgetFilter {
  /** Field to filter on */
  field: string;

  /** Filter operator */
  operator: "eq" | "gt" | "lt" | "between" | "in";

  /** Filter value */
  value: unknown;
}

// ============================================================================
// Widget Data
// ============================================================================

export interface WidgetData {
  /** Widget type this data is for */
  type: WidgetType;

  /** The actual data payload */
  data: unknown;

  /** Last updated timestamp (ms since epoch) */
  lastUpdated: number;

  /** Whether the dataset is empty */
  empty: boolean;
}

export interface SessionTimelineData {
  /** Timeline events */
  events: {
    id: string;
    type: string;
    timestamp: number;
    content: string;
    model: string;
    durationMs: number;
    cost: number;
  }[];
}

export interface CostBreakdownData {
  /** Total cost in the period */
  totalCost: number;

  /** Costs broken down by model */
  byModel: { model: string; cost: number; percentage: number }[];

  /** Costs broken down by feature */
  byFeature: { feature: string; cost: number; percentage: number }[];

  /** Costs broken down by user */
  byUser: { user: string; cost: number; percentage: number }[];

  /** Period covered */
  period: { start: number; end: number };
}

export interface QualityScoreData {
  /** Overall quality score (0-100) */
  overallScore: number;

  /** Dimensional scores */
  scores: { dimension: string; score: number; trend: number }[];

  /** Historical scores */
  history: { timestamp: number; score: number }[];
}

export interface UsageChartData {
  /** Data points */
  dataPoints: {
    timestamp: number;
    events: number;
    tokens: number;
    sessions: number;
    cost: number;
  }[];

  /** Period label */
  period: string;

  /** Time granularity */
  granularity: string;
}

export interface ErrorFeedData {
  /** Error entries */
  errors: {
    id: string;
    type: string;
    message: string;
    sessionId: string;
    timestamp: number;
    count: number;
  }[];

  /** Total number of errors */
  totalErrors: number;

  /** Error rate (errors per request) */
  errorRate: number;
}

// ============================================================================
// Rendering
// ============================================================================

export interface EmbedRenderOutput {
  /** Rendered HTML */
  html: string;

  /** Widget CSS */
  css: string;

  /** Widget JavaScript */
  js: string;
}

// ============================================================================
// Metrics
// ============================================================================

export interface EmbedMetrics {
  /** Total tokens issued */
  tokensIssued: number;

  /** Currently active (non-expired, non-revoked) tokens */
  activeTokens: number;

  /** Total widgets rendered */
  widgetsRendered: number;

  /** Total data queries executed */
  dataQueriesExecuted: number;
}
