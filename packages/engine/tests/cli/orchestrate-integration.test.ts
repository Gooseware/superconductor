/**
 * orchestrate-integration.test.ts — REV-6 + Wave-2A
 *
 * Integration tests verifying QuorumViolationError propagation through
 * executeTrack: the work unit must transition to FAILED (or an AggregateError
 * containing the QuorumViolationError must be thrown) — NOT silently succeed.
 *
 * Wave-2A adds: strict file-based DONE gating. Even if in-memory state says
 * allGreen, a missing or tampered consensus.json must cause FAILED transition.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SwarmOrchestratorCLI } from '../../src/cli/orchestrate.js';
import { MockAgentSpawner } from '../../src/cli/mock-agent-spawner.js';
import { WorkUnitState } from '@superconductor/core/src/track/work-unit.js';
import { QuorumViolationError } from '../../src/verification/quorum-enforcer.js';
import { QuorumStore } from '../../src/cli/quorum-store.js';
import { ReviewerResponseBroker } from '../../src/verification/reviewer-response-broker.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writePlan(planPath: string, tasks: string[]) {
    const content = `# Plan\n${tasks.join('\n')}\n`;
    fs.writeFileSync(planPath, content, 'utf8');
}

function writeTopography(topoPath: string) {
    fs.writeFileSync(topoPath, JSON.stringify({
        partitions: [],
        dependencyGraph: []
    }), 'utf8');
}

function setupWorkspace(tmpDir: string, trackId: string, tasks: string[]) {
    const trackDir = path.join(tmpDir, '.superconductor', 'tracks', trackId);
    fs.mkdirSync(trackDir, { recursive: true });
    writeTopography(path.join(tmpDir, 'topography.json'));
    writePlan(path.join(trackDir, 'plan.md'), tasks);
}

/**
 * Creates a mock ReviewerResponseBroker that always returns RESOLVED for all reviewers.
 * Use in tests that exercise Wave-2A file-gating logic — the broker result is a pass-through;
 * what matters is the consensus.json written/tampered at the wu-level by QuorumStore.
 */
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

// ---------------------------------------------------------------------------
// Tests — REV-6
// ---------------------------------------------------------------------------

