import { SwarmPermissionEvaluator } from './swarm-permission-evaluator.js';
import { ExecutionMode, NonInteractiveModeError } from '../guard/execution-mode.js';
import { HeadlessModeGuard, createHeadlessModeGuard } from '../guard/headless-mode-guard.js';
import { WorkUnit, WorkUnitState, WorkUnitStateMachine, ConsensusArtifact } from '@superconductor/core/src/track/work-unit.js';
import { QuorumReviewLoop } from '../verification/quorum-review-loop.js';
import { QuorumEnforcer, REQUIRED_QUORUM_AGENTS } from '../verification/quorum-enforcer.js';
import { ReviewerResponseBroker } from '../verification/reviewer-response-broker.js';
import { isResolved } from '../verification/reviewer-findings-schema.js';
import * as fs from 'fs';
import * as path from 'path';

import { EventEmitter } from 'events';
import { ParallelDispatcher } from '../dispatcher/parallel-dispatcher.js';
import { DagNode, TaskRole } from '../types/dag.types.js';
import { DomainPartition } from '@superconductor/core/src/intelligence/topography-map.js';
import { QuorumStore } from './quorum-store.js';
import { TrackLifecycleManager } from './lifecycle-manager.js';

import { AgyAgentSpawner } from './agy-agent-spawner.js';
import type { IAgentSpawner, AgentSpawnConfig, SpawnedAgent } from './agent-spawner.js';
import { notifyVerificationRequired, notifyRemediationLimitExceeded } from './attention-notifier.js';

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
    private guard?: HeadlessModeGuard;
    /**
     * Injectable ReviewerResponseBroker — set directly on the instance in tests
     * to bypass file-watching with a mock. When null, a real broker is constructed
     * using workspaceDir and the configured timeoutMs.
     */
    public reviewerBroker: ReviewerResponseBroker | null = null;

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
        // Bind guard to the actual runtime execution mode via factory (ADV-2)
        this.guard = createHeadlessModeGuard(evaluator);
        this.emit('permission_check', { revokedTools: evaluator.getRevokedTools(), swarmActive: evaluator.isSwarmModeActive() });
        const pathModule = await import('path');
        const topographyPath = pathModule.join(workspaceDir, 'topography.json');
        const safeTrackId = trackId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const planPath = pathModule.join(workspaceDir, '.superconductor', 'tracks', safeTrackId, 'plan.md');

        // Initialise quorum store for this workspace (only if not already injected in tests)
        if (!this.quorumStore) {
            this.quorumStore = new QuorumStore(workspaceDir);
        }

        if (!this.spawner) {
            this.spawner = new AgyAgentSpawner(pathModule.join(workspaceDir, '.superconductor'));
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

            // ── VERIFY unit routing via ExecutionMode ─────────────────────────────
            if (wu.unitType === 'VERIFY') {
                const executionMode = evaluator.getExecutionMode();
                if (executionMode === ExecutionMode.HEADLESS) {
                    // Headless: guard asserts the mode (throws NonInteractiveModeError which we catch
                    // to confirm we are in the right branch — this is the canonical guard-gated pattern).
                    try {
                        this.guard!.assertInteractiveAllowed('Manual Verification checkpoint', false);
                        // Should never reach here in HEADLESS mode — guard must throw
                    } catch (e) {
                        if (!(e instanceof NonInteractiveModeError)) throw e;
                        // Expected: guard confirmed HEADLESS — auto-approve
                    }
                    // Auto-approve VERIFY without spawning any subagent
                    const headlessConsensus = {
                        status: 'VERIFIED_HEADLESS',
                        autoApproved: true,
                        timestamp: Date.now()
                    };
                    if (this.quorumStore) {
                        // ADV-3: wrap writeConsensus in try/catch — disk errors must not crash executeTrack
                        try {
                            await this.quorumStore.writeConsensus(wu.unitId, headlessConsensus as any);
                        } catch (writeErr: any) {
                            process.stderr.write(`[orchestrate] WARN: writeConsensus failed for ${wu.unitId}: ${writeErr?.message}\n`);
                            this.emit('orchestration_error', { error: writeErr });
                            // Mark FAILED — do NOT transition to DONE
                            const sm = new WorkUnitStateMachine();
                            updatedWorkUnits[i] = transitionToFailed(wu, sm);
                            allDispatches.push(Promise.reject(writeErr));
                            continue;
                        }
                    }
                    const sm = new WorkUnitStateMachine();
                    const inProgressWu = sm.transition(wu, WorkUnitState.IN_PROGRESS);
                    updatedWorkUnits[i] = sm.transition(inProgressWu, WorkUnitState.DONE, { allGreen: true, payload: [] });
                    allDispatches.push(Promise.resolve());
                    continue;
                } else {
                    // Interactive: guard passes through (no throw in INTERACTIVE mode).
                    // REV-2: MUST NOT fall through to subagent dispatch — the caller is
                    // responsible for listening on 'verification_required' and resuming
                    // the orchestrator when the user confirms.
                    // TODO: implement proper await/event-driven pause once the CLI layer
                    //       provides a resume() callback.
                    this.guard!.assertInteractiveAllowed('Manual Verification checkpoint', false);
                    this.emit('verification_required', { wuId: wu.unitId, spec: wu.spec, autoApproved: false });
                    notifyVerificationRequired(wu.unitId, wu.spec ?? wu.unitId);
                    allDispatches.push(Promise.resolve());
                    continue;
                }
            }

            // Spawn via IAgentSpawner if provided; otherwise fall back to ParallelDispatcher
            let conversationId: string | undefined;
            let spawnerImplError: Error | undefined;
            if (this.spawner) {
                try {
                    const agent = await this.spawner.spawn({ role: wu.implementorId, prompt: wu.spec });
                    conversationId = agent.conversationId;
                    this.emit('subagent_spawned', { conversationId, wuId: wu.unitId, role: wu.implementorId });

                    // Register to agents.json manifest
                    if (this.quorumStore) {
                        evaluator.assertRootWriteAllowed(this.quorumStore.getAgentsManifestPath(safeTrackId));
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
            const dispatchPromise = Promise.resolve().then(async () => {
                    const sm = new WorkUnitStateMachine();
                    let updatedWu = sm.transition(wu, WorkUnitState.IN_PROGRESS);
                    
                    let consensusArtifact: ConsensusArtifact | null = null;

                    // Hard invariant: ALWAYS spawn exactly these 4 quorum agents.
                    // This is NOT overridable via topography or any external config.
                    const quorumEnforcer = new QuorumEnforcer();
                    const quorumAgents = [...REQUIRED_QUORUM_AGENTS];

                    // Capture broker reference (injectable for tests; null → real broker)
                    const capturedBroker = this.reviewerBroker;

                    const loop = new QuorumReviewLoop({
                        maxIterations: 3,
                        reviewerFn: async () => {
                            const spawnResults: Array<{ agentType: string; success: boolean }> = [];
                            // Collect conversationIds from spawner for broker aggregation
                            const reviewerConversationIds: string[] = [];

                            const reviewerPromises = quorumAgents.map(reviewer => {
                                if (capturedSpawner) {
                                    // Use spawner for reviewer invocations when it is provided
                                    return capturedSpawner.spawn({ role: reviewer, prompt: `Review ${wu.unitId}` })
                                        .then((agent: SpawnedAgent) => {
                                            reviewerConversationIds.push(agent.conversationId);
                                            spawnResults.push({ agentType: reviewer, success: true });
                                        })
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

                            // ── Phase 4: Real quorum result ingestion via ReviewerResponseBroker ──
                            // Only use the broker when a spawner is present (we have conversationIds).
                            if (capturedSpawner && reviewerConversationIds.length > 0) {
                                const broker = capturedBroker ?? new ReviewerResponseBroker({
                                    workspaceDir,
                                    timeoutMs: 30_000,
                                });
                                const brokerResults = await broker.aggregate(reviewerConversationIds);
                                const allResolved = broker.isConsensusResolved(brokerResults);
                                if (allResolved) {
                                    return { status: 'RESOLVED', findings: [] };
                                } else {
                                    const failedFindings = brokerResults
                                        .filter(r => !isResolved(r.findings))
                                        .flatMap(r => (r.findings as { findings: unknown[] }).findings);
                                    return { status: 'FAILED', findings: failedFindings };
                                }
                            }

                            // No spawner (ParallelDispatcher path) — auto-resolve
                            return { status: 'RESOLVED', findings: [] };
                        },
                        remediateFn: async (payloads: unknown[]) => {
                            if (!capturedSpawner) {
                                return 'Skipped remediation: no spawner';
                            }
                            try {
                                const prompt = `Remediate findings: ${JSON.stringify(payloads)}`;
                                const agent = await capturedSpawner.spawn({ role: 'superconductor-remediation-processor', prompt });
                                return `Dispatched remediator: ${agent.conversationId}`;
                            } catch (err: any) {
                                process.stderr.write(`[orchestrate] ERR: Failed to spawn remediator: ${err.message}\n`);
                                return `Failed to dispatch remediator: ${err.message}`;
                            }
                        },
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
                            evaluator.assertRootWriteAllowed(capturedQuorumStore.getConsensusPath(wu.unitId));
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
                        console.log("DISK ARTIFACT:", diskArtifact); const doneWu = sm.transition(updatedWu, WorkUnitState.DONE, diskArtifact);
                        // Update reviewers to match the canonical REQUIRED_QUORUM_AGENTS (REV-7)
                        updatedWorkUnits[i] = { ...doneWu, reviewers: [...REQUIRED_QUORUM_AGENTS] };

                        // Persist implementor result to quorum store
                        if (capturedQuorumStore) {
                            evaluator.assertRootWriteAllowed(capturedQuorumStore.getResultPath(wu.unitId));
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
                const isVerify = spec.startsWith('Superconductor - User Manual Verification');
                workUnits.push({
                    unitId: `wu-${idCounter++}`,
                    domainScope,
                    spec,
                    state: WorkUnitState.PENDING,
                    implementorId,
                    unitType: isVerify ? 'VERIFY' : 'TASK',
                    reviewers: []
                });
            }
        }

        return workUnits;
    }
}
