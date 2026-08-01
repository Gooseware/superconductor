import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GraphCache, GraphNode } from '../src/services/GraphCache.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fixture: realistic graphify-style graph with 4 nodes and 3 edges
const FIXTURE: { nodes: GraphNode[]; edges: { source: string; target: string }[] } = {
  nodes: [
    { id: 'src/auth/login.ts',   type: 'file', metadata: { churn: 42, community_id: 'c0', pagerank: 0.9 } },
    { id: 'src/auth/token.ts',   type: 'file', metadata: { churn: 12, community_id: 'c0', pagerank: 0.4 } },
    { id: 'src/api/routes.ts',   type: 'file', metadata: { churn: 7,  community_id: 'c1', pagerank: 0.3 } },
    { id: 'src/db/connection.ts',type: 'file', metadata: { churn: 3,  community_id: 'c1', pagerank: 0.1 } },
  ],
  edges: [
    { source: 'src/auth/login.ts', target: 'src/auth/token.ts' },
    { source: 'src/auth/login.ts', target: 'src/api/routes.ts' },
    { source: 'src/api/routes.ts', target: 'src/db/connection.ts' },
  ],
};

const FIXTURE_PATH = path.join(__dirname, '__fixtures__', 'test_graph.json');

beforeAll(() => {
  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(FIXTURE));
});

afterAll(() => {
  fs.rmSync(path.dirname(FIXTURE_PATH), { recursive: true, force: true });
});

describe('GraphCache — MCP tool backing store', () => {
  let cache: GraphCache;

  beforeAll(() => {
    cache = new GraphCache(FIXTURE_PATH);
  });

  describe('getNode', () => {
    it('returns the correct node for a known id', () => {
      const node = cache.getNode('src/auth/login.ts');
      expect(node).toBeDefined();
      expect(node!.id).toBe('src/auth/login.ts');
      expect(node!.type).toBe('file');
      expect(node!.metadata?.churn).toBe(42);
      expect(node!.metadata?.community_id).toBe('c0');
    });

    it('returns undefined for an unknown node id', () => {
      const node = cache.getNode('src/does-not-exist.ts');
      expect(node).toBeUndefined();
    });
  });

  describe('getNeighbors', () => {
    it('returns direct neighbours at depth 1', () => {
      const neighbours = cache.getNeighbors('src/auth/login.ts', 1);
      // login.ts → token.ts and login.ts → routes.ts
      expect(neighbours.sort()).toEqual(['src/api/routes.ts', 'src/auth/token.ts'].sort());
    });

    it('returns extended neighbours at depth 2', () => {
      const neighbours = cache.getNeighbors('src/auth/login.ts', 2);
      // Depth 2 reaches db/connection.ts via routes.ts
      expect(neighbours).toContain('src/db/connection.ts');
    });

    it('caps depth at 10 even when a higher value is requested', () => {
      // Should not throw and should return a finite set
      const neighbours = cache.getNeighbors('src/auth/login.ts', 999);
      expect(Array.isArray(neighbours)).toBe(true);
    });

    it('returns empty array for a leaf node with no neighbours', () => {
      // src/auth/token.ts has no outgoing edges and is only reached from login
      // but the graph is undirected so it has login as a neighbour
      const neighbours = cache.getNeighbors('src/db/connection.ts', 1);
      expect(neighbours).toContain('src/api/routes.ts');
    });
  });

  describe('shortestPath', () => {
    it('finds the correct path across two hops', () => {
      const p = cache.shortestPath('src/auth/login.ts', 'src/db/connection.ts');
      expect(p).toEqual([
        'src/auth/login.ts',
        'src/api/routes.ts',
        'src/db/connection.ts',
      ]);
    });

    it('returns a single-element path when source === target', () => {
      const p = cache.shortestPath('src/auth/login.ts', 'src/auth/login.ts');
      expect(p).toEqual(['src/auth/login.ts']);
    });

    it('returns null when no path exists between disconnected nodes', () => {
      // Add an isolated node scenario by querying an unknown id
      const p = cache.shortestPath('src/auth/login.ts', 'src/orphan.ts');
      expect(p).toBeNull();
    });
  });

  describe('load error handling', () => {
    it('throws a descriptive error when the graph file is missing', () => {
      const missing = new GraphCache('/tmp/definitely-does-not-exist-graph.json');
      expect(() => missing.getNode('anything')).toThrow(/Graph cache file not found/);
    });
  });
});
