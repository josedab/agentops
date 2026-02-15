/**
 * Tests for Guardrail Marketplace Engine
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MarketplaceEngine } from "../src/marketplace/index.js";
import type {
  MarketplaceConfig,
  MarketplacePackage,
  GuardrailPackageContent,
  RubricPackageContent,
  InstalledPackage,
  PackageAuthor,
} from "../src/marketplace/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const author: PackageAuthor = {
  name: "Test Author",
  email: "test@example.com",
  verified: true,
};

function makeGuardrailPkg(
  id: string,
  overrides?: Partial<
    Omit<
      MarketplacePackage,
      "downloads" | "rating" | "ratingCount" | "createdAt" | "updatedAt"
    >
  >,
) {
  return {
    id,
    name: overrides?.name ?? `pkg-${id}`,
    version: "1.0.0",
    description: overrides?.description ?? `Description for ${id}`,
    author: overrides?.author ?? author,
    category: overrides?.category ?? ("guardrail" as const),
    tags: overrides?.tags ?? ["security"],
    dependencies: [],
    license: "MIT",
  };
}

const sampleGuardrailContent: GuardrailPackageContent = {
  policies: [
    {
      id: "pol-1",
      name: "Cost cap",
      description: "Limit cost per request",
      type: "cost_limit",
      rules: [
        { field: "cost", operator: "lte", value: 1.0, message: "Over budget" },
      ],
      severity: "critical",
      enabled: true,
    },
  ],
  description: "Sample guardrail content",
  configSchema: { maxCost: { type: "number" } },
};

const sampleRubricContent: RubricPackageContent = {
  criteria: [
    {
      name: "Accuracy",
      description: "How accurate is the response",
      weight: 0.6,
      scoreLevels: [
        { score: 1, description: "Poor" },
        { score: 5, description: "Excellent" },
      ],
    },
  ],
  description: "Sample rubric",
  scoringScale: { min: 1, max: 5, step: 1 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MarketplaceEngine", () => {
  let engine: MarketplaceEngine;
  let config: MarketplaceConfig;

  beforeEach(() => {
    config = { enabled: true };
    engine = new MarketplaceEngine(config);
  });

  // -------------------------------------------------------------------------
  // Publish & Retrieve
  // -------------------------------------------------------------------------

  describe("publish and retrieve", () => {
    it("should publish a package and retrieve it", () => {
      const pkg = engine.publish(
        makeGuardrailPkg("g1"),
        sampleGuardrailContent,
      );

      expect(pkg.id).toBe("g1");
      expect(pkg.downloads).toBe(0);
      expect(pkg.rating).toBe(0);
      expect(pkg.ratingCount).toBe(0);
      expect(pkg.createdAt).toBeInstanceOf(Date);

      const retrieved = engine.getPackage("g1");
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe("pkg-g1");
    });

    it("should reject duplicate package ids", () => {
      engine.publish(makeGuardrailPkg("dup"), sampleGuardrailContent);
      expect(() =>
        engine.publish(makeGuardrailPkg("dup"), sampleGuardrailContent),
      ).toThrow('Package "dup" already exists');
    });

    it("should unpublish a package", () => {
      engine.publish(makeGuardrailPkg("rm"), sampleGuardrailContent);
      expect(engine.unpublish("rm")).toBe(true);
      expect(engine.getPackage("rm")).toBeUndefined();
    });

    it("should return false when unpublishing non-existent package", () => {
      expect(engine.unpublish("nope")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  describe("search", () => {
    beforeEach(() => {
      engine.publish(
        makeGuardrailPkg("s1", {
          name: "alpha",
          category: "guardrail",
          tags: ["security", "cost"],
        }),
        sampleGuardrailContent,
      );
      engine.publish(
        makeGuardrailPkg("s2", {
          name: "beta",
          category: "rubric",
          tags: ["quality"],
        }),
        sampleRubricContent,
      );
      engine.publish(
        makeGuardrailPkg("s3", {
          name: "gamma",
          category: "guardrail",
          tags: ["pii"],
        }),
        sampleGuardrailContent,
      );
    });

    it("should return all packages with empty query", () => {
      const result = engine.search({});
      expect(result.total).toBe(3);
      expect(result.packages).toHaveLength(3);
      expect(result.hasMore).toBe(false);
    });

    it("should filter by category", () => {
      const result = engine.search({ category: "guardrail" });
      expect(result.total).toBe(2);
      expect(result.packages.every((p) => p.category === "guardrail")).toBe(
        true,
      );
    });

    it("should filter by text query", () => {
      const result = engine.search({ query: "alpha" });
      expect(result.total).toBe(1);
      expect(result.packages[0].name).toBe("alpha");
    });

    it("should filter by tags", () => {
      const result = engine.search({ tags: ["pii"] });
      expect(result.total).toBe(1);
      expect(result.packages[0].id).toBe("s3");
    });

    it("should sort by name", () => {
      const result = engine.search({ sortBy: "name" });
      expect(result.packages.map((p) => p.name)).toEqual([
        "alpha",
        "beta",
        "gamma",
      ]);
    });

    it("should paginate with limit and offset", () => {
      const page1 = engine.search({ sortBy: "name", limit: 2, offset: 0 });
      expect(page1.packages).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      const page2 = engine.search({ sortBy: "name", limit: 2, offset: 2 });
      expect(page2.packages).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
    });

    it("should sort by rating", () => {
      // Add reviews to affect rating ordering
      engine.addReview("s1", { userId: "u1", rating: 5, comment: "Great" });
      engine.addReview("s3", { userId: "u2", rating: 3, comment: "OK" });

      const result = engine.search({ sortBy: "rating" });
      expect(result.packages[0].id).toBe("s1");
      expect(result.packages[1].id).toBe("s3");
    });
  });

  // -------------------------------------------------------------------------
  // Install & Uninstall
  // -------------------------------------------------------------------------

  describe("install and uninstall", () => {
    beforeEach(() => {
      engine.publish(makeGuardrailPkg("i1"), sampleGuardrailContent);
    });

    it("should install a package", () => {
      const installed = engine.install("i1", { key: "value" });
      expect(installed.package.id).toBe("i1");
      expect(installed.config).toEqual({ key: "value" });
      expect(installed.enabled).toBe(true);
      expect(installed.installedAt).toBeInstanceOf(Date);
    });

    it("should increment download count on install", () => {
      engine.install("i1");
      expect(engine.getPackage("i1")!.downloads).toBe(1);
    });

    it("should reject installing non-existent package", () => {
      expect(() => engine.install("nope")).toThrow('Package "nope" not found');
    });

    it("should reject double install", () => {
      engine.install("i1");
      expect(() => engine.install("i1")).toThrow(
        'Package "i1" is already installed',
      );
    });

    it("should uninstall a package", () => {
      engine.install("i1");
      expect(engine.uninstall("i1")).toBe(true);
      expect(engine.isInstalled("i1")).toBe(false);
    });

    it("should return false for uninstalling non-installed package", () => {
      expect(engine.uninstall("i1")).toBe(false);
    });

    it("should list installed packages", () => {
      engine.install("i1");
      const list = engine.getInstalled();
      expect(list).toHaveLength(1);
      expect(list[0].package.id).toBe("i1");
    });

    it("should check isInstalled", () => {
      expect(engine.isInstalled("i1")).toBe(false);
      engine.install("i1");
      expect(engine.isInstalled("i1")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Enable / Disable
  // -------------------------------------------------------------------------

  describe("enable and disable", () => {
    beforeEach(() => {
      engine.publish(makeGuardrailPkg("e1"), sampleGuardrailContent);
      engine.install("e1");
    });

    it("should disable an installed package", () => {
      engine.disablePackage("e1");
      const installed = engine.getInstalled();
      expect(installed[0].enabled).toBe(false);
    });

    it("should re-enable a disabled package", () => {
      engine.disablePackage("e1");
      engine.enablePackage("e1");
      const installed = engine.getInstalled();
      expect(installed[0].enabled).toBe(true);
    });

    it("should throw when enabling non-installed package", () => {
      expect(() => engine.enablePackage("nope")).toThrow(
        'Package "nope" is not installed',
      );
    });

    it("should throw when disabling non-installed package", () => {
      expect(() => engine.disablePackage("nope")).toThrow(
        'Package "nope" is not installed',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Reviews & Rating
  // -------------------------------------------------------------------------

  describe("reviews and ratings", () => {
    beforeEach(() => {
      engine.publish(makeGuardrailPkg("r1"), sampleGuardrailContent);
    });

    it("should add a review and update rating", () => {
      engine.addReview("r1", { userId: "u1", rating: 4, comment: "Good" });

      const pkg = engine.getPackage("r1")!;
      expect(pkg.rating).toBe(4);
      expect(pkg.ratingCount).toBe(1);
    });

    it("should calculate average rating from multiple reviews", () => {
      engine.addReview("r1", { userId: "u1", rating: 5, comment: "Excellent" });
      engine.addReview("r1", { userId: "u2", rating: 3, comment: "Average" });

      const pkg = engine.getPackage("r1")!;
      expect(pkg.rating).toBe(4);
      expect(pkg.ratingCount).toBe(2);
    });

    it("should return reviews for a package", () => {
      engine.addReview("r1", { userId: "u1", rating: 5, comment: "Nice" });
      const reviews = engine.getReviews("r1");
      expect(reviews).toHaveLength(1);
      expect(reviews[0].userId).toBe("u1");
      expect(reviews[0].createdAt).toBeInstanceOf(Date);
    });

    it("should return empty array for package with no reviews", () => {
      expect(engine.getReviews("r1")).toEqual([]);
    });

    it("should return empty array for unknown package reviews", () => {
      expect(engine.getReviews("unknown")).toEqual([]);
    });

    it("should reject rating out of range", () => {
      expect(() =>
        engine.addReview("r1", { userId: "u1", rating: 0, comment: "bad" }),
      ).toThrow("Rating must be between 1 and 5");
      expect(() =>
        engine.addReview("r1", { userId: "u1", rating: 6, comment: "bad" }),
      ).toThrow("Rating must be between 1 and 5");
    });

    it("should throw when reviewing non-existent package", () => {
      expect(() =>
        engine.addReview("nope", { userId: "u1", rating: 3, comment: "x" }),
      ).toThrow('Package "nope" not found');
    });
  });

  // -------------------------------------------------------------------------
  // Featured Packages
  // -------------------------------------------------------------------------

  describe("featured packages", () => {
    it("should return packages sorted by rating then downloads", () => {
      engine.publish(makeGuardrailPkg("f1"), sampleGuardrailContent);
      engine.publish(makeGuardrailPkg("f2"), sampleGuardrailContent);
      engine.publish(makeGuardrailPkg("f3"), sampleGuardrailContent);

      engine.addReview("f2", { userId: "u1", rating: 5, comment: "Best" });
      engine.addReview("f1", { userId: "u2", rating: 3, comment: "OK" });

      const featured = engine.getFeaturedPackages(2);
      expect(featured).toHaveLength(2);
      expect(featured[0].id).toBe("f2");
      expect(featured[1].id).toBe("f1");
    });

    it("should default to 10 items", () => {
      for (let i = 0; i < 15; i++) {
        engine.publish(makeGuardrailPkg(`ft-${i}`), sampleGuardrailContent);
      }
      expect(engine.getFeaturedPackages()).toHaveLength(10);
    });
  });

  // -------------------------------------------------------------------------
  // Package Content
  // -------------------------------------------------------------------------

  describe("package content", () => {
    it("should retrieve guardrail content", () => {
      engine.publish(makeGuardrailPkg("c1"), sampleGuardrailContent);
      const content = engine.getPackageContent("c1") as GuardrailPackageContent;
      expect(content).toBeDefined();
      expect(content.policies).toHaveLength(1);
      expect(content.policies[0].type).toBe("cost_limit");
    });

    it("should retrieve rubric content", () => {
      engine.publish(
        makeGuardrailPkg("c2", { category: "rubric" }),
        sampleRubricContent,
      );
      const content = engine.getPackageContent("c2") as RubricPackageContent;
      expect(content).toBeDefined();
      expect(content.criteria).toHaveLength(1);
      expect(content.criteria[0].name).toBe("Accuracy");
    });

    it("should return undefined for unknown package", () => {
      expect(engine.getPackageContent("nope")).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  describe("metrics", () => {
    it("should return aggregate metrics", () => {
      engine.publish(
        makeGuardrailPkg("m1", { category: "guardrail" }),
        sampleGuardrailContent,
      );
      engine.publish(
        makeGuardrailPkg("m2", {
          category: "rubric",
          author: { name: "Other", verified: false },
        }),
        sampleRubricContent,
      );
      engine.install("m1");

      const metrics = engine.getMetrics();
      expect(metrics.totalPackages).toBe(2);
      expect(metrics.totalDownloads).toBe(1);
      expect(metrics.totalAuthors).toBe(2);
      expect(metrics.categoryBreakdown.get("guardrail")).toBe(1);
      expect(metrics.categoryBreakdown.get("rubric")).toBe(1);
      expect(metrics.topPackages).toHaveLength(2);
    });

    it("should return zero metrics for empty marketplace", () => {
      const metrics = engine.getMetrics();
      expect(metrics.totalPackages).toBe(0);
      expect(metrics.totalDownloads).toBe(0);
      expect(metrics.totalAuthors).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Callbacks
  // -------------------------------------------------------------------------

  describe("callbacks", () => {
    it("should call onInstall callback", () => {
      const onInstall = vi.fn();
      const eng = new MarketplaceEngine({ enabled: true, onInstall });
      eng.publish(makeGuardrailPkg("cb1"), sampleGuardrailContent);
      eng.install("cb1");

      expect(onInstall).toHaveBeenCalledTimes(1);
      expect(onInstall).toHaveBeenCalledWith(
        expect.objectContaining({
          package: expect.objectContaining({ id: "cb1" }),
        }),
      );
    });

    it("should call onUninstall callback", () => {
      const onUninstall = vi.fn();
      const eng = new MarketplaceEngine({ enabled: true, onUninstall });
      eng.publish(makeGuardrailPkg("cb2"), sampleGuardrailContent);
      eng.install("cb2");
      eng.uninstall("cb2");

      expect(onUninstall).toHaveBeenCalledTimes(1);
      expect(onUninstall).toHaveBeenCalledWith("cb2");
    });

    it("should not call onUninstall when package is not installed", () => {
      const onUninstall = vi.fn();
      const eng = new MarketplaceEngine({ enabled: true, onUninstall });
      eng.uninstall("nope");
      expect(onUninstall).not.toHaveBeenCalled();
    });
  });
});
