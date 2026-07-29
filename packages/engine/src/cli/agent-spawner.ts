/**
 * agent-spawner.ts — Phase 5: AgyAgentSpawner interfaces
 *
 * Separate from the legacy IAgentSpawner (invokeSubagent) in orchestrate.ts.
 * This module defines the new spawn(config) interface used by AgyAgentSpawner
 * and MockAgentSpawner.
 */

export interface SpawnedAgent {
  conversationId: string;
  /** true when no real agent was spawned (noop or pending-invoke paths) */
  synthetic: boolean;
}

export interface AgentSpawnConfig {
  role: string;
  prompt: string;
  model?: string;
  typeName?: string;
}

export interface IAgentSpawner {
  spawn(config: AgentSpawnConfig): Promise<SpawnedAgent>;
}
