import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a persisted agent output record stored per work unit.
 */
export interface AgentOutputRecord {
  wuId: string;
  conversationId: string;
  role: string;
  prompt: string;
  result?: unknown;
  completedAt: string;
}

/**
 * Represents an entry in the agents.json manifest for a track.
 */
export interface AgentManifestEntry {
  conversationId: string;
  wuId: string;
  role: string;
  spawnedAt: string;
}

/**
 * QuorumStore handles reading and writing quorum-related files:
 * - `.superconductor/quorum/<wu_id>/implementor-result.json` for per-agent outputs
 * - `.superconductor/tracks/<trackId>/agents.json` for the agents manifest
 */
export class QuorumStore {
  private workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  /**
   * Returns the path to the implementor-result.json for a given work unit.
   */
  public getResultPath(wuId: string): string {
    return path.join(this.workspaceDir, '.superconductor', 'quorum', wuId, 'implementor-result.json');
  }

  /**
   * Returns the path to the agents.json manifest for a given track.
   */
  public getAgentsManifestPath(trackId: string): string {
    return path.join(this.workspaceDir, '.superconductor', 'tracks', trackId, 'agents.json');
  }

  /**
   * Persists an agent output record to `.superconductor/quorum/<wuId>/implementor-result.json`.
   */
  public async writeResult(record: AgentOutputRecord): Promise<void> {
    const filePath = this.getResultPath(record.wuId);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
  }

  /**
   * Reads the agent output record from `.superconductor/quorum/<wuId>/implementor-result.json`.
   * Returns null if the file does not exist.
   */
  public async readResult(wuId: string): Promise<AgentOutputRecord | null> {
    const filePath = this.getResultPath(wuId);
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(raw) as AgentOutputRecord;
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Appends a new agent entry to the agents.json manifest for a track.
   * Creates the file if it does not exist.
   */
  public async appendToAgentsManifest(trackId: string, entry: AgentManifestEntry): Promise<void> {
    const filePath = this.getAgentsManifestPath(trackId);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

    let existing: AgentManifestEntry[] = [];
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      existing = JSON.parse(raw) as AgentManifestEntry[];
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    existing.push(entry);
    await fs.promises.writeFile(filePath, JSON.stringify(existing, null, 2), 'utf8');
  }

  /**
   * Reads the agents.json manifest for a track.
   * Returns an empty array if the file does not exist.
   */
  public async readAgentsManifest(trackId: string): Promise<AgentManifestEntry[]> {
    const filePath = this.getAgentsManifestPath(trackId);
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(raw) as AgentManifestEntry[];
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }
}
