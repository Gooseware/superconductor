/**
 * Tests for Phase 2: Global Preflight (single run) + Parallel Batch Dispatch
 *
 * Task 1: PreflightTestRunner.run() must be called ONCE regardless of WU count.
 * Task 2: Implementors are dispatched in parallel batches (maxConcurrent at a time).
 * Task 3: noPreflight skips the runner entirely.
 * Task 4: Failed global preflight halts the track before any implementors are spawned.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SwarmOrchestratorCLI } from '../../src/cli/orchestrate.js';
import { MockAgentSpawner } from '../../src/cli/mock-agent-spawner.js';
import { ReviewerResponseBroker } from '../../src/verification/reviewer-response-broker.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolvedBroker(): ReviewerResponseBroker {
    return {
        aggregate: vi.fn().mockResolvedValue([
            { reviewerId: 'r1', findings: { status: 'RESOLVED' }, timedOut: false },
            { reviewerId: 'r2', findings: { status: 'RESOLVED' }, timedOut: false },
            { reviewerId: 'r3', findings: { status: 'RESOLVED' }, timedOut: false },
            { reviewerId: 'r4', findings: { status: 'RESOLVED' }, timedOut: false },
        ]),
        isConsensusResolved: () => true,
    } as unknown as ReviewerResponseBroker;
}

function makeFreshTmpDir(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-preflight-parallel-'));
    fs.mkdirSync(path.join(tmpDir, '.superconductor'), { recursive: true });
    fs.writeFileSync(
        path.join(tmpDir, '.superconductor', 'agent-config.md'),
        '# Config\n- swarm: true\n- restrict_root: false\n',
        'utf8',
    );
    fs.writeFileSync(
        path.join(tmpDir, 'topography.json'),
        JSON.stringify({ partitions: [{ id: 'core', files: [], hotspotScore: 1, coverageGap: 0, reviewers: [] }], dependencyGraph: [] }),
        'utf8',
    );
    return tmpDir;
}

function writeNTaskPlan(tmpDir: string, trackId: string, n: number): void {
    const safeTrackId = trackId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const trackDir = path.join(tmpDir, '.superconductor', 'tracks', safeTrackId);
    fs.mkdirSync(trackDir, { recursive: true });
    const lines: string[] = [];
    for (let i = 1; i <= n; i++) {
        // Each WU must have a unique domain to avoid ImplementorRegistry "Architectural Drift" guard
        lines.push(`- [ ] Task: Task ${i} [TIER-3] [AGENT:agent-${i}] [DOMAIN:domain-${i}]`);
    }
    fs.writeFileSync(path.join(trackDir, 'plan.md'), `# Plan\n${lines.join('\n')}\n`, 'utf8');
}

function makePassingReport() {
    return {
        timestamp: Date.now(),
        testCommand: 'npm test',
        buildCommand: 'npm run build',
        testExitCode: 0,
        buildExitCode: 0,
        testOutput: 'All tests passed',
        buildOutput: 'Build succeeded',
        passed: true,
        durationMs: 100,
    };
}

function makeFailingReport() {
    return {
        ...makePassingReport(),
        testExitCode: 1,
        testOutput: 'FAIL: 1 test failed',
        passed: false,
    };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Phase 2: Global preflight + parallel batch dispatch', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeFreshTmpDir();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('runs PreflightTestRunner.run() exactly once regardless of WU count', async () => {
        const N = 5;
        writeNTaskPlan(tmpDir, 'preflight-once-track', N);

        const { PreflightTestRunner } = await import('../../src/verification/preflight-test-runner.js');
        const runSpy = vi.spyOn(PreflightTestRunner.prototype, 'run').mockResolvedValue(makePassingReport() as any);

        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-ok', synthetic: false });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        cli.reviewerBroker = makeResolvedBroker();

        await cli.executeTrack(tmpDir, 'preflight-once-track');

        expect(runSpy).toHaveBeenCalledTimes(1);
    });

    it('does NOT call PreflightTestRunner.run() when noPreflight is true', async () => {
        writeNTaskPlan(tmpDir, 'no-preflight-track', 3);

        const { PreflightTestRunner } = await import('../../src/verification/preflight-test-runner.js');
        const runSpy = vi.spyOn(PreflightTestRunner.prototype, 'run').mockResolvedValue(makePassingReport() as any);

        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-ok', synthetic: false });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        cli.reviewerBroker = makeResolvedBroker();

        await cli.executeTrack(tmpDir, 'no-preflight-track', { noPreflight: true });

        expect(runSpy).not.toHaveBeenCalled();
    });

    it('throws and spawns zero implementors when global preflight fails', async () => {
        writeNTaskPlan(tmpDir, 'fail-preflight-track', 4);

        const { PreflightTestRunner } = await import('../../src/verification/preflight-test-runner.js');
        vi.spyOn(PreflightTestRunner.prototype, 'run').mockResolvedValue(makeFailingReport() as any);

        const mockSpawner = new MockAgentSpawner();
        const spawnSpy = vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-ok', synthetic: false });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        cli.reviewerBroker = makeResolvedBroker();

        let thrownError: any;
        try {
            await cli.executeTrack(tmpDir, 'fail-preflight-track');
        } catch (err) {
            thrownError = err;
        }

        expect(thrownError).toBeDefined();
        expect(thrownError.message).toMatch(/Global preflight failed/);
        expect(spawnSpy).not.toHaveBeenCalled();
        expect(thrownError.workUnits).toBeDefined();
        expect(thrownError.workUnits.length).toBe(4);
        thrownError.workUnits.forEach((wu: any) => {
            expect(wu.state).toBe('FAILED');
        });
    });

    it('successfully dispatches all N work units in parallel batches', async () => {
        const N = 8;
        writeNTaskPlan(tmpDir, 'parallel-batch-track', N);

        const { PreflightTestRunner } = await import('../../src/verification/preflight-test-runner.js');
        vi.spyOn(PreflightTestRunner.prototype, 'run').mockResolvedValue(makePassingReport() as any);

        let spawnCount = 0;
        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockImplementation(async (_cfg) => {
            spawnCount++;
            return { conversationId: `conv-${spawnCount}`, synthetic: false };
        });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        cli.reviewerBroker = makeResolvedBroker();

        await cli.executeTrack(tmpDir, 'parallel-batch-track');

        const { REQUIRED_QUORUM_AGENTS } = await import('../../src/verification/quorum-enforcer.js');
        // Each WU spawns 1 implementor + N reviewers
        expect(spawnCount).toBe(N * (1 + REQUIRED_QUORUM_AGENTS.length));
    });

    it('dispatches first batch of 5 WUs in parallel before second batch starts (REV-ADV-001)', async () => {
        const BATCH_SIZE = 5;
        const WU_COUNT = 8;
        writeNTaskPlan(tmpDir, 'parallelism-proof-track', WU_COUNT);

        const { PreflightTestRunner } = await import('../../src/verification/preflight-test-runner.js');
        vi.spyOn(PreflightTestRunner.prototype, 'run').mockResolvedValue(makePassingReport() as any);

        // resolvers[i] unblocks the i-th implementor spawn.
        // Reviewer spawns resolve immediately so they don't interfere with the count.
        const resolvers: Array<() => void> = [];
        let implementorSpawnCount = 0;

        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockImplementation(async (cfg) => {
            // Implementor roles follow the AGENT: pattern from the plan (agent-1 … agent-8).
            // Reviewer roles are the fixed REQUIRED_QUORUM_AGENTS names.
            // We distinguish them by role prefix.
            const isImplementor = /^agent-\d+$/.test(cfg.role);
            if (isImplementor) {
                implementorSpawnCount++;
                // Block until the test manually resolves us — proves in-flight parallelism.
                await new Promise<void>(resolve => resolvers.push(resolve));
            }
            return { conversationId: `conv-${cfg.role}`, synthetic: false };
        });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        cli.reviewerBroker = makeResolvedBroker();

        // Kick off executeTrack without awaiting — we need to interleave with it.
        const execPromise = cli.executeTrack(tmpDir, 'parallelism-proof-track', { noPreflight: true });

        // Drain the microtask queue enough for all first-batch spawns to be initiated.
        // Each WU starts its implementor spawn asynchronously via buildDispatchPromise.
        // After enough microtask ticks the entire first batch should be suspended at `await new Promise(...)`.
        for (let tick = 0; tick < 20; tick++) {
            await new Promise<void>(r => setImmediate(r));
        }

        // CORE ASSERTION (AC-2): exactly BATCH_SIZE implementor spawns are in-flight
        // simultaneously, and none have resolved yet.
        expect(resolvers.length).toBe(BATCH_SIZE);

        // Resolve all first-batch implementors — this unblocks them so reviewer spawns
        // can start and batch-1 can complete.
        for (let i = 0; i < BATCH_SIZE; i++) resolvers[i]();

        // Give the engine time to complete batch-1 and kick off batch-2.
        for (let tick = 0; tick < 20; tick++) {
            await new Promise<void>(r => setImmediate(r));
        }

        // The remaining (WU_COUNT - BATCH_SIZE) implementors should now also be in-flight.
        expect(resolvers.length).toBe(WU_COUNT);

        // Resolve the remaining batch so executeTrack can finish.
        for (let i = BATCH_SIZE; i < WU_COUNT; i++) resolvers[i]();

        await execPromise;
        expect(implementorSpawnCount).toBe(WU_COUNT);
    });

    it('correctly splits into remainder batch when WU count is not a multiple of maxConcurrent (REV-ADV-003)', async () => {
        const BATCH_SIZE = 2; // override default of 5
        const WU_COUNT = 5;   // batches: [2, 2, 1]
        writeNTaskPlan(tmpDir, 'remainder-batch-track', WU_COUNT);

        const { PreflightTestRunner } = await import('../../src/verification/preflight-test-runner.js');
        vi.spyOn(PreflightTestRunner.prototype, 'run').mockResolvedValue(makePassingReport() as any);

        // Track which implementors were in-flight at each "snapshot" moment.
        // We block implementor spawns per batch and measure how many are in-flight.
        const resolvers: Array<() => void> = [];
        const batchSnapshots: number[] = []; // snapshot of batch sizes fired per batch

        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockImplementation(async (cfg) => {
            const isImplementor = /^agent-\d+$/.test(cfg.role);
            if (isImplementor) {
                await new Promise<void>(resolve => resolvers.push(resolve));
            }
            return { conversationId: `conv-${cfg.role}`, synthetic: false };
        });

        const { ParallelDispatcher } = await import('../../src/dispatcher/parallel-dispatcher.js');

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        // Override dispatcher to use maxConcurrent = BATCH_SIZE
        cli.dispatcher = new ParallelDispatcher(BATCH_SIZE);
        cli.reviewerBroker = makeResolvedBroker();

        const execPromise = cli.executeTrack(tmpDir, 'remainder-batch-track', { noPreflight: true });

        // --- Batch 1: expect BATCH_SIZE (2) in-flight ---
        for (let tick = 0; tick < 20; tick++) await new Promise<void>(r => setImmediate(r));
        batchSnapshots.push(resolvers.length); // should be 2
        for (let i = 0; i < batchSnapshots[0]; i++) resolvers[i]();

        // --- Batch 2: expect 2 more in-flight (total 4) ---
        for (let tick = 0; tick < 20; tick++) await new Promise<void>(r => setImmediate(r));
        const afterBatch2 = resolvers.length - batchSnapshots[0];
        batchSnapshots.push(afterBatch2); // should be 2
        for (let i = batchSnapshots[0]; i < resolvers.length; i++) resolvers[i]();

        // --- Batch 3: expect 1 more in-flight (total 5 = WU_COUNT) ---
        for (let tick = 0; tick < 20; tick++) await new Promise<void>(r => setImmediate(r));
        const afterBatch3 = resolvers.length - batchSnapshots[0] - batchSnapshots[1];
        batchSnapshots.push(afterBatch3); // should be 1
        for (let i = batchSnapshots[0] + batchSnapshots[1]; i < resolvers.length; i++) resolvers[i]();

        await execPromise;

        // Verify the three batch sizes: [2, 2, 1]
        expect(batchSnapshots).toEqual([BATCH_SIZE, BATCH_SIZE, WU_COUNT - BATCH_SIZE * 2]);
        expect(resolvers.length).toBe(WU_COUNT);
    });

    it('exposes maxConcurrent as a public getter on ParallelDispatcher', async () => {
        const { ParallelDispatcher } = await import('../../src/dispatcher/parallel-dispatcher.js');
        const dispatcher = new ParallelDispatcher(7);
        expect(dispatcher.maxConcurrent).toBe(7);
    });

    // REV-ADV-002: reviewer spawn failures must emit orchestration_error (not silently absorb)
    it('emits orchestration_error when a reviewer spawn fails (REV-ADV-002)', async () => {
        writeNTaskPlan(tmpDir, 'rev-adv-002-track', 1);

        const { PreflightTestRunner } = await import('../../src/verification/preflight-test-runner.js');
        vi.spyOn(PreflightTestRunner.prototype, 'run').mockResolvedValue(makePassingReport() as any);

        const mockSpawner = new MockAgentSpawner();
        let spawnCallCount = 0;
        vi.spyOn(mockSpawner, 'spawn').mockImplementation(async (_cfg) => {
            spawnCallCount++;
            // First call = implementor spawn (succeeds); subsequent calls = reviewer spawns (fail)
            if (spawnCallCount === 1) {
                return { conversationId: 'conv-impl-1', synthetic: false };
            }
            throw new Error('reviewer spawn failed intentionally');
        });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        // No reviewerBroker — spawner path is used for reviewers
        const emittedErrors: unknown[] = [];
        cli.on('orchestration_error', ({ error }) => {
            emittedErrors.push(error);
        });

        // The track may or may not throw (quorum violation); we only care about the event
        try {
            await cli.executeTrack(tmpDir, 'rev-adv-002-track');
        } catch (_) {
            // expected — quorum will be violated because reviewers fail
        }

        // At least one orchestration_error must have been emitted for the reviewer failure
        expect(emittedErrors.length).toBeGreaterThan(0);
        const reviewerError = emittedErrors.find(
            (e) => e instanceof Error && (e as Error).message.includes('reviewer spawn failed intentionally')
        );
        expect(reviewerError).toBeDefined();
    });
});
