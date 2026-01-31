/**
 * AgentOps SDK - Cost Tracker
 *
 * Single-responsibility class for recording costs and analyzing spending.
 * Extracted from CostGuardrailsEngine for better maintainability.
 */

import { generateEventId, now } from "../utils.js";
import {
  CostRecord,
  CostRecordStore,
  SpendingSummary,
  CostLimit,
  LimitType,
} from "./types.js";

/**
 * Tracks cost records and provides spending analysis.
 */
export class CostTracker {
  private totalCostTracked = 0;

  constructor(private readonly costStore: CostRecordStore) {}

  /**
   * Record a cost event
   */
  recordCost(record: Omit<CostRecord, "id">): CostRecord {
    const fullRecord: CostRecord = {
      id: generateEventId(),
      ...record,
    };

    this.costStore.add(fullRecord);
    this.totalCostTracked += record.cost;

    return fullRecord;
  }

  /**
   * Get spending summary for a time period
   */
  getSpendingSummary(
    startTime: number,
    endTime: number = now(),
  ): SpendingSummary {
    const records = this.costStore.query({
      sinceMs: startTime,
      untilMs: endTime,
    });

    const summary: SpendingSummary = {
      total: 0,
      bySession: {},
      byUser: {},
      byFeature: {},
      byModel: {},
      period: { start: startTime, end: endTime },
    };

    for (const record of records) {
      summary.total += record.cost;

      summary.bySession[record.sessionId] =
        (summary.bySession[record.sessionId] || 0) + record.cost;

      if (record.userId) {
        summary.byUser[record.userId] =
          (summary.byUser[record.userId] || 0) + record.cost;
      }

      if (record.featureId) {
        summary.byFeature[record.featureId] =
          (summary.byFeature[record.featureId] || 0) + record.cost;
      }

      if (record.model) {
        summary.byModel[record.model] =
          (summary.byModel[record.model] || 0) + record.cost;
      }
    }

    return summary;
  }

  /**
   * Get records matching a filter
   */
  queryRecords(filter: {
    sinceMs?: number;
    untilMs?: number;
    sessionId?: string;
    userId?: string;
    featureId?: string;
    model?: string;
  }): CostRecord[] {
    return this.costStore.query(filter);
  }

  /**
   * Get records for a specific scope
   */
  getRecordsForScope(
    type: LimitType,
    scopeId: string,
    sinceMs?: number,
  ): CostRecord[] {
    const baseRecords = sinceMs
      ? this.costStore.query({ sinceMs })
      : this.costStore.query({});

    return baseRecords.filter((r) => {
      switch (type) {
        case "session":
          return r.sessionId === scopeId;
        case "user":
          return r.userId === scopeId;
        case "feature":
          return r.featureId === scopeId;
        case "model":
          return r.model === scopeId;
        case "global":
          return true;
      }
    });
  }

  /**
   * Group costs by unit for analysis
   */
  groupCostsByUnit(
    records: CostRecord[],
    type: LimitType,
  ): Record<string, number> {
    const groups: Record<string, number> = {};

    for (const record of records) {
      let key: string;

      switch (type) {
        case "session":
          key = record.sessionId;
          break;
        case "user":
          key = record.userId ?? "unknown";
          break;
        case "feature":
          key = record.featureId ?? "unknown";
          break;
        case "model":
          key = record.model ?? "unknown";
          break;
        case "global":
          key = "global";
          break;
      }

      groups[key] = (groups[key] || 0) + record.cost;
    }

    return groups;
  }

  /**
   * Get unique scope IDs from records
   */
  getUniqueScopeIds(type: LimitType): string[] {
    const ids = new Set<string>();
    const records = this.costStore.query({});

    for (const record of records) {
      switch (type) {
        case "session":
          ids.add(record.sessionId);
          break;
        case "user":
          if (record.userId) ids.add(record.userId);
          break;
        case "feature":
          if (record.featureId) ids.add(record.featureId);
          break;
        case "model":
          if (record.model) ids.add(record.model);
          break;
      }
    }

    return Array.from(ids);
  }

  /**
   * Calculate spend within a rolling window for a limit
   */
  calculateWindowSpend(limit: CostLimit): number {
    if (!limit.windowMs) {
      // No rolling window, get all records for scope
      return this.getRecordsForScope(limit.type, limit.scopeId).reduce(
        (sum, r) => sum + r.cost,
        0,
      );
    }

    const cutoff = now() - limit.windowMs;
    const records = this.getRecordsForScope(limit.type, limit.scopeId, cutoff);
    return records.reduce((sum, r) => sum + r.cost, 0);
  }

  /**
   * Get total cost tracked
   */
  getTotalCostTracked(): number {
    return this.totalCostTracked;
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.costStore.clear();
    this.totalCostTracked = 0;
  }
}
