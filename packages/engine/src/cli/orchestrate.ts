import { WorkUnit, WorkUnitState } from '@superconductor/core/src/track/work-unit.js';
import * as fs from 'fs';
import * as path from 'path';

export class SwarmOrchestratorCLI {
    private llmUsed = false;

    public wasLLMUsed(): boolean {
        return this.llmUsed;
    }

    public async executeTrack(workspaceDir: string, trackId: string): Promise<{ workUnits: WorkUnit[] }> {
        const path = await import('path');
        const topographyPath = path.join(workspaceDir, 'topography.json');
        const planPath = path.join(workspaceDir, '.superconductor', 'tracks', trackId, 'plan.md');
        const workUnits = await this.parseAndDispatch(topographyPath, planPath);
        return { workUnits };
    }

    public async parseAndDispatch(topographyPath: string, planPath: string): Promise<WorkUnit[]> {
        const topography = JSON.parse(await fs.promises.readFile(topographyPath, 'utf8'));
        const planContent = await fs.promises.readFile(planPath, 'utf8');

        const workUnits: WorkUnit[] = [];
        const lines = planContent.split('\n');

        let idCounter = 1;
        for (const line of lines) {
            const taskMatch = line.match(/- \[[x ]?\] Task: (.*)/);
            if (taskMatch) {
                const spec = taskMatch[1].trim();
                
                const agentMatch = line.match(/\[AGENT:([^\]]+)\]/);
                let implementorId = agentMatch ? agentMatch[1] : 'unknown-agent';
                
                const domainMatch = line.match(/\[DOMAIN:([^\]]+)\]/);
                const domainScope = domainMatch ? [domainMatch[1]] : [];

                let reviewers: string[] = [];
                for (const domain of domainScope) {
                    if (topography[domain]) {
                        if (topography[domain].reviewers) {
                            reviewers.push(...topography[domain].reviewers);
                        }
                    }
                }

                workUnits.push({
                    unitId: `wu-${idCounter++}`,
                    domainScope,
                    spec,
                    state: WorkUnitState.PENDING,
                    implementorId,
                    reviewers
                } as any);
            }
        }

        return workUnits;
    }
}
