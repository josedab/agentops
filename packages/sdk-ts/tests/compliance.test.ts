import { describe, it, expect, beforeEach } from "vitest";
import { ComplianceManager, type ComplianceConfig } from "../src/compliance";

describe("ComplianceManager", () => {
  let manager: ComplianceManager;
  const mockConfig: ComplianceConfig = {
    enabled: true,
    enablePIIDetection: true,
    piiTypes: ["email", "phone", "ssn", "credit_card", "api_key"],
  };

  beforeEach(() => {
    manager = new ComplianceManager(mockConfig);
  });

  describe("initialization", () => {
    it("should create manager with config", () => {
      expect(manager).toBeInstanceOf(ComplianceManager);
    });

    it("should report enabled status", () => {
      expect(manager.isEnabled).toBe(true);
    });

    it("should use default values", () => {
      const defaultManager = new ComplianceManager({ enabled: true });
      expect(defaultManager).toBeInstanceOf(ComplianceManager);
    });
  });

  describe("PII detection", () => {
    it("should detect email addresses", () => {
      const text = "Contact me at john.doe@example.com for more info.";
      const result = manager.scanForPII(text);

      expect(result.hasPII).toBe(true);
      expect(result.matches.some((m) => m.type === "email")).toBe(true);
    });

    it("should detect phone numbers", () => {
      const text = "Call me at 555-123-4567 or (555) 987-6543.";
      const result = manager.scanForPII(text);

      expect(result.hasPII).toBe(true);
      expect(result.matches.some((m) => m.type === "phone")).toBe(true);
    });

    it("should detect SSN patterns", () => {
      const text = "My SSN is 123-45-6789.";
      const result = manager.scanForPII(text);

      expect(result.hasPII).toBe(true);
      expect(result.matches.some((m) => m.type === "ssn")).toBe(true);
    });

    it("should detect credit card numbers", () => {
      const text = "My card number is 4532-0151-1283-0366.";
      const result = manager.scanForPII(text);

      expect(result.hasPII).toBe(true);
      expect(result.matches.some((m) => m.type === "credit_card")).toBe(true);
    });

    it("should detect API keys", () => {
      const text = "Use this API key: sk-1234567890abcdef1234567890abcdef";
      const result = manager.scanForPII(text);

      expect(result.hasPII).toBe(true);
      expect(result.matches.some((m) => m.type === "api_key")).toBe(true);
    });

    it("should return no matches for clean text", () => {
      const text = "This is a clean text with no sensitive information.";
      const result = manager.scanForPII(text);

      expect(result.hasPII).toBe(false);
      expect(result.matches.length).toBe(0);
    });

    it("should detect multiple PII types in same text", () => {
      const text =
        "Email: test@example.com, Phone: 555-123-4567, SSN: 123-45-6789";
      const result = manager.scanForPII(text);

      expect(result.hasPII).toBe(true);
      const types = new Set(result.matches.map((m) => m.type));
      expect(types.size).toBeGreaterThanOrEqual(3);
    });

    it("should auto-redact PII in sanitized content", () => {
      const text = "Contact john@example.com for details.";
      const result = manager.scanForPII(text);

      // sanitizedContent should have PII redacted
      expect(result.sanitizedContent).toBeDefined();
      expect(result.sanitizedContent).not.toContain("john@example.com");
    });
  });
});
