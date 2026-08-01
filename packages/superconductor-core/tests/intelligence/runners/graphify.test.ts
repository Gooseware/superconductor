import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { runGraphify } from '../../../src/intelligence/runners/graphify';
import { ToolCapability } from '../../../src/intelligence/tool-registry';

// Mock child_process so we don't actually run graphify
vi.mock('child_process', () => ({
  execFileSync: vi.fn()
}));

describe('runGraphify', () => {
  const testOutputDir = path.join(__dirname, 'test-output');
  const projectRoot = path.join(__dirname, 'test-project');

  beforeEach(() => {
    fs.mkdirSync(testOutputDir, { recursive: true });
    fs.mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testOutputDir)) fs.rmSync(testOutputDir, { recursive: true, force: true });
    if (fs.existsSync(projectRoot)) fs.rmSync(projectRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('should return unavailable if capability is unavailable', async () => {
    const capability: ToolCapability = { status: 'unavailable', tool: null, version: null };
    const res = await runGraphify(projectRoot, testOutputDir, capability);
    expect(res.status).toBe('unavailable');
  });

  it('should run graphify and copy graph.json on success', async () => {
    const capability: ToolCapability = { status: 'available', tool: 'graphify', version: '1.0' };
    const childProcess = await import('child_process');
    
    // Simulate graphify output
    const graphifyOutDir = path.join(projectRoot, 'graphify-out');
    fs.mkdirSync(graphifyOutDir, { recursive: true });
    fs.writeFileSync(path.join(graphifyOutDir, 'graph.json'), JSON.stringify({ nodes: [] }));
    
    const res = await runGraphify(projectRoot, testOutputDir, capability);
    
    expect(childProcess.execFileSync).toHaveBeenCalledWith('graphify', ['extract', projectRoot, '--code-only'], expect.any(Object));
    expect(res.status).toBe('available');
    expect(fs.existsSync(path.join(testOutputDir, '09_graphify_graph.json'))).toBe(true);
  });

  it('should return degraded if graphify command fails', async () => {
    const capability: ToolCapability = { status: 'available', tool: 'graphify', version: '1.0' };
    const childProcess = await import('child_process');
    vi.mocked(childProcess.execFileSync).mockImplementationOnce(() => {
      throw new Error('Command failed');
    });

    const res = await runGraphify(projectRoot, testOutputDir, capability);
    
    expect(res.status).toBe('degraded');
    expect(fs.existsSync(path.join(testOutputDir, '09_graphify_graph.json'))).toBe(false);
  });
});
