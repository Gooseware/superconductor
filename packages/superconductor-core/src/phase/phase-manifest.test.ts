import { describe, it, expect } from 'vitest';
import {
  phaseIdSchema,
  phaseStatusSchema,
  phaseTrackItemSchema,
  phaseItemSchema,
  registryManifestSchema,
  phaseManifestSchema,
  validatePhaseId,
  isPhaseIdValid,
  type PhaseStatus,
  type PhaseTrackItem,
  type PhaseItem,
  type RegistryManifest,
  type PhaseManifest,
} from './phase-manifest.js';

describe('PhaseManifest Schemas & Validation', () => {
  describe('phaseIdSchema & validatePhaseId', () => {
    it('accepts valid symbolic phase IDs', () => {
      const validIds = [
        'core-foundation',
        'phase_1',
        'foundation-engine',
        'a',
        '0-test_123',
        'a'.repeat(64),
      ];

      for (const id of validIds) {
        expect(isPhaseIdValid(id)).toBe(true);
        const result = phaseIdSchema.safeParse(id);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(id);
        }
      }
    });

    it('rejects path traversal sequences (..)', () => {
      const traversalIds = ['..', '../foo', 'foo/..', 'phase/../secret', '..phase'];
      for (const id of traversalIds) {
        expect(isPhaseIdValid(id)).toBe(false);
        const parseResult = phaseIdSchema.safeParse(id);
        expect(parseResult.success).toBe(false);
        const validation = validatePhaseId(id);
        expect(validation.valid).toBe(false);
      }
    });

    it('rejects path separators (/ and \\)', () => {
      const separatorIds = ['foo/bar', '/root', 'bar/', 'foo\\bar', '\\test'];
      for (const id of separatorIds) {
        expect(isPhaseIdValid(id)).toBe(false);
        const parseResult = phaseIdSchema.safeParse(id);
        expect(parseResult.success).toBe(false);
      }
    });

    it('rejects null bytes', () => {
      const nullByteIds = ['foo\0bar', '\0', 'phase\0'];
      for (const id of nullByteIds) {
        expect(isPhaseIdValid(id)).toBe(false);
        const parseResult = phaseIdSchema.safeParse(id);
        expect(parseResult.success).toBe(false);
      }
    });

    it('rejects reserved phase IDs', () => {
      const reservedIds = ['archive', 'default-archive'];
      for (const id of reservedIds) {
        expect(isPhaseIdValid(id)).toBe(false);
        const parseResult = phaseIdSchema.safeParse(id);
        expect(parseResult.success).toBe(false);
        const validation = validatePhaseId(id);
        expect(validation.valid).toBe(false);
        expect(validation.error).toMatch(/reserved/i);
      }
    });

    it('rejects invalid characters, uppercase, and spaces', () => {
      const invalidChars = [
        'Phase-1',
        'CORE',
        'phase 1',
        'phase@1',
        'phase#1',
        'phase.1',
        'phase$test',
      ];
      for (const id of invalidChars) {
        expect(isPhaseIdValid(id)).toBe(false);
        const parseResult = phaseIdSchema.safeParse(id);
        expect(parseResult.success).toBe(false);
      }
    });

    it('rejects empty string and strings exceeding 64 characters', () => {
      expect(isPhaseIdValid('')).toBe(false);
      expect(phaseIdSchema.safeParse('').success).toBe(false);

      const tooLong = 'a'.repeat(65);
      expect(isPhaseIdValid(tooLong)).toBe(false);
      expect(phaseIdSchema.safeParse(tooLong).success).toBe(false);
    });
  });

  describe('phaseStatusSchema', () => {
    it('accepts valid phase statuses', () => {
      const validStatuses: PhaseStatus[] = ['planned', 'active', 'blocked', 'completed'];
      for (const status of validStatuses) {
        const result = phaseStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid statuses', () => {
      expect(phaseStatusSchema.safeParse('in_progress').success).toBe(false);
      expect(phaseStatusSchema.safeParse('pending').success).toBe(false);
      expect(phaseStatusSchema.safeParse('unknown').success).toBe(false);
      expect(phaseStatusSchema.safeParse('').success).toBe(false);
    });
  });

  describe('phaseTrackItemSchema', () => {
    it('validates a complete track item', () => {
      const track: PhaseTrackItem = {
        trackId: 'core_foundation',
        title: 'Core Foundation Architecture',
        status: 'completed',
        branch: 'main',
        link: './tracks/core_foundation/',
        note: 'Prerequisite for UI',
      };
      const result = phaseTrackItemSchema.safeParse(track);
      expect(result.success).toBe(true);
    });

    it('validates a minimal track item', () => {
      const track = {
        trackId: 'minimal_track',
        title: 'Minimal Track',
        status: 'planned' as const,
      };
      const result = phaseTrackItemSchema.safeParse(track);
      expect(result.success).toBe(true);
    });

    it('rejects invalid track status', () => {
      const track = {
        trackId: 'bad_track',
        title: 'Bad Status',
        status: 'blocked', // Phase status, not track status
      };
      const result = phaseTrackItemSchema.safeParse(track);
      expect(result.success).toBe(false);
    });

    it('rejects missing required fields', () => {
      expect(phaseTrackItemSchema.safeParse({ title: 'No ID', status: 'planned' }).success).toBe(false);
      expect(phaseTrackItemSchema.safeParse({ trackId: 'no_title', status: 'planned' }).success).toBe(false);
      expect(phaseTrackItemSchema.safeParse({ trackId: 'no_status', title: 'Title' }).success).toBe(false);
    });
  });

  describe('phaseItemSchema', () => {
    it('validates a valid phase item', () => {
      const phase: PhaseItem = {
        phaseId: 'core-foundation',
        name: 'Core Foundation',
        status: 'active',
        ordinal: 1,
        tracks: [
          {
            trackId: 'track_1',
            title: 'Track 1',
            status: 'completed',
            branch: 'main',
          },
        ],
      };
      const result = phaseItemSchema.safeParse(phase);
      expect(result.success).toBe(true);
    });

    it('rejects phase with invalid phaseId', () => {
      const phase = {
        phaseId: 'Invalid Phase ID',
        name: 'Invalid',
        status: 'planned' as const,
        tracks: [],
      };
      const result = phaseItemSchema.safeParse(phase);
      expect(result.success).toBe(false);
    });

    it('rejects phase with reserved phaseId', () => {
      const phase = {
        phaseId: 'archive',
        name: 'Archive Phase',
        status: 'completed' as const,
        tracks: [],
      };
      const result = phaseItemSchema.safeParse(phase);
      expect(result.success).toBe(false);
    });
  });

  describe('registryManifestSchema & phaseManifestSchema', () => {
    it('validates a full registry manifest', () => {
      const manifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'core-foundation',
            name: 'Core Foundation',
            status: 'completed',
            ordinal: 1,
            tracks: [
              {
                trackId: 'track_1',
                title: 'Track 1',
                status: 'completed',
                branch: 'main',
              },
            ],
          },
          {
            phaseId: 'ui-polish',
            name: 'UI Polish',
            status: 'active',
            ordinal: 2,
            tracks: [
              {
                trackId: 'track_2',
                title: 'Track 2',
                status: 'in_progress',
                branch: 'track/track_2',
              },
            ],
          },
        ],
        absorbed: [
          {
            trackId: 'old_track',
            absorbedBy: 'track_1',
            reason: 'Superseded',
          },
        ],
        archived: ['ancient_track_1', 'ancient_track_2'],
      };

      const result = registryManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);

      const aliasResult = phaseManifestSchema.safeParse(manifest);
      expect(aliasResult.success).toBe(true);
    });

    it('validates a minimal manifest without optional absorbed or archived', () => {
      const manifest: RegistryManifest = {
        phases: [],
      };
      const result = registryManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });
  });
});
