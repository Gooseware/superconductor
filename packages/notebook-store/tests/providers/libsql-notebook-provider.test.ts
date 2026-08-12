import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { LibSQLNotebookProvider } from '../../src/providers/libsql-notebook-provider.js';
import { createNotebookProvider } from '../../src/providers/notebook-provider-factory.js';

describe('LibSQLNotebookProvider & Factory', () => {
  let tmpDir: string;
  let provider: LibSQLNotebookProvider;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'libsql-test-'));
    provider = new LibSQLNotebookProvider(tmpDir);
    await provider.init();
  });

  afterEach(async () => {
    await provider.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes entries to FTS5 table and deduplicates exact content', async () => {
    const note = {
      session_id: 's1',
      track_id: 't1',
      agent_role: 'processor',
      domain: 'core',
      files: ['lib.ts'],
      note_type: 'warning' as const,
      content: 'FTS5 fallback test note',
      severity: 'warning' as const,
    };

    const ack1 = await provider.write(note, { invocation_id: 'inv-fts-1' });
    expect(ack1.deduplicated).toBe(false);

    const ack2 = await provider.write(note, { invocation_id: 'inv-fts-2' });
    expect(ack2.deduplicated).toBe(true);
    expect(ack2.id).toBe(ack1.id);
  });

  it('queries entries using BM25 FTS5 search', async () => {
    await provider.write(
      {
        session_id: 's1',
        track_id: 't1',
        agent_role: 'processor',
        domain: 'security',
        files: ['auth.ts'],
        note_type: 'warning',
        content: 'FTS5 search for authentication tokens',
        severity: 'critical',
      },
      { invocation_id: 'inv-fts-q1' }
    );

    const results = await provider.query({ query: 'authentication' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toContain('authentication');
  });

  it('creates provider via factory fallback', async () => {
    const factoryProvider = await createNotebookProvider(tmpDir);
    expect(factoryProvider).toBeDefined();
    await factoryProvider.close();
  });
});
