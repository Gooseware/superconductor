import { EventEmitter } from 'events';
import { DagNode } from '../types/dag.types.js';
import { DispatcherEvent, SubagentResult } from '../types/dispatcher.types.js';

export class Dispatcher extends EventEmitter {
  getTierConfig(tier: number): { model: string } {
    switch (tier) {
      case 1: return { model: 'script/regex' };
      case 2: return { model: 'flash' };
      case 3: return { model: 'pro' };
      case 4: return { model: 'oracle' };
      default: return { model: 'flash' }; // fallback
    }
  }

  async dispatch(task: DagNode): Promise<void> {
    const eventStarted: DispatcherEvent = {
      type: 'task_started',
      taskId: task.id
    };
    this.emit('event', eventStarted);

    const result = await this.simulateExecution(task);

    if (result.status === 'success') {
      const eventCompleted: DispatcherEvent = {
        type: 'task_completed',
        taskId: task.id,
        agentId: result.agentId,
        payload: result
      };
      this.emit('event', eventCompleted);
    } else {
      const eventFailed: DispatcherEvent = {
        type: 'task_failed',
        taskId: task.id,
        agentId: result.agentId,
        payload: result
      };
      this.emit('event', eventFailed);
    }
  }

  protected async simulateExecution(task: DagNode): Promise<SubagentResult> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          agentId: `sim-agent-${Math.random().toString(36).substring(2, 11)}`,
          status: 'success',
          output: `Simulated output for task ${task.id}`
        });
      }, 10);
    });
  }
}
