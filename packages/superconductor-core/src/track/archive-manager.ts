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
    this.archiveDir = path.join(this.projectRoot, 'superconductor', 'archive');
  }

  public async archiveTrack(trackId: string): Promise<boolean> {
    if (!/^[a-zA-Z0-9_-]+$/.test(trackId) || trackId.toLowerCase() === 'archive') {
      throw new Error(`Invalid track ID: ${trackId}`);
    }

    const trackDirPath = path.join(this.tracksDir, trackId);
    const archiveDirPath = path.join(this.archiveDir, trackId);

    // 1. Filtering Constraint: Strictly abort if track is not completed
    if (!fs.existsSync(this.tracksRegistryPath)) {
      throw new Error(`Registry not found at ${this.tracksRegistryPath}`);
    }

    const registryContent = fs.readFileSync(this.tracksRegistryPath, 'utf8');
    
    // Split the registry into blocks that start with a track heading
    const blockRegex = /^(?:\s*-\s*|##\s*)\[[xX \-~]\].*$/m;
    const blocks = registryContent.split(new RegExp(`(?=^(?:\\s*-\\s*|##\\s*)\\[[xX \\-~]\\])`, 'm'));
    
    let targetBlock = '';
    let status = '';
    for (const block of blocks) {
      const firstLine = block.split('\n')[0] || '';
      if (firstLine.includes(trackId) && new RegExp(`\\b${trackId}\\b`).test(firstLine) && blockRegex.test(block)) {
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

    if (!fs.existsSync(trackDirPath)) {
      throw new Error(`Track directory not found at ${trackDirPath}`);
    }

    // Prepare archive registry
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }

    let originalArchiveContent = '# Archived Tracks Registry\n\n## Index\n\n';
    if (!fs.existsSync(this.archiveRegistryPath)) {
      fs.writeFileSync(this.archiveRegistryPath, originalArchiveContent, 'utf8');
    } else {
      originalArchiveContent = fs.readFileSync(this.archiveRegistryPath, 'utf8');
    }

    // Transactional Implementation
    let state: 'INIT' | 'MOVED' | 'APPENDED' | 'REMOVED_FROM_REGISTRY' = 'INIT';
    
    try {
      // Step A: Move track folder to archive location
      fs.renameSync(trackDirPath, archiveDirPath);
      state = 'MOVED';

      // Step B: Append entry to archive.md
      fs.writeFileSync(this.archiveRegistryPath, originalArchiveContent + (originalArchiveContent.endsWith('\n') ? '' : '\n') + fullEntryLine + '\n', 'utf8');
      state = 'APPENDED';

      // Step C: Remove entry from tracks.md
      const updatedRegistry = registryContent.replace(fullEntryLine, '');
      fs.writeFileSync(this.tracksRegistryPath, updatedRegistry, 'utf8');
      state = 'REMOVED_FROM_REGISTRY';

      return true;
    } catch (error) {
      // Rollback Mechanism
      this.rollback(trackId, state, archiveDirPath, trackDirPath, registryContent, originalArchiveContent);
      throw error;
    }
  }

  private rollback(
    trackId: string, 
    state: string, 
    archiveDirPath: string, 
    trackDirPath: string, 
    originalRegistry: string,
    originalArchiveContent: string
  ) {
    console.warn(`[ArchiveManager] Rollback initiated for ${trackId} from state: ${state}`);
    
    if (state === 'REMOVED_FROM_REGISTRY') {
      try {
        fs.writeFileSync(this.tracksRegistryPath, originalRegistry, 'utf8');
      } catch (e) {
        console.error(`Rollback failed to restore tracks.md:`, e);
      }
    }

    if (state === 'APPENDED' || state === 'REMOVED_FROM_REGISTRY') {
      try {
        fs.writeFileSync(this.archiveRegistryPath, originalArchiveContent, 'utf8');
      } catch (e) {
        console.error(`Rollback failed to restore archive.md:`, e);
      }
    }

    if (state === 'MOVED' || state === 'APPENDED' || state === 'REMOVED_FROM_REGISTRY') {
      try {
        if (fs.existsSync(archiveDirPath)) {
          fs.renameSync(archiveDirPath, trackDirPath);
        }
      } catch (e) {
        console.error(`Rollback failed to restore track directory:`, e);
      }
    }
  }
}
