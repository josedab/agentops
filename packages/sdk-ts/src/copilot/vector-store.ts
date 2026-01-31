/**
 * AgentOps SDK - Vector Store for Semantic Search
 *
 * In-memory vector store for session embeddings and similarity search.
 * Production deployments should use external vector databases (pgvector, Pinecone, etc.)
 */

import { SessionEmbedding, SimilarSession, SessionSummary } from "./types.js";
import { generateEventId } from "../utils.js";

// ============================================================================
// Types
// ============================================================================

export interface VectorStoreConfig {
  /** Maximum embeddings to store in memory */
  maxEmbeddings?: number;
  /** Embedding dimension (default: 1536 for OpenAI) */
  embeddingDimension?: number;
  /** Similarity threshold for results (0-1) */
  similarityThreshold?: number;
}

interface StoredEmbedding extends SessionEmbedding {
  id: string;
  createdAt: number;
}

// ============================================================================
// Vector Store Implementation
// ============================================================================

export class VectorStore {
  private config: Required<VectorStoreConfig>;
  private embeddings: Map<string, StoredEmbedding> = new Map();
  private sessionIndex: Map<string, string> = new Map(); // sessionId -> embeddingId

  constructor(config: VectorStoreConfig = {}) {
    this.config = {
      maxEmbeddings: config.maxEmbeddings ?? 10000,
      embeddingDimension: config.embeddingDimension ?? 1536,
      similarityThreshold: config.similarityThreshold ?? 0.7,
    };
  }

  /**
   * Add or update a session embedding
   */
  addEmbedding(embedding: SessionEmbedding): string {
    // Check if session already has an embedding
    const existingId = this.sessionIndex.get(embedding.sessionId);
    if (existingId) {
      // Update existing
      const stored: StoredEmbedding = {
        ...embedding,
        id: existingId,
        createdAt: this.embeddings.get(existingId)?.createdAt ?? Date.now(),
      };
      this.embeddings.set(existingId, stored);
      return existingId;
    }

    // Enforce max size - remove oldest if needed
    if (this.embeddings.size >= this.config.maxEmbeddings) {
      this.removeOldest();
    }

    // Add new embedding
    const id = generateEventId();
    const stored: StoredEmbedding = {
      ...embedding,
      id,
      createdAt: Date.now(),
    };

    this.embeddings.set(id, stored);
    this.sessionIndex.set(embedding.sessionId, id);

    return id;
  }

  /**
   * Find similar sessions by embedding vector
   */
  findSimilar(
    queryEmbedding: number[],
    limit: number = 10,
    excludeSessionIds: string[] = [],
  ): SimilarSession[] {
    const excludeSet = new Set(excludeSessionIds);
    const results: Array<{ stored: StoredEmbedding; similarity: number }> = [];

    for (const stored of this.embeddings.values()) {
      if (excludeSet.has(stored.sessionId)) continue;

      const similarity = this.cosineSimilarity(
        queryEmbedding,
        stored.embedding,
      );

      if (similarity >= this.config.similarityThreshold) {
        results.push({ stored, similarity });
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    // Return top results
    return results.slice(0, limit).map(({ stored, similarity }) => ({
      sessionId: stored.sessionId,
      similarity,
      summary: this.createSummaryFromMetadata(stored),
    }));
  }

  /**
   * Find sessions similar to a given session
   */
  findSimilarToSession(
    sessionId: string,
    limit: number = 10,
  ): SimilarSession[] {
    const embeddingId = this.sessionIndex.get(sessionId);
    if (!embeddingId) return [];

    const stored = this.embeddings.get(embeddingId);
    if (!stored) return [];

    return this.findSimilar(stored.embedding, limit, [sessionId]);
  }

  /**
   * Get embedding for a session
   */
  getEmbedding(sessionId: string): SessionEmbedding | null {
    const embeddingId = this.sessionIndex.get(sessionId);
    if (!embeddingId) return null;

    const stored = this.embeddings.get(embeddingId);
    if (!stored) return null;

    return {
      sessionId: stored.sessionId,
      embedding: stored.embedding,
      summary: stored.summary,
      metadata: stored.metadata,
    };
  }

  /**
   * Remove embedding for a session
   */
  removeEmbedding(sessionId: string): boolean {
    const embeddingId = this.sessionIndex.get(sessionId);
    if (!embeddingId) return false;

    this.embeddings.delete(embeddingId);
    this.sessionIndex.delete(sessionId);
    return true;
  }

  /**
   * Get all session IDs in the store
   */
  getSessionIds(): string[] {
    return Array.from(this.sessionIndex.keys());
  }

  /**
   * Get store statistics
   */
  getStats(): { count: number; maxSize: number; utilizationPercent: number } {
    return {
      count: this.embeddings.size,
      maxSize: this.config.maxEmbeddings,
      utilizationPercent:
        (this.embeddings.size / this.config.maxEmbeddings) * 100,
    };
  }

  /**
   * Clear all embeddings
   */
  clear(): void {
    this.embeddings.clear();
    this.sessionIndex.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  private removeOldest(): void {
    let oldest: StoredEmbedding | null = null;

    for (const stored of this.embeddings.values()) {
      if (!oldest || stored.createdAt < oldest.createdAt) {
        oldest = stored;
      }
    }

    if (oldest) {
      this.embeddings.delete(oldest.id);
      this.sessionIndex.delete(oldest.sessionId);
    }
  }

  private createSummaryFromMetadata(stored: StoredEmbedding): SessionSummary {
    return {
      sessionId: stored.sessionId,
      model: stored.metadata.model,
      status: stored.metadata.status,
      startTime: stored.metadata.timestamp,
      durationMs: 0, // Not stored in embedding metadata
      totalCost: stored.metadata.cost,
      totalTokens: stored.metadata.tokens,
      eventCount: 0,
      errorCount: stored.metadata.status === "error" ? 1 : 0,
      relevanceScore: 1.0,
    };
  }
}

// ============================================================================
// Embedding Generator (Mock - Production should use actual embedding API)
// ============================================================================

export interface EmbeddingGenerator {
  generate(text: string): Promise<number[]>;
  generateBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Simple text-to-embedding generator for development/testing.
 * Production should use OpenAI embeddings or similar.
 */
export class SimpleEmbeddingGenerator implements EmbeddingGenerator {
  private dimension: number;

  constructor(dimension: number = 1536) {
    this.dimension = dimension;
  }

  async generate(text: string): Promise<number[]> {
    // Simple hash-based embedding for development
    // Production: Call OpenAI/Anthropic embedding API
    return this.hashToVector(text);
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.generate(t)));
  }

  private hashToVector(text: string): number[] {
    const vector: number[] = new Array(this.dimension).fill(0);
    const normalized = text.toLowerCase();

    // Simple character-based hashing
    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      const index = (charCode * (i + 1)) % this.dimension;
      vector[index] += 1;
    }

    // Normalize to unit vector
    let magnitude = 0;
    for (const val of vector) {
      magnitude += val * val;
    }
    magnitude = Math.sqrt(magnitude);

    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }
}

/**
 * OpenAI-compatible embedding generator
 */
export class OpenAIEmbeddingGenerator implements EmbeddingGenerator {
  private apiKey: string;
  private model: string;
  private endpoint: string;

  constructor(config: { apiKey: string; model?: string; endpoint?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? "text-embedding-3-small";
    this.endpoint = config.endpoint ?? "https://api.openai.com/v1/embeddings";
  }

  async generate(text: string): Promise<number[]> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data[0].embedding;
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data.map((d) => d.embedding);
  }
}
