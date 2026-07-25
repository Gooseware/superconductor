export interface DAGResolverOptions<T = any> {
  /**
   * Function to extract node ID from item.
   * Defaults to item.id ?? item.trackId ?? String(item)
   */
  getId?: (item: T) => string;

  /**
   * Function to extract dependency IDs from item.
   * Defaults to item.deps ?? item.dependencies ?? []
   */
  getDeps?: (item: T) => string[];

  /**
   * Behavior when encountering missing/unresolved dependencies.
   * - 'error' (default): throws DAGMissingDependencyError.
   * - 'ignore': ignores missing dependencies.
   */
  onMissingDependency?: 'error' | 'ignore';
}

export class DAGMissingDependencyError extends Error {
  public missingDependencies: Record<string, string[]>;

  constructor(missingDependencies: Record<string, string[]>) {
    const details = Object.entries(missingDependencies)
      .map(([missingId, dependees]) => `"${missingId}" required by: ${dependees.join(', ')}`)
      .join('; ');
    super(`Missing dependencies detected in DAG: ${details}`);
    this.name = 'DAGMissingDependencyError';
    this.missingDependencies = missingDependencies;
    Object.setPrototypeOf(this, DAGMissingDependencyError.prototype);
  }
}

export class DAGCycleError extends Error {
  public cycle: string[];
  public remainingNodes: string[];

  constructor(cycle: string[], remainingNodes: string[]) {
    const cycleStr = cycle.join(' -> ');
    super(`Circular dependency detected: ${cycleStr}`);
    this.name = 'DAGCycleError';
    this.cycle = cycle;
    this.remainingNodes = remainingNodes;
    Object.setPrototypeOf(this, DAGCycleError.prototype);
  }
}

export class DAGResolver<T = any> {
  private getId: (item: T) => string;
  private getDeps: (item: T) => string[];
  private onMissingDependency: 'error' | 'ignore';

  constructor(options?: DAGResolverOptions<T>) {
    this.getId = options?.getId ?? ((item: any) => item?.id ?? item?.trackId ?? String(item));
    this.getDeps = options?.getDeps ?? ((item: any) => item?.deps ?? item?.dependencies ?? []);
    this.onMissingDependency = options?.onMissingDependency ?? 'error';
  }

  /**
   * Resolves graph nodes into parallel execution waves using Kahn's algorithm.
   */
  public getWaves(items: T[]): T[][] {
    if (!items || items.length === 0) {
      return [];
    }

    const itemMap = new Map<string, T>();
    const dependents = new Map<string, Set<string>>();
    const prerequisitesMap = new Map<string, Set<string>>();

    for (const item of items) {
      const id = this.getId(item);
      itemMap.set(id, item);
      prerequisitesMap.set(id, new Set());
      if (!dependents.has(id)) {
        dependents.set(id, new Set());
      }
    }

    const missingMap = new Map<string, Set<string>>();

    for (const item of items) {
      const id = this.getId(item);
      const rawDeps = this.getDeps(item);

      for (const depId of rawDeps) {
        if (itemMap.has(depId)) {
          prerequisitesMap.get(id)!.add(depId);
          if (!dependents.has(depId)) {
            dependents.set(depId, new Set());
          }
          dependents.get(depId)!.add(id);
        } else {
          if (!missingMap.has(depId)) {
            missingMap.set(depId, new Set());
          }
          missingMap.get(depId)!.add(id);
        }
      }
    }

    if (missingMap.size > 0 && this.onMissingDependency === 'error') {
      const missingDependencies: Record<string, string[]> = {};
      for (const [missingId, dependees] of missingMap.entries()) {
        missingDependencies[missingId] = Array.from(dependees).sort();
      }
      throw new DAGMissingDependencyError(missingDependencies);
    }

    const inDegree = new Map<string, number>();
    for (const [id, prereqs] of prerequisitesMap.entries()) {
      inDegree.set(id, prereqs.size);
    }

    // Initial wave: nodes with in-degree 0
    let currentWaveIds = Array.from(inDegree.entries())
      .filter(([_, count]) => count === 0)
      .map(([id]) => id)
      .sort();

    const waves: T[][] = [];
    const processedIds = new Set<string>();

    while (currentWaveIds.length > 0) {
      const currentWaveItems = currentWaveIds.map(id => itemMap.get(id)!);
      waves.push(currentWaveItems);

      const nextWaveIdsSet = new Set<string>();

      for (const u of currentWaveIds) {
        processedIds.add(u);
        const depsOfU = dependents.get(u) || new Set();

        for (const v of depsOfU) {
          if (processedIds.has(v)) continue;
          const newDegree = (inDegree.get(v) ?? 1) - 1;
          inDegree.set(v, newDegree);
          if (newDegree === 0) {
            nextWaveIdsSet.add(v);
          }
        }
      }

      currentWaveIds = Array.from(nextWaveIdsSet).sort();
    }

    if (processedIds.size < itemMap.size) {
      const remainingNodeIds = Array.from(itemMap.keys())
        .filter(id => !processedIds.has(id))
        .sort();

      const cycle = this.findCycle(remainingNodeIds, dependents);
      throw new DAGCycleError(cycle, remainingNodeIds);
    }

    return waves;
  }

  /**
   * Sorts nodes topologically into a flat list using Kahn's algorithm.
   */
  public sort(items: T[]): T[] {
    const waves = this.getWaves(items);
    return waves.flat();
  }

  /**
   * Static convenience method to sort nodes topologically.
   */
  public static sort<T = any>(items: T[], options?: DAGResolverOptions<T>): T[] {
    const resolver = new DAGResolver<T>(options);
    return resolver.sort(items);
  }

  /**
   * Static convenience method to get parallel waves.
   */
  public static getWaves<T = any>(items: T[], options?: DAGResolverOptions<T>): T[][] {
    const resolver = new DAGResolver<T>(options);
    return resolver.getWaves(items);
  }

  /**
   * Finds a simple cycle among remaining nodes using DFS over the dependents graph.
   */
  private findCycle(remainingNodeIds: string[], dependents: Map<string, Set<string>>): string[] {
    const remainingSet = new Set(remainingNodeIds);
    const state = new Map<string, number>(); // 1: VISITING, 2: VISITED
    const path: string[] = [];

    const dfs = (node: string): string[] | null => {
      state.set(node, 1);
      path.push(node);

      const nextNodes: string[] = Array.from(dependents.get(node) || new Set<string>())
        .filter(next => remainingSet.has(next))
        .sort();

      for (const next of nextNodes) {
        if (state.get(next) === 1) {
          const cycleStartIndex = path.indexOf(next);
          return [...path.slice(cycleStartIndex), next];
        }
        if (!state.has(next)) {
          const result = dfs(next);
          if (result) return result;
        }
      }

      path.pop();
      state.set(node, 2);
      return null;
    };

    for (const startNode of remainingNodeIds) {
      if (!state.has(startNode)) {
        const cycle = dfs(startNode);
        if (cycle) return cycle;
      }
    }

    // Fallback if no cycle path found explicitly
    return [...remainingNodeIds, remainingNodeIds[0]];
  }
}
