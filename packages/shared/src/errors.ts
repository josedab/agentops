/**
 * AgentOps Error Hierarchy
 *
 * Provides a consistent error structure across the SDK.
 */

/**
 * Error codes for AgentOps errors
 */
export type AgentOpsErrorCode =
  | "CONFIGURATION_ERROR"
  | "VALIDATION_ERROR"
  | "TRANSPORT_ERROR"
  | "AUTHENTICATION_ERROR"
  | "RATE_LIMIT_ERROR"
  | "TIMEOUT_ERROR"
  | "STREAMING_ERROR"
  | "COST_LIMIT_ERROR"
  | "PARSE_ERROR"
  | "INTERNAL_ERROR";

/**
 * Base error class for all AgentOps errors
 */
export class AgentOpsError extends Error {
  public readonly code: AgentOpsErrorCode;
  public readonly timestamp: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    code: AgentOpsErrorCode,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AgentOpsError";
    this.code = code;
    this.timestamp = Date.now();
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

/**
 * Configuration-related errors (missing API key, invalid config)
 */
export class ConfigurationError extends AgentOpsError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("CONFIGURATION_ERROR", message, context);
    this.name = "ConfigurationError";
  }
}

/**
 * Input validation errors
 */
export class ValidationError extends AgentOpsError {
  public readonly field?: string;

  constructor(
    message: string,
    field?: string,
    context?: Record<string, unknown>,
  ) {
    super("VALIDATION_ERROR", message, { ...context, field });
    this.name = "ValidationError";
    this.field = field;
  }
}

/**
 * Network/transport errors
 */
export class TransportError extends AgentOpsError {
  public readonly statusCode?: number;
  public readonly response?: unknown;

  constructor(
    message: string,
    statusCode?: number,
    response?: unknown,
    context?: Record<string, unknown>,
  ) {
    super("TRANSPORT_ERROR", message, { ...context, statusCode });
    this.name = "TransportError";
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * Authentication/authorization errors
 */
export class AuthenticationError extends AgentOpsError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("AUTHENTICATION_ERROR", message, context);
    this.name = "AuthenticationError";
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends AgentOpsError {
  public readonly retryAfterMs?: number;

  constructor(
    message: string,
    retryAfterMs?: number,
    context?: Record<string, unknown>,
  ) {
    super("RATE_LIMIT_ERROR", message, { ...context, retryAfterMs });
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends AgentOpsError {
  public readonly timeoutMs: number;

  constructor(
    message: string,
    timeoutMs: number,
    context?: Record<string, unknown>,
  ) {
    super("TIMEOUT_ERROR", message, { ...context, timeoutMs });
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Cost/budget limit errors
 */
export class CostLimitError extends AgentOpsError {
  public readonly limit: number;
  public readonly current: number;
  public readonly unit: string;

  constructor(
    message: string,
    limit: number,
    current: number,
    unit: string,
    context?: Record<string, unknown>,
  ) {
    super("COST_LIMIT_ERROR", message, { ...context, limit, current, unit });
    this.name = "CostLimitError";
    this.limit = limit;
    this.current = current;
    this.unit = unit;
  }
}

/**
 * Type guard to check if an error is an AgentOpsError
 */
export function isAgentOpsError(error: unknown): error is AgentOpsError {
  return error instanceof AgentOpsError;
}

/**
 * Wrap unknown errors into AgentOpsError
 */
export function wrapError(
  error: unknown,
  defaultCode: AgentOpsErrorCode = "INTERNAL_ERROR",
): AgentOpsError {
  if (isAgentOpsError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AgentOpsError(defaultCode, error.message, {
      originalError: error.name,
      stack: error.stack,
    });
  }

  return new AgentOpsError(defaultCode, String(error));
}
