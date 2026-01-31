/**
 * In-Memory Usage Record Store
 *
 * Default implementation of UsageRecordStore that stores records in memory.
 * For production, implement a persistent store (e.g., Redis, database).
 */

import type { UsageRecord, UsageRecordStore } from "./types.js";

export class InMemoryUsageStore implements UsageRecordStore {
  private records: UsageRecord[] = [];
  private maxRecords: number;

  constructor(maxRecords: number = 100000) {
    this.maxRecords = maxRecords;
  }

  add(record: UsageRecord): void {
    this.records.push(record);
    if (this.records.length > this.maxRecords) {
      this.records.shift();
    }
  }

  addBatch(records: UsageRecord[]): void {
    this.records.push(...records);
    while (this.records.length > this.maxRecords) {
      this.records.shift();
    }
  }

  query(startTime: number, endTime: number): UsageRecord[] {
    return this.records.filter(
      (r) => r.timestamp >= startTime && r.timestamp <= endTime,
    );
  }

  getAll(): UsageRecord[] {
    return [...this.records];
  }

  count(): number {
    return this.records.length;
  }

  clear(): void {
    this.records = [];
  }

  pruneOlderThan(timestamp: number): void {
    this.records = this.records.filter((r) => r.timestamp >= timestamp);
  }
}
