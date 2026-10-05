import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import {
  computeDiffOnDiff,
  formatDiffOnDiffContext,
  injectDiffOnDiff,
  ReviewFindingsPipeline,
  reviewFindingsPipeline,
} from '../pipeline.js';
import { resolveReviewInput } from '../input-resolution.js';
import * as reviewBarrel from '../index.js';
import * as coreBarrel from '../../index.js';

describe('Diff-on-Diff Scrutiny in Quorum Review Pipeline', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-on-diff-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  describe('computeDiffOnDiff', () => {
    it('returns null for cycle 1 without running git', () => {
      const diff = computeDiffOnDiff(tmpDir, 1);
      expect(diff).toBeNull();
    });

    it('returns null for non-positive or invalid cycle numbers', () => {
      expect(computeDiffOnDiff(tmpDir, 0)).toBeNull();
      expect(computeDiffOnDiff(tmpDir, -1)).toBeNull();
      expect(computeDiffOnDiff(tmpDir, NaN as any)).toBeNull();
    });

    it('returns null if projectDir does not exist or is invalid', () => {
      expect(computeDiffOnDiff('/path/to/definitely/nonexistent/dir/xyz123', 2)).toBeNull();
      expect(computeDiffOnDiff('', 2)).toBeNull();
      expect(computeDiffOnDiff(null as any, 2)).toBeNull();
    });

    it('returns null gracefully on non-git directory (git failure fallback)', () => {
      // tmpDir is not a git repo
      const diff = computeDiffOnDiff(tmpDir, 2);
      expect(diff).toBeNull();
    });

    it('returns null gracefully when git repository has only 1 initial commit (shallow / no HEAD~1)', () => {
      // Initialize git repo with only 1 commit
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(tmpDir, 'init.txt'), 'initial content\n', 'utf-8');
      execSync('git add init.txt', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'ignore' });

      // HEAD~1 does not exist yet!
      const diff = computeDiffOnDiff(tmpDir, 2);
      expect(diff).toBeNull();
    });

    it('returns git diff HEAD~1..HEAD on remediation cycle 2+ with commits', () => {
      // Setup git repo with 2 commits
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });

      fs.writeFileSync(path.join(tmpDir, 'service.ts'), 'export const a = 1;\n', 'utf-8');
      execSync('git add service.ts', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit -m "commit 1: initial implementation"', { cwd: tmpDir, stdio: 'ignore' });

      // Remediation cycle 1 makes changes -> commit 2
      fs.writeFileSync(
        path.join(tmpDir, 'service.ts'),
        'export const a = 1;\nexport const remediationFix = 2;\n',
        'utf-8'
      );
      execSync('git add service.ts', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit -m "commit 2: cycle 1 remediation fix"', { cwd: tmpDir, stdio: 'ignore' });

      // Now at cycle 2: compute diff-on-diff
      const diff = computeDiffOnDiff(tmpDir, 2);
      expect(diff).not.toBeNull();
      expect(diff).toContain('diff --git a/service.ts b/service.ts');
      expect(diff).toContain('+export const remediationFix = 2;');
    });

    it('supports custom baseCommit range on cycle 2+', () => {
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });

      fs.writeFileSync(path.join(tmpDir, 'base.txt'), 'base\n', 'utf-8');
      execSync('git add base.txt', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit -m "base commit"', { cwd: tmpDir, stdio: 'ignore' });

      fs.writeFileSync(path.join(tmpDir, 'fix1.txt'), 'fix 1\n', 'utf-8');
      execSync('git add fix1.txt', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit -m "fix 1"', { cwd: tmpDir, stdio: 'ignore' });

      fs.writeFileSync(path.join(tmpDir, 'fix2.txt'), 'fix 2\n', 'utf-8');
      execSync('git add fix2.txt', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit -m "fix 2"', { cwd: tmpDir, stdio: 'ignore' });

      // Diff against HEAD~2 using custom baseCommit
      const diff = computeDiffOnDiff(tmpDir, 2, 'HEAD~2');
      expect(diff).not.toBeNull();
      expect(diff).toContain('fix1.txt');
      expect(diff).toContain('fix2.txt');

      // Explicit range syntax
      const diffRange = computeDiffOnDiff(tmpDir, 2, 'HEAD~2..HEAD');
      expect(diffRange).not.toBeNull();
      expect(diffRange).toContain('fix1.txt');
    });

    it('sanitizes malicious baseCommit inputs to prevent command injection', () => {
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a\n', 'utf-8');
      execSync('git add a.txt', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit -m "a"', { cwd: tmpDir, stdio: 'ignore' });

      // Attempt injection
      const dangerousCommit = 'HEAD; touch injected.txt;';
      const diff = computeDiffOnDiff(tmpDir, 2, dangerousCommit);
      expect(diff).toBeNull();
      expect(fs.existsSync(path.join(tmpDir, 'injected.txt'))).toBe(false);
    });
  });

  describe('formatDiffOnDiffContext', () => {
    it('formats diff block with authoritative header and instructions', () => {
      const sampleDiff = 'diff --git a/a.ts b/a.ts\n+const fix = true;';
      const formatted = formatDiffOnDiffContext(sampleDiff, 2);

      expect(formatted).toContain('## Diff-on-Diff Remediation Audit (HEAD~1..HEAD)');
      expect(formatted).toContain(
        "Remediation Cycle: 2. Audit previous remediator's changes for secondary flaws, unintended file modifications, or swallowed errors."
      );
      expect(formatted).toContain('```diff\n' + sampleDiff + '\n```');
    });

    it('reflects custom baseCommit range in header when provided', () => {
      const sampleDiff = 'diff --git a/b.ts b/b.ts\n+const patch = 123;';
      const formatted = formatDiffOnDiffContext(sampleDiff, 3, 'main');

      expect(formatted).toContain('## Diff-on-Diff Remediation Audit (main..HEAD)');
      expect(formatted).toContain('Remediation Cycle: 3.');
      expect(formatted).toContain(sampleDiff);
    });
  });

  describe('injectDiffOnDiff', () => {
    const basePrompt = '# System Prompt\nYou are an authoritative code reviewer.';
    const sampleDiff = 'diff --git a/api.ts b/api.ts\n+return fallbackValue;';

    it('returns unmodified basePrompt on cycle 1', () => {
      const injected = injectDiffOnDiff(basePrompt, sampleDiff, 1);
      expect(injected).toBe(basePrompt);
      expect(injected).not.toContain('## Diff-on-Diff Remediation Audit');
    });

    it('returns unmodified basePrompt when diff is null or empty', () => {
      expect(injectDiffOnDiff(basePrompt, null, 2)).toBe(basePrompt);
      expect(injectDiffOnDiff(basePrompt, '', 2)).toBe(basePrompt);
      expect(injectDiffOnDiff(basePrompt, '   \n  ', 2)).toBe(basePrompt);
    });

    it('injects diff-on-diff block into prompt on cycle 2+ without role filtering', () => {
      const injected = injectDiffOnDiff(basePrompt, sampleDiff, 2);
      expect(injected).toContain(basePrompt);
      expect(injected).toContain('## Diff-on-Diff Remediation Audit (HEAD~1..HEAD)');
      expect(injected).toContain("Remediation Cycle: 2. Audit previous remediator's changes");
      expect(injected).toContain(sampleDiff);
    });

    it('injects diff-on-diff for adversarial-reviewer on cycle 2+', () => {
      const injected = injectDiffOnDiff(basePrompt, sampleDiff, 2, 'adversarial-reviewer');
      expect(injected).toContain('## Diff-on-Diff Remediation Audit (HEAD~1..HEAD)');
      expect(injected).toContain('Remediation Cycle: 2.');
      expect(injected).toContain(sampleDiff);
    });

    it('injects diff-on-diff for correctness-reviewer on cycle 2+', () => {
      const injected = injectDiffOnDiff(basePrompt, sampleDiff, 2, 'correctness-reviewer');
      expect(injected).toContain('## Diff-on-Diff Remediation Audit (HEAD~1..HEAD)');
      expect(injected).toContain('Remediation Cycle: 2.');
      expect(injected).toContain(sampleDiff);
    });

    it('handles normalized and aliased role names (adversarial, correctness)', () => {
      const advAlias = injectDiffOnDiff(basePrompt, sampleDiff, 2, 'adversarial');
      expect(advAlias).toContain('## Diff-on-Diff Remediation Audit');

      const corrAlias = injectDiffOnDiff(basePrompt, sampleDiff, 2, 'correctness');
      expect(corrAlias).toContain('## Diff-on-Diff Remediation Audit');
    });

    it('respects explicit targetRoles when provided in options', () => {
      const optionsWithTarget = {
        diff: sampleDiff,
        cycle: 2,
        reviewerRole: 'security-reviewer',
        targetRoles: ['adversarial-reviewer', 'correctness-reviewer'],
      };

      // security-reviewer is not in targetRoles
      const notInjected = injectDiffOnDiff(basePrompt, optionsWithTarget);
      expect(notInjected).toBe(basePrompt);
      expect(notInjected).not.toContain('## Diff-on-Diff');

      // when targetRoles includes security-reviewer
      const optionsIncluded = {
        ...optionsWithTarget,
        targetRoles: ['adversarial-reviewer', 'correctness-reviewer', 'security-reviewer'],
      };
      const injected = injectDiffOnDiff(basePrompt, optionsIncluded);
      expect(injected).toContain('## Diff-on-Diff Remediation Audit');
    });

    it('automatically computes diff from projectDir when options.diff is omitted', () => {
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });

      fs.writeFileSync(path.join(tmpDir, 'mod.ts'), 'original\n', 'utf-8');
      execSync('git add mod.ts', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit -m "c1"', { cwd: tmpDir, stdio: 'ignore' });

      fs.writeFileSync(path.join(tmpDir, 'mod.ts'), 'modified\n', 'utf-8');
      execSync('git add mod.ts', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit -m "c2"', { cwd: tmpDir, stdio: 'ignore' });

      const injected = injectDiffOnDiff(basePrompt, {
        projectDir: tmpDir,
        cycle: 2,
        reviewerRole: 'adversarial-reviewer',
      });

      expect(injected).toContain('## Diff-on-Diff Remediation Audit (HEAD~1..HEAD)');
      expect(injected).toContain('+modified');
    });
  });

  describe('ReviewFindingsPipeline and singleton integration', () => {
    it('instance methods delegate correctly to diff-on-diff helpers', () => {
      const pipeline = new ReviewFindingsPipeline();

      expect(pipeline.computeDiffOnDiff(tmpDir, 1)).toBeNull();
      expect(pipeline.formatDiffOnDiffContext('diff-text', 2)).toContain('## Diff-on-Diff Remediation Audit');
      expect(pipeline.injectDiffOnDiff('Base', 'diff-text', 2)).toContain('## Diff-on-Diff Remediation Audit');
    });

    it('singleton instance exposes diff-on-diff methods', () => {
      expect(typeof reviewFindingsPipeline.computeDiffOnDiff).toBe('function');
      expect(typeof reviewFindingsPipeline.injectDiffOnDiff).toBe('function');
      expect(typeof reviewFindingsPipeline.formatDiffOnDiffContext).toBe('function');

      expect(reviewFindingsPipeline.computeDiffOnDiff(tmpDir, 1)).toBeNull();
    });

    it('is properly exported from review barrel (src/review/index.ts)', () => {
      expect(reviewBarrel.computeDiffOnDiff).toBeDefined();
      expect(reviewBarrel.formatDiffOnDiffContext).toBeDefined();
      expect(reviewBarrel.injectDiffOnDiff).toBeDefined();
    });

    it('is properly exported from core barrel (src/index.ts)', () => {
      expect(coreBarrel.computeDiffOnDiff).toBeDefined();
      expect(coreBarrel.formatDiffOnDiffContext).toBeDefined();
      expect(coreBarrel.injectDiffOnDiff).toBeDefined();
    });
  });

  describe('Input Resolution integration (resolveReviewInput)', () => {
    it('populates cycle and diffOnDiff when --cycle flag is provided on cycle 2+', () => {
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });

      fs.writeFileSync(path.join(tmpDir, 'file.ts'), 'v1\n', 'utf-8');
      execSync('git add file.ts', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit -m "c1"', { cwd: tmpDir, stdio: 'ignore' });

      fs.writeFileSync(path.join(tmpDir, 'file.ts'), 'v2\n', 'utf-8');
      execSync('git add file.ts', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit -m "c2"', { cwd: tmpDir, stdio: 'ignore' });

      const resolved = resolveReviewInput(['--cycle', '2'], true, undefined, { projectDir: tmpDir });
      expect(resolved.cycle).toBe(2);
      expect(resolved.diffOnDiff).not.toBeNull();
      expect(resolved.diffOnDiff).toContain('+v2');
    });

    it('returns null diffOnDiff on cycle 1 via --cycle flag', () => {
      const resolved = resolveReviewInput(['--cycle', '1'], true, undefined, { projectDir: tmpDir });
      expect(resolved.cycle).toBe(1);
      expect(resolved.diffOnDiff).toBeNull();
    });

    it('returns error when --cycle flag is missing value', () => {
      const resolved = resolveReviewInput(['--cycle'], true);
      expect(resolved.error).toBe('--cycle requires a value argument');
    });
  });
});
