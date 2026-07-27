import { describe, it, expect, beforeEach } from 'vitest';
import { SwarmOrchestratorCLI } from '../src/cli/orchestrate.js';
import { WorkUnitState } from '@superconductor/core/src/track/work-unit.js';
import * as fs from 'fs';
import * as path from 'path';

describe('SwarmOrchestratorCLI', () => {
    let cli: SwarmOrchestratorCLI;
    
    beforeEach(() => {
        cli = new SwarmOrchestratorCLI();
    });

    it('should parse topography.json and plan.md and emit structured WorkUnit dispatch commands without LLM', async () => {
        const topographyPath = path.join(__dirname, 'fixtures', 'topography.json');
        const planPath = path.join(__dirname, 'fixtures', 'plan.md');

        fs.mkdirSync(path.join(__dirname, 'fixtures'), { recursive: true });
        
        fs.writeFileSync(topographyPath, JSON.stringify({
            "frontend": { "owner": "agent-ui" },
            "backend": { "owner": "agent-api" }
        }));
        
        fs.writeFileSync(planPath, `
# Plan
- [ ] Task: Update the login page [TIER-3] [AGENT:agent-ui] [DOMAIN:frontend]
- [ ] Task: Add login endpoint [TIER-3] [AGENT:agent-api] [DOMAIN:backend]
        `);

        const workUnits = await cli.parseAndDispatch(topographyPath, planPath);
        
        expect(workUnits).toHaveLength(2);
        
        expect(workUnits[0].domainScope).toContain('frontend');
        expect(workUnits[0].implementorId).toBe('agent-ui');
        expect(workUnits[0].state).toBe(WorkUnitState.PENDING);
        
        expect(workUnits[1].domainScope).toContain('backend');
        expect(workUnits[1].implementorId).toBe('agent-api');
        expect(workUnits[1].state).toBe(WorkUnitState.PENDING);
        
        // Assert LLM isn't called (which it wouldn't be since we just purely parse)
        expect(cli.wasLLMUsed()).toBe(false);
    });
});
