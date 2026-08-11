import { describe, it, expect } from 'vitest';
import { StagnantDiffDetector } from '../src/circuit-breaker/stagnant-diff-detector.js';

describe('StagnantDiffDetector', () => {
  it('should compute consistent SHA-256 hash for diff', () => {
    const diff = 'diff --git a/file.ts b/file.ts\n+const x = 1;';
    const hash1 = StagnantDiffDetector.hashDiff(diff);
    const hash2 = StagnantDiffDetector.hashDiff(diff);
    expect(hash1).toEqual(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('should detect stagnant diff correctly', () => {
    const hashA = StagnantDiffDetector.hashDiff('diff A');
    const hashB = StagnantDiffDetector.hashDiff('diff B');

    expect(StagnantDiffDetector.isStagnant(hashA, null)).toBe(false);
    expect(StagnantDiffDetector.isStagnant(hashA, hashB)).toBe(false);
    expect(StagnantDiffDetector.isStagnant(hashA, hashA)).toBe(true);
  });
});
