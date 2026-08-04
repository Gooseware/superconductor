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

    proc = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, SUPERCONDUCTOR_GRAPH_PATH: GRAPH_FILE }
    });

    // Wait for server to start
    await new Promise(r => setTimeout(r, 1000));
  });

  afterAll(() => {
    proc.kill();
    fs.rmSync(FIXTURE_PATH, { recursive: true, force: true });
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
  });
});
