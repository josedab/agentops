/**
 * AgentOps SDK - Guardrail Marketplace Engine
 *
 * Manages publishing, discovery, installation, and review of
 * guardrail and rubric packages.
 */

import type {
  MarketplaceConfig,
  MarketplacePackage,
  PackageCategory,
  InstalledPackage,
  GuardrailPackageContent,
  RubricPackageContent,
  PackageSearchQuery,
  PackageSearchResult,
  PackageReview,
  MarketplaceMetrics,
} from "./types.js";

export class MarketplaceEngine {
  private readonly config: MarketplaceConfig;
  private readonly packages: Map<string, MarketplacePackage> = new Map();
  private readonly installed: Map<string, InstalledPackage> = new Map();
  private readonly contents: Map<
    string,
    GuardrailPackageContent | RubricPackageContent
  > = new Map();
  private readonly reviews: Map<string, PackageReview[]> = new Map();

  constructor(config: MarketplaceConfig) {
    this.config = config;
  }

  // --------------------------------------------------------------------------
  // Publishing
  // --------------------------------------------------------------------------

  /**
   * Publishes a package to the marketplace.
   */
  publish(
    pkg: Omit<
      MarketplacePackage,
      "downloads" | "rating" | "ratingCount" | "createdAt" | "updatedAt"
    >,
    content: GuardrailPackageContent | RubricPackageContent,
  ): MarketplacePackage {
    if (this.packages.has(pkg.id)) {
      throw new Error(`Package "${pkg.id}" already exists`);
    }

    const now = new Date();
    const fullPkg: MarketplacePackage = {
      ...pkg,
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.packages.set(pkg.id, fullPkg);
    this.contents.set(pkg.id, content);
    this.reviews.set(pkg.id, []);

    this.debug(`Published package "${pkg.id}"`);
    return fullPkg;
  }

  /**
   * Removes a package from the marketplace.
   */
  unpublish(packageId: string): boolean {
    if (!this.packages.has(packageId)) {
      return false;
    }

    this.packages.delete(packageId);
    this.contents.delete(packageId);
    this.reviews.delete(packageId);
    // Also uninstall if installed
    this.installed.delete(packageId);

    this.debug(`Unpublished package "${packageId}"`);
    return true;
  }

  // --------------------------------------------------------------------------
  // Discovery
  // --------------------------------------------------------------------------

  /**
   * Searches packages with filters and sorting.
   */
  search(query: PackageSearchQuery): PackageSearchResult {
    let results = Array.from(this.packages.values());

    // Text search
    if (query.query) {
      const q = query.query.toLowerCase();
      results = results.filter(
        (pkg) =>
          pkg.name.toLowerCase().includes(q) ||
          pkg.description.toLowerCase().includes(q),
      );
    }

    // Category filter
    if (query.category) {
      results = results.filter((pkg) => pkg.category === query.category);
    }

    // Tags filter
    if (query.tags && query.tags.length > 0) {
      results = results.filter((pkg) =>
        query.tags!.some((tag) => pkg.tags.includes(tag)),
      );
    }

    // Sorting
    if (query.sortBy) {
      switch (query.sortBy) {
        case "downloads":
          results.sort((a, b) => b.downloads - a.downloads);
          break;
        case "rating":
          results.sort((a, b) => b.rating - a.rating);
          break;
        case "updated":
          results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
          break;
        case "name":
          results.sort((a, b) => a.name.localeCompare(b.name));
          break;
      }
    }

    const total = results.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? total;
    const sliced = results.slice(offset, offset + limit);

    return {
      packages: sliced,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Gets a single package by ID.
   */
  getPackage(packageId: string): MarketplacePackage | undefined {
    return this.packages.get(packageId);
  }

  /**
   * Returns top-rated packages.
   */
  getFeaturedPackages(limit = 10): MarketplacePackage[] {
    return Array.from(this.packages.values())
      .sort((a, b) => b.rating - a.rating || b.downloads - a.downloads)
      .slice(0, limit);
  }

  // --------------------------------------------------------------------------
  // Installation
  // --------------------------------------------------------------------------

  /**
   * Installs a package locally.
   */
  install(
    packageId: string,
    config?: Record<string, unknown>,
  ): InstalledPackage {
    const pkg = this.packages.get(packageId);
    if (!pkg) {
      throw new Error(`Package "${packageId}" not found`);
    }

    if (this.installed.has(packageId)) {
      throw new Error(`Package "${packageId}" is already installed`);
    }

    // Increment download count
    pkg.downloads++;
    pkg.updatedAt = new Date();

    const installedPkg: InstalledPackage = {
      package: pkg,
      installedAt: new Date(),
      config: config ?? {},
      enabled: true,
    };

    this.installed.set(packageId, installedPkg);
    this.config.onInstall?.(installedPkg);
    this.debug(`Installed package "${packageId}"`);

    return installedPkg;
  }

  /**
   * Uninstalls a package.
   */
  uninstall(packageId: string): boolean {
    if (!this.installed.has(packageId)) {
      return false;
    }

    this.installed.delete(packageId);
    this.config.onUninstall?.(packageId);
    this.debug(`Uninstalled package "${packageId}"`);

    return true;
  }

  /**
   * Returns all installed packages.
   */
  getInstalled(): InstalledPackage[] {
    return Array.from(this.installed.values());
  }

  /**
   * Checks if a package is installed.
   */
  isInstalled(packageId: string): boolean {
    return this.installed.has(packageId);
  }

  /**
   * Enables an installed package.
   */
  enablePackage(packageId: string): void {
    const installed = this.installed.get(packageId);
    if (!installed) {
      throw new Error(`Package "${packageId}" is not installed`);
    }
    installed.enabled = true;
  }

  /**
   * Disables an installed package.
   */
  disablePackage(packageId: string): void {
    const installed = this.installed.get(packageId);
    if (!installed) {
      throw new Error(`Package "${packageId}" is not installed`);
    }
    installed.enabled = false;
  }

  // --------------------------------------------------------------------------
  // Content
  // --------------------------------------------------------------------------

  /**
   * Retrieves the content of a package (policies or rubric criteria).
   */
  getPackageContent(
    packageId: string,
  ): GuardrailPackageContent | RubricPackageContent | undefined {
    return this.contents.get(packageId);
  }

  // --------------------------------------------------------------------------
  // Reviews
  // --------------------------------------------------------------------------

  /**
   * Adds a review for a package and recalculates the average rating.
   */
  addReview(packageId: string, review: Omit<PackageReview, "createdAt">): void {
    const pkg = this.packages.get(packageId);
    if (!pkg) {
      throw new Error(`Package "${packageId}" not found`);
    }

    if (review.rating < 1 || review.rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    const reviews = this.reviews.get(packageId) ?? [];
    const fullReview: PackageReview = {
      ...review,
      createdAt: new Date(),
    };

    reviews.push(fullReview);
    this.reviews.set(packageId, reviews);

    // Recalculate average rating
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    pkg.rating = sum / reviews.length;
    pkg.ratingCount = reviews.length;
    pkg.updatedAt = new Date();
  }

  /**
   * Returns all reviews for a package.
   */
  getReviews(packageId: string): PackageReview[] {
    return this.reviews.get(packageId) ?? [];
  }

  // --------------------------------------------------------------------------
  // Metrics
  // --------------------------------------------------------------------------

  /**
   * Returns marketplace-wide metrics.
   */
  getMetrics(): MarketplaceMetrics {
    const allPackages = Array.from(this.packages.values());

    const categoryBreakdown = new Map<PackageCategory, number>();
    const authors = new Set<string>();
    let totalDownloads = 0;

    for (const pkg of allPackages) {
      totalDownloads += pkg.downloads;
      authors.add(pkg.author.name);
      categoryBreakdown.set(
        pkg.category,
        (categoryBreakdown.get(pkg.category) ?? 0) + 1,
      );
    }

    const topPackages = [...allPackages]
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 10);

    return {
      totalPackages: allPackages.length,
      totalDownloads,
      totalAuthors: authors.size,
      categoryBreakdown,
      topPackages,
    };
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private debug(msg: string): void {
    if (this.config.debug) {
      console.debug(`[marketplace] ${msg}`);
    }
  }
}
