import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  InMemoryNotebookQueryAdapter,
  LanceNotebookQueryAdapter,
  LanceDBNotebookProvider,
  NotebookEntry,
  NotebookQueryPort,
} from '../../src/index.js';

describe('Query Port Adapters', () => {
  const makeEntry = (
    id: string,
    content: string,
    overrides: Partial<NotebookEntry> = {}
  ): NotebookEntry => ({
    id,
    session_id: 'session-1',
    track_id: 'track-1',
    agent_role: 'processor',
    domain: 'core',
    files: ['packages/core/src/index.ts'],
    note_type: 'spec',
    content,
    severity: 'info',
    timestamp: Date.now(),
    ...overrides,
  });

  describe('InMemoryNotebookQueryAdapter', () => {
    let adapter: InMemoryNotebookQueryAdapter;

    beforeEach(() => {
      adapter = new InMemoryNotebookQueryAdapter();
    });

    it('implements NotebookQueryPort contract and manages in-memory store', async () => {
      expect(await adapter.healthCheck()).toBe(true);

      const entry1 = makeEntry('e1', 'First in-memory entry');
      adapter.addEntry(entry1);

      expect(adapter.getEntries()).toHaveLength(1);
      const found = await adapter.getById('e1');
      expect(found).toEqual(entry1);

      const notFound = await adapter.getById('non-existent');
      expect(notFound).toBeNull();

      adapter.clear();
      expect(adapter.getEntries()).toHaveLength(0);
    });

    it('supports health status toggling', async () => {
      expect(await adapter.healthCheck()).toBe(true);
      adapter.setHealthy(false);
      expect(await adapter.healthCheck()).toBe(false);
    });

    it('performs text matching, keyword scoring, and RRF fusion in-memory', async () => {
      const entryTextOnly = makeEntry('e-text', 'Architecture optimization for performance', {
        domain: 'unrelated',
        files: ['unrelated.ts'],
      });
      const entryKeywordOnly = makeEntry('e-key', 'Database storage layer notes', {
        domain: 'optimization',
        files: ['performance.ts'],
      });
      const entryBoth = makeEntry('e-both', 'Deep architecture optimization details', {
        domain: 'optimization',
        files: ['performance.ts'],
      });

      adapter.addEntries([entryTextOnly, entryKeywordOnly, entryBoth]);

      const result = await adapter.query('optimization performance');

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.total).toBe(result.entries.length);
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);

      // Entry matching both text and keywords should rank highest via RRF
      expect(result.entries[0].id).toBe('e-both');
    });

    it('encapsulates token budget pruning via maxChars', async () => {
      const e1 = makeEntry('1', 'a'.repeat(100));
      const e2 = makeEntry('2', 'b'.repeat(100));
      const e3 = makeEntry('3', 'c'.repeat(100));

      adapter.addEntries([e1, e2, e3]);

      const result = await adapter.query('', { maxChars: 220 });
      const totalLength = result.entries.reduce((sum, e) => sum + e.content.length, 0);

      expect(totalLength).toBeLessThanOrEqual(220);
      expect(result.entries.length).toBe(2);
    });

    it('supports filtering by domain, severity, note_types, files, and max_age_days', async () => {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      const e1 = makeEntry('e1', 'Target entry 1', {
        domain: 'cache',
        severity: 'warning',
        note_type: 'warning',
        files: ['cache.ts'],
        timestamp: now,
      });
      const e2 = makeEntry('e2', 'Target entry 2', {
        domain: 'core',
        severity: 'info',
        note_type: 'spec',
        files: ['core.ts'],
        timestamp: now - 10 * oneDayMs,
      });

      adapter.addEntries([e1, e2]);

      // Filter by domain
      const cacheResults = await adapter.query('Target', { domain: 'cache' });
      expect(cacheResults.entries).toHaveLength(1);
      expect(cacheResults.entries[0].id).toBe('e1');

      // Filter by severity
      const warningResults = await adapter.query('Target', { severity: 'warning' });
      expect(warningResults.entries).toHaveLength(1);
      expect(warningResults.entries[0].id).toBe('e1');

      // Filter by note_type
      const specResults = await adapter.query('Target', { note_types: ['spec'] });
      expect(specResults.entries).toHaveLength(1);
      expect(specResults.entries[0].id).toBe('e2');

      // Filter by max_age_days
      const recentResults = await adapter.query('Target', { max_age_days: 5 });
      expect(recentResults.entries).toHaveLength(1);
      expect(recentResults.entries[0].id).toBe('e1');
    });

    it('accepts query as parameter object polymorphism', async () => {
      const e1 = makeEntry('e1', 'Polymorphic test content', { domain: 'engine' });
      adapter.addEntry(e1);

      const result = await adapter.query({
        query: 'Polymorphic',
        domain: 'engine',
        limit: 1,
      });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('e1');
    });

    it('provides summary grouped by note_type', async () => {
      const e1 = makeEntry('e1', 'Spec note', { note_type: 'spec', track_id: 't1' });
      const e2 = makeEntry('e2', 'Design note', { note_type: 'design', track_id: 't1' });
      const e3 = makeEntry('e3', 'Other track note', { note_type: 'spec', track_id: 't2' });

      adapter.addEntries([e1, e2, e3]);

      const summaryAll = await adapter.summary();
      expect(summaryAll.total).toBe(3);
      expect(summaryAll.by_type.spec).toHaveLength(2);
      expect(summaryAll.by_type.design).toHaveLength(1);

      const summaryTrack1 = await adapter.summary('t1');
      expect(summaryTrack1.total).toBe(2);
      expect(summaryTrack1.by_type.spec).toHaveLength(1);
    });

    it('returns empty array when limit is 0', async () => {
      const e1 = makeEntry('e1', 'Content note');
      adapter.addEntry(e1);
      const res = await adapter.query('Content', { limit: 0 });
      expect(res.entries).toEqual([]);
      expect(res.total).toBe(0);
    });

    it('applies default maxChars (3200 chars) token budget when omitted', async () => {
      const e1 = makeEntry('1', 'a'.repeat(2000));
      const e2 = makeEntry('2', 'b'.repeat(2000));
      adapter.addEntries([e1, e2]);

      const res = await adapter.query('');
      expect(res.entries).toHaveLength(1);
      expect(res.entries[0].id).toBe('1');
    });

    it('does not crash on corrupted notes missing domain, files, agent_role, or content', async () => {
      const corruptEntry = {
        id: 'corrupt-entry',
        session_id: 's-1',
        track_id: 't-1',
        timestamp: Date.now(),
      } as any;
      const validEntry = makeEntry('valid-entry', 'Valid searchable content', {
        domain: 'core',
        agent_role: 'processor',
        files: ['core.ts'],
      });

      adapter.addEntries([corruptEntry, validEntry]);

      // Query with search text should not throw
      const result = await adapter.query('searchable');
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('valid-entry');

      // Filtering should not throw
      const filtered = await adapter.query('', { domain: 'core' });
      expect(filtered.entries).toHaveLength(1);
      expect(filtered.entries[0].id).toBe('valid-entry');
    });

    it('sorts empty query candidates by timestamp descending', async () => {
      const oldEntry = makeEntry('old', 'Old note', { timestamp: 1000 });
      const midEntry = makeEntry('mid', 'Mid note', { timestamp: 2000 });
      const newEntry = makeEntry('new', 'New note', { timestamp: 3000 });

      adapter.addEntries([oldEntry, newEntry, midEntry]);

      const result = await adapter.query('', { maxChars: Infinity });
      expect(result.entries.map((e) => e.id)).toEqual(['new', 'mid', 'old']);
    });
  });

  describe('LanceNotebookQueryAdapter with Mock Provider', () => {
    it('delegates vector and BM25 search to provider and fuses via RRF', async () => {
      const eVector = makeEntry('vec-1', 'Vector match content');
      const eBM25 = makeEntry('bm-1', 'BM25 match content');

      const mockProvider = {
        vectorSearch: vi.fn().mockResolvedValue([eVector]),
        bm25Search: vi.fn().mockResolvedValue([eBM25]),
        getAllEntries: vi.fn().mockResolvedValue([eVector, eBM25]),
        getById: vi.fn().mockResolvedValue(eVector),
        healthCheck: vi.fn().mockResolvedValue(true),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const adapter = new LanceNotebookQueryAdapter(mockProvider);

      expect(await adapter.healthCheck()).toBe(true);
      expect(mockProvider.healthCheck).toHaveBeenCalled();

      const result = await adapter.query('search query', { limit: 10 });

      // searchLimit is Math.max((10 ?? 50) * 4, 100) = 100 (oversampled)
      expect(mockProvider.vectorSearch).toHaveBeenCalledWith('search query', 100);
      expect(mockProvider.bm25Search).toHaveBeenCalledWith('search query', 100);
      expect(result.entries).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);

      // Test getById delegation
      const byId = await adapter.getById('vec-1');
      expect(byId).toEqual(eVector);
      expect(mockProvider.getById).toHaveBeenCalledWith('vec-1');

      // Test close delegation
      await adapter.close();
      expect(mockProvider.close).toHaveBeenCalled();
    });

    it('delegates getAllEntries when query string is empty', async () => {
      const e1 = makeEntry('1', 'Note 1');
      const e2 = makeEntry('2', 'Note 2');

      const mockProvider = {
        vectorSearch: vi.fn(),
        bm25Search: vi.fn(),
        getAllEntries: vi.fn().mockResolvedValue([e1, e2]),
      };

      const adapter = new LanceNotebookQueryAdapter(mockProvider);
      const result = await adapter.query('', { limit: 1 });

      expect(mockProvider.getAllEntries).toHaveBeenCalled();
      expect(mockProvider.vectorSearch).not.toHaveBeenCalled();
      expect(result.entries).toHaveLength(1);
    });

    it('oversamples searchLimit to prevent candidate starvation under post-filtering', async () => {
      const e1 = makeEntry('1', 'Alpha', { domain: 'other' });
      const e2 = makeEntry('2', 'Alpha', { domain: 'other' });
      const e3 = makeEntry('3', 'Alpha', { domain: 'other' });
      const e4 = makeEntry('4', 'Alpha', { domain: 'other' });
      const eTarget = makeEntry('target', 'Alpha', { domain: 'target' });

      const mockProvider = {
        vectorSearch: vi.fn().mockResolvedValue([e1, e2, e3, e4, eTarget]),
        bm25Search: vi.fn().mockResolvedValue([]),
      };

      const adapter = new LanceNotebookQueryAdapter(mockProvider as any);
      const result = await adapter.query('Alpha', { limit: 1, domain: 'target' });

      // searchLimit is Math.max(1 * 4, 100) = 100
      expect(mockProvider.vectorSearch).toHaveBeenCalledWith('Alpha', 100);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('target');
    });

    it('sorts empty query candidates by timestamp descending matching InMemory adapter', async () => {
      const oldEntry = makeEntry('old', 'Old note', { timestamp: 1000 });
      const midEntry = makeEntry('mid', 'Mid note', { timestamp: 2000 });
      const newEntry = makeEntry('new', 'New note', { timestamp: 3000 });

      const mockProvider = {
        vectorSearch: vi.fn(),
        bm25Search: vi.fn(),
        getAllEntries: vi.fn().mockResolvedValue([oldEntry, newEntry, midEntry]),
      };

      const adapter = new LanceNotebookQueryAdapter(mockProvider as any);
      const result = await adapter.query('', { maxChars: Infinity });

      expect(result.entries.map((e) => e.id)).toEqual(['new', 'mid', 'old']);
    });
  });

  describe('LanceNotebookQueryAdapter Integration with LanceDBNotebookProvider', () => {
    let tmpDir: string;
    let globalDir: string;
    let projectDir: string;
    let provider: LanceDBNotebookProvider;
    let adapter: LanceNotebookQueryAdapter;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'lance-adapter-test-'));
      globalDir = path.join(tmpDir, 'global');
      projectDir = path.join(tmpDir, 'project');

      provider = new LanceDBNotebookProvider({
        globalPath: globalDir,
        projectPath: projectDir,
      });

      adapter = new LanceNotebookQueryAdapter(provider);
    });

    afterEach(async () => {
      await adapter.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('writes note through provider and queries through LanceNotebookQueryAdapter', async () => {
      await provider.write(
        {
          session_id: 's-int-1',
          track_id: 'track-int',
          agent_role: 'processor',
          domain: 'core',
          files: ['src/core.ts'],
          note_type: 'spec',
          content: 'Integration test note for lance query adapter',
          severity: 'info',
        },
        { invocation_id: 'inv-lance-adapter-1' }
      );

      // Verify health check
      expect(await adapter.healthCheck()).toBe(true);

      // Query through adapter
      const result = await adapter.query('Integration test note');

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries[0].content).toContain('Integration test note');
      expect(result.total).toBe(result.entries.length);

      // Test getById through adapter
      const noteId = result.entries[0].id;
      const fetched = await adapter.getById(noteId);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(noteId);
    });
  });
});
