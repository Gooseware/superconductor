import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTaskProvider } from '../../src/providers/task-provider-factory.js';
import { LanceDBTaskProvider } from '../../src/providers/lancedb-task-provider.js';
import { LibSQLTaskProvider } from '../../src/providers/libsql-task-provider.js';

describe('taskProviderFactory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'factory-task-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates LanceDBTaskProvider successfully when LanceDB is available', async () => {
    const provider = await createTaskProvider(tmpDir);

    expect(provider).toBeInstanceOf(LanceDBTaskProvider);

    const task = await provider.createTask({
      track_id: 'factory-track-1',
      title: 'Factory Test Task',
      description: 'Testing factory creation'
    });

    expect(task.id).toBeDefined();

    const tasks = await provider.queryTasks({ track_id: 'factory-track-1' });
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Factory Test Task');

    await provider.close();
  });

  it('falls back to LibSQLTaskProvider when LanceDB initialization fails', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const initSpy = vi.spyOn(LanceDBTaskProvider.prototype, 'init').mockRejectedValueOnce(
      new Error('LanceDB initialization error')
    );

    const provider = await createTaskProvider(tmpDir);

    expect(initSpy).toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('LanceDB unavailable, falling back to LibSQL only')
    );
    expect(provider).toBeInstanceOf(LibSQLTaskProvider);
    expect(provider).not.toBeInstanceOf(LanceDBTaskProvider);

    const task = await provider.createTask({
      track_id: 'fallback-track',
      title: 'Fallback Task',
      description: 'Created using fallback provider'
    });

    expect(task.id).toBeDefined();

    const tasks = await provider.queryTasks({ track_id: 'fallback-track' });
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Fallback Task');

    await provider.close();
  });
});
