import { extractFencedBlock } from '../packages/superconductor-core/dist/review/extract-fenced-block.js';

export { extractFencedBlock };

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = process.argv[2] || '';
  const identifier = process.argv[3] || 'coverage-manifest';
  const result = extractFencedBlock(text, identifier);
  console.log(JSON.stringify(result, null, 2));
}

