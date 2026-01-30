import { describe, it, expect, beforeEach } from "vitest";
import {
  PromptRegistry,
  ExperimentManager,
  TokenAnalyzer,
  type PromptTemplate,
} from "../src/prompts";

describe("PromptRegistry", () => {
  let registry: PromptRegistry;

  beforeEach(() => {
    registry = new PromptRegistry();
  });

  describe("template management", () => {
    it("should register a new template", () => {
      const template = registry.register("greeting", "Hello, {{name}}!", {
        description: "A simple greeting prompt",
      });

      expect(template).toBeDefined();
      expect(template.id).toBeDefined();
      expect(template.name).toBe("greeting");
    });

    it("should list all registered templates", () => {
      registry.register("template-1", "Test 1");
      registry.register("template-2", "Test 2");

      const templates = registry.list();
      expect(templates.length).toBeGreaterThanOrEqual(2);
    });

    it("should get template by name", () => {
      registry.register("my-template", "Hello {{name}}");
      const template = registry.getByName("my-template");

      expect(template).toBeDefined();
      expect(template?.template).toBe("Hello {{name}}");
    });

    it("should return undefined for non-existent template", () => {
      const template = registry.get("non-existent");
      expect(template).toBeUndefined();
    });
  });

  describe("template rendering", () => {
    it("should render template with variables", () => {
      const template = registry.register("greeting", "Hello, {{name}}!");
      const rendered = registry.render(template.id, { name: "World" });

      expect(rendered).toBe("Hello, World!");
    });

    it("should render template with multiple variables", () => {
      const template = registry.register(
        "intro",
        "{{greeting}}, my name is {{name}} and I am {{age}} years old.",
      );
      const rendered = registry.render(template.id, {
        greeting: "Hi",
        name: "Alice",
        age: "30",
      });

      expect(rendered).toBe("Hi, my name is Alice and I am 30 years old.");
    });
  });

  describe("version management", () => {
    it("should create a new version via update", () => {
      const template = registry.register("versioned", "Version 1: {{content}}");
      const updated = registry.update(template.id, "Version 2: {{content}}");

      expect(updated).toBeDefined();
      expect(updated?.version).toBe("1.0.1");
    });

    it("should get version history", () => {
      const template = registry.register("history-test", "v1");
      registry.update(template.id, "v2");
      registry.update(template.id, "v3");

      const history = registry.getVersionHistory(template.id);
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it("should rollback to previous version", () => {
      const template = registry.register("rollback-test", "Original");
      registry.update(template.id, "Updated");

      const rolledBack = registry.rollback(template.id, "1.0.0");
      expect(rolledBack).toBeDefined();

      const current = registry.get(template.id);
      expect(current?.template).toBe("Original");
    });
  });
});

describe("ExperimentManager", () => {
  let manager: ExperimentManager;

  beforeEach(() => {
    manager = new ExperimentManager();
  });

  describe("experiment lifecycle", () => {
    it("should create a new experiment", () => {
      const experiment = manager.createExperiment("Test Experiment", [
        {
          name: "Control",
          promptTemplateId: "template-1",
          trafficAllocation: 50,
          isControl: true,
        },
        {
          name: "Treatment",
          promptTemplateId: "template-2",
          trafficAllocation: 50,
        },
      ]);

      expect(experiment).toBeDefined();
      expect(experiment.id).toBeDefined();
      expect(experiment.status).toBe("draft");
    });

    it("should start an experiment", () => {
      const experiment = manager.createExperiment("Start Test", [
        {
          name: "Control",
          promptTemplateId: "template-1",
          trafficAllocation: 100,
          isControl: true,
        },
      ]);

      const started = manager.startExperiment(experiment.id);
      expect(started).toBeDefined();
      expect(started?.status).toBe("running");
    });

    it("should complete an experiment", () => {
      const experiment = manager.createExperiment("Complete Test", [
        {
          name: "Control",
          promptTemplateId: "template-1",
          trafficAllocation: 100,
          isControl: true,
        },
      ]);

      manager.startExperiment(experiment.id);
      const completed = manager.completeExperiment(experiment.id);
      expect(completed?.status).toBe("completed");
    });

    it("should get experiment by ID", () => {
      const created = manager.createExperiment("Get Test", [
        {
          name: "Control",
          promptTemplateId: "template-1",
          trafficAllocation: 100,
          isControl: true,
        },
      ]);

      const retrieved = manager.getExperiment(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("Get Test");
    });

    it("should list all experiments", () => {
      manager.createExperiment("Exp 1", [
        {
          name: "Control",
          promptTemplateId: "t1",
          trafficAllocation: 100,
          isControl: true,
        },
      ]);
      manager.createExperiment("Exp 2", [
        {
          name: "Control",
          promptTemplateId: "t2",
          trafficAllocation: 100,
          isControl: true,
        },
      ]);

      const experiments = manager.listExperiments();
      expect(experiments.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("variant assignment", () => {
    it("should assign a variant for a user", () => {
      const experiment = manager.createExperiment("Assignment Test", [
        {
          name: "Control",
          promptTemplateId: "template-1",
          trafficAllocation: 50,
          isControl: true,
        },
        {
          name: "Treatment",
          promptTemplateId: "template-2",
          trafficAllocation: 50,
        },
      ]);

      manager.startExperiment(experiment.id);
      const variant = manager.getVariantForUser(experiment.id, "user-123");

      expect(variant).toBeDefined();
    });

    it("should return consistent variant for same user", () => {
      const experiment = manager.createExperiment("Consistency Test", [
        {
          name: "Control",
          promptTemplateId: "template-1",
          trafficAllocation: 50,
          isControl: true,
        },
        {
          name: "Treatment",
          promptTemplateId: "template-2",
          trafficAllocation: 50,
        },
      ]);

      manager.startExperiment(experiment.id);
      const variant1 = manager.getVariantForUser(
        experiment.id,
        "consistent-user",
      );
      const variant2 = manager.getVariantForUser(
        experiment.id,
        "consistent-user",
      );

      expect(variant1?.id).toBe(variant2?.id);
    });
  });
});

describe("TokenAnalyzer", () => {
  let analyzer: TokenAnalyzer;

  beforeEach(() => {
    analyzer = new TokenAnalyzer("gpt-4");
  });

  describe("token estimation", () => {
    it("should estimate tokens for text", () => {
      const text = "Hello, world!";
      const tokens = analyzer.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(text.length);
    });

    it("should handle empty text", () => {
      const tokens = analyzer.estimateTokens("");
      expect(tokens).toBe(0);
    });

    it("should handle long text", () => {
      const longText = "a".repeat(10000);
      const tokens = analyzer.estimateTokens(longText);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(longText.length);
    });
  });

  describe("optimization suggestions", () => {
    it("should suggest optimizations for verbose prompt", () => {
      const verbosePrompt =
        "In order to help you understand, I would like to explain that the answer to your question is 42.";
      const suggestions = analyzer.suggestOptimizations(verbosePrompt);

      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe("model property", () => {
    it("should expose the model being used", () => {
      const customAnalyzer = new TokenAnalyzer("claude-3-opus");
      expect(customAnalyzer.model).toBe("claude-3-opus");
    });
  });
});
