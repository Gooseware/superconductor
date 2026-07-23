import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'child_process';
import { IntelligenceSnapshotReader } from '../../src/intelligence/snapshot-reader';

// Mock child_process so spawnSync (used by IntelligenceDriftMonitor) never
// shells out to real git during unit tests.
vi.mock('child_process');

function makeSpawnResult(stdout: string, status = 0) {
  return {
    pid: 0, output: [], stdout, stderr: '', status, signal: null, error: undefined,
  } as any;
}

describe('IntelligenceSnapshotReader', () => {
  const tempDir = path.join(__dirname, 'temp_output_dir');

  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Default: git reports 0 commits behind
    vi.mocked(childProcess.spawnSync).mockReturnValue(makeSpawnResult('0\n'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('returns null for NONE state (no manifest)', () => {
    const result = IntelligenceSnapshotReader.load(tempDir);
    expect(result).toBeNull();
  });

  it('loads LIVE state correctly', () => {
    // spawnSync will return 0 commits behind (from beforeEach default)
    fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
      timestamp: new Date().toISOString(),
      last_commit: 'abcdef1234567890',
      incremental_runs: 5,
      commitsBehind: 2
    }));

    const result = IntelligenceSnapshotReader.load(tempDir);
    expect(result).not.toBeNull();
    expect(result?.driftState).toBe('LIVE');
    expect(result?.driftBanner).toContain('\u2139\ufe0f  Intelligence: LIVE');
  });

  it('loads STALE state correctly (commitsBehind > 10 from git)', () => {
    // Make git report 15 commits behind
    vi.mocked(childProcess.spawnSync).mockReturnValue(makeSpawnResult('15\n'));

    fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
      timestamp: new Date().toISOString(),
      last_commit: 'abcdef1234567890',
      incremental_runs: 5,
      commitsBehind: 15
    }));

    const result = IntelligenceSnapshotReader.load(tempDir);
    expect(result).not.toBeNull();
    expect(result?.driftState).toBe('STALE');
    expect(result?.driftBanner).toContain('\u26a0\ufe0f  Intelligence: STALE');
    expect(result?.driftBanner).toContain('15 commits behind');
  });

  it('populates hotspotMap from 03_complexity.json', () => {
    fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
      timestamp: new Date().toISOString()
    }));
    fs.writeFileSync(path.join(tempDir, '03_complexity.json'), JSON.stringify([
      { file: 'a.ts', hotspot_score: 25, cyclomatic_complexity: 10 }
    ]));

    const result = IntelligenceSnapshotReader.load(tempDir);
    expect(result?.hotspotMap.get('a.ts')).toEqual({ hotspot_score: 25, cyclomatic_complexity: 10 });
  });

  it('populates sastFindings from 05_sast.json', () => {
    fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
      timestamp: new Date().toISOString()
    }));
    fs.writeFileSync(path.join(tempDir, '05_sast.json'), JSON.stringify([
      { file: 'b.ts', findings: [{ rule_id: 'R1', severity: 'HIGH', message: 'test' }] }
    ]));

    const result = IntelligenceSnapshotReader.load(tempDir);
    expect(result?.sastFindings.get('b.ts')).toEqual([{ rule_id: 'R1', severity: 'HIGH', message: 'test' }]);
  });

  it('populates testGapMap from 07_test_gaps.json', () => {
    fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
      timestamp: new Date().toISOString()
    }));
    fs.writeFileSync(path.join(tempDir, '07_test_gaps.json'), JSON.stringify([
      { file: 'c.ts', risk: 'HIGH', gitChurnScore: 50 }
    ]));

    const result = IntelligenceSnapshotReader.load(tempDir);
    expect(result?.testGapMap.get('c.ts')).toEqual({ risk: 'HIGH', gitChurnScore: 50 });
  });
});
