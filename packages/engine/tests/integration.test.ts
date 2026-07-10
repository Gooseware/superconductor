import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine.js';
import { TaskGraph, DagNode } from '../src/types/dag.types.js';

describe('Superconductor Token Routing Integration (Phase 5)', () => {
  it('Execute test run simulation of full token routing loop', async () => {
    const nodes: Record<string, DagNode> = {};
    const edges: { from: string; to: string }[] = [];

    for (let i = 1; i <= 15; i++) {
      nodes[`task-${i}`] = {
        id: `task-${i}`,
        status: 'pending',
        prompt: `Large codebase edit prompt for task ${i}. Requires significant context.`,
        tier: 1,
        contextFiles: [`file${i}.ts`]
      };
      
      if (i > 1) {
        edges.push({ from: `task-${i-1}`, to: `task-${i}` });
      }
    }

    const graph: TaskGraph = { nodes, edges };
    const engineWithCache = new Engine(graph, 'Common Context', false);
    await engineWithCache.execute();
    
    const tokenUsageWithCache = engineWithCache.cacheManager.getCurrentTokenUsage();
    expect(tokenUsageWithCache).toBeGreaterThan(0);
    
    for (let i = 1; i <= 15; i++) {
       expect(graph.nodes[`task-${i}`].status).toBe('completed');
    }
  });

  it('Escalation router triggers and Engine handles it', async () => {
    const graph: TaskGraph = {
      nodes: {
        'task-fail': { id: 'task-fail', status: 'pending', prompt: 'Do something', tier: 1 }
      },
      edges: []
    };

    const engine = new Engine(graph, 'Common Context');
    
    // Process multiple signals to simulate failures externally
    engine.escalationRouter.processSignal('default-track', 'task-fail', 'red_green_failure');
    engine.escalationRouter.processSignal('default-track', 'task-fail', 'red_green_failure');
    engine.escalationRouter.processSignal('default-track', 'task-fail', 'red_green_failure');

    const history = engine.escalationRouter.getHistory('default-track', 'task-fail');
    expect(history).toBeDefined();
    expect(history?.signals.length).toBe(3);
    expect(history?.escalated).toBe(true);
  });
});
