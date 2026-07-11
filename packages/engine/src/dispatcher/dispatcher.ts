import { EventEmitter } from 'events';
import { DagNode } from '../types/dag.types.js';
import { DispatcherEvent, SubagentResult } from '../types/dispatcher.types.js';
import { TaskLockManager } from '../concurrency/lock-manager.js';

import { execSync } from 'child_process';

function fetchDynamicTierConfig(): Record<number, { models: string[] }> {
  const config: Record<number, { models: string[] }> = {
    1: { models: ['script/regex'] },
    2: { models: [] },
    3: { models: [] },
    4: { models: [] }
  };

  try {
    const output = execSync('agy models', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const models = output.split('\n').map(m => m.trim()).filter(m => m.length > 0);

    for (const model of models) {
      const lower = model.toLowerCase();
      if (lower.includes('opus') || lower.includes('oracle') || lower.includes('high')) {
        config[4].models.push(model);
      } else if (lower.includes('pro') || lower.includes('sonnet') || lower.includes('thinking')) {
        config[3].models.push(model);
      } else {
        config[2].models.push(model);
      }
    }
  } catch (err) {
    // Fallback if agy is not available
    config[2].models = ['flash', 'claude-3-haiku'];
    config[3].models = ['pro', 'claude-3-5-sonnet'];
    config[4].models = ['oracle', 'claude-3-opus'];
  }

  if (config[2].models.length === 0) config[2].models.push('flash');
  if (config[3].models.length === 0) config[3].models.push('pro');
  if (config[4].models.length === 0) config[4].models.push('oracle');

  return config;
}

const TIER_CONFIG = fetchDynamicTierConfig();

export class Dispatcher extends EventEmitter {
  private lockManager: TaskLockManager;

  constructor() {
    super();
    this.lockManager = new TaskLockManager();
  }

  getTierConfig(tier: number): { models: string[] } {
    return TIER_CONFIG[tier] || { models: ['flash'] }; // fallback
  }

  async dispatch(task: DagNode): Promise<void> {
    const dispatcherAgentId = `dispatcher-${process.pid}`;
    const lockAcquired = await this.lockManager.acquireLock(task.id, dispatcherAgentId);
    if (!lockAcquired) {
      console.warn(`Could not acquire lock for task ${task.id}, another process may be handling it.`);
      const eventFailed: DispatcherEvent = {
        type: 'task_failed',
        taskId: task.id,
        payload: {
          agentId: dispatcherAgentId,
          status: 'failure',
          output: '',
          error: `Could not acquire lock for task ${task.id}`
        }
      };
      this.emit('event', eventFailed);
      return;
    }

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
    } finally {
      await this.lockManager.releaseLock(task.id, dispatcherAgentId);
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
