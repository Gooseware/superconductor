import { Dispatcher } from './dispatcher.js';
import { DagNode } from '../types/dag.types.js';

export class ParallelDispatcher extends Dispatcher {
  private maxConcurrent: number;
  private activeCount: number = 0;
  private queue: DagNode[] = [];

  constructor(maxConcurrent: number = 5) {
    super();
    this.maxConcurrent = maxConcurrent;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get activeAgents(): number {
    return this.activeCount;
  }

  async dispatch(task: DagNode): Promise<void> {
    if (this.activeCount >= this.maxConcurrent) {
      this.queue.push(task);
      return;
    }

    await this.executeTask(task);
  }

  private async executeTask(task: DagNode): Promise<void> {
    this.activeCount++;
    try {
      await super.dispatch(task);
    } finally {
      this.activeCount--;
      this.pumpQueue();
    }
  }

  private pumpQueue() {
    if (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        // We don't await this here so it runs in background similar to dispatch
        this.executeTask(nextTask).catch(err => {
          console.error('Error executing task from queue:', err);
        });
      }
    }
  }
}
