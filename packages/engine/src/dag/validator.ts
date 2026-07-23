import { TaskGraph } from '../types/dag.types.js';
import { findLineNumber } from './utils.js';

export interface ValidationError {
  message: string;
  line?: number;
  column?: number;
}

export type ValidationResult =
  | { success: true; graph: TaskGraph }
  | { success: false; errors: ValidationError[] };

function checkMissingDependencies(graph: TaskGraph, lines: string[]): ValidationError[] {
  const errors: ValidationError[] = [];
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
  return errors;
}

/**
 * Kahn's algorithm. Returns cycle errors and the visited count (used by orphan detection).
 */
function detectCycles(graph: TaskGraph, lines: string[]): { errors: ValidationError[]; visitedCount: number; inDegree: Record<string, number>; adjList: Record<string, string[]> } {
  const inDegree: Record<string, number> = {};
  const adjList: Record<string, string[]> = {};

  for (const id of Object.keys(graph.nodes)) {
    inDegree[id] = 0;
    adjList[id] = [];
  }
  for (const edge of graph.edges) {
    if (inDegree[edge.to] !== undefined) inDegree[edge.to]++;
    if (adjList[edge.from]) adjList[edge.from].push(edge.to);
  }

  const queue: string[] = [];
  for (const [id, degree] of Object.entries(inDegree)) {
    if (degree === 0) queue.push(id);
  }

  // Work on a copy of inDegree so orphan detection can use the original
  const inDegreeCopy = { ...inDegree };
  let visitedCount = 0;
  const queueCopy = [...queue];
  while (queueCopy.length > 0) {
    const curr = queueCopy.shift()!;
    visitedCount++;
    for (const to of adjList[curr] || []) {
      inDegreeCopy[to]--;
      if (inDegreeCopy[to] === 0) queueCopy.push(to);
    }
  }

  const errors: ValidationError[] = [];
  if (visitedCount !== Object.keys(graph.nodes).length) {
    const cycleNodes = Object.keys(graph.nodes).filter(id => inDegreeCopy[id] > 0);
    const line = cycleNodes.length > 0 ? findLineNumber(lines, cycleNodes[0]) : 1;
    errors.push({ message: `Graph contains a cycle involving nodes: ${cycleNodes.join(', ')}`, line, column: 1 });
  }

  return { errors, visitedCount, inDegree, adjList };
}

function detectOrphanNodes(graph: TaskGraph, lines: string[], visitedCount: number, adjList: Record<string, string[]>): ValidationError[] {
  const errors: ValidationError[] = [];

  const rootNodes = Object.values(graph.nodes).filter(n => !n.dependsOn || n.dependsOn.length === 0);
  const reachableFromRoot = new Set<string>();
  const bfsQueue = rootNodes.map(n => n.id);
  for (const id of bfsQueue) reachableFromRoot.add(id);

  while (bfsQueue.length > 0) {
    const curr = bfsQueue.shift()!;
    for (const to of adjList[curr] || []) {
      if (!reachableFromRoot.has(to)) {
        reachableFromRoot.add(to);
        bfsQueue.push(to);
      }
    }
  }

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

export function validateTaskGraph(graph: TaskGraph, yamlContent: string = ''): ValidationError[] {
  const lines = yamlContent ? yamlContent.split('\n') : [];
  const { errors: cycleErrors, visitedCount, adjList } = detectCycles(graph, lines);

  return [
    ...checkMissingDependencies(graph, lines),
    ...cycleErrors,
    ...detectOrphanNodes(graph, lines, visitedCount, adjList),
  ];
}
