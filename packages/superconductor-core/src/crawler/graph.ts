import type { FlowNode, FlowTransition, UserFlowGraph, RankedFlowNode } from './types.js';

export { RankedFlowNode };

export class FlowGraphCycleError extends Error {
  public readonly cycle: string[];

  constructor(message: string, cycle: string[]) {
    super(message);
    this.name = 'FlowGraphCycleError';
    this.cycle = cycle;
  }
}

export interface TopologicalSortOptions {
  /**
   * If true, cycle-inducing back edges are broken to allow topological ranking of cyclic graphs.
   * Defaults to false (throws FlowGraphCycleError on cycles).
   */
  breakCycles?: boolean;
}

/**
 * FlowGraphBuilder constructs and maintains the directed user flow graph (V, E).
 * It manages screens, dialogs, drawers, and their directed transitions,
 * performing cycle detection and Kahn's algorithm topological sorting with rank assignments.
 */
export class FlowGraphBuilder {
  private nodes: Map<string, FlowNode> = new Map();
  private transitions: FlowTransition[] = [];
  private rootNodeId: string = '';

  constructor(rootNodeId: string = '') {
    this.rootNodeId = rootNodeId;
  }

  /**
   * Adds or updates a node in the graph.
   * If rootNodeId is not yet set, sets it to this node's id.
   */
  addNode(node: FlowNode): void {
    this.nodes.set(node.id, { ...node });
    if (!this.rootNodeId) {
      this.rootNodeId = node.id;
    } else if (node.path === '/' && this.rootNodeId !== node.id) {
      const currentRoot = this.nodes.get(this.rootNodeId);
      if (currentRoot && currentRoot.path !== '/') {
        this.rootNodeId = node.id;
      }
    }
  }

  /**
   * Retrieves a node by its ID.
   */
  getNode(id: string): FlowNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Returns all nodes in the graph.
   */
  getNodes(): FlowNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Sets the designated root node ID.
   */
  setRootNodeId(id: string): void {
    this.rootNodeId = id;
  }

  /**
   * Gets the designated root node ID.
   */
  getRootNodeId(): string {
    return this.rootNodeId;
  }

  /**
   * Adds a transition (directed edge) between two nodes in the graph.
   */
  addTransition(transition: FlowTransition): void {
    const id = transition.id || `${transition.sourceNodeId}->${transition.targetNodeId}:${transition.triggerType}`;
    const record: FlowTransition = {
      ...transition,
      id,
    };

    const existingIndex = this.transitions.findIndex(
      t => t.id === id || (
        t.sourceNodeId === transition.sourceNodeId &&
        t.targetNodeId === transition.targetNodeId &&
        t.triggerSelector === transition.triggerSelector &&
        t.triggerType === transition.triggerType
      )
    );

    if (existingIndex >= 0) {
      this.transitions[existingIndex] = record;
    } else {
      this.transitions.push(record);
    }
  }

  /**
   * Returns all transitions in the graph.
   */
  getTransitions(): FlowTransition[] {
    return [...this.transitions];
  }

  /**
   * Returns transitions originating from a specific source node ID.
   */
  getTransitionsFrom(nodeId: string): FlowTransition[] {
    return this.transitions.filter(t => t.sourceNodeId === nodeId);
  }

  /**
   * Returns transitions targeting a specific target node ID.
   */
  getTransitionsTo(nodeId: string): FlowTransition[] {
    return this.transitions.filter(t => t.targetNodeId === nodeId);
  }

  /**
   * Serializes the graph to a canonical UserFlowGraph object.
   */
  toJSON(): UserFlowGraph {
    let root = this.rootNodeId;
    if (!root && this.nodes.size > 0) {
      root = this.nodes.keys().next().value!;
    }
    return {
      nodes: this.getNodes(),
      transitions: this.getTransitions(),
      rootNodeId: root,
    };
  }

