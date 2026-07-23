import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolveReviewInput } from '../src/review/input-resolution.js';

describe('resolveReviewInput', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-input-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should return error when both --fast and --deep are passed', () => {
    const res = resolveReviewInput(['--fast', '--deep'], true);
    expect(res.error).toBe('Cannot specify both --fast and --deep depth modes');
  });

  it('should return error when option flag is missing a value argument', () => {
    const res = resolveReviewInput(['--branch'], true);
    expect(res.error).toBe('--branch requires a value argument');
  });

  it('should resolve --staged and --branch arguments', () => {
    const resStaged = resolveReviewInput(['--staged'], true);
    expect(resStaged.targetType).toBe('staged');
    expect(resStaged.resolvedDiffCommand).toBe('git diff --staged');

    const resBranch = resolveReviewInput(['--branch', 'feature-x'], true);
    expect(resBranch.targetType).toBe('branch');
    expect(resBranch.targetValue).toBe('feature-x');
    expect(resBranch.resolvedDiffCommand).toBe('git diff main..feature-x');
  });

  it('should validate --file path existence', () => {
    const nonExistent = path.join(tmpDir, 'does-not-exist.ts');
    const resMissing = resolveReviewInput(['--file', nonExistent], true);
    expect(resMissing.error).toContain('File not found');

    const existingFile = path.join(tmpDir, 'exist.ts');
    fs.writeFileSync(existingFile, 'const a = 1;', 'utf-8');
    const resExisting = resolveReviewInput(['--file', existingFile], true);
    expect(resExisting.targetType).toBe('file');
    expect(resExisting.error).toBeUndefined();
  });

  it('should resolve stdin or default git repo command', () => {
    const resStdin = resolveReviewInput([], true, 'some diff text');
    expect(resStdin.targetType).toBe('stdin');
    expect(resStdin.targetValue).toBe('some diff text');

    const resDefaultGit = resolveReviewInput([], true);
    expect(resDefaultGit.targetType).toBe('default');
    expect(resDefaultGit.resolvedDiffCommand).toBe('git diff HEAD');

    const resNoGit = resolveReviewInput([], false);
    expect(resNoGit.error).toContain('not a git repository');
  });
});
