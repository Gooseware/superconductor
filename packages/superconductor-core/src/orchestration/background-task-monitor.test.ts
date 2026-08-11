import { describe, it, expect, vi } from 'vitest';
import {
  BackgroundTaskMonitor,
  TimeoutError,
  HungTaskError,
  MAX_BUFFER,
  appendWithLimit,
  killProcessGroup,
} from './background-task-monitor.js';

describe('BackgroundTaskMonitor', () => {
  describe('appendWithLimit', () => {
    it('appends text within limit', () => {
      expect(appendWithLimit('hello ', 'world', 20)).toBe('hello world');
    });

    it('trims to keep the last maxLen chars when exceeding limit', () => {
      expect(appendWithLimit('12345', '67890', 8)).toBe('34567890');
    });

    it('handles exact maxLen', () => {
      expect(appendWithLimit('1234', '5678', 8)).toBe('12345678');
    });

    it('exports MAX_BUFFER constant as 1MB', () => {
      expect(MAX_BUFFER).toBe(1_048_576);
    });
  });

  describe('killProcessGroup', () => {
    it('kills process group using -pid when pid is defined', () => {
      const spyKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
      const mockChild = { pid: 1234, kill: vi.fn() } as any;
      killProcessGroup(mockChild);
      expect(spyKill).toHaveBeenCalledWith(-1234, 'SIGKILL');
      spyKill.mockRestore();
    });

    it('falls back to child.kill when process.kill throws', () => {
      const spyKill = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('No such process');
      });
      const mockChild = { pid: 1234, kill: vi.fn() } as any;
      killProcessGroup(mockChild);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');
      spyKill.mockRestore();
    });

    it('calls child.kill when pid is undefined', () => {
      const mockChild = { pid: undefined, kill: vi.fn() } as any;
      killProcessGroup(mockChild);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');
    });
  });

  describe('detectHungOutput', () => {
    it('detects "Press Ctrl+C to quit"', () => {
      expect(BackgroundTaskMonitor.detectHungOutput('Press Ctrl+C to quit')).toBe(true);
    });
    it('detects "press any key to continue" (case-insensitive)', () => {
      expect(BackgroundTaskMonitor.detectHungOutput('Press Any Key To Continue')).toBe(true);
    });
    it('detects [Y/n] prompts', () => {
      expect(BackgroundTaskMonitor.detectHungOutput('Overwrite file? [Y/n]')).toBe(true);
    });
    it('detects [y/N] prompts', () => {
      expect(BackgroundTaskMonitor.detectHungOutput('Continue? [y/N]')).toBe(true);
    });
    it('detects Password: prompt', () => {
      expect(BackgroundTaskMonitor.detectHungOutput('Password:')).toBe(true);
    });
    it('detects Enter password prompt', () => {
      expect(BackgroundTaskMonitor.detectHungOutput('Enter password for user:')).toBe(true);
    });
    it('does NOT flag normal build output', () => {
      expect(BackgroundTaskMonitor.detectHungOutput('Build completed successfully in 3.2s')).toBe(false);
    });
    it('does NOT flag empty output', () => {
      expect(BackgroundTaskMonitor.detectHungOutput('')).toBe(false);
    });
  });

  describe('launch', () => {
    it('resolves with stdout on success', async () => {
      const monitor = new BackgroundTaskMonitor({ shellRunner: { exec: async () => ({ stdout: 'done', exitCode: 0 }) } });
      const result = await monitor.launch('echo done');
      expect(result.stdout).toBe('done');
      expect(result.exitCode).toBe(0);
    });

    it('throws HungTaskError when output contains interactive prompt', async () => {
      const monitor = new BackgroundTaskMonitor({
        shellRunner: { exec: async () => ({ stdout: 'Press Ctrl+C to quit', exitCode: 0 }) },
      });
      await expect(monitor.launch('some-server')).rejects.toThrow(HungTaskError);
    });

    it('throws TimeoutError when task exceeds maxDurationMs', async () => {
      const monitor = new BackgroundTaskMonitor({
        shellRunner: {
          exec: () => new Promise(resolve => setTimeout(() => resolve({ stdout: '', exitCode: 0 }), 500)),
        },
      });
      await expect(monitor.launch('slow-cmd', { maxDurationMs: 50 })).rejects.toThrow(TimeoutError);
    });

    describe('default runner (spawn-based)', () => {
      it('resolves with stdout and exitCode using default spawn runner', async () => {
        const monitor = new BackgroundTaskMonitor();
        const result = await monitor.launch('echo default_runner_test');
        expect(result.stdout.trim()).toBe('default_runner_test');
        expect(result.exitCode).toBe(0);
      });

      it('throws HungTaskError on live hung output using default spawn runner', async () => {
        const monitor = new BackgroundTaskMonitor();
        await expect(monitor.launch('echo "Press Ctrl+C to quit"')).rejects.toThrow(HungTaskError);
      });

      it('throws TimeoutError when command times out using default spawn runner', async () => {
        const monitor = new BackgroundTaskMonitor();
        await expect(monitor.launch('sleep 5', { maxDurationMs: 100 })).rejects.toThrow(TimeoutError);
      });

      it('detects hung output split across chunk boundaries', async () => {
        const monitor = new BackgroundTaskMonitor();
        const cmd = `node -e 'process.stdout.write("Overwrite file? [Y"); setTimeout(() => process.stdout.write("/n]\\n"), 50)'`;
        await expect(monitor.launch(cmd)).rejects.toThrow(HungTaskError);
      });
    });
  });
});

