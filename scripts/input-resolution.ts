import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  resolveReviewInput,
  type ResolvedInput
} from '../packages/superconductor-core/dist/review/input-resolution.js';

export {
  resolveReviewInput,
  type ResolvedInput
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const isGitRepo = fs.existsSync(path.join(process.cwd(), '.git'));
  const result = resolveReviewInput(args, isGitRepo);
  console.log(JSON.stringify(result, null, 2));
}

