import { describe, it, expect } from "vitest";
import {
  AgentOpsError,
  ConfigurationError,
  ValidationError,
  TransportError,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  CostLimitError,
  isAgentOpsError,
  wrapError,
} from "../src/errors.js";

// ============================================================================
// AgentOpsError base class
// ============================================================================

describe("AgentOpsError", () => {
  it("sets code, message, and timestamp", () => {
    const err = new AgentOpsError("INTERNAL_ERROR", "something broke");
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).toBe("something broke");
    expect(err.timestamp).toBeGreaterThan(0);
    expect(err.name).toBe("AgentOpsError");
  });

  it("includes context when provided", () => {
    const ctx = { key: "value" };
    const err = new AgentOpsError("INTERNAL_ERROR", "msg", ctx);
    expect(err.context).toEqual(ctx);
  });

  it("serializes to JSON", () => {
    const err = new AgentOpsError("PARSE_ERROR", "bad input", { line: 1 });
    const json = err.toJSON();
    expect(json.code).toBe("PARSE_ERROR");
    expect(json.message).toBe("bad input");
    expect(json.name).toBe("AgentOpsError");
    expect(json.context).toEqual({ line: 1 });
    expect(json.timestamp).toBeDefined();
  });

  it("is instanceof Error", () => {
    const err = new AgentOpsError("INTERNAL_ERROR", "msg");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgentOpsError);
  });
});

// ============================================================================
// Subclasses
// ============================================================================

describe("ConfigurationError", () => {
  it("has correct code and name", () => {
    const err = new ConfigurationError("missing API key");
    expect(err.code).toBe("CONFIGURATION_ERROR");
    expect(err.name).toBe("ConfigurationError");
    expect(err).toBeInstanceOf(AgentOpsError);
  });
});

describe("ValidationError", () => {
  it("stores the field name", () => {
    const err = new ValidationError("invalid email", "email");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.field).toBe("email");
    expect(err.context?.field).toBe("email");
  });

  it("works without a field", () => {
    const err = new ValidationError("bad input");
    expect(err.field).toBeUndefined();
  });
});

describe("TransportError", () => {
  it("stores status code and response", () => {
    const err = new TransportError("server error", 500, { error: "fail" });
    expect(err.code).toBe("TRANSPORT_ERROR");
    expect(err.statusCode).toBe(500);
    expect(err.response).toEqual({ error: "fail" });
  });
});

describe("AuthenticationError", () => {
  it("has correct code", () => {
    const err = new AuthenticationError("invalid token");
    expect(err.code).toBe("AUTHENTICATION_ERROR");
    expect(err.name).toBe("AuthenticationError");
  });
});

describe("RateLimitError", () => {
  it("stores retryAfterMs", () => {
    const err = new RateLimitError("too many requests", 5000);
    expect(err.code).toBe("RATE_LIMIT_ERROR");
    expect(err.retryAfterMs).toBe(5000);
  });
});

describe("TimeoutError", () => {
  it("stores timeoutMs", () => {
    const err = new TimeoutError("request timed out", 30000);
    expect(err.code).toBe("TIMEOUT_ERROR");
    expect(err.timeoutMs).toBe(30000);
  });
});

describe("CostLimitError", () => {
  it("stores limit, current, and unit", () => {
    const err = new CostLimitError("budget exceeded", 10.0, 12.5, "USD");
    expect(err.code).toBe("COST_LIMIT_ERROR");
    expect(err.limit).toBe(10.0);
    expect(err.current).toBe(12.5);
    expect(err.unit).toBe("USD");
  });
});

// ============================================================================
// Type guards and utilities
// ============================================================================

describe("isAgentOpsError", () => {
  it("returns true for AgentOpsError instances", () => {
    expect(isAgentOpsError(new AgentOpsError("INTERNAL_ERROR", "msg"))).toBe(
      true,
    );
    expect(isAgentOpsError(new ConfigurationError("msg"))).toBe(true);
    expect(isAgentOpsError(new TransportError("msg", 500))).toBe(true);
  });

  it("returns false for regular errors", () => {
    expect(isAgentOpsError(new Error("msg"))).toBe(false);
  });

  it("returns false for non-errors", () => {
    expect(isAgentOpsError("string")).toBe(false);
    expect(isAgentOpsError(null)).toBe(false);
    expect(isAgentOpsError(undefined)).toBe(false);
  });
});

describe("wrapError", () => {
  it("returns AgentOpsError unchanged", () => {
    const original = new ConfigurationError("msg");
    expect(wrapError(original)).toBe(original);
  });

  it("wraps regular Error into AgentOpsError", () => {
    const original = new TypeError("bad type");
    const wrapped = wrapError(original);
    expect(wrapped).toBeInstanceOf(AgentOpsError);
    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.message).toBe("bad type");
    expect(wrapped.context?.originalError).toBe("TypeError");
  });

  it("wraps string into AgentOpsError", () => {
    const wrapped = wrapError("something failed");
    expect(wrapped).toBeInstanceOf(AgentOpsError);
    expect(wrapped.message).toBe("something failed");
  });

  it("uses custom default code", () => {
    const wrapped = wrapError(new Error("timeout"), "TIMEOUT_ERROR");
    expect(wrapped.code).toBe("TIMEOUT_ERROR");
  });
});
