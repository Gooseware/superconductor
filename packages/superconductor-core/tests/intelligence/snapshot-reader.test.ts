import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IntelligenceSnapshotReader } from '../../src/intelligence/snapshot-reader';

describe('IntelligenceSnapshotReader', () => {
  const tempDir = path.join(__dirname, 'temp_output_dir');

  beforeEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
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
    expect(result?.driftBanner).toContain('abcdef1');
  });

  it('loads STALE state correctly (commitsBehind > 10)', () => {
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
