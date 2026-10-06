import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AutonomousQuorumRemediationLoop,
  QuorumRemediationLoop,
  QuorumReviewResult,
} from '../../src/remediation/quorum-remediation-loop.js';
import { DomainSplitRemediationDispatcher } from '../../src/remediation/domain-split-remediation-dispatcher.js';
import { DomainClassifier, Finding } from '../../src/remediation/domain-classifier.js';
import { DeepResearchEscalationHandler } from '../../src/remediation/deep-research-escalation-handler.js';

describe('Autonomous Quorum Remediation Loop (Core Integration)', () => {
  let mockWorktreeManager: any;
  let mockSpawner: any;
  let mockEscalationHandler: any;

  beforeEach(() => {
    mockWorktreeManager = {
      allocate: vi.fn().mockImplementation(async (agentId: string, trackId: string) => {
        return `wt/${agentId}-${trackId}`;
      }),
      release: vi.fn().mockResolvedValue(undefined),
    };
    mockSpawner = vi.fn().mockImplementation(async (info: any) => {
      return { success: true, agentId: info.agentId };
    });
    mockEscalationHandler = {
      escalate: vi.fn().mockResolvedValue({
        classification: 'auto-applicable',
        researchContent: 'Fix suggestion from research',
        spotlightedContent: 'Apply patch to resolve security/logic issue',
      }),
      handlePolicyDecision: vi.fn().mockResolvedValue('applied'),
    };
  });

  it('runs auto-remediation loop: Quorum → NEEDS_FIXES → Remediation → re-review → stop when RESOLVED (all green)', async () => {
    let diff = 'diff --git a/auth.ts b/auth.ts\n+const token = "secret";';
    const getDiffFn = vi.fn().mockImplementation(() => diff);

    mockSpawner = vi.fn().mockImplementation(async (info: any) => {
      // Remediator modifies the code diff
      diff = 'diff --git a/auth.ts b/auth.ts\n+const token = process.env.SECRET;';
      return { success: true, agentId: info.agentId };
    });

    // Mock reviewer: Cycle 1 fails with findings, Cycle 2 passes clean
    const reviewerFn = vi.fn().mockImplementation(async (cycle: number) => {
      if (cycle === 1) {
        return {
          status: 'NEEDS_FIXES' as const,
          findings: [
            { id: 'F1', file: 'src/auth/jwt.ts', severity: 'HIGH', description: 'Hardcoded secret' },
            { id: 'F2', file: 'tests/auth.test.ts', severity: 'MEDIUM', description: 'Missing test coverage' },
          ],
        };
      } else {
        return {
          status: 'RESOLVED' as const,
          findings: [],
        };
      }
    });

    const dispatcher = new DomainSplitRemediationDispatcher({
      worktreeManager: mockWorktreeManager,
      spawner: mockSpawner,
    });

    const loop = new AutonomousQuorumRemediationLoop({
      trackId: 'track-remediation-test',
      reviewerFn,
      getDiffFn,
      dispatcher,
      maxCycles: 5,
    });

    const result = await loop.run();

    expect(result.allGreen).toBe(true);
    expect(result.state).toBe('PASSED');
    expect(result.cycles).toBe(2);
    expect(result.stagnantDiffDetected).toBe(false);
    expect(result.deepResearchEscalated).toBe(false);

    // Verify dispatcher was invoked for cycle 1 findings
    expect(mockSpawner).toHaveBeenCalled();
    expect(mockWorktreeManager.allocate).toHaveBeenCalled();
  });

  it('stops immediately on cycle 1 when initial review is completely clean (all green)', async () => {
    const reviewerFn = vi.fn().mockResolvedValue({
      status: 'RESOLVED',
      findings: [],
    });

    const loop = new AutonomousQuorumRemediationLoop({
      trackId: 'clean-track',
      reviewerFn,
      getDiffFn: () => 'clean diff',
      maxCycles: 5,
    });

    const result = await loop.run();

    expect(result.allGreen).toBe(true);
    expect(result.state).toBe('PASSED');
    expect(result.cycles).toBe(1);
    expect(reviewerFn).toHaveBeenCalledTimes(1);
  });

  it('groups findings across 5 distinct domains (security, logic, tests, types, config) and dispatches in parallel', async () => {
    const classifier = new DomainClassifier();

    const findings: Finding[] = [
      { id: 'f-sec', file: 'auth/jwt.ts', severity: 'CRITICAL', description: 'Security flaw', domain: 'security' },
      { id: 'f-logic', file: 'src/services/order.ts', severity: 'HIGH', description: 'Logic bug', domain: 'logic' },
      { id: 'f-test', file: 'tests/order.test.ts', severity: 'MEDIUM', description: 'Missing test', domain: 'tests' },
      { id: 'f-types', file: 'src/types/index.d.ts', severity: 'LOW', description: 'Type mismatch', domain: 'types' },
      { id: 'f-config', file: 'config/app.json', severity: 'LOW', description: 'Config typo', domain: 'config' },
    ];

    const grouped = classifier.groupByDomain(findings);
    expect(Object.keys(grouped)).toContain('security');
    expect(Object.keys(grouped)).toContain('logic');
    expect(Object.keys(grouped)).toContain('tests');
    expect(Object.keys(grouped)).toContain('types');
    expect(Object.keys(grouped)).toContain('config');

    const dispatcher = new DomainSplitRemediationDispatcher({
      worktreeManager: mockWorktreeManager,
      spawner: mockSpawner,
      domainClassifier: classifier,
    });

    const dispatchResult = await dispatcher.dispatch(findings, { trackId: 'track-5-domains' });

    expect(dispatchResult.spawned.length).toBe(5);
    expect(mockSpawner).toHaveBeenCalledTimes(5);
    expect(mockWorktreeManager.allocate).toHaveBeenCalledTimes(5);

    const spawnedDomains = dispatchResult.spawned.map((s) => s.domain);
    expect(spawnedDomains).toContain('security');
    expect(spawnedDomains).toContain('logic');
    expect(spawnedDomains).toContain('tests');
    expect(spawnedDomains).toContain('types');
    expect(spawnedDomains).toContain('config');
  });

  it('trips circuit breaker after 3 cycles with persistent findings and triggers Deep Research escalation', async () => {
    let cycleCount = 0;
    const getDiffFn = vi.fn().mockImplementation(() => {
      cycleCount++;
      return `diff version ${cycleCount}`;
    });

    const persistentFindings: Finding[] = [
      { id: 'f-persistent', file: 'src/logic/complex.ts', severity: 'CRITICAL', description: 'Persistent race condition' },
    ];

    const reviewerFn = vi.fn().mockResolvedValue({
      status: 'NEEDS_FIXES',
      findings: persistentFindings,
    });

    const dispatcher = new DomainSplitRemediationDispatcher({
      worktreeManager: mockWorktreeManager,
      spawner: mockSpawner,
    });

    const loop = new AutonomousQuorumRemediationLoop({
      trackId: 'track-circuit-breaker',
      reviewerFn,
      getDiffFn,
      dispatcher,
      escalationHandler: mockEscalationHandler as DeepResearchEscalationHandler,
      maxCycles: 3,
    });

    const result = await loop.run();

    expect(result.allGreen).toBe(false);
    expect(result.state).toBe('HALTED');
    expect(result.cycles).toBe(3);
    expect(result.deepResearchEscalated).toBe(true);
    expect(mockEscalationHandler.escalate).toHaveBeenCalled();
  });

  it('trips circuit breaker immediately when STAGNANT_DIFF is detected', async () => {
    // Diff never changes despite remediation
    const constantDiff = 'diff --git a/stagnant.ts b/stagnant.ts\n+const x = 1;';
    const getDiffFn = vi.fn().mockReturnValue(constantDiff);

    const reviewerFn = vi.fn().mockResolvedValue({
      status: 'NEEDS_FIXES',
      findings: [{ id: 'f1', file: 'src/stagnant.ts', severity: 'HIGH', description: 'Unfixed issue' }],
    });

    const loop = new AutonomousQuorumRemediationLoop({
      trackId: 'track-stagnant',
      reviewerFn,
      getDiffFn,
      maxCycles: 5,
    });

    const result = await loop.run();

    expect(result.allGreen).toBe(false);
    expect(result.state).toBe('HALTED');
    expect(result.stagnantDiffDetected).toBe(true);
  });

  it('aborts loop and transitions to HALTED when DiffOnDiffAuditor detects secondary regression in cycle 2', async () => {
    const tmpLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-remed-log-'));
    const logFilePath = path.join(tmpLogDir, 'remediation_log.md');

    let cycleCount = 0;
    // Cycle 1: initial diff
    // Cycle 2: remediator introduces defensive nulling and swallowed exception
    const getDiffFn = vi.fn().mockImplementation(() => {
      cycleCount++;
      if (cycleCount === 1) {
        return 'diff --git a/src/logic/order.ts b/src/logic/order.ts\n+const x = 1;';
      }
      return `diff --git a/src/logic/order.ts b/src/logic/order.ts
--- a/src/logic/order.ts
+++ b/src/logic/order.ts
@@ -10,3 +10,6 @@
+    const fallback = order.items ?? [];
+    try { run(); } catch (e) {}
`;
    });

    const reviewerFn = vi.fn().mockImplementation(async (cycle: number) => {
      if (cycle === 1) {
        return {
          status: 'NEEDS_FIXES' as const,
          findings: [
            { id: 'f1', file: 'src/logic/order.ts', severity: 'HIGH', description: 'Order logic bug' },
          ],
        };
      }
      return {
        status: 'RESOLVED' as const,
        findings: [],
      };
    });

    const dispatcher = new DomainSplitRemediationDispatcher({
      worktreeManager: mockWorktreeManager,
      spawner: mockSpawner,
    });

    const loop = new QuorumRemediationLoop({
      trackId: 'track-secondary-regression',
      reviewerFn,
      getDiffFn,
      dispatcher,
      remediationLogPath: logFilePath,
      maxCycles: 5,
    });

    const result = await loop.run();

    // Loop aborted early on cycle 2 without running re-review
    expect(result.allGreen).toBe(false);
    expect(result.state).toBe('HALTED');
    expect(result.secondaryRegressionDetected).toBe(true);
    expect(result.cycles).toBe(2);
    expect(reviewerFn).toHaveBeenCalledTimes(1); // Reviewer was NOT called for cycle 2!

    // Verify secondary findings contain DIFF_REGRESSION
    expect(result.unresolvedFindings.length).toBeGreaterThan(0);
    expect(result.unresolvedFindings.every((f) => f.ruleId === 'DIFF_REGRESSION')).toBe(true);

    // Verify remediation_log.md contains the audit entry
    expect(fs.existsSync(logFilePath)).toBe(true);
    const logContent = fs.readFileSync(logFilePath, 'utf8');
    expect(logContent).toContain('Diff-on-Diff Scrutiny Report (Cycle 2)');
    expect(logContent).toContain('Status: FAILED');
    expect(logContent).toContain('DIFF_REGRESSION');

    fs.rmSync(tmpLogDir, { recursive: true, force: true });
  });

  it('allows direct invocation of runCycle with DiffOnDiffAuditor scrutiny', async () => {
    const loop = new QuorumRemediationLoop({
      trackId: 'track-runcycle-direct',
      reviewerFn: async () => ({ status: 'RESOLVED', findings: [] }),
      getDiffFn: () => 'clean diff',
    });

    // Cycle 1: passes clean
    const res1 = await loop.runCycle(1, 'diff --git a/a.ts b/a.ts\n+const x = 1;', []);
    expect(res1.status).toBe('ALL_PASSED');

    // Cycle 2: passes clean if diff is clean
    const res2 = await loop.runCycle(2, 'diff --git a/a.ts b/a.ts\n+const x = 2;', [
      { id: 'f1', file: 'a.ts' },
    ]);
    expect(res2.status).toBe('ALL_PASSED');

    // Cycle 2: returns SECONDARY_REGRESSION if defensive nulling is introduced
    const dirtyDiff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,2 +1,3 @@
+const y = x ?? 0;
`;
    const resReg = await loop.runCycle(2, dirtyDiff, [{ id: 'f1', file: 'a.ts' }]);
    expect(resReg.status).toBe('SECONDARY_REGRESSION');
    expect(resReg.findings[0].category).toBe('defensive_nulling');
  });
});

