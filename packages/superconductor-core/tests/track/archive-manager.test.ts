import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ArchiveManager } from '../../src/track/archive-manager.js';
import * as os from 'node:os';

describe('ArchiveManager', () => {
  let tmpDir: string;
  let manager: ArchiveManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superconductor-test-'));
    const superconductorDir = path.join(tmpDir, 'superconductor');
    fs.mkdirSync(path.join(superconductorDir, 'tracks'), { recursive: true });
    fs.writeFileSync(path.join(superconductorDir, 'tracks.md'), '# Registry\n- [x] [track_one](tracks/track_one/index.md)\n- [ ] [track_two](tracks/track_two/index.md)\n- [~] [track_three](tracks/track_three/index.md)\n- [-] [track_four](tracks/track_four/index.md)\n', 'utf8');
    fs.writeFileSync(path.join(superconductorDir, 'archive.md'), '# Archive\n', 'utf8');
    
    // Create track dirs
    ['track_one', 'track_two', 'track_three', 'track_four'].forEach(t => {
      fs.mkdirSync(path.join(superconductorDir, 'tracks', t), { recursive: true });
      fs.writeFileSync(path.join(superconductorDir, 'tracks', t, 'spec.md'), 'test data', 'utf8');
    });

    manager = new ArchiveManager({ projectRoot: tmpDir });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should successfully archive a completed [x] track', async () => {
    await expect(manager.archiveTrack('track_one')).resolves.toBe(true);
    
    // Assert old track removed
    expect(fs.existsSync(path.join(tmpDir, 'superconductor', 'tracks', 'track_one'))).toBe(false);
    // Assert archive created
    expect(fs.existsSync(path.join(tmpDir, 'superconductor', 'tracks', 'archive', 'track_one', 'spec.md'))).toBe(true);
    
    const registry = fs.readFileSync(path.join(tmpDir, 'superconductor', 'tracks.md'), 'utf8');
    expect(registry).not.toContain('track_one');

    const archive = fs.readFileSync(path.join(tmpDir, 'superconductor', 'archive.md'), 'utf8');
    expect(archive).toContain('track_one');
  });

  it('should strictly abort if track is [ ]', async () => {
    await expect(manager.archiveTrack('track_two')).rejects.toThrow('Cannot archive track track_two: status is [ ]. Only [x] completed tracks can be archived.');
  });

  it('should strictly abort if track is [~]', async () => {
    await expect(manager.archiveTrack('track_three')).rejects.toThrow('Cannot archive track track_three: status is [~]. Only [x] completed tracks can be archived.');
  });

  it('should strictly abort if track is [-]', async () => {
    await expect(manager.archiveTrack('track_four')).rejects.toThrow('Cannot archive track track_four: status is [-]. Only [x] completed tracks can be archived.');
  });

  it('should rollback transaction if deletion fails', async () => {
    // Induce a failure by removing write permission on the parent directory of track_one
    // so that rmSync fails to remove the track_one folder.
    const trackDirPath = path.join(tmpDir, 'superconductor', 'tracks', 'track_one');
    fs.chmodSync(path.join(tmpDir, 'superconductor', 'tracks'), 0o555);

    try {
      await expect(manager.archiveTrack('track_one')).rejects.toThrow();

      // Assert rollback
      // Old track still exists
      expect(fs.existsSync(trackDirPath)).toBe(true);
      // Archive folder removed
      expect(fs.existsSync(path.join(tmpDir, 'superconductor', 'tracks', 'archive', 'track_one'))).toBe(false);

      const registry = fs.readFileSync(path.join(tmpDir, 'superconductor', 'tracks.md'), 'utf8');
      expect(registry).toContain('track_one');

      const archive = fs.readFileSync(path.join(tmpDir, 'superconductor', 'archive.md'), 'utf8');
      expect(archive).not.toContain('track_one');
    } finally {
      // Restore permissions so cleanup works
      fs.chmodSync(path.join(tmpDir, 'superconductor', 'tracks'), 0o777);
    }
  });
});
