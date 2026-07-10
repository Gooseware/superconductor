import { EventEmitter } from 'events';
import { DagNode } from '../types/dag.types.js';
import { DispatcherEvent, SubagentResult } from '../types/dispatcher.types.js';

const TIER_CONFIG: Record<number, { model: string }> = {
  1: { model: 'script/regex' },
  2: { model: 'flash' },
  3: { model: 'pro' },
  4: { model: 'oracle' }
};

export class Dispatcher extends EventEmitter {
  getTierConfig(tier: number): { model: string } {
    return TIER_CONFIG[tier] || { model: 'flash' }; // fallback
  }

  async dispatch(task: DagNode): Promise<void> {
    const eventStarted: DispatcherEvent = {
      type: 'task_started',
      taskId: task.id
    };
    this.emit('event', eventStarted);

    try {
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
    } catch (error: any) {
      const eventFailed: DispatcherEvent = {
        type: 'task_failed',
        taskId: task.id,
        payload: {
          agentId: 'unknown',
          status: 'failure',
          output: '',
          error: error?.message || 'Unknown error occurred'
        }
      };
      this.emit('event', eventFailed);
    }
  }

  protected async simulateExecution(task: DagNode): Promise<SubagentResult> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (task.prompt.includes('Crash me')) {
          reject(new Error('Simulated crash'));
          return;
        }
        
        if (task.prompt.includes('Fail me')) {
          resolve({
            agentId: `sim-agent-${Math.random().toString(36).substring(2, 11)}`,
            status: 'failure',
            output: '',
            error: 'Simulated task failure'
          });
          return;
        }

        resolve({
          agentId: `sim-agent-${Math.random().toString(36).substring(2, 11)}`,
          status: 'success',
          output: `Simulated output for task ${task.id}`
        });
      }, 10);
    });
  }
}
