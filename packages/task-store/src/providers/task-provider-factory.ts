import { TaskProvider } from '../types.js';
import { LanceDBTaskProvider } from './lancedb-task-provider.js';
import { LibSQLTaskProvider } from './libsql-task-provider.js';

export async function createTaskProvider(workspacePath: string): Promise<TaskProvider> {
  const provider = new LanceDBTaskProvider(workspacePath);
  try {
    await provider.init();
    return provider;
  } catch (e) {
    console.warn('⚠️ TaskStore: LanceDB unavailable, falling back to LibSQL only');
    try {
      await provider.close();
    } catch {
      // Ignore errors when closing partially initialized provider
    }
    const fallback = new LibSQLTaskProvider(workspacePath);
    await fallback.init();
    return fallback;
  }
}
