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

  describe('when graph file is present (normal operations)', () => {
    it('should load nodes correctly', () => {
      const node = cache.getNode('A');
      expect(node).toBeDefined();
      expect(node?.id).toBe('A');
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

    it('should return single element array when source === target', () => {
      const path = cache.shortestPath('A', 'A');
      expect(path).toEqual(['A']);
    });
  });

  describe('when graph file is missing', () => {
    const missingFilePath = path.join(tmpDir, 'missing.json');
    let missingCache: GraphCache;

    beforeEach(() => {
      missingCache = new GraphCache(missingFilePath);
    });

    it('should return empty graph { nodes: [], edges: [] } and not throw', () => {
      expect(() => missingCache.load()).not.toThrow();
      const data = missingCache.load();
      expect(data).toEqual({ nodes: [], edges: [] });
    });

    it('should return undefined for getNode on missing file without throwing', () => {
      expect(() => missingCache.getNode('A')).not.toThrow();
      expect(missingCache.getNode('A')).toBeUndefined();
    });

    it('should return empty array for getNeighbors on missing file without throwing', () => {
      expect(() => missingCache.getNeighbors('A', 1)).not.toThrow();
      expect(missingCache.getNeighbors('A', 1)).toEqual([]);
    });

    it('should return null for shortestPath on missing file without throwing', () => {
      expect(() => missingCache.shortestPath('A', 'B')).not.toThrow();
      expect(missingCache.shortestPath('A', 'B')).toBeNull();
    });
  });

  describe('dynamic workspaceRoot scoping', () => {
    const customProjectDir = path.join(tmpDir, 'custom_project');
    const customIntelligenceDir = path.join(customProjectDir, 'superconductor', 'intelligence');
    const customGraphFile = path.join(customIntelligenceDir, '09_graphify_graph.json');

    beforeEach(() => {
      fs.mkdirSync(customIntelligenceDir, { recursive: true });
      const customData = {
        nodes: [
          { id: "X", metadata: { churn: 1 } },
          { id: "Y", metadata: { churn: 2 } }
        ],
        edges: [
          { source: "X", target: "Y" }
        ]
      };
      fs.writeFileSync(customGraphFile, JSON.stringify(customData));
    });

    afterEach(() => {
      fs.rmSync(customProjectDir, { recursive: true, force: true });
    });

    it('should accept workspaceRoot in constructor', () => {
      const scopedCache = new GraphCache(undefined, customProjectDir);
      const data = scopedCache.load();
      expect(data.nodes.length).toBe(2);
      expect(scopedCache.getNode('X')?.id).toBe('X');
    });

    it('should accept directory path as first arg in constructor', () => {
      const scopedCache = new GraphCache(customProjectDir);
      const data = scopedCache.load();
      expect(data.nodes.length).toBe(2);
      expect(scopedCache.getNode('Y')?.id).toBe('Y');
    });

    it('should dynamically scope via query methods', () => {
      const defaultCache = new GraphCache();
      const node = defaultCache.getNode('X', customProjectDir);
      expect(node).toBeDefined();
      expect(node?.id).toBe('X');

      const neighbors = defaultCache.getNeighbors('X', 1, customProjectDir);
      expect(neighbors).toEqual(['Y']);

      const path = defaultCache.shortestPath('X', 'Y', customProjectDir);
      expect(path).toEqual(['X', 'Y']);
    });
  });

  describe('path traversal guard (SEC-3)', () => {
    it('throws error when customPath attempts traversal outside allowedRoot', () => {
      const scopedCache = new GraphCache(undefined, '/tmp/safe-root');
      expect(() => scopedCache.resolveFilePath('../../../etc/passwd')).toThrow(/Path traversal/i);
    });

    it('returns empty graph when load encounters path traversal', () => {
      const scopedCache = new GraphCache(undefined, '/tmp/safe-root');
      const data = scopedCache.load('../../../etc/passwd');
      expect(data).toEqual({ nodes: [], edges: [] });
    });

    it('rejects absolute path outside allowedRoot', () => {
      const scopedCache = new GraphCache(undefined, '/tmp/safe-root');
      expect(() => scopedCache.resolveFilePath('/etc/shadow')).toThrow(/Path traversal/i);
      const data = scopedCache.load('/etc/shadow');
      expect(data).toEqual({ nodes: [], edges: [] });
    });

    it('safely handles query methods when traversal is attempted', () => {
      const defaultCache = new GraphCache();
      expect(defaultCache.getNode('A', '../../../etc/passwd')).toBeUndefined();
      expect(defaultCache.getNeighbors('A', 1, '../../../etc/passwd')).toEqual([]);
      expect(defaultCache.shortestPath('A', 'B', '../../../etc/passwd')).toBeNull();
    });
  });
});
