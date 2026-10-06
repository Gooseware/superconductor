import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { EphemeralProcessSandbox } from './ephemeral-sandbox.js';

describe('EphemeralProcessSandbox', () => {
  const sandbox = new EphemeralProcessSandbox();

  it('executes a node script and captures stdout, stderr, and exitCode 0', async () => {
    const code = `
      console.log('stdout message');
      console.error('stderr message');
      process.exit(0);
    `;
    const result = await sandbox.runInline(code, 'node');

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toContain('stdout message');
    expect(result.stderr).toContain('stderr message');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('captures non-zero exit codes from failing scripts', async () => {
    const code = `
      console.error('fatal explosion');
      process.exit(42);
    `;
    const result = await sandbox.runInline(code, 'node');

    expect(result.exitCode).toBe(42);
    expect(result.timedOut).toBe(false);
    expect(result.stderr).toContain('fatal explosion');
  });

  it('executes bash scripts cleanly', async () => {
    const code = `#!/bin/bash
      echo "hello from bash"
      exit 0
    `;
    const result = await sandbox.runInline(code, 'bash');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello from bash');
  });

  it('enforces strict timeout bounds and terminates runaway processes', async () => {
    // Process sleeps for 5 seconds, sandbox has 200ms timeout
    const code = `
      setTimeout(() => {
        process.exit(0);
      }, 5000);
    `;
    const result = await sandbox.runInline(code, 'node', {
      timeoutMs: 250,
      sigkillGraceMs: 100,
    });

    expect(result.timedOut).toBe(true);
    // Should terminate around 250-700ms, definitely well under 4000ms
    expect(result.durationMs).toBeLessThan(3500);
  });

  it('cleans up auto-generated working directory after execution', async () => {
    let capturedCwd: string | undefined;

    const code = `
      console.log(process.cwd());
    `;
    const result = await sandbox.runInline(code, 'node');
    expect(result.exitCode).toBe(0);

    capturedCwd = result.stdout.trim();
    expect(capturedCwd).toContain('sc-sandbox-');
    // Verify the temporary directory was deleted
    expect(fs.existsSync(capturedCwd)).toBe(false);
  });

  it('preserves user-specified working directory if cleanUpCwd is false', async () => {
    const customDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-custom-test-'));

    try {
      const result = await sandbox.runInline('console.log("preserved");', 'node', {
        cwd: customDir,
        cleanUpCwd: false,
      });

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(customDir)).toBe(true);
    } finally {
      fs.rmSync(customDir, { recursive: true, force: true });
    }
  });

  it('escalates termination to process groups without hanging', async () => {
    // Bash script spawning background subshell
    const code = `#!/bin/bash
      sleep 10 &
      sleep 10
    `;
    const result = await sandbox.runInline(code, 'bash', {
      timeoutMs: 300,
      sigkillGraceMs: 150,
    });

    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeLessThan(3000);
  });
});
