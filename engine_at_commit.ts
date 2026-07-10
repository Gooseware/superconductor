import { EventEmitter } from 'events';
import { TaskGraph, DagNode } from './types/dag.types.js';
import { Scheduler } from './scheduler/scheduler.js';
import { Dispatcher } from './dispatcher/dispatcher.js';
import { StormController } from './concurrency/storm.js';
import { buildContext } from './context/builder.js';
import { DispatcherEvent } from './types/dispatcher.types.js';

export class Engine extends EventEmitter {
  public scheduler: Scheduler;
  public dispatcher: Dispatcher;
  public storm: StormController;
  public commonContext: string = '';
  
  private waitingForLocks: Set<DagNode> = new Set();
  private activeTasks: number = 0;
  private isHalted: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private executionPromise: Promise<void> | null = null;
  private resolveExecution: (() => void) | null = null;

  constructor(graph: TaskGraph, commonContext: string = '') {
    super();
    this.commonContext = commonContext;
    this.scheduler = new Scheduler(graph, this.handleSchedulerEvent.bind(this));
    this.dispatcher = new Dispatcher();
    this.storm = new StormController();
    
    this.dispatcher.on('event', this.handleDispatcherEvent.bind(this));
  }

  private handleSchedulerEvent(event: any) {
    if (event.type === 'task_failed' || event.type === 'task_blocked') {
      // cascading failure logic
    }
  }

  private async handleDispatcherEvent(event: DispatcherEvent) {
    if (event.type === 'task_completed') {
      this.storm.releaseAccess(event.taskId);
      this.scheduler.completeTask(event.taskId);
      this.activeTasks--;
      this.pump();
    } else if (event.type === 'task_failed') {
      this.storm.releaseAccess(event.taskId);
      this.scheduler.failTask(event.taskId);
      this.activeTasks--;
      this.isHalted = true; // cascading failure, block
      this.pump();
    }
  }

  public async execute(): Promise<void> {
    this.executionPromise = new Promise((resolve) => {
      this.resolveExecution = resolve;
    });
    
    this.pump();
    
    return this.executionPromise;
  }

  private pump() {
    if (this.isHalted) {
      if (this.activeTasks === 0 && this.resolveExecution) {
        this.resolveExecution();
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
        this.resolveExecution();
      }
    }
  }

  private startTask(task: DagNode) {
    this.activeTasks++;
    const config = buildContext(task, this.commonContext);
    // the dispatcher does not use config right now, it takes DagNode directly. Let's pass the node but we could update its prompt.
    // Dispatcher simulateExecution looks at task.prompt
    task.prompt = config.prompt; 
    
    // We shouldn't block the pump on dispatch (simulateExecution will take time and resolve eventually)
    this.dispatcher.dispatch(task).catch((err) => {
      console.error(err);
    });
  }
}
