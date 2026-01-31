/**
 * Content Extractors
 *
 * Strategy pattern implementation for extracting content from various LLM response formats.
 */

/**
 * Interface for content extraction strategies
 */
export interface ContentExtractor {
  /** Name of the extractor for identification */
  readonly name: string;

  /**
   * Check if this extractor can handle the response
   * @param response - The response object to check
   * @returns true if this extractor can handle the response
   */
  canHandle(response: unknown): boolean;

  /**
   * Extract content from the response
   * @param response - The response object
   * @returns The extracted content string
   */
  extract(response: unknown): string;
}

/**
 * OpenAI Chat Completions API response extractor
 * Handles: { choices: [{ message: { content: "..." } }] }
 */
export class OpenAIExtractor implements ContentExtractor {
  readonly name = "openai";

  canHandle(response: unknown): boolean {
    if (!response || typeof response !== "object") return false;
    const resp = response as Record<string, unknown>;
    return (
      Array.isArray(resp.choices) &&
      resp.choices.length > 0 &&
      typeof (resp.choices[0] as Record<string, unknown>)?.message === "object"
    );
  }

  extract(response: unknown): string {
    const resp = response as Record<string, unknown>;
    const choices = resp.choices as Array<Record<string, unknown>>;
    const message = choices[0]?.message as Record<string, unknown> | undefined;

    if (message && typeof message.content === "string") {
      return message.content;
    }

    // Handle function calls
    if (message?.function_call && typeof message.function_call === "object") {
      const fc = message.function_call as Record<string, unknown>;
      return `[Function call: ${fc.name}(${fc.arguments})]`;
    }

    // Handle tool calls
    if (Array.isArray(message?.tool_calls)) {
      const calls = message.tool_calls as Array<Record<string, unknown>>;
      return calls
        .map((tc) => {
          const fn = tc.function as Record<string, unknown> | undefined;
          return fn ? `[Tool call: ${fn.name}(${fn.arguments})]` : "";
        })
        .join("\n");
    }

    return "";
  }
}

/**
 * Anthropic Claude API response extractor
 * Handles: { content: [{ type: "text", text: "..." }] }
 */
export class AnthropicExtractor implements ContentExtractor {
  readonly name = "anthropic";

  canHandle(response: unknown): boolean {
    if (!response || typeof response !== "object") return false;
    const resp = response as Record<string, unknown>;
    return (
      Array.isArray(resp.content) &&
      resp.content.length > 0 &&
      typeof (resp.content[0] as Record<string, unknown>)?.type === "string"
    );
  }

  extract(response: unknown): string {
    const resp = response as Record<string, unknown>;
    const content = resp.content as Array<Record<string, unknown>>;

    return content
      .map((block) => {
        if (block.type === "text" && typeof block.text === "string") {
          return block.text;
        }
        if (block.type === "tool_use") {
          return `[Tool use: ${block.name}(${JSON.stringify(block.input)})]`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
}

/**
 * Simple string content extractor
 * Handles: { content: "..." } or { text: "..." } or { message: "..." }
 */
export class SimpleTextExtractor implements ContentExtractor {
  readonly name = "simple";

  canHandle(response: unknown): boolean {
    if (!response || typeof response !== "object") return false;
    const resp = response as Record<string, unknown>;
    return (
      typeof resp.content === "string" ||
      typeof resp.text === "string" ||
      typeof resp.message === "string"
    );
  }

  extract(response: unknown): string {
    const resp = response as Record<string, unknown>;

    if (typeof resp.content === "string") return resp.content;
    if (typeof resp.text === "string") return resp.text;
    if (typeof resp.message === "string") return resp.message;

    return "";
  }
}

/**
 * Cohere API response extractor
 * Handles: { text: "..." } (for /generate) or { generations: [{ text: "..." }] }
 */
export class CohereExtractor implements ContentExtractor {
  readonly name = "cohere";

  canHandle(response: unknown): boolean {
    if (!response || typeof response !== "object") return false;
    const resp = response as Record<string, unknown>;
    return (
      Array.isArray(resp.generations) ||
      (typeof resp.text === "string" && resp.meta !== undefined)
    );
  }

  extract(response: unknown): string {
    const resp = response as Record<string, unknown>;

    if (Array.isArray(resp.generations)) {
      const gens = resp.generations as Array<Record<string, unknown>>;
      return gens
        .map((g) => (typeof g.text === "string" ? g.text : ""))
        .filter(Boolean)
        .join("\n");
    }

    if (typeof resp.text === "string") {
      return resp.text;
    }

    return "";
  }
}

/**
 * Fallback extractor that converts response to string
 */
export class FallbackExtractor implements ContentExtractor {
  readonly name = "fallback";

  canHandle(_response: unknown): boolean {
    return true; // Always can handle as fallback
  }

  extract(response: unknown): string {
    if (response === null || response === undefined) {
      return "";
    }

    if (typeof response === "string") {
      return response;
    }

    try {
      return JSON.stringify(response);
    } catch {
      return String(response);
    }
  }
}

/**
 * Content extractor chain that tries extractors in order
 */
export class ContentExtractorChain {
  private readonly extractors: ContentExtractor[];
  private readonly fallback: ContentExtractor;

  constructor(extractors?: ContentExtractor[]) {
    this.extractors = extractors ?? [
      new OpenAIExtractor(),
      new AnthropicExtractor(),
      new CohereExtractor(),
      new SimpleTextExtractor(),
    ];
    this.fallback = new FallbackExtractor();
  }

  /**
   * Extract content from a response using the appropriate extractor
   * @param response - The response object
   * @returns The extracted content string
   */
  extract(response: unknown): string {
    for (const extractor of this.extractors) {
      if (extractor.canHandle(response)) {
        const content = extractor.extract(response);
        if (content) {
          return content;
        }
      }
    }

    return this.fallback.extract(response);
  }

  /**
   * Add a custom extractor to the beginning of the chain
   * @param extractor - The extractor to add
   */
  addExtractor(extractor: ContentExtractor): void {
    this.extractors.unshift(extractor);
  }

  /**
   * Get the list of extractor names
   */
  getExtractorNames(): string[] {
    return this.extractors.map((e) => e.name);
  }
}

/**
 * Default content extractor chain instance
 */
export const defaultContentExtractor = new ContentExtractorChain();

/**
 * Convenience function to extract content using the default chain
 */
export function extractContent(response: unknown): string {
  return defaultContentExtractor.extract(response);
}
