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

  constructor(maxConcurrent: number = 5) {
    super();
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
    if (implementorId) {
      const wu = this.implementorRegistry.getWorkUnit(implementorId);
      if (wu && wu.state === WorkUnitState.IN_PROGRESS) {
        // Pause ONLY the affected implementor
        const updatedWu = this.workUnitStateMachine.transition(wu, WorkUnitState.PAUSED);
        this.implementorRegistry.register(implementorId, updatedWu);
        
        // Route the keyhole payload to them (emit an event)
        this.emit('keyhole_payload_routed', {
          implementorId,
          unitId: updatedWu.unitId,
          payload: finding.keyholePayload
        });
      }
    }
  }
}
