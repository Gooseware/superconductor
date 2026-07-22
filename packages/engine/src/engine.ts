import { EventEmitter } from 'events';
import { TaskGraph, DagNode } from './types/dag.types.js';
import { Scheduler } from './scheduler/scheduler.js';
import { Dispatcher } from './dispatcher/dispatcher.js';
import { StormController } from './concurrency/storm.js';
import { buildContext } from './context/builder.js';
import { DispatcherEvent } from './types/dispatcher.types.js';
import { EscalationRouter } from './routing/escalation-router.js';
import { CacheManager } from './routing/cache-manager.js';
import { EngineConfig, TrackExecutionState } from './types/engine.types.js';

export class Engine extends EventEmitter {
  public scheduler: Scheduler;
  public dispatcher: Dispatcher;
  public storm: StormController;
  public escalationRouter: EscalationRouter;
  public cacheManager: CacheManager;
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
    this.dispatcher = new Dispatcher();
    this.storm = new StormController();
    this.escalationRouter = new EscalationRouter(this);
    this.cacheManager = new CacheManager({ maxTokenBudget: config.disableCache ? 0 : 50000 });
    
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
    return updated;
  }

  private handleSchedulerEvent(event: any) {
    if (event.type === 'task_failed' || event.type === 'task_blocked') {
      this.isHalted = true;
    }
  }

  private async handleDispatcherEvent(event: DispatcherEvent) {
    if (event.type === 'task_completed') {
      this.escalationRouter.onTaskSuccess('default-track', event.taskId);
      this.storm.releaseAccess(event.taskId);
      this.scheduler.completeTask(event.taskId);
      this.activeTasks--;
      this.pump();
    } else if (event.type === 'task_failed') {
      const action = this.escalationRouter.processSignal('default-track', event.taskId, 'red_green_failure');
      if (action === 'escalate') {
        const task = this.scheduler.getTask(event.taskId);
        if (task) {
          const currentState = this.getTaskState(event.taskId);
          if (currentState) {
            this.updateTaskState(event.taskId, { model_tier: 4, escalated: true });
          }
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
    if (!this.getTaskState(task.id)) {
      this.initTaskState('default-track', task.id);
    }
    
    const config = buildContext(task, this.commonContext);
    task.prompt = config.prompt; 
    
    this.cacheManager.processPayload({
      taskId: task.id,
      systemInstruction: 'Standard System Prompt Prefix',
      tools: 'Standard Tools Definition',
      context: task.prompt
    });
    
    this.dispatcher.dispatch(task).catch((err) => {
      console.error(err);
      this.activeTasks--;
      this.storm.releaseAccess(task.id);
      this.scheduler.failTask(task.id);
      this.isHalted = true;
      this.pump();
    });
  }
}
