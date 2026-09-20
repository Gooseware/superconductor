import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import { runDependencyGraph } from './dependency-graph.js';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}));

describe('dependency-graph runner', () => {
  let tmpDir: string;
  let outputDir: string;
  let projectRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-graph-test-'));
    outputDir = path.join(tmpDir, 'output');
    projectRoot = path.join(tmpDir, 'project');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('degrades gracefully when capability is unavailable or missing tool', () => {
    const res = runDependencyGraph(projectRoot, outputDir, { status: 'unavailable', tool: 'depcruise' });
    expect(res.status).toBe('degraded');
    const written = fs.readFileSync(path.join(outputDir, '02_dependency_graph.json'), 'utf8');
    expect(written).toBe('null');
  });

  it('scans candidate directories beyond hardcoded packages/superconductor-core/src', () => {
    // Create candidate dirs: packages/foo/src, packages/bar/src, lib
    const pkgFoo = path.join(projectRoot, 'packages', 'foo', 'src');
    const pkgBar = path.join(projectRoot, 'packages', 'bar', 'src');
    const libDir = path.join(projectRoot, 'lib');
    fs.mkdirSync(pkgFoo, { recursive: true });
    fs.mkdirSync(pkgBar, { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });

    fs.writeFileSync(
      path.join(outputDir, '01_fingerprint.json'),
      JSON.stringify({ primaryLanguage: 'TypeScript' })
    );

    const mockDepcruiseOutput = JSON.stringify({
      modules: [
        { source: 'packages/foo/src/index.ts', dependencies: [{ resolved: 'packages/bar/src/util.ts' }] }
      ],
      summary: {
        violations: [
          { rule: { name: 'no-circular' }, from: 'packages/foo/src/index.ts' }
        ]
      }
    });

    const spawnSpy = vi.mocked(childProcess.spawnSync).mockReturnValue({
      pid: 1,
      output: [],
      stdout: mockDepcruiseOutput,
      stderr: '',
      status: 0,
      signal: null,
      error: undefined,
    } as any);

    const res = runDependencyGraph(projectRoot, outputDir, { status: 'available', tool: 'depcruise' });
    expect(res.status).toBe('ok');

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const args = spawnSpy.mock.calls[0][1] as string[];
    expect(args).toContain('packages/foo/src');
    expect(args).toContain('packages/bar/src');
    expect(args).toContain('lib');

    const resultData = JSON.parse(fs.readFileSync(path.join(outputDir, '02_dependency_graph.json'), 'utf8'));
    expect(resultData.nodes).toHaveLength(1);
    expect(resultData.nodes[0].source).toBe('packages/foo/src/index.ts');
    expect(resultData.nodes[0].deps).toEqual(['packages/bar/src/util.ts']);
    expect(resultData.circularDeps).toEqual(['packages/foo/src/index.ts']);
  });

  it('uses LanguageProfile for Python project from fingerprint', () => {
    fs.writeFileSync(
      path.join(outputDir, '01_fingerprint.json'),
      JSON.stringify({ primaryLanguage: 'Python' })
    );

    const execSpy = vi.mocked(childProcess.execSync).mockReturnValue('{}' as any);

    const res = runDependencyGraph(projectRoot, outputDir, { status: 'available', tool: 'deptry' });
    expect(res.status).toBe('ok');

    expect(execSpy).toHaveBeenCalledTimes(1);
    const cmd = execSpy.mock.calls[0][0] as string;
    expect(cmd).toContain('deptry');
  });

  it('falls back to TypeScript default profile and runs when fingerprint is missing', () => {
    const srcDir = path.join(projectRoot, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const mockDepcruiseOutput = JSON.stringify({
      modules: [{ source: 'src/main.ts', dependencies: [] }],
      summary: { violations: [] }
    });

    const spawnSpy = vi.mocked(childProcess.spawnSync).mockReturnValue({
      pid: 1,
      output: [],
      stdout: mockDepcruiseOutput,
      stderr: '',
      status: 0,
      signal: null,
      error: undefined,
    } as any);

    const res = runDependencyGraph(projectRoot, outputDir, { status: 'available', tool: 'depcruise' });
    expect(res.status).toBe('ok');

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const args = spawnSpy.mock.calls[0][1] as string[];
    expect(args).toContain('src');
  });

  it('handles scopedFiles mode with spawnSync', () => {
    const file = path.join(projectRoot, 'src', 'index.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export const a = 1;');

    const mockDepcruiseOutput = JSON.stringify({
      modules: [{ source: 'src/index.ts', dependencies: [] }],
      summary: { violations: [] }
    });

    const spawnSpy = vi.mocked(childProcess.spawnSync).mockReturnValue({
      pid: 1,
      output: [],
      stdout: mockDepcruiseOutput,
      stderr: '',
      status: 0,
      signal: null,
      error: undefined,
    } as any);

    const res = runDependencyGraph(
      projectRoot,
      outputDir,
      { status: 'available', tool: 'depcruise' },
      ['src/index.ts']
    );

    expect(res.status).toBe('ok');
    expect(res.entries).toBeDefined();
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });
});
