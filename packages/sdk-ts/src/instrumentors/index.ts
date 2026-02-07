/**
 * AgentOps SDK - Agent Framework Auto-Instrumentors
 *
 * Provides automatic instrumentation for popular agent frameworks:
 * - CrewAI: Multi-agent crew orchestration
 * - LangGraph: Stateful graph-based agent workflows
 * - OpenAI Agents: OpenAI's agent SDK with handoffs
 * - AutoGen: Microsoft's multi-agent conversation framework
 * - LlamaIndex: RAG and query engine pipelines
 *
 * Uses Proxy-based wrapping to intercept framework calls without modifying
 * the original framework code. All instrumentors are defensive and fall back
 * gracefully if the framework is not installed or behaves unexpectedly.
 *
 * @packageDocumentation
 */

import type {
  InstrumentorConfig,
  InstrumentorHooks,
  FrameworkInfo,
  InstrumentorStatus,
  InstrumentedCall,
  FrameworkEvent,
} from "./types.js";

// Re-export all types
export type {
  InstrumentorConfig,
  InstrumentorHooks,
  FrameworkInfo,
  InstrumentorStatus,
  InstrumentedCall,
  FrameworkEvent,
  AgentStep,
  ToolCallRecord,
} from "./types.js";

// ============================================================================
// Utility: Generate unique IDs
// ============================================================================

let idCounter = 0;

