import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ReflectiveInvariantSynthesizer,
  SynthesizedInvariant,
  SynthesisOptions,
} from '../invariant-synthesizer.js';
import { QuorumFeedback } from '../types.js';
import { InvariantDeduplicator } from '../deduplicator.js';
import { NoteWriter } from '../../notebook/note-writer.js';

describe('ReflectiveInvariantSynthesizer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('synthesizeFromRemediation', () => {
    it('distills structured invariant string with RFC-2119 keyword MUST from finding', () => {
      const result = ReflectiveInvariantSynthesizer.synthesizeFromRemediation({
        trackId: 'track_test_1',
        finding: 'TrajectorySanitizer fails to redact raw passwords in log files',
        domain: 'sanitizer',
      });

      expect(result).toBeDefined();
      expect(result.invariant).toMatch(/\b(MUST|MUST NOT)\b/);
      expect(result.invariant).toMatch(/^The /);
      expect(result.domain).toBe('sanitizer');
      expect(result.sourceFinding).toBe('TrajectorySanitizer fails to redact raw passwords in log files');
    });

    it('enforces MUST NOT grammar for negative patterns like leaks or crashes', () => {
      const result = ReflectiveInvariantSynthesizer.synthesizeFromRemediation({
        trackId: 'track_test_2',
        finding: 'AuthService leaks private keys in error stack traces',
        domain: 'security',
      });

      expect(result.invariant).toMatch(/\bMUST NOT\b/);
      expect(result.severity).toBe('critical');
    });

    it('assigns critical severity for security vulnerabilities and data corruption', () => {
      const securityFinding = ReflectiveInvariantSynthesizer.synthesizeFromRemediation({
        trackId: 'track_test_3',
        finding: 'SQL injection vulnerability detected in query builder parameter parser',
        domain: 'security',
      });

      expect(securityFinding.severity).toBe('critical');

      const dataLossFinding = ReflectiveInvariantSynthesizer.synthesizeFromRemediation({
        trackId: 'track_test_3',
        finding: 'File system writer causes data loss when disk is full',
        domain: 'storage',
      });

      expect(dataLossFinding.severity).toBe('critical');
    });

    it('assigns warning severity for non-critical bugs or style violations', () => {
      const result = ReflectiveInvariantSynthesizer.synthesizeFromRemediation({
        trackId: 'track_test_4',
        finding: 'Missing optional pagination headers in list endpoint response',
        domain: 'api',
      });

      expect(result.severity).toBe('warning');
    });

    it('incorporates rootCause and fixSummary when provided', () => {
      const result = ReflectiveInvariantSynthesizer.synthesizeFromRemediation({
        trackId: 'track_test_5',
        finding: 'Hanging socket connection under high network load',
        domain: 'network',
        rootCause: 'Socket connection lacked timeout handler',
        fixSummary: 'Added 5000ms timeout handler to socket connection pool',
      });

      expect(result.invariant).toMatch(/\b(MUST|MUST NOT)\b/);
      expect(result.invariant.toLowerCase()).toContain('timeout');
    });

    it('normalizes finding that already contains RFC-2119 keywords', () => {
      const result = ReflectiveInvariantSynthesizer.synthesizeFromRemediation({
        trackId: 'track_test_6',
        finding: 'The Harvester MUST serialize execution traces asynchronously without blocking active swarm',
        domain: 'orchestration',
      });

      expect(result.invariant).toBe(
        'The Harvester MUST serialize execution traces asynchronously without blocking active swarm'
      );
    });

    it('falls back to domain or system if no specific component name is discovered', () => {
      const result = ReflectiveInvariantSynthesizer.synthesizeFromRemediation({
        trackId: 'track_test_7',
        finding: 'Missing validation for email format in user profile update',
        domain: 'validation',
      });

      expect(result.invariant).toMatch(/^The (validation module|system|component) MUST/i);
    });
  });

  describe('isValidInvariant', () => {
    it('validates RFC-2119 grammar format', () => {
      expect(
        ReflectiveInvariantSynthesizer.isValidInvariant(
          'The TrajectorySanitizer MUST redact API keys'
        )
      ).toBe(true);

      expect(
        ReflectiveInvariantSynthesizer.isValidInvariant(
          'The AuthService MUST NOT expose private tokens'
        )
      ).toBe(true);

      expect(
        ReflectiveInvariantSynthesizer.isValidInvariant(
          'Just a random observation with no rule'
        )
      ).toBe(false);

      expect(ReflectiveInvariantSynthesizer.isValidInvariant('')).toBe(false);
    });
  });

  describe('synthesizeFromQuorum', () => {
    it('extracts invariants only from NEEDS_FIXES reviews and skips RESOLVED', () => {
      const quorumFeedback: QuorumFeedback[] = [
        {
          reviewerRole: 'correctness-reviewer',
          verdict: 'RESOLVED',
          findings: ['Everything looks clean and well structured.'],
        },
        {
          reviewerRole: 'security-reviewer',
          verdict: 'NEEDS_FIXES',
          findings: [
            'Missing authentication token verification in WebSocket gateway',
            'Sensitive session cookies lack Secure and SameSite flags',
          ],
        },
      ];

      const { newInvariants, duplicateCount } =
        ReflectiveInvariantSynthesizer.synthesizeFromQuorum(quorumFeedback);

      expect(newInvariants).toHaveLength(2);
      expect(duplicateCount).toBe(0);
      expect(newInvariants[0].domain).toBe('security');
      expect(newInvariants[0].severity).toBe('critical');
      expect(newInvariants[0].invariant).toMatch(/\b(MUST|MUST NOT)\b/);
      expect(newInvariants[1].domain).toBe('security');
    });

    it('uses InvariantDeduplicator to prune duplicates against existing invariants', () => {
      const existingInvariants = [
        'The WebSocket gateway MUST verify authentication tokens',
      ];

      const quorumFeedback: QuorumFeedback[] = [
        {
          reviewerRole: 'security-reviewer',
          verdict: 'NEEDS_FIXES',
          findings: [
            'The WebSocket gateway MUST verify authentication tokens', // Exact duplicate
            'Component DatabaseClient does not release connections on failure', // Novel
          ],
        },
      ];

      const { newInvariants, duplicateCount } =
        ReflectiveInvariantSynthesizer.synthesizeFromQuorum(
          quorumFeedback,
          existingInvariants
        );

      expect(duplicateCount).toBe(1);
      expect(newInvariants).toHaveLength(1);
      expect(newInvariants[0].invariant.toLowerCase()).toContain('connection');
    });

    it('prunes duplicates occurring multiple times within the same quorum feedback batch', () => {
      const quorumFeedback: QuorumFeedback[] = [
        {
          reviewerRole: 'correctness-reviewer',
          verdict: 'NEEDS_FIXES',
          findings: [
            'Missing null check in user profile parser',
            'Missing null check in user profile parser', // Duplicate within batch
          ],
        },
      ];

      const { newInvariants, duplicateCount } =
        ReflectiveInvariantSynthesizer.synthesizeFromQuorum(quorumFeedback);

      expect(duplicateCount).toBe(1);
      expect(newInvariants).toHaveLength(1);
    });

    it('correctly associates domain based on reviewer role if not explicit in finding', () => {
      const quorumFeedback: QuorumFeedback[] = [
        {
          reviewerRole: 'adversarial-reviewer',
          verdict: 'NEEDS_FIXES',
          findings: ['Timeout not enforced during heavy adversarial payload bursts'],
        },
        {
          reviewerRole: 'regression-reviewer',
          verdict: 'NEEDS_FIXES',
          findings: ['Signature changed breaking backwards compatibility in API client'],
        },
      ];

      const { newInvariants } =
        ReflectiveInvariantSynthesizer.synthesizeFromQuorum(quorumFeedback);

      expect(newInvariants[0].domain).toBe('adversarial');
      expect(newInvariants[1].domain).toBe('regression');
    });
  });

  describe('recordToNotebook', () => {
    it('records distilled invariant via NoteWriter.writeWarningNote', async () => {
      const spy = vi.spyOn(NoteWriter, 'writeWarningNote').mockResolvedValue({ id: 'note-123' });

      const invariant: SynthesizedInvariant = {
        invariant: 'The TrajectorySanitizer MUST redact API keys and passwords',
        severity: 'critical',
        domain: 'security',
        sourceFinding: 'Leaked API keys',
      };

      await ReflectiveInvariantSynthesizer.recordToNotebook(invariant, {
        trackId: 'track_test_notebook',
        domain: 'security',
        filePaths: ['src/learning/sanitizer.ts'],
        invocationId: 'inv-456',
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        'The TrajectorySanitizer MUST redact API keys and passwords',
        expect.objectContaining({
          track_id: 'track_test_notebook',
          domain: 'security',
          files: ['src/learning/sanitizer.ts'],
          invocation_id: 'inv-456',
          severity: 'critical',
        })
      );
    });

    it('rejects or throws when trackId is missing in recordToNotebook', async () => {
      const invariant: SynthesizedInvariant = {
        invariant: 'The system MUST validate inputs',
        severity: 'warning',
        domain: 'general',
      };

      await expect(
        ReflectiveInvariantSynthesizer.recordToNotebook(invariant, {
          trackId: '',
          domain: 'general',
        })
      ).rejects.toThrow('trackId is required');
    });
  });
});
