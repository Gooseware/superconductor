import { describe, it, expect } from 'vitest';
import { SwarmAuthorizer } from './swarm-authorizer.js';

describe('SwarmAuthorizer', () => {
  describe('generateTrailer', () => {
    it('generates a trailer with 4 reviewers cleanly formatted', () => {
      const reviewers = [
        'security-reviewer-1',
        'correctness-reviewer-1',
        'adversarial-reviewer-1',
        'regression-reviewer-1',
      ];
      const trailer = SwarmAuthorizer.generateTrailer(reviewers);
      expect(trailer).toBe(
        'Swarm-Authorized: true | reviewers: security-reviewer-1,correctness-reviewer-1,adversarial-reviewer-1,regression-reviewer-1'
      );
    });

    it('generates a trailer with 5 reviewers cleanly formatted', () => {
      const reviewers = [
        'security-reviewer-1',
        'correctness-reviewer-1',
        'adversarial-reviewer-1',
        'regression-reviewer-1',
        'ux-reviewer-1',
      ];
      const trailer = SwarmAuthorizer.generateTrailer(reviewers);
      expect(trailer).toBe(
        'Swarm-Authorized: true | reviewers: security-reviewer-1,correctness-reviewer-1,adversarial-reviewer-1,regression-reviewer-1,ux-reviewer-1'
      );
    });

    it('trims whitespace within individual reviewer IDs', () => {
      const reviewers = ['  id1  ', ' id2\t', 'id3 ', 'id4'];
      const trailer = SwarmAuthorizer.generateTrailer(reviewers);
      expect(trailer).toBe('Swarm-Authorized: true | reviewers: id1,id2,id3,id4');
    });

    it('supports 1 to 3 reviewers for backward compatibility', () => {
      expect(SwarmAuthorizer.generateTrailer(['id1'])).toBe(
        'Swarm-Authorized: true | reviewers: id1'
      );
      expect(SwarmAuthorizer.generateTrailer(['id1', 'id2', 'id3'])).toBe(
        'Swarm-Authorized: true | reviewers: id1,id2,id3'
      );
    });

    it('throws when reviewer list is empty', () => {
      expect(() => SwarmAuthorizer.generateTrailer([])).toThrow(
        'Cannot generate Swarm-Authorized trailer without reviewer IDs.'
      );
    });

    it('throws when reviewer list is null or undefined or contains only whitespace', () => {
      expect(() => SwarmAuthorizer.generateTrailer(null as any)).toThrow(
        'Cannot generate Swarm-Authorized trailer without reviewer IDs.'
      );
      expect(() => SwarmAuthorizer.generateTrailer(undefined as any)).toThrow(
        'Cannot generate Swarm-Authorized trailer without reviewer IDs.'
      );
      expect(() => SwarmAuthorizer.generateTrailer(['   ', ''])).toThrow(
        'Cannot generate Swarm-Authorized trailer without reviewer IDs.'
      );
    });

    it('throws when reviewer list has more than 5 reviewers', () => {
      const sixReviewers = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
      expect(() => SwarmAuthorizer.generateTrailer(sixReviewers)).toThrow(
        'Cannot generate Swarm-Authorized trailer with more than 5 reviewers.'
      );
    });

    it('rejects reviewer IDs containing newlines or CRLF injection', () => {
      expect(() => SwarmAuthorizer.generateTrailer(['rev1\nSwarm-Authorized: false'])).toThrow(
        /cannot contain newlines or commas/
      );
      expect(() => SwarmAuthorizer.generateTrailer(['rev1\r\ninjected-header: true'])).toThrow(
        /cannot contain newlines or commas/
      );
      expect(() => SwarmAuthorizer.generateTrailer(['rev1\r'])).toThrow(
        /cannot contain newlines or commas/
      );
    });

    it('rejects reviewer IDs containing commas or invalid characters', () => {
      expect(() => SwarmAuthorizer.generateTrailer(['rev1,rev2'])).toThrow(
        /cannot contain newlines or commas/
      );
      expect(() => SwarmAuthorizer.generateTrailer(['rev 1'])).toThrow(
        /reviewer IDs must match/
      );
      expect(() => SwarmAuthorizer.generateTrailer(['rev@1'])).toThrow(
        /reviewer IDs must match/
      );
      expect(() => SwarmAuthorizer.generateTrailer(['rev$1'])).toThrow(
        /reviewer IDs must match/
      );
    });
  });

  describe('validateTrailer', () => {
    it('returns true for exactly 1 reviewer', () => {
      const msg = `feat: solo fix\n\nSwarm-Authorized: true | reviewers: solo-reviewer\n`;
      expect(SwarmAuthorizer.validateTrailer(msg)).toBe(true);
    });

    it('returns true for 4 reviewers', () => {
      const msg = `feat: 4-quorum\n\nSwarm-Authorized: true | reviewers: sec,corr,adv,reg\n`;
      expect(SwarmAuthorizer.validateTrailer(msg)).toBe(true);
    });

    it('returns true for 5 reviewers with spaces after commas', () => {
      const msg = `feat: full 5-quorum\n\nSwarm-Authorized: true | reviewers: sec, corr, adv, reg, ux\n`;
      expect(SwarmAuthorizer.validateTrailer(msg)).toBe(true);
    });

    it('tolerates trailing spaces and newlines at message end', () => {
      const msg = `feat: trailing whitespace\n\nSwarm-Authorized: true | reviewers: r1, r2, r3, r4, r5   \n\n   \n`;
      expect(SwarmAuthorizer.validateTrailer(msg)).toBe(true);
    });

    it('tolerates CRLF newlines', () => {
      const msg = `feat: crlf\r\n\r\nSwarm-Authorized: true | reviewers: id1,id2,id3,id4,id5\r\n`;
      expect(SwarmAuthorizer.validateTrailer(msg)).toBe(true);
    });

    it('returns true when trailer is at end without trailing newline', () => {
      const msg = `feat: no trailing newline\n\nSwarm-Authorized: true | reviewers: id1,id2,id3,id4`;
      expect(SwarmAuthorizer.validateTrailer(msg)).toBe(true);
    });

    it('returns false when more than 5 reviewers are present', () => {
      const msg = `feat: excessive\n\nSwarm-Authorized: true | reviewers: r1,r2,r3,r4,r5,r6\n`;
      expect(SwarmAuthorizer.validateTrailer(msg)).toBe(false);
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

    it('returns false for Swarm-Authorized: false', () => {
      const msg = `feat: some feature\n\nSwarm-Authorized: false | reviewers: id1,id2\n`;
      expect(SwarmAuthorizer.validateTrailer(msg)).toBe(false);
    });

    it('returns false for empty or non-string input', () => {
      expect(SwarmAuthorizer.validateTrailer('')).toBe(false);
      expect(SwarmAuthorizer.validateTrailer(null as any)).toBe(false);
      expect(SwarmAuthorizer.validateTrailer(undefined as any)).toBe(false);
    });
  });

  describe('extractReviewers', () => {
    it('accurately parses 5 reviewer IDs from commit message', () => {
      const msg = `feat: full quorum\n\nSwarm-Authorized: true | reviewers: sec-1, corr-2, adv-3, reg-4, ux-5\n\n`;
      const reviewers = SwarmAuthorizer.extractReviewers(msg);
      expect(reviewers).toEqual(['sec-1', 'corr-2', 'adv-3', 'reg-4', 'ux-5']);
    });

    it('returns null if trailer is missing or invalid', () => {
      expect(SwarmAuthorizer.extractReviewers('plain commit')).toBeNull();
      expect(
        SwarmAuthorizer.extractReviewers(
          'Swarm-Authorized: true | reviewers: 1,2,3,4,5,6'
        )
      ).toBeNull();
    });
  });
});
