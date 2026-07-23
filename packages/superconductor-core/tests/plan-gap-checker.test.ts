import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkPlanGap } from '../src/track/plan-gap-checker.js';

describe('checkPlanGap', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-plangap-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should return confidence 0.0 when N=0 criteria found', () => {
    const report = checkPlanGap(tmpDir, 'non_existent_track', ['src/index.ts']);

    expect(report.covered).toEqual([]);
    expect(report.uncovered).toEqual([]);
    expect(report.confidence).toBe(0.0);
  });

  it('should calculate covered/uncovered and confidence when criteria exist', () => {
    const trackDir = path.join(tmpDir, 'superconductor', 'tracks', 'track_1');
    fs.mkdirSync(trackDir, { recursive: true });

    const specContent = `
# Spec

## Acceptance Criteria
- [x] Pre-checked criterion
- [ ] Implement user authentication logic
- [ ] Implement billing payment gateway
`;
    fs.writeFileSync(path.join(trackDir, 'spec.md'), specContent, 'utf-8');

    const report = checkPlanGap(tmpDir, 'track_1', ['src/authentication.ts']);

    expect(report.covered).toHaveLength(2);
    expect(report.uncovered).toHaveLength(1);
    expect(report.confidence).toBe(0.67);
  });
});
