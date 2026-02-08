/**
 * AgentOps SDK - Plugin & Extension Marketplace
 *
 * Provides a plugin system for extending the SDK with custom
 * instrumentors, evaluators, exporters, processors, and widgets.
 * Includes a plugin manager for lifecycle management and a
 * registry for marketplace/discovery functionality.
 */

import { nanoid } from "nanoid";
import type {
  PluginType,
  PluginManifest,
  PluginContext,
  PluginInstance,
  PluginHook,
  PluginEvent,
  PluginRegistryEntry,
  PluginSearchQuery,
  PluginSearchResult,
  PluginLogger,
} from "./types.js";

// Re-export all types
export type {
  PluginType,
  PluginManifest,
  PluginAuthor,
  PluginConfigSchema,
  PluginInstance,
  PluginHook,
  PluginLifecycle,
  PluginContext,
  PluginLogger,
  PluginRegistryEntry,
  PluginSearchQuery,
  PluginSearchResult,
  PluginEvent,
} from "./types.js";

// ============================================================================
// Abstract Plugin Base Classes
// ============================================================================

/**
 * Abstract base class for all AgentOps plugins.
 *
 * Plugin authors extend this class (or one of its specialized subclasses)
 * to create plugins that integrate with the AgentOps SDK.
 *
 * @example
 * ```typescript
 * class MyPlugin extends PluginSDK {
 *   getName() { return 'my-plugin'; }
 *   getVersion() { return '1.0.0'; }
 *   getType(): PluginType { return 'processor'; }
 *   async onActivate(context: PluginContext) {
 *     context.logger.info('MyPlugin activated!');
 *   }
 * }
 * ```
 */
export abstract class PluginSDK {
  private _hooks: Map<string, PluginHook[]> = new Map();

  /**
   * Returns the unique name of this plugin.
   */
  abstract getName(): string;

  /**
   * Returns the semver version of this plugin.
   */
  abstract getVersion(): string;

  /**
   * Returns the type/category of this plugin.
   */
  abstract getType(): PluginType;

  /**
   * Called when the plugin is activated. Plugins should perform
   * their initialization here.
   */
  abstract onActivate(context: PluginContext): void | Promise<void>;

  /**
   * Called when the plugin is deactivated. Plugins should perform
   * cleanup here. Optional.
   */
  onDeactivate?(): void | Promise<void>;

  /**
   * Called when the plugin configuration changes. Optional.
   */
  onConfigChange?(_config: Record<string, unknown>): void;

  /**
   * Builds a PluginManifest from the abstract method values.
   */
  getManifest(): PluginManifest {
    return {
      name: this.getName(),
      version: this.getVersion(),
      type: this.getType(),
      description: "",
      author: { name: "" },
      agentopsVersion: "*",
      entryPoint: "",
    };
  }

  /**
   * Emits a hook event that the PluginManager can listen for.
   */
  protected emit(hookName: string, ...args: unknown[]): void {
    const hooks = this._hooks.get(hookName);
    if (hooks) {
      for (const hook of hooks) {
        hook.handler(...args);
      }
    }
  }

  /**
   * Registers a hook handler internally. Used by the PluginManager.
   * @internal
   */
  _registerHook(hook: PluginHook): void {
    const existing = this._hooks.get(hook.name) ?? [];
    existing.push(hook);
    this._hooks.set(hook.name, existing);
  }
}

// ============================================================================
// Specialized Plugin Base Classes
// ============================================================================

/**
 * Abstract base for instrumentor plugins that wrap frameworks/libraries
 * to capture telemetry automatically.
 *
 * @example
 * ```typescript
 * class LangChainInstrumentor extends InstrumentorPlugin {
 *   getName() { return 'langchain-instrumentor'; }
 *   getVersion() { return '1.0.0'; }
 *   getFrameworkName() { return 'langchain'; }
 *   instrument(target: unknown) {
 *     // Wrap LangChain methods
 *     return target;
 *   }
 *   async onActivate(context: PluginContext) {
 *     context.logger.info('LangChain instrumentation active');
 *   }
 * }
 * ```
 */
export abstract class InstrumentorPlugin extends PluginSDK {
  getType(): PluginType {
    return "instrumentor";
  }

  /**
   * Instruments a target object (e.g., an LLM client or framework module).
   * Returns the instrumented version.
   */
  abstract instrument(target: unknown): unknown;

