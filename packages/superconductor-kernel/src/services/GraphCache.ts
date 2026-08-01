import fs from "node:fs";
import path from "node:path";

export interface GraphNode {
  id: string;
  churn?: number;
  complexity?: number;
  pagerank?: number;
  community_id?: string;
  [key: string]: any;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class GraphCache {
  private data: GraphData | null = null;
  
  constructor(private projectRoot: string) {}

  public load(): void {
    const p = path.join(this.projectRoot, "superconductor", "intelligence", "09_graphify_graph.json");
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8");
        this.data = JSON.parse(content);
      } else {
        this.data = { nodes: [], edges: [] };
      }
    } catch (e) {
      console.error('Failed to load graph data:', e);
      this.data = { nodes: [], edges: [] };
    }
  }

  public getNode(nodeId: string): GraphNode | null {
    if (!this.data) this.load();
    return this.data!.nodes.find(n => n.id === nodeId) || null;
  }

  public getNeighbors(nodeId: string, maxDepth: number = 1): string[] {
    if (!this.data) this.load();
    if (maxDepth > 10) maxDepth = 10;
    
    const visited = new Set<string>();
    visited.add(nodeId);
    
    let currentLevel = [nodeId];
    
    for (let depth = 0; depth < maxDepth; depth++) {
      const nextLevel: string[] = [];
      for (const node of currentLevel) {
        for (const edge of this.data!.edges) {
          let neighbor = null;
          if (edge.source === node) neighbor = edge.target;
          else if (edge.target === node) neighbor = edge.source;
          
          if (neighbor && !visited.has(neighbor)) {
            visited.add(neighbor);
            nextLevel.push(neighbor);
          }
        }
      }
      currentLevel = nextLevel;
      if (currentLevel.length === 0) break;
    }
    
    visited.delete(nodeId);
    return Array.from(visited);
  }

  public shortestPath(source: string, target: string): string[] | null {
    if (!this.data) this.load();
    if (source === target) return [source];

    const queue: string[] = [source];
    const parent = new Map<string, string>();
    const visited = new Set<string>([source]);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === target) {
        const pathArr: string[] = [];
        let step = target;
        while (step !== source) {
          pathArr.push(step);
          step = parent.get(step)!;
        }
        pathArr.push(source);
        return pathArr.reverse();
      }

      for (const edge of this.data!.edges) {
        let neighbor = null;
        if (edge.source === curr) neighbor = edge.target;
        else if (edge.target === curr) neighbor = edge.source;

        if (neighbor && !visited.has(neighbor)) {
          visited.add(neighbor);
          parent.set(neighbor, curr);
          queue.push(neighbor);
        }
      }
    }
    return null;
  }

  public getHotspots(metric: 'churn' | 'complexity' | 'pagerank'): GraphNode[] {
    if (!this.data) this.load();
    return [...this.data!.nodes].sort((a, b) => {
      const vA = (a[metric] as number) || 0;
      const vB = (b[metric] as number) || 0;
      return vB - vA;
    }).slice(0, 20); // Top 20
  }

  public getDependencyGraph(communityId: string): GraphData {
    if (!this.data) this.load();
    const communityNodes = this.data!.nodes.filter(n => n.community_id === communityId);
    const communityNodeIds = new Set(communityNodes.map(n => n.id));
    
    const communityEdges = this.data!.edges.filter(e => 
      communityNodeIds.has(e.source) && communityNodeIds.has(e.target)
    );

    return {
      nodes: communityNodes,
      edges: communityEdges
    };
  }
}
