import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ArchiveManager } from '../../src/track/archive-manager.js';

describe('Canonical ArchiveManager & Migration', () => {
  let tmpDir: string;
  let manager: ArchiveManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-archive-test-'));
    const scDir = path.join(tmpDir, 'superconductor');
    fs.mkdirSync(path.join(scDir, 'tracks'), { recursive: true });
    fs.writeFileSync(
      path.join(scDir, 'tracks.md'),
      '# Registry\n- [x] [track_one](tracks/track_one/index.md)\n- [ ] [track_two](tracks/track_two/index.md)\n- [~] [track_three](tracks/track_three/index.md)\n- [-] [track_four](tracks/track_four/index.md)\n',
      'utf8'
    );
    fs.writeFileSync(path.join(scDir, 'archive.md'), '# Archived Tracks Registry\n\n## Index\n\n', 'utf8');

    // Create track folders
    ['track_one', 'track_two', 'track_three', 'track_four'].forEach(t => {
      fs.mkdirSync(path.join(scDir, 'tracks', t), { recursive: true });
      fs.writeFileSync(path.join(scDir, 'tracks', t, 'spec.md'), `spec for ${t}`, 'utf8');
      fs.writeFileSync(path.join(scDir, 'tracks', t, 'plan.md'), `plan for ${t}`, 'utf8');
    });

    manager = new ArchiveManager({ projectRoot: tmpDir });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('archives completed [x] track to canonical superconductor/tracks/archive/<track_id>', async () => {
    const success = await manager.archiveTrack('track_one');
    expect(success).toBe(true);

    const oldPath = path.join(tmpDir, 'superconductor', 'tracks', 'track_one');
    const canonicalPath = path.join(tmpDir, 'superconductor', 'tracks', 'archive', 'track_one');

    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(canonicalPath)).toBe(true);
    expect(fs.existsSync(path.join(canonicalPath, 'spec.md'))).toBe(true);

    const tracksMd = fs.readFileSync(path.join(tmpDir, 'superconductor', 'tracks.md'), 'utf8');
    expect(tracksMd).not.toContain('track_one');

    const archiveMd = fs.readFileSync(path.join(tmpDir, 'superconductor', 'archive.md'), 'utf8');
    expect(archiveMd).toContain('track_one');

    expect(manager.isArchived('track_one')).toBe(true);
    expect(manager.getArchivePath('track_one')).toBe(canonicalPath);
  });

  it('detects archived tracks in both canonical and legacy paths (fallback support)', async () => {
    const legacyDir = path.join(tmpDir, 'superconductor', 'archive', 'legacy_track');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'spec.md'), 'legacy spec', 'utf8');

    expect(manager.isArchived('legacy_track')).toBe(true);
    expect(manager.getArchivePath('legacy_track')).toBe(legacyDir);
  });

  it('migrates legacy archives to superconductor/tracks/archive and updates archive.md links', async () => {
    const legacyDir1 = path.join(tmpDir, 'superconductor', 'archive', 'legacy_alpha');
    const legacyDir2 = path.join(tmpDir, 'superconductor', 'archive', 'legacy_beta');
    fs.mkdirSync(legacyDir1, { recursive: true });
    fs.mkdirSync(legacyDir2, { recursive: true });
    fs.writeFileSync(path.join(legacyDir1, 'spec.md'), 'alpha spec', 'utf8');
    fs.writeFileSync(path.join(legacyDir2, 'spec.md'), 'beta spec', 'utf8');

    // Populate archive.md with legacy links
    const scDir = path.join(tmpDir, 'superconductor');
    fs.writeFileSync(
      path.join(scDir, 'archive.md'),
      '# Archived Tracks Registry\n\n## Index\n\n- [x] [legacy_alpha](archive/legacy_alpha/spec.md)\n- [x] **legacy_beta**\n*Link: [./archive/legacy_beta/](./archive/legacy_beta/)*\n',
      'utf8'
    );

    const result = await manager.migrateLegacyArchives();
    expect(result.migrated).toContain('legacy_alpha');
    expect(result.migrated).toContain('legacy_beta');
    expect(result.errors.length).toBe(0);

    // Verify files moved to canonical
    expect(fs.existsSync(path.join(scDir, 'tracks', 'archive', 'legacy_alpha', 'spec.md'))).toBe(true);
    expect(fs.existsSync(path.join(scDir, 'tracks', 'archive', 'legacy_beta', 'spec.md'))).toBe(true);
    expect(fs.existsSync(legacyDir1)).toBe(false);
    expect(fs.existsSync(legacyDir2)).toBe(false);

    // Verify archive.md links updated
    const updatedArchiveMd = fs.readFileSync(path.join(scDir, 'archive.md'), 'utf8');
    expect(updatedArchiveMd).toContain('tracks/archive/legacy_alpha/spec.md');
    expect(updatedArchiveMd).toContain('./tracks/archive/legacy_beta/');
  });

  it('aborts archival on non-completed tracks ([ ], [~], [-])', async () => {
    await expect(manager.archiveTrack('track_two')).rejects.toThrow(/Only \[x\] completed tracks can be archived/);
    await expect(manager.archiveTrack('track_three')).rejects.toThrow(/Only \[x\] completed tracks can be archived/);
    await expect(manager.archiveTrack('track_four')).rejects.toThrow(/Only \[x\] completed tracks can be archived/);
  });

  it('safely rolls back transaction on write error during archive', async () => {
    const trackDirPath = path.join(tmpDir, 'superconductor', 'tracks', 'track_one');
    // Lock parent dir write permissions to cause move failure or test rollback
    fs.chmodSync(path.join(tmpDir, 'superconductor', 'tracks'), 0o555);

    try {
      await expect(manager.archiveTrack('track_one')).rejects.toThrow();

      // Original track should still exist
      expect(fs.existsSync(trackDirPath)).toBe(true);
      // Canonical archive should not exist
      expect(fs.existsSync(path.join(tmpDir, 'superconductor', 'tracks', 'archive', 'track_one'))).toBe(false);

      const registry = fs.readFileSync(path.join(tmpDir, 'superconductor', 'tracks.md'), 'utf8');
      expect(registry).toContain('track_one');
    } finally {
      fs.chmodSync(path.join(tmpDir, 'superconductor', 'tracks'), 0o777);
    }
  });
});
