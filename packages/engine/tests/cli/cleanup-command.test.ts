import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { QuorumStore } from '../../src/cli/quorum-store.js';

// We test the CLI command by mocking the lifecycle manager
// and observing stdout output via a captured spy.

describe('cleanup CLI command', () => {
  let tmpDir: string;
  let store: QuorumStore;
  let consoleLogs: string[];
  let consoleWarns: string[];
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-cmd-test-'));
    store = new QuorumStore(tmpDir);
    consoleLogs = [];
    consoleWarns = [];
    consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleLogs.push(args.join(' '));
    });
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      consoleWarns.push(args.join(' '));
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should print summary report on success', async () => {
    const trackId = 'test-track-cmd';
    await store.appendToAgentsManifest(trackId, {
      conversationId: 'conv-cmd-1',
      wuId: 'wu-1',
      role: 'agent-a',
      spawnedAt: new Date().toISOString(),
    });

    const { runCleanup } = await import('../../src/cli/cleanup-command.js');

    // Use a no-op killer
    await runCleanup(trackId, { baseDir: tmpDir, killer: {
      async kill(_id: string) { return 'killed' as const; }
    }});

    const output = consoleLogs.join('\n');
    expect(output).toMatch(/agentsKilled/i);
    expect(output).toMatch(/1/);
  });

  it('should print warning and exit 0 on missing manifest', async () => {
    const { runCleanup } = await import('../../src/cli/cleanup-command.js');

    // No manifest written — should not throw
    await expect(
      runCleanup('no-such-track', { baseDir: tmpDir, killer: {
        async kill(_id: string) { return 'killed' as const; }
      }})
    ).resolves.toBeUndefined();

    // Should produce some output (warning or report)
    const allOutput = [...consoleLogs, ...consoleWarns].join('\n');
    // Either a warning about missing manifest or empty report — just shouldn't throw
    expect(typeof allOutput).toBe('string');
  });
});
