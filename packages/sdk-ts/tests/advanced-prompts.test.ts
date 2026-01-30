import { describe, it, expect, beforeEach } from "vitest";
import {
  VersionControlledRegistry,
  AdvancedExperimentManager,
} from "../src/prompts";

describe("VersionControlledRegistry", () => {
  let registry: VersionControlledRegistry;

  beforeEach(() => {
    registry = new VersionControlledRegistry();
  });

  describe("basic operations", () => {
    it("should create a versioned prompt", () => {
      const prompt = registry.create("greeting", "Hello, {{name}}!", {
        description: "A greeting prompt",
        author: "test-user",
      });

      expect(prompt).toBeDefined();
      expect(prompt.id).toBeDefined();
      expect(prompt.name).toBe("greeting");
      expect(prompt.version).toBe("1.0.0");
      expect(prompt.currentBranch).toBe("main");
    });

    it("should commit changes and create new version", () => {
      const prompt = registry.create("test", "Version 1");
      const commit = registry.commit(prompt.id, "Version 2", "Updated content");

      expect(commit).toBeDefined();
      expect(commit?.version).toBe("1.0.1");
      expect(registry.get(prompt.id)?.template).toBe("Version 2");
    });

    it("should render templates with variables", () => {
      const prompt = registry.create(
        "template",
        "Hello, {{name}}! Your age is {{age}}.",
      );
      const rendered = registry.render(prompt.id, { name: "Alice", age: "30" });

      expect(rendered).toBe("Hello, Alice! Your age is 30.");
    });
  });

  describe("branching", () => {
    it("should create a new branch", () => {
      const prompt = registry.create("test", "Initial");
      const branch = registry.createBranch(prompt.id, "feature-x", {
        description: "Experimental feature",
      });

      expect(branch).toBeDefined();
      expect(branch?.name).toBe("feature-x");
      expect(branch?.createdFrom).toBe("main");
    });

    it("should switch branches", () => {
      const prompt = registry.create("test", "Main content");
      registry.createBranch(prompt.id, "feature");
      registry.checkout(prompt.id, "feature");
      registry.commit(prompt.id, "Feature content", "Feature change");

      expect(registry.get(prompt.id)?.currentBranch).toBe("feature");
      expect(registry.get(prompt.id)?.template).toBe("Feature content");

      registry.checkout(prompt.id, "main");
      expect(registry.get(prompt.id)?.template).toBe("Main content");
    });

    it("should list all branches", () => {
      const prompt = registry.create("test", "Initial");
      registry.createBranch(prompt.id, "feature-a");
      registry.createBranch(prompt.id, "feature-b");

      const branches = registry.listBranches(prompt.id);
      expect(branches.length).toBe(3);
      expect(branches.map((b) => b.name)).toContain("main");
      expect(branches.map((b) => b.name)).toContain("feature-a");
      expect(branches.map((b) => b.name)).toContain("feature-b");
    });

    it("should not delete main or current branch", () => {
      const prompt = registry.create("test", "Initial");
      const deleted = registry.deleteBranch(prompt.id, "main");
      expect(deleted).toBe(false);
    });
  });

  describe("tagging", () => {
    it("should create a tag", () => {
      const prompt = registry.create("test", "Initial");
      const tag = registry.tag(prompt.id, "v1.0.0", {
        message: "First release",
      });

      expect(tag).toBeDefined();
      expect(tag?.name).toBe("v1.0.0");
      expect(tag?.version).toBe("1.0.0");
    });

    it("should list all tags", () => {
      const prompt = registry.create("test", "Initial");
      registry.tag(prompt.id, "v1.0.0");
      registry.commit(prompt.id, "Updated", "Update");
      registry.tag(prompt.id, "v1.0.1");

      const tags = registry.listTags(prompt.id);
      expect(tags.length).toBe(2);
    });

    it("should checkout a specific tag", () => {
      const prompt = registry.create("test", "Version 1");
      registry.tag(prompt.id, "v1");
      registry.commit(prompt.id, "Version 2", "Update");

      registry.checkoutVersion(prompt.id, "v1");
      expect(registry.get(prompt.id)?.template).toBe("Version 1");
    });
  });

  describe("diffing", () => {
    it("should generate diff between versions", () => {
      const prompt = registry.create("test", "Line 1\nLine 2\nLine 3");
      registry.commit(
        prompt.id,
        "Line 1\nLine 2 Modified\nLine 3\nLine 4",
        "Changes",
      );

      const diff = registry.diff(prompt.id, "1.0.0", "1.0.1");

      expect(diff).toBeDefined();
      expect(diff?.stats.linesAdded).toBeGreaterThan(0);
      expect(diff?.stats.linesDeleted).toBeGreaterThan(0);
    });
  });

  describe("history", () => {
    it("should get commit history", () => {
      const prompt = registry.create("test", "v1");
      registry.commit(prompt.id, "v2", "Second commit");
      registry.commit(prompt.id, "v3", "Third commit");

      const history = registry.getHistory(prompt.id);
      expect(history.length).toBe(3);
    });

    it("should limit history results", () => {
      const prompt = registry.create("test", "v1");
      registry.commit(prompt.id, "v2", "Second");
      registry.commit(prompt.id, "v3", "Third");

      const history = registry.getHistory(prompt.id, { limit: 2 });
      expect(history.length).toBe(2);
    });
  });

  describe("rollback", () => {
    it("should rollback to previous version", () => {
      const prompt = registry.create("test", "Original");
      registry.commit(prompt.id, "Modified", "Change");

      const rollback = registry.rollback(prompt.id, "1.0.0");
      expect(rollback).toBeDefined();
      expect(registry.get(prompt.id)?.template).toBe("Original");
    });
  });

  describe("export/import", () => {
    it("should export and import prompts", () => {
      const prompt = registry.create("test", "Content", {
        description: "Test prompt",
      });
      registry.commit(prompt.id, "Updated", "Update");
      registry.tag(prompt.id, "v1.0");

      const exported = registry.export(prompt.id);
      expect(exported).toBeDefined();

      const newRegistry = new VersionControlledRegistry();
      const imported = newRegistry.import(exported!);

      expect(imported.id).toBe(prompt.id);
      expect(imported.commits.length).toBe(2);
      expect(newRegistry.listTags(prompt.id).length).toBe(1);
    });
  });
});

