import * as path from 'node:path';
import {
  runDeterministicPreflight,
  type PreflightResult
} from '../packages/superconductor-core/dist/review/deterministic-preflight.js';

export {
  runDeterministicPreflight,
  type PreflightResult
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const result = runDeterministicPreflight(targetDir);
  console.log(JSON.stringify(result, null, 2));
}

