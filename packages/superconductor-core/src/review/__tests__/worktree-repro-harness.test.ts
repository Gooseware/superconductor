import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  WorktreeReproHarness,
  parseFailureTraces,
  type ReproExecutionResult,
  type ReproHarnessOptions,
} from '../worktree-repro-harness.js';

describe('WorktreeReproHarness', () => {
  describe('parseFailureTraces', () => {
    it('returns empty array when no failure tags exist', () => {
      const output = 'All tests passed successfully.\nEverything is fine.';
      expect(parseFailureTraces(output)).toEqual([]);
    });

    it('parses a single failure trace enclosed in [REPRO_FAILURE_START] and [REPRO_FAILURE_END]', () => {
      const output = `
Some log output
[REPRO_FAILURE_START]
Error: Assertion failed: expected 42 to equal 100
    at runRepro (repro.ts:12:15)
[REPRO_FAILURE_END]
Done.
`;
      const traces = parseFailureTraces(output);
      expect(traces).toHaveLength(1);
      expect(traces[0]).toContain('Error: Assertion failed: expected 42 to equal 100');
      expect(traces[0]).toContain('at runRepro (repro.ts:12:15)');
    });

    it('parses multiple failure traces across stdout and stderr', () => {
      const output = `
[REPRO_FAILURE_START]
First error: DB Connection timeout
[REPRO_FAILURE_END]
middle output
[REPRO_FAILURE_START]
Second error: UI Component crash
[REPRO_FAILURE_END]
`;
      const traces = parseFailureTraces(output);
      expect(traces).toHaveLength(2);
      expect(traces[0]).toBe('First error: DB Connection timeout');
      expect(traces[1]).toBe('Second error: UI Component crash');
    });

    it('gracefully handles unclosed [REPRO_FAILURE_START] tag', () => {
      const output = `
Starting repro...
[REPRO_FAILURE_START]
Fatal error occurred before closing tag
`;
      const traces = parseFailureTraces(output);
      expect(traces).toHaveLength(1);
      expect(traces[0]).toBe('Fatal error occurred before closing tag');
    });
  });

  describe('unit execution & lifecycle with mock executor', () => {
    it('executes a passing script, returning exitCode 0 and passed: true', async () => {
      const execCalls: string[] = [];
      const mockExecutor = {
        exec: vi.fn().mockImplementation(async (cmd: string) => {
          execCalls.push(cmd);
          return { stdout: 'Repro check passed\n', stderr: '', exitCode: 0 };
        }),
        spawnScript: vi.fn().mockResolvedValue({
          stdout: 'Execution passed',
          stderr: '',
          exitCode: 0,
          timedOut: false,
          durationMs: 45,
        }),
      };

      const harness = new WorktreeReproHarness({
        projectRoot: '/mock/repo',
        timeoutMs: 5000,
        branchPrefix: 'test-repro-',
        executor: mockExecutor,
      });

      const script = `console.log("hello");`;
      const result: ReproExecutionResult = await harness.runScript(script, { lang: 'ts' });

      expect(result.exitCode).toBe(0);
      expect(result.passed).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.failureTraces).toEqual([]);
      expect(result.stdout).toBe('Execution passed');
      expect(mockExecutor.spawnScript).toHaveBeenCalledTimes(1);
    });

    it('executes a failing script with failure tags, returning passed: false and traces', async () => {
      const mockExecutor = {
        exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
        spawnScript: vi.fn().mockResolvedValue({
          stdout: '',
          stderr: '[REPRO_FAILURE_START]\nTypeError: Cannot read property of undefined\n[REPRO_FAILURE_END]',
          exitCode: 1,
          timedOut: false,
          durationMs: 80,
        }),
      };

      const harness = new WorktreeReproHarness({
        projectRoot: '/mock/repo',
        executor: mockExecutor,
      });

      const script = `throw new Error("fail");`;
      const result = await harness.runScript(script);

      expect(result.exitCode).toBe(1);
      expect(result.passed).toBe(false);
      expect(result.timedOut).toBe(false);
      expect(result.failureTraces).toEqual(['TypeError: Cannot read property of undefined']);
    });

    it('handles script timeout with timedOut: true and passed: false', async () => {
      const mockExecutor = {
        exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
        spawnScript: vi.fn().mockResolvedValue({
          stdout: 'Processing...',
          stderr: 'Timed out after 30000ms',
          exitCode: 124,
          timedOut: true,
          durationMs: 30000,
        }),
      };

      const harness = new WorktreeReproHarness({
        projectRoot: '/mock/repo',
        timeoutMs: 30000,
        executor: mockExecutor,
      });

      const script = `while(true) {}`;
      const result = await harness.runScript(script, { timeoutMs: 30000 });

      expect(result.timedOut).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(124);
    });

    it('guarantees worktree cleanup in finally block even if script execution fails', async () => {
      const cleanupCommands: string[] = [];
      const mockExecutor = {
        exec: vi.fn().mockImplementation(async (cmd: string) => {
          if (cmd.includes('remove') || cmd.includes('prune') || cmd.includes('branch -D')) {
            cleanupCommands.push(cmd);
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        }),
        spawnScript: vi.fn().mockRejectedValue(new Error('Process execution crashed unexpectedly')),
      };

      const harness = new WorktreeReproHarness({
        projectRoot: '/mock/repo',
        executor: mockExecutor,
      });

      await expect(harness.runScript('console.log(1);')).rejects.toThrow('Process execution crashed');

      // Cleanup should still have been triggered
      expect(cleanupCommands.length).toBeGreaterThan(0);
      expect(cleanupCommands.some(cmd => cmd.includes('worktree remove'))).toBe(true);
    });

    it('guarantees worktree cleanup on normal completion', async () => {
      const commands: string[] = [];
      const mockExecutor = {
        exec: vi.fn().mockImplementation(async (cmd: string) => {
          commands.push(cmd);
          return { stdout: '', stderr: '', exitCode: 0 };
        }),
        spawnScript: vi.fn().mockResolvedValue({
          stdout: 'ok',
          stderr: '',
          exitCode: 0,
          timedOut: false,
          durationMs: 20,
        }),
      };

      const harness = new WorktreeReproHarness({
        projectRoot: '/mock/repo',
        executor: mockExecutor,
      });

      await harness.runScript('console.log(1);');

      expect(commands.some(cmd => cmd.includes('worktree remove'))).toBe(true);
    });
  });

  describe('live git integration in temporary git repo', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repro-harness-live-'));
      // Initialize a real git repo
      const { execSync } = require('node:child_process');
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir });
      execSync('git config user.name "Test Runner"', { cwd: tmpDir });
      fs.writeFileSync(path.join(tmpDir, 'dummy.txt'), 'hello world');
      execSync('git add dummy.txt && git commit -m "initial commit"', { cwd: tmpDir });
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    it('executes real node/bash script in isolated git worktree and cleans up', async () => {
      const harness = new WorktreeReproHarness({
        projectRoot: tmpDir,
        timeoutMs: 10000,
        branchPrefix: 'live-test-',
      });

      const script = `
        echo "[REPRO_FAILURE_START]"
        echo "Live bash repro triggered"
        echo "[REPRO_FAILURE_END]"
        exit 1
      `;

      const result = await harness.runScript(script, { lang: 'sh' });

      expect(result.exitCode).toBe(1);
      expect(result.passed).toBe(false);
      expect(result.timedOut).toBe(false);
      expect(result.failureTraces).toEqual(['Live bash repro triggered']);

      // Ensure worktree was cleanly removed
      const { execSync } = require('node:child_process');
      const worktreeList = execSync('git worktree list', { cwd: tmpDir, encoding: 'utf8' });
      expect(worktreeList).not.toContain('live-test-');
    });

    it('executes real passing node script and confirms passed: true', async () => {
      const harness = new WorktreeReproHarness({
        projectRoot: tmpDir,
        timeoutMs: 10000,
        branchPrefix: 'live-pass-',
      });

      const script = `console.log("Success live node execution");`;

      const result = await harness.runScript(script, { lang: 'js' });

      expect(result.exitCode).toBe(0);
      expect(result.passed).toBe(true);
      expect(result.stdout).toContain('Success live node execution');
      expect(result.failureTraces).toEqual([]);

      // Ensure worktree list is pristine
      const { execSync } = require('node:child_process');
      const worktreeList = execSync('git worktree list', { cwd: tmpDir, encoding: 'utf8' });
      expect(worktreeList).not.toContain('live-pass-');
    });
  });
});
