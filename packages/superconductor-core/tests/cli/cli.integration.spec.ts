import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import {
  SuperconductorCliDispatcher,
  CliError,
  sanitizeTerminalInput,
} from '../../src/cli/cli-dispatcher.js';

describe('CLI Integration (End-to-End Headless vs Interactive Dispatch)', () => {
  let mockInteractiveOrchestrator: { run: ReturnType<typeof vi.fn> };
  let mockHeadlessOrchestrator: { run: ReturnType<typeof vi.fn> };
  let stdoutLogs: string[];
  let stderrLogs: string[];

  const mockStdout = (msg: string) => {
    stdoutLogs.push(msg);
  };

  const mockStderr = (msg: string) => {
    stderrLogs.push(msg);
  };

  beforeEach(() => {
    mockInteractiveOrchestrator = { run: vi.fn().mockResolvedValue({ mode: 'interactive' }) };
    mockHeadlessOrchestrator = { run: vi.fn().mockResolvedValue({ mode: 'headless' }) };
    stdoutLogs = [];
    stderrLogs = [];
    vi.clearAllMocks();
  });

  describe('End-to-End Orchestrator Dispatching', () => {
    it('dispatches to InteractiveOrchestrator in TTY environment without explicit flags', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        isTTY: true,
        interactiveOrchestrator: mockInteractiveOrchestrator,
        headlessOrchestrator: mockHeadlessOrchestrator,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.runOrchestrator(['track-1']);
      expect(mockInteractiveOrchestrator.run).toHaveBeenCalledWith(['track-1']);
      expect(mockHeadlessOrchestrator.run).not.toHaveBeenCalled();
      expect(res).toEqual({ mode: 'interactive' });
    });

    it('dispatches to HeadlessOrchestrator in non-TTY environment without explicit flags', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        isTTY: false,
        interactiveOrchestrator: mockInteractiveOrchestrator,
        headlessOrchestrator: mockHeadlessOrchestrator,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.runOrchestrator(['track-1']);
      expect(mockHeadlessOrchestrator.run).toHaveBeenCalledWith(['track-1']);
      expect(mockInteractiveOrchestrator.run).not.toHaveBeenCalled();
      expect(res).toEqual({ mode: 'headless' });
    });

    it('forces HeadlessOrchestrator when --headless is passed before or after command', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        isTTY: true,
        interactiveOrchestrator: mockInteractiveOrchestrator,
        headlessOrchestrator: mockHeadlessOrchestrator,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      // Passed as flag to runOrchestrator
      const res = await dispatcher.runOrchestrator(['--headless', 'track-1']);
      expect(mockHeadlessOrchestrator.run).toHaveBeenCalledWith(['--headless', 'track-1']);
      expect(res).toEqual({ mode: 'headless' });
    });

    it('forces InteractiveOrchestrator when --interactive is passed in non-TTY', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        isTTY: false,
        interactiveOrchestrator: mockInteractiveOrchestrator,
        headlessOrchestrator: mockHeadlessOrchestrator,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.runOrchestrator(['--interactive', 'track-1']);
      expect(mockInteractiveOrchestrator.run).toHaveBeenCalledWith(['--interactive', 'track-1']);
      expect(res).toEqual({ mode: 'interactive' });
    });

    it('forces HeadlessOrchestrator when CI environment is active regardless of TTY', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        isTTY: true,
        isCI: true,
        interactiveOrchestrator: mockInteractiveOrchestrator,
        headlessOrchestrator: mockHeadlessOrchestrator,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.runOrchestrator(['track-ci']);
      expect(mockHeadlessOrchestrator.run).toHaveBeenCalledWith(['track-ci']);
      expect(res).toEqual({ mode: 'headless' });
    });
  });

  describe('End-to-End Command Routing with Global Flags', () => {
    it('dispatches status command with leading --headless flag: ["--headless", "status"]', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        isTTY: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const result = await dispatcher.dispatch(['--headless', 'status']);
      expect(result).toBeDefined();
    });

    it('defaults to context command when given only ["--headless"]', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        isTTY: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const result = await dispatcher.dispatch(['--headless']);
      expect(result).toBeDefined();
      expect(stdoutLogs.some((l) => l.includes('Superconductor Core Context'))).toBe(true);
    });

    it('parses --project-root and executes command within specified directory', async () => {
      let resolvedDir = '';
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      dispatcher.registerCommand('test-cwd', {
        description: 'Verifies cwd resolution',
        execute: async (_args, ctx) => {
          resolvedDir = ctx.cwd;
          return { cwd: ctx.cwd };
        },
      });

      await dispatcher.dispatch(['--project-root', '/tmp/custom-root', 'test-cwd']);
      expect(resolvedDir).toBe(path.resolve('/tmp/custom-root'));
    });
  });

  describe('Security & Error Boundaries Integration', () => {
    it('strips terminal escape injection sequences from unknown command error output', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        catchErrors: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const maliciousInput = '\x1b[31;1mrm -rf /\x1b[0m';
      const result = await dispatcher.dispatch([maliciousInput]);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error.message).toContain('Unknown command: "rm -rf /"');
      expect(result.error.message).not.toContain('\x1b[');
      expect(stderrLogs.every((log) => !log.includes('\x1b['))).toBe(true);
    });

    it('catches subcommand errors gracefully with catchErrors: true without killing process', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        catchErrors: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch(['merge-track']);
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.error).toBeInstanceOf(CliError);
    });

    it('blocks directory traversal in infer-permissions subcommand', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        cwd: '/var/app/project',
        catchErrors: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch([
        'infer-permissions',
        'spec.md',
        '../../../../etc/shadow',
      ]);

      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.error.message).toContain('Target path escapes workspace boundary');
    });

    it('blocks spec read traversal outside workspace in infer-permissions subcommand', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        cwd: '/var/app/project',
        catchErrors: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      // Relative traversal
      const resRel = await dispatcher.dispatch([
        'infer-permissions',
        '../../outside/spec.md',
        'valid/manifest.toml',
      ]);
      expect(resRel.success).toBe(false);
      expect(resRel.exitCode).toBe(1);
      expect(resRel.error.message).toContain('Spec path escapes workspace boundary');

      // Absolute traversal
      const resAbs = await dispatcher.dispatch([
        'infer-permissions',
        '/etc/hosts',
        'valid/manifest.toml',
      ]);
      expect(resAbs.success).toBe(false);
      expect(resAbs.exitCode).toBe(1);
      expect(resAbs.error.message).toContain('Spec path escapes workspace boundary');
    });

    it('blocks sibling directory prefix bypass in infer-permissions subcommand', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        cwd: '/var/app/project',
        catchErrors: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch([
        'infer-permissions',
        'spec.md',
        '../project-sibling/manifest.toml',
      ]);

      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.error.message).toContain('Target path escapes workspace boundary');
    });
  });
});
