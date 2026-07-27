import { Dispatcher } from './dispatcher.js';
import { DagNode } from '../types/dag.types.js';
import { ImplementorRegistry } from './implementor-registry.js';
import { WorkUnitStateMachine, WorkUnitState } from '@superconductor/core/src/track/work-unit.js';

export class ParallelDispatcher extends Dispatcher {
  private maxConcurrent: number;
  private activeCount: number = 0;
  private queue: { task: DagNode; resolve: () => void; reject: (err: any) => void }[] = [];
  
  public implementorRegistry: ImplementorRegistry;
  public workUnitStateMachine: WorkUnitStateMachine;

  private agentToTaskId = new Map<string, string>();

  constructor(maxConcurrent: number = 5) {
    super();
    this.autoReleaseLock = false; // Phase 4 requirement
    this.maxConcurrent = Math.max(1, maxConcurrent);
    this.implementorRegistry = new ImplementorRegistry();
    this.workUnitStateMachine = new WorkUnitStateMachine();
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get activeAgents(): number {
    return this.activeCount;
  }

  async dispatch(task: DagNode): Promise<void> {
    if (this.activeCount >= this.maxConcurrent) {
      return new Promise<void>((resolve, reject) => {
        this.queue.push({ task, resolve, reject });
      });
    }

    await this.executeTask(task);
  }

  private async executeTask(task: DagNode): Promise<void> {
    this.activeCount++;
    try {
      const originalSimulate = this['simulateExecution'].bind(this);
      // We wrap simulateExecution just to capture the assigned agentId 
      // so we can map it back to the task ID for lock release.
      this['simulateExecution'] = async (t: DagNode) => {
        const res = await originalSimulate(t);
        this.agentToTaskId.set(res.agentId, t.id);
        return res;
      };
      await super.dispatch(task);
    } finally {
      this.activeCount--;
      this.pumpQueue();
    }
  }

  private pumpQueue() {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        // We don't await this here so it runs in background similar to dispatch
        this.executeTask(nextTask.task).then(nextTask.resolve).catch(nextTask.reject);
      }
    }
  }

  handleFinding(finding: { filePath: string; keyholePayload: any }): void {
    const implementorId = this.implementorRegistry.getImplementorForFile(finding.filePath);
    if (!implementorId) {
      throw new Error(`No active implementor found for file: ${finding.filePath}`);
    }

    const wu = this.implementorRegistry.getWorkUnit(implementorId);
    if (wu) {
      let updatedWu = wu;
      
      if (wu.state === WorkUnitState.DONE || wu.state === WorkUnitState.PENDING || wu.state === WorkUnitState.FAILED) {
        updatedWu = this.workUnitStateMachine.transition(wu, WorkUnitState.IN_PROGRESS);
      }

      if (updatedWu.state === WorkUnitState.IN_PROGRESS) {
        // Pause ONLY the affected implementor
        updatedWu = this.workUnitStateMachine.transition(updatedWu, WorkUnitState.PAUSED);
        this.implementorRegistry.register(implementorId, updatedWu);
      }
      
      if (updatedWu.state === WorkUnitState.PAUSED) {
        // Route the keyhole payload to them (emit an event)
        this.emit('keyhole_payload_routed', {
          implementorId,
          unitId: updatedWu.unitId,
          payload: finding.keyholePayload
        });
      }
    } else {
      throw new Error(`WorkUnit not found for implementor: ${implementorId}`);
    }
  }

  async handleQuorumResult(implementorId: string, result: { allGreen: boolean }): Promise<void> {
    const wu = this.implementorRegistry.getWorkUnit(implementorId);
    if (!wu) {
      throw new Error(`WorkUnit not found for implementor: ${implementorId}`);
    }

    if (result.allGreen) {
      // Transition WorkUnit to DONE with green consensus
      const updatedWu = this.workUnitStateMachine.transition(wu, WorkUnitState.DONE, { allGreen: true });
      this.implementorRegistry.register(implementorId, updatedWu);

      // Release lock
      const taskId = this.agentToTaskId.get(implementorId);
      if (taskId) {
        await this.lockManager.releaseLock(taskId, `dispatcher-${process.pid}`);
        this.agentToTaskId.delete(implementorId);
      }
    } else {
      // Transition to FAILED if not all green
      const updatedWu = this.workUnitStateMachine.transition(wu, WorkUnitState.FAILED);
      this.implementorRegistry.register(implementorId, updatedWu);
      
      // Do not release lock, it might be retried or kept held for remediation
    }
  }
}
