import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractFencedBlock } from './extract-fenced-block.js';

export interface CoverageEntry {
  file: string;
  line_range: string;
  concern: string;
}

export interface CoverageManifest {
  reviewer_id: string;
  examined: CoverageEntry[];
  skimmed: CoverageEntry[];
  not_examined: CoverageEntry[];
}

export interface AggregatedCoverageResult {
  residual_coverage_map: CoverageEntry[];
  coverage_stats: {
    files_examined: number;
    files_skimmed: number;
    files_not_examined: number;
    total_concerns_covered: number;
  };
}

export function aggregateCoverageManifests(
  reviewerOutputs: { reviewer_id: string; raw_text?: string }[],
  manifestsDir?: string
): AggregatedCoverageResult {
  const manifests: CoverageManifest[] = [];

  for (const item of reviewerOutputs) {
    let manifest: CoverageManifest | null = null;

    // Tier 1: Fenced Code Block Extraction
    if (item.raw_text) {
      manifest = extractFencedBlock<CoverageManifest>(item.raw_text, 'coverage-manifest');
    }

    // Tier 2: Disk Artifact Fallback
    if (!manifest && manifestsDir) {
      const artifactPath = path.join(manifestsDir, `${item.reviewer_id}.json`);
      if (fs.existsSync(artifactPath)) {
        try {
          const content = fs.readFileSync(artifactPath, 'utf-8');
          manifest = JSON.parse(content);
        } catch (e) {
          manifest = null;
        }
      }
    }

    // Tier 3: Fail-Safe Default (Guarantees residual pass)
    if (!manifest) {
      manifest = {
        reviewer_id: item.reviewer_id,
        examined: [],
        skimmed: [],
        not_examined: [
          {
            file: 'all files in diff',
            line_range: 'all',
            concern: `extraction failed or uncooperative output for ${item.reviewer_id}`
          }
        ]
      };
    }

    manifests.push(manifest);
  }

  // Deduplicate residual map (union of not_examined)
  const residualMap: CoverageEntry[] = [];
  const seenKeys = new Set<string>();

  let filesExaminedCount = 0;
  let filesSkimmedCount = 0;
  let filesNotExaminedCount = 0;
  let totalConcerns = 0;

  for (const m of manifests) {
    filesExaminedCount += m.examined.length;
    filesSkimmedCount += m.skimmed.length;
    filesNotExaminedCount += m.not_examined.length;
    totalConcerns += m.examined.length + m.skimmed.length;

    for (const entry of m.not_examined) {
      const key = `${entry.file}:${entry.line_range}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        residualMap.push(entry);
      }
    }
  }

  return {
    residual_coverage_map: residualMap,
    coverage_stats: {
      files_examined: filesExaminedCount,
      files_skimmed: filesSkimmedCount,
      files_not_examined: filesNotExaminedCount,
      total_concerns_covered: totalConcerns
    }
  };
}
