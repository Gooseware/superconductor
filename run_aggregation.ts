import { aggregateFindings } from './scripts/aggregate-findings.ts';
import * as path from 'node:path';
const reviewers = [
  { reviewer_id: 'security-reviewer' },
  { reviewer_id: 'correctness-reviewer' },
  { reviewer_id: 'adversarial-reviewer' }
];
const result = aggregateFindings(reviewers, path.resolve('.manifests'));
console.log(JSON.stringify(result, null, 2));
