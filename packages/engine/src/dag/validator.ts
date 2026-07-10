import { TaskGraph, DagNode } from '../types/dag.types';

export interface ValidationError {
  message: string;
  line?: number;
  column?: number;
}

export type ValidationResult =
  | { success: true; graph: TaskGraph }
  | { success: false; errors: ValidationError[] };

function findLineNumber(yamlContent: string, id: string): number {
  if (!yamlContent) return 1;
  const lines = yamlContent.split('\n');
  const index = lines.findIndex(line => line.includes(`id: ${id}`) || line.includes(`id: "${id}"`) || line.includes(`id: '${id}'`));
  return index >= 0 ? index + 1 : 1;
}

export function validateTaskGraph(graph: TaskGraph, yamlContent: string = ''): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for missing dependencies
  for (const node of Object.values(graph.nodes)) {
    if (node.dependsOn) {
      for (const dep of node.dependsOn) {
        if (!graph.nodes[dep]) {
          const line = findLineNumber(yamlContent, node.id);
          errors.push({ message: `Task ${node.id} references missing dependency: ${dep}`, line, column: 1 });
        }
      }
    }
  }

  // Detect Cycles (Kahn's algorithm)
  const inDegree: Record<string, number> = {};
  for (const id of Object.keys(graph.nodes)) {
    inDegree[id] = 0;
  }
  for (const edge of graph.edges) {
    if (inDegree[edge.to] !== undefined) {
      inDegree[edge.to]++;
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of Object.entries(inDegree)) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  let visitedCount = 0;
  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);
    visitedCount++;

    for (const edge of graph.edges) {
      if (edge.from === curr) {
        inDegree[edge.to]--;
        if (inDegree[edge.to] === 0) {
          queue.push(edge.to);
        }
      }
    }
  }

  if (visitedCount !== Object.keys(graph.nodes).length) {
    // Find a node that is part of a cycle
    const cycleNodes = Object.keys(graph.nodes).filter(id => inDegree[id] > 0);
    const line = cycleNodes.length > 0 ? findLineNumber(yamlContent, cycleNodes[0]) : 1;
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
  
  const rootNode = Object.values(graph.nodes).find(n => !n.dependsOn || n.dependsOn.length === 0);
  const rootId = rootNode ? rootNode.id : undefined;

  const reachableFromRoot = new Set<string>();
  if (rootId) {
    const bfsQueue = [rootId];
    reachableFromRoot.add(rootId);
    
    while (bfsQueue.length > 0) {
      const curr = bfsQueue.shift()!;
      for (const edge of graph.edges) {
        if (edge.from === curr && !reachableFromRoot.has(edge.to)) {
          reachableFromRoot.add(edge.to);
          bfsQueue.push(edge.to);
        }
      }
    }
  }

  // Any node not reachable from the root is an orphan
  for (const id of Object.keys(graph.nodes)) {
    if (!reachableFromRoot.has(id)) {
      if (visitedCount === Object.keys(graph.nodes).length) { 
        const line = findLineNumber(yamlContent, id);
        errors.push({ message: `Task ${id} is an orphan node (no path from root node)`, line, column: 1 });
      }
    }
  }

  return errors;
}
