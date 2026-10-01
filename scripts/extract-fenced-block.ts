import {
  extractFencedBlock,
  ReviewFindingsPipeline
} from '../packages/superconductor-core/src/review/index.js';

export { extractFencedBlock, ReviewFindingsPipeline };

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = process.argv[2] || '';
  const identifier = process.argv[3] || 'coverage-manifest';
  const result = ReviewFindingsPipeline.extractFencedBlock(text, identifier);
  console.log(JSON.stringify(result, null, 2));
}

