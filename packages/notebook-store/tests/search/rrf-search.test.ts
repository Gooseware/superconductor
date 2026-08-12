import { describe, it, expect } from 'vitest';
import { rrfMerge, applyTokenBudget } from '../../src/search/rrf-search.js';
import { NotebookEntry } from '../../src/types.js';

describe('RRF Search & Token Budget', () => {
  const createEntry = (id: string, content: string): NotebookEntry => ({
    id,
    session_id: 's1',
    track_id: 't1',
    agent_role: 'processor',
    domain: 'core',
    files: ['a.ts'],
    note_type: 'spec',
    content,
    severity: 'info',
    timestamp: Date.now(),
  });

  it('correctly merges vector and bm25 search results with RRF scoring', () => {
    const entryA = createEntry('entry-a', 'First note');
    const entryB = createEntry('entry-b', 'Second note');
    const entryC = createEntry('entry-c', 'Third note');

    // Vector rank: A (1), B (2)
    const vectorResults = [entryA, entryB];
    // BM25 rank: C (1), A (2)
    const bm25Results = [entryC, entryA];

    const merged = rrfMerge(vectorResults, bm25Results);

    // Entry A is rank 1 in vector and rank 2 in BM25, so it should have highest RRF score
    expect(merged[0].id).toBe('entry-a');
    expect(merged.map((e) => e.id)).toEqual(['entry-a', 'entry-c', 'entry-b']);
  });

  it('applies token budget character limit', () => {
    const entry1 = createEntry('1', 'a'.repeat(1000));
    const entry2 = createEntry('2', 'b'.repeat(1500));
    const entry3 = createEntry('3', 'c'.repeat(1000));

    const result = applyTokenBudget([entry1, entry2, entry3], 3200);

    // 1000 + 1500 = 2500 <= 3200. Adding entry3 (1000) makes 3500 > 3200, so entry3 is excluded.
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(['1', '2']);
  });
});
