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
    IntelligenceSnapshotReader.clearCache();
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

  it('populates fanOutMap from 02_dependency_graph.json', () => {
    fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
      timestamp: new Date().toISOString()
    }));
    fs.writeFileSync(path.join(tempDir, '02_dependency_graph.json'), JSON.stringify({
      nodes: ['a.ts', 'b.ts', 'c.ts'],
      edges: [
        { from: 'a.ts', to: 'b.ts' },
        { from: 'a.ts', to: 'c.ts' },
        { from: 'b.ts', to: 'c.ts' }
      ]
    }));

    const result = IntelligenceSnapshotReader.load(tempDir);
    expect(result?.fanOutMap?.get('a.ts')).toBe(2);
    expect(result?.fanOutMap?.get('b.ts')).toBe(1);
  });

  it('populates couplingMap from 04_coupling.json', () => {
    fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
      timestamp: new Date().toISOString()
    }));
    fs.writeFileSync(path.join(tempDir, '04_coupling.json'), JSON.stringify([
      { file: 'a.ts', dependents: ['b.ts', 'c.ts'] }
    ]));

    const result = IntelligenceSnapshotReader.load(tempDir);
    expect(result?.couplingMap?.get('a.ts')).toEqual(['b.ts', 'c.ts']);
  });

  describe('Shared Caching', () => {
    it('caches the RepoContext on subsequent calls with the same manifest', () => {
      fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
        timestamp: new Date().toISOString(),
        last_commit: 'abcdef1234567890'
      }));
      fs.writeFileSync(path.join(tempDir, '03_complexity.json'), JSON.stringify([
        { file: 'a.ts', hotspot_score: 25, cyclomatic_complexity: 10 }
      ]));

      const result1 = IntelligenceSnapshotReader.load(tempDir);
      
      // Delete the complexity file to prove it's using the cache
      fs.rmSync(path.join(tempDir, '03_complexity.json'));

      const result2 = IntelligenceSnapshotReader.load(tempDir);
      expect(result2).toBe(result1); // Reference equality
      expect(result2?.hotspotMap.get('a.ts')).toBeDefined();
    });

    it('invalidates the cache when manifest timestamp or last_commit changes', () => {
      fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
        timestamp: 1000,
        last_commit: 'abcdef'
      }));
      fs.writeFileSync(path.join(tempDir, '03_complexity.json'), JSON.stringify([
        { file: 'a.ts', hotspot_score: 25, cyclomatic_complexity: 10 }
      ]));

      const result1 = IntelligenceSnapshotReader.load(tempDir);

      // Change manifest
      fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
        timestamp: 2000,
        last_commit: 'abcdef'
      }));
      fs.writeFileSync(path.join(tempDir, '03_complexity.json'), JSON.stringify([
        { file: 'b.ts', hotspot_score: 15, cyclomatic_complexity: 5 }
      ]));

      const result2 = IntelligenceSnapshotReader.load(tempDir);
      expect(result2).not.toBe(result1);
      expect(result2?.hotspotMap.get('b.ts')).toBeDefined();
      expect(result2?.hotspotMap.get('a.ts')).toBeUndefined();
    });

    it('clears cache explicitly', () => {
      fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
        timestamp: 1000,
        last_commit: 'abcdef'
      }));
      const result1 = IntelligenceSnapshotReader.load(tempDir);

      IntelligenceSnapshotReader.clearCache();

      const result2 = IntelligenceSnapshotReader.load(tempDir);
      expect(result2).not.toBe(result1);
    });
  });
});
