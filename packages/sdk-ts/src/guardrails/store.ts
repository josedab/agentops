/**
 * In-Memory Cost Record Store
 *
 * Default implementation of CostRecordStore that stores records in memory.
 * For production, implement a persistent store (e.g., Redis, database).
 */

import type { CostRecord, CostRecordStore, CostRecordFilter } from "./types.js";

export class InMemoryCostRecordStore implements CostRecordStore {
  private records: CostRecord[] = [];
  private maxRecords: number;

  constructor(maxRecords: number = 100000) {
    this.maxRecords = maxRecords;
  }

  add(record: CostRecord): void {
    this.records.push(record);
    if (this.records.length > this.maxRecords) {
      this.prune(this.maxRecords);
    }
  }

  query(filter: CostRecordFilter): CostRecord[] {
    return this.records.filter((record) => {
      if (filter.sinceMs && record.timestamp < filter.sinceMs) return false;
      if (filter.untilMs && record.timestamp > filter.untilMs) return false;
      if (filter.sessionId && record.sessionId !== filter.sessionId)
        return false;
      if (filter.userId && record.userId !== filter.userId) return false;
      if (filter.featureId && record.featureId !== filter.featureId)
        return false;
      if (filter.model && record.model !== filter.model) return false;
      return true;
    });
  }

  getBySession(sessionId: string): CostRecord[] {
    return this.records.filter((r) => r.sessionId === sessionId);
  }

  getByUser(userId: string, sinceMs?: number): CostRecord[] {
    return this.records.filter(
      (r) =>
        r.userId === userId &&
        (sinceMs === undefined || r.timestamp >= sinceMs),
    );
  }

  getRecent(windowMs: number): CostRecord[] {
    const cutoff = Date.now() - windowMs;
    return this.records.filter((r) => r.timestamp >= cutoff);
  }

  count(): number {
    return this.records.length;
  }

  clear(): void {
    this.records = [];
  }

  prune(maxRecords: number): void {
    if (this.records.length > maxRecords) {
      // Keep most recent records
      this.records = this.records.slice(-maxRecords);
    }
  }
}
