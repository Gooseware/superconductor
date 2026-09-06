import { describe, it, expect } from 'vitest';
import {
  InvariantDeduplicator,
  FingerprintIndex,
  DeduplicationResult,
} from '../deduplicator.js';

describe('InvariantDeduplicator', () => {
  describe('computeFingerprint', () => {
    it('generates a 64-character hex SHA-256 hash', () => {
      const fp = InvariantDeduplicator.computeFingerprint('System MUST validate input parameters');
      expect(fp).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces identical fingerprints across casing differences', () => {
      const fp1 = InvariantDeduplicator.computeFingerprint('SYSTEM MUST VALIDATE INPUT PARAMETERS');
      const fp2 = InvariantDeduplicator.computeFingerprint('system must validate input parameters');
      const fp3 = InvariantDeduplicator.computeFingerprint('System Must Validate Input Parameters');
      expect(fp1).toBe(fp2);
      expect(fp2).toBe(fp3);
    });

    it('produces identical fingerprints across punctuation differences', () => {
      const fp1 = InvariantDeduplicator.computeFingerprint('System MUST validate input parameters.');
      const fp2 = InvariantDeduplicator.computeFingerprint('System, MUST validate: input parameters!');
      const fp3 = InvariantDeduplicator.computeFingerprint('"System" MUST validate "input" parameters?');
      expect(fp1).toBe(fp2);
      expect(fp2).toBe(fp3);
    });

    it('produces identical fingerprints across whitespace and newline differences', () => {
      const fp1 = InvariantDeduplicator.computeFingerprint('System MUST validate input parameters');
      const fp2 = InvariantDeduplicator.computeFingerprint('   System    MUST   validate   input   parameters   ');
      const fp3 = InvariantDeduplicator.computeFingerprint('System\tMUST\nvalidate\r\ninput\tparameters');
      expect(fp1).toBe(fp2);
      expect(fp2).toBe(fp3);
    });

    it('produces distinct fingerprints for semantically distinct invariants', () => {
      const fp1 = InvariantDeduplicator.computeFingerprint('System MUST validate input parameters');
      const fp2 = InvariantDeduplicator.computeFingerprint('Database queries MUST use parameterized statements');
      expect(fp1).not.toBe(fp2);
    });

    it('handles empty or whitespace-only strings gracefully', () => {
      const fpEmpty = InvariantDeduplicator.computeFingerprint('');
      const fpSpaces = InvariantDeduplicator.computeFingerprint('   \t\n  ');
      expect(fpEmpty).toMatch(/^[a-f0-9]{64}$/);
      expect(fpSpaces).toBe(fpEmpty);
    });
  });

  describe('computeSimilarity', () => {
    it('returns 1.0 for identical strings', () => {
      const text = 'Input params MUST be validated prior to db call';
      const sim = InvariantDeduplicator.computeSimilarity(text, text);
      expect(sim).toBe(1.0);
    });

    it('returns 1.0 for strings with identical normalized tokens', () => {
      const text1 = 'Input params MUST be validated prior to db call.';
      const text2 = '  input params must be validated prior to db call  ';
      const sim = InvariantDeduplicator.computeSimilarity(text1, text2);
      expect(sim).toBe(1.0);
    });

    it('returns high similarity (>= 0.80) for semantic near-duplicates', () => {
      const text1 = 'All input params must be validated before db call';
      const text2 = 'Input params MUST be validated prior to db call';
      const sim = InvariantDeduplicator.computeSimilarity(text1, text2);
      expect(sim).toBeGreaterThanOrEqual(0.80);
      expect(sim).toBeLessThanOrEqual(1.0);
    });

    it('returns low similarity (< 0.30) for completely distinct invariants', () => {
      const text1 = 'All input params must be validated before db call';
      const text2 = 'Database queries must use parameterized statements';
      const sim = InvariantDeduplicator.computeSimilarity(text1, text2);
      expect(sim).toBeLessThan(0.30);
      expect(sim).toBeGreaterThanOrEqual(0.0);
    });

    it('supports Jaccard similarity when requested', () => {
      const text1 = 'All input params must be validated before db call';
      const text2 = 'Input params MUST be validated prior to db call';
      const simJaccard = InvariantDeduplicator.computeSimilarity(text1, text2, { algorithm: 'jaccard' });
      expect(simJaccard).toBeGreaterThanOrEqual(0.80);
    });

    it('handles empty strings without throwing', () => {
      expect(InvariantDeduplicator.computeSimilarity('', '')).toBe(1.0);
      expect(InvariantDeduplicator.computeSimilarity('Valid invariant', '')).toBe(0.0);
      expect(InvariantDeduplicator.computeSimilarity('', 'Valid invariant')).toBe(0.0);
    });
  });

  describe('isDuplicate', () => {
    const existing = [
      'Input params MUST be validated prior to db call',
      'Database connections must be acquired through connection pool',
    ];

    it('detects exact match with similarity 1.0', () => {
      const result: DeduplicationResult = InvariantDeduplicator.isDuplicate(
        'Input params MUST be validated prior to db call',
        existing
      );
      expect(result.isDuplicate).toBe(true);
      expect(result.similarity).toBe(1.0);
      expect(result.matchedInvariant).toBe(existing[0]);
    });

    it('detects normalized fingerprint match with similarity 1.0', () => {
      const result = InvariantDeduplicator.isDuplicate(
        '   input params must be validated prior to db call.  ',
        existing
      );
      expect(result.isDuplicate).toBe(true);
      expect(result.similarity).toBe(1.0);
      expect(result.matchedInvariant).toBe(existing[0]);
    });

    it('detects semantic near-duplicate above default 0.80 threshold', () => {
      const result = InvariantDeduplicator.isDuplicate(
        'All input params must be validated before db call',
        existing
      );
      expect(result.isDuplicate).toBe(true);
      expect(result.similarity).toBeGreaterThanOrEqual(0.80);
      expect(result.matchedInvariant).toBe(existing[0]);
    });

    it('accepts distinct invariant with isDuplicate false', () => {
      const result = InvariantDeduplicator.isDuplicate(
        'Service routes MUST require valid bearer authentication token',
        existing
      );
      expect(result.isDuplicate).toBe(false);
      expect(result.similarity).toBeLessThan(0.80);
      expect(result.matchedInvariant).toBeUndefined();
    });

    it('respects custom threshold parameter', () => {
      const nearVariant = 'Input params must be checked before db query';
      // At a very high threshold (0.95), it is not considered duplicate
      const strictResult = InvariantDeduplicator.isDuplicate(nearVariant, existing, 0.95);
      expect(strictResult.isDuplicate).toBe(false);
      expect(strictResult.matchedInvariant).toBeUndefined();

      // At a more relaxed threshold (0.50), it is considered duplicate
      const relaxedResult = InvariantDeduplicator.isDuplicate(nearVariant, existing, 0.50);
      expect(relaxedResult.isDuplicate).toBe(true);
      expect(relaxedResult.matchedInvariant).toBe(existing[0]);
    });

    it('handles empty existing invariants array gracefully', () => {
      const result = InvariantDeduplicator.isDuplicate('Any invariant text', []);
      expect(result.isDuplicate).toBe(false);
      expect(result.similarity).toBe(0);
      expect(result.matchedInvariant).toBeUndefined();
    });

    it('handles empty or blank newInvariant string gracefully', () => {
      const result = InvariantDeduplicator.isDuplicate('   ', existing);
      expect(result.isDuplicate).toBe(false);
      expect(result.similarity).toBe(0);
      expect(result.matchedInvariant).toBeUndefined();
    });

    it('selects best match when multiple existing invariants match', () => {
      const candidates = [
        'Params must be checked',
        'Input params MUST be validated prior to db call',
        'Something completely unrelated',
      ];
      const result = InvariantDeduplicator.isDuplicate(
        'All input params must be validated before db call',
        candidates
      );
      expect(result.isDuplicate).toBe(true);
      expect(result.matchedInvariant).toBe(candidates[1]);
    });
  });

  describe('deduplicateList', () => {
    it('filters redundant invariants while preserving order of first appearance', () => {
      const input = [
        'Input params MUST be validated prior to db call',
        '   input params must be validated prior to db call.  ',
        'All input params must be validated before db call',
        'Database connections must use connection pool',
        'DATABASE CONNECTIONS MUST USE CONNECTION POOL',
        'API keys MUST be redacted in logs',
      ];

      const deduped = InvariantDeduplicator.deduplicateList(input);
      expect(deduped).toEqual([
        'Input params MUST be validated prior to db call',
        'Database connections must use connection pool',
        'API keys MUST be redacted in logs',
      ]);
    });

    it('returns empty array when input list is empty', () => {
      expect(InvariantDeduplicator.deduplicateList([])).toEqual([]);
    });

    it('filters out empty or whitespace-only entries', () => {
      const input = [
        'Valid invariant 1',
        '',
        '   ',
        'Valid invariant 2',
        '\t\n',
      ];
      expect(InvariantDeduplicator.deduplicateList(input)).toEqual([
        'Valid invariant 1',
        'Valid invariant 2',
      ]);
    });

    it('respects custom threshold in deduplicateList', () => {
      const input = [
        'Input params MUST be validated prior to db call',
        'All input params must be validated before db call',
      ];

      // Default threshold (0.80) dedupes near-variant
      const defaultDedup = InvariantDeduplicator.deduplicateList(input);
      expect(defaultDedup).toHaveLength(1);

      // Strict threshold (0.99) keeps both because wording differs slightly
      const strictDedup = InvariantDeduplicator.deduplicateList(input, 0.99);
      expect(strictDedup).toHaveLength(2);
    });
  });

  describe('FingerprintIndex', () => {
    it('indexes invariants by fingerprint and checks novelty efficiently', () => {
      const index = new FingerprintIndex();
      expect(index.size).toBe(0);

      const added1 = index.add('System MUST validate input parameters');
      expect(added1).toBe(true);
      expect(index.size).toBe(1);

      // Adding identical or normalized duplicate returns false
      const addedDup = index.add('system must validate input parameters.');
      expect(addedDup).toBe(false);
      expect(index.size).toBe(1);

      const fp = InvariantDeduplicator.computeFingerprint('System MUST validate input parameters');
      expect(index.hasFingerprint(fp)).toBe(true);
      expect(index.getByFingerprint(fp)).toBe('System MUST validate input parameters');
    });

    it('initializes with seed invariants and performs duplicate checks', () => {
      const index = new FingerprintIndex([
        'Input params MUST be validated prior to db call',
        'Database connections must use connection pool',
      ]);
      expect(index.size).toBe(2);

      const dupCheck = index.isDuplicate('All input params must be validated before db call');
      expect(dupCheck.isDuplicate).toBe(true);
      expect(dupCheck.matchedInvariant).toBe('Input params MUST be validated prior to db call');

      const novelCheck = index.isDuplicate('JWT tokens MUST have expiration timestamp');
      expect(novelCheck.isDuplicate).toBe(false);

      expect(index.getAll()).toHaveLength(2);

      index.clear();
      expect(index.size).toBe(0);
      expect(index.getAll()).toEqual([]);
    });

    it('can be instantiated through InvariantDeduplicator.createIndex', () => {
      const index = InvariantDeduplicator.createIndex([
        'Must enforce SSL encryption',
      ]);
      expect(index).toBeInstanceOf(FingerprintIndex);
      expect(index.size).toBe(1);
    });

    it('rejects empty or whitespace-only invariants when adding', () => {
      const index = new FingerprintIndex();
      expect(index.add('')).toBe(false);
      expect(index.add('   ')).toBe(false);
      expect(index.size).toBe(0);
    });
  });

  describe('normalize and tokenize', () => {
    it('normalizes non-string or falsy input to empty string', () => {
      expect(InvariantDeduplicator.normalize('')).toBe('');
      // @ts-expect-error testing non-string input
      expect(InvariantDeduplicator.normalize(null)).toBe('');
      // @ts-expect-error testing non-string input
      expect(InvariantDeduplicator.normalize(undefined)).toBe('');
    });

    it('tokenizes with and without stop-word filtering', () => {
      const text = 'All input params must be validated to protect the db';
      const filtered = InvariantDeduplicator.tokenize(text, true);
      const unfiltered = InvariantDeduplicator.tokenize(text, false);

      expect(unfiltered).toContain('all');
      expect(unfiltered).toContain('to');
      expect(unfiltered).toContain('the');
      expect(filtered).not.toContain('the');
    });

    it('returns empty array when tokenizing empty string', () => {
      expect(InvariantDeduplicator.tokenize('')).toEqual([]);
    });
  });
});

