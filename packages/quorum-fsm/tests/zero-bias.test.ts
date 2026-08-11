import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { ZeroBiasContextBuilder } from '../src/zero-bias/zero-bias-context-builder.js';

describe('ZeroBiasContextBuilder', () => {
  it('should build context with hashed finding fingerprints', () => {
    const rawFinding = 'Security vulnerability in file.ts line 42';
    const expectedHash = crypto.createHash('sha256').update(rawFinding).digest('hex');

    const result = ZeroBiasContextBuilder.build({
      diff: 'git diff content',
      preflight_output: 'Preflight OK',
      prior_findings: [rawFinding],
      cycle: 2,
    });

    expect(result.diff).toBe('git diff content');
    expect(result.preflight_output).toBe('Preflight OK');
    expect(result.cycle_number).toBe(2);
    expect(result.finding_fingerprints).toEqual([expectedHash]);
    expect(result.finding_fingerprints[0]).not.toBe(rawFinding);
  });
});
