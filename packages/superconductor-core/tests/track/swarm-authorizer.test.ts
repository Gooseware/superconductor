import { describe, it, expect } from 'vitest';
import { SwarmAuthorizer } from '../../src/track/swarm-authorizer';

describe('SwarmAuthorizer', () => {
  describe('generateTrailer', () => {
    it('generates a trailer with reviewers', () => {
      const trailer = SwarmAuthorizer.generateTrailer(['id1', 'id2', 'id3']);
      expect(trailer).toBe('Swarm-Authorized: true | reviewers: id1,id2,id3');
    });

    it('throws when reviewer list is empty', () => {
      expect(() => SwarmAuthorizer.generateTrailer([])).toThrow('Cannot generate Swarm-Authorized trailer without reviewer IDs.');
    });

    it('throws when reviewer list is null or undefined', () => {
      expect(() => SwarmAuthorizer.generateTrailer(null as any)).toThrow('Cannot generate Swarm-Authorized trailer without reviewer IDs.');
      expect(() => SwarmAuthorizer.generateTrailer(undefined as any)).toThrow('Cannot generate Swarm-Authorized trailer without reviewer IDs.');
    });
  });

  describe('validateTrailer', () => {
    it('returns true for a valid trailer with reviewers', () => {
      const msg = `feat: some feature\n\nSwarm-Authorized: true | reviewers: id1,id2\n`;
      expect(SwarmAuthorizer.validateTrailer(msg)).toBe(true);
    });

    it('returns false when trailer is missing', () => {
      const msg = `feat: some feature\n\nFixes #123`;
      expect(SwarmAuthorizer.validateTrailer(msg)).toBe(false);
    });

    it('returns false when reviewers are missing in trailer', () => {
      const msg = `feat: some feature\n\nSwarm-Authorized: true | reviewers: \n`;
      expect(SwarmAuthorizer.validateTrailer(msg)).toBe(false);
    });

    it('returns false for just whitespace after reviewers', () => {
      const msg = `feat: some feature\n\nSwarm-Authorized: true | reviewers:    \n`;
      expect(SwarmAuthorizer.validateTrailer(msg)).toBe(false);
    });
  });

  describe('ReDoS Resilience (SEC-2)', () => {
    it('processes pathological input strings with 50+ newlines/spaces followed by non-matching characters in < 5ms', () => {
      const pathological = 'Swarm-Authorized: true | reviewers: id1,id2' + ' \r\n '.repeat(60) + 'tail-mismatch';

      const start = performance.now();
      const result = SwarmAuthorizer.validateTrailer(pathological);
      const elapsed = performance.now() - start;

      expect(result).toBe(false);
      expect(elapsed).toBeLessThan(5);
    });

    it('processes pathological string with 50+ trailing newlines and spaces in < 5ms', () => {
      const pathological = 'feat: foo\n\nSwarm-Authorized: true | reviewers: id1,id2,id3' + ' \r\n '.repeat(60);

      const start = performance.now();
      const reviewers = SwarmAuthorizer.extractReviewers(pathological);
      const elapsed = performance.now() - start;

      expect(reviewers).toEqual(['id1', 'id2', 'id3']);
      expect(elapsed).toBeLessThan(5);
    });
  });
});
