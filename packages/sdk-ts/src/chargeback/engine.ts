/**
 * AgentOps SDK - Chargeback Engine
 *
 * Cost allocation, invoicing, and chargeback reporting engine for
 * tracking and distributing AI costs across organizational units.
 *
 * @packageDocumentation
 */

import type {
  ChargebackConfig,
  ResolvedChargebackConfig,
  CostCenter,
  CostCenterType,
  AllocationRule,
  CostEntry,
  Invoice,
  InvoiceLineItem,
  CostReport,
  ChargebackMetrics,
} from "./types.js";
import { generateEventId, now } from "../utils.js";

/** Recursive cost center tree node */
interface CostCenterTree {
  center: CostCenter;
  children: CostCenterTree[];
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: ResolvedChargebackConfig = {
  enabled: true,
  currency: "USD",
  billingPeriodMs: 2_592_000_000, // 30 days
  debug: false,
};

// ============================================================================
// ChargebackEngine
// ============================================================================

export class ChargebackEngine {
  private readonly config: ResolvedChargebackConfig;
  private costCenters: Map<string, CostCenter> = new Map();
  private allocationRules: Map<string, AllocationRule> = new Map();
  private costEntries: CostEntry[] = [];
  private invoiceCount = 0;

  constructor(config: ChargebackConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      currency: config.currency ?? DEFAULT_CONFIG.currency,
      billingPeriodMs: config.billingPeriodMs ?? DEFAULT_CONFIG.billingPeriodMs,
      debug: config.debug ?? DEFAULT_CONFIG.debug,
    };
  }

  // ==========================================================================
  // Cost Center Management
  // ==========================================================================

  /** Add a cost center */
  addCostCenter(center: Omit<CostCenter, "id" | "createdAt">): CostCenter {
    const costCenter: CostCenter = {
      ...center,
      id: generateEventId(),
      createdAt: now(),
    };
    this.costCenters.set(costCenter.id, costCenter);
    return costCenter;
  }

  /** Get a cost center by ID */
  getCostCenter(id: string): CostCenter | undefined {
    return this.costCenters.get(id);
  }

  /** List cost centers with optional filtering */
  listCostCenters(filter?: {
    type?: CostCenterType;
    parentId?: string;
  }): CostCenter[] {
    let results = Array.from(this.costCenters.values());
    if (filter?.type) {
      results = results.filter((c) => c.type === filter.type);
    }
    if (filter?.parentId !== undefined) {
      results = results.filter((c) => c.parentId === filter.parentId);
    }
    return results;
  }

  /** Get cost center hierarchy as a recursive tree */
  getCostCenterHierarchy(
    rootId: string,
  ): { center: CostCenter; children: CostCenterTree[] } | undefined {
    const center = this.costCenters.get(rootId);
    if (!center) return undefined;

    const children = Array.from(this.costCenters.values())
      .filter((c) => c.parentId === rootId)
      .map((c) => this.getCostCenterHierarchy(c.id)!)
      .filter(Boolean);

    return { center, children };
  }

  // ==========================================================================
  // Allocation Rules
  // ==========================================================================

  /** Add an allocation rule */
  addAllocationRule(rule: Omit<AllocationRule, "id">): AllocationRule {
    const allocationRule: AllocationRule = {
      ...rule,
      id: generateEventId(),
    };
    this.allocationRules.set(allocationRule.id, allocationRule);
    return allocationRule;
  }

  /** Get all allocation rules */
  getAllocationRules(): AllocationRule[] {
    return Array.from(this.allocationRules.values());
  }

  // ==========================================================================
  // Cost Recording
  // ==========================================================================

  /** Record a cost event */
  recordCost(entry: Omit<CostEntry, "id">): CostEntry {
    const costEntry: CostEntry = {
      ...entry,
      id: generateEventId(),
    };
    this.costEntries.push(costEntry);
    return costEntry;
  }

  /** Get costs for a cost center, optionally filtered by period */
  getCosts(
    costCenterId: string,
    periodStart?: number,
    periodEnd?: number,
  ): CostEntry[] {
    return this.costEntries.filter((e) => {
      if (e.costCenterId !== costCenterId) return false;
      if (periodStart !== undefined && e.timestamp < periodStart) return false;
      if (periodEnd !== undefined && e.timestamp > periodEnd) return false;
      return true;
    });
  }

  /** Get total cost for a cost center, optionally filtered by period */
  getTotalCost(
    costCenterId: string,
    periodStart?: number,
    periodEnd?: number,
  ): number {
    return this.getCosts(costCenterId, periodStart, periodEnd).reduce(
      (sum, e) => sum + e.amount,
      0,
    );
  }

  // ==========================================================================
  // Cost Allocation
  // ==========================================================================

