import { describe, it, expect, beforeEach } from 'vitest';
import { SwarmOrchestratorCLI } from '../src/cli/orchestrate.js';
import { WorkUnitState } from '@superconductor/core/src/track/work-unit.js';
import * as fs from 'fs';
import * as path from 'path';

describe('SwarmOrchestratorCLI - swarm-execute', () => {
    let cli: SwarmOrchestratorCLI;
    
    beforeEach(() => {
        cli = new SwarmOrchestratorCLI();
    });

    it('executeTrack should accept a track ID, load topography, and orchestrate implementors and quorum reviewers', async () => {
        const workspaceDir = path.join(__dirname, 'fixtures', 'workspace-execute');
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

        // We expect executeTrack to parse the track, assign implementors and reviewers from topography
        const result = await cli.executeTrack(workspaceDir, 'track-123');
        
        expect(result.workUnits).toHaveLength(1);
        expect(result.workUnits[0].implementorId).toBe('agent-ui');
        expect(result.workUnits[0].reviewers).toEqual(["agent-reviewer-1", "agent-reviewer-2"]);
        expect(result.workUnits[0].state).toBe(WorkUnitState.PENDING); // or COMPLETED based on orchestration?
    });
});
