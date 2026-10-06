import { describe, it, expect } from 'vitest';
import { PreflightGate, PreflightSkippedError } from '../../src/orchestration/preflight-gate.js';
import { GateContext } from '../../src/orchestration/abstract-gate.js';

describe('PreflightGate', () => {
  const gate = new PreflightGate();

  it('fails when intelligenceStatusChecked is absent from state metadata', async () => {
    const context: GateContext = {
      trackId: 'test-track',
      sessionId: 'test-session',
      metadata: { notebookQueried: true },
    };
    const result = await gate.check(context);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Intelligence status MCP call not recorded');
  });

  it('fails when notebookQueried is absent from state metadata', async () => {
    const context: GateContext = {
      trackId: 'test-track',
      sessionId: 'test-session',
      metadata: { intelligenceStatusChecked: true },
    };
    const result = await gate.check(context);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Notebook query MCP call not recorded');
  });

  it('passes when both flags are present and true', async () => {
    const context: GateContext = {
      trackId: 'test-track',
      sessionId: 'test-session',
      metadata: { intelligenceStatusChecked: true, notebookQueried: true },
    };
    const result = await gate.check(context);
    expect(result.passed).toBe(true);
  });

  it('assert() throws PreflightSkippedError on failure', async () => {
    const context: GateContext = {
      trackId: 'test-track',
      sessionId: 'test-session',
      metadata: {},
    };
    await expect(gate.assert(context)).rejects.toThrow(PreflightSkippedError);
  });

  it('fails when diff contains forbidden AST patterns', async () => {
    const context: GateContext = {
      trackId: 'test-track',
      sessionId: 'test-session',
      metadata: {
        intelligenceStatusChecked: true,
        notebookQueried: true,
        diff: `--- a/src/test.test.ts
+++ b/src/test.test.ts
@@ -1,1 +1,2 @@
+fs.writeFileSync('fixture.json', '{}');
`,
      },
    };
    const result = await gate.check(context);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Preflight AST check failed');
    expect(result.reason).toContain('forbidden-test-fixture-generation');
  });

  it('passes when diff is clean and metadata flags are present', async () => {
    const context: GateContext = {
      trackId: 'test-track',
      sessionId: 'test-session',
      metadata: {
        intelligenceStatusChecked: true,
        notebookQueried: true,
        diff: `--- a/src/calc.ts
+++ b/src/calc.ts
@@ -1,1 +1,2 @@
+export const add = (a, b) => a + b;
`,
      },
    };
    const result = await gate.check(context);
    expect(result.passed).toBe(true);
  });
});

