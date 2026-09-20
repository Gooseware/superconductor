import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(process.cwd(), 'superconductor', 'intelligence');
const GRAPH_FILE = path.join(FIXTURE_PATH, '09_graphify_graph.json');

const FIXTURE = {
  nodes: [
    { id: 'src/auth/login.ts', type: 'file', churn: 42, community: 'c0', pagerank: 0.9 }
  ],
  edges: []
};

describe('MCP Server Integration', () => {
  let proc: ChildProcess;
  let messageId = 0;

  beforeAll(async () => {
    fs.mkdirSync(FIXTURE_PATH, { recursive: true });
    fs.writeFileSync(GRAPH_FILE, JSON.stringify(FIXTURE));

    const distPath = path.join(__dirname, '../dist/index.js');
    const [cmd, args] = fs.existsSync(distPath)
      ? ['node', [distPath]]
      : ['npx', ['tsx', 'src/index.ts']];

    proc = spawn(cmd, args, {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, SUPERCONDUCTOR_GRAPH_PATH: GRAPH_FILE }
    });

    // Wait for server to start
    await new Promise(r => setTimeout(r, 1000));
  });

  afterAll(() => {
    proc.kill();
    fs.rmSync(GRAPH_FILE, { force: true });
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

  it('kernel_graph_get_node returns correct data', async () => {
    const res: any = await sendRequest('tools/call', {
      name: 'kernel_graph_get_node',
      arguments: { node_id: 'src/auth/login.ts' }
    });
    
    expect(res.content[0].type).toBe('text');
    const data = JSON.parse(res.content[0].text);
    expect(data.id).toBe('src/auth/login.ts');
    expect(data.churn).toBe(42);
  }, 60000);

  it('tools/list includes workspaceRoot in schema for status and refresh', async () => {
    const res: any = await sendRequest('tools/list', {});
    const statusTool = res.tools.find((t: any) => t.name === 'kernel_intelligence_status');
    const refreshTool = res.tools.find((t: any) => t.name === 'kernel_intelligence_refresh');
    expect(statusTool).toBeDefined();
    expect(statusTool.inputSchema.properties.workspaceRoot).toBeDefined();
    expect(refreshTool).toBeDefined();
    expect(refreshTool.inputSchema.properties.workspaceRoot).toBeDefined();
  }, 60000);

  it('kernel_intelligence_status accepts workspaceRoot and returns status', async () => {
    const res: any = await sendRequest('tools/call', {
      name: 'kernel_intelligence_status',
      arguments: { workspaceRoot: process.cwd() }
    });
    expect(res.content[0].type).toBe('text');
    const data = JSON.parse(res.content[0].text);
    expect(data.status).toBeDefined();
    expect(data.project_root).toBeDefined();
  }, 60000);
});

describe('MCP Server with missing graph cache', () => {
  let proc: ChildProcess;
  let messageId = 0;

  beforeAll(async () => {
    const distPath = path.join(__dirname, '../dist/index.js');
    const [cmd, args] = fs.existsSync(distPath)
      ? ['node', [distPath]]
      : ['npx', ['tsx', 'src/index.ts']];

    proc = spawn(cmd, args, {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, SUPERCONDUCTOR_GRAPH_PATH: path.join(__dirname, 'nonexistent_graph_test.json') }
    });

    await new Promise(r => setTimeout(r, 1000));
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

  it('kernel_intelligence_get_hotspots returns empty hotspots with status NONE on missing graph', async () => {
    const res: any = await sendRequest('tools/call', {
      name: 'kernel_intelligence_get_hotspots',
      arguments: { metric: 'churn' }
    });

    expect(res.content[0].type).toBe('text');
    const data = JSON.parse(res.content[0].text);
    expect(data).toEqual({ hotspots: [], status: 'NONE' });
  }, 60000);
});
