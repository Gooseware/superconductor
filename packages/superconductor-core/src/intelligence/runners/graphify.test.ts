import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import { runGraphify } from './graphify.js';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

describe('graphify runner', () => {
  let tmpDir: string;
  let outputDir: string;
  let projectRoot: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.USER = 'testuser';
    process.env.HOME = '/home/testuser';
    process.env.CUSTOM_TEST_VAR = 'preserved_val';

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-test-'));
    outputDir = path.join(tmpDir, 'output');
    projectRoot = path.join(tmpDir, 'project');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('degrades gracefully when capability is unavailable', () => {
    const res = runGraphify(projectRoot, outputDir, { status: 'unavailable', tool: 'graphify' });
    expect(res.status).toBe('degraded');
  });

  it('preserves process.env (HOME, USER, custom env vars) and preserves PATH in execFileSync', () => {
    // Create fake binary in projectRoot/node_modules/.bin/graphify
    const binDir = path.join(projectRoot, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    const fakeBin = path.join(binDir, 'graphify');
    fs.writeFileSync(fakeBin, '#!/bin/sh\nexit 0', { mode: 0o755 });

    // Mock execFileSync to produce graphify-out/graph.json
    const execSpy = vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      const outDir = path.join(projectRoot, 'graphify-out');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'graph.json'), JSON.stringify({ nodes: [], links: [] }));
      return Buffer.from('');
    });

    const res = runGraphify(projectRoot, outputDir, { status: 'available', tool: fakeBin });
    expect(res.status).toBe('ok');

    expect(execSpy).toHaveBeenCalledTimes(1);
    const options = execSpy.mock.calls[0][2] as any;
    expect(options).toBeDefined();
    expect(options.env).toBeDefined();

    // Verify environment is preserved: HOME, USER, and CUSTOM_TEST_VAR
    expect(options.env.HOME).toBe('/home/testuser');
    expect(options.env.USER).toBe('testuser');
    expect(options.env.CUSTOM_TEST_VAR).toBe('preserved_val');

    // Verify PATH includes standard paths and existing PATH
    expect(options.env.PATH).toBeDefined();
    expect(options.env.PATH).toContain('/usr/bin');
    expect(options.env.PATH).toContain('/usr/local/bin');

    const written = fs.readFileSync(path.join(outputDir, '09_graphify_graph.json'), 'utf8');
    expect(written).toContain('"nodes":[]');
  });
});
