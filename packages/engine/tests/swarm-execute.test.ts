import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { SwarmOrchestratorCLI } from '../src/cli/orchestrate.js';
import { WorkUnitState } from '@superconductor/core/src/track/work-unit.js';
import * as fs from 'fs';
import * as path from 'path';

describe('SwarmOrchestratorCLI - swarm-execute', () => {
    let cli: SwarmOrchestratorCLI;
    const workspaceDir = path.join(import.meta.dirname, 'fixtures', 'workspace-execute');
    
    beforeEach(() => {
        cli = new SwarmOrchestratorCLI();
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
        
        // Hard invariant: exactly these 4 quorum agents must be invoked regardless of topography
        expect(invokedReviewers).toHaveLength(4);
        const reviewerIds = invokedReviewers.map((r: any) => r.reviewerId);
        expect(reviewerIds).toContain('security-reviewer');
        expect(reviewerIds).toContain('correctness-reviewer');
        expect(reviewerIds).toContain('adversarial-reviewer');
        expect(reviewerIds).toContain('regression-reviewer');
        invokedReviewers.forEach((r: any) => expect(r.unitId).toBe('wu-1'));
    });
});