function generateId(prefix: string): string {
  idCounter += 1;
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}_${idCounter}`;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: InstrumentorConfig = {
  enabled: true,
  captureInputs: true,
  captureOutputs: true,
  captureInternalSteps: true,
  maxContentLength: 10000,
};

// ============================================================================
// BaseInstrumentor (Abstract)
// ============================================================================

/**
 * Abstract base class for all framework instrumentors.
 *
 * Provides common functionality for tracking calls, emitting events,
 * truncating content, and managing instrumentor status.
 *
 * Subclasses must implement:
 * - `instrument(target)` - wraps the framework client/object with a Proxy
 * - `getFrameworkInfo()` - returns metadata about the target framework
 */
export abstract class BaseInstrumentor {
  protected config: InstrumentorConfig;
  protected hooks: InstrumentorHooks;
  protected calls: InstrumentedCall[] = [];
  protected eventsCaptured = 0;
  protected errorCount = 0;
  protected active = false;
  protected startedAt?: number;

  constructor(config: InstrumentorConfig, hooks?: InstrumentorHooks) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hooks = hooks ?? {};
  }

  /**
   * Wrap a framework client/object with instrumentation.
   * Returns the wrapped object (typically a Proxy) that transparently
   * intercepts calls to capture telemetry.
   *
   * @param target - The framework object to instrument
   * @returns The instrumented (wrapped) object
   */
  abstract instrument(target: unknown): unknown;

  /**
   * Return metadata about the framework this instrumentor targets.
   */
  abstract getFrameworkInfo(): FrameworkInfo;

  /**
   * Get the current runtime status of this instrumentor.
   */
  getStatus(): InstrumentorStatus {
    return {
      framework: this.getFrameworkInfo(),
      active: this.active,
      eventsCaptured: this.eventsCaptured,
      errors: this.errorCount,
      startedAt: this.startedAt,
    };
  }

  /**
   * Record an instrumented call for internal tracking.
   */
  recordCall(call: InstrumentedCall): void {
    this.calls.push(call);
    this.eventsCaptured += 1;
  }

  /**
   * Emit a framework event through the configured hooks.
   */
  emit(event: FrameworkEvent): void {
    this.eventsCaptured += 1;
    try {
      if (this.hooks.onEvent) {
        this.hooks.onEvent(event);
      }
    } catch (err) {
      this.errorCount += 1;
      this.handleError(err);
    }
  }

  /**
   * Truncate content to the configured maximum length.
   * Handles strings, objects (via JSON serialization), and other types.
   *
   * @param content - The content to potentially truncate
   * @param maxLen - Override for the configured maxContentLength
   * @returns The truncated content
   */
  protected truncateContent(content: unknown, maxLen?: number): unknown {
    const limit = maxLen ?? this.config.maxContentLength ?? 10000;

    if (content === null || content === undefined) {
      return content;
    }

    if (typeof content === "string") {
      if (content.length > limit) {
        return (
          content.substring(0, limit) +
          `... [truncated, ${content.length} chars total]`
        );
      }
      return content;
    }

    if (typeof content === "object") {
      try {
        const serialized = JSON.stringify(content);
        if (serialized.length > limit) {
          return JSON.parse(serialized.substring(0, limit) + '"}') as unknown;
        }
        return content;
      } catch {
        // If serialization fails, return a placeholder
        return "[unserializable object]";
      }
    }

    return content;
  }

  /**
   * Reset all counters and tracked calls.
   */
  reset(): void {
    this.calls = [];
    this.eventsCaptured = 0;
    this.errorCount = 0;
    this.active = false;
    this.startedAt = undefined;
  }

  /**
   * Handle an error during instrumentation, reporting through hooks.
   */
  protected handleError(err: unknown): void {
    this.errorCount += 1;
    if (this.hooks.onError) {
      try {
        this.hooks.onError(err instanceof Error ? err : new Error(String(err)));
      } catch {
        // Swallow errors in the error handler to prevent infinite loops
      }
    }
  }

  /**
   * Create a standard InstrumentedCall record with common fields.
   */
  protected createCall(
    operation: string,
    input?: unknown,
    parentCallId?: string,
  ): InstrumentedCall {
    return {
      callId: generateId("call"),
      framework: this.getFrameworkInfo().name,
      operation,
      startTime: Date.now(),
      input: this.config.captureInputs
        ? this.truncateContent(input)
        : undefined,
      status: "pending",
      parentCallId,
    };
  }

  /**
   * Complete a call record with result data.
   */
  protected completeCall(
    call: InstrumentedCall,
    output?: unknown,
    error?: unknown,
  ): void {
    call.endTime = Date.now();
    if (error) {
      call.status = "error";
      call.error = error instanceof Error ? error.message : String(error);
    } else {
      call.status = "success";
      call.output = this.config.captureOutputs
        ? this.truncateContent(output)
        : undefined;
    }
    this.recordCall(call);
  }
}

// ============================================================================
// CrewAI Instrumentor
// ============================================================================

/**
 * Instrumentor for CrewAI multi-agent crews.
 *
 * Intercepts:
 * - `kickoff()` calls to track the full crew execution
 * - Individual agent task execution
 * - Delegation between agents
 *
 * @example
 * ```typescript
 * const instrumentor = new CrewAIInstrumentor({ enabled: true, captureInputs: true, captureOutputs: true, captureInternalSteps: true });
 * const instrumentedCrew = instrumentor.instrument(crew);
 * const result = await instrumentedCrew.kickoff();
 * ```
 */
export class CrewAIInstrumentor extends BaseInstrumentor {
  getFrameworkInfo(): FrameworkInfo {
    return { name: "crewai", detected: true };
  }

  instrument(crew: unknown): unknown {
    if (!crew || typeof crew !== "object") {
      return crew;
    }

    if (!this.config.enabled) {
      return crew;
    }

    this.active = true;
    this.startedAt = Date.now();

    const self = this;
    const crewObj = crew as Record<string, unknown>;

    return new Proxy(crewObj, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        // Intercept kickoff() - the main crew execution entry point
        if (prop === "kickoff" && typeof value === "function") {
          return function (...args: unknown[]) {
            const call = self.createCall("kickoff", args);

            self.emit({
              type: "agent_start",
              framework: "crewai",
              data: {
                callId: call.callId,
                operation: "kickoff",
                input: call.input,
              },
              timestamp: Date.now(),
            });

            try {
              const result = (value as Function).apply(target, args);

              // Handle both sync and async results
              if (
                result &&
                typeof result === "object" &&
                typeof (result as Record<string, unknown>).then === "function"
              ) {
                return (result as Promise<unknown>).then(
                  (resolved: unknown) => {
                    self.completeCall(call, resolved);
                    self.emitCrewSteps(call.callId, resolved);
                    self.emit({
                      type: "agent_end",
                      framework: "crewai",
                      data: {
                        callId: call.callId,
                        operation: "kickoff",
                        output: self.config.captureOutputs
                          ? self.truncateContent(resolved)
                          : undefined,
                      },
                      timestamp: Date.now(),
                    });
                    return resolved;
                  },
                  (err: unknown) => {
                    self.completeCall(call, undefined, err);
                    self.emit({
                      type: "error",
                      framework: "crewai",
                      data: {
                        callId: call.callId,
                        operation: "kickoff",
                        error: err instanceof Error ? err.message : String(err),
                      },
                      timestamp: Date.now(),
                    });
                    throw err;
                  },
                );
              }

              self.completeCall(call, result);
              self.emitCrewSteps(call.callId, result);
              self.emit({
                type: "agent_end",
                framework: "crewai",
                data: {
                  callId: call.callId,
                  operation: "kickoff",
                  output: self.config.captureOutputs
                    ? self.truncateContent(result)
                    : undefined,
                },
                timestamp: Date.now(),
              });
              return result;
            } catch (err) {
              self.completeCall(call, undefined, err);
              self.emit({
                type: "error",
                framework: "crewai",
                data: {
                  callId: call.callId,
                  operation: "kickoff",
                  error: err instanceof Error ? err.message : String(err),
                },
                timestamp: Date.now(),
              });
              throw err;
            }
          };
        }

        // Intercept task execution methods for internal step tracking
        if (
          self.config.captureInternalSteps &&
          (prop === "execute_task" || prop === "executeTask") &&
          typeof value === "function"
        ) {
          return self.wrapTaskExecution(
            target,
            value as Function,
            prop as string,
          );
        }

        return value;
      },
    });
  }

  /**
   * Wrap a task execution method to capture agent steps and delegations.
   */
  private wrapTaskExecution(
    target: object,
    fn: Function,
    operation: string,
  ): Function {
    const self = this;
    return function (...args: unknown[]) {
      const call = self.createCall(operation, args);

      self.emit({
        type: "agent_step",
        framework: "crewai",
        data: {
          callId: call.callId,
          operation,
          input: call.input,
        },
        timestamp: Date.now(),
      });

      try {
        const result = fn.apply(target, args);

        if (
          result &&
          typeof result === "object" &&
          typeof (result as Record<string, unknown>).then === "function"
        ) {
          return (result as Promise<unknown>).then(
            (resolved: unknown) => {
              self.completeCall(call, resolved);
              self.checkForDelegation(call.callId, resolved);
              return resolved;
            },
            (err: unknown) => {
              self.completeCall(call, undefined, err);
              throw err;
            },
          );
        }

        self.completeCall(call, result);
        self.checkForDelegation(call.callId, result);
        return result;
      } catch (err) {
        self.completeCall(call, undefined, err);
        throw err;
      }
    };
  }

  /**
   * Emit agent_step events from crew execution results if step data is available.
   */
  private emitCrewSteps(parentCallId: string, result: unknown): void {
    if (!this.config.captureInternalSteps) return;
    if (!result || typeof result !== "object") return;

    const resultObj = result as Record<string, unknown>;

    // CrewAI results may contain tasks_output or steps
    const steps = resultObj.tasks_output ?? resultObj.steps;
    if (Array.isArray(steps)) {
      for (const step of steps) {
        this.emit({
          type: "agent_step",
          framework: "crewai",
          data: {
            parentCallId,
            step: this.config.captureOutputs
              ? this.truncateContent(step)
              : undefined,
          },
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Check if a task result indicates delegation between agents.
   */
  private checkForDelegation(callId: string, result: unknown): void {
    if (!result || typeof result !== "object") return;
    const resultObj = result as Record<string, unknown>;

    if (resultObj.delegated_to || resultObj.delegatedTo || resultObj.coworker) {
      this.emit({
        type: "delegation",
        framework: "crewai",
        data: {
          callId,
          delegatedTo:
            resultObj.delegated_to ??
            resultObj.delegatedTo ??
            resultObj.coworker,
        },
        timestamp: Date.now(),
      });
    }
  }
}

// ============================================================================
// LangGraph Instrumentor
// ============================================================================

/**
 * Instrumentor for LangGraph stateful graph workflows.
 *
 * Intercepts:
 * - `invoke()` calls for synchronous graph execution
 * - `stream()` calls for streaming graph execution
 * - Node transitions and conditional edge evaluation
 *
 * @example
 * ```typescript
 * const instrumentor = new LangGraphInstrumentor({ enabled: true, captureInputs: true, captureOutputs: true, captureInternalSteps: true });
 * const instrumentedGraph = instrumentor.instrument(graph);
 * const result = await instrumentedGraph.invoke({ input: "hello" });
 * ```
 */
export class LangGraphInstrumentor extends BaseInstrumentor {
  getFrameworkInfo(): FrameworkInfo {
    return { name: "langgraph", detected: true };
  }

  instrument(graph: unknown): unknown {
    if (!graph || typeof graph !== "object") {
      return graph;
    }

    if (!this.config.enabled) {
      return graph;
    }

    this.active = true;
    this.startedAt = Date.now();

    const self = this;
    const graphObj = graph as Record<string, unknown>;

    return new Proxy(graphObj, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        // Intercept invoke() - synchronous graph execution
        if (prop === "invoke" && typeof value === "function") {
          return self.wrapGraphMethod(target, value as Function, "invoke");
        }

        // Intercept stream() - streaming graph execution
        if (prop === "stream" && typeof value === "function") {
          return self.wrapStreamMethod(target, value as Function);
        }

        // Intercept ainvoke() - async graph execution (LangChain convention)
        if (prop === "ainvoke" && typeof value === "function") {
          return self.wrapGraphMethod(target, value as Function, "ainvoke");
        }

        return value;
      },
    });
  }

  /**
   * Wrap a standard graph method (invoke/ainvoke) to capture execution.
   */
  private wrapGraphMethod(
    target: object,
    fn: Function,
    operation: string,
  ): Function {
    const self = this;
    return function (...args: unknown[]) {
      const call = self.createCall(operation, args);

      self.emit({
        type: "agent_start",
        framework: "langgraph",
        data: {
          callId: call.callId,
          operation,
          input: call.input,
        },
        timestamp: Date.now(),
      });

      try {
        const result = fn.apply(target, args);

        if (
          result &&
          typeof result === "object" &&
          typeof (result as Record<string, unknown>).then === "function"
        ) {
          return (result as Promise<unknown>).then(
            (resolved: unknown) => {
              self.completeCall(call, resolved);
              self.emitStateTransitions(call.callId, resolved);
              self.emit({
                type: "agent_end",
                framework: "langgraph",
                data: {
                  callId: call.callId,
                  operation,
                  output: self.config.captureOutputs
                    ? self.truncateContent(resolved)
                    : undefined,
                },
                timestamp: Date.now(),
              });
              return resolved;
            },
            (err: unknown) => {
              self.completeCall(call, undefined, err);
              self.emit({
                type: "error",
                framework: "langgraph",
                data: {
                  callId: call.callId,
                  operation,
                  error: err instanceof Error ? err.message : String(err),
                },
                timestamp: Date.now(),
              });
              throw err;
            },
          );
        }

        self.completeCall(call, result);
        self.emitStateTransitions(call.callId, result);
        self.emit({
          type: "agent_end",
          framework: "langgraph",
          data: {
            callId: call.callId,
            operation,
            output: self.config.captureOutputs
              ? self.truncateContent(result)
              : undefined,
          },
          timestamp: Date.now(),
        });
        return result;
      } catch (err) {
        self.completeCall(call, undefined, err);
        self.emit({
          type: "error",
          framework: "langgraph",
          data: {
            callId: call.callId,
            operation,
            error: err instanceof Error ? err.message : String(err),
          },
          timestamp: Date.now(),
        });
        throw err;
      }
    };
  }

  /**
   * Wrap the stream() method to capture streamed graph execution.
   */
  private wrapStreamMethod(target: object, fn: Function): Function {
    const self = this;
    return function (...args: unknown[]) {
      const call = self.createCall("stream", args);

      self.emit({
        type: "agent_start",
        framework: "langgraph",
        data: {
          callId: call.callId,
          operation: "stream",
          input: call.input,
        },
        timestamp: Date.now(),
      });

      try {
        const result = fn.apply(target, args);

        // If the result is an async iterable, wrap it to capture chunks
        if (
          result &&
          typeof result === "object" &&
          Symbol.asyncIterator in (result as object)
        ) {
          return self.wrapAsyncIterable(call, result as AsyncIterable<unknown>);
        }

        // If the result is a promise (returning an async iterable), wrap that
        if (
          result &&
          typeof result === "object" &&
          typeof (result as Record<string, unknown>).then === "function"
        ) {
          return (result as Promise<unknown>).then((iterable: unknown) => {
            if (
              iterable &&
              typeof iterable === "object" &&
              Symbol.asyncIterator in (iterable as object)
            ) {
              return self.wrapAsyncIterable(
                call,
                iterable as AsyncIterable<unknown>,
              );
            }
            self.completeCall(call, iterable);
            return iterable;
          });
        }

        self.completeCall(call, result);
        return result;
      } catch (err) {
        self.completeCall(call, undefined, err);
        self.emit({
          type: "error",
          framework: "langgraph",
          data: {
            callId: call.callId,
            operation: "stream",
            error: err instanceof Error ? err.message : String(err),
          },
          timestamp: Date.now(),
        });
        throw err;
      }
    };
  }

  /**
   * Wrap an async iterable to capture state transitions from streamed output.
   */
  private wrapAsyncIterable(
    call: InstrumentedCall,
    iterable: AsyncIterable<unknown>,
  ): AsyncIterable<unknown> {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        const iterator = iterable[Symbol.asyncIterator]();
        let chunkIndex = 0;

        return {
          async next() {
            try {
              const result = await iterator.next();

              if (!result.done) {
                chunkIndex += 1;
                if (self.config.captureInternalSteps) {
                  self.emit({
                    type: "agent_step",
                    framework: "langgraph",
                    data: {
                      callId: call.callId,
                      chunkIndex,
                      chunk: self.config.captureOutputs
                        ? self.truncateContent(result.value)
                        : undefined,
                    },
                    timestamp: Date.now(),
                  });
                }
              } else {
                self.completeCall(
                  call,
                  `[stream completed, ${chunkIndex} chunks]`,
                );
                self.emit({
                  type: "agent_end",
                  framework: "langgraph",
                  data: {
                    callId: call.callId,
                    operation: "stream",
                    totalChunks: chunkIndex,
                  },
                  timestamp: Date.now(),
                });
              }

              return result;
            } catch (err) {
              self.completeCall(call, undefined, err);
              self.emit({
                type: "error",
                framework: "langgraph",
                data: {
                  callId: call.callId,
                  operation: "stream",
                  error: err instanceof Error ? err.message : String(err),
                },
                timestamp: Date.now(),
              });
              throw err;
            }
          },
        };
      },
    };
  }

  /**
   * Extract and emit state transitions from graph execution results.
   */
  private emitStateTransitions(parentCallId: string, result: unknown): void {
    if (!this.config.captureInternalSteps) return;
    if (!result || typeof result !== "object") return;

    const resultObj = result as Record<string, unknown>;

    // LangGraph results may contain node execution traces
    const nodes =
      resultObj.__nodes__ ??
      resultObj.nodes ??
      resultObj.steps ??
      resultObj.state_transitions;

    if (Array.isArray(nodes)) {
      for (const node of nodes) {
        this.emit({
          type: "agent_step",
          framework: "langgraph",
          data: {
            parentCallId,
            node: this.config.captureOutputs
              ? this.truncateContent(node)
              : undefined,
            type: "node_transition",
          },
          timestamp: Date.now(),
        });
      }
    }

    // Check for conditional edge evaluations
    const edges = resultObj.__edges__ ?? resultObj.edges;
    if (Array.isArray(edges)) {
      for (const edge of edges) {
        this.emit({
          type: "agent_step",
          framework: "langgraph",
          data: {
            parentCallId,
            edge: this.truncateContent(edge),
            type: "conditional_edge",
          },
          timestamp: Date.now(),
        });
      }
    }
  }
}

// ============================================================================
// OpenAI Agents Instrumentor
// ============================================================================

/**
 * Instrumentor for OpenAI's Agents SDK.
 *
 * Intercepts:
 * - `run()` calls to track agent execution
 * - Function/tool call invocations
 * - Handoffs between agents
 *
 * @example
 * ```typescript
 * const instrumentor = new OpenAIAgentsInstrumentor({ enabled: true, captureInputs: true, captureOutputs: true, captureInternalSteps: true });
 * const instrumentedRunner = instrumentor.instrument(runner);
 * const result = await instrumentedRunner.run(agent, "Hello!");
 * ```
 */
export class OpenAIAgentsInstrumentor extends BaseInstrumentor {
  getFrameworkInfo(): FrameworkInfo {
    return { name: "openai-agents", detected: true };
  }

  instrument(runner: unknown): unknown {
    if (!runner || typeof runner !== "object") {
      return runner;
    }

    if (!this.config.enabled) {
      return runner;
    }

    this.active = true;
    this.startedAt = Date.now();

    const self = this;
    const runnerObj = runner as Record<string, unknown>;

    return new Proxy(runnerObj, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        // Intercept run() - the main execution entry point
        if (prop === "run" && typeof value === "function") {
          return self.wrapRunMethod(target, value as Function);
        }

        // Intercept run_sync() for synchronous execution
        if (
          (prop === "run_sync" || prop === "runSync") &&
          typeof value === "function"
        ) {
          return self.wrapRunMethod(target, value as Function, "run_sync");
        }

        return value;
      },
    });
  }

  /**
   * Wrap the run/run_sync method to capture full agent execution.
   */
  private wrapRunMethod(
    target: object,
    fn: Function,
    operation = "run",
  ): Function {
    const self = this;
    return function (...args: unknown[]) {
      const agentArg = args[0];
      const inputArg = args[1];
      const agentName = self.extractAgentName(agentArg);

      const call = self.createCall(operation, {
        agent: agentName,
        input: inputArg,
      });

      self.emit({
        type: "agent_start",
        framework: "openai-agents",
        data: {
          callId: call.callId,
          operation,
          agent: agentName,
          input: self.config.captureInputs
            ? self.truncateContent(inputArg)
            : undefined,
        },
        timestamp: Date.now(),
      });

      try {
        const result = fn.apply(target, args);

        if (
          result &&
          typeof result === "object" &&
          typeof (result as Record<string, unknown>).then === "function"
        ) {
          return (result as Promise<unknown>).then(
            (resolved: unknown) => {
              self.completeCall(call, resolved);
              self.extractRunDetails(call.callId, resolved);
              self.emit({
                type: "agent_end",
                framework: "openai-agents",
                data: {
                  callId: call.callId,
                  operation,
                  agent: agentName,
                  output: self.config.captureOutputs
                    ? self.truncateContent(resolved)
                    : undefined,
                },
                timestamp: Date.now(),
              });
              return resolved;
            },
            (err: unknown) => {
              self.completeCall(call, undefined, err);
              self.emit({
                type: "error",
                framework: "openai-agents",
                data: {
                  callId: call.callId,
                  operation,
                  agent: agentName,
                  error: err instanceof Error ? err.message : String(err),
                },
                timestamp: Date.now(),
              });
              throw err;
            },
          );
        }

        self.completeCall(call, result);
        self.extractRunDetails(call.callId, result);
        self.emit({
          type: "agent_end",
          framework: "openai-agents",
          data: {
            callId: call.callId,
            operation,
            agent: agentName,
            output: self.config.captureOutputs
              ? self.truncateContent(result)
              : undefined,
          },
          timestamp: Date.now(),
        });
        return result;
      } catch (err) {
        self.completeCall(call, undefined, err);
        self.emit({
          type: "error",
          framework: "openai-agents",
          data: {
            callId: call.callId,
            operation,
            agent: agentName,
            error: err instanceof Error ? err.message : String(err),
          },
          timestamp: Date.now(),
        });
        throw err;
      }
    };
  }

  /**
   * Extract the agent name from the agent argument.
   */
  private extractAgentName(agent: unknown): string {
    if (!agent || typeof agent !== "object") return "unknown";
    const agentObj = agent as Record<string, unknown>;
    return (
      (agentObj.name as string) ?? (agentObj.agent_name as string) ?? "unknown"
    );
  }

  /**
   * Extract function calls and handoffs from a run result.
   */
  private extractRunDetails(parentCallId: string, result: unknown): void {
    if (!this.config.captureInternalSteps) return;
    if (!result || typeof result !== "object") return;

    const resultObj = result as Record<string, unknown>;

    // Extract tool/function calls
    const toolCalls =
      resultObj.tool_calls ??
      resultObj.toolCalls ??
      resultObj.function_calls ??
      resultObj.new_items;

    if (Array.isArray(toolCalls)) {
      for (const toolCall of toolCalls) {
        const tcObj = toolCall as Record<string, unknown>;
        const toolName =
          (tcObj.name as string) ??
          (tcObj.function_name as string) ??
          (tcObj.type as string) ??
          "unknown_tool";

        this.emit({
          type: "tool_call",
          framework: "openai-agents",
          data: {
            parentCallId,
            tool: toolName,
            input: this.config.captureInputs
              ? this.truncateContent(tcObj.arguments ?? tcObj.input)
              : undefined,
          },
          timestamp: Date.now(),
        });

        // If the tool call has a result, emit that too
        if (tcObj.result !== undefined || tcObj.output !== undefined) {
          this.emit({
            type: "tool_result",
            framework: "openai-agents",
            data: {
              parentCallId,
              tool: toolName,
              output: this.config.captureOutputs
                ? this.truncateContent(tcObj.result ?? tcObj.output)
                : undefined,
            },
            timestamp: Date.now(),
          });
        }
      }
    }

    // Extract handoffs between agents
    const handoffs =
      resultObj.handoffs ?? resultObj.agent_handoffs ?? resultObj.transfers;

    if (Array.isArray(handoffs)) {
      for (const handoff of handoffs) {
        const hObj = handoff as Record<string, unknown>;
        this.emit({
          type: "delegation",
          framework: "openai-agents",
          data: {
            parentCallId,
            fromAgent: hObj.from_agent ?? hObj.fromAgent ?? hObj.source,
            toAgent: hObj.to_agent ?? hObj.toAgent ?? hObj.target,
            reason: hObj.reason,
          },
          timestamp: Date.now(),
        });
      }
    }

    // Check for a final handoff in the result (single agent handoff pattern)
    if (resultObj.last_agent || resultObj.finalAgent) {
      const finalAgent = resultObj.last_agent ?? resultObj.finalAgent;
      if (typeof finalAgent === "object" && finalAgent !== null) {
        const name = (finalAgent as Record<string, unknown>).name;
        if (name) {
          this.emit({
            type: "delegation",
            framework: "openai-agents",
            data: {
              parentCallId,
              toAgent: name,
              type: "final_handoff",
            },
            timestamp: Date.now(),
          });
        }
      }
    }
  }
}

// ============================================================================
// AutoGen Instrumentor
// ============================================================================

/**
 * Instrumentor for Microsoft's AutoGen multi-agent conversation framework.
 *
 * Intercepts:
 * - Message passing between agents in group chats
 * - Tool executions within agent conversations
 * - Inter-agent messaging and coordination
 *
 * @example
 * ```typescript
 * const instrumentor = new AutoGenInstrumentor({ enabled: true, captureInputs: true, captureOutputs: true, captureInternalSteps: true });
 * const instrumentedChat = instrumentor.instrument(groupChat);
 * ```
 */
export class AutoGenInstrumentor extends BaseInstrumentor {
  getFrameworkInfo(): FrameworkInfo {
    return { name: "autogen", detected: true };
  }

  instrument(groupChat: unknown): unknown {
    if (!groupChat || typeof groupChat !== "object") {
      return groupChat;
    }

    if (!this.config.enabled) {
      return groupChat;
    }

    this.active = true;
    this.startedAt = Date.now();

    const self = this;
    const chatObj = groupChat as Record<string, unknown>;

    return new Proxy(chatObj, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        // Intercept initiate_chat / initiateChat - main group chat entry
        if (
          (prop === "initiate_chat" ||
            prop === "initiateChat" ||
            prop === "run") &&
          typeof value === "function"
        ) {
          return self.wrapChatMethod(target, value as Function, prop as string);
        }

        // Intercept send() - message sending between agents
        if (prop === "send" && typeof value === "function") {
          return self.wrapSendMethod(target, value as Function);
        }

        // Intercept generate_reply / generateReply - agent response generation
        if (
          (prop === "generate_reply" || prop === "generateReply") &&
          typeof value === "function"
        ) {
          return self.wrapReplyMethod(
            target,
            value as Function,
            prop as string,
          );
        }

        // Intercept execute_function / executeFunction - tool execution
        if (
          (prop === "execute_function" || prop === "executeFunction") &&
          typeof value === "function"
        ) {
          return self.wrapToolExecution(
            target,
            value as Function,
            prop as string,
          );
        }

        return value;
      },
    });
  }

  /**
   * Wrap the initiate_chat method to capture the full conversation.
   */
  private wrapChatMethod(
    target: object,
    fn: Function,
    operation: string,
  ): Function {
    const self = this;
    return function (...args: unknown[]) {
      const call = self.createCall(operation, args);

      self.emit({
        type: "agent_start",
        framework: "autogen",
        data: {
          callId: call.callId,
          operation,
          input: call.input,
        },
        timestamp: Date.now(),
      });

      try {
        const result = fn.apply(target, args);

        if (
          result &&
          typeof result === "object" &&
          typeof (result as Record<string, unknown>).then === "function"
        ) {
          return (result as Promise<unknown>).then(
            (resolved: unknown) => {
              self.completeCall(call, resolved);
              self.extractChatHistory(call.callId, resolved);
              self.emit({
                type: "agent_end",
                framework: "autogen",
                data: {
                  callId: call.callId,
                  operation,
                  output: self.config.captureOutputs
                    ? self.truncateContent(resolved)
                    : undefined,
                },
                timestamp: Date.now(),
              });
              return resolved;
            },
            (err: unknown) => {
              self.completeCall(call, undefined, err);
              self.emit({
                type: "error",
                framework: "autogen",
                data: {
                  callId: call.callId,
                  operation,
                  error: err instanceof Error ? err.message : String(err),
                },
                timestamp: Date.now(),
              });
              throw err;
            },
          );
        }

        self.completeCall(call, result);
        self.extractChatHistory(call.callId, result);
        self.emit({
          type: "agent_end",
          framework: "autogen",
          data: {
            callId: call.callId,
            operation,
            output: self.config.captureOutputs
              ? self.truncateContent(result)
              : undefined,
          },
          timestamp: Date.now(),
        });
        return result;
      } catch (err) {
        self.completeCall(call, undefined, err);
        self.emit({
          type: "error",
          framework: "autogen",
          data: {
            callId: call.callId,
            operation,
            error: err instanceof Error ? err.message : String(err),
          },
          timestamp: Date.now(),
        });
        throw err;
      }
    };
  }

  /**
   * Wrap the send() method to capture inter-agent messages.
   */
  private wrapSendMethod(target: object, fn: Function): Function {
    const self = this;
    return function (...args: unknown[]) {
      const message = args[0];
      const recipient = args[1];

      if (self.config.captureInternalSteps) {
        self.emit({
          type: "agent_step",
          framework: "autogen",
          data: {
            operation: "send",
            message: self.config.captureInputs
              ? self.truncateContent(message)
              : undefined,
            recipient: self.extractAgentName(recipient),
            sender: self.extractAgentName(target),
          },
          timestamp: Date.now(),
        });
      }

      try {
        const result = fn.apply(target, args);

        if (
          result &&
          typeof result === "object" &&
          typeof (result as Record<string, unknown>).then === "function"
        ) {
          return (result as Promise<unknown>).then(
            (resolved: unknown) => resolved,
            (err: unknown) => {
              self.handleError(err);
              throw err;
            },
          );
        }

        return result;
      } catch (err) {
        self.handleError(err);
        throw err;
      }
    };
  }

  /**
   * Wrap generate_reply to capture agent response generation.
   */
  private wrapReplyMethod(
    target: object,
    fn: Function,
    operation: string,
  ): Function {
    const self = this;
    return function (...args: unknown[]) {
      const call = self.createCall(operation, args);

      try {
        const result = fn.apply(target, args);

        if (
          result &&
          typeof result === "object" &&
          typeof (result as Record<string, unknown>).then === "function"
        ) {
          return (result as Promise<unknown>).then(
            (resolved: unknown) => {
              self.completeCall(call, resolved);
              if (self.config.captureInternalSteps) {
                self.emit({
                  type: "agent_step",
                  framework: "autogen",
                  data: {
                    callId: call.callId,
                    operation,
                    agent: self.extractAgentName(target),
                    output: self.config.captureOutputs
                      ? self.truncateContent(resolved)
                      : undefined,
                  },
                  timestamp: Date.now(),
                });
              }
              return resolved;
            },
            (err: unknown) => {
              self.completeCall(call, undefined, err);
              throw err;
            },
          );
        }

        self.completeCall(call, result);
        return result;
      } catch (err) {
        self.completeCall(call, undefined, err);
        throw err;
      }
    };
  }

  /**
   * Wrap tool execution methods.
   */
  private wrapToolExecution(
    target: object,
    fn: Function,
    operation: string,
  ): Function {
    const self = this;
    return function (...args: unknown[]) {
      const funcName = typeof args[0] === "string" ? args[0] : "unknown_tool";

      self.emit({
        type: "tool_call",
        framework: "autogen",
        data: {
          operation,
          tool: funcName,
          input: self.config.captureInputs
            ? self.truncateContent(args.slice(1))
            : undefined,
        },
        timestamp: Date.now(),
      });

      try {
        const result = fn.apply(target, args);

        if (
          result &&
          typeof result === "object" &&
          typeof (result as Record<string, unknown>).then === "function"
        ) {
          return (result as Promise<unknown>).then(
            (resolved: unknown) => {
              self.emit({
                type: "tool_result",
                framework: "autogen",
                data: {
                  tool: funcName,
                  output: self.config.captureOutputs
                    ? self.truncateContent(resolved)
                    : undefined,
                },
                timestamp: Date.now(),
              });
              return resolved;
            },
            (err: unknown) => {
              self.emit({
                type: "error",
                framework: "autogen",
                data: {
                  tool: funcName,
                  error: err instanceof Error ? err.message : String(err),
                },
                timestamp: Date.now(),
              });
              throw err;
            },
          );
        }

        self.emit({
          type: "tool_result",
          framework: "autogen",
          data: {
            tool: funcName,
            output: self.config.captureOutputs
              ? self.truncateContent(result)
              : undefined,
          },
          timestamp: Date.now(),
        });
        return result;
      } catch (err) {
        self.emit({
          type: "error",
          framework: "autogen",
          data: {
            tool: funcName,
            error: err instanceof Error ? err.message : String(err),
          },
          timestamp: Date.now(),
        });
        throw err;
      }
    };
  }

  /**
   * Extract the agent name from an agent object.
   */
  private extractAgentName(agent: unknown): string {
    if (!agent || typeof agent !== "object") return "unknown";
    const agentObj = agent as Record<string, unknown>;
    return (
      (agentObj.name as string) ??
      (agentObj.agent_name as string) ??
      (agentObj._name as string) ??
      "unknown"
    );
  }

  /**
   * Extract chat history from a conversation result to emit step events.
   */
  private extractChatHistory(parentCallId: string, result: unknown): void {
    if (!this.config.captureInternalSteps) return;
    if (!result || typeof result !== "object") return;

    const resultObj = result as Record<string, unknown>;

    // AutoGen conversations typically have a chat_history or messages array
    const messages =
      resultObj.chat_history ?? resultObj.messages ?? resultObj.history;

    if (Array.isArray(messages)) {
      for (const message of messages) {
        const msgObj = message as Record<string, unknown>;
        this.emit({
          type: "agent_step",
          framework: "autogen",
          data: {
            parentCallId,
            role: msgObj.role ?? msgObj.sender,
            content: this.config.captureOutputs
              ? this.truncateContent(msgObj.content)
              : undefined,
            type: "message",
          },
          timestamp: Date.now(),
        });
      }
    }
  }
}

// ============================================================================
// LlamaIndex Instrumentor
// ============================================================================

/**
 * Instrumentor for LlamaIndex query engines and RAG pipelines.
 *
 * Intercepts:
 * - `query()` calls to track full RAG pipeline execution
 * - Retrieval, embedding, and reranking stages
 * - Index operations
 *
 * @example
 * ```typescript
 * const instrumentor = new LlamaIndexInstrumentor({ enabled: true, captureInputs: true, captureOutputs: true, captureInternalSteps: true });
 * const instrumentedEngine = instrumentor.instrument(queryEngine);
 * const response = await instrumentedEngine.query("What is RAG?");
 * ```
 */
export class LlamaIndexInstrumentor extends BaseInstrumentor {
  getFrameworkInfo(): FrameworkInfo {
    return { name: "llamaindex", detected: true };
  }

  instrument(queryEngine: unknown): unknown {
    if (!queryEngine || typeof queryEngine !== "object") {
      return queryEngine;
    }

    if (!this.config.enabled) {
      return queryEngine;
    }

    this.active = true;
    this.startedAt = Date.now();

    const self = this;
    const engineObj = queryEngine as Record<string, unknown>;

    return new Proxy(engineObj, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        // Intercept query() - the main query entry point
        if (prop === "query" && typeof value === "function") {
          return self.wrapQueryMethod(target, value as Function, "query");
        }

        // Intercept aquery() - async query variant
        if (prop === "aquery" && typeof value === "function") {
          return self.wrapQueryMethod(target, value as Function, "aquery");
        }

        // Intercept retrieve() - retrieval stage
        if (prop === "retrieve" && typeof value === "function") {
          return self.wrapRetrievalMethod(target, value as Function);
        }

        // Intercept synthesize() - synthesis/generation stage
        if (prop === "synthesize" && typeof value === "function") {
          return self.wrapSynthesizeMethod(target, value as Function);
        }

        return value;
      },
    });
  }

  /**
   * Wrap the query method to capture the full RAG pipeline execution.
   */
  private wrapQueryMethod(
    target: object,
    fn: Function,
    operation: string,
  ): Function {
    const self = this;
    return function (...args: unknown[]) {
      const call = self.createCall(operation, args);

      self.emit({
        type: "agent_start",
        framework: "llamaindex",
        data: {
          callId: call.callId,
          operation,
          input: call.input,
        },
        timestamp: Date.now(),
      });

      try {
        const result = fn.apply(target, args);

        if (
          result &&
          typeof result === "object" &&
          typeof (result as Record<string, unknown>).then === "function"
        ) {
          return (result as Promise<unknown>).then(
            (resolved: unknown) => {
              self.completeCall(call, resolved);
              self.extractRAGStages(call.callId, resolved);
              self.emit({
                type: "agent_end",
                framework: "llamaindex",
                data: {
                  callId: call.callId,
                  operation,
                  output: self.config.captureOutputs
                    ? self.truncateContent(resolved)
                    : undefined,
                },
                timestamp: Date.now(),
              });
              return resolved;
            },
            (err: unknown) => {
              self.completeCall(call, undefined, err);
              self.emit({
                type: "error",
                framework: "llamaindex",
                data: {
                  callId: call.callId,
                  operation,
                  error: err instanceof Error ? err.message : String(err),
                },
                timestamp: Date.now(),
              });
              throw err;
            },
          );
        }

        self.completeCall(call, result);
        self.extractRAGStages(call.callId, result);
        self.emit({
          type: "agent_end",
          framework: "llamaindex",
          data: {
            callId: call.callId,
            operation,
            output: self.config.captureOutputs
              ? self.truncateContent(result)
              : undefined,
          },
          timestamp: Date.now(),
        });
        return result;
      } catch (err) {
        self.completeCall(call, undefined, err);
        self.emit({
          type: "error",
          framework: "llamaindex",
          data: {
            callId: call.callId,
            operation,
            error: err instanceof Error ? err.message : String(err),
          },
          timestamp: Date.now(),
        });
        throw err;
      }
    };
  }

  /**
   * Wrap the retrieve() method to capture the retrieval stage.
   */
  private wrapRetrievalMethod(target: object, fn: Function): Function {
    const self = this;
    return function (...args: unknown[]) {
      const call = self.createCall("retrieve", args);

      if (self.config.captureInternalSteps) {
        self.emit({
          type: "agent_step",
          framework: "llamaindex",
          data: {
            callId: call.callId,
            stage: "retrieval",
            input: call.input,
          },
          timestamp: Date.now(),
        });
      }

      try {
        const result = fn.apply(target, args);

        if (
          result &&
          typeof result === "object" &&
          typeof (result as Record<string, unknown>).then === "function"
        ) {
          return (result as Promise<unknown>).then(
            (resolved: unknown) => {
              self.completeCall(call, resolved);
              self.emitRetrievalDetails(call.callId, resolved);
              return resolved;
            },
            (err: unknown) => {
              self.completeCall(call, undefined, err);
              throw err;
            },
          );
        }

        self.completeCall(call, result);
        self.emitRetrievalDetails(call.callId, result);
        return result;
      } catch (err) {
        self.completeCall(call, undefined, err);
        throw err;
      }
    };
  }

  /**
   * Wrap the synthesize() method to capture the synthesis/generation stage.
   */
  private wrapSynthesizeMethod(target: object, fn: Function): Function {
    const self = this;
    return function (...args: unknown[]) {
      const call = self.createCall("synthesize", args);

      if (self.config.captureInternalSteps) {
        self.emit({
          type: "agent_step",
          framework: "llamaindex",
          data: {
            callId: call.callId,
            stage: "synthesis",
            input: self.config.captureInputs
              ? self.truncateContent(args)
              : undefined,
          },
          timestamp: Date.now(),
        });
      }

      try {
        const result = fn.apply(target, args);

        if (
          result &&
          typeof result === "object" &&
          typeof (result as Record<string, unknown>).then === "function"
        ) {
          return (result as Promise<unknown>).then(
            (resolved: unknown) => {
              self.completeCall(call, resolved);
              return resolved;
            },
            (err: unknown) => {
              self.completeCall(call, undefined, err);
              throw err;
            },
          );
        }

        self.completeCall(call, result);
        return result;
      } catch (err) {
        self.completeCall(call, undefined, err);
        throw err;
      }
    };
  }

  /**
   * Extract RAG pipeline stages from a query result.
   */
  private extractRAGStages(parentCallId: string, result: unknown): void {
    if (!this.config.captureInternalSteps) return;
    if (!result || typeof result !== "object") return;

    const resultObj = result as Record<string, unknown>;

    // Extract source nodes (retrieval results)
    const sourceNodes =
      resultObj.source_nodes ?? resultObj.sourceNodes ?? resultObj.nodes;

    if (Array.isArray(sourceNodes)) {
      this.emit({
        type: "agent_step",
        framework: "llamaindex",
        data: {
          parentCallId,
          stage: "retrieval",
          nodeCount: sourceNodes.length,
          nodes: this.config.captureOutputs
            ? this.truncateContent(
                sourceNodes.map((n: unknown) => {
                  if (!n || typeof n !== "object") return n;
                  const nObj = n as Record<string, unknown>;
                  return {
                    score: nObj.score,
                    id: nObj.node_id ?? nObj.id,
                    text: this.truncateContent(
                      nObj.text ?? (nObj.node as Record<string, unknown>)?.text,
                      500,
                    ),
                  };
                }),
              )
            : undefined,
        },
        timestamp: Date.now(),
      });
    }

    // Extract metadata about embedding stage if present
    const metadata = resultObj.metadata as Record<string, unknown> | undefined;
    if (metadata) {
      if (metadata.embedding_model || metadata.embeddingModel) {
        this.emit({
          type: "agent_step",
          framework: "llamaindex",
          data: {
            parentCallId,
            stage: "embedding",
            model: metadata.embedding_model ?? metadata.embeddingModel,
          },
          timestamp: Date.now(),
        });
      }

      // Check for reranking stage
      if (metadata.reranker || metadata.rerank_model) {
        this.emit({
          type: "agent_step",
          framework: "llamaindex",
          data: {
            parentCallId,
            stage: "reranking",
            model: metadata.reranker ?? metadata.rerank_model,
          },
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Emit details about retrieved nodes.
   */
  private emitRetrievalDetails(callId: string, result: unknown): void {
    if (!this.config.captureInternalSteps) return;
    if (!Array.isArray(result)) return;

    this.emit({
      type: "tool_result",
      framework: "llamaindex",
      data: {
        callId,
        stage: "retrieval",
        nodeCount: result.length,
        nodes: this.config.captureOutputs
          ? this.truncateContent(
              result.map((n: unknown) => {
                if (!n || typeof n !== "object") return n;
                const nObj = n as Record<string, unknown>;
                return {
                  score: nObj.score,
                  id: nObj.node_id ?? nObj.id,
                };
              }),
            )
          : undefined,
      },
      timestamp: Date.now(),
    });
  }
}

// ============================================================================
// AutoInstrumentor
// ============================================================================

/** Framework detection signatures used by AutoInstrumentor. */
interface FrameworkSignature {
  name: string;
  /** Property names or methods that indicate this framework */
  indicators: string[];
  /** Factory function to create the corresponding instrumentor */
  createInstrumentor: (
    config: InstrumentorConfig,
    hooks?: InstrumentorHooks,
  ) => BaseInstrumentor;
}

const FRAMEWORK_SIGNATURES: FrameworkSignature[] = [
  {
    name: "crewai",
    indicators: ["kickoff", "tasks", "agents", "crew_output"],
    createInstrumentor: (config, hooks) =>
      new CrewAIInstrumentor(config, hooks),
  },
  {
    name: "langgraph",
    indicators: ["invoke", "stream", "get_graph", "nodes", "edges"],
    createInstrumentor: (config, hooks) =>
      new LangGraphInstrumentor(config, hooks),
  },
  {
    name: "openai-agents",
    indicators: ["run", "run_sync", "Runner", "Agent"],
    createInstrumentor: (config, hooks) =>
      new OpenAIAgentsInstrumentor(config, hooks),
  },
  {
    name: "autogen",
    indicators: ["initiate_chat", "send", "generate_reply", "chat_messages"],
    createInstrumentor: (config, hooks) =>
      new AutoGenInstrumentor(config, hooks),
  },
  {
    name: "llamaindex",
    indicators: ["query", "retrieve", "synthesize", "source_nodes"],
    createInstrumentor: (config, hooks) =>
      new LlamaIndexInstrumentor(config, hooks),
  },
];

/**
 * Automatic framework detection and instrumentation.
 *
 * Scans objects for framework-specific signatures and creates the
 * appropriate instrumentors. This enables zero-configuration
 * instrumentation where the SDK detects which framework is in use.
 *
 * @example
 * ```typescript
 * const auto = new AutoInstrumentor();
 *
 * // Detect frameworks from objects
 * const detected = auto.detect([crew, graph, runner]);
 *
 * // Auto-instrument all detected frameworks
 * const instrumentors = auto.instrumentAll();
 * ```
 */
export class AutoInstrumentor {
  private targets: unknown[] = [];

  /**
   * Detect which agent frameworks are present based on the provided objects.
   *
   * Inspects each target for framework-specific method names and properties
   * to determine which framework it belongs to.
   *
   * @param targets - Optional array of objects to scan for framework signatures.
   *   If not provided, uses previously registered targets.
   * @returns Array of detected framework information
   */
  detect(targets?: unknown[]): FrameworkInfo[] {
    if (targets) {
      this.targets = targets;
    }

    const detected: FrameworkInfo[] = [];

    for (const signature of FRAMEWORK_SIGNATURES) {
      let found = false;

      for (const target of this.targets) {
        if (!target || typeof target !== "object") continue;

        const matchCount = signature.indicators.filter((indicator) => {
          try {
            return indicator in (target as object);
          } catch {
            return false;
          }
        }).length;

        // Require at least 2 matching indicators for a confident detection
        if (matchCount >= 2) {
          found = true;
          break;
        }
      }

      detected.push({
        name: signature.name,
        detected: found,
      });
    }

    return detected;
  }

  /**
   * Auto-detect frameworks from provided targets and create instrumentors for all detected ones.
   *
   * @param config - Optional configuration to apply to all instrumentors.
   *   Defaults to enabling all capture options.
   * @param hooks - Optional hooks to attach to all instrumentors
   * @returns Map of framework name to its instrumentor instance
   */
  instrumentAll(
    config?: InstrumentorConfig,
    hooks?: InstrumentorHooks,
  ): Map<string, BaseInstrumentor> {
    const resolvedConfig: InstrumentorConfig = config ?? {
      ...DEFAULT_CONFIG,
    };

    const instrumentors = new Map<string, BaseInstrumentor>();
    const detectedFrameworks = this.detect();

    for (const framework of detectedFrameworks) {
      if (!framework.detected) continue;

      const signature = FRAMEWORK_SIGNATURES.find(
        (s) => s.name === framework.name,
      );
      if (!signature) continue;

      try {
        const instrumentor = signature.createInstrumentor(
          resolvedConfig,
          hooks,
        );
        instrumentors.set(framework.name, instrumentor);
      } catch {
        // If instrumentor creation fails, skip gracefully
      }
    }

    return instrumentors;
  }
}
