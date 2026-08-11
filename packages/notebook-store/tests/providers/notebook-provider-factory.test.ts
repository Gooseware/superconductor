import { describe, it, expect, vi } from 'vitest';
import { createNotebookProvider } from '../../src/providers/notebook-provider-factory.js';
import { LanceDBNotebookProvider } from '../../src/providers/lancedb-notebook-provider.js';
import { LibSQLNotebookProvider } from '../../src/providers/libsql-notebook-provider.js';

describe('createNotebookProvider Factory', () => {
  it('returns LanceDBNotebookProvider by default', async () => {
    const provider = await createNotebookProvider('/tmp/test-factory-lancedb');
    expect(provider).toBeInstanceOf(LanceDBNotebookProvider);
    await provider.close();
  });

  it('falls back to LibSQLNotebookProvider when LanceDB fails', async () => {
    vi.spyOn(LanceDBNotebookProvider.prototype, 'init').mockRejectedValueOnce(new Error('LanceDB error'));
    const provider = await createNotebookProvider('/tmp/test-factory-fallback');
    expect(provider).toBeInstanceOf(LibSQLNotebookProvider);
    await provider.close();
    vi.restoreAllMocks();
  });
});
