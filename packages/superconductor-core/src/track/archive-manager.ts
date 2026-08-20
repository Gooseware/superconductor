import * as fs from 'node:fs';
import * as path from 'node:path';
import * as lockfile from 'proper-lockfile';

export interface ArchiveManagerConfig {
  projectRoot: string;
}

export interface MigrationResult {
  migrated: string[];
  errors: string[];
}

export class ArchiveManager {
  private projectRoot: string;
  private tracksRegistryPath: string;
  private archiveRegistryPath: string;
  private tracksDir: string;
  private archiveDir: string;
  private legacyArchiveDir: string;

  constructor(config: ArchiveManagerConfig) {
    this.projectRoot = config.projectRoot;
    this.tracksRegistryPath = path.join(this.projectRoot, 'superconductor', 'tracks.md');
    this.archiveRegistryPath = path.join(this.projectRoot, 'superconductor', 'archive.md');
    this.tracksDir = path.join(this.projectRoot, 'superconductor', 'tracks');
    this.archiveDir = path.join(this.projectRoot, 'superconductor', 'tracks', 'archive');
    this.legacyArchiveDir = path.join(this.projectRoot, 'superconductor', 'archive');
  }

  /**
   * Checks whether a track has been archived (checks canonical path then legacy path).
   */
  public isArchived(trackId: string): boolean {
    const canonicalPath = path.join(this.archiveDir, trackId);
    if (fs.existsSync(canonicalPath)) return true;
    const legacyPath = path.join(this.legacyArchiveDir, trackId);
    return fs.existsSync(legacyPath);
  }

  /**
   * Returns the absolute path of an archived track if it exists, or null.
   */
  public getArchivePath(trackId: string): string | null {
    const canonicalPath = path.join(this.archiveDir, trackId);
    if (fs.existsSync(canonicalPath)) return canonicalPath;
    const legacyPath = path.join(this.legacyArchiveDir, trackId);
    if (fs.existsSync(legacyPath)) return legacyPath;
    return null;
  }

