import { WorkUnit, WorkUnitState, WorkUnitStateMachine, ConsensusArtifact } from '@superconductor/core/src/track/work-unit.js';
import { QuorumReviewLoop } from '../verification/quorum-review-loop.js';
import * as fs from 'fs';
import * as path from 'path';

import { EventEmitter } from 'events';
import { ParallelDispatcher } from '../dispatcher/parallel-dispatcher.js';
import { DagNode, TaskRole } from '../types/dag.types.js';
import { DomainPartition } from '@superconductor/core/src/intelligence/topography-map.js';

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
        const safeTrackId = trackId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const planPath = path.join(workspaceDir, '.superconductor', 'tracks', safeTrackId, 'plan.md');
        const workUnits = await this.parseAndDispatch(topographyPath, planPath);

        const allDispatches: Promise<void>[] = [];

        for (const wu of workUnits) {
            this.dispatcher.implementorRegistry.register(wu.implementorId, wu);
            
            const task: DagNode = {
                id: wu.unitId,
                role: wu.implementorId as TaskRole,
                tier: 3,
                status: 'pending',
                prompt: wu.spec,
                contextFiles: [],
                dependsOn: []
            };

            this.emit('agent_invoked', { agentId: wu.implementorId, taskId: task.id, spec: wu.spec });
            
            const dispatchPromise = this.dispatcher.dispatch(task)
                .then(async () => {
                    const sm = new WorkUnitStateMachine();
                    let updatedWu = sm.transition(wu, WorkUnitState.IN_PROGRESS);
                    
                    let consensusArtifact: ConsensusArtifact | null = null;
                    if (wu.reviewers && wu.reviewers.length > 0) {
                        const loop = new QuorumReviewLoop({
                            maxIterations: 1,
                            reviewerFn: async () => {
                                const reviewerPromises = wu.reviewers!.map(reviewer => {
                                    const reviewerTask: DagNode = {
                                        id: `${wu.unitId}-review-${reviewer}`,
                                        role: reviewer as TaskRole,
                                        tier: 3,
                                        status: 'pending',
                                        prompt: `Review ${wu.unitId}`,
                                        contextFiles: [],
                                        dependsOn: [task.id]
                                    };
                                    this.emit('reviewer_invoked', { reviewerId: reviewer, unitId: wu.unitId });
                                    return this.dispatcher.dispatch(reviewerTask);
                                });
                                await Promise.all(reviewerPromises);
                                return { status: 'RESOLVED', findings: [] };
                            }
                        });
                        const loopResult = await loop.run("");
                        if (loopResult) {
                            consensusArtifact = {
                                allGreen: loopResult.allGreen,
                                payload: loopResult.findings || []
                            };
                        }
                    }
                    
                    if (!consensusArtifact) {
                        throw new Error('QuorumReviewLoop returned no result — cannot determine consensus');
                    }

                    if (consensusArtifact.allGreen === false) {
                        const failedWu = sm.transition(updatedWu, WorkUnitState.FAILED);
                        Object.assign(wu, failedWu);
                        throw new Error(`Quorum review failed for ${wu.unitId}: ${JSON.stringify(consensusArtifact.payload)}`);
                    } else if (consensusArtifact.allGreen === true) {
                        const doneWu = sm.transition(updatedWu, WorkUnitState.DONE, consensusArtifact);
                        Object.assign(wu, doneWu);
                    }
                })
                .catch(err => {
                    this.emit('orchestration_error', { error: err });
                        const sm = new WorkUnitStateMachine();
                        Object.assign(wu, sm.transition(wu, WorkUnitState.FAILED));
                    throw err;
                });
            
            allDispatches.push(dispatchPromise);
        }

        const results = await Promise.allSettled(allDispatches);
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            throw new AggregateError(failures.map(f => (f as PromiseRejectedResult).reason), `${failures.length}/${allDispatches.length} tasks failed`);
        }

        return { workUnits };
    }

    public async parseAndDispatch(topographyPath: string, planPath: string): Promise<WorkUnit[]> {
        const topography: { partitions?: DomainPartition[] } = JSON.parse(await fs.promises.readFile(topographyPath, 'utf8'));
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
                    const partition = topography.partitions?.find((p: DomainPartition) => p.id === domain);
                    if (partition && partition.reviewers) {
                        reviewers.push(...partition.reviewers);
                    }
                }

                workUnits.push({
                    unitId: `wu-${idCounter++}`,
                    domainScope,
                    spec,
                    state: WorkUnitState.PENDING,
                    implementorId,
                    reviewers
                });
            }
        }

        return workUnits;
    }
}
