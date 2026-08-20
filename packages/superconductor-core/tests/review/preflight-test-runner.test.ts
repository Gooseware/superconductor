import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  QuorumPreflightTestRunner,
  parseTestCounts,
  formatPreflightMarkdown,
  detectTestCommand,
  PreflightTestResult,
} from '../../src/review/preflight-test-runner.js';

describe('QuorumPreflightTestRunner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-test-runner-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('parseTestCounts', () => {
    it('parses Vitest/Jest test suites and tests count', () => {
      const output = `
 Test Files  5 passed (5)
      Tests  42 passed (42)
   Start at  06:30:00
   Duration  2.45s
`;
      const counts = parseTestCounts(output);
      expect(counts.suiteCount).toBe(5);
      expect(counts.testCount).toBe(42);
    });

    it('parses "Test Suites: 3 passed" and "Tests: 15 passed"', () => {
      const output = 'Test Suites: 3 passed, 3 total\nTests: 15 passed, 15 total';
      const counts = parseTestCounts(output);
      expect(counts.suiteCount).toBe(3);
      expect(counts.testCount).toBe(15);
    });

    it('handles output without clear counts gracefully', () => {
      const output = 'Everything is fine and all checks passed without explicit numbers';
      const counts = parseTestCounts(output);
      expect(counts.testCount).toBeUndefined();
      expect(counts.suiteCount).toBeUndefined();
    });
  });

  describe('formatPreflightMarkdown', () => {
    it('generates the standardized markdown evidence block for passed tests', () => {
      const md = formatPreflightMarkdown({
        passed: true,
        exitCode: 0,
        durationMs: 8400,
        command: 'npm test',
        stdout: 'All 10 tests passed successfully',
        stderr: '',
      });

      expect(md).toContain('## Preflight Test Execution Evidence');
      expect(md).toContain('- Status: PASSED');
      expect(md).toContain('- Exit Code: 0');
      expect(md).toContain('- Duration: 8.4s');
      expect(md).toContain('- Command: npm test');
      expect(md).toContain('```text');
      expect(md).toContain('All 10 tests passed successfully');
    });

    it('generates the standardized markdown evidence block for failed tests', () => {
      const md = formatPreflightMarkdown({
        passed: false,
        exitCode: 1,
        durationMs: 1200,
        command: 'npm test',
        stdout: '',
        stderr: 'AssertionError: expected false to be true',
      });

      expect(md).toContain('## Preflight Test Execution Evidence');
      expect(md).toContain('- Status: FAILED');
      expect(md).toContain('- Exit Code: 1');
      expect(md).toContain('- Duration: 1.2s');
      expect(md).toContain('AssertionError: expected false to be true');
    });

    it('truncates oversized output snippets to the last 8000 characters', () => {
      const longOutput = 'x'.repeat(10000);
      const md = formatPreflightMarkdown({
        passed: true,
        exitCode: 0,
        durationMs: 500,
        command: 'npm test',
        stdout: longOutput,
        stderr: '',
      });

      expect(md).toContain('## Preflight Test Execution Evidence');
      expect(md.length).toBeLessThan(9000);
    });
  });

  describe('detectTestCommand', () => {
    it('detects npm test if package.json has scripts.test', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ scripts: { test: 'vitest run' } })
      );
      expect(detectTestCommand(tmpDir)).toBe('npm test');
    });

    it('defaults to npm test when package.json is missing or lacks test script', () => {
      expect(detectTestCommand(tmpDir)).toBe('npm test');
    });
  });

  describe('runPreflightTests execution', () => {
    it('executes a passing command, parses results, and persists to .superconductor/quorum/preflight-test-results.json', async () => {
      const runner = new QuorumPreflightTestRunner({ projectRoot: tmpDir });
      const command = 'node -e "console.log(\'Tests: 10 passed\'); process.exit(0);"';

      const result: PreflightTestResult = await runner.runPreflightTests({ command });

      expect(result.exitCode).toBe(0);
      expect(result.passed).toBe(true);
      expect(result.stdout).toContain('Tests: 10 passed');
      expect(result.testCount).toBe(10);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.markdown).toContain('## Preflight Test Execution Evidence');
      expect(result.markdown).toContain('- Status: PASSED');

      // Check persistence
      const persistPath = path.join(tmpDir, '.superconductor', 'quorum', 'preflight-test-results.json');
      expect(fs.existsSync(persistPath)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(persistPath, 'utf-8'));
      expect(saved.passed).toBe(true);
      expect(saved.exitCode).toBe(0);
      expect(saved.command).toBe(command);
      expect(saved.markdown).toBe(result.markdown);
    });

    it('captures failing command exit code, stderr, and sets passed to false', async () => {
      const runner = new QuorumPreflightTestRunner({ projectRoot: tmpDir });
      const command = 'node -e "console.error(\'Test suite failure\'); process.exit(2);"';

      const result = await runner.runPreflightTests({ command });

      expect(result.exitCode).toBe(2);
      expect(result.passed).toBe(false);
      expect(result.stderr).toContain('Test suite failure');
      expect(result.markdown).toContain('- Status: FAILED');
      expect(result.markdown).toContain('- Exit Code: 2');
    });

    it('enforces execution timeout and terminates timed-out child process', async () => {
      const runner = new QuorumPreflightTestRunner({ projectRoot: tmpDir, timeoutMs: 100 });
      // Sleep for 2 seconds (exceeding 100ms timeout)
      const command = 'node -e "setTimeout(() => {}, 2000);"';

      const result = await runner.runPreflightTests({ command, timeoutMs: 100 });

      expect(result.passed).toBe(false);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('timed out');
    });

    it('works via static QuorumPreflightTestRunner.runPreflightTests', async () => {
      const command = 'node -e "console.log(\'Static runner ok\'); process.exit(0);"';
      const result = await QuorumPreflightTestRunner.runPreflightTests({
        projectRoot: tmpDir,
        command,
      });

      expect(result.passed).toBe(true);
      expect(result.stdout).toContain('Static runner ok');
    });
  });
});
