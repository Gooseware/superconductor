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

  describe('Invariant rule evaluation', () => {
    const validMetadata = { intelligenceStatusChecked: true, notebookQueried: true };

    it('passes when files are provided and clean of invariant violations', async () => {
      const context = {
        trackId: 'test-track',
        sessionId: 'test-session',
        metadata: validMetadata,
        files: [
          {
            path: 'src/utils.ts',
            content: 'export function add(a: number, b: number) { return a + b; }',
          },
        ],
      };
      const result = await gate.check(context);
      expect(result.passed).toBe(true);
    });

    it('fails when files contain TestFixtureTamperRule violation', async () => {
      const context = {
        trackId: 'test-track',
        sessionId: 'test-session',
        metadata: validMetadata,
        files: [
          {
            path: 'tests/fixture.test.ts',
            content: `import fs from 'fs';\nfs.writeFileSync('fixture.json', '{}');`,
          },
        ],
      };
      const result = await gate.check(context);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Invariant preflight failure:');
      expect(result.reason).toContain('Test fixture tampering detected');
      expect(result.violations).toBeDefined();
      expect(result.violations?.length).toBeGreaterThan(0);
      expect(result.violations?.[0].ruleId).toBe('INVARIANT-FIXTURE-TAMPER');
    });

    it('fails when diff contains DefensiveNullingRule violation', async () => {
      const context = {
        trackId: 'test-track',
        sessionId: 'test-session',
        metadata: validMetadata,
        files: [
          {
            path: 'src/config.ts',
            content: '',
            diff: '@@ -1,3 +1,3 @@\n-const val = raw;\n+const val = raw ?? 0;',
          },
        ],
      };
      const result = await gate.check(context);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Invariant preflight failure:');
      expect(result.reason).toContain('Defensive nulling defect');
      expect(result.violations?.[0].ruleId).toBe('INVARIANT-DEFENSIVE-NULLING');
    });

    it('fails when context.diff is passed directly', async () => {
      const context = {
        trackId: 'test-track',
        sessionId: 'test-session',
        metadata: validMetadata,
        diff: 'diff --git a/src/service.ts b/src/service.ts\n@@ -1,3 +1,3 @@\n-const a = 1;\n+const a = raw || [];',
      };
      const result = await gate.check(context);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Invariant preflight failure:');
      expect(result.violations?.length).toBeGreaterThan(0);
    });

    it('assert() throws PreflightSkippedError when invariant violations are detected', async () => {
      const context = {
        trackId: 'test-track',
        sessionId: 'test-session',
        metadata: validMetadata,
        files: [
          {
            path: 'tests/mock.test.ts',
            content: `import fs from 'fs';\nfs.writeFileSync('dummy.txt', 'test');`,
          },
        ],
      };
      await expect(gate.assert(context)).rejects.toThrow(PreflightSkippedError);
      await expect(gate.assert(context)).rejects.toThrow(/Invariant preflight failure/);
    });
  });
});

