/**
 * InvariantDeduplicator
 *
 * Token and semantic fingerprinting module preventing duplicate invariants
 * from accumulating in task-store and learning memory.
 *
 * Invariant: Deduplicator MUST prevent identical or redundant invariants from polluting task-store.
 */

import * as crypto from 'node:crypto';

export interface DeduplicationResult {
  isDuplicate: boolean;
  similarity: number;
  matchedInvariant?: string;
}

export interface SimilarityOptions {
  algorithm?: 'jaccard' | 'token';
}

const STOP_WORDS = new Set([
  'all',
  'a',
  'an',
  'the',
  'be',
  'to',
  'of',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'is',
  'are',
  'was',
  'were',
]);

export class InvariantDeduplicator {
  /**
   * Normalizes an invariant string by lowercasing, stripping punctuation,
   * and collapsing whitespace.
   */
  public static normalize(text: string): string {
    if (!text || typeof text !== 'string') return '';
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generates a 64-character SHA-256 hex hash of the normalized invariant string.
   */
  public static computeFingerprint(text: string): string {
    const normalized = this.normalize(text);
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Tokenizes string into words, optionally filtering out common stop words.
   */
  public static tokenize(text: string, filterStopWords = true): string[] {
    const normalized = this.normalize(text);
    if (!normalized) return [];
    const tokens = normalized.split(' ').filter(Boolean);
    if (filterStopWords) {
      const filtered = tokens.filter((t) => !STOP_WORDS.has(t));
      return filtered.length > 0 ? filtered : tokens;
    }
    return tokens;
  }

  /**
   * Computes similarity score between two invariant strings (0.0 to 1.0).
   */
  public static computeSimilarity(
    text1: string,
    text2: string,
    options?: SimilarityOptions
  ): number {
    const norm1 = this.normalize(text1);
    const norm2 = this.normalize(text2);

    if (!norm1 && !norm2) return 1.0;
    if (!norm1 || !norm2) return 0.0;
    if (norm1 === norm2) return 1.0;

    const tokens1 = this.tokenize(text1);
    const tokens2 = this.tokenize(text2);

    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);

    let intersection = 0;
    for (const token of set1) {
      if (set2.has(token)) {
        intersection++;
      }
    }

    const union = new Set([...tokens1, ...tokens2]).size;
    if (union === 0) return 0.0;

    // Compute Dice coefficient: 2 * |A ∩ B| / (|A| + |B|)
    const dice = (2 * intersection) / (set1.size + set2.size);
    const jaccard = intersection / union;

    if (options?.algorithm === 'jaccard') {
      return Math.max(jaccard, dice);
    }

    return dice;
  }

  /**
   * Evaluates whether a new candidate invariant is a duplicate of any existing invariants.
   */
  public static isDuplicate(
    newInvariant: string,
    existing: string[],
    threshold = 0.8
  ): DeduplicationResult {
    if (!newInvariant || !newInvariant.trim() || !existing || existing.length === 0) {
      return { isDuplicate: false, similarity: 0 };
    }

    const newFp = this.computeFingerprint(newInvariant);
    let bestMatch: string | undefined;
    let bestSim = 0;

    for (const item of existing) {
      if (!item || !item.trim()) continue;

      // 1. Direct trimmed case-insensitive match
      if (newInvariant.trim().toLowerCase() === item.trim().toLowerCase()) {
        return { isDuplicate: true, similarity: 1.0, matchedInvariant: item };
      }

      // 2. Exact normalized fingerprint match
      const itemFp = this.computeFingerprint(item);
      if (newFp === itemFp) {
        return { isDuplicate: true, similarity: 1.0, matchedInvariant: item };
      }

      // 3. Compute semantic token similarity
      const sim = this.computeSimilarity(newInvariant, item);
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = item;
      }
    }

    if (bestSim >= threshold && bestMatch) {
      return {
        isDuplicate: true,
        similarity: bestSim,
        matchedInvariant: bestMatch,
      };
    }

    return {
      isDuplicate: false,
      similarity: bestSim,
    };
  }

  /**
   * Filters a list of invariants, pruning redundant or duplicate entries.
   */
  public static deduplicateList(input: string[], threshold = 0.8): string[] {
    if (!input || !Array.isArray(input)) return [];
    const result: string[] = [];

    for (const item of input) {
      if (!item || !item.trim()) continue;
      const dup = this.isDuplicate(item, result, threshold);
      if (!dup.isDuplicate) {
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Factory method to create a FingerprintIndex instance.
   */
  public static createIndex(seed?: string[]): FingerprintIndex {
    return new FingerprintIndex(seed);
  }
}

export class FingerprintIndex {
  private map = new Map<string, string>();

  constructor(seed?: string[]) {
    if (seed && Array.isArray(seed)) {
      for (const item of seed) {
        this.add(item);
      }
    }
  }

  get size(): number {
    return this.map.size;
  }

  add(invariant: string): boolean {
    if (!invariant || !invariant.trim()) return false;
    const fp = InvariantDeduplicator.computeFingerprint(invariant);
    if (this.map.has(fp)) {
      return false;
    }
    this.map.set(fp, invariant);
    return true;
  }

  hasFingerprint(fp: string): boolean {
    return this.map.has(fp);
  }

  getByFingerprint(fp: string): string | undefined {
    return this.map.get(fp);
  }

  isDuplicate(invariant: string, threshold = 0.8): DeduplicationResult {
    const existing = Array.from(this.map.values());
    return InvariantDeduplicator.isDuplicate(invariant, existing, threshold);
  }

  getAll(): string[] {
    return Array.from(this.map.values());
  }

  clear(): void {
    this.map.clear();
  }
}
