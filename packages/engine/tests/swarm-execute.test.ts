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
            "frontend": { "owner": "agent-ui", "reviewers": ["agent-reviewer-1", "agent-reviewer-2"] }
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
        expect(result.workUnits[0].reviewers).toEqual(["agent-reviewer-1", "agent-reviewer-2"]);
        expect(result.workUnits[0].state).toBe(WorkUnitState.PENDING);
        
        expect(invokedAgents).toHaveLength(1);
        expect(invokedAgents[0].agentId).toBe('agent-ui');
        expect(invokedAgents[0].taskId).toBe('wu-1');
        
        expect(invokedReviewers).toHaveLength(2);
        expect(invokedReviewers[0].reviewerId).toBe('agent-reviewer-1');
        expect(invokedReviewers[1].reviewerId).toBe('agent-reviewer-2');
        expect(invokedReviewers[0].unitId).toBe('wu-1');
        expect(invokedReviewers[1].unitId).toBe('wu-1');
    });
});
