/**
 * Tests for AI Cost Chargeback System
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ChargebackEngine } from "../src/chargeback/index.js";
import type {
  CostCenter,
  CostEntry,
  AllocationRule,
  Invoice,
  CostReport,
} from "../src/chargeback/index.js";

function makeCostEntry(
  costCenterId: string,
  overrides: Partial<Omit<CostEntry, "id">> = {},
): Omit<CostEntry, "id"> {
  return {
    costCenterId,
    amount: 1.5,
    currency: "USD",
    model: "gpt-4",
    tokens: { prompt: 100, completion: 50, total: 150 },
    description: "Test cost",
    timestamp: Date.now(),
    metadata: {},
    ...overrides,
  };
}

describe("ChargebackEngine", () => {
  let engine: ChargebackEngine;

  beforeEach(() => {
    engine = new ChargebackEngine({ enabled: true });
  });

  // ==========================================================================
  // Cost Center CRUD
  // ==========================================================================

  describe("Cost Center CRUD", () => {
    it("should add a cost center and return it with id and createdAt", () => {
      const center = engine.addCostCenter({
        name: "Engineering",
        type: "department",
        parentId: null,
        metadata: {},
      });

      expect(center.id).toBeDefined();
      expect(center.name).toBe("Engineering");
      expect(center.type).toBe("department");
      expect(center.parentId).toBeNull();
      expect(center.createdAt).toBeGreaterThan(0);
    });

    it("should retrieve a cost center by ID", () => {
      const center = engine.addCostCenter({
        name: "Data Science",
        type: "team",
        parentId: null,
        metadata: {},
      });

      const retrieved = engine.getCostCenter(center.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe("Data Science");
    });

    it("should return undefined for unknown cost center ID", () => {
      expect(engine.getCostCenter("nonexistent")).toBeUndefined();
    });

    it("should list all cost centers", () => {
      engine.addCostCenter({
        name: "Org",
        type: "organization",
        parentId: null,
        metadata: {},
      });
      engine.addCostCenter({
        name: "Team A",
        type: "team",
        parentId: null,
        metadata: {},
      });

      const all = engine.listCostCenters();
      expect(all).toHaveLength(2);
    });

    it("should filter cost centers by type", () => {
      engine.addCostCenter({
        name: "Org",
        type: "organization",
        parentId: null,
        metadata: {},
      });
      engine.addCostCenter({
        name: "Team A",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.addCostCenter({
        name: "Team B",
        type: "team",
        parentId: null,
        metadata: {},
      });

      const teams = engine.listCostCenters({ type: "team" });
      expect(teams).toHaveLength(2);
      expect(teams.every((c) => c.type === "team")).toBe(true);
    });

    it("should filter cost centers by parentId", () => {
      const org = engine.addCostCenter({
        name: "Org",
        type: "organization",
        parentId: null,
        metadata: {},
      });
      engine.addCostCenter({
        name: "Team A",
        type: "team",
        parentId: org.id,
        metadata: {},
      });
      engine.addCostCenter({
        name: "Team B",
        type: "team",
        parentId: org.id,
        metadata: {},
      });
      engine.addCostCenter({
        name: "Other",
        type: "team",
        parentId: null,
        metadata: {},
      });

      const children = engine.listCostCenters({ parentId: org.id });
      expect(children).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Cost Center Hierarchy
  // ==========================================================================

  describe("Cost Center Hierarchy", () => {
    it("should build a recursive hierarchy tree", () => {
      const org = engine.addCostCenter({
        name: "Acme Corp",
        type: "organization",
        parentId: null,
        metadata: {},
      });
      const dept = engine.addCostCenter({
        name: "Engineering",
        type: "department",
        parentId: org.id,
        metadata: {},
      });
      const team = engine.addCostCenter({
        name: "ML Team",
        type: "team",
        parentId: dept.id,
        metadata: {},
      });

      const tree = engine.getCostCenterHierarchy(org.id);
      expect(tree).toBeDefined();
      expect(tree!.center.name).toBe("Acme Corp");
      expect(tree!.children).toHaveLength(1);
      expect(tree!.children[0].center.name).toBe("Engineering");
      expect(tree!.children[0].children).toHaveLength(1);
      expect(tree!.children[0].children[0].center.name).toBe("ML Team");
    });

    it("should return undefined for unknown root ID", () => {
      expect(engine.getCostCenterHierarchy("nonexistent")).toBeUndefined();
    });

    it("should return leaf node with empty children", () => {
      const leaf = engine.addCostCenter({
        name: "Leaf",
        type: "user",
        parentId: null,
        metadata: {},
      });
      const tree = engine.getCostCenterHierarchy(leaf.id);
      expect(tree!.children).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Cost Recording and Retrieval
  // ==========================================================================

  describe("Cost Recording", () => {
    it("should record a cost entry and return it with an ID", () => {
      const center = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      const entry = engine.recordCost(makeCostEntry(center.id));

      expect(entry.id).toBeDefined();
      expect(entry.amount).toBe(1.5);
      expect(entry.costCenterId).toBe(center.id);
    });

    it("should retrieve costs for a cost center", () => {
      const center = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(makeCostEntry(center.id));
      engine.recordCost(makeCostEntry(center.id, { amount: 2.0 }));

      const costs = engine.getCosts(center.id);
      expect(costs).toHaveLength(2);
    });

    it("should calculate total cost for a cost center", () => {
      const center = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(makeCostEntry(center.id, { amount: 1.0 }));
      engine.recordCost(makeCostEntry(center.id, { amount: 2.5 }));

      const total = engine.getTotalCost(center.id);
      expect(total).toBe(3.5);
    });

    it("should return 0 total for cost center with no costs", () => {
      const center = engine.addCostCenter({
        name: "Empty",
        type: "team",
        parentId: null,
        metadata: {},
      });
      expect(engine.getTotalCost(center.id)).toBe(0);
    });
  });

  // ==========================================================================
  // Cost Filtering by Period
  // ==========================================================================

  describe("Cost Filtering by Period", () => {
    it("should filter costs by period start", () => {
      const center = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(makeCostEntry(center.id, { timestamp: 1000 }));
      engine.recordCost(makeCostEntry(center.id, { timestamp: 2000 }));
      engine.recordCost(makeCostEntry(center.id, { timestamp: 3000 }));

      const costs = engine.getCosts(center.id, 2000);
      expect(costs).toHaveLength(2);
    });

    it("should filter costs by period end", () => {
      const center = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(makeCostEntry(center.id, { timestamp: 1000 }));
      engine.recordCost(makeCostEntry(center.id, { timestamp: 2000 }));
      engine.recordCost(makeCostEntry(center.id, { timestamp: 3000 }));

      const costs = engine.getCosts(center.id, undefined, 2000);
      expect(costs).toHaveLength(2);
    });

    it("should filter costs by both start and end", () => {
      const center = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(makeCostEntry(center.id, { timestamp: 1000 }));
      engine.recordCost(makeCostEntry(center.id, { timestamp: 2000 }));
      engine.recordCost(makeCostEntry(center.id, { timestamp: 3000 }));

      const costs = engine.getCosts(center.id, 1500, 2500);
      expect(costs).toHaveLength(1);
    });

    it("should compute total cost within a period", () => {
      const center = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(
        makeCostEntry(center.id, { amount: 1.0, timestamp: 1000 }),
      );
      engine.recordCost(
        makeCostEntry(center.id, { amount: 2.0, timestamp: 2000 }),
      );
      engine.recordCost(
        makeCostEntry(center.id, { amount: 3.0, timestamp: 3000 }),
      );

      const total = engine.getTotalCost(center.id, 1500, 2500);
      expect(total).toBe(2.0);
    });
  });

  // ==========================================================================
  // Allocation Rules
  // ==========================================================================

  describe("Allocation Rules", () => {
    it("should add and retrieve allocation rules", () => {
      const rule = engine.addAllocationRule({
        name: "50/50 Split",
        sourceType: "organization",
        method: "fixed_split",
        splits: [
          { costCenterId: "a", percentage: 50 },
          { costCenterId: "b", percentage: 50 },
        ],
        customFormula: null,
      });

      expect(rule.id).toBeDefined();
      const rules = engine.getAllocationRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe("50/50 Split");
    });

    it("should allocate costs with fixed_split method", () => {
      const source = engine.addCostCenter({
        name: "Shared",
        type: "organization",
        parentId: null,
        metadata: {},
      });
      const teamA = engine.addCostCenter({
        name: "Team A",
        type: "team",
        parentId: null,
        metadata: {},
      });
      const teamB = engine.addCostCenter({
        name: "Team B",
        type: "team",
        parentId: null,
        metadata: {},
      });

      engine.recordCost(makeCostEntry(source.id, { amount: 100 }));

      const rule = engine.addAllocationRule({
        name: "70/30",
        sourceType: "organization",
        method: "fixed_split",
        splits: [
          { costCenterId: teamA.id, percentage: 70 },
          { costCenterId: teamB.id, percentage: 30 },
        ],
        customFormula: null,
      });

      const allocated = engine.allocateCosts(source.id, rule.id);
      expect(allocated).toHaveLength(2);
      expect(allocated[0].amount).toBe(70);
      expect(allocated[1].amount).toBe(30);
    });

    it("should allocate costs with equal_split method", () => {
      const source = engine.addCostCenter({
        name: "Shared",
        type: "organization",
        parentId: null,
        metadata: {},
      });
      const teamA = engine.addCostCenter({
        name: "Team A",
        type: "team",
        parentId: null,
        metadata: {},
      });
      const teamB = engine.addCostCenter({
        name: "Team B",
        type: "team",
        parentId: null,
        metadata: {},
      });
      const teamC = engine.addCostCenter({
        name: "Team C",
        type: "team",
        parentId: null,
        metadata: {},
      });

      engine.recordCost(makeCostEntry(source.id, { amount: 90 }));

      const rule = engine.addAllocationRule({
        name: "Equal",
        sourceType: "organization",
        method: "equal_split",
        splits: [
          { costCenterId: teamA.id, percentage: 0 },
          { costCenterId: teamB.id, percentage: 0 },
          { costCenterId: teamC.id, percentage: 0 },
        ],
        customFormula: null,
      });

      const allocated = engine.allocateCosts(source.id, rule.id);
      expect(allocated).toHaveLength(3);
      expect(allocated[0].amount).toBe(30);
      expect(allocated[1].amount).toBe(30);
      expect(allocated[2].amount).toBe(30);
    });

    it("should allocate costs with usage_proportional method", () => {
      const source = engine.addCostCenter({
        name: "Shared",
        type: "organization",
        parentId: null,
        metadata: {},
      });
      const teamA = engine.addCostCenter({
        name: "Team A",
        type: "team",
        parentId: null,
        metadata: {},
      });
      const teamB = engine.addCostCenter({
        name: "Team B",
        type: "team",
        parentId: null,
        metadata: {},
      });

      // Team A has $75 existing usage, Team B has $25
      engine.recordCost(makeCostEntry(teamA.id, { amount: 75 }));
      engine.recordCost(makeCostEntry(teamB.id, { amount: 25 }));

      // $100 shared cost to distribute
      engine.recordCost(makeCostEntry(source.id, { amount: 100 }));

      const rule = engine.addAllocationRule({
        name: "Usage Based",
        sourceType: "organization",
        method: "usage_proportional",
        splits: [
          { costCenterId: teamA.id, percentage: 0 },
          { costCenterId: teamB.id, percentage: 0 },
        ],
        customFormula: null,
      });

      const allocated = engine.allocateCosts(source.id, rule.id);
      expect(allocated).toHaveLength(2);
      expect(allocated[0].amount).toBe(75); // 75% of 100
      expect(allocated[1].amount).toBe(25); // 25% of 100
    });

    it("should return empty array for unknown rule", () => {
      expect(engine.allocateCosts("x", "nonexistent")).toEqual([]);
    });

    it("should return empty array when source has no costs", () => {
      const source = engine.addCostCenter({
        name: "Empty",
        type: "organization",
        parentId: null,
        metadata: {},
      });
      const rule = engine.addAllocationRule({
        name: "Split",
        sourceType: "organization",
        method: "equal_split",
        splits: [{ costCenterId: "a", percentage: 100 }],
        customFormula: null,
      });

      expect(engine.allocateCosts(source.id, rule.id)).toEqual([]);
    });
  });

  // ==========================================================================
  // Invoice Generation
  // ==========================================================================

  describe("Invoice Generation", () => {
    it("should generate an invoice with line items grouped by model", () => {
      const center = engine.addCostCenter({
        name: "ML Team",
        type: "team",
        parentId: null,
        metadata: {},
      });

      engine.recordCost(
        makeCostEntry(center.id, {
          model: "gpt-4",
          amount: 10,
          tokens: { prompt: 100, completion: 50, total: 150 },
          timestamp: 5000,
        }),
      );
      engine.recordCost(
        makeCostEntry(center.id, {
          model: "gpt-4",
          amount: 15,
          tokens: { prompt: 200, completion: 100, total: 300 },
          timestamp: 6000,
        }),
      );
      engine.recordCost(
        makeCostEntry(center.id, {
          model: "gpt-3.5-turbo",
          amount: 5,
          tokens: { prompt: 500, completion: 200, total: 700 },
          timestamp: 7000,
        }),
      );

      const invoice = engine.generateInvoice(center.id, 4000, 8000);

      expect(invoice.id).toBeDefined();
      expect(invoice.costCenterId).toBe(center.id);
      expect(invoice.costCenterName).toBe("ML Team");
      expect(invoice.subtotal).toBe(30);
      expect(invoice.lineItems).toHaveLength(2);
      expect(invoice.status).toBe("draft");

      const gpt4Item = invoice.lineItems.find((i) => i.model === "gpt-4");
      expect(gpt4Item).toBeDefined();
      expect(gpt4Item!.cost).toBe(25);
      expect(gpt4Item!.tokens).toBe(450);
      expect(gpt4Item!.count).toBe(2);

      const gpt35Item = invoice.lineItems.find(
        (i) => i.model === "gpt-3.5-turbo",
      );
      expect(gpt35Item).toBeDefined();
      expect(gpt35Item!.cost).toBe(5);
      expect(gpt35Item!.count).toBe(1);
    });

    it("should generate invoice for empty period", () => {
      const center = engine.addCostCenter({
        name: "Empty",
        type: "team",
        parentId: null,
        metadata: {},
      });
      const invoice = engine.generateInvoice(center.id, 1000, 2000);

      expect(invoice.subtotal).toBe(0);
      expect(invoice.lineItems).toHaveLength(0);
    });

    it("should compute line item percentages correctly", () => {
      const center = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(
        makeCostEntry(center.id, {
          model: "gpt-4",
          amount: 75,
          timestamp: 5000,
        }),
      );
      engine.recordCost(
        makeCostEntry(center.id, {
          model: "gpt-3.5",
          amount: 25,
          timestamp: 5000,
        }),
      );

      const invoice = engine.generateInvoice(center.id, 4000, 6000);
      const gpt4 = invoice.lineItems.find((i) => i.model === "gpt-4");
      expect(gpt4!.percentage).toBe(75);
    });
  });

  // ==========================================================================
  // Invoice CSV Export
  // ==========================================================================

  describe("Invoice CSV Export", () => {
    it("should export invoice as CSV", () => {
      const center = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(
        makeCostEntry(center.id, {
          model: "gpt-4",
          amount: 10,
          timestamp: 5000,
        }),
      );

      const invoice = engine.generateInvoice(center.id, 4000, 6000);
      const csv = engine.exportInvoiceCSV(invoice);

      expect(csv).toContain("Model,Tokens,Cost,Count,Percentage");
      expect(csv).toContain("gpt-4");
      expect(csv).toContain("Subtotal");
    });
  });

  // ==========================================================================
  // Invoice Markdown Export
  // ==========================================================================

  describe("Invoice Markdown Export", () => {
    it("should export invoice as markdown", () => {
      const center = engine.addCostCenter({
        name: "ML Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(
        makeCostEntry(center.id, {
          model: "gpt-4",
          amount: 10,
          timestamp: 5000,
        }),
      );

      const invoice = engine.generateInvoice(center.id, 4000, 6000);
      const md = engine.exportInvoiceMarkdown(invoice);

      expect(md).toContain("# Invoice: ML Team");
      expect(md).toContain("**Period:**");
      expect(md).toContain("| Model |");
      expect(md).toContain("gpt-4");
      expect(md).toContain("**Subtotal:**");
    });
  });

  // ==========================================================================
  // Cost Report Generation
  // ==========================================================================

  describe("Cost Report Generation", () => {
    it("should generate an org-wide cost report", () => {
      const teamA = engine.addCostCenter({
        name: "Team A",
        type: "team",
        parentId: null,
        metadata: {},
      });
      const teamB = engine.addCostCenter({
        name: "Team B",
        type: "team",
        parentId: null,
        metadata: {},
      });

      engine.recordCost(
        makeCostEntry(teamA.id, {
          model: "gpt-4",
          amount: 60,
          timestamp: 5000,
        }),
      );
      engine.recordCost(
        makeCostEntry(teamA.id, {
          model: "gpt-3.5",
          amount: 15,
          timestamp: 5500,
        }),
      );
      engine.recordCost(
        makeCostEntry(teamB.id, {
          model: "gpt-4",
          amount: 25,
          timestamp: 6000,
        }),
      );

      const report = engine.generateCostReport(4000, 7000);

      expect(report.id).toBeDefined();
      expect(report.totalCost).toBe(100);
      expect(report.costByCostCenter).toHaveLength(2);
      expect(report.costByModel).toHaveLength(2);
      expect(report.generatedAt).toBeGreaterThan(0);
    });

    it("should compute cost center percentages", () => {
      const teamA = engine.addCostCenter({
        name: "Team A",
        type: "team",
        parentId: null,
        metadata: {},
      });
      const teamB = engine.addCostCenter({
        name: "Team B",
        type: "team",
        parentId: null,
        metadata: {},
      });

      engine.recordCost(
        makeCostEntry(teamA.id, { amount: 80, timestamp: 5000 }),
      );
      engine.recordCost(
        makeCostEntry(teamB.id, { amount: 20, timestamp: 5000 }),
      );

      const report = engine.generateCostReport(4000, 6000);
      const teamAReport = report.costByCostCenter.find(
        (c) => c.costCenterId === teamA.id,
      );
      expect(teamAReport!.percentage).toBe(80);
    });

    it("should compute model percentages", () => {
      const team = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });

      engine.recordCost(
        makeCostEntry(team.id, { model: "gpt-4", amount: 70, timestamp: 5000 }),
      );
      engine.recordCost(
        makeCostEntry(team.id, {
          model: "claude-3",
          amount: 30,
          timestamp: 5000,
        }),
      );

      const report = engine.generateCostReport(4000, 6000);
      const gpt4 = report.costByModel.find((m) => m.model === "gpt-4");
      expect(gpt4!.percentage).toBe(70);
    });
  });

  // ==========================================================================
  // Cost Report Trend Calculation
  // ==========================================================================

  describe("Cost Report Trend", () => {
    it("should calculate positive trend vs prior period", () => {
      const team = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });

      // Prior period: 1000-2000, cost = 50
      engine.recordCost(
        makeCostEntry(team.id, { amount: 50, timestamp: 1500 }),
      );
      // Current period: 2000-3000, cost = 75
      engine.recordCost(
        makeCostEntry(team.id, { amount: 75, timestamp: 2500 }),
      );

      const report = engine.generateCostReport(2000, 3000);
      expect(report.trendVsPrior).toBe(50); // 50% increase
    });

    it("should calculate negative trend vs prior period", () => {
      const team = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });

      // Prior period: 1000-2000, cost = 100
      engine.recordCost(
        makeCostEntry(team.id, { amount: 100, timestamp: 1500 }),
      );
      // Current period: 2000-3000, cost = 50
      engine.recordCost(
        makeCostEntry(team.id, { amount: 50, timestamp: 2500 }),
      );

      const report = engine.generateCostReport(2000, 3000);
      expect(report.trendVsPrior).toBe(-50); // 50% decrease
    });

    it("should return 0 trend when no prior period data", () => {
      const team = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(
        makeCostEntry(team.id, { amount: 50, timestamp: 5000 }),
      );

      const report = engine.generateCostReport(4000, 6000);
      expect(report.trendVsPrior).toBe(0);
    });
  });

  // ==========================================================================
  // Top Spenders
  // ==========================================================================

  describe("Top Spenders", () => {
    it("should identify top spenders sorted by cost", () => {
      const t1 = engine.addCostCenter({
        name: "Small",
        type: "team",
        parentId: null,
        metadata: {},
      });
      const t2 = engine.addCostCenter({
        name: "Big",
        type: "team",
        parentId: null,
        metadata: {},
      });
      const t3 = engine.addCostCenter({
        name: "Medium",
        type: "team",
        parentId: null,
        metadata: {},
      });

      engine.recordCost(makeCostEntry(t1.id, { amount: 10, timestamp: 5000 }));
      engine.recordCost(makeCostEntry(t2.id, { amount: 100, timestamp: 5000 }));
      engine.recordCost(makeCostEntry(t3.id, { amount: 50, timestamp: 5000 }));

      const report = engine.generateCostReport(4000, 6000);
      expect(report.topSpenders[0].name).toBe("Big");
      expect(report.topSpenders[1].name).toBe("Medium");
      expect(report.topSpenders[2].name).toBe("Small");
    });

    it("should limit top spenders to 5", () => {
      for (let i = 0; i < 10; i++) {
        const c = engine.addCostCenter({
          name: `Team ${i}`,
          type: "team",
          parentId: null,
          metadata: {},
        });
        engine.recordCost(
          makeCostEntry(c.id, { amount: i * 10, timestamp: 5000 }),
        );
      }

      const report = engine.generateCostReport(4000, 6000);
      expect(report.topSpenders).toHaveLength(5);
    });
  });

  // ==========================================================================
  // Metrics Tracking
  // ==========================================================================

  describe("Metrics Tracking", () => {
    it("should track total cost recorded", () => {
      const center = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(makeCostEntry(center.id, { amount: 10 }));
      engine.recordCost(makeCostEntry(center.id, { amount: 20 }));

      const metrics = engine.getMetrics();
      expect(metrics.totalCostRecorded).toBe(30);
    });

    it("should track cost center count", () => {
      engine.addCostCenter({
        name: "A",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.addCostCenter({
        name: "B",
        type: "team",
        parentId: null,
        metadata: {},
      });

      const metrics = engine.getMetrics();
      expect(metrics.costCenters).toBe(2);
    });

    it("should track invoice count", () => {
      const center = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(makeCostEntry(center.id, { timestamp: 5000 }));
      engine.generateInvoice(center.id, 4000, 6000);
      engine.generateInvoice(center.id, 4000, 6000);

      const metrics = engine.getMetrics();
      expect(metrics.totalInvoicesGenerated).toBe(2);
    });

    it("should compute average cost per cost center", () => {
      const a = engine.addCostCenter({
        name: "A",
        type: "team",
        parentId: null,
        metadata: {},
      });
      const b = engine.addCostCenter({
        name: "B",
        type: "team",
        parentId: null,
        metadata: {},
      });

      engine.recordCost(makeCostEntry(a.id, { amount: 40 }));
      engine.recordCost(makeCostEntry(b.id, { amount: 60 }));

      const metrics = engine.getMetrics();
      expect(metrics.avgCostPerCostCenter).toBe(50);
    });
  });

  // ==========================================================================
  // Reset
  // ==========================================================================

  describe("Reset", () => {
    it("should clear all state on reset", () => {
      const center = engine.addCostCenter({
        name: "Team",
        type: "team",
        parentId: null,
        metadata: {},
      });
      engine.recordCost(makeCostEntry(center.id));
      engine.addAllocationRule({
        name: "Rule",
        sourceType: "organization",
        method: "equal_split",
        splits: [],
        customFormula: null,
      });
      engine.generateInvoice(center.id, 0, Date.now());

      engine.reset();

      const metrics = engine.getMetrics();
      expect(metrics.totalCostRecorded).toBe(0);
      expect(metrics.costCenters).toBe(0);
      expect(metrics.totalInvoicesGenerated).toBe(0);
      expect(engine.listCostCenters()).toHaveLength(0);
      expect(engine.getAllocationRules()).toHaveLength(0);
    });
  });
});
