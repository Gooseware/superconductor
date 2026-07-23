import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { aggregateCoverageManifests } from '../src/review/aggregate-coverage.js';

describe('aggregateCoverageManifests', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-cov-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should handle string array entries in not_examined and normalize them', () => {
    const rawText = `
\`\`\`coverage-manifest
{
  "reviewer_id": "rev1",
  "examined": [{ "file": "src/a.ts", "line_range": "1-100", "concern": "logic" }],
  "skimmed": [],
  "not_examined": ["src/b.ts", "src/c.ts"]
}
\`\`\`
`;

    const result = aggregateCoverageManifests([{ reviewer_id: 'rev1', raw_text: rawText }]);

    expect(result.coverage_stats.files_examined).toBe(1);
    expect(result.coverage_stats.files_not_examined).toBe(2);
    expect(result.residual_coverage_map).toEqual([
      { file: 'src/b.ts', line_range: 'all' },
      { file: 'src/c.ts', line_range: 'all' }
    ]);
  });

  it('should deduplicate string and object entries in not_examined across reviewers', () => {
    const rawText1 = `
\`\`\`coverage-manifest
{
  "reviewer_id": "rev1",
  "examined": [],
  "skimmed": [],
  "not_examined": ["src/shared.ts", "src/unique1.ts"]
}
\`\`\`
`;

    const rawText2 = `
\`\`\`coverage-manifest
{
  "reviewer_id": "rev2",
  "examined": [],
  "skimmed": [],
  "not_examined": ["src/shared.ts", { "file": "src/unique2.ts", "line_range": "all", "concern": "perf" }]
}
\`\`\`
`;

    const result = aggregateCoverageManifests([
      { reviewer_id: 'rev1', raw_text: rawText1 },
      { reviewer_id: 'rev2', raw_text: rawText2 }
    ]);

    expect(result.residual_coverage_map).toHaveLength(3);
    const files = result.residual_coverage_map.map((e) => e.file);
    expect(files).toEqual(['src/shared.ts', 'src/unique1.ts', 'src/unique2.ts']);
  });

  it('should fall back to disk artifact and default fail-safe when extraction fails', () => {
    const artifactPath = path.join(tmpDir, 'rev-disk.json');
    fs.writeFileSync(
      artifactPath,
      JSON.stringify({
        reviewer_id: 'rev-disk',
        examined: [],
        skimmed: [],
        not_examined: ['src/disk.ts']
      }),
      'utf-8'
    );

    const result = aggregateCoverageManifests(
      [
        { reviewer_id: 'rev-disk', raw_text: 'Invalid' },
        { reviewer_id: 'rev-fail', raw_text: 'Invalid' }
      ],
      tmpDir
    );

    expect(result.coverage_stats.files_not_examined).toBe(2);
    expect(result.residual_coverage_map).toEqual([
      { file: 'src/disk.ts', line_range: 'all' },
      {
        file: 'all files in diff',
        line_range: 'all',
        concern: 'extraction failed or uncooperative output for rev-fail'
      }
    ]);
  });
});
