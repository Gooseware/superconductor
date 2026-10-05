import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';

/**
 * Result of executing an ephemeral reproduction script in an isolated worktree.
 */
export interface ReproExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  failureTraces: string[];
  passed: boolean;
}

/**
 * Options for configuring the WorktreeReproHarness.
 */
export interface ReproHarnessOptions {
  projectRoot?: string;
  timeoutMs?: number;
  branchPrefix?: string;
  useWorktrunk?: boolean;
  executor?: ReproCommandExecutor;
}

/**
 * Options for a single script run.
 */
export interface RunScriptOptions {
  lang?: 'ts' | 'js' | 'sh';
  timeoutMs?: number;
}

/**
 * Command executor interface to enable isolated unit testing and mock injection.
 */
export interface ReproCommandExecutor {
  exec(
    command: string,
    options?: { cwd?: string; env?: NodeJS.ProcessEnv }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;

  spawnScript(options: {
    command: string;
    args: string[];
    cwd: string;
    timeoutMs: number;
    env?: NodeJS.ProcessEnv;
  }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
    durationMs: number;
  }>;
}

/**
 * Parses failure traces tagged between [REPRO_FAILURE_START] and [REPRO_FAILURE_END].
 * Also handles unclosed [REPRO_FAILURE_START] gracefully if output was truncated.
 */
export function parseFailureTraces(output: string): string[] {
  const traces: string[] = [];
  const regex = /\[REPRO_FAILURE_START\]([\s\S]*?)\[REPRO_FAILURE_END\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(output)) !== null) {
    const trace = match[1].trim();
    if (trace) {
      traces.push(trace);
    }
  }

  // Graceful fallback for unclosed [REPRO_FAILURE_START] tag (e.g. abrupt exit/timeout)
  if (traces.length === 0 && output.includes('[REPRO_FAILURE_START]')) {
    const startIndex = output.indexOf('[REPRO_FAILURE_START]') + '[REPRO_FAILURE_START]'.length;
    const unclosed = output.slice(startIndex).trim();
    if (unclosed) {
      traces.push(unclosed);
    }
  }

  return traces;
}

/**
 * Default child_process based executor for real environments.
 */
class DefaultReproCommandExecutor implements ReproCommandExecutor {
  async exec(
    command: string,
    options?: { cwd?: string; env?: NodeJS.ProcessEnv }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      child_process.exec(
        command,
        {
          cwd: options?.cwd,
          env: { ...process.env, CI: '1', ...options?.env },
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          resolve({
            stdout: stdout ? stdout.toString() : '',
            stderr: stderr ? stderr.toString() : '',
            exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
          });
        }
      );
    });
  }

  async spawnScript(options: {
    command: string;
    args: string[];
    cwd: string;
    timeoutMs: number;
    env?: NodeJS.ProcessEnv;
  }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
    durationMs: number;
  }> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let timedOut = false;
      let stdout = '';
      let stderr = '';

      const child = child_process.spawn(options.command, options.args, {
        cwd: options.cwd,
        env: { ...process.env, CI: '1', ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout?.on('data', (data) => {
        stdout += data.toString('utf8');
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString('utf8');
      });

      let timer: NodeJS.Timeout | undefined;
      if (options.timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
        }, options.timeoutMs);
      }

      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        stderr += `\nProcess execution error: ${err.message}`;
        resolve({
          stdout,
          stderr,
          exitCode: 1,
          timedOut,
          durationMs,
        });
      });

      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        resolve({
          stdout,
          stderr,
          exitCode: timedOut ? 124 : (code ?? 0),
          timedOut,
          durationMs,
        });
      });
    });
  }
}

/**
 * Ephemeral Worktree Reproduction Harness.
 *
 * Grounded in adversarial_execution_dogma.md:
 * - Allocates an ephemeral isolated git worktree via worktrunk (wt) or git worktree.
 * - Writes the reproduction script into the worktree (repro.ts / repro.js / repro.sh).
 * - Executes the script with a hard timeout (default 30s).
 * - Captures stdout, stderr, exit code, and parses [REPRO_FAILURE_START]...[REPRO_FAILURE_END].
 * - ALWAYS cleans up and removes the worktree in a finally block to eliminate workspace pollution.
 */
export class WorktreeReproHarness {
  readonly projectRoot: string;
  readonly defaultTimeoutMs: number;
  readonly branchPrefix: string;
  private readonly useWorktrunk: boolean;
  private readonly executor: ReproCommandExecutor;
  private readonly isDefaultExecutor: boolean;

  constructor(options?: ReproHarnessOptions) {
    this.projectRoot = options?.projectRoot ?? process.cwd();
    this.defaultTimeoutMs = options?.timeoutMs ?? 30000;
    this.branchPrefix = options?.branchPrefix ?? 'repro-';
    this.useWorktrunk = options?.useWorktrunk ?? false;
    if (options?.executor) {
      this.executor = options.executor;
      this.isDefaultExecutor = false;
    } else {
      this.executor = new DefaultReproCommandExecutor();
      this.isDefaultExecutor = true;
    }
  }

