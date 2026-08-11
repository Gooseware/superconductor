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
  private readonly runner: ShellRunner;

  constructor(opts: BackgroundTaskMonitorOptions = {}) {
    this.runner = opts.shellRunner ?? {
      exec: async (cmd: string) => {
        const { execSync } = await import('child_process');
        try {
          const stdout = execSync(cmd, { encoding: 'utf8', timeout: 0 });
          return { stdout, exitCode: 0 };
        } catch (e: any) {
          return { stdout: e.stdout ?? '', exitCode: e.status ?? 1 };
        }
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
}
