import * as path from 'node:path';
import {
  aggregateFindings,
  type ReviewFinding
} from '../packages/superconductor-core/dist/review/aggregate-findings.js';

export {
  aggregateFindings,
  type ReviewFinding
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifestsDir = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  const result = aggregateFindings([], manifestsDir);
  console.log(JSON.stringify(result, null, 2));
}