  /**
   * Returns the name of the framework this instrumentor targets.
   */
  abstract getFrameworkName(): string;
}

/**
 * Abstract base for evaluator plugins that score LLM interactions.
 *
 * @example
 * ```typescript
 * class ToxicityEvaluator extends EvaluatorPlugin {
 *   getName() { return 'toxicity-evaluator'; }
 *   getVersion() { return '1.0.0'; }
 *   getEvaluatorName() { return 'toxicity'; }
 *   async evaluate(input) {
 *     return { score: 0.95, reasoning: 'No toxic content detected.' };
 *   }
 *   async onActivate(context: PluginContext) {
 *     context.logger.info('Toxicity evaluator active');
 *   }
 * }
 * ```
 */
export abstract class EvaluatorPlugin extends PluginSDK {
  getType(): PluginType {
    return "evaluator";
  }

  /**
   * Evaluates an LLM interaction and returns a score with reasoning.
   */
  abstract evaluate(input: {
    prompt: string;
    response: string;
    context?: string[];
  }): Promise<{ score: number; reasoning: string }>;

  /**
   * Returns the name of this evaluator (e.g., 'toxicity', 'relevance').
   */
  abstract getEvaluatorName(): string;
}

/**
 * Abstract base for exporter plugins that send data to external systems.
 *
 * @example
 * ```typescript
 * class S3Exporter extends ExporterPlugin {
 *   getName() { return 's3-exporter'; }
 *   getVersion() { return '1.0.0'; }
 *   getDestination() { return 's3://my-bucket/agentops'; }
 *   async export(events) {
 *     // Upload events to S3
 *     return { success: true, count: events.length };
 *   }
 *   async onActivate(context: PluginContext) {
 *     context.logger.info('S3 exporter active');
 *   }
 * }
 * ```
 */
export abstract class ExporterPlugin extends PluginSDK {
  getType(): PluginType {
    return "exporter";
  }

  /**
   * Exports a batch of events to the external destination.
   * Returns success status and the count of exported events.
   */
  abstract export(
    events: unknown[],
  ): Promise<{ success: boolean; count: number }>;

  /**
   * Returns the destination identifier (e.g., URL, bucket name).
   */
  abstract getDestination(): string;
}

// ============================================================================
// Plugin Manager
// ============================================================================

/**
 * Manages the lifecycle of plugins: installation, activation,
 * deactivation, configuration, hooks, and events.
 *
 * @example
 * ```typescript
 * const manager = new PluginManager('1.0.0');
 *
 * // Install and activate a plugin
 * await manager.install(myPlugin, { apiKey: 'xxx' });
 * await manager.activate('my-plugin');
 *
 * // List active plugins
 * const active = manager.getActivePlugins();
 *
 * // Listen for events
 * manager.onEvent((event) => {
 *   console.log(`Plugin event: ${event.type} for ${event.pluginName}`);
 * });
 * ```
 */
export class PluginManager {
  private sdkVersion: string;
  private plugins: Map<string, { sdk: PluginSDK; instance: PluginInstance }> =
    new Map();
  private hooks: Map<string, { pluginName: string; hook: PluginHook }[]> =
    new Map();
  private eventListeners: ((event: PluginEvent) => void)[] = [];

  constructor(sdkVersion: string) {
    this.sdkVersion = sdkVersion;
  }

  // --------------------------------------------------------------------------
  // Installation
  // --------------------------------------------------------------------------

