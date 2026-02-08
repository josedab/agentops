/**
 * AgentOps SDK - Plugin & Extension Marketplace Types
 *
 * Type definitions for the plugin system, including manifests,
 * lifecycle hooks, registry entries, and events.
 */

// ============================================================================
// Core Plugin Types
// ============================================================================

/**
 * The category/type of a plugin.
 */
export type PluginType =
  | "instrumentor"
  | "evaluator"
  | "exporter"
  | "processor"
  | "widget";

/**
 * Plugin author information.
 */
export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

/**
 * Schema definition for plugin configuration properties.
 */
export interface PluginConfigSchema {
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      default?: unknown;
      required?: boolean;
    }
  >;
}

/**
 * The plugin manifest describes a plugin's identity, compatibility,
 * and configuration requirements.
 */
export interface PluginManifest {
  name: string;
  version: string;
  type: PluginType;
  description: string;
  author: PluginAuthor;
  agentopsVersion: string;
  dependencies?: Record<string, string>;
  config?: PluginConfigSchema;
  entryPoint: string;
}

// ============================================================================
// Plugin Instance & Lifecycle
// ============================================================================

/**
 * Represents an installed plugin instance with its current state.
 */
export interface PluginInstance {
  manifest: PluginManifest;
  status: "installed" | "active" | "disabled" | "error";
  config: Record<string, unknown>;
  installedAt: Date;
  activatedAt?: Date;
  error?: string;
}

/**
 * A named hook that a plugin can register for extensibility.
 */
export interface PluginHook {
  name: string;
  handler: (...args: unknown[]) => unknown | Promise<unknown>;
}

/**
 * Lifecycle callbacks that plugins can implement.
 */
export interface PluginLifecycle {
  onInstall?(): void | Promise<void>;
  onActivate?(): void | Promise<void>;
  onDeactivate?(): void | Promise<void>;
  onUninstall?(): void | Promise<void>;
  onConfigChange?(config: Record<string, unknown>): void;
}

/**
 * Logger interface provided to plugins via context.
 */
export interface PluginLogger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * Context object passed to plugins during activation.
 */
export interface PluginContext {
  sdkVersion: string;
  config: Record<string, unknown>;
  logger: PluginLogger;
}

// ============================================================================
// Plugin Registry (Marketplace)
// ============================================================================

/**
 * An entry in the plugin registry/marketplace.
 */
export interface PluginRegistryEntry {
  manifest: PluginManifest;
  downloads: number;
  rating: number;
  verified: boolean;
  publishedAt: Date;
  updatedAt: Date;
}

/**
 * Query parameters for searching the plugin registry.
 */
export interface PluginSearchQuery {
  query?: string;
  type?: PluginType;
  author?: string;
  verified?: boolean;
  sortBy?: "downloads" | "rating" | "updated";
  limit?: number;
}

/**
 * Result of a plugin registry search.
 */
export interface PluginSearchResult {
  plugins: PluginRegistryEntry[];
  total: number;
  page: number;
}

// ============================================================================
// Plugin Events
// ============================================================================

/**
 * Event emitted when something happens in the plugin system.
 */
export interface PluginEvent {
  id: string;
  type:
    | "installed"
    | "activated"
    | "deactivated"
    | "uninstalled"
    | "error"
    | "config_changed";
  pluginName: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
