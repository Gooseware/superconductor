import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  MicroSwarmOrchestrator,
  type WorktreeManagerLike,
  type MicroSwarmTaskInfo,
  type MicroSwarmProcessorResult,
} from './micro-swarm-orchestrator.js';
import { HeadlessWatchdog } from './headless-watchdog.js';
import { QuorumCompositionResolver } from '../review/quorum-composition-resolver.js';

describe('MicroSwarmOrchestrator', () => {
  // ---------------------------------------------------------------------------
  // 1. Domain Classification
  // ---------------------------------------------------------------------------
  describe('Domain Classification', () => {
    const orchestrator = new MicroSwarmOrchestrator();

    it('classifies security domain from auth keywords or files', () => {
      const fromIntent = orchestrator.classifyDomains('Fix authentication token expiration');
      expect(fromIntent).toContain('security');

      const fromFile = orchestrator.classifyDomains('', ['src/security/jwt.ts']);
      expect(fromFile).toContain('security');
    });

    it('classifies frontend domain from UI keywords or files', () => {
      const fromIntent = orchestrator.classifyDomains('Update button style and modal view');
      expect(fromIntent).toContain('frontend');

      const fromFile = orchestrator.classifyDomains('', ['packages/ui/Header.tsx']);
      expect(fromFile).toContain('frontend');
    });

    it('classifies logic domain from service/business logic keywords or files', () => {
      const fromIntent = orchestrator.classifyDomains('Optimize sorting algorithm in transaction calculation service');
      expect(fromIntent).toContain('logic');

      const fromFile = orchestrator.classifyDomains('', ['src/services/billing.ts']);
      expect(fromFile).toContain('logic');
    });

    it('classifies tests domain from test keywords or files', () => {
      const fromIntent = orchestrator.classifyDomains('Add vitest coverage for user signup');
      expect(fromIntent).toContain('tests');

      const fromFile = orchestrator.classifyDomains('', ['src/api/user.test.ts']);
      expect(fromFile).toContain('tests');
    });

    it('classifies copy domain from text/doc keywords or files', () => {
      const fromIntent = orchestrator.classifyDomains('Fix typos in readme and error messages wording');
      expect(fromIntent).toContain('copy');

      const fromFile = orchestrator.classifyDomains('', ['docs/architecture.md']);
      expect(fromFile).toContain('copy');
    });

    it('classifies all 5 canonical domains accurately across multi-faceted requests', () => {
      const complexIntent =
        'Update auth security checks, adjust button UI, fix calculation logic, write tests, and update readme copy';
      const domains = orchestrator.classifyDomains(complexIntent);
      expect(domains).toEqual(['security', 'frontend', 'logic', 'tests', 'copy']);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Parsing Intent / Diff into WorkUnits
  // ---------------------------------------------------------------------------
  describe('Parsing Intent / Diff into WorkUnits', () => {
    const orchestrator = new MicroSwarmOrchestrator();

    it('parses formal plan markdown with [TIER-N:TCS=X] without dropping tasks', () => {
      const plan = `
## Phase 1
- [ ] Task: Harden JWT tokens [TIER-2:TCS=3] [AGENT:superconductor-processor] [DOMAIN:security]
- [ ] Task: Adjust nav header [TIER-2:TCS=2] [AGENT:superconductor-processor] [DOMAIN:frontend]
`;
      const units = orchestrator.parseToWorkUnits(plan, ['security', 'frontend']);
      expect(units).toHaveLength(2);
      expect(units[0].task).toBe('Harden JWT tokens');
      expect(units[0].domain).toBe('security');
      expect(units[1].task).toBe('Adjust nav header');
      expect(units[1].domain).toBe('frontend');
    });

    it('synthesizes work units from a unified git diff', () => {
      const diff = `
diff --git a/src/auth/jwt.ts b/src/auth/jwt.ts
--- a/src/auth/jwt.ts
+++ b/src/auth/jwt.ts
@@ -10,3 +10,3 @@
- const expired = false;
+ const expired = true;
diff --git a/src/ui/Button.tsx b/src/ui/Button.tsx
--- a/src/ui/Button.tsx
+++ b/src/ui/Button.tsx
@@ -5,2 +5,2 @@
`;
      const domains = orchestrator.classifyDomains(diff);
      expect(domains).toContain('security');
      expect(domains).toContain('frontend');

      const units = orchestrator.parseToWorkUnits(diff, domains);
      expect(units.length).toBeGreaterThanOrEqual(2);
      expect(units.some((u) => u.domain === 'security')).toBe(true);
      expect(units.some((u) => u.domain === 'frontend')).toBe(true);
    });

    it('synthesizes work units from multi-line bulleted intents', () => {
      const intent = `
- Update authentication middleware
- Fix button layout in modal
- Add unit test coverage
`;
      const domains = orchestrator.classifyDomains(intent);
      const units = orchestrator.parseToWorkUnits(intent, domains);
      expect(units).toHaveLength(3);
      expect(units[0].domain).toBe('security');
      expect(units[1].domain).toBe('frontend');
      expect(units[2].domain).toBe('tests');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Worktree Isolation & Model Routing
  // ---------------------------------------------------------------------------
  describe('Worktree Isolation & Branch Allocation', () => {
    it('allocates isolated worktree branch for each work unit', async () => {
      const allocated: Record<string, string> = {};
      const mockWorktreeManager: WorktreeManagerLike = {
        allocate: vi.fn(async (agentId: string, trackId: string) => {
          const branch = `wt/${agentId}-${trackId}`;
          allocated[agentId] = branch;
          return branch;
        }),
        release: vi.fn(async (agentId: string) => {
          delete allocated[agentId];
        }),
      };

      const orchestrator = new MicroSwarmOrchestrator({
        worktreeManager: mockWorktreeManager,
      });

      const intent = `
- [ ] Task: Fix auth validation [TIER-2:TCS=3] [AGENT:superconductor-processor] [DOMAIN:security]
- [ ] Task: Fix button styling [TIER-2:TCS=3] [AGENT:superconductor-processor] [DOMAIN:frontend]
`;
      const result = await orchestrator.dispatch(intent, {
        trackId: 'test-track',
      });

      expect(mockWorktreeManager.allocate).toHaveBeenCalledTimes(2);
      expect(result.allocatedBranches).toHaveLength(2);
      expect(result.tasks[0].branch).toContain('proc-security');
      expect(result.tasks[1].branch).toContain('proc-frontend');
    });

    it('releases worktrees automatically when autoReleaseWorktrees is true', async () => {
      const mockWorktreeManager: WorktreeManagerLike = {
        allocate: vi.fn(async (agentId: string) => `wt/${agentId}`),
        release: vi.fn(async () => {}),
      };

      const orchestrator = new MicroSwarmOrchestrator();
      await orchestrator.dispatch('Fix calculation logic', {
        worktreeManager: mockWorktreeManager,
        autoReleaseWorktrees: true,
      });

      expect(mockWorktreeManager.release).toHaveBeenCalled();
    });

    it('guarantees worktrees are released in finally even if quorum runner throws unhandled error', async () => {
      const mockWorktreeManager: WorktreeManagerLike = {
        allocate: vi.fn(async (agentId: string) => `wt/${agentId}`),
        release: vi.fn(async () => {}),
      };

      const failingQuorumRunner = vi.fn(async () => {
        throw new Error('Fatal quorum exception');
      });

      const orchestrator = new MicroSwarmOrchestrator();
      await expect(
        orchestrator.dispatch('Fix calculation logic', {
          worktreeManager: mockWorktreeManager,
          quorumRunner: failingQuorumRunner,
          autoReleaseWorktrees: true,
        })
      ).rejects.toThrow('Fatal quorum exception');

      expect(mockWorktreeManager.release).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Parallel Processor Dispatching & Batching
  // ---------------------------------------------------------------------------
  describe('Parallel Processor Dispatch', () => {
    it('dispatches parallel processors in concurrency batches', async () => {
      const spawnedTasks: MicroSwarmTaskInfo[] = [];
      const spawner = vi.fn(async (task: MicroSwarmTaskInfo): Promise<MicroSwarmProcessorResult> => {
        spawnedTasks.push(task);
        return {
          agentId: task.agentId,
          domain: task.domain,
          branch: task.branch,
          success: true,
        };
      });

      const orchestrator = new MicroSwarmOrchestrator();
      const intent = `
- Task 1: Check security tokens
- Task 2: Update modal UI
- Task 3: Calculate totals
- Task 4: Write test cases
- Task 5: Revise help copy
`;
      const result = await orchestrator.dispatch(intent, {
        maxParallel: 2,
        spawner,
      });

      expect(spawner).toHaveBeenCalledTimes(5);
      expect(result.processorResults).toHaveLength(5);
      expect(result.status).toBe('COMPLETED');
    });

    it('reports FAILED when any processor fails', async () => {
      const spawner = vi.fn(async (task: MicroSwarmTaskInfo): Promise<MicroSwarmProcessorResult> => {
        if (task.domain === 'logic') {
          return {
            agentId: task.agentId,
            domain: task.domain,
            success: false,
            error: 'Compilation error',
          };
        }
        return {
          agentId: task.agentId,
          domain: task.domain,
          success: true,
        };
      });

      const orchestrator = new MicroSwarmOrchestrator();
      const result = await orchestrator.dispatch('Update service logic and add unit tests', {
        spawner,
      });

      expect(result.status).toBe('FAILED');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Quorum Review Assembly & Execution
  // ---------------------------------------------------------------------------
  describe('Quorum Review Assembly', () => {
    it('always includes regression-reviewer in assembled quorum panel', async () => {
      const orchestrator = new MicroSwarmOrchestrator();
      const result = await orchestrator.dispatch('Fix algorithm in billing logic');

      expect(result.quorumPanel).toContain('regression-reviewer');
      expect(result.quorumPanel).toContain('security-reviewer');
      expect(result.quorumPanel).toContain('correctness-reviewer');
      expect(result.quorumPanel).toContain('adversarial-reviewer');
    });

    it('mandates ux-reviewer when frontend or copy files/domains are touched', async () => {
      const orchestrator = new MicroSwarmOrchestrator();
      const result = await orchestrator.dispatch('Refactor UI navigation and update banner copy');

      expect(result.quorumPanel).toContain('ux-reviewer');
      expect(result.quorumPanel).toHaveLength(5);
    });

    it('executes quorum runner and reflects PASS / NEEDS_FIXES status', async () => {
      const quorumRunnerPass = vi.fn(async () => ({ passed: true, score: 100 }));
      const orchestrator = new MicroSwarmOrchestrator();

      const passResult = await orchestrator.dispatch('Update logic', {
        quorumRunner: quorumRunnerPass,
      });
      expect(passResult.status).toBe('COMPLETED');
      expect(quorumRunnerPass).toHaveBeenCalled();

      const quorumRunnerFail = vi.fn(async () => ({ passed: false, score: 40 }));
      const failResult = await orchestrator.dispatch('Update logic', {
        quorumRunner: quorumRunnerFail,
      });
      expect(failResult.status).toBe('NEEDS_FIXES');
    });

    it('allows injecting custom QuorumCompositionResolver', async () => {
      const customResolver = new QuorumCompositionResolver();
      const resolveSpy = vi.spyOn(customResolver, 'resolve');

      const orchestrator = new MicroSwarmOrchestrator({
        quorumResolver: customResolver,
      });

      await orchestrator.dispatch('Fix token verification in auth');
      expect(resolveSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. HeadlessWatchdog & Circuit Breakers Integration (§3.4)
  // ---------------------------------------------------------------------------
  describe('HeadlessWatchdog & Circuit Breakers Integration (§3.4)', () => {
    let tempDir: string;
    let statePath: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'micro-swarm-watchdog-'));
      statePath = path.join(tempDir, '.superconductor', 'quorum', 'state.json');
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    const sampleDiff = `
diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,2 +1,2 @@
-const token = null;
+const token = "verified";
`;

    it('persists quorum checkpoint state to disk after execution and review pass', async () => {
      const watchdog = new HeadlessWatchdog({ statePath });
      const orchestrator = new MicroSwarmOrchestrator({ watchdog });

      const result = await orchestrator.dispatch(sampleDiff, {
        trackId: 'track-inv-test',
        cycle: 1,
      });

      expect(result.status).toBe('COMPLETED');
      expect(fs.existsSync(statePath)).toBe(true);

      const persisted = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(persisted.trackId).toBe('track-inv-test');
      expect(persisted.cycle).toBe(1);
      expect(persisted.status).toBe('passed');
      expect(persisted.lastDiffHash).toBe(result.diffHash);
    });

    it('trips STAGNANT_DIFF circuit breaker immediately when diff is identical to previous cycle', async () => {
      const watchdog = new HeadlessWatchdog({ statePath });
      const orchestrator = new MicroSwarmOrchestrator({ watchdog });

      // First cycle: records diff, completes successfully
      const resultCycle1 = await orchestrator.dispatch(sampleDiff, {
        trackId: 'track-stagnant',
        cycle: 1,
      });
      expect(resultCycle1.status).toBe('COMPLETED');

      // Second cycle: same diff passed -> trips STAGNANT_DIFF
      const resultCycle2 = await orchestrator.dispatch(sampleDiff, {
        trackId: 'track-stagnant',
        cycle: 2,
      });

      expect(resultCycle2.status).toBe('CIRCUIT_BROKEN');
      expect(resultCycle2.circuitBreakerReason).toBe('STAGNANT_DIFF');

      // Verify persisted state reflects circuit breaker trip
      const savedState = await watchdog.loadState();
      expect(savedState?.status).toBe('circuit_broken');
      expect(savedState?.metadata?.reason).toBe('STAGNANT_DIFF');
    });

    it('trips MAX_CYCLES_EXCEEDED circuit breaker when cycle limit is reached', async () => {
      const watchdog = new HeadlessWatchdog({ statePath, maxCycles: 3 });
      const orchestrator = new MicroSwarmOrchestrator({ watchdog });

      const result = await orchestrator.dispatch('Fix calculation logic', {
        trackId: 'track-max-cycles',
        cycle: 3,
      });

      expect(result.status).toBe('CIRCUIT_BROKEN');
      expect(result.circuitBreakerReason).toBe('MAX_CYCLES_EXCEEDED');

      const savedState = await watchdog.loadState();
      expect(savedState?.status).toBe('circuit_broken');
      expect(savedState?.metadata?.reason).toBe('MAX_CYCLES_EXCEEDED');
    });

    it('trips WAVE_TIMEOUT circuit breaker when processor wave execution exceeds timeout', async () => {
      const watchdog = new HeadlessWatchdog({ statePath, waveTimeoutMs: 25 });
      const orchestrator = new MicroSwarmOrchestrator({ watchdog });

      // Spawner that exceeds wave timeout
      const slowSpawner = vi.fn(async (task: MicroSwarmTaskInfo): Promise<MicroSwarmProcessorResult> => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return {
          agentId: task.agentId,
          domain: task.domain,
          success: true,
        };
      });

      const result = await orchestrator.dispatch('Fix slow operations in backend service', {
        trackId: 'track-wave-timeout',
        spawner: slowSpawner,
        cycle: 1,
      });

      expect(result.status).toBe('CIRCUIT_BROKEN');
      expect(result.circuitBreakerReason).toBe('WAVE_TIMEOUT');

      const savedState = await watchdog.loadState();
      expect(savedState?.status).toBe('circuit_broken');
      expect(savedState?.metadata?.reason).toBe('WAVE_TIMEOUT');
    });

    it('automatically instantiates HeadlessWatchdog when headless: true option is passed', async () => {
      const orchestrator = new MicroSwarmOrchestrator();
      const result = await orchestrator.dispatch('Refactor payment gateway', {
        headless: true,
        watchdogOptions: { statePath, maxCycles: 2 },
        cycle: 2,
      });

      expect(result.status).toBe('CIRCUIT_BROKEN');
      expect(result.circuitBreakerReason).toBe('MAX_CYCLES_EXCEEDED');
    });
  });
});
