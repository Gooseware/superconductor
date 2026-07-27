import { describe, it, expect, vi } from 'vitest';
import { Engine } from '../src/engine.js';
import { TaskGraph } from '../src/types/dag.types.js';

describe('Engine Integration', () => {
  it('successfully executes a complete DAG from start to finish', async () => {
    const graph: TaskGraph = {
      nodes: {
        A1: { id: 'A1', status: 'pending', prompt: 'Do A', tier: 1 },
        B1: { id: 'B1', status: 'pending', prompt: 'Do B', tier: 1 },
        C1: { id: 'C1', status: 'pending', prompt: 'Do C', tier: 1 }
      },
      edges: [
        { from: 'A1', to: 'B1' },
        { from: 'A1', to: 'C1' }
      ]
    };

    const engine = new Engine(graph, 'Common Context');
    const result = await engine.execute();

    expect(result.success).toBe(true);
    expect(graph.nodes['A1'].status).toBe('completed');
    expect(graph.nodes['B1'].status).toBe('completed');
    expect(graph.nodes['C1'].status).toBe('completed');
  });

  it('halts and escalates/blocks upon cascading failure', async () => {
    const graph: TaskGraph = {
      nodes: {
        A2: { id: 'A2', status: 'pending', prompt: 'Fail me', tier: 1 },
        B2: { id: 'B2', status: 'pending', prompt: 'Do B', tier: 1 },
        C2: { id: 'C2', status: 'pending', prompt: 'Do C', tier: 1 }
      },
      edges: [
        { from: 'A2', to: 'B2' },
        { from: 'B2', to: 'C2' }
      ]
    };

    const engine = new Engine(graph);
    const result = await engine.execute();

    expect(result.success).toBe(false);
    expect(graph.nodes['A2'].status).toBe('failed');
    expect(graph.nodes['B2'].status).toBe('blocked');
    expect(graph.nodes['C2'].status).toBe('blocked');
  });

  it('safely resolves a file conflict via wait-and-retry', async () => {
    const graph: TaskGraph = {
      nodes: {
        A3: { id: 'A3', status: 'pending', prompt: 'Do A', tier: 1, contextFiles: ['file1.txt'] },
        B3: { id: 'B3', status: 'pending', prompt: 'Do B', tier: 1, contextFiles: ['file1.txt'] },
        C3: { id: 'C3', status: 'pending', prompt: 'Do C', tier: 1 }
      },
      edges: [
        { from: 'A3', to: 'C3' }
      ]
    };

    const engine = new Engine(graph);
    const result = await engine.execute();

    expect(result.success).toBe(true);
    expect(graph.nodes['A3'].status).toBe('completed');
    expect(graph.nodes['B3'].status).toBe('completed');
    expect(graph.nodes['C3'].status).toBe('completed');
  });

  it('handles unhandled dispatch rejection without hanging', async () => {
    const graph: TaskGraph = {
      nodes: {
        A4: { id: 'A4', status: 'pending', prompt: 'Crash me', tier: 1 },
        B4: { id: 'B4', status: 'pending', prompt: 'Do B', tier: 1 }
      },
      edges: [
        { from: 'A4', to: 'B4' }
      ]
    };

    const engine = new Engine(graph);
    const result = await engine.execute();

    expect(result.success).toBe(false);
    expect(graph.nodes['A4'].status).toBe('failed');
    expect(graph.nodes['B4'].status).toBe('blocked');
  });

  it('rejects the execution promise upon engine deadlock', async () => {
    const graph: TaskGraph = {
      nodes: {
        A5: { id: 'A5', status: 'pending', prompt: 'Do A', tier: 1, contextFiles: ['file1.txt'] },
        B5: { id: 'B5', status: 'pending', prompt: 'Do B', tier: 1, contextFiles: ['file2.txt'] }
      },
      edges: []
    };

    const engine = new Engine(graph);
    
    // Manually force a deadlock state by claiming files externally so tasks wait forever
    engine.storm.requestAccess('external', ['file1.txt', 'file2.txt']);
    
    await expect(engine.execute()).rejects.toThrow('Engine deadlock');
  });
});
