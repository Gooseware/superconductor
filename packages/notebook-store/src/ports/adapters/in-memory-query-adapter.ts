import type { NotebookEntry, NotebookQuery, NotebookSummary, NoteType } from '../../types.js';
import type {
  NotebookQueryPort,
  NotebookQueryOptions,
  NotebookQueryResult,
} from '../notebook-query-port.js';
import { BaseNotebookQueryPort, fuseAndPruneResults } from '../notebook-query-port.js';

/**
 * In-memory implementation of NotebookQueryPort.
 * Stores NotebookEntry objects entirely in memory with zero native binary dependencies.
 * Encapsulates text matching, keyword scoring, reciprocal rank fusion (RRF),
 * and token budget pruning in-memory for lightning-fast test execution and isolation.
 */
export class InMemoryNotebookQueryAdapter extends BaseNotebookQueryPort implements NotebookQueryPort {
  private entries: Map<string, NotebookEntry> = new Map();
  private healthy = true;

  constructor(initialEntries: NotebookEntry[] = []) {
    super();
    this.addEntries(initialEntries);
  }

  /**
   * Adds or updates a notebook entry in the in-memory store.
   */
  public addEntry(entry: NotebookEntry): void {
    this.entries.set(entry.id, entry);
  }

  /**
   * Adds multiple notebook entries to the in-memory store.
   */
  public addEntries(entries: NotebookEntry[]): void {
    for (const entry of entries) {
      this.entries.set(entry.id, entry);
    }
  }

  /**
   * Returns all stored notebook entries.
   */
  public getEntries(): NotebookEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Clears all entries from the in-memory store.
   */
  public clear(): void {
    this.entries.clear();
  }

  /**
   * Sets the health status returned by healthCheck().
   */
  public setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }

  /**
   * Queries notebook entries matching the query string or parameter object.
   * Performs text matching (simulating semantic/vector search),
   * keyword scoring (simulating BM25 term frequency),
   * and fuses results via RRF while enforcing token budgets and filters.
   */
  public async query(
    queryOrParams: string | (NotebookQuery & { query?: string }),
    options?: NotebookQueryOptions
  ): Promise<NotebookQueryResult> {
    const startTime = Date.now();
    let queryText = '';
    let mergedOptions: NotebookQueryOptions = { ...options };

    if (typeof queryOrParams === 'string') {
      queryText = queryOrParams;
    } else if (typeof queryOrParams === 'object' && queryOrParams !== null) {
      queryText = queryOrParams.query || '';
      mergedOptions = {
        limit: queryOrParams.limit ?? options?.limit,
        domain: queryOrParams.domain ?? options?.domain,
        severity: queryOrParams.severity ?? options?.severity,
        files: queryOrParams.files ?? options?.files,
        note_types: queryOrParams.note_types ?? options?.note_types,
        max_age_days: queryOrParams.max_age_days ?? options?.max_age_days,
        ...options,
      };
    }

    const all = Array.from(this.entries.values());
    let vectorResults: NotebookEntry[] = [];
    let bm25Results: NotebookEntry[] = [];

    const trimmed = queryText.trim().toLowerCase();

    if (trimmed !== '') {
      const terms = trimmed.split(/\s+/).filter(Boolean);

      // 1. Text matching (simulates semantic / phrase relevance)
      const scoredText = all
        .map((entry) => {
          const contentLower = (entry.content || '').toLowerCase();
          let score = 0;
          if (contentLower === trimmed) {
            score = 100;
          } else if (contentLower.includes(trimmed)) {
            score = 80;
          } else {
            const matchedTerms = terms.filter((t) => contentLower.includes(t));
            if (matchedTerms.length > 0) {
              score = (matchedTerms.length / terms.length) * 50;
            }
          }
          return { entry, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      vectorResults = scoredText.map((item) => item.entry);

      // 2. Keyword scoring (simulates BM25 term frequency across content, domain, files, role)
      const scoredKeywords = all
        .map((entry) => {
          let score = 0;
          const contentLower = (entry.content || '').toLowerCase();
          const domainLower = (entry.domain || '').toLowerCase();
          const roleLower = (entry.agent_role || '').toLowerCase();
          const files = Array.isArray(entry.files) ? entry.files : [];
          const filesLower = files.map((f) => (f || '').toLowerCase());

          for (const term of terms) {
            if (contentLower.includes(term)) score += 2;
            if (domainLower.includes(term)) score += 3;
            if (filesLower.some((f) => f.includes(term))) score += 4;
            if (roleLower.includes(term)) score += 1;
          }
          return { entry, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      bm25Results = scoredKeywords.map((item) => item.entry);
    } else {
      // Empty query: default to ordering by timestamp descending
      vectorResults = [...all].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    // Encapsulate RRF merge, token budget pruning, and filtering
    const rankedEntries = this.fuseAndPrune(vectorResults, bm25Results, mergedOptions);

    return {
      entries: rankedEntries,
      total: rankedEntries.length,
      queryTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Retrieves a single notebook entry by its unique ID.
   */
  public async getById(id: string): Promise<NotebookEntry | null> {
    return this.entries.get(id) ?? null;
  }

  /**
   * Returns store health.
   */
  public async healthCheck(): Promise<boolean> {
    return this.healthy;
  }

  /**
   * Summarizes entries grouped by note type.
   */
  public async summary(track_id?: string): Promise<NotebookSummary> {
    let entries = Array.from(this.entries.values());
    if (track_id) {
      entries = entries.filter((e) => e.track_id === track_id);
    }
    const by_type: Partial<Record<NoteType, NotebookEntry[]>> = {};
    for (const entry of entries) {
      if (!by_type[entry.note_type]) {
        by_type[entry.note_type] = [];
      }
      by_type[entry.note_type]!.push(entry);
    }
    return {
      by_type,
      total: entries.length,
    };
  }
}
