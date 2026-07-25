import * as fs from 'node:fs';
import * as path from 'node:path';

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
    this.archiveDir = path.join(this.projectRoot, 'superconductor', 'tracks', 'archive');
  }

  public async archiveTrack(trackId: string): Promise<boolean> {
    const trackDirPath = path.join(this.tracksDir, trackId);
    const archiveDirPath = path.join(this.archiveDir, trackId);

    // 1. Filtering Constraint: Strictly abort if track is not completed
    if (!fs.existsSync(this.tracksRegistryPath)) {
      throw new Error(`Registry not found at ${this.tracksRegistryPath}`);
    }

    const registryContent = fs.readFileSync(this.tracksRegistryPath, 'utf8');
    const trackEntryRegex = new RegExp(`^\\s*-\\s*\\[([x \\-~])\\]\\s*(.*${trackId}.*)$`, 'm');
    const match = registryContent.match(trackEntryRegex);

    if (!match) {
      throw new Error(`Track ${trackId} not found in tracks.md`);
    }

    const status = match[1];
    const fullEntryLine = match[0];
    
    if (status !== 'x') {
      throw new Error(`Cannot archive track ${trackId}: status is [${status}]. Only [x] completed tracks can be archived.`);
    }

    if (!fs.existsSync(trackDirPath)) {
      throw new Error(`Track directory not found at ${trackDirPath}`);
    }

    // Prepare archive registry
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }

    if (!fs.existsSync(this.archiveRegistryPath)) {
      fs.writeFileSync(this.archiveRegistryPath, '# Archived Tracks Registry\n\n## Index\n\n', 'utf8');
    }

    // Transactional Implementation
    let state: 'INIT' | 'COPIED' | 'APPENDED' | 'REMOVED_FROM_REGISTRY' | 'DELETED' = 'INIT';
    
    try {
      // Step A: Copy track folder to archive location
      this.copyRecursiveSync(trackDirPath, archiveDirPath);
      state = 'COPIED';

      // Step B: Append entry to archive.md
      const archiveContent = fs.readFileSync(this.archiveRegistryPath, 'utf8');
      fs.writeFileSync(this.archiveRegistryPath, archiveContent + fullEntryLine + '\n', 'utf8');
      state = 'APPENDED';

      // Step C: Remove entry from tracks.md
      const updatedRegistry = registryContent.replace(fullEntryLine, '');
      fs.writeFileSync(this.tracksRegistryPath, updatedRegistry, 'utf8');
      state = 'REMOVED_FROM_REGISTRY';

      // Step D: Delete old track folder
      fs.rmSync(trackDirPath, { recursive: true, force: true });
      state = 'DELETED';

      return true;
    } catch (error) {
      // Rollback Mechanism
      this.rollback(trackId, state, fullEntryLine, registryContent);
      throw error;
    }
  }

  private rollback(trackId: string, state: string, entryLine: string, originalRegistry: string) {
    console.warn(`[ArchiveManager] Rollback initiated for ${trackId} from state: ${state}`);
    const archiveDirPath = path.join(this.archiveDir, trackId);
    
    if (state === 'DELETED') {
      // Nothing to rollback, process finished. Should not happen if error occurred
      return;
    }

    if (state === 'REMOVED_FROM_REGISTRY') {
      fs.writeFileSync(this.tracksRegistryPath, originalRegistry, 'utf8');
    }

    if (state === 'APPENDED' || state === 'REMOVED_FROM_REGISTRY') {
      if (fs.existsSync(this.archiveRegistryPath)) {
        const archiveContent = fs.readFileSync(this.archiveRegistryPath, 'utf8');
        const rolledBack = archiveContent.replace(entryLine + '\n', '');
        fs.writeFileSync(this.archiveRegistryPath, rolledBack, 'utf8');
      }
    }

    if (state === 'COPIED' || state === 'APPENDED' || state === 'REMOVED_FROM_REGISTRY') {
      if (fs.existsSync(archiveDirPath)) {
        fs.rmSync(archiveDirPath, { recursive: true, force: true });
      }
    }
  }

  private copyRecursiveSync(src: string, dest: string) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats && stats.isDirectory();
    if (isDirectory) {
      fs.mkdirSync(dest, { recursive: true });
      fs.readdirSync(src).forEach((childItemName) => {
        this.copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}
