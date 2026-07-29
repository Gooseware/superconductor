/**
 * mock-agent-spawner.ts — Phase 5: Test double for IAgentSpawner (spawn API)
 *
 * Provides a controllable spawner for tests:
 *  - Records all spawn() invocations in `spawned`
 *  - Returns scripted responses from the queue in order
 *  - Falls back to auto-generated synthetic IDs when queue is exhausted
 */
import type { IAgentSpawner, AgentSpawnConfig, SpawnedAgent } from './agent-spawner.js';

export class MockAgentSpawner implements IAgentSpawner {
  /** All configs that have been passed to spawn() */
  public readonly spawned: AgentSpawnConfig[] = [];
  private readonly responseQueue: SpawnedAgent[];

  constructor(responses: SpawnedAgent[] = []) {
    this.responseQueue = [...responses];
  }

  async spawn(config: AgentSpawnConfig): Promise<SpawnedAgent> {
    this.spawned.push(config);
    if (this.responseQueue.length > 0) {
      return this.responseQueue.shift()!;
    }
    return { conversationId: `mock-${this.spawned.length}`, synthetic: true };
  }

  /** Total number of spawn() calls made so far */
  get callCount(): number {
    return this.spawned.length;
  }
}
