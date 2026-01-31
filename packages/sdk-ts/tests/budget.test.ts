import { describe, it, expect, beforeEach } from "vitest";
import { BudgetManager } from "../src/budget";
import type { BudgetConfig, Budget } from "../src/budget";

describe("BudgetManager", () => {
  let manager: BudgetManager;
  const mockConfig: BudgetConfig = {
    enabled: true,
    budgets: [],
  };

  beforeEach(() => {
    manager = new BudgetManager(mockConfig);
  });

  describe("initialization", () => {
    it("should create manager with config", () => {
      expect(manager).toBeInstanceOf(BudgetManager);
    });

    it("should report enabled status", () => {
      expect(manager.isEnabled).toBe(true);
    });
  });

  describe("budget management", () => {
    it("should create a budget", () => {
      const budget = manager.createBudget("Monthly Budget", 1000, "monthly", {
        type: "organization",
        id: "org-123",
      });

      expect(budget).toBeDefined();
      expect(budget.id).toBeDefined();
      expect(budget.amount).toBe(1000);
      expect(budget.currentSpend).toBe(0);
    });

    it("should get budget by ID", () => {
      const created = manager.createBudget("Test Budget", 500, "weekly", {
        type: "organization",
        id: "org-123",
      });

      const retrieved = manager.getBudget(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("Test Budget");
    });

    it("should list all budgets", () => {
      manager.createBudget("B1", 100, "daily", {
        type: "organization",
        id: "org-1",
      });
      manager.createBudget("B2", 200, "weekly", {
        type: "organization",
        id: "org-1",
      });

      const budgets = manager.listBudgets();
      expect(budgets.length).toBeGreaterThanOrEqual(2);
    });

    it("should update budget amount", () => {
      const budget = manager.createBudget("Update Test", 100, "monthly", {
        type: "organization",
        id: "org-123",
      });

      const updated = manager.updateBudgetAmount(budget.id, 200);
      expect(updated?.amount).toBe(200);
    });

    it("should delete budget", () => {
      const budget = manager.createBudget("To Delete", 100, "monthly", {
        type: "organization",
        id: "org-123",
      });

      const deleted = manager.deleteBudget(budget.id);
      expect(deleted).toBe(true);
      expect(manager.getBudget(budget.id)).toBeUndefined();
    });

    it("should handle different period types", () => {
      const daily = manager.createBudget("Daily", 10, "daily", {
        type: "organization",
        id: "o1",
      });
      const weekly = manager.createBudget("Weekly", 70, "weekly", {
        type: "organization",
        id: "o1",
      });
      const monthly = manager.createBudget("Monthly", 300, "monthly", {
        type: "organization",
        id: "o1",
      });

      expect(daily.period).toBe("daily");
      expect(weekly.period).toBe("weekly");
      expect(monthly.period).toBe("monthly");
    });

    it("should create budget with alert thresholds", () => {
      const budget = manager.createBudget(
        "Alert Test",
        100,
        "monthly",
        { type: "organization", id: "org-123" },
        { alertThresholds: [50, 75, 90, 100] },
      );

      expect(budget.alertThresholds).toBeDefined();
      expect(budget.alertThresholds.length).toBe(4);
    });
  });
});
