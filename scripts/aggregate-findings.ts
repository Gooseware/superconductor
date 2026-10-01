import * as path from 'node:path';
import {
  ReviewFindingsPipeline,
  aggregateFindings,
  type ReviewFinding
} from '../packages/superconductor-core/src/review/index.js';

export {
  ReviewFindingsPipeline,
  aggregateFindings,
  type ReviewFinding
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifestsDir = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  const result = ReviewFindingsPipeline.aggregate([], manifestsDir);
  console.log(JSON.stringify(result, null, 2));
}

