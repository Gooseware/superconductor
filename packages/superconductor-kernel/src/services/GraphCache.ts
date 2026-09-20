import fs from "fs";
import path from "path";

export interface GraphNode {
  id: string;
  type?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface GraphEdge {
  source: string;
  target: string;
  type?: string;
  [key: string]: any;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class GraphCache {
  private data: GraphData | null = null;
  private loadedPath: string | null = null;
  private filePath?: string;
  private workspaceRoot?: string;
  private projectRoot?: string;
  private adjacencyList: Map<string, string[]> = new Map();

  constructor(customPath?: string, workspaceRoot?: string) {
    if (workspaceRoot) {
      this.workspaceRoot = workspaceRoot;
      this.projectRoot = workspaceRoot;
      this.filePath = customPath;
    } else if (customPath) {
      if (customPath.endsWith(".json") || (fs.existsSync(customPath) && fs.statSync(customPath).isFile())) {
        this.filePath = customPath;
        this.projectRoot = path.dirname(path.resolve(customPath));
      } else {
        this.workspaceRoot = customPath;
        this.projectRoot = customPath;
      }
    } else {
      this.projectRoot = process.env.PROJECT_ROOT || process.cwd();
    }
  }

  public resolveFilePath(customPath?: string, workspaceRoot?: string): string {
    const rawRoot =
      workspaceRoot ||
      this.workspaceRoot ||
      this.projectRoot ||
      (process.env.SUPERCONDUCTOR_GRAPH_PATH ? path.dirname(path.resolve(process.env.SUPERCONDUCTOR_GRAPH_PATH)) : undefined) ||
      process.env.PROJECT_ROOT ||
      process.cwd();

    const allowedRoot = path.resolve(
      rawRoot.endsWith(".json") ? path.dirname(rawRoot) : rawRoot
    );

    let candidatePath: string;

    if (customPath) {
      candidatePath = path.isAbsolute(customPath)
        ? customPath
        : path.resolve(allowedRoot, customPath);
    } else if (workspaceRoot) {
      if (workspaceRoot.endsWith(".json")) {
        candidatePath = workspaceRoot;
      } else {
        candidatePath = path.join(workspaceRoot, "superconductor", "intelligence", "09_graphify_graph.json");
      }
    } else if (this.filePath) {
      candidatePath = this.filePath;
    } else if (this.workspaceRoot) {
      if (this.workspaceRoot.endsWith(".json")) {
        candidatePath = this.workspaceRoot;
      } else {
        candidatePath = path.join(this.workspaceRoot, "superconductor", "intelligence", "09_graphify_graph.json");
      }
    } else if (process.env.SUPERCONDUCTOR_GRAPH_PATH) {
      candidatePath = process.env.SUPERCONDUCTOR_GRAPH_PATH;
    } else {
      const defaultRoot = process.env.PROJECT_ROOT || process.cwd();
      candidatePath = path.join(defaultRoot, "superconductor", "intelligence", "09_graphify_graph.json");
    }

    const resolvedPath = path.resolve(candidatePath);

    // SEC-3: Explicit boundary containment check against allowedRoot
    const normalizedAllowedRoot = path.resolve(allowedRoot);
    const prefix = normalizedAllowedRoot.endsWith(path.sep)
      ? normalizedAllowedRoot
      : normalizedAllowedRoot + path.sep;

    if (resolvedPath !== normalizedAllowedRoot && !resolvedPath.startsWith(prefix)) {
      throw new Error(`Path traversal guard: "${resolvedPath}" is outside allowed root "${normalizedAllowedRoot}"`);
    }

    return resolvedPath;
  }

  load(customPath?: string, workspaceRoot?: string): GraphData {
    let targetPath: string;
    try {
      targetPath = this.resolveFilePath(customPath, workspaceRoot);
    } catch {
      this.data = { nodes: [], edges: [] };
      this.loadedPath = null;
      this.buildAdjacencyList();
      return this.data;
    }

    if (this.data && this.loadedPath === targetPath) {
      if (this.data.nodes.length === 0 && this.data.edges.length === 0) {
        if (!fs.existsSync(targetPath)) {
          return this.data;
        }
      } else {
        return this.data;
      }
    }

    if (!fs.existsSync(targetPath)) {
      this.data = { nodes: [], edges: [] };
      this.loadedPath = targetPath;
      this.buildAdjacencyList();
      return this.data;
    }

    try {
      const content = fs.readFileSync(targetPath, "utf-8");
      const parsed = JSON.parse(content) as GraphData;
      this.data = {
        nodes: Array.isArray(parsed?.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed?.edges) ? parsed.edges : [],
      };
    } catch {
      this.data = { nodes: [], edges: [] };
    }

    this.loadedPath = targetPath;
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
      if (!this.adjacencyList.has(edge.source)) {
        this.adjacencyList.set(edge.source, []);
      }
      if (!this.adjacencyList.has(edge.target)) {
        this.adjacencyList.set(edge.target, []);
      }
      const source = this.adjacencyList.get(edge.source);
      if (source) source.push(edge.target);
      const target = this.adjacencyList.get(edge.target);
      if (target) target.push(edge.source);
    }
  }

  getNode(nodeId: string, workspaceRoot?: string): GraphNode | undefined {
    this.load(undefined, workspaceRoot);
    return this.data?.nodes.find((n) => n.id === nodeId);
  }

  getNeighbors(nodeId: string, maxDepth?: number, workspaceRoot?: string): string[];
  getNeighbors(nodeId: string, workspaceRoot?: string): string[];
  getNeighbors(
    nodeId: string,
    maxDepthOrWorkspaceRoot: number | string = 1,
    workspaceRoot?: string
  ): string[] {
    let depth = 1;
    let wsRoot = workspaceRoot;

    if (typeof maxDepthOrWorkspaceRoot === "number") {
      depth = maxDepthOrWorkspaceRoot;
    } else if (typeof maxDepthOrWorkspaceRoot === "string") {
      wsRoot = maxDepthOrWorkspaceRoot;
    }

    this.load(undefined, wsRoot);
    if (!this.data || this.data.nodes.length === 0) {
      return [];
    }
    if (!this.adjacencyList.has(nodeId)) {
      return [];
    }
    const safeDepth = Math.min(depth, 10);
    if (safeDepth <= 0) {
      return [];
    }
    const visited = new Set<string>([nodeId]);
    const result = new Set<string>();
    let currentLevel = [nodeId];

    for (let i = 0; i < safeDepth; i++) {
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

  shortestPath(source: string, target: string, workspaceRoot?: string): string[] | null {
    this.load(undefined, workspaceRoot);
    if (!this.data || this.data.nodes.length === 0) {
      return null;
    }
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
