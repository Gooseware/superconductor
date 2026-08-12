import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('MCP Task Tools Integration', () => {
  let proc: ChildProcess;
  let messageId = 0;

  beforeAll(async () => {
    // Delete any existing test task store? No, we will just create unique tracks
    proc = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env }
    });

    // Wait for server to start and init db
    await new Promise(r => setTimeout(r, 5000));
  });

  afterAll(() => {
    proc.kill();
  });

  const sendRequest = (method: string, params: any) => {
    return new Promise((resolve, reject) => {
      const id = ++messageId;
      const onData = (data: Buffer) => {
        const str = data.toString();
        const lines = str.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === id) {
              proc.stdout!.off('data', onData);
              if (parsed.error) reject(parsed.error);
              else resolve(parsed.result);
            }
          } catch (e) {
            // ignore non-json
          }
        }
      };
      proc.stdout!.on('data', onData);
      
      const req = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };
      proc.stdin!.write(JSON.stringify(req) + '\n');
    });
  };

  it('can create a task, query it, and get invariants', async () => {
    const track_id = 'test_track_' + Date.now();
    
    // 1. Create a task
    const createRes: any = await sendRequest('tools/call', {
      name: 'task_create',
      arguments: {
        track_id,
        title: 'Test Task',
        description: 'Testing MCP',
        creates: ['src/test.ts'],
        protected: ['src/core.ts'],
        invariant_after: 'The core MUST not break'
      }
    });
    const createData = JSON.parse(createRes.content[0].text);
    expect(createData.id).toBeTruthy();
    const taskId = createData.id;

    // 2. Query tasks
    const queryRes: any = await sendRequest('tools/call', {
      name: 'task_query',
      arguments: { track_id }
    });
    const queryData = JSON.parse(queryRes.content[0].text);
    expect(queryData.length).toBeGreaterThan(0);
    expect(queryData[0].id).toBe(taskId);
    expect(queryData[0].title).toBe('Test Task');
    expect(queryData[0].creates).toEqual(['src/test.ts']);

    // 3. Update task
    const updateRes: any = await sendRequest('tools/call', {
      name: 'task_update',
      arguments: {
        id: taskId,
        status: 'in_progress',
        committed_sha: '123456'
      }
    });
    const updateData = JSON.parse(updateRes.content[0].text);
    expect(updateData.success).toBe(true);

    // 4. Verify update
    const queryRes2: any = await sendRequest('tools/call', {
      name: 'task_query',
      arguments: { track_id }
    });
    const queryData2 = JSON.parse(queryRes2.content[0].text);
    expect(queryData2[0].status).toBe('in_progress');
    expect(queryData2[0].committed_sha).toBe('123456');

    // 5. Seed an invariant explicitly using invariant_create
    const invCreateRes: any = await sendRequest('tools/call', {
      name: 'invariant_create',
      arguments: {
        capability: 'core_lock',
        path: 'src/core.ts',
        rationale: 'The core MUST not break',
        track_id
      }
    });
    const invCreateData = JSON.parse(invCreateRes.content[0].text);
    expect(invCreateData.id).toBeTruthy();
    const invId = invCreateData.id;

    // 6. Override the invariant
    const overrideRes: any = await sendRequest('tools/call', {
      name: 'invariant_override',
      arguments: {
        invariant_id: invId,
        track_id,
        reason: 'Because test'
      }
    });
    const overrideData = JSON.parse(overrideRes.content[0].text);
    expect(overrideData.override_id).toBeTruthy();

    // 7. Verify invariant status updated to 'overridden'
    const invQueryRes: any = await sendRequest('tools/call', {
      name: 'invariant_query',
      arguments: { track_id }
    });
    const invQueryData = JSON.parse(invQueryRes.content[0].text);
    const updatedInv = invQueryData.find((i: any) => i.id === invId);
    expect(updatedInv).toBeTruthy();
    expect(updatedInv.status).toBe('overridden');

    // 8. Get all invariants and active overrides for track
    const invsRes: any = await sendRequest('tools/call', {
      name: 'task_get_invariants',
      arguments: { track_id }
    });
    const invsData = JSON.parse(invsRes.content[0].text);
    expect(invsData).toHaveProperty('invariants');
    expect(invsData).toHaveProperty('active_overrides');
    expect(invsData.active_overrides.length).toBeGreaterThan(0);
  });
});
