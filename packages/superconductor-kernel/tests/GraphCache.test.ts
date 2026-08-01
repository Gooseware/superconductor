import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphCache } from '../src/services/GraphCache.js';
import fs from 'fs';
import path from 'path';

describe('GraphCache', () => {
  const mockFilePath = path.join(__dirname, 'mock_graph.json');
  let cache: GraphCache;

  beforeEach(() => {
    const mockData = {
      nodes: [
        { id: "A", metadata: { churn: 10, community_id: "c1" } },
        { id: "B", metadata: { churn: 5, community_id: "c1" } },
        { id: "C", metadata: { churn: 20, community_id: "c2" } }
      ],
      edges: [
        { source: "A", target: "B" },
        { source: "B", target: "C" }
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

  it('should get neighbors with depth 1', () => {
    const neighbors = cache.getNeighbors('B', 1);
    expect(neighbors.sort()).toEqual(['A', 'C'].sort());
  });

  it('should compute shortest path', () => {
    const path = cache.shortestPath('A', 'C');
    expect(path).toEqual(['A', 'B', 'C']);
  });
});
