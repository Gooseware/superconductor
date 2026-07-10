import { TaskGraph, DagNode } from '../types/dag.types.js';
import { SchedulerEvent } from '../types/scheduler.types.js';

export class Scheduler {
  private graph: TaskGraph;
  private inDegree: Map<string, number> = new Map();
  private dependents: Map<string, string[]> = new Map();
  private onEvent?: (event: SchedulerEvent) => void;
  private activeCount: number = 0;
  private finished: boolean = false;

  constructor(graph: TaskGraph, onEvent?: (event: SchedulerEvent) => void) {
    this.graph = graph;
    this.onEvent = onEvent;
    this.initializeGraph();
  }

  private initializeGraph() {
    // Initialize degrees to 0 and dependents array
    for (const nodeId of Object.keys(this.graph.nodes)) {
      this.inDegree.set(nodeId, 0);
      this.dependents.set(nodeId, []);
    }

    // Build in-degree map and dependents map from edges
    for (const edge of this.graph.edges) {
      const toDegree = this.inDegree.get(edge.to) || 0;
      this.inDegree.set(edge.to, toDegree + 1);

      const deps = this.dependents.get(edge.from) || [];
      if (!deps.includes(edge.to)) {
        deps.push(edge.to);
      }
      this.dependents.set(edge.from, deps);
    }
  }

  nextBatch(): { tasks: DagNode[] } {
    const batch: DagNode[] = [];
    let hasPendingOrRunning = false;

    for (const [nodeId, degree] of this.inDegree.entries()) {
      const node = this.graph.nodes[nodeId];
      if (node.status === 'pending' || node.status === 'running') {
        hasPendingOrRunning = true;
      }

      if (degree === 0 && node.status === 'pending') {
        node.status = 'running';
        batch.push(node);
        this.activeCount++;
      }
    }

    if (batch.length > 0) {
      this.emit({ type: 'batch_ready', payload: { tasks: batch } });
    } else if (!hasPendingOrRunning && this.activeCount === 0 && !this.finished) {
      this.finished = true;
      this.emit({ type: 'workflow_finished' });
    }

    return { tasks: batch };
  }

  completeTask(id: string) {
    const node = this.graph.nodes[id];
    if (node && node.status !== 'completed') {
      node.status = 'completed';
      this.activeCount = Math.max(0, this.activeCount - 1);
      
      const deps = this.dependents.get(id) || [];
      for (const depId of deps) {
        const currentDegree = this.inDegree.get(depId) || 0;
        if (currentDegree > 0) {
          this.inDegree.set(depId, currentDegree - 1);
        }
      }
      
      this.emit({ type: 'task_completed', payload: { taskId: id } });
    }
  }

  failTask(id: string) {
    const node = this.graph.nodes[id];
    if (node && node.status !== 'failed') {
      node.status = 'failed';
      this.activeCount = Math.max(0, this.activeCount - 1);
      
      this.emit({ type: 'task_failed', payload: { taskId: id } });
      
      this.markDescendantsBlocked(id);
    }
  }

  private markDescendantsBlocked(id: string) {
    const deps = this.dependents.get(id) || [];
    for (const depId of deps) {
      const depNode = this.graph.nodes[depId];
      if (depNode && depNode.status !== 'blocked' && depNode.status !== 'failed') {
        const prevStatus = depNode.status;
        depNode.status = 'blocked';
        if (prevStatus === 'running') {
          this.activeCount = Math.max(0, this.activeCount - 1);
        }
        // Recursively block
        this.markDescendantsBlocked(depId);
      }
    }
  }

  private emit(event: SchedulerEvent) {
    if (this.onEvent) {
      this.onEvent(event);
    }
  }
}
