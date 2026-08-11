import { spawn, ChildProcess } from 'child_process';

export class TimeoutError extends Error {
  constructor(public readonly cmd: string, public readonly maxDurationMs: number) {
    super(`Task timed out after ${maxDurationMs}ms: ${cmd}`);
    this.name = 'TimeoutError';
  }
}

export class HungTaskError extends Error {
  constructor(public readonly cmd: string, public readonly hungOutput: string) {
    super(`Task hung on interactive prompt: ${cmd}`);
    this.name = 'HungTaskError';
  }
}

const HUNG_PATTERNS = [
  /Press\s+Ctrl[+\-]C/i,
  /press\s+any\s+key/i,
  /\[Y\/n\]/,
  /\[y\/N\]/,
  /Enter\s+password/i,
  /Password:/i,
  /waiting\s+for\s+input/i,
];

export interface ShellRunner {
  exec(cmd: string): Promise<{ stdout: string; exitCode: number }>;
}

export interface BackgroundTaskMonitorOptions {
  shellRunner?: ShellRunner;
}

export const MAX_BUFFER = 1_048_576; // 1MB

export function appendWithLimit(existing: string, incoming: string, maxLen: number): string {
  const combined = existing + incoming;
  if (combined.length > maxLen) {
    return combined.slice(-maxLen);
  }
  return combined;
}

export function killProcessGroup(child: ChildProcess): void {
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  } else {
    child.kill('SIGKILL');
  }
}

export class BackgroundTaskMonitor {
  private readonly runner?: ShellRunner;

  constructor(opts: BackgroundTaskMonitorOptions = {}) {
    this.runner = opts.shellRunner;
  }

  static createDefaultRunner(): ShellRunner {
    return {
      exec: (cmd: string): Promise<{ stdout: string; exitCode: number }> => {
        return new Promise((resolve, reject) => {
          const child = spawn(cmd, [], { shell: true, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
          let stdout = '';
          let stderr = '';
          
          child.stdout?.on('data', (chunk: Buffer) => { stdout = appendWithLimit(stdout, chunk.toString(), MAX_BUFFER); });
          child.stderr?.on('data', (chunk: Buffer) => { stderr = appendWithLimit(stderr, chunk.toString(), MAX_BUFFER); });
          child.on('close', (code: number | null) => resolve({ stdout: appendWithLimit(stdout, stderr, MAX_BUFFER), exitCode: code ?? 0 }));
          child.on('error', reject);
        });
      },
    };
  }

  static detectHungOutput(output: string): boolean {
    return HUNG_PATTERNS.some(p => p.test(output));
  }

  async launch(
    cmd: string,
    opts: { maxDurationMs?: number } = {},
  ): Promise<{ stdout: string; exitCode: number }> {
    const { maxDurationMs = 1_800_000 } = opts;

    if (this.runner) {
      const taskPromise = this.runner.exec(cmd);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(cmd, maxDurationMs)), maxDurationMs);
      });

      try {
        const result = await Promise.race([taskPromise, timeoutPromise]);
        if (BackgroundTaskMonitor.detectHungOutput(result.stdout)) {
          throw new HungTaskError(cmd, result.stdout);
        }
        return result;
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    }

    return new Promise((resolve, reject) => {
      const child = spawn(cmd, [], { shell: true, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      let stdout = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        killProcessGroup(child);
        reject(new TimeoutError(cmd, maxDurationMs));
      }, maxDurationMs);

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        stdout = appendWithLimit(stdout, text, MAX_BUFFER);
        const window = stdout.slice(-512);
        if (BackgroundTaskMonitor.detectHungOutput(window)) {
          clearTimeout(timer);
          killProcessGroup(child);
          reject(new HungTaskError(cmd, window));
        }
      };

      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);

      child.on('close', (code: number | null) => {
        if (!timedOut) {
          clearTimeout(timer);
          resolve({ stdout, exitCode: code ?? 0 });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

