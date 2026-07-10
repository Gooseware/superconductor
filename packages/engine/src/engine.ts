import { EventEmitter } from 'events';
import { TaskGraph, DagNode } from './types/dag.types.js';
import { Scheduler } from './scheduler/scheduler.js';
import { Dispatcher } from './dispatcher/dispatcher.js';
import { StormController } from './concurrency/storm.js';
import { buildContext } from './context/builder.js';
import { DispatcherEvent } from './types/dispatcher.types.js';
import { EscalationRouter } from './routing/escalation-router.js';

export class Engine extends EventEmitter {
  public scheduler: Scheduler;
  public dispatcher: Dispatcher;
  public storm: StormController;
  public escalationRouter: EscalationRouter;
  public commonContext: string = '';
  
  private waitingForLocks: Set<DagNode> = new Set();
  private activeTasks: number = 0;
  private isHalted: boolean = false;
  private executionPromise: Promise<{ success: boolean }> | null = null;
  private resolveExecution: ((result: { success: boolean }) => void) | null = null;
  private rejectExecution: ((reason?: any) => void) | null = null;

  constructor(graph: TaskGraph, commonContext: string = '') {
    super();
    this.commonContext = commonContext;
    this.scheduler = new Scheduler(graph, this.handleSchedulerEvent.bind(this));
    this.dispatcher = new Dispatcher();
    this.storm = new StormController();
    this.escalationRouter = new EscalationRouter(this);
    
    this.dispatcher.on('event', this.handleDispatcherEvent.bind(this));
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
        // Re-dispatch task instead of halting
        const task = this.scheduler.getTask(event.taskId);
        if (task) {
          // In reality we would upgrade the model. We can just re-dispatch for now.
          this.activeTasks--; // since it's going to restart
          this.storm.releaseAccess(event.taskId); // release and let pump pick it up, or just dispatch directly?
          // Let's release access and put it back in waiting, wait no, scheduler nextBatch handles it?
          // Since it failed, if we don't mark it failed in scheduler, we can just reset its status to pending.
          task.status = 'pending';
          // we don't pump yet, just let pump pick it up again
          this.pump();
        }
      } else {
        this.storm.releaseAccess(event.taskId);
        this.scheduler.failTask(event.taskId);
        this.activeTasks--;
        this.isHalted = true; // cascading failure, block
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

    // Try to schedule tasks that were waiting for locks
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

    // Get new batch from scheduler
    const { tasks } = this.scheduler.nextBatch();
    
    for (const task of tasks) {
      const access = this.storm.requestAccess(task.id, task.contextFiles || []);
      if (access.success) {
        this.startTask(task);
      } else {
        this.waitingForLocks.add(task);
      }
    }

    // Check if we are done
    if (this.activeTasks === 0 && this.waitingForLocks.size === 0 && tasks.length === 0) {
      if (this.resolveExecution) {
        this.resolveExecution({ success: true });
      }
    }
    
    // Check for deadlock
    if (this.activeTasks === 0 && this.waitingForLocks.size > 0) {
      if (this.rejectExecution) {
        this.rejectExecution(new Error('Engine deadlock: tasks waiting for locks but no active tasks running'));
      }
    }
  }

  private startTask(task: DagNode) {
    this.activeTasks++;
    const config = buildContext(task, this.commonContext);
    
    task.prompt = config.prompt; 
    
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
