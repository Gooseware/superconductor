import fs from "fs";
import path from "path";

export interface GraphNode {
  id: string;
  type?: string;
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class GraphCache {
  private data: GraphData | null = null;
  private readonly filePath: string;
  private adjacencyList: Map<string, string[]> = new Map();

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
      this.filePath = path.join(PROJECT_ROOT, "superconductor", "intelligence", "09_graphify_graph.json");
    }
  }

  load(): GraphData {
    if (this.data) return this.data;
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`Graph cache file not found: ${this.filePath}`);
    }
    const content = fs.readFileSync(this.filePath, "utf-8");
    this.data = JSON.parse(content) as GraphData;
    this.buildAdjacencyList();
    return this.data;
  }

  private buildAdjacencyList() {
    this.adjacencyList.clear();
    if (!this.data) return;
    for (const node of this.data.nodes) {
      this.adjacencyList.set(node.id, []);
    }
    for (const edge of this.data.edges) {
      const source = this.adjacencyList.get(edge.source);
      if (source) source.push(edge.target);
      const target = this.adjacencyList.get(edge.target);
      if (target) target.push(edge.source);
    }
  }

  getNode(nodeId: string): GraphNode | undefined {
    this.load();
    return this.data?.nodes.find((n) => n.id === nodeId);
  }

  getNeighbors(nodeId: string, maxDepth: number = 1): string[] {
    this.load();
    const depth = Math.min(maxDepth, 10);
    const visited = new Set<string>([nodeId]);
    const result = new Set<string>();
    let currentLevel = [nodeId];

    for (let i = 0; i < depth; i++) {
      const nextLevel: string[] = [];
      for (const current of currentLevel) {
        const neighbors = this.adjacencyList.get(current) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            result.add(neighbor);
            nextLevel.push(neighbor);
          }
        }
      }
      currentLevel = nextLevel;
      if (currentLevel.length === 0) break;
    }

    return Array.from(result);
  }

  shortestPath(source: string, target: string): string[] | null {
    this.load();
    if (!this.adjacencyList.has(source) || !this.adjacencyList.has(target)) {
      return null;
    }
    if (source === target) return [source];

    const queue: string[] = [source];
    const parent = new Map<string, string>();
    parent.set(source, source);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === target) {
        const path: string[] = [];
        let curr = target;
        while (curr !== source) {
          path.unshift(curr);
          curr = parent.get(curr)!;
        }
        path.unshift(source);
        return path;
      }
      for (const neighbor of this.adjacencyList.get(current) || []) {
        if (!parent.has(neighbor)) {
          parent.set(neighbor, current);
          queue.push(neighbor);
        }
      }
    }
    return null; // No path found
  }
}
