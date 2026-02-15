/**
 * AgentOps SDK - Guardrail Marketplace Types
 *
 * Type definitions for the guardrail and rubric package marketplace.
 */

// ============================================================================
// Configuration
// ============================================================================

export interface MarketplaceConfig {
  /** Enable the marketplace */
  enabled: boolean;
  /** Optional remote registry URL */
  registryUrl?: string;
  /** Optional local cache path */
  localCachePath?: string;
  /** Callback when a package is installed */
  onInstall?: (pkg: InstalledPackage) => void;
  /** Callback when a package is uninstalled */
  onUninstall?: (packageId: string) => void;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Package Types
// ============================================================================

export interface PackageAuthor {
  name: string;
  email?: string;
  url?: string;
  verified: boolean;
}

export type PackageCategory =
  | "guardrail"
  | "rubric"
  | "prompt_template"
  | "benchmark"
  | "policy";

export interface MarketplacePackage {
  id: string;
  name: string;
  version: string;
  description: string;
  author: PackageAuthor;
  category: PackageCategory;
  tags: string[];
  downloads: number;
  rating: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
  dependencies: string[];
  license: string;
}

export interface PackageVersion {
  version: string;
  changelog: string;
  publishedAt: Date;
  /** Size in bytes */
  size: number;
  checksum: string;
}

export interface InstalledPackage {
  package: MarketplacePackage;
  installedAt: Date;
  config: Record<string, unknown>;
  enabled: boolean;
}

// ============================================================================
// Package Content Types
// ============================================================================

export type PolicyType =
  | "cost_limit"
  | "rate_limit"
  | "content_filter"
  | "pii_detection"
  | "token_limit"
  | "model_restriction"
  | "custom";

export type PolicySeverity = "info" | "warning" | "critical";

export interface PolicyRule {
  field: string;
  operator: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "contains" | "regex";
  value: string | number | boolean;
  message: string;
}

export interface PolicyDefinition {
  id: string;
  name: string;
  description: string;
  type: PolicyType;
  rules: PolicyRule[];
  severity: PolicySeverity;
  enabled: boolean;
}

export interface GuardrailPackageContent {
  policies: PolicyDefinition[];
  description: string;
  configSchema: Record<string, unknown>;
}

export interface RubricCriterion {
  name: string;
  description: string;
  /** Weight between 0 and 1 */
  weight: number;
  scoreLevels: { score: number; description: string }[];
}

export interface RubricPackageContent {
  criteria: RubricCriterion[];
  description: string;
  scoringScale: { min: number; max: number; step: number };
}

// ============================================================================
// Search Types
// ============================================================================

export interface PackageSearchQuery {
  query?: string;
  category?: PackageCategory;
  tags?: string[];
  sortBy?: "downloads" | "rating" | "updated" | "name";
  limit?: number;
  offset?: number;
}

export interface PackageSearchResult {
  packages: MarketplacePackage[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Review & Metrics Types
// ============================================================================

export interface PackageReview {
  userId: string;
  /** Rating 1-5 */
  rating: number;
  comment: string;
  createdAt: Date;
}

export interface MarketplaceMetrics {
  totalPackages: number;
  totalDownloads: number;
  totalAuthors: number;
  categoryBreakdown: Map<PackageCategory, number>;
  topPackages: MarketplacePackage[];
}
