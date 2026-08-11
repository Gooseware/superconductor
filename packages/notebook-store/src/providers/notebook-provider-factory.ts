import { INotebookProvider } from '../types.js';
import { LanceDBNotebookProvider } from './lancedb-notebook-provider.js';
import { LibSQLNotebookProvider } from './libsql-notebook-provider.js';

export async function createNotebookProvider(projectRoot: string): Promise<INotebookProvider> {
  try {
    const provider = new LanceDBNotebookProvider(projectRoot);
    await provider.init();
    return provider;
  } catch (e) {
    console.warn('⚠️ Notebook: LanceDB unavailable, FTS5 fallback active');
    const provider = new LibSQLNotebookProvider(projectRoot);
    await provider.init();
    return provider;
  }
}
