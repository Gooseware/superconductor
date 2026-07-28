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
  /** Resolved absolute base directory — used for path-traversal assertion. */
  private baseDir: string;
  /** Per-track mutex chains for appendToAgentsManifest (REV-5). */
  private manifestMutexes: Map<string, Promise<void>> = new Map();

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
    this.baseDir = path.resolve(workspaceDir);
  }

  /**
   * Validates a single path segment (wuId or trackId) against path-traversal
   * attacks (REV-4). Rejects any input containing `..`, `/`, or `\`.
   *
   * @throws {Error} if the id contains dangerous characters.
   */
  private validateId(id: string): void {
    if (/\.\./.test(id) || /[/\\]/.test(id)) {
      throw new Error(`Invalid id: path traversal detected in "${id}"`);
    }
  }

  /**
   * Asserts that the fully-resolved path is still under baseDir (REV-4).
   *
   * @throws {Error} if the resolved path escapes the workspace directory.
   */
  private assertUnderBase(resolvedPath: string): void {
    const base = this.baseDir + path.sep;
    if (!resolvedPath.startsWith(base) && resolvedPath !== this.baseDir) {
      throw new Error(`Invalid path: resolved path escapes workspace directory`);
    }
  }

  /**
   * Returns the path to the implementor-result.json for a given work unit.
   * Sanitizes wuId to prevent path traversal (REV-4).
   */
  public getResultPath(wuId: string): string {
    this.validateId(wuId);
    const resolved = path.resolve(this.workspaceDir, '.superconductor', 'quorum', wuId, 'implementor-result.json');
    this.assertUnderBase(resolved);
    return resolved;
  }

  /**
   * Returns the path to the agents.json manifest for a given track.
   * Sanitizes trackId to prevent path traversal (REV-4).
   */
  public getAgentsManifestPath(trackId: string): string {
    this.validateId(trackId);
    const resolved = path.resolve(this.workspaceDir, '.superconductor', 'tracks', trackId, 'agents.json');
    this.assertUnderBase(resolved);
    return resolved;
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
   *
   * Uses a per-track async mutex (REV-5) so concurrent calls are serialized,
   * preventing lost updates from the read-modify-write cycle.
   */
  public appendToAgentsManifest(trackId: string, entry: AgentManifestEntry): Promise<void> {
    // Chain onto the existing promise for this track (or a resolved baseline)
    const previous = this.manifestMutexes.get(trackId) ?? Promise.resolve();
    const next = previous.then(() => this._doAppend(trackId, entry));
    // Store the chain (suppress unhandled rejection on chain itself)
    this.manifestMutexes.set(trackId, next.catch(() => {}));
    return next;
  }

  /** Internal: performs the actual read-modify-write under the mutex. */
  private async _doAppend(trackId: string, entry: AgentManifestEntry): Promise<void> {
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
