import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readTrackRegistry } from '../../src/track/track-reader.js';

describe('readTrackRegistry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-track-reader-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns empty array if superconductor/tracks.md does not exist', () => {
    expect(readTrackRegistry(tmpDir)).toEqual([]);
  });

  it('flattens tracks across multiple phases in order', () => {
    const scDir = path.join(tmpDir, 'superconductor');
    fs.mkdirSync(scDir, { recursive: true });

    const markdown = `# Tracks Registry

## Phase 1: Foundation (Completed)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[x]\` | \`track_1\` | Track 1 | \`main\` |
| \`[x]\` | \`track_2\` | Track 2 | \`main\` |

## Phase 2: Features (Active)

| Status | Track ID | Title | Branch | Note |
|--------|----------|-------|--------|------|
| \`[~]\` | \`track_3\` | [Track 3](./custom/link/) | \`feat/3\` | Important note |
| \`[ ]\` | \`track_4\` | Track 4 | \`feat/4\` | - |
`;

    fs.writeFileSync(path.join(scDir, 'tracks.md'), markdown, 'utf-8');

    const tracks = readTrackRegistry(tmpDir);
    expect(tracks).toHaveLength(4);

    expect(tracks[0]).toEqual({
      trackId: 'track_1',
      name: 'Track 1',
      status: 'completed',
      link: './tracks/track_1/',
      note: undefined,
    });

    expect(tracks[1]).toEqual({
      trackId: 'track_2',
      name: 'Track 2',
      status: 'completed',
      link: './tracks/track_2/',
      note: undefined,
    });

    expect(tracks[2]).toEqual({
      trackId: 'track_3',
      name: 'Track 3',
      status: 'in_progress',
      link: './custom/link/',
      note: 'Important note',
    });

    expect(tracks[3]).toEqual({
      trackId: 'track_4',
      name: 'Track 4',
      status: 'planned',
      link: './tracks/track_4/',
      note: undefined,
    });
  });

  it('reads tracks from unsectioned legacy Active Tracks table', () => {
    const scDir = path.join(tmpDir, 'superconductor');
    fs.mkdirSync(scDir, { recursive: true });

    const markdown = `# Tracks Registry

## Active Tracks

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[x]\` | \`legacy_track\` | Legacy Track | \`main\` |
`;

    fs.writeFileSync(path.join(scDir, 'tracks.md'), markdown, 'utf-8');

    const tracks = readTrackRegistry(tmpDir);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].trackId).toBe('legacy_track');
    expect(tracks[0].name).toBe('Legacy Track');
    expect(tracks[0].status).toBe('completed');
  });
});
