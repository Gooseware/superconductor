import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphCache } from '../src/services/GraphCache.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('GraphCache', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-test-'));
  const mockFilePath = path.join(tmpDir, 'mock_graph.json');
  let cache: GraphCache;

  beforeEach(() => {
    const mockData = {
      nodes: [
        { id: "A", metadata: { churn: 10, community_id: "c1" } },
        { id: "B", metadata: { churn: 5, community_id: "c1" } },
        { id: "C", metadata: { churn: 20, community_id: "c2" } },
        { id: "D", metadata: { churn: 1, community_id: "c3" } },
        { id: "E", metadata: { churn: 2, community_id: "c3" } }
      ],
      edges: [
        { source: "A", target: "B" },
        { source: "B", target: "C" },
        { source: "D", target: "E" }
      ]
    };
    fs.writeFileSync(mockFilePath, JSON.stringify(mockData));
    cache = new GraphCache(mockFilePath);
  });

  afterEach(() => {
    if (fs.existsSync(mockFilePath)) {
      fs.unlinkSync(mockFilePath);
    }
  });

  it('should load nodes correctly', () => {
    const node = cache.getNode('A');
    expect(node).toBeDefined();
    expect(node?.id).toBe('A');
  });

  it('should handle absent file gracefully', () => {
    const missingCache = new GraphCache(path.join(tmpDir, 'missing.json'));
    expect(() => missingCache.load()).toThrowError(/Graph cache file not found/);
  });

  it('should return undefined for non-existent nodes', () => {
    const node = cache.getNode('Z');
    expect(node).toBeUndefined();
  });

  it('should get neighbors with depth 1', () => {
    const neighbors = cache.getNeighbors('B', 1);
    expect(neighbors.sort()).toEqual(['A', 'C'].sort());
  });

  it('should get neighbors with depth > 1', () => {
    const neighbors = cache.getNeighbors('A', 2);
    expect(neighbors.sort()).toEqual(['B', 'C'].sort());
  });

  it('should return empty neighbors for non-existent node', () => {
    const neighbors = cache.getNeighbors('Z', 1);
    expect(neighbors).toEqual([]);
  });

  it('should compute shortest path', () => {
    const path = cache.shortestPath('A', 'C');
    expect(path).toEqual(['A', 'B', 'C']);
  });

  it('should return null for shortest path with no path', () => {
    const path = cache.shortestPath('A', 'D');
    expect(path).toBeNull();
  });

  it('should return null for shortest path when node does not exist', () => {
    const path = cache.shortestPath('A', 'Z');
    expect(path).toBeNull();
  });
});
