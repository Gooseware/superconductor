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

    it('exposes maxConcurrent as a public getter on ParallelDispatcher', async () => {
        const { ParallelDispatcher } = await import('../../src/dispatcher/parallel-dispatcher.js');
        const dispatcher = new ParallelDispatcher(7);
        expect(dispatcher.maxConcurrent).toBe(7);
    });
});
