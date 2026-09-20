import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFileSync: vi.fn((...args: any[]) => (actual.execFileSync as any)(...args)),
  };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    realpathSync: vi.fn((...args: any[]) => (actual.realpathSync as any)(...args)),
  };
});

import { resolveProjectRoot } from './resolve-project-root.js';

describe('resolveProjectRoot', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-proj-root-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('resolves git root when run within a git repository (CWD-within-repo)', () => {
    const gitOutput = child_process.execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
    }).toString().trim();
    const expectedRoot = fs.realpathSync(gitOutput);

    const result = resolveProjectRoot();
    expect(result).toBe(expectedRoot);
  });

  it('resolves git root when fromDir is passed pointing to a subdirectory (fromDir-within-repo)', () => {
    const gitOutput = child_process.execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
    }).toString().trim();
    const expectedRoot = fs.realpathSync(gitOutput);
    const subDir = path.resolve(expectedRoot, 'packages/superconductor-core');

    const result = resolveProjectRoot(subDir);
    expect(result).toBe(expectedRoot);
  });

  it('resolves git root when fromDir is explicitly at git root (CWD-at-root)', () => {
    const gitOutput = child_process.execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
    }).toString().trim();
    const expectedRoot = fs.realpathSync(gitOutput);

    const result = resolveProjectRoot(expectedRoot);
    expect(result).toBe(expectedRoot);
  });

  it('falls back safely to fromDir / cwd when not in a git repository (non-git-directory fallback)', () => {
    vi.mocked(child_process.execFileSync).mockImplementation(() => {
      const error = new Error('fatal: not a git repository (or any of the parent directories): .git');
      (error as any).status = 128;
      throw error;
    });

    const realTempDir = fs.realpathSync(tempDir);
    const result = resolveProjectRoot(tempDir);

    expect(child_process.execFileSync).toHaveBeenCalled();
    expect(result).toBe(realTempDir);
  });

  it('falls back safely to process.cwd() when no fromDir provided and git fails', () => {
    vi.mocked(child_process.execFileSync).mockImplementation(() => {
      throw new Error('git not found');
    });

    const expectedCwd = fs.realpathSync(process.cwd());
    const result = resolveProjectRoot();

    expect(result).toBe(expectedCwd);
  });

  it('resolves symlinks to their canonical real path (symlink resolution)', () => {
    const targetDir = path.join(tempDir, 'real-dir');
    fs.mkdirSync(targetDir, { recursive: true });
    const symlinkDir = path.join(tempDir, 'symlink-dir');
    fs.symlinkSync(targetDir, symlinkDir, 'dir');

    // Simulate git returning the symlinked path
    vi.mocked(child_process.execFileSync).mockReturnValue(symlinkDir + '\n');

    const result = resolveProjectRoot(symlinkDir);
    const canonicalTarget = fs.realpathSync(targetDir);

    expect(result).toBe(canonicalTarget);
  });

  it('resolves symlinked fromDir in non-git directory fallback', () => {
    vi.mocked(child_process.execFileSync).mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });

    const targetDir = path.join(tempDir, 'real-target');
    fs.mkdirSync(targetDir, { recursive: true });
    const symlinkDir = path.join(tempDir, 'symlink-target');
    fs.symlinkSync(targetDir, symlinkDir, 'dir');

    const result = resolveProjectRoot(symlinkDir);
    const canonicalTarget = fs.realpathSync(targetDir);

    expect(result).toBe(canonicalTarget);
  });

  it('never throws an unhandled exception even if fs.realpathSync fails on fallback', () => {
    vi.mocked(child_process.execFileSync).mockImplementation(() => {
      throw new Error('git crashed');
    });

    // Mock realpathSync to throw an unexpected error
    vi.mocked(fs.realpathSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const fakeDir = '/some/nonexistent/or/forbidden/path';
    expect(() => {
      const result = resolveProjectRoot(fakeDir);
      expect(result).toBe(path.resolve(fakeDir));
    }).not.toThrow();
  });

  it('never throws even if fs.realpathSync fails on git output', () => {
    const rawRoot = '/some/mocked/git/root';
    vi.mocked(child_process.execFileSync).mockReturnValue(rawRoot + '\n');
    vi.mocked(fs.realpathSync).mockImplementation(() => {
      throw new Error('realpath error');
    });

    expect(() => {
      const result = resolveProjectRoot();
      expect(result).toBe(path.resolve(rawRoot));
    }).not.toThrow();
  });

  it('handles git output with extra trailing whitespace or newlines', () => {
    const expectedRoot = fs.realpathSync(tempDir);
    vi.mocked(child_process.execFileSync).mockReturnValue(`  ${tempDir}\n\n  `);

    const result = resolveProjectRoot(tempDir);
    expect(result).toBe(expectedRoot);
  });

  it('is exported properly from intelligence/index.js', async () => {
    const intelligence = await import('../index.js');
    expect(typeof intelligence.resolveProjectRoot).toBe('function');
    expect(intelligence.resolveProjectRoot).toBe(resolveProjectRoot);
  }, { timeout: 20000 });

  it('handles process.cwd throwing an error safely', () => {
    vi.mocked(child_process.execFileSync).mockImplementation(() => {
      throw new Error('git error');
    });
    vi.spyOn(process, 'cwd').mockImplementation(() => {
      throw new Error('process.cwd failure');
    });

    expect(() => {
      const result = resolveProjectRoot();
      expect(result).toBeDefined();
    }).not.toThrow();
  });
});


