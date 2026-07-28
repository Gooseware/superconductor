import { SwarmPermissionEvaluator } from './swarm-permission-evaluator.js';
import { WorkUnit, WorkUnitState, WorkUnitStateMachine, ConsensusArtifact } from '@superconductor/core/src/track/work-unit.js';
import { QuorumReviewLoop } from '../verification/quorum-review-loop.js';
import { QuorumEnforcer, REQUIRED_QUORUM_AGENTS } from '../verification/quorum-enforcer.js';
import * as fs from 'fs';
import * as path from 'path';

import { EventEmitter } from 'events';
import { ParallelDispatcher } from '../dispatcher/parallel-dispatcher.js';
import { DagNode, TaskRole } from '../types/dag.types.js';
import { DomainPartition } from '@superconductor/core/src/intelligence/topography-map.js';
import { QuorumStore } from './quorum-store.js';
import { TrackLifecycleManager } from './lifecycle-manager.js';

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
 * Placeholder AGY SDK-backed implementation of IAgentSpawner.
 * The real AGY SDK is not yet wired — inject a concrete IAgentSpawner in production.
 * Throws on every call so failures are surfaced immediately, not masked by fake IDs.
 */
export class AgyAgentSpawner implements IAgentSpawner {
  async invokeSubagent(_role: string, _prompt: string): Promise<string> {
    throw new Error('AgyAgentSpawner: AGY SDK not yet wired. Inject a real IAgentSpawner implementation.');
  }
}

