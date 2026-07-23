import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runSelfCheck } from '../scripts/review-self-check.js';

console.log('Running Review Self-Check Test Suite...\\n');

const createTmpFile = (content: string) => {
  const tmpFile = path.join(os.tmpdir(), `test-report-${Date.now()}-${Math.random()}.md`);
  fs.writeFileSync(tmpFile, content);
  return tmpFile;
};

// Test: valid certification block → exit 0
{
  const file = createTmpFile(`
## Execution Evidence
- [x] §8.1 Worst-input set executed
- [ ] §9.2 Boundary values executed
- Terminal output: 
\`\`\`
test passed
\`\`\`
  `);
  const result = runSelfCheck(file);
  assert.strictEqual(result.code, 0);
  fs.unlinkSync(file);
  console.log('✅ valid certification block → exit 0');
}

// Test: missing block → exit 1 with actionable stderr message
{
  const file = createTmpFile(`# Review Report`);
  const result = runSelfCheck(file);
  assert.strictEqual(result.code, 1);
  assert.ok(result.message?.includes('Missing certification block'));
  fs.unlinkSync(file);
  console.log('✅ missing block → exit 1');
}

// Test: all-unchecked block → exit 1
{
  const file = createTmpFile(`
## Execution Evidence
- [ ] §8.1 Worst-input set executed
- [ ] §9.2 Boundary values executed
- Terminal output: some output
  `);
  const result = runSelfCheck(file);
  assert.strictEqual(result.code, 1);
  assert.ok(result.message?.includes('no [x] found'));
  fs.unlinkSync(file);
  console.log('✅ all-unchecked block → exit 1');
}

// Test: missing terminal output → exit 2
{
  const file = createTmpFile(`
## Execution Evidence
- [x] §8.1 Worst-input set executed
- Terminal output: [pasted inline above]
  `);
  const result = runSelfCheck(file);
  assert.strictEqual(result.code, 2);
  assert.ok(result.message?.includes('placeholder'));
  fs.unlinkSync(file);
  console.log('✅ missing terminal output → exit 2');
}

// Test: --skip-self-check flag → exit 0, adds bypass annotation
{
  const file = createTmpFile(`
# Review Report
  `);
  const result = runSelfCheck(file, ['--skip-self-check']);
  assert.strictEqual(result.code, 0);
  assert.ok(result.message?.includes('Bypass annotation'));
  fs.unlinkSync(file);
  console.log('✅ --skip-self-check flag → exit 0');
}

console.log('\\n🎉 ALL REVIEW SELF-CHECK TESTS PASSED!');
