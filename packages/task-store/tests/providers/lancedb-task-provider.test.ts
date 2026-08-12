import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LanceDBTaskProvider } from '../../src/providers/lancedb-task-provider.js';

describe('LanceDBTaskProvider', () => {
  const TEST_WORKSPACE = path.join(process.cwd(), 'tests', 'fixtures', 'lancedb-workspace');

  beforeEach(() => {
    if (fs.existsSync(TEST_WORKSPACE)) {
      fs.rmSync(TEST_WORKSPACE, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    if (fs.existsSync(TEST_WORKSPACE)) {
      fs.rmSync(TEST_WORKSPACE, { recursive: true, force: true });
    }
  });

  it('initializes lancedb and creates vector schema', async () => {
    const provider = new LanceDBTaskProvider(TEST_WORKSPACE);
    await provider.init();

    const task = await provider.createTask({
      track_id: 'track-1',
      title: 'Semantic Task',
      description: 'This is a test task for vector search.'
    });

    expect(task.id).toBeDefined();

    const results = await provider.queryTasks({ semantic_query: 'test task' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(task.id);

    await provider.close();
  });
});
