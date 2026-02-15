/**
 * AgentOps SDK - AI Cost Chargeback System Types
 *
 * Type definitions for cost allocation, invoicing, and chargeback reporting.
 *
 * @packageDocumentation
 */

// ============================================================================
// Configuration
// ============================================================================

export interface ChargebackConfig {
  /** Enable chargeback tracking */
  enabled: boolean;

  /** Currency for cost tracking */
  currency?: string;

  /** Billing period in milliseconds (default: 30 days) */
  billingPeriodMs?: number;

  /** Enable debug logging */
  debug?: boolean;
}

export interface ResolvedChargebackConfig {
  enabled: boolean;
  currency: string;
  billingPeriodMs: number;
  debug: boolean;
}

// ============================================================================
// Cost Centers
// ============================================================================

export type CostCenterType =
  | "organization"
  | "department"
  | "team"
  | "project"
  | "feature"
  | "user";

export interface CostCenter {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Type of cost center */
  type: CostCenterType;

  /** Parent cost center ID (null for root) */
  parentId: string | null;

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** Creation timestamp */
  createdAt: number;
}

// ============================================================================
// Allocation Rules
// ============================================================================

export type AllocationMethod =
  | "usage_proportional"
  | "fixed_split"
  | "equal_split"
  | "custom";

export interface AllocationRule {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Source cost center type */
  sourceType: CostCenterType;

  /** Allocation method */
  method: AllocationMethod;

  /** Split definitions (for fixed_split and equal_split) */
  splits: { costCenterId: string; percentage: number }[];

  /** Custom formula (optional, for custom method) */
  customFormula: string | null;
}

// ============================================================================
// Cost Entries
// ============================================================================

export interface CostEntry {
  /** Unique identifier */
  id: string;

  /** Cost center this cost belongs to */
  costCenterId: string;

  /** Cost amount */
  amount: number;

  /** Currency */
  currency: string;

  /** Model used */
  model: string;

  /** Token usage breakdown */
  tokens: { prompt: number; completion: number; total: number };

  /** Description of the cost */
  description: string;

  /** Timestamp of the cost event */
  timestamp: number;

  /** Additional metadata */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Invoices
// ============================================================================

export interface InvoiceLineItem {
  /** Model name */
  model: string;

  /** Total tokens used */
  tokens: number;

  /** Total cost */
  cost: number;

  /** Number of requests */
  count: number;

  /** Percentage of total invoice */
  percentage: number;
}

export interface Invoice {
  /** Unique identifier */
  id: string;

  /** Cost center ID */
  costCenterId: string;

  /** Cost center name */
  costCenterName: string;

  /** Period start timestamp */
  periodStart: number;

  /** Period end timestamp */
  periodEnd: number;

  /** Line items grouped by model */
  lineItems: InvoiceLineItem[];

  /** Subtotal */
  subtotal: number;

  /** Currency */
  currency: string;

  /** When the invoice was generated */
  generatedAt: number;

  /** Invoice status */
  status: "draft" | "finalized";
}

// ============================================================================
// Cost Reports
// ============================================================================

export interface CostReport {
  /** Unique identifier */
  id: string;

  /** Period start timestamp */
  periodStart: number;

  /** Period end timestamp */
  periodEnd: number;

  /** Total cost across all cost centers */
  totalCost: number;

  /** Currency */
  currency: string;

  /** Cost breakdown by cost center */
  costByCostCenter: {
    costCenterId: string;
    name: string;
    cost: number;
    percentage: number;
  }[];

  /** Cost breakdown by model */
  costByModel: {
    model: string;
    cost: number;
    tokens: number;
    percentage: number;
  }[];

  /** Percentage change vs prior period */
  trendVsPrior: number;

  /** Top spenders */
  topSpenders: { costCenterId: string; name: string; cost: number }[];

  /** When the report was generated */
  generatedAt: number;
}

// ============================================================================
// Metrics
// ============================================================================

export interface ChargebackMetrics {
  /** Total cost recorded */
  totalCostRecorded: number;

  /** Total invoices generated */
  totalInvoicesGenerated: number;

  /** Number of cost centers */
  costCenters: number;

  /** Active period cost */
  activePeriodCost: number;

  /** Average cost per cost center */
  avgCostPerCostCenter: number;
}
