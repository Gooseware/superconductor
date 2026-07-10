import { TaskGraph } from '../types/dag.types';

/**
 * Generates a TaskGraph (DAG) from unstructured markdown spec and plan.
 * 
 * Note: This is currently a mock implementation that simulates LLM generation.
 * It returns a hardcoded valid TaskGraph demonstrating parallel paths and tier assignment.
 * 
 * @param spec The specification string in markdown.
 * @param plan The plan string in markdown.
 * @returns A promise that resolves to a structured TaskGraph.
 */
export async function generateDag(spec: string, plan: string): Promise<TaskGraph> {
  // Simulate asynchronous generation process
  await new Promise(resolve => setTimeout(resolve, 50));

  return {
    nodes: {
      'task1': {
        id: 'task1',
        name: 'Initial Setup',
        description: 'Complex initial setup task requiring broad context',
        role: 'architect',
        tier: 3,
        status: 'pending',
        prompt: 'Perform the initial setup...',
        dependsOn: []
      },
      'task2': {
        id: 'task2',
        name: 'Parallel Task A',
        description: 'Simple independent sub-task',
        role: 'editor',
        tier: 4,
        status: 'pending',
        prompt: 'Implement feature A...',
        dependsOn: ['task1']
      },
      'task3': {
        id: 'task3',
        name: 'Parallel Task B',
        description: 'Another simple independent sub-task',
        role: 'editor',
        tier: 4,
        status: 'pending',
        prompt: 'Implement feature B...',
        dependsOn: ['task1']
      }
    },
    edges: [
      { from: 'task1', to: 'task2' },
      { from: 'task1', to: 'task3' }
    ]
  };
}
