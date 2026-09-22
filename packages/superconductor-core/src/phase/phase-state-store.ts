import * as fs from 'node:fs';
import * as path from 'node:path';
import lockfile from 'proper-lockfile';
import { PhaseRegistryParser } from './phase-registry-parser.js';
import type { RegistryManifest } from './phase-manifest.js';

export interface PhaseStoreLockOptions {
  stale?: number;
  update?: number;
  retries?:
    | number
    | {
        retries?: number;
        factor?: number;
        minTimeout?: number;
        maxTimeout?: number;
        randomize?: boolean;
      };
  realpath?: boolean;
}

export interface PhaseStoreOptions {
  lockOptions?: PhaseStoreLockOptions;
}

export const DEFAULT_LOCK_OPTIONS: PhaseStoreLockOptions = {
  retries: {
    retries: 5,
    minTimeout: 50,
    maxTimeout: 500,
    factor: 2,
  },
};

/**
 * PhaseStateStore provides concurrency-guarded, atomic persistence for superconductor/tracks.md.
 *
 * Guarantees:
 * 1. Safe locking via proper-lockfile with exponential backoff & retries.
 * 2. Strict release in finally blocks even on catastrophic errors.
 * 3. Atomic POSIX write-rename pattern via unique sibling .tmp files.
 * 4. Automatic cleanup of intermediate temporary files on serialization or disk failures.
 * 5. Atomic read-modify-write mutation helper preventing lost updates.
 */
export class PhaseStateStore {
  public static readonly DEFAULT_LOCK_OPTIONS = DEFAULT_LOCK_OPTIONS;

  /**
   * Resolves the canonical path to superconductor/tracks.md for a given project root.
   */
  public static getTracksPath(projectRoot?: string): string {
    const resolved = path.resolve(projectRoot || process.cwd());
    if (resolved.endsWith('tracks.md')) return resolved;

    // 1. Check if resolved contains a nested superconductor directory with tracks.md
    const nestedTracksPath = path.join(resolved, 'superconductor', 'tracks.md');
    if (fs.existsSync(nestedTracksPath)) {
      return nestedTracksPath;
    }

    // 2. Check if resolved is already the metadata dir containing tracks.md
    // Only if tracks.md actually exists right inside resolved AND it is named 'superconductor'
    const directTracksPath = path.join(resolved, 'tracks.md');
    if (path.basename(resolved) === 'superconductor' && fs.existsSync(directTracksPath)) {
      return directTracksPath;
    }

    // Default canonical location
    return nestedTracksPath;
  }

  /**
   * Ensures the parent superconductor directory and tracks.md exist on disk
   * so proper-lockfile can safely bind a lock to it.
   */
  public static async ensureTracksFile(tracksPath: string): Promise<void> {
    const tracksDir = path.dirname(tracksPath);
    await fs.promises.mkdir(tracksDir, { recursive: true });
    if (!fs.existsSync(tracksPath)) {
      try {
        await fs.promises.writeFile(tracksPath, '', { flag: 'a' });
      } catch (err: unknown) {
        if (err && typeof err === 'object' && (err as { code?: string }).code !== 'EEXIST') {
          throw err;
        }
      }
    }
  }

  /**
   * Checks whether the tracks.md file is currently locked.
   */
  public static async isLocked(
    projectRoot: string,
    options?: PhaseStoreOptions
  ): Promise<boolean> {
    const tracksPath = this.getTracksPath(projectRoot);
    if (!fs.existsSync(tracksPath)) {
      return false;
    }
    return await lockfile.check(tracksPath, options?.lockOptions);
  }

