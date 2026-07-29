/**
 * spawner-config.ts — Phase 5: Spawner configuration reader
 *
 * Reads spawner-config.json from the superconductor config directory.
 * Returns null (with graceful degradation) if file is absent or malformed.
 */
import * as fs from 'fs';
import * as path from 'path';

export type SpawnerBackend = 'invoke_subagent' | 'noop';

export interface SpawnerConfig {
  backend: SpawnerBackend;
}

const SPAWNER_CONFIG_FILENAME = 'spawner-config.json';

/**
 * Reads and validates spawner-config.json from the given superconductor
 * directory. Returns null if the file is absent, unreadable, or malformed
 * so callers can degrade gracefully.
 */
export function readSpawnerConfig(superconductorDir: string): SpawnerConfig | null {
  try {
    const configPath = path.join(superconductorDir, SPAWNER_CONFIG_FILENAME);
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && 'backend' in parsed) {
      const backend = (parsed as { backend: string }).backend;
      if (backend === 'invoke_subagent' || backend === 'noop') {
        return { backend };
      }
    }
    return null;
  } catch {
    return null; // file absent or malformed
  }
}