describe("AdvancedExperimentManager", () => {
  let manager: AdvancedExperimentManager;

  beforeEach(() => {
    manager = new AdvancedExperimentManager();
  });

  describe("experiment creation", () => {
    it("should create an advanced experiment", () => {
      const experiment = manager.createExperiment({
        name: "Test Experiment",
        variants: [
          {
            name: "Control",
            promptTemplateId: "prompt-1",
            trafficAllocation: 50,
            isControl: true,
          },
          {
            name: "Treatment",
            promptTemplateId: "prompt-2",
            trafficAllocation: 50,
          },
        ],
        primaryMetric: "quality_score",
        autoWinner: true,
        maxRunDays: 14,
      });

      expect(experiment).toBeDefined();
      expect(experiment.id).toBeDefined();
      expect(experiment.status).toBe("draft");
      expect(experiment.variants.length).toBe(2);
    });

    it("should normalize traffic allocations", () => {
      const experiment = manager.createExperiment({
        name: "Test",
        variants: [
          { name: "A", promptTemplateId: "p1", trafficAllocation: 30 },
          { name: "B", promptTemplateId: "p2", trafficAllocation: 70 },
        ],
        primaryMetric: "quality_score",
      });

      const totalAllocation = experiment.variants.reduce(
        (sum, v) => sum + v.trafficAllocation,
        0,
      );
      expect(totalAllocation).toBeCloseTo(1, 5);
    });
  });

  describe("experiment lifecycle", () => {
    it("should start an experiment", () => {
      const experiment = manager.createExperiment({
        name: "Lifecycle Test",
        variants: [
          { name: "Control", promptTemplateId: "p1", trafficAllocation: 100 },
        ],
        primaryMetric: "latency",
      });

      const started = manager.startExperiment(experiment.id);
      expect(started?.status).toBe("running");
      expect(started?.startedAt).toBeDefined();
    });

    it("should pause and resume experiment", () => {
      const experiment = manager.createExperiment({
        name: "Pause Test",
        variants: [
          { name: "Control", promptTemplateId: "p1", trafficAllocation: 100 },
        ],
        primaryMetric: "quality_score",
      });

      manager.startExperiment(experiment.id);
      const paused = manager.pauseExperiment(experiment.id);
      expect(paused?.status).toBe("paused");

      const resumed = manager.resumeExperiment(experiment.id);
      expect(resumed?.status).toBe("running");
    });

    it("should complete experiment", () => {
      const experiment = manager.createExperiment({
        name: "Complete Test",
        variants: [
          { name: "Control", promptTemplateId: "p1", trafficAllocation: 50 },
          { name: "Treatment", promptTemplateId: "p2", trafficAllocation: 50 },
        ],
        primaryMetric: "quality_score",
      });

      manager.startExperiment(experiment.id);
      const completed = manager.completeExperiment(
        experiment.id,
        experiment.variants[1].id,
      );

      expect(completed?.status).toBe("completed");
      expect(completed?.winnerVariantId).toBe(experiment.variants[1].id);
    });
  });

  describe("variant assignment", () => {
    it("should assign variants consistently for same user", () => {
      const experiment = manager.createExperiment({
        name: "Assignment Test",
        variants: [
          { name: "Control", promptTemplateId: "p1", trafficAllocation: 50 },
          { name: "Treatment", promptTemplateId: "p2", trafficAllocation: 50 },
        ],
        primaryMetric: "quality_score",
      });

      manager.startExperiment(experiment.id);

      const variant1 = manager.getVariantForUser(experiment.id, "user-123");
      const variant2 = manager.getVariantForUser(experiment.id, "user-123");

      expect(variant1?.id).toBe(variant2?.id);
    });

    it("should distribute users across variants", () => {
      const experiment = manager.createExperiment({
        name: "Distribution Test",
        variants: [
          { name: "Control", promptTemplateId: "p1", trafficAllocation: 50 },
          { name: "Treatment", promptTemplateId: "p2", trafficAllocation: 50 },
        ],
        primaryMetric: "quality_score",
      });

      manager.startExperiment(experiment.id);

      const assignments: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        const variant = manager.getVariantForUser(experiment.id, `user-${i}`);
        if (variant) {
          assignments[variant.id] = (assignments[variant.id] || 0) + 1;
        }
      }

      // Expect roughly even distribution (within 10% of expected)
      const variantIds = Object.keys(assignments);
      expect(variantIds.length).toBe(2);

      for (const id of variantIds) {
        const ratio = assignments[id] / 1000;
        expect(ratio).toBeGreaterThan(0.4);
        expect(ratio).toBeLessThan(0.6);
      }
    });
  });

  describe("metric recording", () => {
    it("should record samples", () => {
      const experiment = manager.createExperiment({
        name: "Metrics Test",
        variants: [
          { name: "Control", promptTemplateId: "p1", trafficAllocation: 100 },
        ],
        primaryMetric: "quality_score",
      });

      manager.startExperiment(experiment.id);
      const variantId = experiment.variants[0].id;

      manager.recordSample(experiment.id, variantId, 8.5);
      manager.recordSample(experiment.id, variantId, 7.5);
      manager.recordSample(experiment.id, variantId, 9.0);

      const samples = manager.getSamples(experiment.id, variantId);
      expect(samples.length).toBe(3);
    });

    it("should record binary outcomes", () => {
      const experiment = manager.createExperiment({
        name: "Binary Test",
        variants: [
          { name: "Control", promptTemplateId: "p1", trafficAllocation: 100 },
        ],
        primaryMetric: "success_rate",
      });

      manager.startExperiment(experiment.id);
      const variantId = experiment.variants[0].id;

      manager.recordOutcome(experiment.id, variantId, true);
      manager.recordOutcome(experiment.id, variantId, true);
      manager.recordOutcome(experiment.id, variantId, false);

      const samples = manager.getSamples(experiment.id, variantId);
      expect(samples.length).toBe(3);
      expect(samples.filter((s) => s.value === 1).length).toBe(2);
    });
  });

  describe("statistical analysis", () => {
    it("should compute extended metrics", () => {
      const experiment = manager.createExperiment({
        name: "Analysis Test",
        variants: [
          { name: "Control", promptTemplateId: "p1", trafficAllocation: 50 },
          { name: "Treatment", promptTemplateId: "p2", trafficAllocation: 50 },
        ],
        primaryMetric: "quality_score",
      });

      manager.startExperiment(experiment.id);
      const control = experiment.variants.find((v) => v.isControl)!;
      const treatment = experiment.variants.find((v) => !v.isControl)!;

      // Add samples for control (mean ~7)
      for (let i = 0; i < 50; i++) {
        manager.recordSample(experiment.id, control.id, 6 + Math.random() * 2);
      }

      // Add samples for treatment (mean ~8)
      for (let i = 0; i < 50; i++) {
        manager.recordSample(
          experiment.id,
          treatment.id,
          7 + Math.random() * 2,
        );
      }

      const metrics = manager.getExtendedMetrics(experiment.id);
      expect(metrics.length).toBe(2);

      for (const m of metrics) {
        expect(m.sampleSize).toBe(50);
        expect(m.mean).toBeGreaterThan(0);
        expect(m.stdDev).toBeGreaterThan(0);
        expect(m.median).toBeGreaterThan(0);
        expect(m.bayesian.probabilityOfBeingBest).toBeGreaterThanOrEqual(0);
        expect(m.bayesian.probabilityOfBeingBest).toBeLessThanOrEqual(1);
      }
    });

    it("should analyze results with significance testing", () => {
      const experiment = manager.createExperiment({
        name: "Significance Test",
        variants: [
          {
            name: "Control",
            promptTemplateId: "p1",
            trafficAllocation: 50,
            isControl: true,
          },
          { name: "Treatment", promptTemplateId: "p2", trafficAllocation: 50 },
        ],
        primaryMetric: "quality_score",
        minSampleSize: 30,
      });

      manager.startExperiment(experiment.id);
      const control = experiment.variants.find((v) => v.isControl)!;
      const treatment = experiment.variants.find((v) => !v.isControl)!;

      // Control: mean ~5
      for (let i = 0; i < 100; i++) {
        manager.recordSample(experiment.id, control.id, 4 + Math.random() * 2);
      }

      // Treatment: mean ~8 (clear improvement)
      for (let i = 0; i < 100; i++) {
        manager.recordSample(
          experiment.id,
          treatment.id,
          7 + Math.random() * 2,
        );
      }

      const results = manager.analyzeResults(experiment.id);
      expect(results).toBeDefined();
      expect(results?.comparisons.length).toBe(1);
      expect(results?.bayesianAnalysis).toBeDefined();
      expect(results?.powerAnalysis).toBeDefined();
      expect(results?.summary).toBeDefined();
    });

    it("should perform power analysis", () => {
      const experiment = manager.createExperiment({
        name: "Power Test",
        variants: [
          { name: "Control", promptTemplateId: "p1", trafficAllocation: 50 },
          { name: "Treatment", promptTemplateId: "p2", trafficAllocation: 50 },
        ],
        primaryMetric: "quality_score",
        minimumDetectableEffect: 0.1,
        statisticalPower: 0.8,
      });

      manager.startExperiment(experiment.id);

      // Add minimal samples
      for (let i = 0; i < 10; i++) {
        manager.recordSample(
          experiment.id,
          experiment.variants[0].id,
          7 + Math.random(),
        );
        manager.recordSample(
          experiment.id,
          experiment.variants[1].id,
          7 + Math.random(),
        );
      }

      const results = manager.analyzeResults(experiment.id);
      expect(results?.powerAnalysis.requiredSampleSize).toBeGreaterThan(0);
      expect(results?.powerAnalysis.currentPower).toBeDefined();
      expect(results?.powerAnalysis.isAdequatelyPowered).toBe(false); // With only 10 samples
    });
  });

  describe("allocation strategies", () => {
    it("should support epsilon-greedy allocation", () => {
      const experiment = manager.createExperiment({
        name: "Epsilon Greedy Test",
        variants: [
          { name: "Control", promptTemplateId: "p1", trafficAllocation: 50 },
          { name: "Treatment", promptTemplateId: "p2", trafficAllocation: 50 },
        ],
        primaryMetric: "quality_score",
        allocationStrategy: "epsilon_greedy",
        epsilon: 0.1,
      });

      manager.startExperiment(experiment.id);

      // Should not throw
      const variant = manager.getVariantForUser(experiment.id, "test-user");
      expect(variant).toBeDefined();
    });

    it("should support thompson sampling allocation", () => {
      const experiment = manager.createExperiment({
        name: "Thompson Test",
        variants: [
          { name: "Control", promptTemplateId: "p1", trafficAllocation: 50 },
          { name: "Treatment", promptTemplateId: "p2", trafficAllocation: 50 },
        ],
        primaryMetric: "quality_score",
        allocationStrategy: "thompson_sampling",
      });

      manager.startExperiment(experiment.id);

      // Should not throw
      const variant = manager.getVariantForUser(experiment.id, "test-user");
      expect(variant).toBeDefined();
    });
  });

  describe("experiment management", () => {
    it("should list experiments by status", () => {
      manager.createExperiment({
        name: "Draft 1",
        variants: [
          { name: "A", promptTemplateId: "p1", trafficAllocation: 100 },
        ],
        primaryMetric: "quality_score",
      });

      const exp2 = manager.createExperiment({
        name: "Running 1",
        variants: [
          { name: "A", promptTemplateId: "p1", trafficAllocation: 100 },
        ],
        primaryMetric: "quality_score",
      });
      manager.startExperiment(exp2.id);

      const drafts = manager.listExperiments("draft");
      const running = manager.listExperiments("running");

      expect(drafts.length).toBe(1);
      expect(running.length).toBe(1);
    });

    it("should delete experiments", () => {
      const experiment = manager.createExperiment({
        name: "To Delete",
        variants: [
          { name: "A", promptTemplateId: "p1", trafficAllocation: 100 },
        ],
        primaryMetric: "quality_score",
      });

      const deleted = manager.deleteExperiment(experiment.id);
      expect(deleted).toBe(true);
      expect(manager.getExperiment(experiment.id)).toBeUndefined();
    });
  });
});
