import { describe, it, expect } from 'vitest';
import {
  evaluateInvariantRules,
  TestFixtureTamperRule,
  CloudflareLifecycleRule,
  SilentDegradationRule,
  DefensiveNullingRule,
  ALL_INVARIANT_RULES,
  TEST_FIXTURE_TAMPER_MESSAGE,
  CLOUDFLARE_LIFECYCLE_MESSAGE,
  SILENT_DEGRADATION_MESSAGE,
  DEFENSIVE_NULLING_MESSAGE,
} from '../invariant-rules.js';
import * as rulesExports from '../index.js';

describe('Invariant Rules Engine', () => {
  describe('Exports & Index Re-exports', () => {
    it('re-exports all invariant rules and engine functions from review/rules/index.ts', () => {
      expect(rulesExports.evaluateInvariantRules).toBeDefined();
      expect(rulesExports.TestFixtureTamperRule).toBeDefined();
      expect(rulesExports.CloudflareLifecycleRule).toBeDefined();
      expect(rulesExports.SilentDegradationRule).toBeDefined();
      expect(rulesExports.DefensiveNullingRule).toBeDefined();
      expect(rulesExports.ALL_INVARIANT_RULES).toBeDefined();
      expect(rulesExports.ALL_INVARIANT_RULES.length).toBeGreaterThanOrEqual(4);
    });

    it('defines standard rule interfaces with id, name, severity, and evaluate function', () => {
      for (const rule of ALL_INVARIANT_RULES) {
        expect(rule.id).toBeDefined();
        expect(rule.name).toBeDefined();
        expect(['critical', 'high', 'medium']).toContain(rule.severity);
        expect(typeof rule.evaluate).toBe('function');
      }
    });
  });

  describe('TestFixtureTamperRule', () => {
    const rule = TestFixtureTamperRule;

    it('detects writeFileSync in test directory path', () => {
      const code = `
        import * as fs from 'fs';
        test('generate test fixture', () => {
          fs.writeFileSync('fixtures/data.json', JSON.stringify({ a: 1 }));
        });
      `;
      const violations = rule.evaluate({
        files: [{ path: 'tests/unit/generator.test.ts', content: code }],
      });
      expect(violations.length).toBe(1);
      expect(violations[0].ruleId).toBe(rule.id);
      expect(violations[0].severity).toBe('critical');
      expect(violations[0].message).toBe(TEST_FIXTURE_TAMPER_MESSAGE);
      expect(violations[0].message).toContain('Test fixture tampering detected');
      expect(violations[0].line).toBeGreaterThan(0);
    });

    it('detects fs.writeFile in __tests__ directory', () => {
      const code = `
        import fs from 'node:fs';
        it('saves fixture', async () => {
          await fs.writeFile('__tests__/sample.json', 'data');
        });
      `;
      const violations = rule.evaluate({
        files: [{ path: 'packages/core/src/__tests__/sample.spec.ts', content: code }],
      });
      expect(violations.length).toBe(1);
      expect(violations[0].message).toBe(TEST_FIXTURE_TAMPER_MESSAGE);
    });

    it('detects promises.writeFile in spec file', () => {
      const code = `
        import { promises as fsp } from 'fs';
        describe('suite', () => {
          it('writes', async () => {
            await fsp.writeFile('mock.json', 'content');
          });
        });
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/components/button.spec.tsx', content: code }],
      });
      expect(violations.length).toBe(1);
      expect(violations[0].message).toBe(TEST_FIXTURE_TAMPER_MESSAGE);
    });

    it('allows writeFileSync in production / non-test files', () => {
      const code = `
        import * as fs from 'fs';
        export function writeReport(file: string, content: string) {
          fs.writeFileSync(file, content);
        }
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/utils/file-writer.ts', content: code }],
      });
      expect(violations.length).toBe(0);
    });

    it('allows readFileSync in test files', () => {
      const code = `
        import * as fs from 'fs';
        test('read fixture', () => {
          const data = fs.readFileSync('fixtures/data.json', 'utf8');
          expect(data).toBeDefined();
        });
      `;
      const violations = rule.evaluate({
        files: [{ path: 'test/fixture-reader.test.ts', content: code }],
      });
      expect(violations.length).toBe(0);
    });

    it('ignores writeFileSync inside comments in test files', () => {
      const code = `
        // fs.writeFileSync('fixtures/mock.json', '{}');
        /*
         * Do not call fs.writeFileSync here!
         */
        test('pure test', () => {
          expect(1 + 1).toBe(2);
        });
      `;
      const violations = rule.evaluate({
        files: [{ path: 'tests/comment.test.ts', content: code }],
      });
      expect(violations.length).toBe(0);
    });
  });

  describe('CloudflareLifecycleRule', () => {
    const rule = CloudflareLifecycleRule;

    it('detects worker fetch handler taking bare env without ctx or context', () => {
      const code = `
        export default {
          async fetch(request: Request, env: Env): Promise<Response> {
            return new Response('ok');
          }
        };
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/worker.ts', content: code }],
      });
      expect(violations.length).toBe(1);
      expect(violations[0].ruleId).toBe(rule.id);
      expect(violations[0].severity).toBe('critical');
      expect(violations[0].message).toBe(CLOUDFLARE_LIFECYCLE_MESSAGE);
      expect(violations[0].message).toContain('Cloudflare isolate lifecycle violation');
    });

    it('detects dropped unawaited promises without ctx.waitUntil', () => {
      const code = `
        export default {
          async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
            trackAnalytics(env, request); // dropping unawaited promise without ctx.waitUntil
            return new Response('ok');
          }
        };
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/analytics-worker.ts', content: code }],
      });
      expect(violations.length).toBe(1);
      expect(violations[0].message).toBe(CLOUDFLARE_LIFECYCLE_MESSAGE);
    });

    it('detects async service calls taking bare env without ctx', () => {
      const code = `
        async function logEvent(env: Env, data: any) {
          dropPromise(env);
        }
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/services/logger.ts', content: code }],
      });
      expect(violations.length).toBe(1);
      expect(violations[0].message).toBe(CLOUDFLARE_LIFECYCLE_MESSAGE);
    });

    it('passes when ctx.waitUntil wraps the async operation', () => {
      const code = `
        export default {
          async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
            ctx.waitUntil(trackAnalytics(env, request));
            return new Response('ok');
          }
        };
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/worker.ts', content: code }],
      });
      expect(violations.length).toBe(0);
    });

    it('passes when promises are properly awaited', () => {
      const code = `
        export default {
          async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
            await trackAnalytics(env, request);
            return new Response('ok');
          }
        };
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/worker.ts', content: code }],
      });
      expect(violations.length).toBe(0);
    });

    it('passes for standard non-worker functions', () => {
      const code = `
        export function add(a: number, b: number): number {
          return a + b;
        }
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/math.ts', content: code }],
      });
      expect(violations.length).toBe(0);
    });
  });

  describe('SilentDegradationRule', () => {
    const rule = SilentDegradationRule;

    it('detects empty catch blocks without error binding catch {}', () => {
      const code = `
        try {
          doDangerousOperation();
        } catch {
        }
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/service.ts', content: code }],
      });
      expect(violations.length).toBe(1);
      expect(violations[0].ruleId).toBe(rule.id);
      expect(violations[0].message).toBe(SILENT_DEGRADATION_MESSAGE);
      expect(violations[0].message).toContain('Silent degradation defect: empty catch block');
    });

    it('detects empty catch blocks with error variable catch (e) {}', () => {
      const code = `
        try {
          parseData();
        } catch (e) {
        }
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/parser.ts', content: code }],
      });
      expect(violations.length).toBe(1);
      expect(violations[0].message).toBe(SILENT_DEGRADATION_MESSAGE);
    });

    it('detects empty catch blocks with underscore catch (_) {}', () => {
      const code = `
        try {
          fetchCache();
        } catch (_) {}
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/cache.ts', content: code }],
      });
      expect(violations.length).toBe(1);
      expect(violations[0].message).toBe(SILENT_DEGRADATION_MESSAGE);
    });

    it('detects catch blocks with only comments (no re-throw, no logging)', () => {
      const code = `
        try {
          execute();
        } catch (err) {
          // Swallow and ignore
          /* deliberately do nothing */
        }
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/runner.ts', content: code }],
      });
      expect(violations.length).toBe(1);
      expect(violations[0].message).toBe(SILENT_DEGRADATION_MESSAGE);
    });

    it('detects catch block that returns null/undefined without logging or re-throwing', () => {
      const code = `
        try {
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/json-helper.ts', content: code }],
      });
      expect(violations.length).toBe(1);
      expect(violations[0].message).toBe(SILENT_DEGRADATION_MESSAGE);
    });

    it('passes when catch block logs to logger or console', () => {
      const code = `
        try {
          doOperation();
        } catch (err) {
          logger.error('Operation failed', err);
        }
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/service.ts', content: code }],
      });
      expect(violations.length).toBe(0);
    });

    it('passes when catch block re-throws the error', () => {
      const code = `
        try {
          validate();
        } catch (err) {
          throw new ValidationError('Validation failed', { cause: err });
        }
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/validator.ts', content: code }],
      });
      expect(violations.length).toBe(0);
    });
  });

  describe('DefensiveNullingRule', () => {
    const rule = DefensiveNullingRule;

    it('detects ?? 0 fallback operator in diff addition', () => {
      const diff = `
@@ -10,3 +10,4 @@
  const base = 10;
+ const count = stats.count ?? 0;
  return base + count;
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/stats.ts', content: 'const count = stats.count ?? 0;', diff }],
      });
      expect(violations.length).toBe(1);
      expect(violations[0].ruleId).toBe(rule.id);
      expect(violations[0].message).toBe(DEFENSIVE_NULLING_MESSAGE);
      expect(violations[0].message).toContain('Defensive nulling defect: consumer-site fallback operator');
    });

    it('detects ?? "" and ?? [] in diff additions', () => {
      const diff = `
@@ -20,2 +20,4 @@
+ const name = user.name ?? "";
+ const roles = user.roles ?? [];
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/user.ts', content: 'const name = user.name ?? "";', diff }],
      });
      expect(violations.length).toBe(2);
      expect(violations.every(v => v.message === DEFENSIVE_NULLING_MESSAGE)).toBe(true);
    });

    it('detects || [] and || {} fallback operators', () => {
      const diff = `
@@ -5,1 +5,3 @@
+ const items = payload.items || [];
+ const meta = payload.meta || {};
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/payload.ts', content: '', diff }],
      });
      expect(violations.length).toBe(2);
      expect(violations.every(v => v.message === DEFENSIVE_NULLING_MESSAGE)).toBe(true);
    });

    it('detects fallback operators in content when diff is omitted', () => {
      const code = `
        function getItems(store: any) {
          const list = store.items ?? [];
          const count = store.count ?? 0;
          return { list, count };
        }
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/items.ts', content: code }],
      });
      expect(violations.length).toBe(2);
      expect(violations.every(v => v.message === DEFENSIVE_NULLING_MESSAGE)).toBe(true);
    });

    it('ignores removed lines in diffs', () => {
      const diff = `
@@ -10,2 +10,1 @@
- const items = store.items || [];
+ const items = store.items;
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/items.ts', content: 'const items = store.items;', diff }],
      });
      expect(violations.length).toBe(0);
    });

    it('ignores fallback patterns inside comments', () => {
      const diff = `
@@ -1,2 +1,3 @@
+ // Avoid doing items || [] here; ensure store initializes it.
  const items = store.items;
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/items.ts', content: '// Avoid doing items || []', diff }],
      });
      expect(violations.length).toBe(0);
    });

    it('passes when valid inception initialization is used', () => {
      const code = `
        interface Config {
          retries: number;
        }
        function createConfig(retries: number = 0): Config {
          return { retries };
        }
      `;
      const violations = rule.evaluate({
        files: [{ path: 'src/config.ts', content: code }],
      });
      expect(violations.length).toBe(0);
    });
  });

  describe('evaluateInvariantRules (Composite Engine)', () => {
    it('returns passed: true with clean files', () => {
      const result = evaluateInvariantRules({
        files: [
          {
            path: 'src/math.ts',
            content: 'export const add = (a: number, b: number) => a + b;',
          },
          {
            path: 'tests/math.test.ts',
            content: 'test("add", () => { expect(add(1, 2)).toBe(3); });',
          },
        ],
      });

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.summary.totalFiles).toBe(2);
      expect(result.summary.totalViolations).toBe(0);
      expect(result.summary.criticalViolations).toBe(0);
      expect(result.summary.highViolations).toBe(0);
    });

    it('aggregates violations across multiple rules and files', () => {
      const result = evaluateInvariantRules({
        files: [
          {
            path: 'tests/tamper.test.ts',
            content: 'import fs from "fs"; test("t", () => { fs.writeFileSync("a", "b"); });',
          },
          {
            path: 'src/degraded.ts',
            content: 'try { op(); } catch {}',
          },
          {
            path: 'src/nulling.ts',
            content: 'const a = x ?? 0;',
          },
        ],
      });

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBe(3);
      expect(result.summary.totalFiles).toBe(3);
      expect(result.summary.totalViolations).toBe(3);
      expect(result.summary.criticalViolations).toBe(1); // TestFixtureTamperRule
      expect(result.summary.highViolations).toBe(2); // SilentDegradationRule & DefensiveNullingRule
    });

    it('supports custom rule subset evaluation', () => {
      const result = evaluateInvariantRules(
        {
          files: [
            {
              path: 'tests/tamper.test.ts',
              content: 'import fs from "fs"; test("t", () => { fs.writeFileSync("a", "b"); });',
            },
            {
              path: 'src/degraded.ts',
              content: 'try { op(); } catch {}',
            },
          ],
        },
        [TestFixtureTamperRule]
      );

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0].ruleId).toBe(TestFixtureTamperRule.id);
    });
  });
});
