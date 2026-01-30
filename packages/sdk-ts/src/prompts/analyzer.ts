/**
 * AgentOps SDK - Token Analyzer
 *
 * Analyzes prompt tokens and suggests optimizations.
 */

import type { TokenAnalysis, OptimizationSuggestion } from "./types.js";

// Rough token estimation (actual tokenization varies by model)
const AVG_CHARS_PER_TOKEN = 4;

export class TokenAnalyzer {
  private readonly _model: string;

  constructor(model: string = "gpt-4") {
    this._model = model;
  }

  /**
   * Get the model being used for token analysis
   */
  get model(): string {
    return this._model;
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number {
    // Simple estimation - production should use actual tokenizer
    return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
  }

  /**
   * Analyze a prompt for token usage and optimization opportunities
   */
  analyze(prompt: string): TokenAnalysis {
    const totalTokens = this.estimateTokens(prompt);
    const sectionBreakdown = this.analyzeSections(prompt);
    const redundancies = this.findRedundancies(prompt);
    const suggestions = this.generateSuggestions(prompt, redundancies);

    return {
      totalTokens,
      sectionBreakdown,
      redundancies,
      suggestions,
    };
  }

  /**
   * Generate optimization suggestions
   */
  suggestOptimizations(prompt: string): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Check for verbose phrases
    const verbosePhrases = [
      { pattern: /in order to/gi, replacement: "to", savings: 2 },
      { pattern: /due to the fact that/gi, replacement: "because", savings: 4 },
      { pattern: /at this point in time/gi, replacement: "now", savings: 4 },
      { pattern: /in the event that/gi, replacement: "if", savings: 3 },
      { pattern: /with regard to/gi, replacement: "about", savings: 2 },
      { pattern: /for the purpose of/gi, replacement: "to", savings: 3 },
      {
        pattern: /in spite of the fact that/gi,
        replacement: "although",
        savings: 5,
      },
      {
        pattern: /it is important to note that/gi,
        replacement: "",
        savings: 6,
      },
      { pattern: /please note that/gi, replacement: "", savings: 3 },
      { pattern: /as a matter of fact/gi, replacement: "", savings: 5 },
    ];

    for (const { pattern, replacement, savings } of verbosePhrases) {
      const matches = prompt.match(pattern);
      if (matches) {
        for (const match of matches) {
          suggestions.push({
            type: "token_reduction",
            description: `Replace "${match}" with "${replacement || "[remove]"}"`,
            originalText: match,
            suggestedText: replacement,
            tokenSavings: savings,
            confidence: 0.9,
          });
        }
      }
    }

    // Check for repeated instructions
    const lines = prompt.split("\n");
    const seenInstructions = new Map<string, number>();

    for (const line of lines) {
      const normalized = line.toLowerCase().trim();
      if (normalized.length > 20) {
        const count = seenInstructions.get(normalized) || 0;
        seenInstructions.set(normalized, count + 1);
      }
    }

    for (const [instruction, count] of seenInstructions) {
      if (count > 1) {
        suggestions.push({
          type: "token_reduction",
          description: `Remove duplicate instruction (appears ${count} times)`,
          originalText: instruction,
          suggestedText: "",
          tokenSavings: this.estimateTokens(instruction) * (count - 1),
          confidence: 0.85,
        });
      }
    }

    // Check for overly detailed examples
    const examplePattern = /example[s]?:?\s*\n((?:[-*]\s*.+\n?)+)/gi;
    let match;
    while ((match = examplePattern.exec(prompt)) !== null) {
      const exampleBlock = match[1];
      const exampleLines = exampleBlock.split("\n").filter((l) => l.trim());

      if (exampleLines.length > 3) {
        suggestions.push({
          type: "token_reduction",
          description: `Consider reducing examples from ${exampleLines.length} to 2-3`,
          originalText: exampleBlock.substring(0, 100) + "...",
          suggestedText: "[Reduce to 2-3 key examples]",
          tokenSavings: this.estimateTokens(exampleBlock) * 0.5,
          confidence: 0.7,
        });
      }
    }

    // Check for unnecessary formatting
    const heavyFormatting = prompt.match(/[=\-#*_]{3,}/g);
    if (heavyFormatting && heavyFormatting.length > 5) {
      suggestions.push({
        type: "structure",
        description: "Consider reducing decorative formatting",
        originalText: "[Multiple formatting lines]",
        suggestedText: "[Use minimal markdown]",
        tokenSavings: heavyFormatting.reduce(
          (sum, f) => sum + f.length / AVG_CHARS_PER_TOKEN,
          0,
        ),
        confidence: 0.6,
      });
    }

    return suggestions;
  }

  /**
   * Compress a prompt while preserving meaning
   */
  compress(prompt: string): { compressed: string; tokensSaved: number } {
    let compressed = prompt;
    let tokensSaved = 0;

    const suggestions = this.suggestOptimizations(prompt);

    for (const suggestion of suggestions) {
      if (suggestion.confidence >= 0.8 && suggestion.originalText) {
        const before = this.estimateTokens(compressed);
        compressed = compressed.replace(
          suggestion.originalText,
          suggestion.suggestedText,
        );
        const after = this.estimateTokens(compressed);
        tokensSaved += before - after;
      }
    }

    // Remove extra whitespace
    const beforeWhitespace = this.estimateTokens(compressed);
    compressed = compressed.replace(/\n{3,}/g, "\n\n");
    compressed = compressed.replace(/[ \t]{2,}/g, " ");
    const afterWhitespace = this.estimateTokens(compressed);
    tokensSaved += beforeWhitespace - afterWhitespace;

    return { compressed, tokensSaved };
  }

  private analyzeSections(prompt: string): TokenAnalysis["sectionBreakdown"] {
    const sections: TokenAnalysis["sectionBreakdown"] = [];

    // Split by common section markers
    const sectionPatterns = [
      /^#+\s+(.+)$/gm, // Markdown headers
      /^([A-Z][^:]+):$/gm, // Label: format
      /^(Instructions|Context|Examples|Output|Rules|Guidelines)[:.]?/gim,
    ];

    let lastIndex = 0;
    let lastName = "Introduction";
    const markers: Array<{ index: number; name: string }> = [];

    for (const pattern of sectionPatterns) {
      let match;
      while ((match = pattern.exec(prompt)) !== null) {
        markers.push({ index: match.index, name: match[1] });
      }
    }

    markers.sort((a, b) => a.index - b.index);

    for (const marker of markers) {
      if (marker.index > lastIndex) {
        const content = prompt.substring(lastIndex, marker.index);
        sections.push({
          name: lastName,
          startIndex: lastIndex,
          endIndex: marker.index,
          estimatedTokens: this.estimateTokens(content),
          content: content.substring(0, 200),
        });
      }
      lastIndex = marker.index;
      lastName = marker.name;
    }

    // Add final section
    if (lastIndex < prompt.length) {
      const content = prompt.substring(lastIndex);
      sections.push({
        name: lastName,
        startIndex: lastIndex,
        endIndex: prompt.length,
        estimatedTokens: this.estimateTokens(content),
        content: content.substring(0, 200),
      });
    }

    return sections;
  }

  private findRedundancies(prompt: string): TokenAnalysis["redundancies"] {
    const redundancies: TokenAnalysis["redundancies"] = [];
    const words = prompt.toLowerCase().split(/\s+/);
    const phrases = new Map<string, number>();

    // Find repeated 3-5 word phrases
    for (let len = 3; len <= 5; len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const phrase = words.slice(i, i + len).join(" ");
        if (phrase.length > 10) {
          phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
        }
      }
    }

    for (const [phrase, count] of phrases) {
      if (count >= 2) {
        redundancies.push({
          text: phrase,
          occurrences: count,
          potentialSavings: this.estimateTokens(phrase) * (count - 1),
        });
      }
    }

    // Sort by potential savings
    redundancies.sort((a, b) => b.potentialSavings - a.potentialSavings);

    return redundancies.slice(0, 10);
  }

  private generateSuggestions(
    prompt: string,
    redundancies: TokenAnalysis["redundancies"],
  ): TokenAnalysis["suggestions"] {
    const suggestions: TokenAnalysis["suggestions"] = [];

    // Suggest removing redundancies
    for (const redundancy of redundancies.slice(0, 3)) {
      suggestions.push({
        type: "remove_redundancy",
        description: `Remove repeated phrase: "${redundancy.text}"`,
        estimatedSavings: redundancy.potentialSavings,
        confidence: 0.8,
      });
    }

    // Check prompt length
    const totalTokens = this.estimateTokens(prompt);
    if (totalTokens > 2000) {
      suggestions.push({
        type: "restructure",
        description: "Consider breaking into smaller, focused prompts",
        estimatedSavings: totalTokens * 0.2,
        confidence: 0.6,
      });
    }

    // Check for verbose sections
    const lines = prompt.split("\n");
    const longLines = lines.filter((l) => l.length > 200);
    if (longLines.length > 3) {
      suggestions.push({
        type: "simplify",
        description: `${longLines.length} very long lines could be simplified`,
        estimatedSavings: longLines.reduce(
          (sum, l) => sum + (l.length * 0.3) / AVG_CHARS_PER_TOKEN,
          0,
        ),
        confidence: 0.5,
      });
    }

    return suggestions;
  }
}
