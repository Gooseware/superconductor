import * as fs from 'node:fs';
import * as path from 'node:path';
import * as lockfile from 'proper-lockfile';

export interface ArchiveManagerConfig {
  projectRoot: string;
}

export class ArchiveManager {
  private projectRoot: string;
  private tracksRegistryPath: string;
  private archiveRegistryPath: string;
  private tracksDir: string;
  private archiveDir: string;

  constructor(config: ArchiveManagerConfig) {
    this.projectRoot = config.projectRoot;
    this.tracksRegistryPath = path.join(this.projectRoot, 'superconductor', 'tracks.md');
    this.archiveRegistryPath = path.join(this.projectRoot, 'superconductor', 'archive.md');
    this.tracksDir = path.join(this.projectRoot, 'superconductor', 'tracks');
    this.archiveDir = path.join(this.projectRoot, 'superconductor', 'archive');
  }

  public async archiveTrack(trackId: string): Promise<boolean> {
    if (!/^[a-zA-Z0-9_-]+$/.test(trackId) || trackId.toLowerCase() === 'archive') {
      throw new Error(`Invalid track ID: ${trackId}`);
    }

    const trackDirPath = path.join(this.tracksDir, trackId);
    const archiveDirPath = path.join(this.archiveDir, trackId);

    // Strictly abort if track is not completed
    if (!fs.existsSync(this.tracksRegistryPath)) {
      throw new Error(`Registry not found at ${this.tracksRegistryPath}`);
    }
    
    // SEC-3: Namespace Collision
    if (fs.existsSync(archiveDirPath)) {
      throw new Error(`Archive directory already exists at ${archiveDirPath}`);
    }

    // SEC-4: Symlink
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
    
      // Split the registry into blocks that start with a track heading
      const blockRegex = /^(?:\s*-\s*|##\s*)\[[xX \-~]\].*$/m;
      const blocks = registryContent.split(new RegExp(`(?=^(?:\\s*-\\s*|##\\s*)\\[[xX \\-~]\\])`, 'm'));
      
      let targetBlock = '';
      let status = '';
      for (const block of blocks) {
        const firstLine = block.split('\n')[0] || '';
        // SEC-1: Precise boundary match
        if (firstLine.includes(trackId) && new RegExp(`(?<![\\w-])${trackId}(?![\\w-])`).test(firstLine) && blockRegex.test(block)) {
          targetBlock = block;
          const match = block.match(/^(?:\s*-\s*|##\s*)\[([xX \-~])\]/);
          if (match) status = match[1].toLowerCase();
          break;
        }
      }

      if (!targetBlock) {
        throw new Error(`Track ${trackId} not found in tracks.md`);
      }

      const fullEntryLine = targetBlock;
      
      if (status !== 'x') {
        throw new Error(`Cannot archive track ${trackId}: status is [${status}]. Only [x] completed tracks can be archived.`);
      }

      // Prepare archive registry
      if (!fs.existsSync(this.archiveDir)) {
        fs.mkdirSync(this.archiveDir, { recursive: true });
      }

      let originalArchiveContent = '# Archived Tracks Registry\n\n## Index\n\n';
      
      try {
        fs.writeFileSync(this.archiveRegistryPath, originalArchiveContent, { encoding: 'utf8', flag: 'wx' });
      } catch (e: any) {
        if (e.code !== 'EEXIST') throw e;
      }
      
      try {
        releaseArchiveLock = await lockfile.lock(this.archiveRegistryPath, { retries: 5 });
      } catch (err) {
        throw new Error(`Failed to acquire lock on ${this.archiveRegistryPath}: ${err}`);
      }
      
      originalArchiveContent = fs.readFileSync(this.archiveRegistryPath, 'utf8');

      // Transactional Implementation
      let state: 'INIT' | 'MOVED' | 'WRITING_ARCHIVE' | 'APPENDED' | 'WRITING_REGISTRY' | 'REMOVED_FROM_REGISTRY' = 'INIT';
      
      try {
        // Step A: Move track folder to archive location
        fs.renameSync(trackDirPath, archiveDirPath);
        state = 'MOVED';

        // Step B: Append entry to archive.md
        state = 'WRITING_ARCHIVE';
        fs.writeFileSync(this.archiveRegistryPath, originalArchiveContent + (originalArchiveContent.endsWith('\n') ? '' : '\n') + fullEntryLine + '\n', 'utf8');
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
      console.error(`Rollback failed to restore track directory:`, e);
    }
    
    try {
      if (['WRITING_ARCHIVE', 'APPENDED', 'WRITING_REGISTRY', 'REMOVED_FROM_REGISTRY'].includes(state)) {
        fs.writeFileSync(this.archiveRegistryPath, originalArchiveContent, 'utf8');
      }
    } catch (e) {
      console.error(`Rollback failed to restore archive.md:`, e);
    }
    
    try {
      if (['WRITING_REGISTRY', 'REMOVED_FROM_REGISTRY'].includes(state)) {
        fs.writeFileSync(this.tracksRegistryPath, originalRegistry, 'utf8');
      }
    } catch (e) {
      console.error(`Rollback failed to restore tracks.md:`, e);
    }
  }
}
