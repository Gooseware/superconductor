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
    it('reuses cached maps but updates drift metrics on subsequent calls with the same manifest', () => {
      fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
        timestamp: new Date().toISOString(),
        last_commit: 'abcdef1234567890'
      }));
      fs.writeFileSync(path.join(tempDir, '03_complexity.json'), JSON.stringify([
        { file: 'a.ts', hotspot_score: 25, cyclomatic_complexity: 10 }
      ]));

      // 1. Initial load, let's say 0 commits behind
      vi.mocked(childProcess.spawnSync).mockReturnValue(makeSpawnResult('0\n'));
      const result1 = IntelligenceSnapshotReader.load(tempDir);
      
      // Delete the complexity file to prove it's using the cache for the heavy maps
      fs.rmSync(path.join(tempDir, '03_complexity.json'));

      // 2. Second load, simulate that time passed and git now reports 15 commits behind
      vi.mocked(childProcess.spawnSync).mockReturnValue(makeSpawnResult('15\n'));
      const result2 = IntelligenceSnapshotReader.load(tempDir);
      
      // Should NOT be strictly the same object...
      expect(result2).not.toBe(result1); 
      // ...but the heavy parsed maps should be identical references
      expect(result2?.hotspotMap).toBe(result1?.hotspotMap);
      expect(result2?.testGapMap).toBe(result1?.testGapMap);
      
      // And the new drift state should be reflected
      expect(result2?.commitsBehind).toBe(15);
      expect(result2?.driftState).toBe('STALE');
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

  describe('tracks.yaml parsing & Zod schema validation', () => {
    it('parses superconductor/tracks.yaml securely and attaches validated tracks to RepoContext', () => {
      fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
        timestamp: new Date().toISOString()
      }));

      const scDir = path.join(tempDir, 'superconductor');
      fs.mkdirSync(scDir, { recursive: true });

      const yamlContent = `
version: 1
tracks:
  - id: core_harness
    name: Core Harness Abstraction
    status: completed
    deps: []
  - id: implement_redesign
    name: Implement Redesign
    status: in_progress
    deps:
      - core_harness
`;
      fs.writeFileSync(path.join(scDir, 'tracks.yaml'), yamlContent);

      const result = IntelligenceSnapshotReader.load(tempDir, tempDir);
      expect(result).not.toBeNull();
      expect(result?.tracks).toBeDefined();
      expect(result?.tracks?.length).toBe(2);
      expect(result?.tracks?.[0]).toEqual(expect.objectContaining({
        trackId: 'core_harness',
        name: 'Core Harness Abstraction',
        status: 'completed',
        deps: []
      }));
      expect(result?.tracks?.[1]).toEqual(expect.objectContaining({
        trackId: 'implement_redesign',
        name: 'Implement Redesign',
        status: 'in_progress',
        deps: ['core_harness']
      }));
    });

    it('rejects code execution / custom tags when parsing YAML securely', () => {
      fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
        timestamp: new Date().toISOString()
      }));
      const scDir = path.join(tempDir, 'superconductor');
      fs.mkdirSync(scDir, { recursive: true });

      const maliciousYaml = `
version: 1
tracks: !!js/function "function() { return 'hacked'; }"
`;
      fs.writeFileSync(path.join(scDir, 'tracks.yaml'), maliciousYaml);

      const result = IntelligenceSnapshotReader.load(tempDir, tempDir);
      expect(result).not.toBeNull();
      expect(result?.tracks).toEqual([]);
    });

    it('validates Dense YAML structure against track-manifest Zod schema', () => {
      fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
        timestamp: new Date().toISOString()
      }));
      const scDir = path.join(tempDir, 'superconductor');
      fs.mkdirSync(scDir, { recursive: true });

      const invalidSchemaYaml = `
version: 1
tracks: 12345
`;
      fs.writeFileSync(path.join(scDir, 'tracks.yaml'), invalidSchemaYaml);

      const result = IntelligenceSnapshotReader.load(tempDir, tempDir);
      expect(result).not.toBeNull();
      expect(result?.tracks).toEqual([]);
    });

    it('handles YAML null values for optional/default fields gracefully (ADV-1)', () => {
      fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
        timestamp: new Date().toISOString()
      }));
      const scDir = path.join(tempDir, 'superconductor');
      fs.mkdirSync(scDir, { recursive: true });

      const yamlWithNulls = `
version: 1
tracks:
  - id: track_null_test
    status:
    deps:
    spec:
    plan:
    link:
`;
      fs.writeFileSync(path.join(scDir, 'tracks.yaml'), yamlWithNulls);

      const result = IntelligenceSnapshotReader.load(tempDir, tempDir);
      expect(result).not.toBeNull();
      expect(result?.tracks).toBeDefined();
      expect(result?.tracks?.length).toBe(1);
      expect(result?.tracks?.[0]).toEqual(expect.objectContaining({
        trackId: 'track_null_test',
        status: 'planned',
        deps: []
      }));
    });

    it('invalidates cached RepoContext when tracks.yaml is modified (ADV-3)', () => {
      const now = Date.now();
      fs.writeFileSync(path.join(tempDir, '00_manifest.json'), JSON.stringify({
        timestamp: now,
        last_commit: 'abcdef1234567890'
      }));
      const scDir = path.join(tempDir, 'superconductor');
      fs.mkdirSync(scDir, { recursive: true });

      const initialYaml = `
version: 1
tracks:
  - id: t1
    status: planned
`;
      const yamlPath = path.join(scDir, 'tracks.yaml');
      fs.writeFileSync(yamlPath, initialYaml);

      // Load initial state
      const result1 = IntelligenceSnapshotReader.load(tempDir, tempDir);
      expect(result1?.tracks?.[0].trackId).toBe('t1');
      expect(result1?.tracks?.[0].status).toBe('planned');

      // Update tracks.yaml with new status and update mtime
      const updatedYaml = `
version: 1
tracks:
  - id: t1
    status: completed
`;
      fs.writeFileSync(yamlPath, updatedYaml);
      const newMtime = new Date(now + 5000);
      fs.utimesSync(yamlPath, newMtime, newMtime);

      // Second load should detect changed mtime and return updated tracks
      const result2 = IntelligenceSnapshotReader.load(tempDir, tempDir);
      expect(result2?.tracks?.[0].status).toBe('completed');
    });
  });

});

