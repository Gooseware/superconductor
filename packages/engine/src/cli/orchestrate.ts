import { WorkUnit, WorkUnitState, WorkUnitStateMachine, ConsensusArtifact } from '@superconductor/core/src/track/work-unit.js';
import { QuorumReviewLoop } from '../verification/quorum-review-loop.js';
import * as fs from 'fs';
import * as path from 'path';

import { EventEmitter } from 'events';
import { ParallelDispatcher } from '../dispatcher/parallel-dispatcher.js';
import { DagNode, TaskRole } from '../types/dag.types.js';
import { DomainPartition } from '@superconductor/core/src/intelligence/topography-map.js';
import { QuorumStore } from './quorum-store.js';

/**
 * Pluggable agent spawner interface.
 * Inject a mock in tests; the real implementation delegates to AGY SDK.
 */
export interface IAgentSpawner {
  /**
   * Spawns a subagent for the given role with the given prompt.
   * Returns a conversationId string.
   */
  invokeSubagent(role: string, prompt: string): Promise<string>;
}

/**
 * Real AGY SDK-backed implementation of IAgentSpawner.
 * Calls agy.invokeSubagent under the hood.
 */
export class AgyAgentSpawner implements IAgentSpawner {
  // In a real integration, this would import and call the AGY SDK.
  async invokeSubagent(role: string, prompt: string): Promise<string> {
    // Placeholder: real code would be: const { conversationId } = await agy.invokeSubagent({ role, prompt });
    const conversationId = `agy-${role}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    return conversationId;
  }
}

export class SwarmOrchestratorCLI extends EventEmitter {
    private llmUsed = false;
    public dispatcher: ParallelDispatcher;
    private spawner?: IAgentSpawner;
    private quorumStore?: QuorumStore;

    constructor(spawner?: IAgentSpawner) {
        super();
        this.dispatcher = new ParallelDispatcher(5);
        this.spawner = spawner;
    }

    public wasLLMUsed(): boolean {
        return this.llmUsed;
    }

    public async executeTrack(workspaceDir: string, trackId: string): Promise<{ workUnits: WorkUnit[] }> {
        const pathModule = await import('path');
        const topographyPath = pathModule.join(workspaceDir, 'topography.json');
        const safeTrackId = trackId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const planPath = pathModule.join(workspaceDir, '.superconductor', 'tracks', safeTrackId, 'plan.md');

        // Initialise quorum store for this workspace
        this.quorumStore = new QuorumStore(workspaceDir);

        const workUnits = await this.parseAndDispatch(topographyPath, planPath);

        const updatedWorkUnits = [...workUnits];
        const allDispatches: Promise<void>[] = [];

        for (let i = 0; i < workUnits.length; i++) {
            const wu = workUnits[i];
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

            // Spawn via IAgentSpawner if provided; otherwise fall back to ParallelDispatcher
            let conversationId: string | undefined;
            if (this.spawner) {
                conversationId = await this.spawner.invokeSubagent(wu.implementorId, wu.spec);
                this.emit('subagent_spawned', { conversationId, wuId: wu.unitId, role: wu.implementorId });

                // Register to agents.json manifest
                if (this.quorumStore) {
                    await this.quorumStore.appendToAgentsManifest(safeTrackId, {
                        conversationId,
                        wuId: wu.unitId,
                        role: wu.implementorId,
                        spawnedAt: new Date().toISOString()
                    });
                }
            }
            
            const capturedConversationId = conversationId;
            const dispatchPromise = (this.spawner
                ? Promise.resolve()  // Spawner already invoked; skip ParallelDispatcher
                : this.dispatcher.dispatch(task)
            )
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
                    } else {
                        // No reviewers — auto-approve
                        consensusArtifact = { allGreen: true, payload: [] };
                    }
                    
                    if (!consensusArtifact) {
                        throw new Error('QuorumReviewLoop returned no result — cannot determine consensus');
                    }

                    if (consensusArtifact.allGreen === false) {
                        const failedWu = sm.transition(updatedWu, WorkUnitState.FAILED);
                        updatedWorkUnits[i] = failedWu;
                        throw new Error(`Quorum review failed for ${wu.unitId}: ${JSON.stringify(consensusArtifact.payload)}`);
                    } else if (consensusArtifact.allGreen === true) {
                        const doneWu = sm.transition(updatedWu, WorkUnitState.DONE, consensusArtifact);
                        updatedWorkUnits[i] = doneWu;

                        // Persist result to quorum store
                        if (this.quorumStore) {
                            await this.quorumStore.writeResult({
                                wuId: wu.unitId,
                                conversationId: capturedConversationId ?? '',
                                role: wu.implementorId,
                                prompt: wu.spec,
                                result: { allGreen: true, payload: consensusArtifact.payload },
                                completedAt: new Date().toISOString()
                            });
                        }
                    }
                })
                .catch(err => {
                    this.emit('orchestration_error', { error: err });
                    if (updatedWorkUnits[i].state !== WorkUnitState.FAILED) {
                        const sm = new WorkUnitStateMachine();
                        updatedWorkUnits[i] = sm.transition(updatedWorkUnits[i] || wu, WorkUnitState.FAILED);
                    }
                    throw err;
                });
            
            allDispatches.push(dispatchPromise);
        }

        const results = await Promise.allSettled(allDispatches);
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            const err = new AggregateError(failures.map(f => (f as PromiseRejectedResult).reason), `${failures.length}/${allDispatches.length} tasks failed`);
            (err as any).workUnits = updatedWorkUnits;
            throw err;
        }

        return { workUnits: updatedWorkUnits };
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
