import { TaskGraph, DagNode } from '../types/dag.types.js';
import { SchedulerEvent } from '../types/scheduler.types.js';

export class Scheduler {
  private graph: TaskGraph;
  private inDegree: Map<string, number> = new Map();
  private dependents: Map<string, string[]> = new Map();
  private onEvent?: (event: SchedulerEvent) => void;
  private frontier: DagNode[] = [];

  constructor(graph: TaskGraph, onEvent?: (event: SchedulerEvent) => void) {
    this.graph = graph;
    this.onEvent = onEvent;
    this.initializeGraph();
  }

  private initializeGraph() {
    for (const nodeId of Object.keys(this.graph.nodes)) {
      this.inDegree.set(nodeId, 0);
      this.dependents.set(nodeId, []);
    }

    for (const edge of this.graph.edges) {
      const toDegree = this.inDegree.get(edge.to) || 0;
      this.inDegree.set(edge.to, toDegree + 1);

      const deps = this.dependents.get(edge.from) || [];
      if (!deps.includes(edge.to)) {
        deps.push(edge.to);
      }
      this.dependents.set(edge.from, deps);
    }

    for (const [nodeId, degree] of this.inDegree.entries()) {
      const node = this.graph.nodes[nodeId];
      if (degree === 0 && node.status === 'pending') {
        this.frontier.push(node);
      }
    }
  }

  nextBatch(): { tasks: DagNode[] } {
    const batch = [...this.frontier];
    this.frontier = [];

    for (const node of batch) {
      node.status = 'running';
    }

    if (batch.length > 0) {
      this.emit({ type: 'batch_ready', payload: { tasks: batch } });
    }

    return { tasks: batch };
  }

  completeTask(id: string) {
    const node = this.graph.nodes[id];
    if (node && node.status !== 'completed') {
      node.status = 'completed';
      
      const deps = this.dependents.get(id) || [];
      for (const depId of deps) {
        const currentDegree = this.inDegree.get(depId) || 0;
        if (currentDegree > 0) {
          const newDegree = currentDegree - 1;
          this.inDegree.set(depId, newDegree);
          
          if (newDegree === 0) {
            const depNode = this.graph.nodes[depId];
            if (depNode.status === 'pending') {
              this.frontier.push(depNode);
            }
          }
        }
      }
      
      this.emit({ type: 'task_completed', payload: { taskId: id } });
    }
  }

  failTask(id: string) {
    const node = this.graph.nodes[id];
    if (node && node.status !== 'failed') {
      node.status = 'failed';
      
      this.emit({ type: 'task_failed', payload: { taskId: id } });
      
      this.markDescendantsBlocked(id);
    }
  }

  private markDescendantsBlocked(id: string) {
    const deps = this.dependents.get(id) || [];
    for (const depId of deps) {
      const depNode = this.graph.nodes[depId];
      if (depNode && depNode.status !== 'blocked' && depNode.status !== 'failed') {
        depNode.status = 'blocked';
        this.emit({ type: 'task_blocked', payload: { taskId: depId } });
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
