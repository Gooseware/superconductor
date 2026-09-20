import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import { runSymbolExtraction, runToonSummary } from './symbol-extraction.js';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}));

describe('symbol-extraction runner', () => {
  let tmpDir: string;
  let outputDir: string;
  let projectRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbol-extract-test-'));
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

  it('degrades gracefully when capability is unavailable', () => {
    const res = runSymbolExtraction(projectRoot, outputDir, { status: 'unavailable' });
    expect(res.status).toBe('degraded');
    const written = fs.readFileSync(path.join(outputDir, '06_api_surface.toon'), 'utf8');
    expect(written).toBe('null');
  });

  it('uses profile.ctagsLanguages for Python from fingerprint', () => {
    fs.writeFileSync(
      path.join(outputDir, '01_fingerprint.json'),
      JSON.stringify({ primaryLanguage: 'Python' })
    );

    const spawnSpy = vi.mocked(childProcess.spawnSync).mockReturnValue({
      pid: 1,
      output: [],
      stdout: '{"_type": "tag", "name": "foo", "path": "main.py", "line": 10}\n',
      stderr: '',
      status: 0,
      signal: null,
      error: undefined,
    } as any);

    const res = runSymbolExtraction(projectRoot, outputDir, { tool: 'universal-ctags', status: 'available' });
    expect(res.status).toBe('ok');

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const args = spawnSpy.mock.calls[0][1] as string[];
    expect(args).toContain('--languages=Python');
    expect(args).not.toContain('--languages=TypeScript,JavaScript');

    const written = fs.readFileSync(path.join(outputDir, '06_api_surface.toon'), 'utf8');
    expect(written).toContain('"name": "foo"');
  });

  it('uses profile.ctagsLanguages for Go from fingerprint', () => {
    fs.writeFileSync(
      path.join(outputDir, '01_fingerprint.json'),
      JSON.stringify({ primaryLanguage: 'Go' })
    );

    const spawnSpy = vi.mocked(childProcess.spawnSync).mockReturnValue({
      pid: 1,
      output: [],
      stdout: '{"_type": "tag", "name": "Serve", "path": "main.go", "line": 5}\n',
      stderr: '',
      status: 0,
      signal: null,
      error: undefined,
    } as any);

    const res = runSymbolExtraction(projectRoot, outputDir, { tool: 'ctags', status: 'available' });
    expect(res.status).toBe('ok');

    const args = spawnSpy.mock.calls[0][1] as string[];
    expect(args).toContain('--languages=Go');
  });

  it('falls back to TypeScript / JavaScript ctags profile when fingerprint is missing', () => {
    const spawnSpy = vi.mocked(childProcess.spawnSync).mockReturnValue({
      pid: 1,
      output: [],
      stdout: '',
      stderr: '',
      status: 0,
      signal: null,
      error: undefined,
    } as any);

    const res = runSymbolExtraction(projectRoot, outputDir, { tool: 'universal-ctags', status: 'available' });
    expect(res.status).toBe('ok');

    const args = spawnSpy.mock.calls[0][1] as string[];
    expect(args).toContain('--languages=TypeScript,JavaScript');
  });

  it('uses profile.ctagsLanguages with scopedFiles', () => {
    fs.writeFileSync(
      path.join(outputDir, '01_fingerprint.json'),
      JSON.stringify({ primaryLanguage: 'Rust' })
    );

    const file = path.join(projectRoot, 'src', 'lib.rs');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'fn test() {}');

    const spawnSpy = vi.mocked(childProcess.spawnSync).mockReturnValue({
      pid: 1,
      output: [],
      stdout: '{"_type": "tag", "name": "test", "path": "src/lib.rs", "line": 1}\n',
      stderr: '',
      status: 0,
      signal: null,
      error: undefined,
    } as any);

    const res = runSymbolExtraction(
      projectRoot,
      outputDir,
      { tool: 'ctags', status: 'available' },
      ['src/lib.rs']
    );

    expect(res.status).toBe('ok');
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const args = spawnSpy.mock.calls[0][1] as string[];
    expect(args).toContain('--languages=Rust');
  });

  it('generates markdown summary via runToonSummary', () => {
    fs.writeFileSync(
      path.join(outputDir, '06_api_surface.toon'),
      '{"name": "myFunc", "path": "src/index.ts", "line": 12, "kind": "function"}\n'
    );

    const res = runToonSummary(projectRoot, outputDir);
    expect(res.status).toBe('ok');

    const summaryContent = fs.readFileSync(path.join(outputDir, '06_api_surface_summary.md'), 'utf8');
    expect(summaryContent).toContain('[function] src/index.ts:12 myFunc()');
  });
});