  /**
   * Executes a reproduction script in an ephemeral isolated git worktree.
   */
  async runScript(
    scriptSource: string,
    options?: RunScriptOptions
  ): Promise<ReproExecutionResult> {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const branchName = `${this.branchPrefix}${runId}`;
    let worktreeDir = path.resolve(this.projectRoot, '.worktrees', branchName);
    let usedWorktrunk = false;

    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const lang = options?.lang ?? 'ts';

    try {
      // 1. Allocate ephemeral worktree
      if (this.useWorktrunk) {
        const wtRes = await this.executor.exec(
          `wt switch --create "${branchName}"`,
          { cwd: this.projectRoot }
        );
        if (wtRes.exitCode === 0) {
          usedWorktrunk = true;
          // In worktrunk, check if directory can be extracted from wt list or default
          worktreeDir = await this.resolveWtWorktreePath(branchName, worktreeDir);
        }
      }

      if (!usedWorktrunk) {
        // Fallback or default: native git worktree
        try {
          fs.mkdirSync(path.join(this.projectRoot, '.worktrees'), { recursive: true });
        } catch {
          // ignore in mock environments
        }
        await this.executor.exec(
          `git worktree add --force -b "${branchName}" "${worktreeDir}" HEAD`,
          { cwd: this.projectRoot }
        );
      }

      // 2. Symlink root node_modules if present and worktree exists on disk
      try {
        const rootNodeModules = path.join(this.projectRoot, 'node_modules');
        const targetNodeModules = path.join(worktreeDir, 'node_modules');
        if (fs.existsSync(worktreeDir) && fs.existsSync(rootNodeModules) && !fs.existsSync(targetNodeModules)) {
          fs.symlinkSync(rootNodeModules, targetNodeModules, 'junction');
        }
      } catch {
        // ignore symlink errors
      }

      // 3. Determine file name and launch command based on language
      let scriptFileName = 'repro.ts';
      let executable = 'npx';
      let args = ['tsx', 'repro.ts'];

      if (lang === 'js') {
        scriptFileName = 'repro.js';
        executable = 'node';
        args = ['repro.js'];
      } else if (lang === 'sh') {
        scriptFileName = 'repro.sh';
        executable = 'bash';
        args = ['repro.sh'];
      } else {
        // ts
        scriptFileName = 'repro.ts';
        const localTsx = path.join(this.projectRoot, 'node_modules', '.bin', 'tsx');
        if (fs.existsSync(localTsx)) {
          executable = localTsx;
          args = ['repro.ts'];
        } else {
          executable = 'npx';
          args = ['tsx', 'repro.ts'];
        }
      }

      // 4. Write reproduction script to disk in worktree
      const scriptPath = path.join(worktreeDir, scriptFileName);
      try {
        if (!fs.existsSync(worktreeDir)) {
          fs.mkdirSync(worktreeDir, { recursive: true });
        }
        fs.writeFileSync(scriptPath, scriptSource, { encoding: 'utf8', mode: 0o755 });
      } catch (err) {
        if (this.isDefaultExecutor) {
          throw err;
        }
        // If executor is mocked, allow execution to proceed without filesystem dependency
      }

      // 5. Spawn execution
      const spawnResult = await this.executor.spawnScript({
        command: executable,
        args,
        cwd: worktreeDir,
        timeoutMs,
      });

      // 6. Parse failure traces from combined output
      const combinedOutput = `${spawnResult.stdout}\n${spawnResult.stderr}`;
      const failureTraces = parseFailureTraces(combinedOutput);

      const passed =
        spawnResult.exitCode === 0 &&
        !spawnResult.timedOut &&
        failureTraces.length === 0;

      return {
        exitCode: spawnResult.exitCode,
        stdout: spawnResult.stdout,
        stderr: spawnResult.stderr,
        timedOut: spawnResult.timedOut,
        durationMs: spawnResult.durationMs,
        failureTraces,
        passed,
      };
    } finally {
      // 7. ALWAYS clean up worktree and delete ephemeral branch
      try {
        if (usedWorktrunk) {
          await this.executor.exec(`wt remove "${branchName}" --force`, { cwd: this.projectRoot });
        }
      } catch {
        // ignore
      }

      try {
        await this.executor.exec(`git worktree remove --force "${worktreeDir}"`, { cwd: this.projectRoot });
      } catch {
        // ignore
      }

      try {
        await this.executor.exec(`git branch -D "${branchName}"`, { cwd: this.projectRoot });
      } catch {
        // ignore
      }

      try {
        await this.executor.exec(`git worktree prune`, { cwd: this.projectRoot });
      } catch {
        // ignore
      }

      // Final filesystem sweep
      try {
        if (fs.existsSync(worktreeDir)) {
          fs.rmSync(worktreeDir, { recursive: true, force: true });
        }
      } catch {
        // ignore
      }
    }
  }

  /**
   * Helper to locate worktree path when using worktrunk.
   */
  private async resolveWtWorktreePath(branch: string, defaultPath: string): Promise<string> {
    try {
      const res = await this.executor.exec('wt list --format=json', { cwd: this.projectRoot });
      if (res.exitCode === 0) {
        const jsonStart = res.stdout.indexOf('{');
        const jsonEnd = res.stdout.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          const parsed = JSON.parse(res.stdout.slice(jsonStart, jsonEnd + 1));
          if (Array.isArray(parsed?.items)) {
            const item = parsed.items.find((i: any) => i.branch === branch);
            if (item?.worktree?.path) {
              return item.worktree.path;
            }
          }
        }
      }
    } catch {
      // fallback
    }
    return defaultPath;
  }
}