  /** Apply allocation rule to distribute costs from source to targets */
  allocateCosts(sourceCostCenterId: string, ruleId: string): CostEntry[] {
    const rule = this.allocationRules.get(ruleId);
    if (!rule) return [];

    const sourceCosts = this.costEntries.filter(
      (e) => e.costCenterId === sourceCostCenterId,
    );
    const totalSourceCost = sourceCosts.reduce((s, e) => s + e.amount, 0);
    if (totalSourceCost === 0) return [];

    const newEntries: CostEntry[] = [];

    if (rule.method === "fixed_split") {
      for (const split of rule.splits) {
        const amount = totalSourceCost * (split.percentage / 100);
        const entry = this.recordCost({
          costCenterId: split.costCenterId,
          amount,
          currency: this.config.currency,
          model: "allocated",
          tokens: { prompt: 0, completion: 0, total: 0 },
          description: `Allocated from ${sourceCostCenterId} via ${rule.name}`,
          timestamp: now(),
          metadata: { sourceId: sourceCostCenterId, ruleId: rule.id },
        });
        newEntries.push(entry);
      }
    } else if (rule.method === "equal_split") {
      const splitCount = rule.splits.length;
      if (splitCount === 0) return [];
      const perSplit = totalSourceCost / splitCount;
      for (const split of rule.splits) {
        const entry = this.recordCost({
          costCenterId: split.costCenterId,
          amount: perSplit,
          currency: this.config.currency,
          model: "allocated",
          tokens: { prompt: 0, completion: 0, total: 0 },
          description: `Equally allocated from ${sourceCostCenterId} via ${rule.name}`,
          timestamp: now(),
          metadata: { sourceId: sourceCostCenterId, ruleId: rule.id },
        });
        newEntries.push(entry);
      }
    } else if (rule.method === "usage_proportional") {
      // Distribute based on existing usage of each target cost center
      const targetIds = rule.splits.map((s) => s.costCenterId);
      const targetUsage: Map<string, number> = new Map();
      let totalUsage = 0;
      for (const targetId of targetIds) {
        const usage = this.getTotalCost(targetId);
        targetUsage.set(targetId, usage);
        totalUsage += usage;
      }
      if (totalUsage === 0) {
        // Fall back to equal split if no usage data
        const perSplit = totalSourceCost / targetIds.length;
        for (const targetId of targetIds) {
          const entry = this.recordCost({
            costCenterId: targetId,
            amount: perSplit,
            currency: this.config.currency,
            model: "allocated",
            tokens: { prompt: 0, completion: 0, total: 0 },
            description: `Proportionally allocated from ${sourceCostCenterId} via ${rule.name}`,
            timestamp: now(),
            metadata: { sourceId: sourceCostCenterId, ruleId: rule.id },
          });
          newEntries.push(entry);
        }
      } else {
        for (const targetId of targetIds) {
          const usage = targetUsage.get(targetId) ?? 0;
          const amount = totalSourceCost * (usage / totalUsage);
          const entry = this.recordCost({
            costCenterId: targetId,
            amount,
            currency: this.config.currency,
            model: "allocated",
            tokens: { prompt: 0, completion: 0, total: 0 },
            description: `Proportionally allocated from ${sourceCostCenterId} via ${rule.name}`,
            timestamp: now(),
            metadata: { sourceId: sourceCostCenterId, ruleId: rule.id },
          });
          newEntries.push(entry);
        }
      }
    }

    return newEntries;
  }

  // ==========================================================================
  // Invoice Generation
  // ==========================================================================

  /** Generate invoice with line items grouped by model */
  generateInvoice(
    costCenterId: string,
    periodStart: number,
    periodEnd: number,
  ): Invoice {
    const center = this.costCenters.get(costCenterId);
    const costs = this.getCosts(costCenterId, periodStart, periodEnd);

    // Group by model
    const byModel: Map<
      string,
      { tokens: number; cost: number; count: number }
    > = new Map();

    for (const entry of costs) {
      const existing = byModel.get(entry.model) ?? {
        tokens: 0,
        cost: 0,
        count: 0,
      };
      existing.tokens += entry.tokens.total;
      existing.cost += entry.amount;
      existing.count += 1;
      byModel.set(entry.model, existing);
    }

    const subtotal = costs.reduce((s, e) => s + e.amount, 0);

    const lineItems: InvoiceLineItem[] = Array.from(byModel.entries()).map(
      ([model, data]) => ({
        model,
        tokens: data.tokens,
        cost: data.cost,
        count: data.count,
        percentage: subtotal > 0 ? (data.cost / subtotal) * 100 : 0,
      }),
    );

    this.invoiceCount++;

    return {
      id: generateEventId(),
      costCenterId,
      costCenterName: center?.name ?? "Unknown",
      periodStart,
      periodEnd,
      lineItems,
      subtotal,
      currency: this.config.currency,
      generatedAt: now(),
      status: "draft",
    };
  }

