import type { PhaseItem, RegistryManifest } from './phase-manifest.js';

export interface AdvanceWindowResult {
  manifest: RegistryManifest;
  advanced: boolean;
  completedPhase?: PhaseItem;
  nextActivePhase?: PhaseItem;
}

export interface SwitchActivePhaseResult {
  manifest: RegistryManifest;
  previousPhaseId?: string;
  newPhaseId: string;
}

export interface PhaseDependencyValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * PhaseTransitionService orchestrates sliding-window phase state transitions,
 * completion evaluation, dynamic runtime ordinal computation, and cross-phase
 * dependency validation.
 */
export class PhaseTransitionService {
  /**
   * Returns true if and only if phase has at least one track and all tracks have status 'completed'.
   * Returns false if phase has no tracks or any track is 'planned' or 'in_progress'.
   */
  public static evaluatePhaseCompletion(phase: PhaseItem): boolean {
    if (!phase || !Array.isArray(phase.tracks) || phase.tracks.length === 0) {
      return false;
    }
    return phase.tracks.every((track) => track.status === 'completed');
  }

  /**
   * Resolves the current active phase from the manifest, if any.
   */
  public static getActivePhase(manifest: RegistryManifest): PhaseItem | undefined {
    if (!manifest || !Array.isArray(manifest.phases)) {
      return undefined;
    }
    return manifest.phases.find((p) => p.status === 'active');
  }

  /**
   * Calculates the completion percentage of a phase (0 to 100).
   */
  public static getPhaseCompletionPercentage(phase: PhaseItem): number {
    if (!phase || !Array.isArray(phase.tracks) || phase.tracks.length === 0) {
      return 0;
    }
    const completed = phase.tracks.filter((t) => t.status === 'completed').length;
    return Math.round((completed / phase.tracks.length) * 100);
  }

  /**
   * Checks whether the current sliding-window can advance.
   */
  public static canAdvanceWindow(manifest: RegistryManifest): boolean {
    const active = this.getActivePhase(manifest);
    if (!active) return false;
    return this.evaluatePhaseCompletion(active);
  }

  /**
   * Calculates the dynamic runtime ordinal for a given phase ID:
   * - Active phase is always Phase 1.
   * - Subsequent planned/pending phases are numbered sequentially (Phase 2, Phase 3...).
   * - Completed phases return undefined.
   * - Unknown phase returns undefined.
   */
  public static getDisplayOrdinal(
    phaseId: string,
    manifest: RegistryManifest
  ): number | undefined {
    if (!phaseId || !manifest || !Array.isArray(manifest.phases)) {
      return undefined;
    }

    const targetIdx = manifest.phases.findIndex((p) => p.phaseId === phaseId);
    if (targetIdx === -1) {
      return undefined;
    }

    const targetPhase = manifest.phases[targetIdx];
    if (targetPhase.status === 'completed') {
      return undefined;
    }

    const activeIdx = manifest.phases.findIndex((p) => p.status === 'active');
    if (activeIdx !== -1) {
      if (targetIdx === activeIdx) {
        return 1;
      }
      if (targetIdx > activeIdx) {
        let ordinal = 1;
        for (let i = activeIdx + 1; i <= targetIdx; i++) {
          if (manifest.phases[i].status !== 'completed') {
            ordinal++;
          }
        }
        return ordinal;
      }
      // Target phase is before activeIdx and not completed
      return undefined;
    }

    // Fallback if no phase is currently marked active:
    // Sequential counting of uncompleted phases
    let count = 0;
    for (let i = 0; i <= targetIdx; i++) {
      if (manifest.phases[i].status !== 'completed') {
        count++;
      }
    }
    return count > 0 ? count : undefined;
  }

