import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractFencedBlock } from './extract-fenced-block.js';

export interface CoverageEntry {
  file: string;
  line_range: string;
  concern?: string;
}

export interface CoverageManifest {
  reviewer_id: string;
  examined: CoverageEntry[];
  skimmed: CoverageEntry[];
  not_examined: (CoverageEntry | string)[];
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

/** 3-tier fallback: fenced block → disk JSON → fail-safe default. */
export function resolveCoverageManifest(
  item: { reviewer_id: string; raw_text?: string },
  manifestsDir?: string
): CoverageManifest {
  // Tier 1: Fenced Code Block Extraction
  if (item.raw_text) {
    const manifest = extractFencedBlock<CoverageManifest>(item.raw_text, 'coverage-manifest');
    if (manifest) return manifest;
  }

  // Tier 2: Disk Artifact Fallback
  if (manifestsDir) {
    const artifactPath = path.join(manifestsDir, `${item.reviewer_id}.json`);
    if (fs.existsSync(artifactPath)) {
      try {
        const content = fs.readFileSync(artifactPath, 'utf-8');
        const manifest = JSON.parse(content) as CoverageManifest;
        if (manifest) return manifest;
      } catch (e) {
        // fall through to fail-safe
      }
    }
  }

  // Tier 3: Fail-Safe Default (Guarantees residual pass)
  return {
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

/** Normalizes a single not_examined entry (string or object) into a CoverageEntry. */
export function normalizeCoverageEntry(entry: CoverageEntry | string): CoverageEntry {
  if (typeof entry === 'string') {
    return { file: entry, line_range: 'all' };
  }
  if (typeof entry === 'object' && entry !== null && typeof (entry as any).file === 'string') {
    return entry;
  }
  return { file: String(entry), line_range: 'all' };
}

/** Deduplicates the residual map and accumulates stats across all manifests. */
export function aggregateManifestStats(manifests: CoverageManifest[]): {
  residualMap: CoverageEntry[];
  examined: number;
  skimmed: number;
  notExamined: number;
  totalConcerns: number;
} {
  const residualMap: CoverageEntry[] = [];
  const seenKeys = new Set<string>();

  let examined = 0;
  let skimmed = 0;
  let notExamined = 0;
  let totalConcerns = 0;

  for (const m of manifests) {
    examined += (m.examined || []).length;
    skimmed += (m.skimmed || []).length;
    notExamined += (m.not_examined || []).length;
    totalConcerns += (m.examined || []).length + (m.skimmed || []).length;

    for (const entry of m.not_examined || []) {
      const normEntry = normalizeCoverageEntry(entry);
      const key = `${normEntry.file}:${normEntry.line_range}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        residualMap.push(normEntry);
      }
    }
  }

  return { residualMap, examined, skimmed, notExamined, totalConcerns };
}

export function aggregateCoverageManifests(
  reviewerOutputs: { reviewer_id: string; raw_text?: string }[],
  manifestsDir?: string
): AggregatedCoverageResult {
  const manifests = reviewerOutputs.map((item) => resolveCoverageManifest(item, manifestsDir));
  const stats = aggregateManifestStats(manifests);

  return {
    residual_coverage_map: stats.residualMap,
    coverage_stats: {
      files_examined: stats.examined,
      files_skimmed: stats.skimmed,
      files_not_examined: stats.notExamined,
      total_concerns_covered: stats.totalConcerns
    }
  };
}
