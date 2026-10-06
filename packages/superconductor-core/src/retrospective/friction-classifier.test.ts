import { describe, it, expect } from 'vitest';
import {
  FrictionClassifier,
  type FrictionClassifierInput,
} from './friction-classifier.js';

describe('FrictionClassifier', () => {
  const classifier = new FrictionClassifier();

  it('classifies process friction when quorum and remediation cycles are high', () => {
    const input: FrictionClassifierInput = {
      trackId: 'track_test_1',
      notes: [
        {
          note_type: 'quorum',
          content: 'Quorum rejected due to reviewer prompt drift on invariant verification',
          severity: 'warning',
          track_id: 'track_test_1',
        },
        {
          note_type: 'warning',
          content: 'Remediation loop cycle 2 timed out waiting for adversarial reviewer',
          severity: 'critical',
          track_id: 'track_test_1',
        },
      ],
      cycleMetrics: {
        remediationCycles: 3,
      },
      errorCount: 2,
    };

    const result = classifier.classify(input);

    expect(result.dominantCategory).toBe('process');
    expect(result.overallFrictionLevel).toBe('high');
    expect(result.primaryProposalCandidate).toBeDefined();
    expect(result.primaryProposalCandidate?.category).toBe('process');
    expect(result.primaryProposalCandidate?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.primaryProposalCandidate?.metrics.remediationCycles).toBe(3);
  });

  it('classifies codebase friction when notes describe tech debt and legacy patterns', () => {
    const input: FrictionClassifierInput = {
      trackId: 'track_test_2',
      notes: [
        {
          note_type: 'warning',
          content: 'Legacy SQLite connection leak discovered in touched file src/db/connector.ts',
          severity: 'warning',
          files: ['src/db/connector.ts'],
          track_id: 'track_test_2',
        },
        {
          note_type: 'warning',
          content: 'Missing unit test coverage for src/db/connector.ts and deprecated pool usage',
          severity: 'warning',
          files: ['src/db/connector.ts'],
          track_id: 'track_test_2',
        },
      ],
      touchedFiles: ['src/db/connector.ts'],
      cycleMetrics: {
        remediationCycles: 0,
      },
      errorCount: 1,
    };

    const result = classifier.classify(input);

    expect(result.dominantCategory).toBe('codebase');
    expect(result.primaryProposalCandidate).toBeDefined();
    expect(result.primaryProposalCandidate?.category).toBe('codebase');
    expect(result.primaryProposalCandidate?.affectedFiles).toContain('src/db/connector.ts');
    expect(result.primaryProposalCandidate?.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('computes low confidence (< 0.7) for isolated, low-severity transient note', () => {
    const input: FrictionClassifierInput = {
      trackId: 'track_test_3',
      notes: [
        {
          note_type: 'procedure',
          content: 'Normal task execution step completed cleanly',
          severity: 'info',
          track_id: 'track_test_3',
        },
      ],
      cycleMetrics: {
        remediationCycles: 0,
      },
      errorCount: 0,
    };

    const result = classifier.classify(input);

    expect(result.overallFrictionLevel).toBe('low');
    if (result.primaryProposalCandidate) {
      expect(result.primaryProposalCandidate.confidence).toBeLessThan(0.7);
    }
  });

  it('clusters both process and codebase friction when multiple issues exist', () => {
    const input: FrictionClassifierInput = {
      trackId: 'track_test_4',
      notes: [
        {
          note_type: 'quorum',
          content: 'Reviewer disagreement on AST preflight gate',
          severity: 'warning',
          track_id: 'track_test_4',
        },
        {
          note_type: 'warning',
          content: 'Found deprecated method calls in src/utils/format.ts',
          severity: 'info',
          files: ['src/utils/format.ts'],
          track_id: 'track_test_4',
        },
      ],
      cycleMetrics: {
        remediationCycles: 2,
      },
      errorCount: 1,
    };

    const result = classifier.classify(input);

    expect(result.clusters.length).toBeGreaterThanOrEqual(1);
    const categories = result.clusters.map((c) => c.category);
    expect(categories).toContain('process');
  });
});
