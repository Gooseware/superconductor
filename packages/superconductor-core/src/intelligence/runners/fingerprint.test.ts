import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import { runFingerprint } from './fingerprint.js';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}));

describe('fingerprint runner', () => {
  let tmpDir: string;
  let outputDir: string;
  let projectRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fingerprint-test-'));
    outputDir = path.join(tmpDir, 'output');
    projectRoot = path.join(tmpDir, 'project with spaces & special;chars');
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
    const res = runFingerprint(projectRoot, outputDir, { status: 'unavailable', tool: 'tokei' });
    expect(res.status).toBe('degraded');
    const written = fs.readFileSync(path.join(outputDir, '01_fingerprint.json'), 'utf8');
    expect(written).toBe('null');
  });

  it('calls spawnSync with arguments array safely preventing shell injection or space errors', () => {
    const mockTokei = JSON.stringify({
      Rust: { code: 1200, reports: [{}, {}] },
      TypeScript: { code: 500, reports: [{}] },
      Total: { code: 1700, reports: [{}, {}, {}] }
    });

    const spawnSpy = vi.mocked(childProcess.spawnSync).mockReturnValue({
      pid: 1,
      output: [],
      stdout: mockTokei,
      stderr: '',
      status: 0,
      signal: null,
      error: undefined,
    } as any);

    const res = runFingerprint(projectRoot, outputDir, { status: 'available', tool: 'tokei' });
    expect(res.status).toBe('ok');

    // Verify spawnSync was called instead of shell execSync
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    expect(spawnSpy).toHaveBeenCalledWith(
      'tokei',
      [projectRoot, '--output', 'json'],
      expect.objectContaining({ encoding: 'utf8' })
    );

    const result = JSON.parse(fs.readFileSync(path.join(outputDir, '01_fingerprint.json'), 'utf8'));
    expect(result.primaryLanguage).toBe('Rust');
    expect(result.totalLines).toBe(1700);
    expect(result.totalFiles).toBe(3);
    expect(result.languages.Rust).toBe(1200);
    expect(result.languages.TypeScript).toBe(500);
  });

  it('handles spawnSync error or non-zero status by degrading gracefully', () => {
    vi.mocked(childProcess.spawnSync).mockReturnValue({
      pid: 1,
      output: [],
      stdout: '',
      stderr: 'error running tokei',
      status: 1,
      signal: null,
      error: new Error('command failed'),
    } as any);

    const res = runFingerprint(projectRoot, outputDir, { status: 'available', tool: 'tokei' });
    expect(res.status).toBe('degraded');
    const written = fs.readFileSync(path.join(outputDir, '01_fingerprint.json'), 'utf8');
    expect(written).toBe('null');
  });

  it('degrades when capability tool is unknown', () => {
    const res = runFingerprint(projectRoot, outputDir, { status: 'available', tool: 'unknown-tool' });
    expect(res.status).toBe('degraded');
    const written = fs.readFileSync(path.join(outputDir, '01_fingerprint.json'), 'utf8');
    expect(written).toBe('null');
  });
});
