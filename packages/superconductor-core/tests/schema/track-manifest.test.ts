import { describe, it, expect } from 'vitest';
import {
  TrackManifestSchema,
  TrackStatusSchema,
  TracksManifestSchema,
  parseTrackManifest,
  parseTracksManifest,
  type TrackManifest,
  type TrackStatus
} from '../../src/schema/track-manifest.js';

describe('Track Manifest Schema (Dense YAML format)', () => {
  describe('TrackStatusSchema', () => {
    it('accepts valid track status values', () => {
      expect(TrackStatusSchema.parse('planned')).toBe('planned');
      expect(TrackStatusSchema.parse('in_progress')).toBe('in_progress');
      expect(TrackStatusSchema.parse('completed')).toBe('completed');
    });

    it('rejects invalid status values', () => {
      expect(() => TrackStatusSchema.parse('invalid_status')).toThrow();
      expect(() => TrackStatusSchema.parse(123)).toThrow();
    });
  });

  describe('TrackManifestSchema', () => {
    it('validates a complete track manifest object', () => {
      const validTrack = {
        id: 'core_harness_abstraction_20260723',
        status: 'completed',
        title: 'Harness-Agnostic Core Abstraction',
        description: 'Decouple core business logic from CLI harnesses',
        link: './tracks/core_harness_abstraction_20260723/',
        dependencies: ['setup_enhancements_20260711']
      };

      const result = TrackManifestSchema.parse(validTrack);
      expect(result.status).toBe('completed');
      expect(result.title).toBe('Harness-Agnostic Core Abstraction');
      expect(result.description).toBe('Decouple core business logic from CLI harnesses');
      expect(result.link).toBe('./tracks/core_harness_abstraction_20260723/');
      expect(result.dependencies).toEqual(['setup_enhancements_20260711']);
    });

    it('handles empty dependencies array by default', () => {
      const inputWithoutDeps = {
        status: 'planned',
        title: 'Standalone Track',
        description: 'No dependencies',
        link: './tracks/standalone_20260725/'
      };

      const result = TrackManifestSchema.parse(inputWithoutDeps);
      expect(result.dependencies).toEqual([]);
    });

    it('normalizes deps alias to dependencies if deps is provided', () => {
      const inputWithDepsAlias = {
        status: 'in_progress',
        title: 'Alias Test Track',
        description: 'Using deps key',
        link: './tracks/alias_20260725/',
        deps: ['track_a', 'track_b']
      };

      const result = TrackManifestSchema.parse(inputWithDepsAlias);
      expect(result.dependencies).toEqual(['track_a', 'track_b']);
    });

    it('rejects manifest missing required fields (title, status)', () => {
      expect(() => TrackManifestSchema.parse({ title: 'Missing Status' })).toThrow();
      expect(() => TrackManifestSchema.parse({ status: 'planned' })).toThrow();
    });

    it('rejects non-array dependencies', () => {
      const invalidDeps = {
        status: 'planned',
        title: 'Invalid Deps Track',
        description: 'Bad deps',
        link: './tracks/invalid/',
        dependencies: 'not-an-array'
      };

      expect(() => TrackManifestSchema.parse(invalidDeps)).toThrow();
    });
  });

  describe('TracksManifestSchema & parse functions', () => {
    it('parses an array of track manifests', () => {
      const tracksArray = [
        {
          id: 'track_1',
          status: 'completed',
          title: 'Track 1',
          description: 'First track',
          link: './tracks/track_1/',
          dependencies: []
        },
        {
          id: 'track_2',
          status: 'planned',
          title: 'Track 2',
          description: 'Second track',
          link: './tracks/track_2/',
          dependencies: ['track_1']
        }
      ];

      const parsed = parseTracksManifest(tracksArray);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].title).toBe('Track 1');
      expect(parsed[1].dependencies).toEqual(['track_1']);
    });

    it('parses a dictionary mapping track ID to track manifest in Dense YAML', () => {
      const tracksDict = {
        track_a: {
          status: 'completed',
          title: 'Track A',
          description: 'Base track',
          link: './tracks/track_a/',
          dependencies: []
        },
        track_b: {
          status: 'in_progress',
          title: 'Track B',
          description: 'Dependent track',
          link: './tracks/track_b/',
          deps: ['track_a']
        }
      };

      const parsed = parseTracksManifest(tracksDict);
      expect(parsed).toHaveLength(2);
      expect(parsed.find((t) => t.id === 'track_a')?.status).toBe('completed');
      expect(parsed.find((t) => t.id === 'track_b')?.dependencies).toEqual(['track_a']);
    });

    it('parseTrackManifest throws helpful error on invalid input', () => {
      expect(() => parseTrackManifest(null)).toThrow();
      expect(() => parseTrackManifest({ status: 'invalid' })).toThrow();
    });
  });
});
