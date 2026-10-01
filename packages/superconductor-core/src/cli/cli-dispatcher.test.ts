import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import {
  SuperconductorCliDispatcher,
  CliError,
  sanitizeTerminalInput,
  isPathInside,
  type CliCommandContext,
} from './cli-dispatcher.js';

vi.mock('../protocol/agent-context.js', () => ({
  getAgentContext: vi.fn((cwd: string) => ({
    schemaVersion: '1.0.0',
    projectRoot: cwd,
    toolRegistryStatus: 'ready',
    activeTrackId: 'test-track',
    tracks: [{ trackId: 'test-track', status: 'in_progress' }],
  })),
}));

vi.mock('../track/index.js', () => ({
  readTrackRegistry: vi.fn(() => [
    { trackId: 'track_1', status: 'completed' },
    { trackId: 'track_2', status: 'in_progress' },
  ]),
  getCompletionStats: vi.fn((_cwd: string, trackId: string) => ({
    trackId,
    totalTasks: 4,
    completedTasks: 2,
    percentComplete: 50,
  })),
  readPlan: vi.fn(() => []),
}));

vi.mock('../review/input-resolution.js', () => ({
  resolveReviewInput: vi.fn((args: string[]) => ({
    target: 'staged',
    rawArgs: args,
  })),
}));

vi.mock('../review/deterministic-preflight.js', () => ({
  runDeterministicPreflight: vi.fn(() => ({
    passed: true,
    findings: [],
  })),
}));

vi.mock('./merge-track.js', () => ({
  mergeTrack: vi.fn(async (trackBranch: string, reviewerIds: string[], opts: any) => ({
    targetBranch: opts?.targetBranch || 'main',
    mergeCommitSha: 'feedbeef',
    trailer: `Swarm-Authorized: true | reviewers: ${reviewerIds.join(',')}`,
  })),
}));

vi.mock('./learn.js', () => ({
  learnCommand: vi.fn(async () => 0),
}));

vi.mock('@superconductor/engine', () => ({
  SwarmOrchestratorCLI: class {
    executeTrack = vi.fn().mockResolvedValue({ workUnits: [{ state: 'DONE' }] });
  },
  Engine: class {
    execute = vi.fn().mockResolvedValue(undefined);
  },
}));

