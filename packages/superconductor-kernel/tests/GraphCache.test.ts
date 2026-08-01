import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GraphCache } from '../src/services/GraphCache.js';
import fs from 'node:fs';

describe('GraphCache', () => {
  it('loads graph and gets node', () => {
    const mockGraph = {
      nodes: [
        { id: 'nodeA', churn: 10 },
        { id: 'nodeB', churn: 5 }
      ],
      edges: [
        { source: 'nodeA', target: 'nodeB' }
      ]
    };
    
    const cache = new GraphCache('/mock/root');
    // We override load directly for testing instead of mocking fs entirely, or we can patch fs.readFileSync
    const oldExists = fs.existsSync;
    const oldRead = fs.readFileSync;
    (fs as any).existsSync = () => true;
    (fs as any).readFileSync = () => JSON.stringify(mockGraph);
    
    try {
      const node = cache.getNode('nodeA');
      assert.deepStrictEqual(node, mockGraph.nodes[0]);
    } finally {
      (fs as any).existsSync = oldExists;
      (fs as any).readFileSync = oldRead;
    }
  });

  it('gets neighbors', () => {
    const mockGraph = {
      nodes: [
        { id: 'A' }, { id: 'B' }, { id: 'C' }
      ],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' }
      ]
    };
    const cache = new GraphCache('/mock/root');
    const oldExists = fs.existsSync;
    const oldRead = fs.readFileSync;
    (fs as any).existsSync = () => true;
    (fs as any).readFileSync = () => JSON.stringify(mockGraph);
    try {
      assert.deepStrictEqual(cache.getNeighbors('A', 1), ['B']);
      assert.deepStrictEqual(cache.getNeighbors('A', 2).sort(), ['B', 'C'].sort());
    } finally {
      (fs as any).existsSync = oldExists;
      (fs as any).readFileSync = oldRead;
    }
  });

  it('gets shortest path', () => {
    const mockGraph = {
      nodes: [
        { id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }
      ],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
        { source: 'C', target: 'D' }
      ]
    };
    const cache = new GraphCache('/mock/root');
    const oldExists = fs.existsSync;
    const oldRead = fs.readFileSync;
    (fs as any).existsSync = () => true;
    (fs as any).readFileSync = () => JSON.stringify(mockGraph);
    try {
      assert.deepStrictEqual(cache.shortestPath('A', 'D'), ['A', 'B', 'C', 'D']);
    } finally {
      (fs as any).existsSync = oldExists;
      (fs as any).readFileSync = oldRead;
    }
  });

  it('gets hotspots', () => {
    const mockGraph = {
      nodes: [
        { id: 'A', churn: 5 }, { id: 'B', churn: 15 }, { id: 'C', churn: 2 }
      ],
      edges: []
    };
    const cache = new GraphCache('/mock/root');
    const oldExists = fs.existsSync;
    const oldRead = fs.readFileSync;
    (fs as any).existsSync = () => true;
    (fs as any).readFileSync = () => JSON.stringify(mockGraph);
    try {
      const hotspots = cache.getHotspots('churn');
      assert.strictEqual(hotspots[0].id, 'B');
      assert.strictEqual(hotspots[1].id, 'A');
    } finally {
      (fs as any).existsSync = oldExists;
      (fs as any).readFileSync = oldRead;
    }
  });

  it('gets dependency graph', () => {
    const mockGraph = {
      nodes: [
        { id: 'A', community_id: 'c1' }, 
        { id: 'B', community_id: 'c1' }, 
        { id: 'C', community_id: 'c2' }
      ],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'C' }
      ]
    };
    const cache = new GraphCache('/mock/root');
    const oldExists = fs.existsSync;
    const oldRead = fs.readFileSync;
    (fs as any).existsSync = () => true;
    (fs as any).readFileSync = () => JSON.stringify(mockGraph);
    try {
      const cg = cache.getDependencyGraph('c1');
      assert.strictEqual(cg.nodes.length, 2);
      assert.strictEqual(cg.edges.length, 1);
      assert.strictEqual(cg.edges[0].source, 'A');
    } finally {
      (fs as any).existsSync = oldExists;
      (fs as any).readFileSync = oldRead;
    }
  });
});
