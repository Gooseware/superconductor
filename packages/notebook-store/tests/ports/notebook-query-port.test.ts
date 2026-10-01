import { describe, it, expect } from 'vitest';
import {
  NotebookQueryPort,
  NotebookQueryOptions,
  NotebookQueryResult,
  BaseNotebookQueryPort,
  fuseAndPruneResults,
  NotebookEntry,
  NoteSeverity,
} from '../../src/index.js';

describe('NotebookQueryPort Interface Contract & Orchestration', () => {
  const createMockEntry = (
    id: string,
    content: string,
    options: {
      domain?: string;
      severity?: NoteSeverity;
      files?: string[];
      note_type?: NotebookEntry['note_type'];
    } = {}
  ): NotebookEntry => ({
    id,
    session_id: 'session-1',
    track_id: 'track-1',
    agent_role: 'processor',
    domain: options.domain || 'core',
    files: options.files || ['src/index.ts'],
    note_type: options.note_type || 'spec',
    content,
    severity: options.severity || 'info',
    timestamp: Date.now(),
  });

  // Mock implementation implementing the NotebookQueryPort interface directly
  class MockNotebookQueryAdapter implements NotebookQueryPort {
    private entries: Map<string, NotebookEntry> = new Map();
    public isHealthy = true;

    constructor(initialEntries: NotebookEntry[] = []) {
      for (const entry of initialEntries) {
        this.entries.set(entry.id, entry);
      }
    }

    async query(query: string, options?: NotebookQueryOptions): Promise<NotebookQueryResult> {
      const startTime = Date.now();
      const all = Array.from(this.entries.values());

      // Simulate vector results (e.g. semantic match)
      const vectorMatches = all.filter((e) =>
        e.content.toLowerCase().includes(query.toLowerCase())
      );
      // Simulate BM25 results (e.g. keyword match on domain/files)
      const bm25Matches = all.filter(
        (e) =>
          e.domain.toLowerCase().includes(query.toLowerCase()) ||
          e.files.some((f) => f.toLowerCase().includes(query.toLowerCase()))
      );

      // Encapsulate RRF ranking and token budget limiting
      const rankedEntries = fuseAndPruneResults(vectorMatches, bm25Matches, options);

      return {
        entries: rankedEntries,
        total: rankedEntries.length,
        queryTimeMs: Date.now() - startTime,
      };
    }

    async getById(id: string): Promise<NotebookEntry | null> {
      return this.entries.get(id) ?? null;
    }

    async healthCheck(): Promise<boolean> {
      return this.isHealthy;
    }
  }

  // Implementation extending BaseNotebookQueryPort
  class BasePortSubclassAdapter extends BaseNotebookQueryPort {
    private entries: NotebookEntry[];

    constructor(entries: NotebookEntry[]) {
      super();
      this.entries = entries;
    }

    async query(query: string, options?: NotebookQueryOptions): Promise<NotebookQueryResult> {
      const start = Date.now();
      const vectorResults = this.entries.filter((e) => e.content.includes(query));
      const bm25Results = this.entries.filter((e) => e.id.includes(query));

      const entries = this.fuseAndPrune(vectorResults, bm25Results, options);
      return {
        entries,
        total: entries.length,
        queryTimeMs: Date.now() - start,
      };
    }

    async getById(id: string): Promise<NotebookEntry | null> {
      return this.entries.find((e) => e.id === id) ?? null;
    }

    async healthCheck(): Promise<boolean> {
      return true;
    }
  }

  it('implements NotebookQueryPort interface contracts faithfully', async () => {
    const entry1 = createMockEntry('entry-1', 'Alpha note content', { domain: 'cache' });
    const adapter: NotebookQueryPort = new MockNotebookQueryAdapter([entry1]);

    // Test healthCheck
    expect(await adapter.healthCheck()).toBe(true);

    // Test getById found and not found
    const found = await adapter.getById('entry-1');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('entry-1');

    const notFound = await adapter.getById('non-existent');
    expect(notFound).toBeNull();

    // Test query returning NotebookQueryResult structure
    const result = await adapter.query('Alpha');
    expect(result).toHaveProperty('entries');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('queryTimeMs');
    expect(result.entries).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('encapsulates RRF ranking so consumers receive merged and ranked results', async () => {
    const entryA = createMockEntry('entry-a', 'Optimization target note', { domain: 'engine' });
    const entryB = createMockEntry('entry-b', 'Other note', { domain: 'target-match' });
    const entryC = createMockEntry('entry-c', 'Target in both vector and bm25', { domain: 'target-domain' });

    const adapter = new MockNotebookQueryAdapter([entryA, entryB, entryC]);
    const result = await adapter.query('target');

    // Consumers don't run rrfMerge manually; port encapsulates it
    expect(result.entries.length).toBeGreaterThan(0);
    // entryC matches in both content (vector) and domain (bm25), so it should rank highest
    expect(result.entries[0].id).toBe('entry-c');
  });

  it('encapsulates token budget pruning via maxChars', async () => {
    const entry1 = createMockEntry('1', 'x'.repeat(100));
    const entry2 = createMockEntry('2', 'y'.repeat(150));
    const entry3 = createMockEntry('3', 'z'.repeat(200));

    const adapter = new MockNotebookQueryAdapter([entry1, entry2, entry3]);

    // Total characters 100 + 150 = 250 <= 260. Adding entry3 (200) would make 450 > 260.
    const result = await adapter.query('x', { maxChars: 260 });
    expect(result.entries.some((e) => e.id === '1')).toBe(true);
    const totalChars = result.entries.reduce((acc, e) => acc + e.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(260);
  });

  it('respects limit, domain, and severity filters in query options', async () => {
    const entry1 = createMockEntry('1', 'Match content', { domain: 'core', severity: 'info' });
    const entry2 = createMockEntry('2', 'Match content', { domain: 'core', severity: 'warning' });
    const entry3 = createMockEntry('3', 'Match content', { domain: 'ui', severity: 'info' });

    const adapter = new MockNotebookQueryAdapter([entry1, entry2, entry3]);

    // Domain filter
    const coreResults = await adapter.query('Match', { domain: 'core' });
    expect(coreResults.entries.every((e) => e.domain === 'core')).toBe(true);
    expect(coreResults.entries).toHaveLength(2);

    // Severity filter
    const warningResults = await adapter.query('Match', { severity: 'warning' });
    expect(warningResults.entries).toHaveLength(1);
    expect(warningResults.entries[0].id).toBe('2');

    // Limit filter
    const limited = await adapter.query('Match', { limit: 1 });
    expect(limited.entries).toHaveLength(1);
  });

  it('supports BaseNotebookQueryPort subclassing with fuseAndPrune helper', async () => {
    const entry1 = createMockEntry('id-alpha', 'Alpha test');
    const entry2 = createMockEntry('id-beta', 'Beta test');
    const port = new BasePortSubclassAdapter([entry1, entry2]);

    expect(await port.healthCheck()).toBe(true);
    const result = await port.query('Alpha');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe('id-alpha');
  });

  describe('fuseAndPruneResults helper function', () => {
    it('handles weighted RRF when vectorWeight and bm25Weight are provided', () => {
      const entryVec = createMockEntry('v1', 'Vector only match');
      const entryBm25 = createMockEntry('b1', 'BM25 only match');

      // Heavy vector weighting
      const vectorDominant = fuseAndPruneResults([entryVec], [entryBm25], {
        vectorWeight: 10,
        bm25Weight: 0.1,
      });
      expect(vectorDominant[0].id).toBe('v1');

      // Heavy BM25 weighting
      const bm25Dominant = fuseAndPruneResults([entryVec], [entryBm25], {
        vectorWeight: 0.1,
        bm25Weight: 10,
      });
      expect(bm25Dominant[0].id).toBe('b1');
    });

    it('handles single result lists gracefully (only vector or only bm25)', () => {
      const entry = createMockEntry('single', 'Solo note');
      const onlyVec = fuseAndPruneResults([entry], []);
      expect(onlyVec).toHaveLength(1);
      expect(onlyVec[0].id).toBe('single');

      const onlyBm = fuseAndPruneResults([], [entry]);
      expect(onlyBm).toHaveLength(1);
      expect(onlyBm[0].id).toBe('single');
    });

    it('filters by note_types and files', () => {
      const entry1 = createMockEntry('1', 'Note 1', { note_type: 'spec', files: ['file1.ts'] });
      const entry2 = createMockEntry('2', 'Note 2', { note_type: 'warning', files: ['file2.ts'] });

      const filteredByType = fuseAndPruneResults([entry1, entry2], [], {
        note_types: ['warning'],
      });
      expect(filteredByType).toHaveLength(1);
      expect(filteredByType[0].id).toBe('2');

      const filteredByFile = fuseAndPruneResults([entry1, entry2], [], {
        files: ['file1.ts'],
      });
      expect(filteredByFile).toHaveLength(1);
      expect(filteredByFile[0].id).toBe('1');
    });

    it('returns empty array when limit is 0 or negative', () => {
      const entry1 = createMockEntry('1', 'Note 1');
      const entry2 = createMockEntry('2', 'Note 2');

      const resultZero = fuseAndPruneResults([entry1, entry2], [], { limit: 0 });
      expect(resultZero).toEqual([]);

      const resultNegative = fuseAndPruneResults([entry1, entry2], [], { limit: -5 });
      expect(resultNegative).toEqual([]);
    });

    it('defaults to 3200 maxChars token pruning when maxChars is omitted', () => {
      const entry1 = createMockEntry('1', 'a'.repeat(2000));
      const entry2 = createMockEntry('2', 'b'.repeat(2000));

      // With default 3200 char budget, entry1 (2000 chars) fits, but entry2 (2000 chars) exceeds (4000 > 3200)
      const defaultPruned = fuseAndPruneResults([entry1, entry2], []);
      expect(defaultPruned).toHaveLength(1);
      expect(defaultPruned[0].id).toBe('1');

      // Explicitly disabled via Infinity
      const unlimited = fuseAndPruneResults([entry1, entry2], [], { maxChars: Infinity });
      expect(unlimited).toHaveLength(2);
    });

    it('defensively handles corrupt or partial notes missing domain, files, or severity', () => {
      const corruptNote = {
        id: 'corrupt-1',
        session_id: 's1',
        track_id: 't1',
        agent_role: 'processor',
        content: 'Partial note content',
        timestamp: Date.now(),
      } as any;

      const healthyNote = createMockEntry('healthy-1', 'Healthy note', {
        domain: 'engine',
        severity: 'info',
        files: ['engine.ts'],
      });

      const domainFilter = fuseAndPruneResults([corruptNote, healthyNote], [], { domain: 'engine' });
      expect(domainFilter).toHaveLength(1);
      expect(domainFilter[0].id).toBe('healthy-1');

      const severityFilter = fuseAndPruneResults([corruptNote, healthyNote], [], { severity: 'info' });
      expect(severityFilter).toHaveLength(1);
      expect(severityFilter[0].id).toBe('healthy-1');

      const filesFilter = fuseAndPruneResults([corruptNote, healthyNote], [], { files: ['engine.ts'] });
      expect(filesFilter).toHaveLength(1);
      expect(filesFilter[0].id).toBe('healthy-1');
    });
  });

  it('returns empty array when limit is 0', async () => {
    const entry1 = createMockEntry('entry-1', 'Alpha note content');
    const adapter: NotebookQueryPort = new MockNotebookQueryAdapter([entry1]);
    const result = await adapter.query('Alpha', { limit: 0 });
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
  });
});
