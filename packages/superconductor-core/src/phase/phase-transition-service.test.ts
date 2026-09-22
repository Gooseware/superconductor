import { describe, it, expect } from 'vitest';
import {
  PhaseTransitionService,
  evaluatePhaseCompletion,
  advanceWindow,
  getDisplayOrdinal,
  switchActivePhase,
  validatePhaseDependencies,
  getActivePhase,
  getPhaseCompletionPercentage,
  canAdvanceWindow,
} from './phase-transition-service.js';
import type { PhaseItem, RegistryManifest } from './phase-manifest.js';

describe('PhaseTransitionService', () => {
  const createPhase = (
    phaseId: string,
    name: string,
    status: PhaseItem['status'],
    trackStatuses: ('completed' | 'in_progress' | 'planned')[],
    ordinal?: number
  ): PhaseItem => ({
    phaseId,
    name,
    status,
    ordinal,
    tracks: trackStatuses.map((st, idx) => ({
      trackId: `${phaseId}_track_${idx + 1}`,
      title: `Track ${idx + 1} for ${name}`,
      status: st,
    })),
  });

  describe('evaluatePhaseCompletion', () => {
    it('returns true when all tracks are completed and tracks array is non-empty', () => {
      const phase = createPhase('core', 'Core', 'active', ['completed', 'completed']);
      expect(evaluatePhaseCompletion(phase)).toBe(true);
      expect(PhaseTransitionService.evaluatePhaseCompletion(phase)).toBe(true);
    });

    it('returns false when tracks array is empty', () => {
      const phase: PhaseItem = {
        phaseId: 'empty',
        name: 'Empty Phase',
        status: 'active',
        tracks: [],
      };
      expect(evaluatePhaseCompletion(phase)).toBe(false);
    });

    it('returns false when any track is in_progress', () => {
      const phase = createPhase('core', 'Core', 'active', ['completed', 'in_progress']);
      expect(evaluatePhaseCompletion(phase)).toBe(false);
    });

    it('returns false when any track is planned', () => {
      const phase = createPhase('core', 'Core', 'active', ['completed', 'planned']);
      expect(evaluatePhaseCompletion(phase)).toBe(false);
    });

    it('returns false for null, undefined, or malformed phase objects', () => {
      expect(evaluatePhaseCompletion(null as unknown as PhaseItem)).toBe(false);
      expect(evaluatePhaseCompletion(undefined as unknown as PhaseItem)).toBe(false);
      expect(evaluatePhaseCompletion({} as unknown as PhaseItem)).toBe(false);
    });
  });

  describe('getPhaseCompletionPercentage and getActivePhase', () => {
    it('calculates completion percentage correctly', () => {
      expect(getPhaseCompletionPercentage(createPhase('p1', 'P1', 'active', []))).toBe(0);
      expect(
        getPhaseCompletionPercentage(createPhase('p1', 'P1', 'active', ['completed', 'planned']))
      ).toBe(50);
      expect(
        getPhaseCompletionPercentage(
          createPhase('p1', 'P1', 'active', ['completed', 'completed', 'in_progress'])
        )
      ).toBe(67);
      expect(
        getPhaseCompletionPercentage(
          createPhase('p1', 'P1', 'active', ['completed', 'completed', 'completed'])
        )
      ).toBe(100);
    });

    it('retrieves active phase or undefined if none active', () => {
      const p1 = createPhase('p1', 'P1', 'active', ['completed']);
      const p2 = createPhase('p2', 'P2', 'planned', ['planned']);
      const manifest: RegistryManifest = { phases: [p1, p2] };

      expect(getActivePhase(manifest)?.phaseId).toBe('p1');
      expect(canAdvanceWindow(manifest)).toBe(true);

      const manifestNoActive: RegistryManifest = {
        phases: [createPhase('p1', 'P1', 'completed', ['completed'])],
      };
      expect(getActivePhase(manifestNoActive)).toBeUndefined();
      expect(canAdvanceWindow(manifestNoActive)).toBe(false);
    });
  });

  describe('advanceWindow', () => {
    it('advances window when active phase is 100% complete and updates ordinals', () => {
      const p1 = createPhase('core', 'Core Foundation', 'active', ['completed', 'completed'], 1);
      const p2 = createPhase('ux', 'UX & Polish', 'planned', ['planned', 'planned'], 2);
      const p3 = createPhase('docs', 'Documentation', 'planned', ['planned'], 3);

      const manifest: RegistryManifest = { phases: [p1, p2, p3] };

      const result = advanceWindow(manifest);

      expect(result.advanced).toBe(true);
      expect(result.completedPhase?.phaseId).toBe('core');
      expect(result.completedPhase?.status).toBe('completed');
      expect(result.completedPhase?.ordinal).toBeUndefined();

      expect(result.nextActivePhase?.phaseId).toBe('ux');
      expect(result.nextActivePhase?.status).toBe('active');
      expect(result.nextActivePhase?.ordinal).toBe(1);

      // Verify updated manifest state
      const updatedPhases = result.manifest.phases;
      expect(updatedPhases[0].status).toBe('completed');
      expect(updatedPhases[0].ordinal).toBeUndefined();

      expect(updatedPhases[1].status).toBe('active');
      expect(updatedPhases[1].ordinal).toBe(1);

      expect(updatedPhases[2].status).toBe('planned');
      expect(updatedPhases[2].ordinal).toBe(2);

      // Verify immutability: original manifest was not mutated
      expect(manifest.phases[0].status).toBe('active');
      expect(manifest.phases[0].ordinal).toBe(1);
      expect(manifest.phases[1].status).toBe('planned');
      expect(manifest.phases[1].ordinal).toBe(2);
    });

    it('advances sequentially through multiple phases', () => {
      const p1 = createPhase('p1', 'Phase 1', 'active', ['completed'], 1);
      const p2 = createPhase('p2', 'Phase 2', 'planned', ['completed'], 2);
      const p3 = createPhase('p3', 'Phase 3', 'planned', ['planned'], 3);

      const m1: RegistryManifest = { phases: [p1, p2, p3] };

      // Advance from p1 to p2
      const res1 = advanceWindow(m1);
      expect(res1.advanced).toBe(true);
      expect(res1.completedPhase?.phaseId).toBe('p1');
      expect(res1.nextActivePhase?.phaseId).toBe('p2');
      expect(res1.nextActivePhase?.ordinal).toBe(1);

      // Advance from p2 to p3
      const res2 = advanceWindow(res1.manifest);
      expect(res2.advanced).toBe(true);
      expect(res2.completedPhase?.phaseId).toBe('p2');
      expect(res2.nextActivePhase?.phaseId).toBe('p3');
      expect(res2.nextActivePhase?.ordinal).toBe(1);

      expect(res2.manifest.phases[0].status).toBe('completed');
      expect(res2.manifest.phases[0].ordinal).toBeUndefined();
      expect(res2.manifest.phases[1].status).toBe('completed');
      expect(res2.manifest.phases[1].ordinal).toBeUndefined();
      expect(res2.manifest.phases[2].status).toBe('active');
      expect(res2.manifest.phases[2].ordinal).toBe(1);
    });

    it('does not advance when active phase tracks are not all complete', () => {
      const p1 = createPhase('core', 'Core', 'active', ['completed', 'in_progress'], 1);
      const p2 = createPhase('ux', 'UX', 'planned', ['planned'], 2);

      const manifest: RegistryManifest = { phases: [p1, p2] };
      const result = advanceWindow(manifest);

      expect(result.advanced).toBe(false);
      expect(result.completedPhase).toBeUndefined();
      expect(result.nextActivePhase).toBeUndefined();
      expect(result.manifest).toBe(manifest);
    });

    it('does not advance when active phase has 0 tracks', () => {
      const p1: PhaseItem = { phaseId: 'core', name: 'Core', status: 'active', tracks: [] };
      const p2 = createPhase('ux', 'UX', 'planned', ['planned'], 2);

      const manifest: RegistryManifest = { phases: [p1, p2] };
      const result = advanceWindow(manifest);

      expect(result.advanced).toBe(false);
    });

    it('does not advance when no active phase exists', () => {
      const p1 = createPhase('core', 'Core', 'completed', ['completed']);
      const p2 = createPhase('ux', 'UX', 'planned', ['planned']);

      const manifest: RegistryManifest = { phases: [p1, p2] };
      const result = advanceWindow(manifest);

      expect(result.advanced).toBe(false);
    });

    it('handles completing the final phase in the manifest', () => {
      const p1 = createPhase('final', 'Final Phase', 'active', ['completed'], 1);
      const manifest: RegistryManifest = { phases: [p1] };

      const result = advanceWindow(manifest);

      expect(result.advanced).toBe(true);
      expect(result.completedPhase?.phaseId).toBe('final');
      expect(result.completedPhase?.status).toBe('completed');
      expect(result.completedPhase?.ordinal).toBeUndefined();
      expect(result.nextActivePhase).toBeUndefined();
      expect(result.manifest.phases[0].status).toBe('completed');
      expect(result.manifest.phases[0].ordinal).toBeUndefined();
    });
  });

  describe('getDisplayOrdinal', () => {
    it('returns 1 for active phase and 2, 3... for subsequent planned phases', () => {
      const manifest: RegistryManifest = {
        phases: [
          createPhase('p1', 'P1', 'completed', ['completed']),
          createPhase('p2', 'P2', 'active', ['completed']),
          createPhase('p3', 'P3', 'planned', ['planned']),
          createPhase('p4', 'P4', 'planned', ['planned']),
        ],
      };

      expect(getDisplayOrdinal('p1', manifest)).toBeUndefined();
      expect(getDisplayOrdinal('p2', manifest)).toBe(1);
      expect(getDisplayOrdinal('p3', manifest)).toBe(2);
      expect(getDisplayOrdinal('p4', manifest)).toBe(3);
    });

    it('returns undefined for completed phases', () => {
      const manifest: RegistryManifest = {
        phases: [
          createPhase('p1', 'P1', 'completed', ['completed']),
          createPhase('p2', 'P2', 'completed', ['completed']),
          createPhase('p3', 'P3', 'active', ['planned']),
        ],
      };

      expect(getDisplayOrdinal('p1', manifest)).toBeUndefined();
      expect(getDisplayOrdinal('p2', manifest)).toBeUndefined();
      expect(getDisplayOrdinal('p3', manifest)).toBe(1);
    });

    it('returns undefined for non-existent phaseId', () => {
      const manifest: RegistryManifest = {
        phases: [createPhase('p1', 'P1', 'active', ['planned'])],
      };

      expect(getDisplayOrdinal('non-existent', manifest)).toBeUndefined();
      expect(getDisplayOrdinal('', manifest)).toBeUndefined();
    });

    it('returns undefined for planned phase before active phase', () => {
      const manifest: RegistryManifest = {
        phases: [
          createPhase('p1', 'P1', 'planned', ['planned']),
          createPhase('p2', 'P2', 'active', ['planned']),
          createPhase('p3', 'P3', 'planned', ['planned']),
        ],
      };

      expect(getDisplayOrdinal('p1', manifest)).toBeUndefined();
      expect(getDisplayOrdinal('p2', manifest)).toBe(1);
      expect(getDisplayOrdinal('p3', manifest)).toBe(2);
    });

    it('provides sequential fallback ordinals when no active phase is set', () => {
      const manifest: RegistryManifest = {
        phases: [
          createPhase('p1', 'P1', 'completed', ['completed']),
          createPhase('p2', 'P2', 'planned', ['planned']),
          createPhase('p3', 'P3', 'planned', ['planned']),
        ],
      };

      expect(getDisplayOrdinal('p1', manifest)).toBeUndefined();
      expect(getDisplayOrdinal('p2', manifest)).toBe(1);
      expect(getDisplayOrdinal('p3', manifest)).toBe(2);
    });
  });

  describe('switchActivePhase', () => {
    it('switches active phase to target phase and marks previous active as planned', () => {
      const manifest: RegistryManifest = {
        phases: [
          createPhase('p1', 'P1', 'active', ['completed'], 1),
          createPhase('p2', 'P2', 'planned', ['planned'], 2),
          createPhase('p3', 'P3', 'planned', ['planned'], 3),
        ],
      };

      const result = switchActivePhase(manifest, 'p2');

      expect(result.previousPhaseId).toBe('p1');
      expect(result.newPhaseId).toBe('p2');

      const phases = result.manifest.phases;
      expect(phases[0].status).toBe('planned');
      expect(phases[0].ordinal).toBe(1); // retained addressability/ordinal for planned phase prior to active
      expect(phases[1].status).toBe('active');
      expect(phases[1].ordinal).toBe(1);
      expect(phases[2].status).toBe('planned');
      expect(phases[2].ordinal).toBe(2);

      // Verify original manifest was not mutated
      expect(manifest.phases[0].status).toBe('active');
    });

    it('sets ordinal = undefined for completed phases prior to active but retains ordinal for planned phases', () => {
      const manifest: RegistryManifest = {
        phases: [
          createPhase('p0', 'P0', 'completed', ['completed']),
          createPhase('p1', 'P1', 'planned', ['planned']),
          createPhase('p2', 'P2', 'planned', ['planned']),
        ],
      };

      const result = switchActivePhase(manifest, 'p2');
      expect(result.manifest.phases[0].status).toBe('completed');
      expect(result.manifest.phases[0].ordinal).toBeUndefined(); // completed phase gets undefined
      expect(result.manifest.phases[1].status).toBe('planned');
      expect(result.manifest.phases[1].ordinal).toBe(2); // planned phase prior to active retains/gets ordinal
      expect(result.manifest.phases[2].status).toBe('active');
      expect(result.manifest.phases[2].ordinal).toBe(1);
    });

    it('switches safely when no previous phase was active', () => {
      const manifest: RegistryManifest = {
        phases: [
          createPhase('p1', 'P1', 'planned', ['planned']),
          createPhase('p2', 'P2', 'planned', ['planned']),
        ],
      };

      const result = switchActivePhase(manifest, 'p1');
      expect(result.previousPhaseId).toBeUndefined();
      expect(result.newPhaseId).toBe('p1');
      expect(result.manifest.phases[0].status).toBe('active');
      expect(result.manifest.phases[0].ordinal).toBe(1);
      expect(result.manifest.phases[1].status).toBe('planned');
      expect(result.manifest.phases[1].ordinal).toBe(2);
    });

    it('is idempotent when switching to already active phase', () => {
      const manifest: RegistryManifest = {
        phases: [createPhase('p1', 'P1', 'active', ['planned'], 1)],
      };

      const result = switchActivePhase(manifest, 'p1');
      expect(result.previousPhaseId).toBe('p1');
      expect(result.newPhaseId).toBe('p1');
      expect(result.manifest.phases[0].status).toBe('active');
      expect(result.manifest.phases[0].ordinal).toBe(1);
    });

    it('throws when target phase is not found', () => {
      const manifest: RegistryManifest = {
        phases: [createPhase('p1', 'P1', 'active', ['planned'])],
      };

      expect(() => switchActivePhase(manifest, 'missing-phase')).toThrow(
        /Phase 'missing-phase' not found/
      );
    });

    it('throws when target phase is already completed', () => {
      const manifest: RegistryManifest = {
        phases: [
          createPhase('p1', 'P1', 'completed', ['completed']),
          createPhase('p2', 'P2', 'active', ['planned']),
        ],
      };

      expect(() => switchActivePhase(manifest, 'p1')).toThrow(
        /Cannot switch to phase 'p1' because it is already completed/
      );
    });
  });

  describe('validatePhaseDependencies', () => {
    const manifest: RegistryManifest = {
      phases: [
        {
          phaseId: 'phase-1',
          name: 'Phase 1: Foundation',
          status: 'active',
          tracks: [
            { trackId: 't1_a', title: 'T1 A', status: 'completed' },
            { trackId: 't1_b', title: 'T1 B', status: 'completed' },
          ],
        },
        {
          phaseId: 'phase-2',
          name: 'Phase 2: Core Engine',
          status: 'planned',
          tracks: [
            { trackId: 't2_a', title: 'T2 A', status: 'planned' },
            { trackId: 't2_b', title: 'T2 B', status: 'planned' },
          ],
        },
        {
          phaseId: 'phase-3',
          name: 'Phase 3: Delivery',
          status: 'planned',
          tracks: [{ trackId: 't3_a', title: 'T3 A', status: 'planned' }],
        },
      ],
    };

    it('returns valid: true for intra-phase and backward dependencies', () => {
      const dependencies: Record<string, string[]> = {
        t1_b: ['t1_a'], // intra-phase (both phase 1)
        t2_a: ['t1_b'], // backward (phase 2 -> phase 1)
        t3_a: ['t2_a', 't1_a'], // backward (phase 3 -> phase 2, 1)
      };

      const result = validatePhaseDependencies(manifest, dependencies);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('ignores external dependencies not belonging to any phase', () => {
      const dependencies: Record<string, string[]> = {
        t1_a: ['external_system_prereq'],
        t2_a: ['legacy_track_archive'],
      };

      const result = validatePhaseDependencies(manifest, dependencies);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns valid: false when an earlier phase depends on a later phase (forward dependency)', () => {
      const dependencies: Record<string, string[]> = {
        t1_a: ['t2_a'], // forward: Phase 1 depends on Phase 2
      };

      const result = validatePhaseDependencies(manifest, dependencies);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(
        /Forward phase dependency: track 't1_a' in phase 'phase-1' \(phase 1\) cannot depend on track 't2_a' in later phase 'phase-2' \(phase 2\)/
      );
    });

    it('reports multiple forward dependencies across phases', () => {
      const dependencies: Record<string, string[]> = {
        t1_a: ['t2_a'],
        t1_b: ['t3_a'],
      };

      const result = validatePhaseDependencies(manifest, dependencies);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('detects circular dependencies among tracks', () => {
      const dependencies: Record<string, string[]> = {
        t1_a: ['t1_b'],
        t1_b: ['t1_a'],
      };

      const result = validatePhaseDependencies(manifest, dependencies);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Circular dependency detected'))).toBe(true);
    });

    it('detects self-dependency cycles', () => {
      const dependencies: Record<string, string[]> = {
        t1_a: ['t1_a'],
      };

      const result = validatePhaseDependencies(manifest, dependencies);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Circular dependency detected: t1_a -> t1_a');
    });

    it('detects multi-hop transitive cycles', () => {
      const dependencies: Record<string, string[]> = {
        t1_a: ['t1_b'],
        t1_b: ['t2_a'],
        t2_a: ['t1_a'],
      };

      const result = validatePhaseDependencies(manifest, dependencies);
      expect(result.valid).toBe(false);
      // Both forward dependency (t1_b -> t2_a) and circular dependency are reported
      expect(result.errors.some((e) => e.includes('Forward phase dependency'))).toBe(true);
      expect(result.errors.some((e) => e.includes('Circular dependency detected'))).toBe(true);
    });

    it('handles diamond dependencies without false positive cycles', () => {
      const diamondManifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'p1',
            name: 'P1',
            status: 'active',
            tracks: [
              { trackId: 'a', title: 'A', status: 'planned' },
              { trackId: 'b', title: 'B', status: 'planned' },
              { trackId: 'c', title: 'C', status: 'planned' },
              { trackId: 'd', title: 'D', status: 'planned' },
            ],
          },
        ],
      };

      const dependencies: Record<string, string[]> = {
        a: ['b', 'c'],
        b: ['d'],
        c: ['d'],
        d: [],
      };

      const result = validatePhaseDependencies(diamondManifest, dependencies);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns valid: true for empty manifest or dependencies', () => {
      expect(validatePhaseDependencies({ phases: [] }, {})).toEqual({ valid: true, errors: [] });
      expect(
        validatePhaseDependencies(
          null as unknown as RegistryManifest,
          null as unknown as Record<string, string[]>
        )
      ).toEqual({ valid: true, errors: [] });
    });
  });

  describe('Service instance method delegation', () => {
    it('supports instantiation and instance method calls', () => {
      const service = new PhaseTransitionService();
      const p1 = createPhase('core', 'Core', 'active', ['completed']);
      const manifest: RegistryManifest = { phases: [p1] };

      expect(service.evaluatePhaseCompletion(p1)).toBe(true);
      expect(service.getActivePhase(manifest)?.phaseId).toBe('core');
      expect(service.getPhaseCompletionPercentage(p1)).toBe(100);
      expect(service.canAdvanceWindow(manifest)).toBe(true);
      expect(service.getDisplayOrdinal('core', manifest)).toBe(1);

      const advanced = service.advanceWindow(manifest);
      expect(advanced.advanced).toBe(true);

      const switched = service.switchActivePhase(
        { phases: [createPhase('p1', 'P1', 'planned', ['planned'])] },
        'p1'
      );
      expect(switched.newPhaseId).toBe('p1');

      const validated = service.validatePhaseDependencies(manifest, {});
      expect(validated.valid).toBe(true);
    });
  });
});