  /**
   * Advances the sliding window if the current active phase is 100% complete.
   * - Marks completed phase's status as 'completed'.
   * - Transitions the next planned phase to 'active'.
   * - Dynamically computes/assigns runtime ordinals:
   *     - New active phase: ordinal = 1
   *     - Subsequent planned phases: ordinal = 2, 3...
   *     - Completed phases: ordinal = undefined
   */
  public static advanceWindow(manifest: RegistryManifest): AdvanceWindowResult {
    if (!manifest || !Array.isArray(manifest.phases)) {
      return { manifest, advanced: false };
    }

    const activeIdx = manifest.phases.findIndex((p) => p.status === 'active');
    if (activeIdx === -1) {
      return { manifest, advanced: false };
    }

    const currentActive = manifest.phases[activeIdx];
    if (!this.evaluatePhaseCompletion(currentActive)) {
      return { manifest, advanced: false };
    }

    // Deep clone the manifest to preserve immutability
    const updatedManifest: RegistryManifest = {
      ...manifest,
      phases: manifest.phases.map((p) => ({
        ...p,
        tracks: p.tracks.map((t) => ({ ...t })),
      })),
      absorbed: manifest.absorbed ? manifest.absorbed.map((a) => ({ ...a })) : undefined,
      archived: manifest.archived ? [...manifest.archived] : undefined,
    };

    const completedPhase = updatedManifest.phases[activeIdx];
    completedPhase.status = 'completed';
    completedPhase.ordinal = undefined;

    // Find the next planned phase after activeIdx, or any planned phase if none after
    const nextIdx = updatedManifest.phases.findIndex(
      (p, idx) => idx > activeIdx && p.status === 'planned'
    );

    let nextActivePhase: PhaseItem | undefined;
    if (nextIdx !== -1) {
      nextActivePhase = updatedManifest.phases[nextIdx];
      nextActivePhase.status = 'active';
    } else {
      const fallbackIdx = updatedManifest.phases.findIndex((p) => p.status === 'planned');
      if (fallbackIdx !== -1) {
        nextActivePhase = updatedManifest.phases[fallbackIdx];
        nextActivePhase.status = 'active';
      }
    }

    // Reassign runtime ordinals across all phases
    this.reassignOrdinals(updatedManifest.phases);

    return {
      manifest: updatedManifest,
      advanced: true,
      completedPhase,
      nextActivePhase,
    };
  }

  /**
   * Safely switches the active phase:
   * - Marks previously active phase as 'planned'
   * - Sets targetPhaseId as 'active'
   * - Throws if targetPhaseId is not found or already 'completed'
   * - Reassigns runtime ordinals
   */
  public static switchActivePhase(
    manifest: RegistryManifest,
    targetPhaseId: string
  ): SwitchActivePhaseResult {
    if (!manifest || !Array.isArray(manifest.phases)) {
      throw new Error(`Manifest contains no phases`);
    }

    const targetPhase = manifest.phases.find((p) => p.phaseId === targetPhaseId);
    if (!targetPhase) {
      throw new Error(`Phase '${targetPhaseId}' not found in manifest`);
    }
    if (targetPhase.status === 'completed') {
      throw new Error(`Cannot switch to phase '${targetPhaseId}' because it is already completed`);
    }

    const updatedManifest: RegistryManifest = {
      ...manifest,
      phases: manifest.phases.map((p) => ({
        ...p,
        tracks: p.tracks.map((t) => ({ ...t })),
      })),
      absorbed: manifest.absorbed ? manifest.absorbed.map((a) => ({ ...a })) : undefined,
      archived: manifest.archived ? [...manifest.archived] : undefined,
    };

    let previousPhaseId: string | undefined;

    for (const phase of updatedManifest.phases) {
      if (phase.status === 'active') {
        previousPhaseId = phase.phaseId;
        if (phase.phaseId !== targetPhaseId) {
          phase.status = 'planned';
        }
      }
    }

    const updatedTarget = updatedManifest.phases.find((p) => p.phaseId === targetPhaseId)!;
    updatedTarget.status = 'active';

    this.reassignOrdinals(updatedManifest.phases);

    return {
      manifest: updatedManifest,
      previousPhaseId,
      newPhaseId: targetPhaseId,
    };
  }

