import { TaskGraph, DagNode } from '../types/dag.types.js';

export interface ValidationError {
  message: string;
  line?: number;
  column?: number;
}

export type ValidationResult =
  | { success: true; graph: TaskGraph }
  | { success: false; errors: ValidationError[] };

function findLineNumber(lines: string[], id: string): number {
  const index = lines.findIndex(line => line.includes(`id: ${id}`) || line.includes(`id: "${id}"`) || line.includes(`id: '${id}'`));
  return index >= 0 ? index + 1 : 1;
}

export function validateTaskGraph(graph: TaskGraph, yamlContent: string = ''): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = yamlContent ? yamlContent.split('\n') : [];

  // Check for missing dependencies
  for (const node of Object.values(graph.nodes)) {
    if (node.dependsOn) {
      for (const dep of node.dependsOn) {
        if (!graph.nodes[dep]) {
          const line = findLineNumber(lines, node.id);
          errors.push({ message: `Task ${node.id} references missing dependency: ${dep}`, line, column: 1 });
        }
      }
    }
  }

  // Detect Cycles (Kahn's algorithm)
  const inDegree: Record<string, number> = {};
  const adjList: Record<string, string[]> = {};
  
  for (const id of Object.keys(graph.nodes)) {
    inDegree[id] = 0;
    adjList[id] = [];
  }
  for (const edge of graph.edges) {
    if (inDegree[edge.to] !== undefined) {
      inDegree[edge.to]++;
    }
    if (adjList[edge.from]) {
      adjList[edge.from].push(edge.to);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of Object.entries(inDegree)) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  let visitedCount = 0;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    visitedCount++;

    const neighbors = adjList[curr] || [];
    for (const to of neighbors) {
      inDegree[to]--;
      if (inDegree[to] === 0) {
        queue.push(to);
      }
    }
  }

  if (visitedCount !== Object.keys(graph.nodes).length) {
    // Find a node that is part of a cycle
    const cycleNodes = Object.keys(graph.nodes).filter(id => inDegree[id] > 0);
    const line = cycleNodes.length > 0 ? findLineNumber(lines, cycleNodes[0]) : 1;
    errors.push({ message: `Graph contains a cycle involving nodes: ${cycleNodes.join(', ')}`, line, column: 1 });
  }

  // Detect orphan nodes (no path to root, where root is any node with inDegree 0)
  // Wait, Kahn's algorithm processes all nodes reachable from any node with inDegree 0.
  // Actually, Kahn's will visit orphan nodes if they form a separate DAG without cycles.
  // But orphans according to the test mean "no path to root".
  // Let's define "root" as nodes with no dependencies, BUT there's a specific root node or they must be connected to the main DAG.
  // The test for orphans:
  // Orphan 1 -> Orphan 2 -> []
  // This forms a disconnected component from the "root".
  // A standard way to find nodes with "no path to root" is to start from all nodes with 0 dependencies and do a BFS/DFS to find all reachable nodes.
  // If some nodes are not reachable, they are orphans.
  
  const rootNodes = Object.values(graph.nodes).filter(n => !n.dependsOn || n.dependsOn.length === 0);
  const reachableFromRoot = new Set<string>();
  
  const bfsQueue = rootNodes.map(n => n.id);
  for (const id of bfsQueue) {
    reachableFromRoot.add(id);
  }
  
  while (bfsQueue.length > 0) {
    const curr = bfsQueue.shift()!;
    const neighbors = adjList[curr] || [];
    for (const to of neighbors) {
      if (!reachableFromRoot.has(to)) {
        reachableFromRoot.add(to);
        bfsQueue.push(to);
      }
    }
  }

  // Any node not reachable from the root is an orphan
  for (const id of Object.keys(graph.nodes)) {
    if (!reachableFromRoot.has(id)) {
      if (visitedCount === Object.keys(graph.nodes).length) { 
        const line = findLineNumber(lines, id);
        errors.push({ message: `Task ${id} is an orphan node (no path from root node)`, line, column: 1 });
      }
    }
  }

  return errors;
}
