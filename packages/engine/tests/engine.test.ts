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
    const result = await engine.execute();

    expect(result.success).toBe(true);
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
    const result = await engine.execute();

    expect(result.success).toBe(false);
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
      edges: [
        { from: 'A', to: 'C' }
      ]
    };

    const engine = new Engine(graph);
    const result = await engine.execute();

    expect(result.success).toBe(true);
    expect(graph.nodes['A'].status).toBe('completed');
    expect(graph.nodes['B'].status).toBe('completed');
    expect(graph.nodes['C'].status).toBe('completed');
  });

  it('handles unhandled dispatch rejection without hanging', async () => {
    const graph: TaskGraph = {
      nodes: {
        A: { id: 'A', status: 'pending', prompt: 'Crash me', tier: 1 },
        B: { id: 'B', status: 'pending', prompt: 'Do B', tier: 1 }
      },
      edges: [
        { from: 'A', to: 'B' }
      ]
    };

    const engine = new Engine(graph);
    const result = await engine.execute();

    expect(result.success).toBe(false);
    expect(graph.nodes['A'].status).toBe('failed');
    expect(graph.nodes['B'].status).toBe('blocked');
  });

  it('rejects the execution promise upon engine deadlock', async () => {
    const graph: TaskGraph = {
      nodes: {
        A: { id: 'A', status: 'pending', prompt: 'Do A', tier: 1, contextFiles: ['file1.txt'] },
        B: { id: 'B', status: 'pending', prompt: 'Do B', tier: 1, contextFiles: ['file2.txt'] }
      },
      edges: []
    };

    const engine = new Engine(graph);
    
    // Manually force a deadlock state by claiming files externally so tasks wait forever
    engine.storm.requestAccess('external', ['file1.txt', 'file2.txt']);
    
    await expect(engine.execute()).rejects.toThrow('Engine deadlock');
  });
});