  /**
   * Validates cross-phase dependencies:
   * - Ensures no track in an earlier phase depends on a track in a later phase (forward dependency).
   * - Detects circular dependencies among tracks.
   */
  public static validatePhaseDependencies(
    manifest: RegistryManifest,
    trackDependencies: Record<string, string[]>
  ): PhaseDependencyValidationResult {
    const errors: string[] = [];

    if (!manifest || !Array.isArray(manifest.phases) || !trackDependencies) {
      return { valid: true, errors: [] };
    }

    // Build trackId -> phase metadata mapping
    const trackToPhase = new Map<
      string,
      { phaseIndex: number; phaseId: string; phaseName: string }
    >();

    for (let pIdx = 0; pIdx < manifest.phases.length; pIdx++) {
      const phase = manifest.phases[pIdx];
      if (Array.isArray(phase.tracks)) {
        for (const track of phase.tracks) {
          if (track && track.trackId) {
            trackToPhase.set(track.trackId, {
              phaseIndex: pIdx,
              phaseId: phase.phaseId,
              phaseName: phase.name,
            });
          }
        }
      }
    }

    // 1. Check forward phase dependencies
    for (const [trackId, deps] of Object.entries(trackDependencies)) {
      if (!Array.isArray(deps)) continue;

      const sourceInfo = trackToPhase.get(trackId);
      if (!sourceInfo) continue;

      for (const depId of deps) {
        const depInfo = trackToPhase.get(depId);
        if (!depInfo) continue;

        if (sourceInfo.phaseIndex < depInfo.phaseIndex) {
          errors.push(
            `Forward phase dependency: track '${trackId}' in phase '${sourceInfo.phaseId}' (phase ${sourceInfo.phaseIndex + 1}) cannot depend on track '${depId}' in later phase '${depInfo.phaseId}' (phase ${depInfo.phaseIndex + 1})`
          );
        }
      }
    }

    // 2. Check circular dependencies
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const path: string[] = [];
    const reportedCycles = new Set<string>();

    function dfs(current: string) {
      visited.add(current);
      inStack.add(current);
      path.push(current);

      const deps = trackDependencies[current] || [];
      for (const dep of deps) {
        if (inStack.has(dep)) {
          const cycleStartIdx = path.indexOf(dep);
          const cycle = path.slice(cycleStartIdx).concat(dep);
          const cycleKey = cycle.join(' -> ');
          if (!reportedCycles.has(cycleKey)) {
            reportedCycles.add(cycleKey);
            errors.push(`Circular dependency detected: ${cycleKey}`);
          }
        } else if (!visited.has(dep)) {
          dfs(dep);
        }
      }

      path.pop();
      inStack.delete(current);
    }

    for (const node of Object.keys(trackDependencies)) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Internal helper: reassigns dynamic runtime ordinals based on active phase position.
   */
  private static reassignOrdinals(phases: PhaseItem[]): void {
    const activeIdx = phases.findIndex((p) => p.status === 'active');

    if (activeIdx !== -1) {
      // Completed phases before active get undefined.
      // Planned phases before active retain their ordinal/addressability.
      for (let i = 0; i < activeIdx; i++) {
        const p = phases[i];
        if (p.status === 'completed') {
          p.ordinal = undefined;
        } else if (p.ordinal === undefined) {
          p.ordinal = i + 1;
        }
      }

      // Active phase is ordinal 1
      phases[activeIdx].ordinal = 1;

      // Subsequent uncompleted phases get ordinal 2, 3...
      let nextOrd = 2;
      for (let i = activeIdx + 1; i < phases.length; i++) {
        const p = phases[i];
        if (p.status === 'completed') {
          p.ordinal = undefined;
        } else {
          p.ordinal = nextOrd++;
        }
      }
    } else {
      // If no phase is active, completed phases get undefined
      for (let i = 0; i < phases.length; i++) {
        const p = phases[i];
        if (p.status === 'completed') {
          p.ordinal = undefined;
        } else if (p.ordinal === undefined) {
          p.ordinal = i + 1;
        }
      }
    }
  }

  // Instance method delegates
  public evaluatePhaseCompletion(phase: PhaseItem): boolean {
    return PhaseTransitionService.evaluatePhaseCompletion(phase);
  }

  public getActivePhase(manifest: RegistryManifest): PhaseItem | undefined {
    return PhaseTransitionService.getActivePhase(manifest);
  }

  public getPhaseCompletionPercentage(phase: PhaseItem): number {
    return PhaseTransitionService.getPhaseCompletionPercentage(phase);
  }

  public canAdvanceWindow(manifest: RegistryManifest): boolean {
    return PhaseTransitionService.canAdvanceWindow(manifest);
  }

  public getDisplayOrdinal(phaseId: string, manifest: RegistryManifest): number | undefined {
    return PhaseTransitionService.getDisplayOrdinal(phaseId, manifest);
  }

  public advanceWindow(manifest: RegistryManifest): AdvanceWindowResult {
    return PhaseTransitionService.advanceWindow(manifest);
  }

  public switchActivePhase(
    manifest: RegistryManifest,
    targetPhaseId: string
  ): SwitchActivePhaseResult {
    return PhaseTransitionService.switchActivePhase(manifest, targetPhaseId);
  }

  public validatePhaseDependencies(
    manifest: RegistryManifest,
    trackDependencies: Record<string, string[]>
  ): PhaseDependencyValidationResult {
    return PhaseTransitionService.validatePhaseDependencies(manifest, trackDependencies);
  }
}

// Standalone function exports matching functional API
export const evaluatePhaseCompletion = PhaseTransitionService.evaluatePhaseCompletion.bind(PhaseTransitionService);
export const advanceWindow = PhaseTransitionService.advanceWindow.bind(PhaseTransitionService);
export const getDisplayOrdinal = PhaseTransitionService.getDisplayOrdinal.bind(PhaseTransitionService);
export const switchActivePhase = PhaseTransitionService.switchActivePhase.bind(PhaseTransitionService);
export const validatePhaseDependencies = PhaseTransitionService.validatePhaseDependencies.bind(PhaseTransitionService);
export const getActivePhase = PhaseTransitionService.getActivePhase.bind(PhaseTransitionService);
export const getPhaseCompletionPercentage = PhaseTransitionService.getPhaseCompletionPercentage.bind(PhaseTransitionService);
export const canAdvanceWindow = PhaseTransitionService.canAdvanceWindow.bind(PhaseTransitionService);
