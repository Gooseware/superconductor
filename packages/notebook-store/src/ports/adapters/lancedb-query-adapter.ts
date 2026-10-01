import type { NotebookEntry, NotebookQuery, NotebookSummary } from '../../types.js';
import type { LanceDBProviderOptions } from '../../providers/lancedb-notebook-provider.js';
import { LanceDBNotebookProvider } from '../../providers/lancedb-notebook-provider.js';
import type {
  NotebookQueryPort,
  NotebookQueryOptions,
  NotebookQueryResult,
} from '../notebook-query-port.js';
import { BaseNotebookQueryPort } from '../notebook-query-port.js';

export interface ILanceDbProvider {
  vectorSearch(query: string, limit?: number): Promise<NotebookEntry[]>;
  bm25Search(query: string, limit?: number): Promise<NotebookEntry[]>;
  getAllEntries?(): Promise<NotebookEntry[]>;
  getById?(id: string): Promise<NotebookEntry | null>;
  healthCheck?(): Promise<boolean>;
  close?(): Promise<void>;
  query?(params: any): Promise<NotebookEntry[]>;
  summary?(track_id?: string): Promise<NotebookSummary>;
}

/**
 * LanceDB implementation of NotebookQueryPort.
 * Delegates vector and BM25 search to LanceDbNotebookProvider,
 * while encapsulating Reciprocal Rank Fusion (RRF), token budget pruning,
 * and metadata filtering internally behind the port contract.
 */
export class LanceNotebookQueryAdapter extends BaseNotebookQueryPort implements NotebookQueryPort {
  private provider: ILanceDbProvider;

  constructor(providerOrOptions?: ILanceDbProvider | string | LanceDBProviderOptions) {
    super();
    if (
      providerOrOptions &&
      typeof providerOrOptions === 'object' &&
      ('vectorSearch' in providerOrOptions ||
        'query' in providerOrOptions ||
        'getAllEntries' in providerOrOptions)
    ) {
      this.provider = providerOrOptions as ILanceDbProvider;
    } else {
      this.provider = new LanceDBNotebookProvider(
        providerOrOptions as string | LanceDBProviderOptions | undefined
      );
    }
  }

  /**
   * Returns the underlying provider instance.
   */
  public getProvider(): ILanceDbProvider {
    return this.provider;
  }

  /**
   * Executes a hybrid query delegating vector and BM25 search to LanceDB,
   * then merges and prunes results via encapsulated RRF and token budget logic.
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

    let vectorResults: NotebookEntry[] = [];
    let bm25Results: NotebookEntry[] = [];

    const searchLimit = Math.max((mergedOptions.limit ?? 50) * 4, 100);

    if (queryText && queryText.trim() !== '') {
      // 1. Delegate vector search to LanceDB provider
      if (typeof this.provider.vectorSearch === 'function') {
        vectorResults = await this.provider.vectorSearch(queryText, searchLimit);
      }

      // 2. Delegate BM25 keyword search to LanceDB provider
      if (typeof this.provider.bm25Search === 'function') {
        bm25Results = await this.provider.bm25Search(queryText, searchLimit);
      }
    } else {
      // Empty query: fetch all entries for filtering and ordering
      if (typeof this.provider.getAllEntries === 'function') {
        vectorResults = await this.provider.getAllEntries();
      } else if (typeof this.provider.query === 'function') {
        vectorResults = await this.provider.query({ ...mergedOptions, limit: 1000 });
      }
      vectorResults = [...vectorResults].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    // Encapsulate RRF fusion, token budget pruning, and metadata/TTL filtering
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
    if (typeof this.provider.getById === 'function') {
      return await this.provider.getById(id);
    }
    if (typeof this.provider.getAllEntries === 'function') {
      const all = await this.provider.getAllEntries();
      return all.find((e) => e.id === id) ?? null;
    }
    return null;
  }

  /**
   * Checks the operational health of the LanceDB provider.
   */
  public async healthCheck(): Promise<boolean> {
    if (typeof this.provider.healthCheck === 'function') {
      return await this.provider.healthCheck();
    }
    return true;
  }

  /**
   * Summarizes entries grouped by note type.
   */
  public async summary(track_id?: string): Promise<NotebookSummary> {
    if (typeof this.provider.summary === 'function') {
      return await this.provider.summary(track_id);
    }
    return {
      by_type: {},
      total: 0,
    };
  }

  /**
   * Closes the underlying database connection.
   */
  public async close(): Promise<void> {
    if (typeof this.provider.close === 'function') {
      await this.provider.close();
    }
  }
}
