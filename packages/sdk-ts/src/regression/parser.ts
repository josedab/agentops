/**
 * Prompt Regression Testing - YAML Parser
 *
 * Parses YAML test definition files into TestSuite objects.
 */

import {
  TestSuite,
  TestCase,
  TestSuiteYaml,
  TestCaseYaml,
  TestAssertion,
  TestBaseline,
  AssertionType,
} from "./types.js";

// Simple YAML parser for test files (avoids external dependency)
// Supports basic YAML features needed for test definitions

/**
 * Parse a YAML test suite file content
 */
export function parseTestSuiteYaml(
  content: string,
  filePath?: string,
): TestSuite {
  const yaml = parseYaml(content) as TestSuiteYaml;

  if (yaml.version !== "1.0") {
    throw new Error(`Unsupported test suite version: ${yaml.version}`);
  }

  const suiteId =
    filePath?.replace(/[^a-zA-Z0-9]/g, "_") ??
    `suite_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: suiteId,
    name: yaml.name,
    description: yaml.description,
    defaults: yaml.defaults
      ? {
          model: yaml.defaults.model,
          temperature: yaml.defaults.temperature,
          maxTokens: yaml.defaults.max_tokens,
          timeout: yaml.defaults.timeout,
          runs: yaml.defaults.runs,
        }
      : undefined,
    testCases: yaml.tests.map((t) => parseTestCase(t)),
    updatedAt: Date.now(),
  };
}

function parseTestCase(yaml: TestCaseYaml): TestCase {
  return {
    id: yaml.id,
    name: yaml.name,
    description: yaml.description,
    tags: yaml.tags,
    enabled: yaml.enabled ?? true,
    input: {
      systemPrompt: yaml.input.system,
      messages: yaml.input.messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      model: yaml.input.model,
      temperature: yaml.input.temperature,
      maxTokens: yaml.input.max_tokens,
      tools: yaml.input.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
    assertions: yaml.assertions.map((a) => parseAssertion(a)),
    baseline: yaml.baseline ? parseBaseline(yaml.baseline) : undefined,
  };
}

function parseAssertion(yaml: {
  type: string;
  target?: string;
  value: unknown;
  message?: string;
  severity?: string;
  weight?: number;
}): TestAssertion {
  return {
    type: yaml.type as AssertionType,
    target:
      (yaml.target as "response" | "tool_calls" | "metrics") ?? "response",
    value: yaml.value,
    message: yaml.message,
    severity: (yaml.severity as "error" | "warning") ?? "error",
    weight: yaml.weight,
  };
}

function parseBaseline(
  yaml: NonNullable<TestCaseYaml["baseline"]>,
): TestBaseline {
  return {
    id: `baseline_${Date.now()}`,
    capturedAt: Date.now(),
    response: yaml.response,
    metrics: {
      latencyMs: yaml.metrics.latency_ms,
      promptTokens: yaml.metrics.prompt_tokens,
      completionTokens: yaml.metrics.completion_tokens,
      totalTokens: yaml.metrics.total_tokens,
      cost: yaml.metrics.cost,
    },
    tolerance: yaml.tolerance
      ? {
          latencyPercent: yaml.tolerance.latency_percent,
          tokenPercent: yaml.tolerance.token_percent,
          costPercent: yaml.tolerance.cost_percent,
          semanticSimilarity: yaml.tolerance.semantic_similarity,
        }
      : undefined,
  };
}

/**
 * Simple YAML parser for test definition files.
 * Supports: strings, numbers, booleans, lists, objects, multiline strings
 */
function parseYaml(content: string): unknown {
  const lines = content.split("\n");
  let lineIndex = 0;

  function parseLine(): {
    indent: number;
    key?: string;
    value?: string;
    isListItem: boolean;
  } {
    const line = lines[lineIndex] ?? "";
    const match = line.match(/^(\s*)(- )?(\S+)?:\s*(.*)$/);

    if (!match) {
      // Check for list item without key
      const listMatch = line.match(/^(\s*)- (.*)$/);
      if (listMatch) {
        return {
          indent: listMatch[1].length,
          value: listMatch[2],
          isListItem: true,
        };
      }
      return { indent: 0, isListItem: false };
    }

    return {
      indent: match[1].length,
      key: match[3],
      value: match[4] || undefined,
      isListItem: !!match[2],
    };
  }

  function parseValue(value: string | undefined): unknown {
    if (
      value === undefined ||
      value === "" ||
      value === "~" ||
      value === "null"
    ) {
      return undefined;
    }
    if (value === "true") return true;
    if (value === "false") return false;
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    if (value === "|" || value === ">") {
      return parseMultilineString(value === "|");
    }
    return value;
  }

  function parseMultilineString(literal: boolean): string {
    lineIndex++;
    const startIndent = lines[lineIndex]?.match(/^(\s*)/)?.[1]?.length ?? 0;
    const parts: string[] = [];

    while (lineIndex < lines.length) {
      const line = lines[lineIndex];
      const lineIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0;

      if (line.trim() === "" || lineIndent >= startIndent) {
        parts.push(line.slice(startIndent));
        lineIndex++;
      } else {
        break;
      }
    }

    lineIndex--;
    return literal ? parts.join("\n") : parts.join(" ").trim();
  }

  function parseObject(minIndent: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    while (lineIndex < lines.length) {
      const line = lines[lineIndex];

      // Skip empty lines and comments
      if (line.trim() === "" || line.trim().startsWith("#")) {
        lineIndex++;
        continue;
      }

      const { indent, key, value, isListItem } = parseLine();

      // Check if we've left this object's scope
      if (indent < minIndent) {
        break;
      }

      if (isListItem && !key) {
        // This is a list, not an object
        break;
      }

      if (!key) {
        lineIndex++;
        continue;
      }

      lineIndex++;

      if (value !== undefined && value !== "") {
        result[key] = parseValue(value);
      } else {
        // Check next line to determine if list or object
        const nextLine = lines[lineIndex];
        if (nextLine && nextLine.trim().startsWith("-")) {
          result[key] = parseList(indent + 2);
        } else {
          result[key] = parseObject(indent + 2);
        }
      }
    }

    return result;
  }

  function parseList(minIndent: number): unknown[] {
    const result: unknown[] = [];

    while (lineIndex < lines.length) {
      const line = lines[lineIndex];

      // Skip empty lines and comments
      if (line.trim() === "" || line.trim().startsWith("#")) {
        lineIndex++;
        continue;
      }

      const { indent, key, value, isListItem } = parseLine();

      // Check if we've left this list's scope
      if (indent < minIndent || !isListItem) {
        if (indent < minIndent) break;
        if (!isListItem) break;
      }

      lineIndex++;

      if (key) {
        // List item is an object
        const obj: Record<string, unknown> = {};
        obj[key] = parseValue(value);

        // Parse rest of object at same level
        while (lineIndex < lines.length) {
          const nextLine = lines[lineIndex];
          if (nextLine.trim() === "" || nextLine.trim().startsWith("#")) {
            lineIndex++;
            continue;
          }

          const nextParsed = parseLine();
          if (nextParsed.indent <= indent || nextParsed.isListItem) {
            break;
          }

          if (nextParsed.key) {
            lineIndex++;
            if (nextParsed.value !== undefined && nextParsed.value !== "") {
              obj[nextParsed.key] = parseValue(nextParsed.value);
            } else {
              const peekLine = lines[lineIndex];
              if (peekLine && peekLine.trim().startsWith("-")) {
                obj[nextParsed.key] = parseList(nextParsed.indent + 2);
              } else {
                obj[nextParsed.key] = parseObject(nextParsed.indent + 2);
              }
            }
          }
        }

        result.push(obj);
      } else {
        // Simple list item
        result.push(parseValue(value));
      }
    }

    return result;
  }

  // Start parsing from root
  return parseObject(0);
}

/**
 * Generate YAML from a TestSuite object
 */
export function generateTestSuiteYaml(suite: TestSuite): string {
  const lines: string[] = [];

  lines.push(`version: "1.0"`);
  lines.push(`name: ${quote(suite.name)}`);

  if (suite.description) {
    lines.push(`description: ${quote(suite.description)}`);
  }

  if (suite.defaults) {
    lines.push(`defaults:`);
    if (suite.defaults.model) lines.push(`  model: ${suite.defaults.model}`);
    if (suite.defaults.temperature !== undefined) {
      lines.push(`  temperature: ${suite.defaults.temperature}`);
    }
    if (suite.defaults.maxTokens !== undefined) {
      lines.push(`  max_tokens: ${suite.defaults.maxTokens}`);
    }
    if (suite.defaults.timeout !== undefined) {
      lines.push(`  timeout: ${suite.defaults.timeout}`);
    }
    if (suite.defaults.runs !== undefined) {
      lines.push(`  runs: ${suite.defaults.runs}`);
    }
  }

  lines.push(`tests:`);
  for (const test of suite.testCases) {
    lines.push(...generateTestCaseYaml(test));
  }

  return lines.join("\n");
}

function generateTestCaseYaml(test: TestCase): string[] {
  const lines: string[] = [];

  lines.push(`  - id: ${test.id}`);
  lines.push(`    name: ${quote(test.name)}`);

  if (test.description) {
    lines.push(`    description: ${quote(test.description)}`);
  }

  if (test.tags && test.tags.length > 0) {
    lines.push(`    tags:`);
    for (const tag of test.tags) {
      lines.push(`      - ${tag}`);
    }
  }

  if (test.enabled === false) {
    lines.push(`    enabled: false`);
  }

  lines.push(`    input:`);
  if (test.input.systemPrompt) {
    lines.push(`      system: ${quote(test.input.systemPrompt)}`);
  }

  lines.push(`      messages:`);
  for (const msg of test.input.messages) {
    lines.push(`        - role: ${msg.role}`);
    lines.push(`          content: ${quote(msg.content)}`);
  }

  if (test.input.model) {
    lines.push(`      model: ${test.input.model}`);
  }

  if (test.input.temperature !== undefined) {
    lines.push(`      temperature: ${test.input.temperature}`);
  }

  if (test.input.maxTokens !== undefined) {
    lines.push(`      max_tokens: ${test.input.maxTokens}`);
  }

  lines.push(`    assertions:`);
  for (const assertion of test.assertions) {
    lines.push(`      - type: ${assertion.type}`);
    if (assertion.target !== "response") {
      lines.push(`        target: ${assertion.target}`);
    }
    lines.push(`        value: ${JSON.stringify(assertion.value)}`);
    if (assertion.message) {
      lines.push(`        message: ${quote(assertion.message)}`);
    }
    if (assertion.severity !== "error") {
      lines.push(`        severity: ${assertion.severity}`);
    }
  }

  if (test.baseline) {
    lines.push(`    baseline:`);
    lines.push(`      response: ${quote(test.baseline.response)}`);
    lines.push(`      metrics:`);
    lines.push(`        latency_ms: ${test.baseline.metrics.latencyMs}`);
    lines.push(`        prompt_tokens: ${test.baseline.metrics.promptTokens}`);
    lines.push(
      `        completion_tokens: ${test.baseline.metrics.completionTokens}`,
    );
    lines.push(`        total_tokens: ${test.baseline.metrics.totalTokens}`);
    lines.push(`        cost: ${test.baseline.metrics.cost}`);

    if (test.baseline.tolerance) {
      lines.push(`      tolerance:`);
      if (test.baseline.tolerance.latencyPercent !== undefined) {
        lines.push(
          `        latency_percent: ${test.baseline.tolerance.latencyPercent}`,
        );
      }
      if (test.baseline.tolerance.tokenPercent !== undefined) {
        lines.push(
          `        token_percent: ${test.baseline.tolerance.tokenPercent}`,
        );
      }
      if (test.baseline.tolerance.costPercent !== undefined) {
        lines.push(
          `        cost_percent: ${test.baseline.tolerance.costPercent}`,
        );
      }
      if (test.baseline.tolerance.semanticSimilarity !== undefined) {
        lines.push(
          `        semantic_similarity: ${test.baseline.tolerance.semanticSimilarity}`,
        );
      }
    }
  }

  return lines;
}

function quote(value: string): string {
  if (value.includes("\n")) {
    return `|\n    ${value.split("\n").join("\n    ")}`;
  }
  if (value.includes(":") || value.includes("#") || value.startsWith(" ")) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * Example test suite YAML content for reference
 */
export const EXAMPLE_TEST_SUITE_YAML = `version: "1.0"
name: "Core Agent Tests"
description: "Regression tests for core agent functionality"

defaults:
  model: gpt-4
  temperature: 0
  max_tokens: 1000
  timeout: 30000

tests:
  - id: greeting_response
    name: "Agent should respond to greetings"
    description: "Verify the agent responds appropriately to user greetings"
    tags:
      - greeting
      - basic
    input:
      system: "You are a helpful assistant."
      messages:
        - role: user
          content: "Hello!"
    assertions:
      - type: contains
        value: "hello"
      - type: latency
        value:
          maxMs: 5000
        severity: warning
      - type: tokens
        value:
          maxTotal: 100
    baseline:
      response: "Hello! How can I help you today?"
      metrics:
        latency_ms: 1500
        prompt_tokens: 15
        completion_tokens: 8
        total_tokens: 23
        cost: 0.0001
      tolerance:
        latency_percent: 50
        semantic_similarity: 0.85

  - id: math_calculation
    name: "Agent should perform basic math"
    tags:
      - math
      - reasoning
    input:
      messages:
        - role: user
          content: "What is 15 + 27?"
    assertions:
      - type: contains
        value: "42"
      - type: not_contains
        value: "I don't know"

  - id: tool_usage
    name: "Agent should use search tool when needed"
    tags:
      - tools
      - search
    input:
      system: "You have access to a search tool for finding information."
      messages:
        - role: user
          content: "What is the current weather in San Francisco?"
      tools:
        - name: search
          description: "Search the web for information"
          parameters:
            query:
              type: string
    assertions:
      - type: tool_called
        value:
          toolName: search
          minCalls: 1
`;
