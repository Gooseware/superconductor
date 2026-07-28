/**
 * orchestrate-integration.test.ts — REV-6
 *
 * Integration tests verifying QuorumViolationError propagation through
 * executeTrack: the work unit must transition to FAILED (or an AggregateError
 * containing the QuorumViolationError must be thrown) — NOT silently succeed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SwarmOrchestratorCLI, IAgentSpawner } from '../../src/cli/orchestrate.js';
import { WorkUnitState } from '@superconductor/core/src/track/work-unit.js';
import { QuorumViolationError } from '../../src/verification/quorum-enforcer.js';
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
        const mockSpawner: IAgentSpawner = {
            invokeSubagent: vi.fn().mockImplementation(async (role: string) => {
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
            })
        };

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
        const mockSpawner: IAgentSpawner = {
            invokeSubagent: vi.fn().mockRejectedValue(new Error('Spawner network failure'))
        };

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
         */
        const { REQUIRED_QUORUM_AGENTS } = await import('../../src/verification/quorum-enforcer.js');

        const mockSpawner: IAgentSpawner = {
            invokeSubagent: vi.fn().mockResolvedValue('conv-ok')
        };

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        setupWorkspace(tmpDir, 'quorum-success-track', [
            '- [ ] Task: Successful task [TIER-3] [AGENT:agent-ok] [DOMAIN:core]'
        ]);

        const result = await cli.executeTrack(tmpDir, 'quorum-success-track');

        // Work unit must be DONE
        expect(result.workUnits[0].state).toBe(WorkUnitState.DONE);

        // Reviewers must match REQUIRED_QUORUM_AGENTS (REV-7 consistency)
        expect(result.workUnits[0].reviewers).toEqual([...REQUIRED_QUORUM_AGENTS]);

        // Spawner must have been called for implementor + all 4 quorum agents
        expect(mockSpawner.invokeSubagent).toHaveBeenCalledTimes(
            1 + REQUIRED_QUORUM_AGENTS.length
        );
    });
});
