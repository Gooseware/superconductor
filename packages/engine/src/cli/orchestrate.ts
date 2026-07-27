import { WorkUnit, WorkUnitState } from '@superconductor/core/src/track/work-unit.js';
import * as fs from 'fs';
import * as path from 'path';

import { EventEmitter } from 'events';
import { ParallelDispatcher } from '../dispatcher/parallel-dispatcher.js';

export class SwarmOrchestratorCLI extends EventEmitter {
    private llmUsed = false;
    public dispatcher: ParallelDispatcher;

    constructor() {
        super();
        this.dispatcher = new ParallelDispatcher(5);
    }

    public wasLLMUsed(): boolean {
        return this.llmUsed;
    }

    public async executeTrack(workspaceDir: string, trackId: string): Promise<{ workUnits: WorkUnit[] }> {
        const path = await import('path');
        const topographyPath = path.join(workspaceDir, 'topography.json');
        const planPath = path.join(workspaceDir, '.superconductor', 'tracks', trackId, 'plan.md');
        const workUnits = await this.parseAndDispatch(topographyPath, planPath);

        const allDispatches: Promise<void>[] = [];

        for (const wu of workUnits) {
            this.dispatcher.implementorRegistry.register(wu.implementorId, wu);
            
            const task = {
                id: wu.unitId,
                role: wu.implementorId,
                tier: 3,
                status: 'pending',
                prompt: wu.spec,
                contextFiles: [],
                dependsOn: []
            };

            this.emit('agent_invoked', { agentId: wu.implementorId, taskId: task.id, spec: wu.spec });
            
            const dispatchPromise = this.dispatcher.dispatch(task as any)
                .then(async () => {
                    wu.state = 'COMPLETED' as any;
                    if (wu.reviewers && wu.reviewers.length > 0) {
                        const reviewerPromises = wu.reviewers.map(reviewer => {
                            const reviewerTask = {
                                id: `${wu.unitId}-review-${reviewer}`,
                                role: reviewer,
                                tier: 3,
                                status: 'pending',
                                prompt: `Review ${wu.unitId}`,
                                contextFiles: [],
                                dependsOn: [task.id]
                            };
                            this.emit('reviewer_invoked', { reviewerId: reviewer, unitId: wu.unitId });
                            return this.dispatcher.dispatch(reviewerTask as any);
                        });
                        await Promise.all(reviewerPromises);
                        wu.state = 'REVIEWED' as any;
                    }
                })
                .catch(err => {
                    this.emit('orchestration_error', { error: err });
                });
            
            allDispatches.push(dispatchPromise);
        }

        await Promise.all(allDispatches);

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
