import * as net from 'node:net';
import * as child_process from 'node:child_process';

export interface SpawnDevServerOptions {
  projectRoot: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface SpawnDevServerResult {
  url: string;
  stop: () => Promise<void>;
}

export class DevServerManager {
  /**
   * Probes whether a given host/port is actively listening using a Node net.Socket.
   */
  async probePort(port: number, host = '127.0.0.1', timeoutMs = 1000): Promise<boolean> {
    return DevServerManager.probePort(port, host, timeoutMs);
  }

  /**
   * Scans candidate ports to detect an already running active server.
   */
  async detectActiveServer(candidatePorts: number[] = [4355, 5173, 3000, 8080]): Promise<string | null> {
    return DevServerManager.detectActiveServer(candidatePorts);
  }

  /**
   * Spawns a dev server child process, scans stdout/stderr for the listening URL,
   * tracks PID and process tree, and registers process exit cleanup hooks.
   */
  async spawnDevServer(options: SpawnDevServerOptions): Promise<SpawnDevServerResult> {
    return DevServerManager.spawnDevServer(options);
  }

  static async probePort(port: number, host = '127.0.0.1', timeoutMs = 1000): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (result: boolean) => {
        if (!settled) {
          settled = true;
          socket.removeAllListeners();
          socket.destroy();
          resolve(result);
        }
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));

      try {
        socket.connect(port, host);
      } catch {
        finish(false);
      }
    });
  }

  static async detectActiveServer(candidatePorts: number[] = [4355, 5173, 3000, 8080]): Promise<string | null> {
    for (const port of candidatePorts) {
      const isOpen = await DevServerManager.probePort(port);
      if (isOpen) {
        return `http://127.0.0.1:${port}`;
      }
    }
    return null;
  }

  static async spawnDevServer(options: SpawnDevServerOptions): Promise<SpawnDevServerResult> {
    const timeoutMs = options.timeoutMs ?? 30000;

    let cmd = options.command;
    let args = options.args;
    if (!cmd) {
      cmd = 'npm';
      args = ['run', 'dev'];
    } else if (!args) {
      const parts = cmd.trim().split(/\s+/);
      cmd = parts[0];
      args = parts.slice(1);
    }

    const child = child_process.spawn(cmd, args, {
      cwd: options.projectRoot,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });

    const killProcessTree = (signal: NodeJS.Signals = 'SIGTERM') => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        try {
          child_process.execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
        } catch {
          try {
            child.kill(signal);
          } catch {
            // ignore
          }
        }
      } else {
        try {
          process.kill(-child.pid, signal);
        } catch {
          try {
            child.kill(signal);
          } catch {
            // ignore
          }
        }
      }
    };

    let stopped = false;
    const onProcessExit = () => {
      killProcessTree('SIGTERM');
    };

    const onSignal = (sig: NodeJS.Signals) => {
      killProcessTree('SIGTERM');
      process.removeListener('exit', onProcessExit);
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      process.kill(process.pid, sig);
    };

    process.once('exit', onProcessExit);
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);

    const cleanupProcessListeners = () => {
      process.removeListener('exit', onProcessExit);
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
    };

    const stop = async (): Promise<void> => {
      if (stopped) return;
      stopped = true;
      cleanupProcessListeners();

      if (child.exitCode !== null || child.killed) {
        return;
      }

      return new Promise<void>((resolve) => {
        let exitTimer: NodeJS.Timeout | null = null;

        const onExit = () => {
          if (exitTimer) clearTimeout(exitTimer);
          resolve();
        };

        child.once('exit', onExit);
        killProcessTree('SIGTERM');

        exitTimer = setTimeout(() => {
          if (child.exitCode === null) {
            killProcessTree('SIGKILL');
          }
          resolve();
        }, 2000);
      });
    };

    return new Promise<SpawnDevServerResult>((resolve, reject) => {
      let resolved = false;
      let outputBuffer = '';

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          stop().finally(() => {
            reject(new Error(`Dev server failed to start within ${timeoutMs}ms (timeout)`));
          });
        }
      }, timeoutMs);

      const patterns = [
        /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i,
        /Local:\s+http:\/\/localhost:(\d+)/i,
        /Local:\s+https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i,
      ];

      const checkOutputForUrl = (chunk: Buffer | string) => {
        if (resolved) return;
        outputBuffer += chunk.toString();
        const clean = outputBuffer.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');

        for (const pattern of patterns) {
          const match = clean.match(pattern);
          if (match && match[1]) {
            const port = parseInt(match[1], 10);
            if (!isNaN(port) && port > 0 && port <= 65535) {
              resolved = true;
              clearTimeout(timer);
              resolve({
                url: `http://127.0.0.1:${port}`,
                stop,
              });
              return;
            }
          }
        }
      };

      child.stdout?.on('data', checkOutputForUrl);
      child.stderr?.on('data', checkOutputForUrl);

      child.once('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanupProcessListeners();
          reject(new Error(`Failed to spawn dev server: ${err.message}`));
        }
      });

      child.once('exit', (code, signal) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanupProcessListeners();
          reject(
            new Error(`Dev server process exited prematurely with code ${code ?? 'null'} (signal: ${signal ?? 'none'})`)
          );
        }
      });
    });
  }
}