describe('executeTrack — QuorumViolationError integration (REV-6)', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrate-integ-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should transition work unit to FAILED when spawner only returns 3 of 4 required quorum agents', async () => {
        /**
         * Strategy: provide a spawner that resolves fine for the implementor call,
         * but for reviewer invocations only succeeds for 3 of the 4 required agents
         * (the 4th throws). QuorumEnforcer.assertQuorumSpawned then throws
         * QuorumViolationError, which should propagate as an AggregateError
         * and the work unit must be FAILED.
         */
        const { REQUIRED_QUORUM_AGENTS } = await import('../../src/verification/quorum-enforcer.js');

        let implementorCallCount = 0;
        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockImplementation(async (config: import('../../src/cli/agent-spawner.js').AgentSpawnConfig) => {

                // First call = implementor spawn — always succeed
                if (!REQUIRED_QUORUM_AGENTS.includes(role)) {
                    implementorCallCount++;
                    return `conv-implementor-${role}`;
                }
                // Reviewer calls: fail for the last required agent
                const lastAgent = REQUIRED_QUORUM_AGENTS[REQUIRED_QUORUM_AGENTS.length - 1];
                if (role === lastAgent) {
                    throw new Error(`Simulated spawn failure for ${role}`);
                }
                return `conv-reviewer-${role}`;
            });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        setupWorkspace(tmpDir, 'quorum-fail-track', [
            '- [ ] Task: Do something [TIER-3] [AGENT:agent-impl] [DOMAIN:core]'
        ]);

        let thrownError: any;
        try {
            await cli.executeTrack(tmpDir, 'quorum-fail-track');
        } catch (err) {
            thrownError = err;
        }

        // Must throw — cannot silently succeed
        expect(thrownError).toBeDefined();

        // Work unit must be FAILED
        const workUnits = (thrownError as any)?.workUnits;
        expect(workUnits).toBeDefined();
        expect(workUnits[0].state).toBe(WorkUnitState.FAILED);
    });

    it('should transition work unit to FAILED and throw AggregateError when spawner throws on implementor invocation', async () => {
        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockRejectedValue(new Error('Spawner network failure'));

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        setupWorkspace(tmpDir, 'spawner-throw-track', [
            '- [ ] Task: Failing task [TIER-3] [AGENT:agent-fail] [DOMAIN:core]'
        ]);

        let thrownError: any;
        try {
            await cli.executeTrack(tmpDir, 'spawner-throw-track');
        } catch (err) {
            thrownError = err;
        }

        // Must throw — cannot silently succeed
        expect(thrownError).toBeDefined();

        // Work unit should be FAILED
        const workUnits = (thrownError as any)?.workUnits;
        expect(workUnits).toBeDefined();
        expect(workUnits[0].state).toBe(WorkUnitState.FAILED);
    });

    it('should NOT set allGreen:true without going through QuorumEnforcer when spawner is provided', async () => {
        /**
         * Verifies there is no backdoor path that auto-approves work units.
         * When a spawner is provided, the reviewers MUST be invoked via the
         * spawner and QuorumEnforcer MUST run.
         *
         * A successful run: spawner returns a conversationId for all 4+1 calls
         * (implementor + 4 quorum agents). Work unit should be DONE with
         * reviewers = REQUIRED_QUORUM_AGENTS.
         *
         * Phase 4: Inject a resolved mock broker so the test doesn't block on
         * file-watching for reviewer consensus files.
         */
        const { REQUIRED_QUORUM_AGENTS } = await import('../../src/verification/quorum-enforcer.js');

        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-ok', synthetic: false });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        // Phase 4: inject resolved broker to avoid file-watch blocking in tests.
        cli.reviewerBroker = makeResolvedBroker();
        setupWorkspace(tmpDir, 'quorum-success-track', [
            '- [ ] Task: Successful task [TIER-3] [AGENT:agent-ok] [DOMAIN:core]'
        ]);

        const result = await cli.executeTrack(tmpDir, 'quorum-success-track');

        // Work unit must be DONE
        expect(result.workUnits[0].state).toBe(WorkUnitState.DONE);

        // Reviewers must match REQUIRED_QUORUM_AGENTS (REV-7 consistency)
        expect(result.workUnits[0].reviewers).toEqual([...REQUIRED_QUORUM_AGENTS]);

        // Spawner must have been called for implementor + all 4 quorum agents
        expect(mockSpawner.spawn).toHaveBeenCalledTimes(
            1 + REQUIRED_QUORUM_AGENTS.length
        );
    });
});

// ---------------------------------------------------------------------------
// Tests — Wave-2A: Strict file-based DONE gating
// ---------------------------------------------------------------------------

