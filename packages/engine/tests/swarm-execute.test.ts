import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { SwarmOrchestratorCLI } from '../src/cli/orchestrate.js';
import { MockAgentSpawner } from '../src/cli/mock-agent-spawner.js';
import { WorkUnitState } from '@superconductor/core/src/track/work-unit.js';
import * as fs from 'fs';
import * as path from 'path';

describe('SwarmOrchestratorCLI - swarm-execute', () => {
    let cli: SwarmOrchestratorCLI;
    const workspaceDir = path.join(import.meta.dirname, 'fixtures', 'workspace-execute');
    
    let mockSpawner: MockAgentSpawner;

    beforeEach(() => {
        mockSpawner = new MockAgentSpawner();
        cli = new SwarmOrchestratorCLI(mockSpawner);
    });

    afterAll(() => {
        if (fs.existsSync(workspaceDir)) {
            fs.rmSync(workspaceDir, { recursive: true, force: true });
        }
    });

    it('executeTrack should accept a track ID, load topography, and orchestrate implementors and quorum reviewers', async () => {
        const topographyPath = path.join(workspaceDir, 'topography.json');
        const trackPath = path.join(workspaceDir, '.superconductor', 'tracks', 'track-123', 'plan.md');

        fs.mkdirSync(path.dirname(trackPath), { recursive: true });
        
        fs.writeFileSync(topographyPath, JSON.stringify({
            partitions: [
                { id: "frontend", files: [], hotspotScore: 0, coverageGapPercent: 0, reviewers: ["agent-reviewer-1", "agent-reviewer-2"] }
            ]
        }));
        
        fs.writeFileSync(trackPath, `
# Plan
- [ ] Task: Create UI component [AGENT:agent-ui] [DOMAIN:frontend]
        `);

        const invokedAgents: any[] = [];
        const invokedReviewers: any[] = [];

        cli.on('agent_invoked', (event) => invokedAgents.push(event));
        cli.on('reviewer_invoked', (event) => invokedReviewers.push(event));

        cli.reviewerBroker = {
            aggregate: vi.fn().mockResolvedValue([
                { reviewerId: 'security-reviewer', findings: { status: 'RESOLVED' } },
                { reviewerId: 'correctness-reviewer', findings: { status: 'RESOLVED' } },
                { reviewerId: 'adversarial-reviewer', findings: { status: 'RESOLVED' } },
                { reviewerId: 'regression-reviewer', findings: { status: 'RESOLVED' } },
            ]),
            isConsensusResolved: () => true
        } as any;

        const result = await cli.executeTrack(workspaceDir, 'track-123');
        
        expect(result.workUnits).toHaveLength(1);
        expect(result.workUnits[0].implementorId).toBe('agent-ui');
        // REV-7: reviewers must be REQUIRED_QUORUM_AGENTS, not topography reviewers.
        // Topography-supplied reviewers are ignored; the quorum enforcer always uses the fixed set.
        expect(result.workUnits[0].reviewers).toEqual([
            'security-reviewer',
            'correctness-reviewer',
            'adversarial-reviewer',
            'regression-reviewer',
        ]);
        expect(result.workUnits[0].state).toBe(WorkUnitState.DONE);
        expect(result.workUnits[0].consensusArtifact?.allGreen).toBe(true);
        
        expect(invokedAgents).toHaveLength(1);
        expect(invokedAgents[0].agentId).toBe('agent-ui');
        expect(invokedAgents[0].taskId).toBe('wu-1');
        
        // Hard invariant: exactly these 4 quorum agents must be invoked via spawner
        const spawnerCalls = mockSpawner.spawned.map(c => c.role);
        expect(spawnerCalls).toHaveLength(5);
        expect(spawnerCalls).toContain('agent-ui');
        expect(spawnerCalls).toContain('security-reviewer');
        expect(spawnerCalls).toContain('correctness-reviewer');
        expect(spawnerCalls).toContain('adversarial-reviewer');
        expect(spawnerCalls).toContain('regression-reviewer');
    });
});
