import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readTrackRegistry, TrackEntry } from '../track/track-reader.js';

export interface AgentContext {
  schemaVersion: string;
  generatedAt: string;
  projectRoot: string;
  toolRegistryStatus: 'ok' | 'degraded' | 'minimal' | 'missing';
  tracks: TrackEntry[];
  activeTrackId?: string;
  intelligenceSnapshot?: {
    timestamp: string;
    isStale: boolean;
    primaryLanguage?: string;
    totalFiles?: number;
    totalLines?: number;
  };
}

export function getAgentContext(projectRoot: string): AgentContext {
  const rawHome = process.env.SUPERCONDUCTOR_HOME || path.join(os.homedir(), '.superconductor');
  const homeDir = path.resolve(rawHome);
  // Validate homeDir is a directory if it exists
  if (fs.existsSync(homeDir) && !fs.statSync(homeDir).isDirectory()) {
    console.warn(`[agent-context] SUPERCONDUCTOR_HOME at ${homeDir} is not a directory, ignoring`);
    // homeDir still used below — registryPath existsSync will correctly return false
  }
  const registryPath = path.join(homeDir, 'tool-registry.json');
  let toolStatus: AgentContext['toolRegistryStatus'] = 'missing';

  if (fs.existsSync(registryPath)) {
    try {
      const reg = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      toolStatus = reg.overall_status || 'ok';
    } catch (err) {
      console.warn(`[agent-context] Corrupt tool registry at ${registryPath}: ${err instanceof Error ? err.message : String(err)}`);
      toolStatus = 'degraded';
    }
  }

  const tracks = readTrackRegistry(projectRoot);
  const activeTrack = tracks.find((t) => t.status === 'in_progress');

  let intelSnapshot: AgentContext['intelligenceSnapshot'] = undefined;
  const manifestPath = path.join(projectRoot, 'superconductor', 'intelligence', '00_manifest.json');

  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const timestamp = manifest.timestamp || new Date().toISOString();

      intelSnapshot = {
        timestamp,
        isStale: false,
        primaryLanguage: manifest.primaryLanguage,
        totalFiles: manifest.totalFiles,
        totalLines: manifest.totalLines
      };
    } catch (err) {
      console.warn(`[agent-context] Corrupt manifest at ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    projectRoot,
    toolRegistryStatus: toolStatus,
    tracks,
    activeTrackId: activeTrack ? activeTrack.trackId : undefined,
    intelligenceSnapshot: intelSnapshot
  };
}

export function compressContext(ctx: AgentContext, _tokenBudget?: number): AgentContext {
  // Compression removes non-essential track entries if context budget is constrained
  return {
    ...ctx,
    tracks: ctx.tracks.filter((t) => t.status === 'in_progress' || t.status === 'planned')
  };
}