  /**
   * Archives a completed track to superconductor/tracks/archive/<track_id> transactionally.
   */
  public async archiveTrack(trackId: string): Promise<boolean> {
    if (!/^[a-zA-Z0-9_-]+$/.test(trackId) || trackId.toLowerCase() === 'archive') {
      throw new Error(`Invalid track ID: ${trackId}`);
    }

    const trackDirPath = path.join(this.tracksDir, trackId);
    const archiveDirPath = path.join(this.archiveDir, trackId);
    const legacyDirPath = path.join(this.legacyArchiveDir, trackId);

    // Strictly abort if tracks registry does not exist
    if (!fs.existsSync(this.tracksRegistryPath)) {
      throw new Error(`Registry not found at ${this.tracksRegistryPath}`);
    }
    
    // SEC-3: Namespace Collision (check canonical & legacy)
    if (fs.existsSync(archiveDirPath)) {
      throw new Error(`Archive directory already exists at ${archiveDirPath}`);
    }
    if (fs.existsSync(legacyDirPath)) {
      throw new Error(`Archive directory already exists at ${legacyDirPath}`);
    }

    // SEC-4: Verify source track directory exists
    const stat = fs.statSync(trackDirPath, { throwIfNoEntry: false });
    if (!stat || !stat.isDirectory()) {
      throw new Error(`Track directory not found or is not a directory at ${trackDirPath}`);
    }

    let releaseTracksLock: (() => Promise<void>) | undefined;
    let releaseArchiveLock: (() => Promise<void>) | undefined;
    
    try {
      try {
        releaseTracksLock = await lockfile.lock(this.tracksRegistryPath, { retries: 5 });
      } catch (err) {
        throw new Error(`Failed to acquire lock on ${this.tracksRegistryPath}: ${err}`);
      }

      const registryContent = fs.readFileSync(this.tracksRegistryPath, 'utf8');
    
      const trackIdEscaped = trackId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundaryRegex = new RegExp(`(?<![\\w-])${trackIdEscaped}(?![\\w-])`);

      let targetBlock = '';
      let status = '';

      // 1. Check if track is represented as a markdown table row
      const tableRowRegex = new RegExp(`^[ \\t]*\\|.*?(?:\\r?\\n|$)`, 'gm');
      let tableMatch: RegExpExecArray | null;
      while ((tableMatch = tableRowRegex.exec(registryContent)) !== null) {
        const row = tableMatch[0];
        if (boundaryRegex.test(row)) {
          const statusMatch = row.match(/\|\s*`?\[([xX \-~])\]`?\s*\|/) || row.match(/`?\[([xX \-~])\]`?/);
          if (statusMatch) {
            targetBlock = row;
            status = statusMatch[1].toLowerCase();
            break;
          }
        }
      }

      // 2. Fall back to list item or heading blocks
      if (!targetBlock) {
        const blockRegex = /^(?:[ \t]*[-*+][ \t]+|#{1,6}[ \t]+)`?\[[xX \-~]\]`?.*$/m;
        const blocks = registryContent.split(
          new RegExp(`(?=^(?:[ \\t]*[-*+][ \\t]+|#{1,6}[ \\t]+)\`?\\[[xX \\-~]\\]\`?)`, 'm')
        );

        for (const block of blocks) {
          if (block.includes(trackId) && boundaryRegex.test(block) && blockRegex.test(block)) {
            targetBlock = block;
            const match = block.match(/^(?:[ \t]*[-*+][ \t]+|#{1,6}[ \t]+)`?\[([xX \-~])\]`?/);
            if (match) status = match[1].toLowerCase();
            break;
          }
        }
      }

      if (!targetBlock) {
        throw new Error(`Track ${trackId} not found in tracks.md`);
      }

      const fullEntryLine = targetBlock;
      
      if (status !== 'x') {
        throw new Error(`Cannot archive track ${trackId}: status is [${status}]. Only [x] completed tracks can be archived.`);
      }

      // Prepare canonical archive directory
      if (!fs.existsSync(this.archiveDir)) {
        fs.mkdirSync(this.archiveDir, { recursive: true });
      }

      const defaultArchiveContent = '# Archived Tracks Registry\n\n## Index\n\n';
      try {
        fs.writeFileSync(this.archiveRegistryPath, defaultArchiveContent, { encoding: 'utf8', flag: 'wx' });
      } catch (e: any) {
        if (e.code !== 'EEXIST') throw e;
      }
      
      try {
        releaseArchiveLock = await lockfile.lock(this.archiveRegistryPath, { retries: 5 });
      } catch (err) {
        throw new Error(`Failed to acquire lock on ${this.archiveRegistryPath}: ${err}`);
      }
      
      const originalArchiveContent = fs.readFileSync(this.archiveRegistryPath, 'utf8');

      // Transactional Implementation
      let state: 'INIT' | 'MOVED' | 'WRITING_ARCHIVE' | 'APPENDED' | 'WRITING_REGISTRY' | 'REMOVED_FROM_REGISTRY' = 'INIT';
      
      try {
        // Step A: Move track folder to canonical archive location
        fs.renameSync(trackDirPath, archiveDirPath);
        state = 'MOVED';

        // Step B: Append entry to archive.md
        state = 'WRITING_ARCHIVE';
        let entryToAppend = fullEntryLine.trimEnd();
        entryToAppend = entryToAppend.replace(
          new RegExp(`\\(\\./tracks/${trackIdEscaped}/`, 'g'),
          `\(./tracks/archive/${trackId}/`
        );
        entryToAppend = entryToAppend.replace(
          new RegExp(`\\(tracks/${trackIdEscaped}/`, 'g'),
          `\(tracks/archive/${trackId}/`
        );

        let updatedArchive: string;
        const cleanArchive = originalArchiveContent.trimEnd();
        if (cleanArchive.length === 0) {
          updatedArchive = entryToAppend + '\n';
        } else if (cleanArchive.endsWith('|') && entryToAppend.startsWith('|')) {
          updatedArchive = cleanArchive + '\n' + entryToAppend + '\n';
        } else {
          updatedArchive = cleanArchive + '\n\n' + entryToAppend + '\n';
        }

        fs.writeFileSync(this.archiveRegistryPath, updatedArchive, 'utf8');
        state = 'APPENDED';

        // Step C: Remove entry from tracks.md
        state = 'WRITING_REGISTRY';
        const updatedRegistry = registryContent.replace(fullEntryLine, '');
        fs.writeFileSync(this.tracksRegistryPath, updatedRegistry, 'utf8');
        state = 'REMOVED_FROM_REGISTRY';

        return true;
      } catch (error) {
        // Rollback Mechanism
        this.rollback(trackId, state, archiveDirPath, trackDirPath, registryContent, originalArchiveContent);
        throw error;
      }
    } finally {
      if (releaseArchiveLock) await releaseArchiveLock();
      if (releaseTracksLock) await releaseTracksLock();
    }
  }

  /**
   * Migrates legacy archives from superconductor/archive/ to superconductor/tracks/archive/
   * and updates links in superconductor/archive.md.
   */
  public async migrateLegacyArchives(): Promise<MigrationResult> {
    const result: MigrationResult = { migrated: [], errors: [] };

    if (!fs.existsSync(this.legacyArchiveDir)) {
      return result;
    }

    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }

    let releaseArchiveLock: (() => Promise<void>) | undefined;
    try {
      if (fs.existsSync(this.archiveRegistryPath)) {
        try {
          releaseArchiveLock = await lockfile.lock(this.archiveRegistryPath, { retries: 5 });
        } catch {
          // Continue if locking fails
        }
      }

      const entries = fs.readdirSync(this.legacyArchiveDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const trackId = entry.name;
          const sourcePath = path.join(this.legacyArchiveDir, trackId);
          const targetPath = path.join(this.archiveDir, trackId);

          try {
            if (fs.existsSync(targetPath)) {
              result.errors.push(`Target ${targetPath} already exists; skipped legacy ${trackId}`);
              continue;
            }
            fs.renameSync(sourcePath, targetPath);
            result.migrated.push(trackId);
          } catch (err: any) {
            result.errors.push(`Failed to migrate ${trackId}: ${err.message}`);
          }
        }
      }

      // Update links in archive.md
      if (fs.existsSync(this.archiveRegistryPath) && result.migrated.length > 0) {
        let archiveContent = fs.readFileSync(this.archiveRegistryPath, 'utf8');
        for (const trackId of result.migrated) {
          // Replace links like [./archive/track_id/] or (archive/track_id/...) or (tracks/track_id/...)
          archiveContent = archiveContent.replace(
            new RegExp(`\\(\\./archive/${trackId}/`, 'g'),
            `\(./tracks/archive/${trackId}/`
          );
          archiveContent = archiveContent.replace(
            new RegExp(`\\(archive/${trackId}/`, 'g'),
            `\(tracks/archive/${trackId}/`
          );
          archiveContent = archiveContent.replace(
            new RegExp(`\\(\\./tracks/${trackId}/`, 'g'),
            `\(./tracks/archive/${trackId}/`
          );
          archiveContent = archiveContent.replace(
            new RegExp(`\\(tracks/${trackId}/`, 'g'),
            `\(tracks/archive/${trackId}/`
          );
        }
        fs.writeFileSync(this.archiveRegistryPath, archiveContent, 'utf8');
      }

      // Remove legacy directory if empty
      try {
        const remaining = fs.readdirSync(this.legacyArchiveDir);
        if (remaining.length === 0) {
          fs.rmdirSync(this.legacyArchiveDir);
        }
      } catch {}

    } finally {
      if (releaseArchiveLock) await releaseArchiveLock();
    }

    return result;
  }

  private rollback(
    trackId: string,
    state: 'INIT' | 'MOVED' | 'WRITING_ARCHIVE' | 'APPENDED' | 'WRITING_REGISTRY' | 'REMOVED_FROM_REGISTRY',
    archiveDirPath: string,
    trackDirPath: string,
    originalRegistry: string,
    originalArchiveContent: string
  ): void {
    console.warn(`[ArchiveManager] Rollback initiated for ${trackId} from state: ${state}`);
    try {
      if (['MOVED', 'WRITING_ARCHIVE', 'APPENDED', 'WRITING_REGISTRY', 'REMOVED_FROM_REGISTRY'].includes(state)) {
        if (fs.existsSync(archiveDirPath)) {
          fs.renameSync(archiveDirPath, trackDirPath);
        }
      }
    } catch (e) {
      console.error(`Rollback failed to restore track directory:`, e instanceof Error ? e.message : String(e));
    }
    
    try {
      if (['WRITING_ARCHIVE', 'APPENDED', 'WRITING_REGISTRY', 'REMOVED_FROM_REGISTRY'].includes(state)) {
        fs.writeFileSync(this.archiveRegistryPath, originalArchiveContent, 'utf8');
      }
    } catch (e) {
      console.error(`Rollback failed to restore archive.md:`, e instanceof Error ? e.message : String(e));
    }
    
    try {
      if (['WRITING_REGISTRY', 'REMOVED_FROM_REGISTRY'].includes(state)) {
        fs.writeFileSync(this.tracksRegistryPath, originalRegistry, 'utf8');
      }
    } catch (e) {
      console.error(`Rollback failed to restore tracks.md:`, e instanceof Error ? e.message : String(e));
    }
  }
}
