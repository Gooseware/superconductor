import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type SandboxRuntime = 'node' | 'tsx' | 'bash';

export interface EphemeralProcessOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  args?: string[];
  cleanUpCwd?: boolean;
  sigkillGraceMs?: number;
  runtime?: SandboxRuntime;
  maxBufferBytes?: number;
}

export interface EphemeralExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
  error?: Error;
}

export class EphemeralProcessSandbox {
  private defaultOptions: EphemeralProcessOptions;

  constructor(defaultOptions: EphemeralProcessOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Spawns an isolated process running a script file with strict timeout bounds,
   * process group cleanup, and stdout/stderr capture.
   */
  public async runScript(
    scriptPath: string,
    options: EphemeralProcessOptions = {}
  ): Promise<EphemeralExecutionResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const timeoutMs = mergedOptions.timeoutMs ?? 10000;
    const sigkillGraceMs = mergedOptions.sigkillGraceMs ?? 500;
    const maxBufferBytes = mergedOptions.maxBufferBytes ?? 10 * 1024 * 1024;
    const extraArgs = mergedOptions.args ?? [];

    let cwd = mergedOptions.cwd;
    let createdCwd = false;

    if (!cwd) {
      cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-sandbox-'));
      createdCwd = true;
    }

    const runtime = mergedOptions.runtime ?? this.detectRuntime(scriptPath);
    const { command, args } = this.buildCommand(runtime, scriptPath, extraArgs);

    const startTime = Date.now();
    let timedOut = false;
    let stdout = '';
    let stderr = '';
    let executionError: Error | undefined;

    return new Promise<EphemeralExecutionResult>((resolve) => {
      let termTimer: NodeJS.Timeout | null = null;
      let killTimer: NodeJS.Timeout | null = null;
      let finished = false;

      const isPosix = process.platform !== 'win32';
      let child: childProcess.ChildProcess;

      try {
        child = childProcess.spawn(command, args, {
          cwd,
          env: { ...process.env, ...mergedOptions.env },
          detached: isPosix,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        if (createdCwd && mergedOptions.cleanUpCwd !== false) {
          try {
            fs.rmSync(cwd, { recursive: true, force: true });
          } catch {
            // ignore cleanup failure
          }
        }
        resolve({
          stdout: '',
          stderr: '',
          exitCode: 1,
          signal: null,
          timedOut: false,
          durationMs: Date.now() - startTime,
          error: err instanceof Error ? err : new Error(String(err)),
        });
        return;
      }

      const killProcessGroup = (signal: NodeJS.Signals) => {
        if (!child.pid) return;
        try {
          if (isPosix) {
            process.kill(-child.pid, signal);
          } else {
            child.kill(signal);
          }
        } catch {
          // Process or process group may already have terminated
        }
      };

      const cleanupTimers = () => {
        if (termTimer) {
          clearTimeout(termTimer);
          termTimer = null;
        }
        if (killTimer) {
          clearTimeout(killTimer);
          killTimer = null;
        }
      };

      if (timeoutMs > 0) {
        termTimer = setTimeout(() => {
          timedOut = true;
          killProcessGroup('SIGTERM');

          killTimer = setTimeout(() => {
            killProcessGroup('SIGKILL');
          }, sigkillGraceMs);
        }, timeoutMs);
      }

      if (child.stdout) {
        child.stdout.on('data', (chunk: Buffer) => {
          if (stdout.length < maxBufferBytes) {
            stdout += chunk.toString('utf-8');
            if (stdout.length > maxBufferBytes) {
              stdout = stdout.slice(0, maxBufferBytes) + '\n... [output truncated]';
            }
          }
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (chunk: Buffer) => {
          if (stderr.length < maxBufferBytes) {
            stderr += chunk.toString('utf-8');
            if (stderr.length > maxBufferBytes) {
              stderr = stderr.slice(0, maxBufferBytes) + '\n... [output truncated]';
            }
          }
        });
      }

      child.on('error', (err: Error) => {
        executionError = err;
      });

      child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        if (finished) return;
        finished = true;
        cleanupTimers();

        const durationMs = Date.now() - startTime;

        if (createdCwd && mergedOptions.cleanUpCwd !== false) {
          try {
            fs.rmSync(cwd, { recursive: true, force: true });
          } catch {
            // ignore cleanup failure
          }
        }

        resolve({
          stdout,
          stderr,
          exitCode: code,
          signal,
          timedOut,
          durationMs,
          error: executionError,
        });
      });
    });
  }

  /**
   * Spawns an isolated process running an inline script snippet.
   * Writes code to a temporary file in the sandbox directory and runs it.
   */
  public async runInline(
    code: string,
    runtime: SandboxRuntime = 'node',
    options: EphemeralProcessOptions = {}
  ): Promise<EphemeralExecutionResult> {
    const cwd = options.cwd ?? fs.mkdtempSync(path.join(os.tmpdir(), 'sc-sandbox-'));
    const isTempCwd = !options.cwd;

    const ext = runtime === 'tsx' ? '.ts' : runtime === 'bash' ? '.sh' : '.js';
    const tempFile = path.join(cwd, `ephemeral_repro_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`);

    try {
      fs.writeFileSync(tempFile, code, 'utf-8');
      if (runtime === 'bash') {
        fs.chmodSync(tempFile, 0o755);
      }

      const result = await this.runScript(tempFile, {
        ...options,
        cwd,
        runtime,
        cleanUpCwd: false,
      });

      return result;
    } finally {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch {
        // ignore unlink error
      }

      if (isTempCwd && options.cleanUpCwd !== false) {
        try {
          fs.rmSync(cwd, { recursive: true, force: true });
        } catch {
          // ignore rm error
        }
      }
    }
  }

  private detectRuntime(scriptPath: string): SandboxRuntime {
    const ext = path.extname(scriptPath).toLowerCase();
    if (ext === '.ts' || ext === '.tsx') return 'tsx';
    if (ext === '.sh' || ext === '.bash') return 'bash';
    return 'node';
  }

  private buildCommand(
    runtime: SandboxRuntime,
    scriptPath: string,
    extraArgs: string[]
  ): { command: string; args: string[] } {
    switch (runtime) {
      case 'bash':
        return {
          command: '/bin/bash',
          args: [scriptPath, ...extraArgs],
        };
      case 'tsx':
        return {
          command: 'npx',
          args: ['-y', 'tsx', scriptPath, ...extraArgs],
        };
      case 'node':
      default:
        return {
          command: process.execPath,
          args: [scriptPath, ...extraArgs],
        };
    }
  }
}
