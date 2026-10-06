import { describe, it, expect, vi } from 'vitest';
import { DiffOnDiffAuditor } from './diff-on-diff-auditor.js';

describe('DiffOnDiffAuditor', () => {
  it('passes cleanly when remediation diff is clean and within scope', async () => {
    const cleanDiff = `diff --git a/src/services/order.ts b/src/services/order.ts
index 1111111..2222222 100644
--- a/src/services/order.ts
+++ b/src/services/order.ts
@@ -10,3 +10,4 @@ export function processOrder(order: Order) {
   validate(order);
+  saveOrder(order);
   return true;
 }
`;

    const result = await DiffOnDiffAuditor.audit({
      rawDiff: cleanDiff,
      expectedFiles: ['src/services/order.ts'],
    });

    expect(result.passed).toBe(true);
    expect(result.secondaryFindings).toHaveLength(0);
    expect(result.auditedFiles).toEqual(['src/services/order.ts']);
  });

  it('detects unrequested file modifications outside finding scope (scope creep)', async () => {
    const scopeCreepDiff = `diff --git a/src/services/order.ts b/src/services/order.ts
--- a/src/services/order.ts
+++ b/src/services/order.ts
@@ -1,2 +1,3 @@
+const valid = true;
diff --git a/src/config/database.ts b/src/config/database.ts
--- a/src/config/database.ts
+++ b/src/config/database.ts
@@ -1,2 +1,3 @@
+const pool = 10;
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1,2 +1,3 @@
+"version": "2.0.0"
`;

    const result = await DiffOnDiffAuditor.audit({
      rawDiff: scopeCreepDiff,
      targetFindings: [
        { id: 'f1', file: 'src/services/order.ts', severity: 'HIGH', description: 'Order validation error' },
      ],
      allowRelatedTests: true,
    });

    expect(result.passed).toBe(false);
    const scopeFindings = result.secondaryFindings.filter((f) => f.category === 'scope_creep');
    expect(scopeFindings.length).toBe(2);
    expect(scopeFindings.map((f) => f.file)).toEqual(['src/config/database.ts', 'package.json']);
    expect(scopeFindings[0].ruleId).toBe('DIFF_REGRESSION');
    expect(scopeFindings[0].type).toBe('DIFF_REGRESSION');
    expect(scopeFindings[0].severity).toBe('CRITICAL');
  });

  it('detects swallowed errors: newly added empty catch blocks', async () => {
    const emptyCatchDiff = `diff --git a/src/api/handler.ts b/src/api/handler.ts
--- a/src/api/handler.ts
+++ b/src/api/handler.ts
@@ -20,3 +20,7 @@ export async function handleRequest() {
   try {
     await db.query();
+  } catch (err) {
+    // completely empty catch block
+  }
`;

    const result = await DiffOnDiffAuditor.audit({
      rawDiff: emptyCatchDiff,
      expectedFiles: ['src/api/handler.ts'],
    });

    expect(result.passed).toBe(false);
    const swallowed = result.secondaryFindings.filter((f) => f.category === 'swallowed_error');
    expect(swallowed.length).toBe(1);
    expect(swallowed[0].ruleId).toBe('DIFF_REGRESSION');
    expect(swallowed[0].file).toBe('src/api/handler.ts');
    expect(swallowed[0].description).toContain('Swallowed error detected in catch block');
  });

  it('detects swallowed errors: catch blocks that only log without re-throwing', async () => {
    const logOnlyCatchDiff = `diff --git a/src/worker.ts b/src/worker.ts
--- a/src/worker.ts
+++ b/src/worker.ts
@@ -15,3 +15,7 @@ export function runWorker() {
   try {
     syncData();
+  } catch (e) {
+    console.error('Failed to sync data', e);
+    logger.warn('Suppressed error');
+  }
`;

    const result = await DiffOnDiffAuditor.audit({
      rawDiff: logOnlyCatchDiff,
      expectedFiles: ['src/worker.ts'],
    });

    expect(result.passed).toBe(false);
    const swallowed = result.secondaryFindings.filter((f) => f.category === 'swallowed_error');
    expect(swallowed.length).toBe(1);
    expect(swallowed[0].description).toContain('Swallowed error detected in catch block');
  });

  it('allows catch blocks that properly rethrow or propagate errors', async () => {
    const properCatchDiff = `diff --git a/src/worker.ts b/src/worker.ts
--- a/src/worker.ts
+++ b/src/worker.ts
@@ -15,3 +15,7 @@ export function runWorker() {
   try {
     syncData();
+  } catch (e) {
+    logger.error('Error occurred', e);
+    throw new SyncError('Sync failed', { cause: e });
+  }
`;

    const result = await DiffOnDiffAuditor.audit({
      rawDiff: properCatchDiff,
      expectedFiles: ['src/worker.ts'],
    });

    expect(result.passed).toBe(true);
    expect(result.secondaryFindings).toHaveLength(0);
  });

  it('detects introduced defensive nulling patterns (?? 0, || [], || "")', async () => {
    const defensiveNullingDiff = `diff --git a/src/state/account.ts b/src/state/account.ts
--- a/src/state/account.ts
+++ b/src/state/account.ts
@@ -40,4 +40,7 @@ export function getAccountSummary(acc: Account) {
-  return acc.balance;
+  const balance = acc.balance ?? 0;
+  const tags = acc.tags || [];
+  const memo = acc.memo || '';
+  return { balance, tags, memo };
`;

    const result = await DiffOnDiffAuditor.audit({
      rawDiff: defensiveNullingDiff,
      expectedFiles: ['src/state/account.ts'],
    });

    expect(result.passed).toBe(false);
    const nullingFindings = result.secondaryFindings.filter((f) => f.category === 'defensive_nulling');
    expect(nullingFindings.length).toBe(3);
    expect(nullingFindings.some((f) => f.description?.includes('?? 0'))).toBe(true);
    expect(nullingFindings.some((f) => f.description?.includes('|| []'))).toBe(true);
    expect(nullingFindings.some((f) => f.description?.includes("|| ''"))).toBe(true);
    for (const f of nullingFindings) {
      expect(f.ruleId).toBe('DIFF_REGRESSION');
      expect(f.severity).toBe('CRITICAL');
    }
  });

  it('detects secondary syntax errors in modified files', async () => {
    const diff = `diff --git a/src/parser.ts b/src/parser.ts
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,2 +1,3 @@
+const x = ;
`;

    const result = await DiffOnDiffAuditor.audit({
      rawDiff: diff,
      expectedFiles: ['src/parser.ts'],
      fileReader: (filePath) => {
        if (filePath === 'src/parser.ts') return 'const x = ;';
        return null;
      },
    });

    expect(result.passed).toBe(false);
    const syntaxFindings = result.secondaryFindings.filter((f) => f.category === 'syntax_error');
    expect(syntaxFindings.length).toBe(1);
    expect(syntaxFindings[0].ruleId).toBe('DIFF_REGRESSION');
    expect(syntaxFindings[0].description).toContain('Secondary syntax error');
  });

  it('detects secondary test failures from testRunner', async () => {
    const diff = `diff --git a/src/calc.ts b/src/calc.ts
--- a/src/calc.ts
+++ b/src/calc.ts
@@ -1,2 +1,2 @@
-return a + b;
+return a - b;
`;

    const result = await DiffOnDiffAuditor.audit({
      rawDiff: diff,
      expectedFiles: ['src/calc.ts'],
      testRunner: async () => ({
        success: false,
        output: 'FAIL calc.test.ts: expected 4 to equal 2',
        failures: ['tests/calc.test.ts'],
      }),
    });

    expect(result.passed).toBe(false);
    const testFindings = result.secondaryFindings.filter((f) => f.category === 'test_failure');
    expect(testFindings.length).toBe(1);
    expect(testFindings[0].ruleId).toBe('DIFF_REGRESSION');
    expect(testFindings[0].file).toBe('tests/calc.test.ts');
  });

  it('formats diff-on-diff log output for remediation_log.md', async () => {
    const auditor = new DiffOnDiffAuditor();
    const result = {
      passed: false,
      auditedFiles: ['src/foo.ts'],
      secondaryFindings: [
        {
          id: 'f1',
          file: 'src/foo.ts',
          line_range: [15, 15] as [number, number],
          ruleId: 'DIFF_REGRESSION',
          category: 'defensive_nulling' as const,
          description: 'Introduced defensive nulling pattern "?? 0"',
        },
      ],
      summary: 'Diff-on-diff scrutiny failed: 1 secondary regression(s) detected.',
    };

    const log = auditor.formatLog(result, 2);
    expect(log).toContain('### Diff-on-Diff Scrutiny Report (Cycle 2)');
    expect(log).toContain('- Status: FAILED');
    expect(log).toContain('- [DIFF_REGRESSION] (defensive_nulling) src/foo.ts:15: Introduced defensive nulling pattern "?? 0"');
  });
});
