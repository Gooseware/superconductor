import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BackgroundTaskMonitor,
  TimeoutError,
  HungTaskError,
} from './background-task-monitor.js';

describe('BackgroundTaskMonitor', () => {
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
  });
});