  /**
   * Deserializes a UserFlowGraph object into a FlowGraphBuilder instance.
   */
  static fromJSON(json: UserFlowGraph): FlowGraphBuilder {
    const builder = new FlowGraphBuilder(json.rootNodeId);
    if (json.nodes && Array.isArray(json.nodes)) {
      for (const node of json.nodes) {
        builder.addNode(node);
      }
    }
    if (json.transitions && Array.isArray(json.transitions)) {
      for (const transition of json.transitions) {
        builder.addTransition(transition);
      }
    }
    if (json.rootNodeId) {
      builder.setRootNodeId(json.rootNodeId);
    }
    return builder;
  }

  /**
   * Builds an adjacency list representation of the directed graph.
   */
  private getAdjacencyList(): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    for (const id of this.nodes.keys()) {
      adj.set(id, []);
    }
    for (const transition of this.transitions) {
      if (this.nodes.has(transition.sourceNodeId) && this.nodes.has(transition.targetNodeId)) {
        const neighbors = adj.get(transition.sourceNodeId)!;
        if (!neighbors.includes(transition.targetNodeId)) {
          neighbors.push(transition.targetNodeId);
        }
      }
    }
    return adj;
  }

  /**
   * Detects whether the graph contains any cycles.
   */
  hasCycles(): boolean {
    return this.detectCycle() !== null;
  }

  /**
   * Alias for hasCycles().
   */
  hasCycle(): boolean {
    return this.hasCycles();
  }

  /**
   * Detects a directed cycle in the graph using Depth-First Search (DFS) with 3-color marking.
   * If a cycle is found, returns an array of node IDs tracing the cycle (e.g. ['A', 'B', 'A']).
   * If acyclic, returns null.
   */
  detectCycle(): string[] | null {
    const adj = this.getAdjacencyList();
    // 0 = unvisited (white), 1 = visiting (gray), 2 = visited (black)
    const color = new Map<string, number>();

    for (const id of this.nodes.keys()) {
      color.set(id, 0);
    }

    const dfs = (u: string, path: string[]): string[] | null => {
      color.set(u, 1);
      path.push(u);

      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        const vColor = color.get(v) ?? 0;
        if (vColor === 1) {
          const cycleStart = path.indexOf(v);
          const cyclePath = path.slice(cycleStart);
          cyclePath.push(v);
          return cyclePath;
        }
        if (vColor === 0) {
          const found = dfs(v, path);
          if (found) return found;
        }
      }

      color.set(u, 2);
      path.pop();
      return null;
    };

    for (const id of this.nodes.keys()) {
      if (color.get(id) === 0) {
        const cycle = dfs(id, []);
        if (cycle) return cycle;
      }
    }

    return null;
  }

  /**
   * Returns all detected cycles.
   */
  detectCycles(): string[][] {
    const cycle = this.detectCycle();
    return cycle ? [cycle] : [];
  }

  /**
   * Topological sorting using Kahn's algorithm with rank assignment for layout engines.
   * Assigns an integer rank (layer: 0, 1, 2...) to each node.
   *
   * By default, throws FlowGraphCycleError if the graph contains cycles.
   * If options.breakCycles is true, back-edges participating in cycles are broken to permit ranking.
   */
  topologicalSort(options: TopologicalSortOptions = {}): RankedFlowNode[] {
    const { breakCycles = false } = options;
    const allNodeIds = Array.from(this.nodes.keys());
    if (allNodeIds.length === 0) return [];

    let activeTransitions = [...this.transitions].filter(
      t => this.nodes.has(t.sourceNodeId) && this.nodes.has(t.targetNodeId)
    );

    // If breakCycles is true, identify and remove back-edges
    if (breakCycles && this.hasCycles()) {
      activeTransitions = this.removeBackEdges(activeTransitions);
    }

    // Calculate in-degree for each node
    const inDegree = new Map<string, number>();
    const adj = new Map<string, Set<string>>();

    for (const id of allNodeIds) {
      inDegree.set(id, 0);
      adj.set(id, new Set());
    }

    for (const t of activeTransitions) {
      if (t.sourceNodeId === t.targetNodeId) continue; // ignore direct self-loops in DAG Kahn
      adj.get(t.sourceNodeId)!.add(t.targetNodeId);
    }

    for (const [_, targets] of adj.entries()) {
      for (const target of targets) {
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
      }
    }

    // Nodes with in-degree 0 start at rank 0
    let currentWave: string[] = allNodeIds.filter(id => (inDegree.get(id) ?? 0) === 0);

    // If rootNodeId is specified and has in-degree 0, ensure it is ranked first in wave 0
    if (this.rootNodeId && currentWave.includes(this.rootNodeId)) {
      currentWave = [this.rootNodeId, ...currentWave.filter(id => id !== this.rootNodeId)];
    }

    const rankMap = new Map<string, number>();
    const sortedNodeIds: string[] = [];
    let currentRank = 0;

    const visited = new Set<string>();

    while (currentWave.length > 0) {
      const nextWave: string[] = [];
      for (const u of currentWave) {
        if (visited.has(u)) continue;
        visited.add(u);
        sortedNodeIds.push(u);
        rankMap.set(u, Math.max(rankMap.get(u) ?? 0, currentRank));

        const neighbors = adj.get(u) || new Set();
        for (const v of neighbors) {
          const newDeg = (inDegree.get(v) ?? 1) - 1;
          inDegree.set(v, newDeg);
          rankMap.set(v, Math.max(rankMap.get(v) ?? 0, (rankMap.get(u) ?? 0) + 1));
          if (newDeg === 0) {
            nextWave.push(v);
          }
        }
      }
      currentWave = nextWave;
      currentRank++;
    }

    // Check if all nodes were processed
    if (sortedNodeIds.length < allNodeIds.length) {
      if (!breakCycles) {
        const cycle = this.detectCycle() || allNodeIds.filter(id => !visited.has(id));
        throw new FlowGraphCycleError(
          `Cycle detected in user flow graph: ${cycle.join(' -> ')}`,
          cycle
        );
      }
      const remaining = allNodeIds.filter(id => !visited.has(id));
      for (const rem of remaining) {
        sortedNodeIds.push(rem);
        rankMap.set(rem, currentRank);
      }
    }

    return sortedNodeIds.map(id => {
      const node = this.nodes.get(id)!;
      const rank = rankMap.get(id) ?? 0;
      const result: RankedFlowNode = Object.assign({}, node, {
        rank,
        node,
      });
      return result;
    });
  }

  /**
   * Returns nodes partitioned into topological waves (layers),
   * where wave[0] contains rank 0 nodes, wave[1] contains rank 1 nodes, etc.
   */
  getWaves(options: TopologicalSortOptions = {}): FlowNode[][] {
    const ranked = this.topologicalSort(options);
    const wavesMap = new Map<number, FlowNode[]>();

    for (const item of ranked) {
      if (!wavesMap.has(item.rank)) {
        wavesMap.set(item.rank, []);
      }
      wavesMap.get(item.rank)!.push(item.node);
    }

    const ranks = Array.from(wavesMap.keys()).sort((a, b) => a - b);
    return ranks.map(r => wavesMap.get(r)!);
  }

  /**
   * Returns a Map mapping nodeId to its calculated layout rank.
   */
  getRankedNodes(options: TopologicalSortOptions = {}): Map<string, number> {
    const ranked = this.topologicalSort(options);
    const map = new Map<string, number>();
    for (const r of ranked) {
      map.set(r.id, r.rank);
    }
    return map;
  }

  /**
   * Helper to identify and break cycle-inducing back-edges using DFS traversal.
   */
  private removeBackEdges(transitions: FlowTransition[]): FlowTransition[] {
    const adj = new Map<string, string[]>();
    for (const id of this.nodes.keys()) {
      adj.set(id, []);
    }
    for (const t of transitions) {
      adj.get(t.sourceNodeId)?.push(t.targetNodeId);
    }

    const color = new Map<string, number>();
    const backEdges = new Set<string>();

    const dfs = (u: string) => {
      color.set(u, 1);
      for (const v of adj.get(u) || []) {
        if (color.get(v) === 1) {
          backEdges.add(`${u}->${v}`);
        } else if ((color.get(v) ?? 0) === 0) {
          dfs(v);
        }
      }
      color.set(u, 2);
    };

    for (const id of this.nodes.keys()) {
      if ((color.get(id) ?? 0) === 0) {
        dfs(id);
      }
    }

    return transitions.filter(t => !backEdges.has(`${t.sourceNodeId}->${t.targetNodeId}`));
  }
}
