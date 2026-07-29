import { EventEmitter } from 'events';
import { TaskGraph, DagNode } from './types/dag.types.js';
import { Scheduler } from './scheduler/scheduler.js';
import { Dispatcher } from './dispatcher/dispatcher.js';
import { ParallelDispatcher } from './dispatcher/parallel-dispatcher.js';
import { StormController } from './concurrency/storm.js';
import { buildContext } from './context/builder.js';
import { DispatcherEvent } from './types/dispatcher.types.js';
import { EscalationRouter } from './routing/escalation-router.js';
import { CacheManager } from './routing/cache-manager.js';
import { EventStore } from './state/event-store.js';
import { EngineConfig, TrackExecutionState } from './types/engine.types.js';
import { GitCheckpointManager } from './safety/git-checkpoint-manager.js';
import { classifyDodLevel, runDodGate } from './verification/dod-classifier.js';
import { SmartModelResolver } from './routing/SmartModelResolver.js';
import { SkillTriggerEngine } from './skills/skill-trigger-engine.js';

export class Engine extends EventEmitter {
  public scheduler: Scheduler;
  public dispatcher: ParallelDispatcher;
  public storm: StormController;
  public escalationRouter: EscalationRouter;
  public cacheManager: CacheManager;
  public checkpointManager: GitCheckpointManager;
  public modelResolver: SmartModelResolver;
  public eventStore: EventStore;
  public skillTrigger: SkillTriggerEngine;
  public commonContext: string = '';
  public config: EngineConfig;
  
  private taskStates: Map<string, TrackExecutionState> = new Map();
  private waitingForLocks: Set<DagNode> = new Set();
  private activeTasks: number = 0;
  private isHalted: boolean = false;
  private executionPromise: Promise<{ success: boolean }> | null = null;
  private resolveExecution: ((result: { success: boolean }) => void) | null = null;
  private rejectExecution: ((reason?: any) => void) | null = null;

  constructor(graph: TaskGraph, config: EngineConfig = {}) {
    super();
    this.config = config;
    this.commonContext = config.commonContext || '';
    this.scheduler = new Scheduler(graph, this.handleSchedulerEvent.bind(this));
    this.dispatcher = new ParallelDispatcher(config.maxConcurrentAgents || 5);
    this.storm = new StormController();
    this.escalationRouter = new EscalationRouter(this);
    this.cacheManager = new CacheManager({ maxTokenBudget: config.disableCache ? 0 : 50000 });
    this.checkpointManager = new GitCheckpointManager();
    this.modelResolver = new SmartModelResolver();
    this.eventStore = new EventStore({ dbPath: config.dbPath || ':memory:' });
    this.skillTrigger = new SkillTriggerEngine(config.skillsDir);
    
    this.dispatcher.on('event', this.handleDispatcherEvent.bind(this));
  }

  public initTaskState(trackId: string, taskId: string): TrackExecutionState {
    const state: TrackExecutionState = {
      taskId,
      trackId,
      iteration_count: 0,
      execution_errors: [],
      review_comments: [],
      model_tier: 3,
      escalated: false
    };
    this.taskStates.set(taskId, state);
    this.eventStore.append({
      type: 'state',
      timestamp: Date.now(),
      detail: { taskId, action: 'init', state }
    });
    this.emit('state_changed', { type: 'init', state });
    return state;
  }

  public getTaskState(taskId: string): TrackExecutionState | undefined {
    return this.taskStates.get(taskId);
  }

  public updateTaskState(taskId: string, patch: Partial<TrackExecutionState>): TrackExecutionState | undefined {
    const current = this.taskStates.get(taskId);
    if (!current) return undefined;
    const updated = { ...current, ...patch };
    this.taskStates.set(taskId, updated);
    this.eventStore.append({
      type: 'state',
      timestamp: Date.now(),
      detail: { taskId, action: 'update', state: updated }
    });
    this.emit('state_changed', { type: 'update', state: updated });
    return updated;
  }

  private handleSchedulerEvent(event: any) {
    if (event.type === 'task_failed' || event.type === 'task_blocked') {
      this.isHalted = true;
    }
  }