describe('executeTrack — strict file-based DONE gating (Wave-2A)', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrate-wave2a-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should transition to FAILED if consensus.json is deleted after being written', async () => {
        /**
         * Strategy: use a spawner that succeeds for all agents. Then intercept
         * the quorum store by using a tampered QuorumStore subclass that deletes
         * the consensus.json file immediately after it is written.
         *
         * The orchestrator must detect the missing file and transition to FAILED
         * instead of DONE — even though in-memory state was allGreen.
         *
         * Phase 4: Inject a resolved mock broker so the test doesn't block on
         * file-watching for reviewer consensus files.
         */
        const { REQUIRED_QUORUM_AGENTS } = await import('../../src/verification/quorum-enforcer.js');

        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-ok', synthetic: false });

        // Set up workspace
        setupWorkspace(tmpDir, 'consensus-delete-track', [
            '- [ ] Task: Successful task [TIER-3] [AGENT:agent-ok] [DOMAIN:core]'
        ]);

        // Create a proxy that deletes consensus.json after writing it
        const store = new QuorumStore(tmpDir);
        const originalWrite = store.writeConsensus.bind(store);
        store.writeConsensus = async (wuId: string, artifact: any) => {
            await originalWrite(wuId, artifact);
            // Delete the file immediately — simulating filesystem failure / external deletion
            const consensusPath = store.getConsensusPath(wuId);
            fs.unlinkSync(consensusPath);
        };

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        // Inject the tampered store via the test-friendly setter
        (cli as any).quorumStore = store;
        // Phase 4: inject resolved broker to avoid file-watch blocking in tests.
        cli.reviewerBroker = makeResolvedBroker();

        let thrownError: any;
        try {
            await cli.executeTrack(tmpDir, 'consensus-delete-track');
        } catch (err) {
            thrownError = err;
        }

        // Must throw
        expect(thrownError).toBeDefined();

        // Work unit must be FAILED, not DONE
        const workUnits = (thrownError as any)?.workUnits;
        expect(workUnits).toBeDefined();
        expect(workUnits[0].state).toBe(WorkUnitState.FAILED);
    });

    it('should transition to FAILED if consensus.json has allGreen:false on disk', async () => {
        /**
         * Strategy: use a spawner that succeeds for all agents. Intercept the
         * QuorumStore so that after writeConsensus, we overwrite the file with
         * allGreen:false.
         *
         * The orchestrator must read back the disk file and transition to FAILED
         * because the disk-artifact has allGreen !== true.
         *
         * Phase 4: Inject a resolved mock broker so the test doesn't block on
         * file-watching for reviewer consensus files.
         */
        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-ok', synthetic: false });

        setupWorkspace(tmpDir, 'consensus-tampered-track', [
            '- [ ] Task: Successful task [TIER-3] [AGENT:agent-ok] [DOMAIN:core]'
        ]);

        const store = new QuorumStore(tmpDir);
        const originalWrite = store.writeConsensus.bind(store);
        store.writeConsensus = async (wuId: string, artifact: any) => {
            await originalWrite(wuId, artifact);
            // Tamper: overwrite with allGreen:false
            const consensusPath = store.getConsensusPath(wuId);
            fs.writeFileSync(consensusPath, JSON.stringify({ allGreen: false, payload: ['tampered'] }), 'utf8');
        };

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        (cli as any).quorumStore = store;
        // Phase 4: inject resolved broker to avoid file-watch blocking in tests.
        cli.reviewerBroker = makeResolvedBroker();

        let thrownError: any;
        try {
            await cli.executeTrack(tmpDir, 'consensus-tampered-track');
        } catch (err) {
            thrownError = err;
        }

        // Must throw
        expect(thrownError).toBeDefined();

        // Work unit must be FAILED, not DONE
        const workUnits = (thrownError as any)?.workUnits;
        expect(workUnits).toBeDefined();
        expect(workUnits[0].state).toBe(WorkUnitState.FAILED);
    });

    it('should write consensus.json to disk on successful quorum review', async () => {
        /**
         * Verifies that executeTrack writes a consensus.json file to
         * .superconductor/quorum/<wu_id>/consensus.json when allGreen.
         *
         * Phase 4: Inject a resolved mock broker so the test doesn't block on
         * file-watching for reviewer consensus files.
         */
        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-ok', synthetic: false });

        setupWorkspace(tmpDir, 'consensus-write-track', [
            '- [ ] Task: Successful task [TIER-3] [AGENT:agent-ok] [DOMAIN:core]'
        ]);

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        // Phase 4: inject resolved broker to avoid file-watch blocking in tests.
        cli.reviewerBroker = makeResolvedBroker();
        const result = await cli.executeTrack(tmpDir, 'consensus-write-track');

        expect(result.workUnits[0].state).toBe(WorkUnitState.DONE);

        // consensus.json must exist on disk
        const wuId = result.workUnits[0].unitId;
        const consensusPath = path.join(tmpDir, '.superconductor', 'quorum', wuId, 'consensus.json');
        expect(fs.existsSync(consensusPath)).toBe(true);

        const diskArtifact = JSON.parse(fs.readFileSync(consensusPath, 'utf8'));
        expect(diskArtifact.allGreen).toBe(true);
    });
});
