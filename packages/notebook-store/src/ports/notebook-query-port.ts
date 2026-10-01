import type { NotebookEntry, NoteSeverity, NoteType } from '../types.js';
import { rrfMerge, applyTokenBudget } from '../search/rrf-search.js';

/**
 * Options for querying notebook entries through NotebookQueryPort.
 */
export interface NotebookQueryOptions {
  limit?: number;
  domain?: string;
  severity?: NoteSeverity;
  maxChars?: number;
  vectorWeight?: number;
  bm25Weight?: number;
  files?: string[];
  note_types?: NoteType[];
  max_age_days?: number;
}

/**
 * Result returned by NotebookQueryPort.query().
 */
export interface NotebookQueryResult {
  entries: NotebookEntry[];
  total: number;
  queryTimeMs: number;
}

/**
 * Port interface for querying notebook entries.
 * Encapsulates vector & BM25 search, reciprocal rank fusion (RRF),
 * and token budget pruning so that consumers do not orchestrate them manually.
 */
export interface NotebookQueryPort {
  /**
   * Queries notebook entries matching the search query and options.
   * RRF ranking and token budget limiting are encapsulated behind this method.
   */
  query(query: string, options?: NotebookQueryOptions): Promise<NotebookQueryResult>;

  /**
   * Retrieves a single notebook entry by its unique ID.
   */
  getById(id: string): Promise<NotebookEntry | null>;

  /**
   * Checks the health and operational status of the underlying notebook store.
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Fuses vector and BM25 search results via Reciprocal Rank Fusion (RRF)
 * and enforces token budget constraints.
 * Encapsulated for use by NotebookQueryPort adapter implementations.
 */
export function fuseAndPruneResults(
  vectorResults: NotebookEntry[],
  bm25Results: NotebookEntry[],
  options?: NotebookQueryOptions,
  k = 60
): NotebookEntry[] {
  const vectorWeight = options?.vectorWeight ?? 1;
  const bm25Weight = options?.bm25Weight ?? 1;

  let merged: NotebookEntry[];
  if (vectorResults.length > 0 && bm25Results.length > 0) {
    merged = rrfMerge(vectorResults, bm25Results, k, vectorWeight, bm25Weight);
  } else if (vectorResults.length > 0) {
    merged = [...vectorResults];
  } else {
    merged = [...bm25Results];
  }

  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  // Filter TTL for failure notes (> 90 days old) and max_age_days
  merged = merged.filter((e) => {
    if (e.note_type === 'failure' && now - (e.timestamp || 0) > ninetyDaysMs) {
      return false;
    }
    if (options?.max_age_days !== undefined) {
      const maxAgeMs = options.max_age_days * 24 * 60 * 60 * 1000;
      if (now - (e.timestamp || 0) > maxAgeMs) {
        return false;
      }
    }
    return true;
  });

  if (options?.domain) {
    const domainTarget = options.domain.toLowerCase();
    merged = merged.filter((e) => (e.domain || '').toLowerCase() === domainTarget);
  }

  if (options?.severity) {
    const severityTarget = options.severity.toLowerCase();
    merged = merged.filter((e) => (e.severity || '').toLowerCase() === severityTarget);
  }

  if (options?.note_types && options.note_types.length > 0) {
    merged = merged.filter((e) => Boolean(e.note_type) && options.note_types!.includes(e.note_type));
  }

  if (options?.files && options.files.length > 0) {
    merged = merged.filter(
      (e) => Array.isArray(e.files) && options.files!.some((f) => e.files.includes(f))
    );
  }

  const maxChars = options?.maxChars !== undefined ? options.maxChars : 3200;
  if (maxChars > 0 && maxChars !== Infinity) {
    merged = applyTokenBudget(merged, maxChars);
  }

  if (options?.limit !== undefined) {
    const limit = Math.max(0, options.limit);
    merged = merged.slice(0, limit);
  }

  return merged;
}

/**
 * Base abstract class providing common ranking and token budget orchestration
 * for NotebookQueryPort implementations.
 */
export abstract class BaseNotebookQueryPort implements NotebookQueryPort {
  abstract query(query: string, options?: NotebookQueryOptions): Promise<NotebookQueryResult>;
  abstract getById(id: string): Promise<NotebookEntry | null>;
  abstract healthCheck(): Promise<boolean>;

  /**
   * Helper method for subclasses to fuse vector and BM25 search results and apply token pruning.
   */
  protected fuseAndPrune(
    vectorResults: NotebookEntry[],
    bm25Results: NotebookEntry[],
    options?: NotebookQueryOptions
  ): NotebookEntry[] {
    return fuseAndPruneResults(vectorResults, bm25Results, options);
  }
}