  private async handleDispatcherEvent(event: DispatcherEvent) {
    if (event.type === 'task_completed') {
      const currentState = this.getTaskState(event.taskId);
      const dodLevel = currentState?.dodLevel || 2;
      
      const dodGateResult = await runDodGate(dodLevel, event.taskId);
      if (!dodGateResult.passed) {
        // DodGate failed, treat as task failure for refinement loop
        const state = currentState || this.initTaskState('default-track', event.taskId);
        state.iteration_count++;
        state.execution_errors.push(...dodGateResult.feedback);
        this.updateTaskState(event.taskId, state);

        if (state.iteration_count >= 3 && state.checkpointSha) {
          this.checkpointManager.rollbackToCheckpoint(state.checkpointSha);
        }
        
        this.storm.releaseAccess(event.taskId);
        this.scheduler.failTask(event.taskId);
        this.activeTasks--;
        this.isHalted = true;
        this.pump();
        return;
      }

      this.escalationRouter.onTaskSuccess('default-track', event.taskId);
      this.storm.releaseAccess(event.taskId);
      this.scheduler.completeTask(event.taskId);
      this.activeTasks--;
      this.pump();
    } else if (event.type === 'task_failed') {
      const state = this.getTaskState(event.taskId);
      if (state) {
        state.iteration_count++;
        if (event.payload?.error) {
          state.execution_errors.push(event.payload.error);
        }
        this.updateTaskState(event.taskId, state);

        // Circuit breaker: rollback if iteration count >= 3
        if (state.iteration_count >= 3 && state.checkpointSha) {
          this.checkpointManager.rollbackToCheckpoint(state.checkpointSha);
        }
      }

      const action = this.escalationRouter.processSignal('default-track', event.taskId, 'red_green_failure');
      if (action === 'escalate') {
        const task = this.scheduler.getTask(event.taskId);
        if (task) {
          const resolvedTier = await this.modelResolver.resolve('tier4', 'escalation');
          const tierNumber = resolvedTier.selection.tier ? (parseInt(resolvedTier.selection.tier.replace('tier', ''), 10) as 1 | 2 | 3 | 4) : 4;
          this.updateTaskState(event.taskId, { model_tier: tierNumber || 4, escalated: true });
          this.activeTasks--;
          this.storm.releaseAccess(event.taskId);
          task.status = 'pending';
          this.pump();
        }
      } else {
        this.storm.releaseAccess(event.taskId);
        this.scheduler.failTask(event.taskId);
        this.activeTasks--;
        this.isHalted = true;
        this.pump();
      }
    }
  }

  public async execute(): Promise<{ success: boolean }> {
    this.executionPromise = new Promise((resolve, reject) => {
      this.resolveExecution = resolve;
      this.rejectExecution = reject;
    });
    
    this.pump();
    
    return this.executionPromise;
  }

  private pump() {
    if (this.isHalted) {
      if (this.activeTasks === 0 && this.resolveExecution) {
        this.resolveExecution({ success: false });
      }
      return;
    }

    const stillWaiting = new Set<DagNode>();
    for (const task of this.waitingForLocks) {
      const access = this.storm.requestAccess(task.id, task.contextFiles || []);
      if (access.success) {
        this.startTask(task);
      } else {
        stillWaiting.add(task);
      }
    }
    this.waitingForLocks = stillWaiting;

    const { tasks } = this.scheduler.nextBatch();
    
    for (const task of tasks) {
      const access = this.storm.requestAccess(task.id, task.contextFiles || []);
      if (access.success) {
        this.startTask(task);
      } else {
        this.waitingForLocks.add(task);
      }
    }

    if (this.activeTasks === 0 && this.waitingForLocks.size === 0 && tasks.length === 0) {
      if (this.resolveExecution) {
        this.resolveExecution({ success: true });
      }
    }
    
    if (this.activeTasks === 0 && this.waitingForLocks.size > 0) {
      if (this.rejectExecution) {
        this.rejectExecution(new Error('Engine deadlock: tasks waiting for locks but no active tasks running'));
      }
    }
  }

  private startTask(task: DagNode) {
    this.activeTasks++;
    if (task.role === 'reviewer') {
      task.toolSurface = 'readonly';
    }
    let state = this.getTaskState(task.id);
    if (!state) {
      state = this.initTaskState('default-track', task.id);
    }
    
    // Checkpoint pre-task git state
    const sha = this.checkpointManager.createCheckpoint(task.id);
    const dodLevel = classifyDodLevel(task.contextFiles || []);
    
    this.updateTaskState(task.id, {
      checkpointSha: sha,
      dodLevel
    });

    const config = buildContext(task, this.commonContext);
    task.prompt = config.prompt; 

    // Match skills and inject context into the built prompt
    const matches = this.skillTrigger.match(task);
    const skillContext = this.skillTrigger.buildSkillContext(matches);
    if (skillContext) {
      task.prompt = `${task.prompt}\n\n--- Active Skills ---\n${skillContext}`;
    } 
    
    const hitRatio = this.cacheManager.processPayload({
      taskId: task.id,
      systemInstruction: 'Standard System Prompt Prefix',
      tools: 'Standard Tools Definition',
      context: task.prompt
    });
    
    if (typeof hitRatio === 'number') {
      this.updateTaskState(task.id, { hitRatio });
    }
    
    this.dispatcher.dispatch(task).catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      this.activeTasks--;
      this.storm.releaseAccess(task.id);
      this.scheduler.failTask(task.id);
      this.isHalted = true;
      this.pump();
    });
  }
}