describe('SuperconductorCliDispatcher', () => {
  let stdoutLogs: string[];
  let stderrLogs: string[];

  const mockStdout = (msg: string) => {
    stdoutLogs.push(msg);
  };

  const mockStderr = (msg: string) => {
    stderrLogs.push(msg);
  };

  beforeEach(() => {
    stdoutLogs = [];
    stderrLogs = [];
    vi.clearAllMocks();
  });

  describe('Environment Detection (TTY vs Headless vs CI)', () => {
    it('detects interactive TTY environment when isTTY is true and CI is false', () => {
      const dispatcher = new SuperconductorCliDispatcher({
        isTTY: true,
        isCI: false,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const env = dispatcher.detectEnvironment([]);
      expect(env.isTTY).toBe(true);
      expect(env.isHeadless).toBe(false);
      expect(env.isCI).toBe(false);
    });

    it('detects headless environment when isTTY is false', () => {
      const dispatcher = new SuperconductorCliDispatcher({
        isTTY: false,
        isCI: false,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const env = dispatcher.detectEnvironment([]);
      expect(env.isTTY).toBe(false);
      expect(env.isHeadless).toBe(true);
      expect(env.isCI).toBe(false);
    });

    it('forces headless mode in CI environments regardless of TTY', () => {
      const dispatcher = new SuperconductorCliDispatcher({
        isTTY: true,
        isCI: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const env = dispatcher.detectEnvironment([]);
      expect(env.isCI).toBe(true);
      expect(env.isHeadless).toBe(true);
    });

    it('allows --headless flag override even when TTY is true', () => {
      const dispatcher = new SuperconductorCliDispatcher({
        isTTY: true,
        isCI: false,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const env = dispatcher.detectEnvironment(['--headless']);
      expect(env.isHeadless).toBe(true);
    });

    it('allows --interactive flag override even when TTY is false', () => {
      const dispatcher = new SuperconductorCliDispatcher({
        isTTY: false,
        isCI: false,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const env = dispatcher.detectEnvironment(['--interactive']);
      expect(env.isHeadless).toBe(false);
    });

    it('throws CliError when both --headless and --interactive are passed', () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(() => {
        dispatcher.detectEnvironment(['--headless', '--interactive']);
      }).toThrow(CliError);
    });

    it('does not force headless CI mode when process.env.CI is "false"', () => {
      const originalCI = process.env.CI;
      try {
        process.env.CI = 'false';
        const dispatcher = new SuperconductorCliDispatcher({
          isTTY: true,
          stdout: mockStdout,
          stderr: mockStderr,
        });

        const env = dispatcher.detectEnvironment([]);
        expect(env.isCI).toBe(false);
        expect(env.isHeadless).toBe(false);
      } finally {
        if (originalCI !== undefined) {
          process.env.CI = originalCI;
        } else {
          delete process.env.CI;
        }
      }
    });

    it('does not force headless CI mode when process.env.CI is "0"', () => {
      const originalCI = process.env.CI;
      try {
        process.env.CI = '0';
        const dispatcher = new SuperconductorCliDispatcher({
          isTTY: true,
          stdout: mockStdout,
          stderr: mockStderr,
        });

        const env = dispatcher.detectEnvironment([]);
        expect(env.isCI).toBe(false);
        expect(env.isHeadless).toBe(false);
      } finally {
        if (originalCI !== undefined) {
          process.env.CI = originalCI;
        } else {
          delete process.env.CI;
        }
      }
    });
  });

  describe('Command Registration & Inspection', () => {
    it('registers custom commands and retrieves them', () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      dispatcher.registerCommand('custom-cmd', {
        description: 'A custom command for testing',
        execute: async () => 'executed custom',
      });

      expect(dispatcher.hasCommand('custom-cmd')).toBe(true);
      expect(dispatcher.getCommand('custom-cmd')?.description).toBe('A custom command for testing');
    });

    it('supports command aliases lookup', () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      dispatcher.registerCommand('greet', {
        aliases: ['hi', 'hello'],
        description: 'Greets user',
        execute: async () => 'hello world',
      });

      expect(dispatcher.hasCommand('greet')).toBe(true);
      expect(dispatcher.hasCommand('hi')).toBe(true);
      expect(dispatcher.hasCommand('hello')).toBe(true);
      expect(dispatcher.getCommand('hi')?.name).toBe('greet');
    });

    it('lists registered commands uniquely', () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const commands = dispatcher.listCommands();
      const names = commands.map((c) => c.name);

      expect(names).toContain('context');
      expect(names).toContain('status');
      expect(names).toContain('implement');
      expect(names).toContain('orchestrate');
      expect(names).toContain('review');
      expect(names).toContain('merge-track');
      expect(names).toContain('learn');
      expect(names).toContain('phase');
    });
  });

  describe('Help Formatting', () => {
    it('formats unified global help text with commands and options', () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const help = dispatcher.formatHelp();
      expect(help).toContain('Superconductor Universal CLI');
      expect(help).toContain('Usage:');
      expect(help).toContain('Commands:');
      expect(help).toContain('context');
      expect(help).toContain('phase');
      expect(help).toContain('--headless');
    });

    it('formats command-specific help with usage and options', () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const help = dispatcher.formatCommandHelp('review');
      expect(help).toContain('Command: superconductor review');
      expect(help).toContain('Run deterministic preflight review');
      expect(help).toContain('--staged');
    });

    it('outputs help and exits cleanly when --help is dispatched', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const result = await dispatcher.dispatch(['--help']);
      expect(typeof result).toBe('string');
      expect(stdoutLogs.join('\n')).toContain('Superconductor Universal CLI');
    });

    it('outputs subcommand help when subcommand is followed by --help', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const result = await dispatcher.dispatch(['phase', '--help']);
      expect(typeof result).toBe('string');
      expect(stdoutLogs.join('\n')).toContain('Command: superconductor phase');
    });

    it('sanitizes terminal escape codes in formatCommandHelp', () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const help = dispatcher.formatCommandHelp('\x1b[31minvalid-cmd\x1b[0m');
      expect(help).toContain('Command "invalid-cmd" not found');
      expect(help).not.toContain('\x1b[');
    });
  });

  describe('Error Boundaries & Error Handling', () => {
    it('throws CliError on unknown commands and logs to stderr', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      await expect(dispatcher.dispatch(['unknown-command-xyz'])).rejects.toThrow(CliError);
      expect(stderrLogs.some((l) => l.includes('Unknown command: "unknown-command-xyz"'))).toBe(
        true
      );
    });

    it('sanitizes terminal escape codes in error messages on unknown commands', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      await expect(dispatcher.dispatch(['\x1b[31mevil-command\x1b[0m'])).rejects.toThrow(CliError);
      expect(stderrLogs.some((l) => l.includes('Unknown command: "evil-command"'))).toBe(true);
      expect(stderrLogs.every((l) => !l.includes('\x1b['))).toBe(true);
    });

    it('returns error result when catchErrors is true instead of throwing', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        catchErrors: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const result = await dispatcher.dispatch(['unknown-command-xyz']);
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeInstanceOf(CliError);
    });

    it('catches CliError when catchErrors is true on error-throwing subcommands without killing process', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        catchErrors: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      // merge-track with missing args throws CliError
      const resMerge = await dispatcher.dispatch(['merge-track']);
      expect(resMerge.success).toBe(false);
      expect(resMerge.exitCode).toBe(1);
      expect(resMerge.error.message).toContain('Usage: merge-track');

      // swarm-execute with missing args throws CliError
      const resSwarm = await dispatcher.dispatch(['swarm-execute']);
      expect(resSwarm.success).toBe(false);
      expect(resSwarm.exitCode).toBe(1);
      expect(resSwarm.error.message).toContain('Missing track-id');

      // infer-permissions with missing args throws CliError
      const resInfer = await dispatcher.dispatch(['infer-permissions']);
      expect(resInfer.success).toBe(false);
      expect(resInfer.exitCode).toBe(1);
      expect(resInfer.error.message).toContain('Usage: superconductor infer-permissions');
    });

    it('throws CliError when infer-permissions destination path escapes workspace root', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        cwd: '/safe/workspace',
        catchErrors: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch([
        'infer-permissions',
        'spec.md',
        '../../outside/manifest.toml',
      ]);
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.error.message).toContain('Target path escapes workspace boundary');
    });

    it('throws CliError when infer-permissions spec path escapes workspace boundary (relative or absolute)', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        cwd: '/safe/workspace',
        catchErrors: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const resRel = await dispatcher.dispatch([
        'infer-permissions',
        '../outside/spec.md',
        'manifest.toml',
      ]);
      expect(resRel.success).toBe(false);
      expect(resRel.exitCode).toBe(1);
      expect(resRel.error.message).toContain('Spec path escapes workspace boundary');

      const resAbs = await dispatcher.dispatch([
        'infer-permissions',
        '/etc/hosts',
        'manifest.toml',
      ]);
      expect(resAbs.success).toBe(false);
      expect(resAbs.exitCode).toBe(1);
      expect(resAbs.error.message).toContain('Spec path escapes workspace boundary');
    });

    it('throws CliError when infer-permissions destination path attempts sibling directory prefix bypass', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        cwd: '/safe/workspace',
        catchErrors: true,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch([
        'infer-permissions',
        'spec.md',
        '../workspace-sibling/manifest.toml',
      ]);
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.error.message).toContain('Target path escapes workspace boundary');
    });

    it('catches runtime errors inside command execution and surfaces CliError', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      dispatcher.registerCommand('buggy', {
        description: 'Command that throws',
        execute: async () => {
          throw new Error('Explosion inside command');
        },
      });

      await expect(dispatcher.dispatch(['buggy'])).rejects.toThrow(CliError);
      expect(stderrLogs.some((l) => l.includes('Explosion inside command'))).toBe(true);
    });
  });

  describe('Built-in Command Routing', () => {
    it('dispatches "context" command by default when no args are provided', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch([]);
      expect(res.schemaVersion).toBe('1.0.0');
      expect(stdoutLogs.some((l) => l.includes('Superconductor Core Context'))).toBe(true);
    });

    it('dispatches "context" with --json flag', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch(['context', '--json']);
      expect(res.schemaVersion).toBe('1.0.0');
      const output = stdoutLogs.join('\n');
      expect(JSON.parse(output).schemaVersion).toBe('1.0.0');
    });

    it('dispatches "status" without track ID', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch(['status']);
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBe(2);
    });

    it('dispatches "status" with track ID', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch(['status', 'track_1']);
      expect(res.trackId).toBe('track_1');
      expect(res.percentComplete).toBe(50);
    });

    it('dispatches "track status" via alias', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch(['track', 'status', 'track_1']);
      expect(res.trackId).toBe('track_1');
      expect(res.percentComplete).toBe(50);
    });

    it('dispatches "review" command', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch(['review', '--staged']);
      expect(res.input.target).toBe('staged');
      expect(res.preflight.passed).toBe(true);
    });

    it('dispatches "merge-track" command', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch([
        'merge-track',
        'track/feat',
        'rev-sec',
        '--target=dev',
      ]);
      expect(res.targetBranch).toBe('dev');
      expect(res.mergeCommitSha).toBe('feedbeef');
    });

    it('dispatches "learn" command', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch(['learn', '--list']);
      expect(res).toBe(0);
    });

    it('dispatches "phase" command', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch(['phase', 'list']);
      expect(res).toBe(0);
    });

    it('dispatches "implement" and "orchestrate" delegating to orchestrator', async () => {
      const mockOrchestrator = { run: vi.fn().mockResolvedValue({ mode: 'interactive' }) };
      const dispatcher = new SuperconductorCliDispatcher({
        interactiveOrchestrator: mockOrchestrator,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch(['implement', '--interactive', 'track-1']);
      expect(mockOrchestrator.run).toHaveBeenCalled();
      expect(res).toEqual({ mode: 'interactive' });
    });
  });

  describe('Project Root Argument Extraction', () => {
    it('extracts --project-root <path> and updates context cwd', async () => {
      let capturedCwd = '';
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      dispatcher.registerCommand('cwd-check', {
        description: 'Checks cwd',
        execute: async (_args: string[], ctx: CliCommandContext) => {
          capturedCwd = ctx.cwd;
          return capturedCwd;
        },
      });

      await dispatcher.dispatch(['--project-root', '/custom/path', 'cwd-check']);
      expect(capturedCwd).toBe(path.resolve('/custom/path'));
    });

    it('extracts --project-root=<path> syntax and updates context cwd', async () => {
      let capturedCwd = '';
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      dispatcher.registerCommand('cwd-check', {
        description: 'Checks cwd',
        execute: async (_args: string[], ctx: CliCommandContext) => {
          capturedCwd = ctx.cwd;
          return capturedCwd;
        },
      });

      await dispatcher.dispatch(['--project-root=/custom/path2', 'cwd-check']);
      expect(capturedCwd).toBe(path.resolve('/custom/path2'));
    });
  });

  describe('Static Helper dispatch Method', () => {
    it('executes via static SuperconductorCliDispatcher.dispatch', async () => {
      const res = await SuperconductorCliDispatcher.dispatch(['context', '--json'], {
        stdout: mockStdout,
        stderr: mockStderr,
      });
      expect(res.schemaVersion).toBe('1.0.0');
    });
  });

  describe('Global Options & Subcommand Precedence', () => {
    it('supports global flags before subcommand name: ["--headless", "status"]', async () => {
      let capturedEnv: any;
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      dispatcher.registerCommand('env-check', {
        description: 'Checks env',
        execute: async (_args, ctx) => {
          capturedEnv = ctx.env;
          return capturedEnv;
        },
      });

      await dispatcher.dispatch(['--headless', 'env-check']);
      expect(capturedEnv.isHeadless).toBe(true);
    });

    it('defaults to context command when only ["--headless"] is provided', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch(['--headless']);
      expect(res.schemaVersion).toBe('1.0.0');
      expect(stdoutLogs.some((l) => l.includes('Superconductor Core Context'))).toBe(true);
    });

    it('supports ["--headless", "status"] with built-in status command', async () => {
      const dispatcher = new SuperconductorCliDispatcher({
        stdout: mockStdout,
        stderr: mockStderr,
      });

      const res = await dispatcher.dispatch(['--headless', 'status']);
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBe(2);
    });
  });

  describe('sanitizeTerminalInput', () => {
    it('strips ANSI color escape sequences and OSC control sequences', () => {
      expect(sanitizeTerminalInput('\x1b[31mred\x1b[0m')).toBe('red');
      expect(sanitizeTerminalInput('\x1b]0;evil title\x07command')).toBe('command');
      expect(sanitizeTerminalInput('\x1b[2K\x1b[1Gprogress')).toBe('progress');
      expect(sanitizeTerminalInput('safe-command-123')).toBe('safe-command-123');
    });
  });

  describe('isPathInside', () => {
    it('returns true for paths inside parent workspace', () => {
      expect(isPathInside('/workspace', '/workspace/spec.md')).toBe(true);
      expect(isPathInside('/workspace', '/workspace/sub/dir/manifest.toml')).toBe(true);
      expect(isPathInside('/workspace', '/workspace')).toBe(true);
    });

    it('returns false for paths outside parent workspace or traversing upwards', () => {
      expect(isPathInside('/workspace', '/etc/hosts')).toBe(false);
      expect(isPathInside('/workspace', '/workspace-sibling/manifest.toml')).toBe(false);
      expect(isPathInside('/workspace', '/outside/file')).toBe(false);
    });
  });
});