  /** Export invoice as CSV */
  exportInvoiceCSV(invoice: Invoice): string {
    const lines: string[] = [];
    lines.push("Model,Tokens,Cost,Count,Percentage");
    for (const item of invoice.lineItems) {
      lines.push(
        `${item.model},${item.tokens},${item.cost.toFixed(4)},${item.count},${item.percentage.toFixed(2)}%`,
      );
    }
    lines.push("");
    lines.push(`Subtotal,,${invoice.subtotal.toFixed(4)},,`);
    return lines.join("\n");
  }

  /** Export invoice as markdown */
  exportInvoiceMarkdown(invoice: Invoice): string {
    const lines: string[] = [];
    lines.push(`# Invoice: ${invoice.costCenterName}`);
    lines.push("");
    lines.push(
      `**Period:** ${new Date(invoice.periodStart).toISOString()} - ${new Date(invoice.periodEnd).toISOString()}`,
    );
    lines.push(`**Currency:** ${invoice.currency}`);
    lines.push(`**Status:** ${invoice.status}`);
    lines.push("");
    lines.push("| Model | Tokens | Cost | Count | % |");
    lines.push("|-------|--------|------|-------|---|");
    for (const item of invoice.lineItems) {
      lines.push(
        `| ${item.model} | ${item.tokens} | ${item.cost.toFixed(4)} | ${item.count} | ${item.percentage.toFixed(2)}% |`,
      );
    }
    lines.push("");
    lines.push(
      `**Subtotal:** ${invoice.subtotal.toFixed(4)} ${invoice.currency}`,
    );
    return lines.join("\n");
  }

  // ==========================================================================
  // Cost Reports
  // ==========================================================================

  /** Generate org-wide cost report with breakdowns and trend */
  generateCostReport(periodStart: number, periodEnd: number): CostReport {
    const periodCosts = this.costEntries.filter(
      (e) => e.timestamp >= periodStart && e.timestamp <= periodEnd,
    );
    const totalCost = periodCosts.reduce((s, e) => s + e.amount, 0);

    // Cost by cost center
    const byCostCenter: Map<string, number> = new Map();
    for (const entry of periodCosts) {
      const current = byCostCenter.get(entry.costCenterId) ?? 0;
      byCostCenter.set(entry.costCenterId, current + entry.amount);
    }

    const costByCostCenter = Array.from(byCostCenter.entries()).map(
      ([costCenterId, cost]) => ({
        costCenterId,
        name: this.costCenters.get(costCenterId)?.name ?? "Unknown",
        cost,
        percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
      }),
    );

    // Cost by model
    const byModel: Map<string, { cost: number; tokens: number }> = new Map();
    for (const entry of periodCosts) {
      const existing = byModel.get(entry.model) ?? { cost: 0, tokens: 0 };
      existing.cost += entry.amount;
      existing.tokens += entry.tokens.total;
      byModel.set(entry.model, existing);
    }

    const costByModel = Array.from(byModel.entries()).map(([model, data]) => ({
      model,
      cost: data.cost,
      tokens: data.tokens,
      percentage: totalCost > 0 ? (data.cost / totalCost) * 100 : 0,
    }));

    // Trend vs prior period
    const periodDuration = periodEnd - periodStart;
    const priorStart = periodStart - periodDuration;
    const priorEnd = periodStart;
    const priorCosts = this.costEntries.filter(
      (e) => e.timestamp >= priorStart && e.timestamp <= priorEnd,
    );
    const priorTotal = priorCosts.reduce((s, e) => s + e.amount, 0);
    const trendVsPrior =
      priorTotal > 0 ? ((totalCost - priorTotal) / priorTotal) * 100 : 0;

    // Top spenders (sorted by cost desc)
    const topSpenders = costByCostCenter
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)
      .map(({ costCenterId, name, cost }) => ({ costCenterId, name, cost }));

    return {
      id: generateEventId(),
      periodStart,
      periodEnd,
      totalCost,
      currency: this.config.currency,
      costByCostCenter,
      costByModel,
      trendVsPrior,
      topSpenders,
      generatedAt: now(),
    };
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  /** Get chargeback metrics */
  getMetrics(): ChargebackMetrics {
    const totalCostRecorded = this.costEntries.reduce(
      (s, e) => s + e.amount,
      0,
    );
    const costCenterCount = this.costCenters.size;

    // Active period cost (costs within the current billing period)
    const periodEnd = now();
    const periodStart = periodEnd - this.config.billingPeriodMs;
    const activePeriodCost = this.costEntries
      .filter((e) => e.timestamp >= periodStart && e.timestamp <= periodEnd)
      .reduce((s, e) => s + e.amount, 0);

    return {
      totalCostRecorded,
      totalInvoicesGenerated: this.invoiceCount,
      costCenters: costCenterCount,
      activePeriodCost,
      avgCostPerCostCenter:
        costCenterCount > 0 ? totalCostRecorded / costCenterCount : 0,
    };
  }

  // ==========================================================================
  // Reset
  // ==========================================================================

  /** Reset all state */
  reset(): void {
    this.costCenters.clear();
    this.allocationRules.clear();
    this.costEntries = [];
    this.invoiceCount = 0;
  }
}