  /**
   * Loads and parses the superconductor/tracks.md registry manifest under a concurrency lock.
   * If the tracks.md file does not exist, returns an empty manifest ({ phases: [] }).
   */
  public static async load(
    projectRoot: string,
    options?: PhaseStoreOptions
  ): Promise<RegistryManifest> {
    const tracksPath = this.getTracksPath(projectRoot);
    if (!fs.existsSync(tracksPath)) {
      return { phases: [] };
    }

    const lockOpts = { ...this.DEFAULT_LOCK_OPTIONS, ...options?.lockOptions };
    let release: (() => Promise<void>) | null = null;

    try {
      try {
        release = await lockfile.lock(tracksPath, lockOpts);
      } catch (lockErr: unknown) {
        // If file disappeared between check and lock, return empty manifest
        if (lockErr && typeof lockErr === 'object' && (lockErr as { code?: string }).code === 'ENOENT') {
          return { phases: [] };
        }
        throw lockErr;
      }

      const content = await fs.promises.readFile(tracksPath, 'utf-8');
      return PhaseRegistryParser.parse(content);
    } finally {
      if (release) {
        await release();
      }
    }
  }

  /**
   * Serializes and writes a RegistryManifest to superconductor/tracks.md atomically
   * using the .tmp write-rename pattern while holding a proper-lockfile lock.
   */
  public static async save(
    projectRoot: string,
    manifest: RegistryManifest,
    options?: PhaseStoreOptions
  ): Promise<void> {
    const tracksPath = this.getTracksPath(projectRoot);
    await this.ensureTracksFile(tracksPath);

    const lockOpts = { ...this.DEFAULT_LOCK_OPTIONS, ...options?.lockOptions };
    let release: (() => Promise<void>) | null = null;

    try {
      release = await lockfile.lock(tracksPath, lockOpts);
      await this.atomicWrite(tracksPath, manifest);
    } finally {
      if (release) {
        await release();
      }
    }
  }

  /**
   * Atomic read-modify-write helper.
   * Holds the proper-lockfile lock across both loading, mutation execution, and saving,
   * guaranteeing that concurrent writers will never produce lost updates.
   */
  public static async mutate<T>(
    projectRoot: string,
    mutator: (manifest: RegistryManifest) => Promise<T> | T,
    options?: PhaseStoreOptions
  ): Promise<T> {
    const tracksPath = this.getTracksPath(projectRoot);
    await this.ensureTracksFile(tracksPath);

    const lockOpts = { ...this.DEFAULT_LOCK_OPTIONS, ...options?.lockOptions };
    let release: (() => Promise<void>) | null = null;

    try {
      release = await lockfile.lock(tracksPath, lockOpts);

      const content = await fs.promises.readFile(tracksPath, 'utf-8');
      const manifest = PhaseRegistryParser.parse(content);

      const result = await mutator(manifest);

      const resObj = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
      let manifestToSave: RegistryManifest = manifest;

      if (resObj) {
        if ('phases' in resObj && Array.isArray(resObj.phases)) {
          manifestToSave = resObj as unknown as RegistryManifest;
        } else if (
          'manifest' in resObj &&
          resObj.manifest &&
          typeof resObj.manifest === 'object' &&
          'phases' in (resObj.manifest as Record<string, unknown>) &&
          Array.isArray((resObj.manifest as { phases?: unknown }).phases)
        ) {
          manifestToSave = resObj.manifest as unknown as RegistryManifest;
        }
      }

      await this.atomicWrite(tracksPath, manifestToSave);
      return result;
    } finally {
      if (release) {
        await release();
      }
    }
  }

  /**
   * Internal helper: writes serialized manifest content to a unique .tmp file in the
   * same directory, then atomically renames it over the target file.
   * Cleans up the temporary file if an error occurs before renaming.
   */
  private static async atomicWrite(
    tracksPath: string,
    manifest: RegistryManifest
  ): Promise<void> {
    const tracksDir = path.dirname(tracksPath);
    await fs.promises.mkdir(tracksDir, { recursive: true });

    let tempPath: string | null = null;

    try {
      const serialized = PhaseRegistryParser.serialize(manifest);
      const uniqueSuffix = `${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      tempPath = path.join(tracksDir, `.tracks.md.${uniqueSuffix}`);

      await fs.promises.writeFile(tempPath, serialized, 'utf-8');
      await fs.promises.rename(tempPath, tracksPath);
      tempPath = null;
    } catch (error) {
      if (tempPath) {
        try {
          if (fs.existsSync(tempPath)) {
            await fs.promises.unlink(tempPath);
          }
        } catch {
          // Suppress secondary cleanup errors to preserve primary error
        }
      }
      throw error;
    }
  }
}
