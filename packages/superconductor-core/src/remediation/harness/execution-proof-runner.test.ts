import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ExecutionProofRunner } from './execution-proof-runner.js';

describe('ExecutionProofRunner', () => {
  const runner = new ExecutionProofRunner();

  it('verifies a failing inline repro script with non-empty error trace', async () => {
    const reproCode = `
      console.error('TypeError: Cannot read property "id" of null');
      process.exit(1);
    `;

    const result = await runner.execute(reproCode, {
      runtime: 'node',
      expectedToFail: true,
    });

    expect(result.verified).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(result.errorTrace).toBeDefined();
    expect(result.errorTrace).toContain('TypeError: Cannot read property "id" of null');
  });

  it('marks repro as unverified if the script succeeds cleanly without reproducing failure', async () => {
    const reproCode = `
      console.log('Everything is working fine');
      process.exit(0);
    `;

    const result = await runner.execute(reproCode, {
      runtime: 'node',
      expectedToFail: true,
    });

    // Since it was expected to fail to prove the bug, exit 0 means not verified
    expect(result.verified).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  it('verifies passing scripts when expectedToFail is set to false', async () => {
    const verifyCode = `
      console.log('Fix verification passed');
      process.exit(0);
    `;

    const result = await runner.execute(verifyCode, {
      runtime: 'node',
      expectedToFail: false,
    });

    expect(result.verified).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('executes a shell reproduction snippet and extracts stderr trace', async () => {
    const reproShell = `#!/bin/bash
      echo "CRITICAL: invariant check failed" >&2
      exit 2
    `;

    const result = await runner.execute(reproShell, {
      runtime: 'bash',
      expectedToFail: true,
    });

    expect(result.verified).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(result.errorTrace).toContain('CRITICAL: invariant check failed');
  });

  it('verifies timeouts as execution proofs for runaway regressions', async () => {
    const loopCode = `
      setInterval(() => {}, 1000);
    `;

    const result = await runner.execute(loopCode, {
      runtime: 'node',
      timeoutMs: 200,
      expectedToFail: true,
    });

    expect(result.verified).toBe(true);
    expect(result.timedOut).toBe(true);
    expect(result.errorTrace).toContain('TIMEOUT_EXCEEDED');
  });

  it('executes a physical reproduction script file from disk', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-repro-test-'));
    const scriptPath = path.join(tempDir, 'bug.repro.js');

    try {
      fs.writeFileSync(
        scriptPath,
        `console.error('Repro file triggered assertion failure'); process.exit(3);`,
        'utf-8'
      );

      const result = await runner.execute(scriptPath, {
        cwd: tempDir,
        expectedToFail: true,
      });

      expect(result.verified).toBe(true);
      expect(result.exitCode).toBe(3);
      expect(result.reproPath).toBe(scriptPath);
      expect(result.errorTrace).toContain('Repro file triggered assertion failure');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('formats execution proofs into standardized markdown blocks', () => {
    const markdown = ExecutionProofRunner.formatProofMarkdown({
      verified: true,
      exitCode: 1,
      durationMs: 142,
      timedOut: false,
      reproPath: '/worktree/tests/repro.ts',
      stdout: '',
      stderr: 'AssertionError: expected false to be true',
      errorTrace: 'AssertionError: expected false to be true',
    });

    expect(markdown).toContain('### 🔬 Ephemeral Execution Proof');
    expect(markdown).toContain('Verified Failure (Defect Successfully Reproduced)');
    expect(markdown).toContain('`1`');
    expect(markdown).toContain('`142ms`');
    expect(markdown).toContain('/worktree/tests/repro.ts');
    expect(markdown).toContain('AssertionError: expected false to be true');
  });
});
