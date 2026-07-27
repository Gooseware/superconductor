import { DependencyAnalyzer } from './dependency-analyzer.js';

export interface Chunk {
  id: string;
  files: string[];
  totalTokens: number;
}

export class CodebaseChunker {
  constructor(
    private analyzer: DependencyAnalyzer,
    private tokenCounter: (text: string) => number,
    private maxTokensPerChunk: number = 100000
  ) {}

  public async chunkFiles(files: string[]): Promise<Chunk[]> {
    const tokens: Record<string, number> = {};
    const adj: Record<string, Set<string>> = {};
    const fileSet = new Set(files);

    // Initialize adjacency list
    for (const f of files) {
      adj[f] = new Set();
    }

    // Process files
    for (const f of files) {
      let content = this.analyzer.getFileContent(f);
      if (content instanceof Promise) {
        content = await content;
      }
      tokens[f] = this.tokenCounter(content);

      let deps = this.analyzer.getDependenciesFor(f);
      if (deps instanceof Promise) {
        deps = await deps;
      }

      for (const dep of deps) {
        // We need a dummy checkExists that just checks if it's in our fileSet
        const resolved = this.analyzer.resolveImportPath(dep, f, (p) => fileSet.has(p));
        if (resolved && fileSet.has(resolved)) {
          adj[f].add(resolved);
          adj[resolved].add(f); // Undirected graph for clustering
        }
      }
    }

    // Find connected components
    const unvisited = new Set(files);
    const components: string[][] = [];

    while (unvisited.size > 0) {
      const start = unvisited.keys().next().value;
      const comp: string[] = [];
      const q = [start];
      if (start) unvisited.delete(start);

      while (q.length > 0) {
        const curr = q.shift()!;
        comp.push(curr);
        for (const neighbor of adj[curr]) {
          if (unvisited.has(neighbor)) {
            unvisited.delete(neighbor);
            q.push(neighbor);
          }
        }
      }
      components.push(comp);
    }

    const chunks: Chunk[] = [];
    let chunkId = 1;

    for (const comp of components) {
      let compTokens = comp.reduce((sum, f) => sum + tokens[f], 0);

      if (compTokens <= this.maxTokensPerChunk) {
        chunks.push({
          id: `chunk-${chunkId++}`,
          files: comp,
          totalTokens: compTokens,
        });
      } else {
        // Split oversized chunk
        const unassigned = new Set(comp);

        while (unassigned.size > 0) {
          const chunkFiles: string[] = [];
          let currentTokens = 0;

          // Pick a start node (could be node with most edges, but any is fine)
          const start = unassigned.keys().next().value;
          if (start) unassigned.delete(start);
          if (start) chunkFiles.push(start);
          if (start) currentTokens += tokens[start];

          const boundary = new Set<string>();
          if (start) for (const n of adj[start]) {
            if (unassigned.has(n)) boundary.add(n);
          }

          let added = true;
          while (added && boundary.size > 0) {
            added = false;
            for (const b of Array.from(boundary)) {
              if (currentTokens + tokens[b] <= this.maxTokensPerChunk) {
                unassigned.delete(b);
                boundary.delete(b);
                chunkFiles.push(b);
                currentTokens += tokens[b];
                
                for (const n of adj[b]) {
                  if (unassigned.has(n)) boundary.add(n);
                }
                added = true;
                break; // Restart boundary scan
              }
            }
          }

          chunks.push({
            id: `chunk-${chunkId++}`,
            files: chunkFiles,
            totalTokens: currentTokens,
          });
        }
      }
    }

    return chunks;
  }
}
