import * as path from 'node:path';
import {
  aggregateCoverageManifests,
  type CoverageEntry,
  type CoverageManifest,
  type AggregatedCoverageResult
} from '../packages/superconductor-core/dist/review/aggregate-coverage.js';

export {
  aggregateCoverageManifests,
  type CoverageEntry,
  type CoverageManifest,
  type AggregatedCoverageResult
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifestsDir = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  const result = aggregateCoverageManifests([], manifestsDir);
  console.log(JSON.stringify(result, null, 2));
}

