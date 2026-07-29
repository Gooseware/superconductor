/**
 * agy-agent-spawner.ts — Phase 5: AgyAgentSpawner implementation
 *
 * Reads spawner-config.json to determine backend. Defaults to 'noop' with a
 * warning when the config file is absent or malformed — never throws on spawn().
 */
import { readSpawnerConfig } from './spawner-config.js';
import type { IAgentSpawner, AgentSpawnConfig, SpawnedAgent } from './agent-spawner.js';

let syntheticCounter = 0;

export class AgyAgentSpawner implements IAgentSpawner {
  private readonly backend: 'invoke_subagent' | 'noop';

  constructor(private readonly superconductorDir: string) {
    const config = readSpawnerConfig(superconductorDir);
    if (!config) {
      console.warn(
        `[AgyAgentSpawner] spawner-config.json not found in ${superconductorDir}. ` +
        `Defaulting to noop backend. Agents will receive synthetic conversation IDs.`
      );
      this.backend = 'noop';
    } else {
      this.backend = config.backend;
      if (this.backend === 'noop') {
        console.warn('[AgyAgentSpawner] Backend is "noop". Agents will receive synthetic conversation IDs.');
      }
    }
  }

  async spawn(config: AgentSpawnConfig): Promise<SpawnedAgent> {
    if (this.backend === 'noop') {
      const syntheticId = `synthetic-${++syntheticCounter}-${Date.now()}`;
      return { conversationId: syntheticId, synthetic: true };
    }
    // 'invoke_subagent' backend — documents the real path without throwing.
    // Real implementation to be wired when AGY SDK is available in this runtime context.
    console.info(`[AgyAgentSpawner] invoke_subagent backend: would spawn role=${config.role}`);
    const syntheticId = `pending-invoke-${++syntheticCounter}`;
    return { conversationId: syntheticId, synthetic: true };
  }
}
