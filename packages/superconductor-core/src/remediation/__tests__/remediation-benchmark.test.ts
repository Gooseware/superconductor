import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { evaluateInvariantRules } from '../../review/rules/index.js';
import { TestFixtureTamperRule } from '../../review/rules/invariant-rules.js';
import { HeadlessWatchdog } from '../../orchestration/headless-watchdog.js';
import { computeDiffOnDiff, injectDiffOnDiff } from '../../review/pipeline.js';
import { MicroSwarmOrchestrator } from '../../orchestration/micro-swarm-orchestrator.js';

const mockStagnantDiff = `diff --git a/file.ts b/file.ts
index 000..111 100644
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,1 @@
-const a = 1;
+const a = 1;`;

const mockNewDiff = `diff --git a/file.ts b/file.ts
index 000..111 100644
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,1 @@
-const a = 1;
+const a = 2;`;

describe('End-to-End Remediation Benchmark Suite', () => {

  describe('Scenario A: Whack-a-Mole Elimination (Defensive Nulling Detection)', () => {
    it('detects and rejects consumer-site fallback operators like ?? 0 or || []', () => {
      const codeDiff = `+ const userCount = data.count ?? 0;`;
      const result = evaluateInvariantRules({ files: [{ path: 'test.ts', content: codeDiff, diff: codeDiff }] });
      
      expect(result.summary.highViolations).toBeGreaterThan(0);
      expect(result.violations.some(v => v.ruleId === 'INVARIANT-DEFENSIVE-NULLING')).toBe(true);
    });

    it('passes when origin-level initializer is fixed instead', () => {
      const codeDiff = `+ const data = { count: 0 };`;
      const result = evaluateInvariantRules({ files: [{ path: 'test.ts', content: codeDiff, diff: codeDiff }] });
      
      const hasFallbackViolation = result.violations?.some(v => v.ruleId === 'INVARIANT-DEFENSIVE-NULLING');
      expect(hasFallbackViolation).toBe(false);
    });
  });

  describe('Scenario B: Test Fixture Tampering Detection', () => {
    it('catches and rejects test fixture tampering', () => {
      const codeDiff = `import fs from 'fs';\nfs.writeFileSync('src/__tests__/fixtures/mock.json', '{ "mock": "data" }');`;
      const rule = new TestFixtureTamperRule();
      const result = rule.evaluate({ files: [{ path: 'src/__tests__/some.test.ts', content: codeDiff, diff: codeDiff }] });
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].ruleId).toBe(TestFixtureTamperRule.id);
    });
  });

  describe('Scenario C: Headless Multi-Cycle Convergence & Diff Stability', () => {
    it('triggers STAGNANT_DIFF circuit breaker in <= 2 cycles for identical patches', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'micro-swarm-watchdog-bench-'));
      const statePath = path.join(tempDir, '.superconductor', 'quorum', 'state.json');
      fs.mkdirSync(path.dirname(statePath), { recursive: true });

      const watchdog = new HeadlessWatchdog({ maxCycles: 5, statePath });
      const orchestrator = new MicroSwarmOrchestrator({ watchdog });
      
      const cycle1 = await orchestrator.dispatch(mockStagnantDiff, { trackId: 'bench-track', cycle: 1 });
      expect(cycle1.status).toBe('COMPLETED');
      
      const cycle2 = await orchestrator.dispatch(mockStagnantDiff, { trackId: 'bench-track', cycle: 2 });
      expect(cycle2.status).toBe('CIRCUIT_BROKEN');
      expect(cycle2.circuitBreakerReason).toBe('STAGNANT_DIFF');
    });

    it('converges with status passed in <= 2 cycles for clean root-cause fix', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'micro-swarm-watchdog-bench-'));
      const statePath = path.join(tempDir, '.superconductor', 'quorum', 'state.json');
      fs.mkdirSync(path.dirname(statePath), { recursive: true });

      const watchdog = new HeadlessWatchdog({ maxCycles: 5, statePath });
      const orchestrator = new MicroSwarmOrchestrator({ watchdog });
      
      const cycle1 = await orchestrator.dispatch(mockNewDiff, { trackId: 'bench-track-2', cycle: 1 });
      expect(cycle1.status).toBe('COMPLETED');
      
      const savedState = await watchdog.loadState();
      expect(savedState?.status).toBe('passed');
    });
  });

  describe('Scenario D: Diff-on-Diff Scrutiny', () => {
    it('correctly computes and injects Diff-on-Diff for reviewers', () => {
      const diffOnDiff = `diff --git a/foo b/foo
--- a/foo
+++ b/foo
@@ -1,1 +1,1 @@
-a
+b`;
      
      const injectedPayload = injectDiffOnDiff('Please review this code.', diffOnDiff, 2);
      expect(injectedPayload).toContain('## Diff-on-Diff');
      expect(injectedPayload).toContain(diffOnDiff);
    });
  });

});
