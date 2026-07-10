import { describe, it, expect, vi } from 'vitest';
import { Engine } from '../src/engine.js';
import { TaskGraph } from '../src/types/dag.types.js';

describe('Engine Integration', () => {
  it('successfully executes a complete DAG from start to finish', async () => {
    const graph: TaskGraph = {
      nodes: {
        A: { id: 'A', status: 'pending', prompt: 'Do A', tier: 1 },
        B: { id: 'B', status: 'pending', prompt: 'Do B', tier: 1 },
        C: { id: 'C', status: 'pending', prompt: 'Do C', tier: 1 }
      },
      edges: [
        { from: 'A', to: 'B' },
        { from: 'A', to: 'C' }
      ]
    };

    const engine = new Engine(graph, 'Common Context');
    await engine.execute();

    expect(graph.nodes['A'].status).toBe('completed');
    expect(graph.nodes['B'].status).toBe('completed');
    expect(graph.nodes['C'].status).toBe('completed');
  });

  it('halts and escalates/blocks upon cascading failure', async () => {
    const graph: TaskGraph = {
      nodes: {
        A: { id: 'A', status: 'pending', prompt: 'Fail me', tier: 1 },
        B: { id: 'B', status: 'pending', prompt: 'Do B', tier: 1 },
        C: { id: 'C', status: 'pending', prompt: 'Do C', tier: 1 }
      },
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' }
      ]
    };

    const engine = new Engine(graph);
    await engine.execute();

    expect(graph.nodes['A'].status).toBe('failed');
    expect(graph.nodes['B'].status).toBe('blocked');
    expect(graph.nodes['C'].status).toBe('blocked');
  });

  it('safely resolves a file conflict via wait-and-retry', async () => {
    const graph: TaskGraph = {
      nodes: {
        A: { id: 'A', status: 'pending', prompt: 'Do A', tier: 1, contextFiles: ['file1.txt'] },
        B: { id: 'B', status: 'pending', prompt: 'Do B', tier: 1, contextFiles: ['file1.txt'] },
        C: { id: 'C', status: 'pending', prompt: 'Do C', tier: 1 }
      },
      // A and B run in parallel (no edges), but conflict on file1.txt
      edges: [
        { from: 'A', to: 'C' } // Just to give it some structure
      ]
    };

    const engine = new Engine(graph);
    
    // We expect B to wait for A, or A to wait for B
    await engine.execute();

    expect(graph.nodes['A'].status).toBe('completed');
    expect(graph.nodes['B'].status).toBe('completed');
    expect(graph.nodes['C'].status).toBe('completed');
  });
});
