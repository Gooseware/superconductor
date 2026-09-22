import { PhaseStateStore } from './phase-state-store.js';
import {
  PhaseTransitionService,
  type AdvanceWindowResult,
  type SwitchActivePhaseResult,
} from './phase-transition-service.js';
import type { PhaseItem, RegistryManifest } from './phase-manifest.js';

export interface ActivePhaseInfo {
  phase: PhaseItem | undefined;
  completionPercentage: number;
  ordinal?: number;
}

/**
 * PhaseManager is the primary high-level facade for managing track phases,
 * sliding-window progression, and phase transitions in Superconductor.
 *
 * It satisfies Acceptance Criteria AC-3 by integrating PhaseStateStore
 * and PhaseTransitionService behind a clean, concurrency-guarded API.
 */
export class PhaseManager {
  private readonly projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Parses and returns all phases and member tracks from superconductor/tracks.md.
   */
  public static async parsePhases(projectRoot?: string): Promise<RegistryManifest> {
    const root = projectRoot || process.cwd();
    return await PhaseStateStore.load(root);
  }

  /**
   * Resolves the current active Phase 1 and its completion percentage.
   */
  public static async getActivePhase(projectRoot?: string): Promise<ActivePhaseInfo> {
    const root = projectRoot || process.cwd();
    const manifest = await PhaseStateStore.load(root);
    const phase = PhaseTransitionService.getActivePhase(manifest);

    if (!phase) {
      return {
        phase: undefined,
        completionPercentage: 0,
        ordinal: undefined,
      };
    }

    const completionPercentage = PhaseTransitionService.getPhaseCompletionPercentage(phase);
    const ordinal = PhaseTransitionService.getDisplayOrdinal(phase.phaseId, manifest) ?? phase.ordinal ?? 1;

    return {
      phase,
      completionPercentage,
      ordinal,
    };
  }

  /**
   * Resolves a human-friendly phase identifier (phaseId, numeric ordinal, or name)
   * to a canonical phaseId within the given manifest.
   */
  public static resolvePhaseIdentifier(
    manifest: RegistryManifest,
    identifier: string
  ): string {
    if (!identifier || !manifest || !Array.isArray(manifest.phases)) {
      return identifier;
    }

    const trimmed = identifier.trim();

    // 1. Exact match with phaseId
    const exactMatch = manifest.phases.find((p) => p.phaseId === trimmed);
    if (exactMatch) return exactMatch.phaseId;

    // 2. Case-insensitive match with phaseId
    const lowerMatch = manifest.phases.find(
      (p) => p.phaseId.toLowerCase() === trimmed.toLowerCase()
    );
    if (lowerMatch) return lowerMatch.phaseId;

    // 3. Numeric or "Phase <N>" ordinal match
    const ordinalMatch = trimmed.match(/^(?:phase[\s-_]*)?(\d+)$/i);
    if (ordinalMatch) {
      const num = parseInt(ordinalMatch[1], 10);
      // Dynamic display ordinal first
      const byDisplayOrdinal = manifest.phases.find(
        (p) => PhaseTransitionService.getDisplayOrdinal(p.phaseId, manifest) === num
      );
      if (byDisplayOrdinal) return byDisplayOrdinal.phaseId;

      // Fallback to static stored ordinal
      const byStaticOrdinal = manifest.phases.find((p) => p.ordinal === num);
      if (byStaticOrdinal) return byStaticOrdinal.phaseId;
    }

    // 4. Name match (case-insensitive)
    const byName = manifest.phases.find(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (byName) return byName.phaseId;

    return trimmed;
  }

  /**
   * Atomically switches the active phase to the specified target phase.
   * Target can be a symbolic phaseId, numeric ordinal, or phase name.
   */
  public static async switchPhase(
    projectRoot: string,
    phaseIdentifier: string
  ): Promise<SwitchActivePhaseResult> {
    const root = projectRoot || process.cwd();
    return await PhaseStateStore.mutate(root, (manifest) => {
      const targetPhaseId = this.resolvePhaseIdentifier(manifest, phaseIdentifier);
      return PhaseTransitionService.switchActivePhase(manifest, targetPhaseId);
    });
  }

  /**
   * Automatically advances the sliding window if current Phase 1 is 100% complete.
   */
  public static async advance(projectRoot?: string): Promise<AdvanceWindowResult> {
    const root = projectRoot || process.cwd();
    return await PhaseStateStore.mutate(root, (manifest) => {
      return PhaseTransitionService.advanceWindow(manifest);
    });
  }

  // Instance method delegates
  public async parsePhases(): Promise<RegistryManifest> {
    return PhaseManager.parsePhases(this.projectRoot);
  }

  public async getActivePhase(): Promise<ActivePhaseInfo> {
    return PhaseManager.getActivePhase(this.projectRoot);
  }

  public async switchPhase(phaseIdentifier: string): Promise<SwitchActivePhaseResult> {
    return PhaseManager.switchPhase(this.projectRoot, phaseIdentifier);
  }

  public async advance(): Promise<AdvanceWindowResult> {
    return PhaseManager.advance(this.projectRoot);
  }
}