  /**
   * Installs a plugin with optional configuration.
   * Validates version compatibility before installing.
   *
   * @throws Error if plugin is already installed or incompatible
   */
  async install(
    plugin: PluginSDK,
    config?: Record<string, unknown>,
  ): Promise<void> {
    const name = plugin.getName();
    if (this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is already installed`);
    }

    const manifest = plugin.getManifest();
    if (!this.isCompatible(manifest.agentopsVersion)) {
      throw new Error(
        `Plugin "${name}" requires agentopsVersion "${manifest.agentopsVersion}" ` +
          `but SDK version is "${this.sdkVersion}"`,
      );
    }

    const instance: PluginInstance = {
      manifest,
      status: "installed",
      config: config ?? {},
      installedAt: new Date(),
    };

    this.plugins.set(name, { sdk: plugin, instance });
    this.emitEvent({
      type: "installed",
      pluginName: name,
      timestamp: new Date(),
    });
  }

  /**
   * Uninstalls a plugin, deactivating it first if active.
   *
   * @throws Error if plugin is not installed
   */
  async uninstall(pluginName: string): Promise<void> {
    const entry = this.plugins.get(pluginName);
    if (!entry) {
      throw new Error(`Plugin "${pluginName}" is not installed`);
    }

    if (entry.instance.status === "active") {
      await this.deactivate(pluginName);
    }

    // Remove all hooks registered by this plugin
    const hookEntries = Array.from(this.hooks.entries());
    for (const [hookName, handlers] of hookEntries) {
      const filtered = handlers.filter((h) => h.pluginName !== pluginName);
      if (filtered.length === 0) {
        this.hooks.delete(hookName);
      } else {
        this.hooks.set(hookName, filtered);
      }
    }

    this.plugins.delete(pluginName);
    this.emitEvent({
      type: "uninstalled",
      pluginName,
      timestamp: new Date(),
    });
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Activates an installed plugin, calling its onActivate lifecycle method.
   *
   * @throws Error if plugin is not installed or already active
   */
  async activate(pluginName: string): Promise<void> {
    const entry = this.plugins.get(pluginName);
    if (!entry) {
      throw new Error(`Plugin "${pluginName}" is not installed`);
    }
    if (entry.instance.status === "active") {
      throw new Error(`Plugin "${pluginName}" is already active`);
    }

    const logger = this.createLogger(pluginName);
    const context: PluginContext = {
      sdkVersion: this.sdkVersion,
      config: entry.instance.config,
      logger,
    };

    try {
      await entry.sdk.onActivate(context);
      entry.instance.status = "active";
      entry.instance.activatedAt = new Date();
      entry.instance.error = undefined;
      this.emitEvent({
        type: "activated",
        pluginName,
        timestamp: new Date(),
      });
    } catch (err) {
      entry.instance.status = "error";
      entry.instance.error = err instanceof Error ? err.message : String(err);
      this.emitEvent({
        type: "error",
        pluginName,
        timestamp: new Date(),
        data: { error: entry.instance.error },
      });
      throw err;
    }
  }

  /**
   * Deactivates an active plugin, calling its onDeactivate lifecycle method.
   *
   * @throws Error if plugin is not installed or not active
   */
  async deactivate(pluginName: string): Promise<void> {
    const entry = this.plugins.get(pluginName);
    if (!entry) {
      throw new Error(`Plugin "${pluginName}" is not installed`);
    }
    if (entry.instance.status !== "active") {
      throw new Error(`Plugin "${pluginName}" is not active`);
    }

    try {
      if (entry.sdk.onDeactivate) {
        await entry.sdk.onDeactivate();
      }
      entry.instance.status = "disabled";
      entry.instance.error = undefined;
      this.emitEvent({
        type: "deactivated",
        pluginName,
        timestamp: new Date(),
      });
    } catch (err) {
      entry.instance.status = "error";
      entry.instance.error = err instanceof Error ? err.message : String(err);
      this.emitEvent({
        type: "error",
        pluginName,
        timestamp: new Date(),
        data: { error: entry.instance.error },
      });
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  /**
   * Updates configuration for an installed plugin.
   * If the plugin is active and implements onConfigChange, it will be called.
   *
   * @throws Error if plugin is not installed
   */
  configure(pluginName: string, config: Record<string, unknown>): void {
    const entry = this.plugins.get(pluginName);
    if (!entry) {
      throw new Error(`Plugin "${pluginName}" is not installed`);
    }

    entry.instance.config = { ...entry.instance.config, ...config };

    if (entry.instance.status === "active" && entry.sdk.onConfigChange) {
      entry.sdk.onConfigChange(entry.instance.config);
    }

    this.emitEvent({
      type: "config_changed",
      pluginName,
      timestamp: new Date(),
      data: { config: entry.instance.config },
    });
  }

  // --------------------------------------------------------------------------
  // Discovery
  // --------------------------------------------------------------------------

  /**
   * Gets the PluginInstance for an installed plugin.
   */
  getPlugin(name: string): PluginInstance | undefined {
    return this.plugins.get(name)?.instance;
  }

  /**
   * Lists installed plugins, optionally filtered by type.
   */
  listPlugins(filter?: { type?: PluginType }): PluginInstance[] {
    const instances = Array.from(this.plugins.values()).map(
      (entry) => entry.instance,
    );
    if (filter?.type) {
      return instances.filter((inst) => inst.manifest.type === filter.type);
    }
    return instances;
  }

  /**
   * Returns all active plugins, optionally filtered by type.
   */
  getActivePlugins(type?: PluginType): PluginInstance[] {
    const active = Array.from(this.plugins.values())
      .filter((entry) => entry.instance.status === "active")
      .map((entry) => entry.instance);
    if (type) {
      return active.filter((inst) => inst.manifest.type === type);
    }
    return active;
  }

  // --------------------------------------------------------------------------
  // Hooks
  // --------------------------------------------------------------------------

  /**
   * Registers a hook for a specific plugin.
   *
   * @throws Error if plugin is not installed
   */
  registerHook(pluginName: string, hook: PluginHook): void {
    const entry = this.plugins.get(pluginName);
    if (!entry) {
      throw new Error(`Plugin "${pluginName}" is not installed`);
    }

    entry.sdk._registerHook(hook);

    const existing = this.hooks.get(hook.name) ?? [];
    existing.push({ pluginName, hook });
    this.hooks.set(hook.name, existing);
  }

  /**
   * Executes all registered hooks for a given hook name.
   * Returns an array of results from all hook handlers.
   */
  async executeHook(hookName: string, ...args: unknown[]): Promise<unknown[]> {
    const handlers = this.hooks.get(hookName);
    if (!handlers) {
      return [];
    }

    const results: unknown[] = [];
    for (const { hook } of handlers) {
      const result = await hook.handler(...args);
      results.push(result);
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  /**
   * Registers an event listener for plugin lifecycle events.
   */
  onEvent(callback: (event: PluginEvent) => void): void {
    this.eventListeners.push(callback);
  }

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  /**
   * Returns statistics about installed plugins.
   */
  getStats(): {
    total: number;
    active: number;
    disabled: number;
    byType: Record<PluginType, number>;
  } {
    const instances = Array.from(this.plugins.values()).map((e) => e.instance);

    const byType: Record<PluginType, number> = {
      instrumentor: 0,
      evaluator: 0,
      exporter: 0,
      processor: 0,
      widget: 0,
    };

    let active = 0;
    let disabled = 0;

    for (const inst of instances) {
      byType[inst.manifest.type]++;
      if (inst.status === "active") {
        active++;
      } else if (inst.status === "disabled") {
        disabled++;
      }
    }

    return {
      total: instances.length,
      active,
      disabled,
      byType,
    };
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Checks if the SDK version is compatible with the required version string.
   * Uses simple semver major-version matching: the major version must match.
   * A wildcard "*" or empty string is always compatible.
   */
  private isCompatible(requiredVersion: string): boolean {
    if (!requiredVersion || requiredVersion === "*") {
      return true;
    }

    // Extract major version from the required version string.
    // Handles ranges like "^1.0.0", "~1.2.3", ">=1.0.0", or plain "1.0.0".
    const requiredMatch = requiredVersion.match(/(\d+)/);
    const sdkMatch = this.sdkVersion.match(/(\d+)/);

    if (!requiredMatch || !sdkMatch) {
      return false;
    }

    return requiredMatch[1] === sdkMatch[1];
  }

  /**
   * Creates a namespaced logger for a plugin.
   */
  private createLogger(pluginName: string): PluginLogger {
    const prefix = `[plugin:${pluginName}]`;
    return {
      debug(msg: string) {
        console.debug(`${prefix} ${msg}`);
      },
      info(msg: string) {
        console.info(`${prefix} ${msg}`);
      },
      warn(msg: string) {
        console.warn(`${prefix} ${msg}`);
      },
      error(msg: string) {
        console.error(`${prefix} ${msg}`);
      },
    };
  }

  /**
   * Emits a plugin event to all registered listeners.
   * Automatically assigns a unique ID to the event.
   */
  private emitEvent(event: Omit<PluginEvent, "id">): void {
    const fullEvent: PluginEvent = { id: nanoid(), ...event };
    for (const listener of this.eventListeners) {
      listener(fullEvent);
    }
  }
}

// ============================================================================
// Plugin Registry (Marketplace)
// ============================================================================

/**
 * A marketplace registry for discovering, publishing, and rating plugins.
 *
 * @example
 * ```typescript
 * const registry = new PluginRegistry();
 *
 * // Publish a plugin
 * registry.publish(myPluginManifest);
 *
 * // Search for evaluator plugins
 * const results = registry.search({ type: 'evaluator', sortBy: 'rating' });
 *
 * // Rate a plugin
 * registry.rate('my-plugin', 5);
 *
 * // Get featured plugins
 * const featured = registry.listFeatured(10);
 * ```
 */
export class PluginRegistry {
  private entries: Map<
    string,
    { entry: PluginRegistryEntry; ratings: number[] }
  > = new Map();

  constructor() {
    // empty - all data stored in maps
  }

  /**
   * Publishes a plugin manifest to the registry.
   *
   * @throws Error if a plugin with the same name already exists
   */
  publish(manifest: PluginManifest): PluginRegistryEntry {
    if (this.entries.has(manifest.name)) {
      throw new Error(
        `Plugin "${manifest.name}" is already published. Use a different name or update the existing entry.`,
      );
    }

    const now = new Date();
    const entry: PluginRegistryEntry = {
      manifest,
      downloads: 0,
      rating: 0,
      verified: false,
      publishedAt: now,
      updatedAt: now,
    };

    this.entries.set(manifest.name, { entry, ratings: [] });
    return entry;
  }

  /**
   * Searches the registry based on query parameters.
   */
  search(query: PluginSearchQuery): PluginSearchResult {
    let results = Array.from(this.entries.values()).map((e) => e.entry);

    // Filter by text query (name or description)
    if (query.query) {
      const q = query.query.toLowerCase();
      results = results.filter(
        (entry) =>
          entry.manifest.name.toLowerCase().includes(q) ||
          entry.manifest.description.toLowerCase().includes(q),
      );
    }

    // Filter by type
    if (query.type) {
      results = results.filter((entry) => entry.manifest.type === query.type);
    }

    // Filter by author
    if (query.author) {
      const authorQuery = query.author.toLowerCase();
      results = results.filter((entry) =>
        entry.manifest.author.name.toLowerCase().includes(authorQuery),
      );
    }

    // Filter by verified status
    if (query.verified !== undefined) {
      results = results.filter((entry) => entry.verified === query.verified);
    }

    // Sort
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
      }
    }

    const total = results.length;
    const limit = query.limit ?? total;
    const plugins = results.slice(0, limit);

    return {
      plugins,
      total,
      page: 1,
    };
  }

  /**
   * Gets a registry entry by plugin name and optional version.
   */
  get(name: string, version?: string): PluginRegistryEntry | undefined {
    const data = this.entries.get(name);
    if (!data) {
      return undefined;
    }
    if (version && data.entry.manifest.version !== version) {
      return undefined;
    }
    return data.entry;
  }

  /**
   * Adds a rating (0-5) for a plugin. The stored rating is the average
   * of all ratings.
   *
   * @throws Error if plugin not found or rating out of range
   */
  rate(name: string, rating: number): void {
    const data = this.entries.get(name);
    if (!data) {
      throw new Error(`Plugin "${name}" not found in registry`);
    }
    if (rating < 0 || rating > 5) {
      throw new Error("Rating must be between 0 and 5");
    }

    data.ratings.push(rating);
    const sum = data.ratings.reduce((a, b) => a + b, 0);
    data.entry.rating = sum / data.ratings.length;
    data.entry.updatedAt = new Date();
  }

  /**
   * Increments the download count for a plugin.
   *
   * @throws Error if plugin not found
   */
  recordDownload(name: string): void {
    const data = this.entries.get(name);
    if (!data) {
      throw new Error(`Plugin "${name}" not found in registry`);
    }
    data.entry.downloads++;
    data.entry.updatedAt = new Date();
  }

  /**
   * Marks a plugin as verified.
   *
   * @throws Error if plugin not found
   */
  verify(name: string): void {
    const data = this.entries.get(name);
    if (!data) {
      throw new Error(`Plugin "${name}" not found in registry`);
    }
    data.entry.verified = true;
    data.entry.updatedAt = new Date();
  }

  /**
   * Returns the top-rated verified plugins (featured).
   */
  listFeatured(limit?: number): PluginRegistryEntry[] {
    const verified = Array.from(this.entries.values())
      .filter((data) => data.entry.verified)
      .map((data) => data.entry)
      .sort((a, b) => b.rating - a.rating);

    if (limit !== undefined) {
      return verified.slice(0, limit);
    }
    return verified;
  }
}
