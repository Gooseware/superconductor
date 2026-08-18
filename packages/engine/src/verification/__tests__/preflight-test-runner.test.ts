import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';
import { PreflightTestRunner } from '../preflight-test-runner.js';
import { EventEmitter } from 'node:events';

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  default: {
    spawn: vi.fn(),
    execSync: vi.fn(),
  },
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

describe('PreflightTestRunner', () => {
  let runner: PreflightTestRunner;
  let mockSpawn: any;
  let mockExecSync: any;

  beforeEach(() => {
    vi.resetAllMocks();
    runner = new PreflightTestRunner({ projectRoot: '/mock/root' });
    runner.clearCache();
    mockSpawn = vi.mocked(child_process.spawn);
    mockExecSync = vi.mocked(child_process.execSync);
    
    // Default tree hash
    mockExecSync.mockReturnValue('mock-tree-hash\n');

    // Default package.json
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      scripts: {
        test: 'vitest run',
        build: 'tsc'
      }
    }));
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockProcess = (exitCode: number, output: string, delay: number = 0) => {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn();

    setTimeout(() => {
      if (output) {
        proc.stdout.emit('data', Buffer.from(output));
      }
      proc.emit('close', exitCode);
    }, delay);

    return proc;
  };

  it('detects test command from package.json with scripts.test present', () => {
    const runnerAny = runner as any;
    const cmd = runnerAny.detectTestCommand({ scripts: { test: 'vitest run' } });
    expect(cmd).toBe('npm run test');
  });

  it('test command detection fallback chain (vitest -> jest -> npm test)', () => {
    const runnerAny = runner as any;
    expect(runnerAny.detectTestCommand({ scripts: { vitest: 'vitest' } })).toBe('npm run vitest');
    expect(runnerAny.detectTestCommand({ scripts: { jest: 'jest' } })).toBe('npm run jest');
    expect(runnerAny.detectTestCommand({ scripts: {} })).toBe('npm test');
  });

  it('build command detection fallback chain (build -> typecheck -> tsc)', () => {
    const runnerAny = runner as any;
    expect(runnerAny.detectBuildCommand({ scripts: { build: 'tsc' } })).toBe('npm run build');
    expect(runnerAny.detectBuildCommand({ scripts: { typecheck: 'tsc --noEmit' } })).toBe('npm run typecheck');
    expect(runnerAny.detectBuildCommand({ scripts: { tsc: 'tsc' } })).toBe('npm run tsc');
    expect(runnerAny.detectBuildCommand({ scripts: {} })).toBe('npm run build');
  });

  it('successful run returns TestReport with passed: true', async () => {
    mockSpawn.mockImplementation((cmd: any, args: any) => {
      return createMockProcess(0, 'success output');
    });

    const report = await runner.run();
    expect(report.passed).toBe(true);
    expect(report.testExitCode).toBe(0);
    expect(report.buildExitCode).toBe(0);
    expect(report.testOutput).toContain('success output');
    expect(report.buildOutput).toContain('success output');
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('one command failing returns passed: false', async () => {
    mockSpawn.mockImplementation((cmd: any, args: any) => {
      const isTest = args.includes('test');
      return createMockProcess(isTest ? 1 : 0, 'output');
    });

    const report = await runner.run();
    expect(report.passed).toBe(false);
    expect(report.testExitCode).toBe(1);
    expect(report.buildExitCode).toBe(0);
  });

  it('timeout exceeded returns non-zero exit code and passed: false', async () => {
    runner = new PreflightTestRunner({ projectRoot: '/mock/root', timeoutMs: 50 });
    
    mockSpawn.mockImplementation((cmd: any, args: any) => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = vi.fn(() => {
        proc.emit('close', null, 'SIGTERM'); // Simulate kill
      });
      return proc; // Never closes on its own
    });

    const report = await runner.run();
    expect(report.passed).toBe(false);
    expect(report.testExitCode).not.toBe(0); // typically -1 or similar for killed
    expect(report.testOutput).toContain('Timeout');
  });

  it('output trimmed to 8000 chars', async () => {
    const longOutput = 'A'.repeat(10000);
    mockSpawn.mockImplementation(() => createMockProcess(0, longOutput));

    const report = await runner.run();
    expect(report.testOutput.length).toBeLessThanOrEqual(8000);
    expect(report.buildOutput.length).toBeLessThanOrEqual(8000);
  });

  it('cache hit on same git tree-hash returns in < 50 ms without re-executing commands', async () => {
    mockSpawn.mockImplementation(() => createMockProcess(0, 'output', 20));

    // First run
    const report1 = await runner.run();
    expect(mockSpawn).toHaveBeenCalledTimes(2); // 1 for test, 1 for build
    mockSpawn.mockClear();

    // Second run with same tree hash
    const start = Date.now();
    const report2 = await runner.run();
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(50);
    expect(mockSpawn).toHaveBeenCalledTimes(0);
    expect(report2).toEqual(report1);
  });

  it('different git tree-hash triggers fresh execution', async () => {
    mockSpawn.mockImplementation(() => createMockProcess(0, 'output'));

    // First run
    mockExecSync.mockReturnValueOnce('hash-1\n');
    await runner.run();
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    mockSpawn.mockClear();

    // Second run
    mockExecSync.mockReturnValueOnce('hash-2\n');
    await runner.run();
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });
});
