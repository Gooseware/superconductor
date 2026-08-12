import { TaskProvider } from '../types.js';
import { LanceDBTaskProvider } from './lancedb-task-provider.js';
import { LibSQLTaskProvider } from './libsql-task-provider.js';

export async function createTaskProvider(workspacePath: string): Promise<TaskProvider> {
  try {
    const provider = new LanceDBTaskProvider(workspacePath);
    await provider.init();
    return provider;
  } catch (e) {
    console.warn('⚠️ TaskStore: LanceDB unavailable, falling back to LibSQL only');
    const provider = new LibSQLTaskProvider(workspacePath);
    await provider.init();
    return provider;
  }
}