/** Transitions a work unit through IN_PROGRESS then to FAILED, respecting the state machine. */
function transitionToFailed(wu: WorkUnit, sm: WorkUnitStateMachine): WorkUnit {
    let current = wu;
    if (current.state === WorkUnitState.PENDING || current.state === WorkUnitState.RESEARCHING) {
        current = sm.transition(current, WorkUnitState.IN_PROGRESS);
    }
    if (current.state === WorkUnitState.DONE) {
        // DONE → FAILED is allowed per state machine
        return sm.transition(current, WorkUnitState.FAILED);
    }
    if (current.state !== WorkUnitState.FAILED) {
        return sm.transition(current, WorkUnitState.FAILED);
    }
    return current;
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

    public async executeTrack(workspaceDir: string, trackId: string, options?: { agentConfigPath?: string }): Promise<{ workUnits: WorkUnit[] }> {
        const defaultAgentConfigPath = path.join(workspaceDir, '.superconductor', 'agent-config.md');
        const configPath = options?.agentConfigPath || defaultAgentConfigPath;
        const evaluator = new SwarmPermissionEvaluator(configPath);
        evaluator.assertRootModelRestricted();
        this.emit('permission_check', { revokedTools: evaluator.getRevokedTools(), swarmActive: evaluator.isSwarmModeActive() });
        const pathModule = await import('path');
        const topographyPath = pathModule.join(workspaceDir, 'topography.json');
        const safeTrackId = trackId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const planPath = pathModule.join(workspaceDir, '.superconductor', 'tracks', safeTrackId, 'plan.md');

        // Initialise quorum store for this workspace (only if not already injected in tests)
        if (!this.quorumStore) {
            this.quorumStore = new QuorumStore(workspaceDir);
        }

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
            let spawnerImplError: Error | undefined;
            if (this.spawner) {
                try {
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
                } catch (err: any) {
                    spawnerImplError = err;
                }
            }

            if (spawnerImplError) {
                // Spawner failed on implementor invocation — mark FAILED immediately
                const sm = new WorkUnitStateMachine();
                updatedWorkUnits[i] = transitionToFailed(wu, sm);
                this.emit('orchestration_error', { error: spawnerImplError });
                allDispatches.push(Promise.reject(spawnerImplError));
                continue;
            }
            
            const capturedConversationId = conversationId;
            const capturedSpawner = this.spawner;
            const capturedQuorumStore = this.quorumStore;
            const dispatchPromise = (this.spawner
                ? Promise.resolve()  // Spawner already invoked; skip ParallelDispatcher
                : this.dispatcher.dispatch(task)
            )
                .then(async () => {
                    const sm = new WorkUnitStateMachine();
                    let updatedWu = sm.transition(wu, WorkUnitState.IN_PROGRESS);
                    
                    let consensusArtifact: ConsensusArtifact | null = null;

                    // Hard invariant: ALWAYS spawn exactly these 4 quorum agents.
                    // This is NOT overridable via topography or any external config.
                    const quorumEnforcer = new QuorumEnforcer();
                    const quorumAgents = [...REQUIRED_QUORUM_AGENTS];

                    const loop = new QuorumReviewLoop({
                        maxIterations: 1,
                        reviewerFn: async () => {
                            const spawnResults: Array<{ agentType: string; success: boolean }> = [];
                            const reviewerPromises = quorumAgents.map(reviewer => {
                                if (capturedSpawner) {
                                    // Use spawner for reviewer invocations when it is provided
                                    return capturedSpawner.invokeSubagent(reviewer, `Review ${wu.unitId}`)
                                        .then(() => spawnResults.push({ agentType: reviewer, success: true }))
                                        .catch(() => spawnResults.push({ agentType: reviewer, success: false }));
                                }
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
                                return this.dispatcher.dispatch(reviewerTask)
                                    .then(() => spawnResults.push({ agentType: reviewer, success: true }))
                                    .catch(() => spawnResults.push({ agentType: reviewer, success: false }));
                            });
                            await Promise.all(reviewerPromises);
                            // Enforce quorum — throws QuorumViolationError if invariant is broken
                            quorumEnforcer.assertQuorumSpawned(spawnResults);
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
                    
                    if (!consensusArtifact) {
                        throw new Error('QuorumReviewLoop returned no result — cannot determine consensus');
                    }

                    if (consensusArtifact.allGreen === false) {
                        const failedWu = sm.transition(updatedWu, WorkUnitState.FAILED);
                        updatedWorkUnits[i] = failedWu;
                        throw new Error(`Quorum review failed for ${wu.unitId}: ${JSON.stringify(consensusArtifact.payload)}`);
                    } else if (consensusArtifact.allGreen === true) {
                        // ── Wave-2A: Strict file-based DONE gating ──────────────────────────────
                        // Step 1: Write the ConsensusArtifact to disk via QuorumStore
                        if (capturedQuorumStore) {
                            await capturedQuorumStore.writeConsensus(wu.unitId, consensusArtifact);
                        }

                        // Step 2: Read it back from disk — disk is the source of truth
                        let diskArtifact: ConsensusArtifact | null = null;
                        if (capturedQuorumStore) {
                            try {
                                diskArtifact = await capturedQuorumStore.readConsensus(wu.unitId);
                            } catch (readErr: any) {
                                // Read error (non-ENOENT) — must FAIL
                                const failedWu = sm.transition(updatedWu, WorkUnitState.FAILED);
                                updatedWorkUnits[i] = failedWu;
                                throw new Error('Consensus artifact missing or unreadable from disk');
                            }
                        }

                        // Step 3: Gate DONE on disk-read artifact having allGreen === true
                        if (!diskArtifact) {
                            // null = ENOENT — file was not written or was deleted
                            const failedWu = sm.transition(updatedWu, WorkUnitState.FAILED);
                            updatedWorkUnits[i] = failedWu;
                            throw new Error('Consensus artifact missing or unreadable from disk');
                        }

                        if (diskArtifact.allGreen !== true) {
                            const failedWu = sm.transition(updatedWu, WorkUnitState.FAILED);
                            updatedWorkUnits[i] = failedWu;
                            throw new Error('Quorum consensus on disk is not allGreen');
                        }

                        // All gates passed — safe to transition to DONE
                        const doneWu = sm.transition(updatedWu, WorkUnitState.DONE, diskArtifact);
                        // Update reviewers to match the canonical REQUIRED_QUORUM_AGENTS (REV-7)
                        updatedWorkUnits[i] = { ...doneWu, reviewers: [...REQUIRED_QUORUM_AGENTS] };

                        // Persist implementor result to quorum store
                        if (capturedQuorumStore) {
                            await capturedQuorumStore.writeResult({
                                wuId: wu.unitId,
                                conversationId: capturedConversationId ?? '',
                                role: wu.implementorId,
                                prompt: wu.spec,
                                result: { allGreen: true, payload: diskArtifact.payload },
                                completedAt: new Date().toISOString()
                            });
                        }
                    }
                })
                .catch(err => {
                    this.emit('orchestration_error', { error: err });
                    const sm = new WorkUnitStateMachine();
                    if (updatedWorkUnits[i].state !== WorkUnitState.FAILED) {
                        updatedWorkUnits[i] = transitionToFailed(updatedWorkUnits[i] || wu, sm);
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

        // Wave-3A: Trigger lifecycle cleanup when all work units have completed.
        const allDone = updatedWorkUnits.every(wu => wu.state === WorkUnitState.DONE);
        if (allDone && this.quorumStore) {
            const lifecycleManager = new TrackLifecycleManager(
                this.quorumStore,
                workspaceDir,
                { kill: async (_id: string) => 'already_dead' as const }
            );
            // Fire-and-forget: do not block the caller on cleanup errors.
            lifecycleManager.onTrackComplete(safeTrackId).catch((err: unknown) => {
                this.emit('orchestration_error', { error: err });
            });
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

                // REV-7: Do NOT populate reviewers from topography.
                // Quorum agents are always REQUIRED_QUORUM_AGENTS — fixed by QuorumEnforcer at runtime.
                workUnits.push({
                    unitId: `wu-${idCounter++}`,
                    domainScope,
                    spec,
                    state: WorkUnitState.PENDING,
                    implementorId,
                    reviewers: []
                });
            }
        }

        return workUnits;
    }
}
