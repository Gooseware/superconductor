import { spawn } from 'child_process';

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

export class BackgroundTaskMonitor {
  private readonly runner?: ShellRunner;

  constructor(opts: BackgroundTaskMonitorOptions = {}) {
    this.runner = opts.shellRunner;
  }

  static createDefaultRunner(): ShellRunner {
    return {
      exec: (cmd: string): Promise<{ stdout: string; exitCode: number }> => {
        return new Promise((resolve, reject) => {
          // Use spawn with shell:true for string commands but collect output async
          const child = spawn(cmd, [], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
          let stdout = '';
          let stderr = '';
          
          child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
          child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
          child.on('close', (code: number | null) => resolve({ stdout: stdout + stderr, exitCode: code ?? 0 }));
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
      const child = spawn(cmd, [], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        reject(new TimeoutError(cmd, maxDurationMs));
      }, maxDurationMs);

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        if (BackgroundTaskMonitor.detectHungOutput(text)) {
          clearTimeout(timer);
          child.kill('SIGTERM');
          reject(new HungTaskError(cmd, text));
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
