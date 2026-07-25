import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import os from 'node:os';
import { HeadlessOrchestrator, parseHeadlessArgs } from '../../src/cli/headless.js';
import { IntelligenceSnapshotReader } from '../../src/intelligence/snapshot-reader.js';
import { DAGCycleError } from '../../src/intelligence/dag-resolver.js';

describe('parseHeadlessArgs', () => {
  it('extracts track IDs from --tracks comma-separated argument', () => {
    const res = parseHeadlessArgs(['--tracks', 'track_1,track_2']);
    expect(res.trackIds).toEqual(['track_1', 'track_2']);
  });

  it('extracts track IDs from --tracks= comma-separated argument', () => {
    const res = parseHeadlessArgs(['--tracks=track_a,track_b']);
    expect(res.trackIds).toEqual(['track_a', 'track_b']);
  });

  it('extracts track IDs from positional arguments', () => {
    const res = parseHeadlessArgs(['track_x', 'track_y']);
    expect(res.trackIds).toEqual(['track_x', 'track_y']);
  });

  it('extracts track IDs from multiple --tracks flags', () => {
    const res = parseHeadlessArgs(['--tracks', 'track_1', '--tracks', 'track_2']);
    expect(res.trackIds).toEqual(['track_1', 'track_2']);
  });

  it('handles positional comma-separated tracks and removes duplicates', () => {
    const res = parseHeadlessArgs(['track_1,track_2', 'track_2', 'track_3']);
    expect(res.trackIds).toEqual(['track_1', 'track_2', 'track_3']);
  });

  it('parses --project-root and --output-dir while ignoring general flags like --headless', () => {
    const res = parseHeadlessArgs([
      '--headless',
      '--project-root',
      '/tmp/foo',
      '--output-dir=/tmp/foo/out',
      '--tracks',
      't1,t2',
    ]);
    expect(res.trackIds).toEqual(['t1', 't2']);
    expect(res.projectRoot).toBe('/tmp/foo');
    expect(res.outputDir).toBe('/tmp/foo/out');
  });

  it('returns empty trackIds when no tracks are provided', () => {
    const res = parseHeadlessArgs(['--headless', '--json']);
    expect(res.trackIds).toEqual([]);
  });

  it('filters out known subcommands like implement and orchestrate from trackIds', () => {
    const res = parseHeadlessArgs(['implement', 't1', 'orchestrate', 't2']);
    expect(res.trackIds).toEqual(['t1', 't2']);
  });
});

describe('HeadlessOrchestrator', () => {
  let tmpDir: string;
  let superconductorDir: string;

  beforeEach(() => {
    IntelligenceSnapshotReader.clearCache();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-headless-test-'));
    superconductorDir = path.join(tmpDir, 'superconductor');
    fs.mkdirSync(superconductorDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    IntelligenceSnapshotReader.clearCache();
  });

  function setupFixture(tracksYamlContent: string) {
    const manifestPath = path.join(superconductorDir, '00_manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        lastCommitSha: 'abc1234',
        timestamp: Date.now(),
        incrementalRuns: 1,
      })
    );

    const tracksYamlPath = path.join(superconductorDir, 'tracks.yaml');
    fs.writeFileSync(tracksYamlPath, tracksYamlContent);
  }

  it('throws an error if no track IDs are specified', async () => {
    setupFixture(`
tracks:
  - id: track_1
    deps: []
`);

    await expect(
      HeadlessOrchestrator.run(['--headless'], { projectRoot: tmpDir, outputDir: superconductorDir })
    ).rejects.toThrow('No tracks specified for headless execution');
  });

  it('throws an error if a requested track is not found in the manifest', async () => {
    setupFixture(`
tracks:
  - id: track_1
    deps: []
`);

    await expect(
      HeadlessOrchestrator.run(['--tracks', 'non_existent_track'], {
        projectRoot: tmpDir,
        outputDir: superconductorDir,
      })
    ).rejects.toThrow("Track not found: non_existent_track");
  });

  it('loads manifest using IntelligenceSnapshotReader.load(), filters tracks, and applies DAGResolver.sort', async () => {
    setupFixture(`
tracks:
  - id: track_2
    deps: [track_1]
    name: "Track Two"
  - id: track_1
    deps: []
    name: "Track One"
  - id: track_3
    deps: [track_2]
    name: "Track Three"
`);

    const result = await HeadlessOrchestrator.run(['--tracks', 'track_3,track_1,track_2'], {
      projectRoot: tmpDir,
      outputDir: superconductorDir,
    });

    expect(result.mode).toBe('headless');
    expect(result.trackIds).toEqual(['track_1', 'track_2', 'track_3']);
    expect(result.executionOrder.map(t => t.trackId)).toEqual(['track_1', 'track_2', 'track_3']);
  });

  it('propagates DAGCycleError when requested tracks contain circular dependencies', async () => {
    setupFixture(`
tracks:
  - id: track_a
    deps: [track_b]
  - id: track_b
    deps: [track_a]
`);

    await expect(
      HeadlessOrchestrator.run(['track_a', 'track_b'], {
        projectRoot: tmpDir,
        outputDir: superconductorDir,
      })
    ).rejects.toThrow(DAGCycleError);
  });
});
