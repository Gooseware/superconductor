import { describe, it, expect } from 'vitest';
import {
  PreflightASTChecker,
  RULE_TEST_FIXTURE_AUTOGEN,
  RULE_CF_WORKER_WAITUNTIL,
  RULE_RELAXED_TIMING,
  RULE_SWALLOWED_EXCEPTIONS,
} from './preflight-ast-checker.js';
import { runPreflightCli } from '../cli/check-preflight.js';
import { PreflightGate } from '../orchestration/preflight-gate.js';

describe('PreflightASTChecker', () => {
  const checker = new PreflightASTChecker();

  describe('Rule 1: Test Snapshot / Fixture Auto-generation', () => {
    it('detects writeFileSync inside *.test.ts', () => {
      const code = `
        import fs from 'node:fs';
        it('writes snapshot', () => {
          fs.writeFileSync('fixtures/data.json', '{}');
        });
      `;
      const result = checker.scanContent(code, 'src/components/button.test.ts');
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].rule).toBe(RULE_TEST_FIXTURE_AUTOGEN);
      expect(result.violations[0].message).toContain('writeFileSync');
    });

    it('detects bare writeFile inside *.spec.ts', () => {
      const code = `
        describe('suite', () => {
          writeFile('out.txt', 'val');
        });
      `;
      const result = checker.scanContent(code, 'tests/e2e/runner.spec.ts');
      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe(RULE_TEST_FIXTURE_AUTOGEN);
    });

    it('detects fs.writeFile in test fixture helpers', () => {
      const code = `
        export function createFixture(data) {
          fs.writeFile('fixture.json', data);
        }
      `;
      const result = checker.scanContent(code, 'src/test-utils/fixture-helper.ts');
      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe(RULE_TEST_FIXTURE_AUTOGEN);
    });

    it('permits writeFileSync in production code (not in test or fixture)', () => {
      const code = `
        import fs from 'node:fs';
        export function saveConfig(cfg) {
          fs.writeFileSync('config.json', JSON.stringify(cfg));
        }
      `;
      const result = checker.scanContent(code, 'src/config/writer.ts');
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Rule 2: Cloudflare Workers Missing ctx.waitUntil', () => {
    it('flags worker fetch handler with bare env and missing ctx parameter', () => {
      const code = `
        export default {
          async fetch(request, env) {
            env.ANALYTICS.writeData({ ip: '127.0.0.1' });
            return new Response('ok');
          }
        };
      `;
      const result = checker.scanContent(code, 'src/worker.ts');
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.rule === RULE_CF_WORKER_WAITUNTIL)).toBe(true);
      expect(result.violations[0].message).toContain('ctx parameter or ctx.waitUntil');
    });

    it('flags worker fetch handler with ctx present but unawaited env call not wrapped in ctx.waitUntil', () => {
      const code = `
        export default {
          async fetch(request, env, ctx) {
            env.KV.put('metric', '1');
            return new Response('ok');
          }
        };
      `;
      const result = checker.scanContent(code, 'src/worker.ts');
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.rule === RULE_CF_WORKER_WAITUNTIL)).toBe(true);
    });

    it('permits worker fetch handler wrapping background operations in ctx.waitUntil', () => {
      const code = `
        export default {
          async fetch(request, env, ctx) {
            ctx.waitUntil(env.KV.put('metric', '1'));
            return new Response('ok');
          }
        };
      `;
      const result = checker.scanContent(code, 'src/worker.ts');
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('permits worker fetch handler awaiting async database operations', () => {
      const code = `
        export default {
          async fetch(request, env, ctx) {
            await env.DB.prepare('SELECT 1').run();
            return new Response('ok');
          }
        };
      `;
      const result = checker.scanContent(code, 'src/worker.ts');
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Rule 3: Relaxed Timing Assertions', () => {
    it('flags bumped toBeLessThan threshold in test file', () => {
      const oldCode = `
        it('benchmark', () => {
          expect(duration).toBeLessThan(100);
        });
      `;
      const newCode = `
        it('benchmark', () => {
          expect(duration).toBeLessThan(500);
        });
      `;
      const result = checker.scanContent(newCode, 'src/perf.test.ts', oldCode);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].rule).toBe(RULE_RELAXED_TIMING);
      expect(result.violations[0].message).toContain('100 to 500');
    });

    it('flags bumped timeout threshold in test file', () => {
      const oldCode = `
        const config = { timeout: 1000 };
      `;
      const newCode = `
        const config = { timeout: 10000 };
      `;
      const result = checker.scanContent(newCode, 'src/suite.spec.ts', oldCode);
      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe(RULE_RELAXED_TIMING);
      expect(result.violations[0].message).toContain('1000 to 10000');
    });

    it('permits tightened timing threshold (decreasing toBeLessThan)', () => {
      const oldCode = `
        it('benchmark', () => {
          expect(duration).toBeLessThan(500);
        });
      `;
      const newCode = `
        it('benchmark', () => {
          expect(duration).toBeLessThan(100);
        });
      `;
      const result = checker.scanContent(newCode, 'src/perf.test.ts', oldCode);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Rule 4: Swallowed Exceptions', () => {
    it('flags empty catch {} block', () => {
      const code = `
        try {
          doRisky();
        } catch {
        }
      `;
      const result = checker.scanContent(code, 'src/service.ts');
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].rule).toBe(RULE_SWALLOWED_EXCEPTIONS);
      expect(result.violations[0].message).toContain('Empty catch block');
    });

    it('flags empty catch (_) {} block', () => {
      const code = `
        try {
          doRisky();
        } catch (_) {
          // ignore error
        }
      `;
      const result = checker.scanContent(code, 'src/service.ts');
      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe(RULE_SWALLOWED_EXCEPTIONS);
    });

    it('flags catch (_) {} without rethrow or handling', () => {
      const code = `
        try {
          doRisky();
        } catch (_) {
          return null;
        }
      `;
      const result = checker.scanContent(code, 'src/service.ts');
      expect(result.valid).toBe(false);
      expect(result.violations[0].rule).toBe(RULE_SWALLOWED_EXCEPTIONS);
    });

    it('permits catch block that rethrows', () => {
      const code = `
        try {
          doRisky();
        } catch (err) {
          throw new Error('Wrapped: ' + String(err));
        }
      `;
      const result = checker.scanContent(code, 'src/service.ts');
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('permits catch block that logs the error', () => {
      const code = `
        try {
          doRisky();
        } catch (err) {
          console.error('Operation failed', err);
        }
      `;
      const result = checker.scanContent(code, 'src/service.ts');
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('scanDiff', () => {
    it('detects violations introduced in unified git diff', () => {
      const diff = `diff --git a/tests/sample.test.ts b/tests/sample.test.ts
index 1111111..2222222 100644
--- a/tests/sample.test.ts
+++ b/tests/sample.test.ts
@@ -10,3 +10,4 @@
 const a = 1;
-expect(dur).toBeLessThan(50);
+expect(dur).toBeLessThan(200);
+fs.writeFileSync('fixture.json', '{}');
diff --git a/src/worker.ts b/src/worker.ts
new file mode 100644
--- /dev/null
+++ b/src/worker.ts
@@ -0,0 +1,6 @@
+export default {
+  async fetch(req, env) {
+    env.KV.put('k', 'v');
+    return new Response('ok');
+  }
+};
diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -25,2 +25,4 @@
+try { parse(); } catch (_) {
+}
`;
      const result = checker.scanDiff(diff);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(4);

      const rulesFound = new Set(result.violations.map(v => v.rule));
      expect(rulesFound.has(RULE_RELAXED_TIMING)).toBe(true);
      expect(rulesFound.has(RULE_TEST_FIXTURE_AUTOGEN)).toBe(true);
      expect(rulesFound.has(RULE_CF_WORKER_WAITUNTIL)).toBe(true);
      expect(rulesFound.has(RULE_SWALLOWED_EXCEPTIONS)).toBe(true);
    });

    it('returns valid on clean diff', () => {
      const cleanDiff = `diff --git a/src/math.ts b/src/math.ts
--- a/src/math.ts
+++ b/src/math.ts
@@ -1,2 +1,3 @@
 export function add(a: number, b: number): number {
+  // clean addition
   return a + b;
 }
`;
      const result = checker.scanDiff(cleanDiff);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('CLI check-preflight', () => {
    it('returns exit code 0 on --help', () => {
      const { exitCode } = runPreflightCli(['--help'], checker);
      expect(exitCode).toBe(0);
    });

    it('returns exit code 1 when diff has violations', () => {
      const mockChecker = {
        scanGitDiff: () => ({
          valid: false,
          violations: [
            {
              file: 'src/test.test.ts',
              line: 12,
              rule: RULE_TEST_FIXTURE_AUTOGEN,
              message: 'Forbidden writeFileSync',
            },
          ],
        }),
        scanFile: () => ({ valid: true, violations: [] }),
      } as unknown as PreflightASTChecker;

      const { exitCode, result } = runPreflightCli([], mockChecker);
      expect(exitCode).toBe(1);
      expect(result?.valid).toBe(false);
    });

    it('returns exit code 0 when diff is clean', () => {
      const mockChecker = {
        scanGitDiff: () => ({
          valid: true,
          violations: [],
        }),
        scanFile: () => ({ valid: true, violations: [] }),
      } as unknown as PreflightASTChecker;

      const { exitCode, result } = runPreflightCli([], mockChecker);
      expect(exitCode).toBe(0);
      expect(result?.valid).toBe(true);
    });
  });

  describe('PreflightGate Integration', () => {
    const gate = new PreflightGate();

    it('passes when metadata flags are valid and no diff is provided', async () => {
      const res = await gate.check({
        trackId: 'test-track',
        sessionId: 'test-session',
        metadata: { intelligenceStatusChecked: true, notebookQueried: true },
      });
      expect(res.passed).toBe(true);
    });

    it('fails when diff contains preflight violations', async () => {
      const badDiff = `--- a/src/bad.test.ts
+++ b/src/bad.test.ts
@@ -1,1 +1,2 @@
+fs.writeFileSync('fixture.json', '{}');
`;
      const res = await gate.check({
        trackId: 'test-track',
        sessionId: 'test-session',
        metadata: {
          intelligenceStatusChecked: true,
          notebookQueried: true,
          diff: badDiff,
        },
      });
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('Preflight AST check failed');
      expect(res.reason).toContain(RULE_TEST_FIXTURE_AUTOGEN);
    });
  });
});
