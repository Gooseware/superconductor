import type { VitePreviewHarness } from './vite-harness.js';
import {
  type ProposalPatch,
  validateProposalPatch,
} from './surface-adapter.js';

export interface ProposalHistoryEntry {
  id: string;
  patch: ProposalPatch;
  appliedAt: string;
  aBState: 'current' | 'proposal';
  status: 'active' | 'reverted' | 'inactive';
  previousConfig?: {
    componentPath: string;
    mockProps?: Record<string, unknown>;
    patch?: ProposalPatch;
  };
}

export interface ProposalDiff {
  proposalId: string;
  targetFilePath: string;
  hasJsxReplacement: boolean;
  hasCssDelta: boolean;
  propsChanged: string[];
  cssDelta?: string;
  jsxReplacement?: string;
  injectedProps?: Record<string, unknown>;
  timestamp: string;
}

export interface ApplyProposalResult {
  activeProposalId: string;
  aBState: 'proposal';
}

/**
 * ProposalInjector manages live, in-DOM ephemeral proposal patches for the VitePreviewHarness.
 * Injects ephemeral JSX virtual modules and dynamic CSS delta into the preview without disk mutations.
 * Supports instant A/B toggling ('current' vs 'proposal'), full reversion, and diff/history tracking.
 */
export class ProposalInjector {
  private activeProposal: ProposalPatch | null = null;
  private aBState: 'current' | 'proposal' = 'current';
  private baseConfig: { componentPath: string; mockProps?: Record<string, unknown> } | null = null;
  private history: ProposalHistoryEntry[] = [];
  private diffs: Map<string, ProposalDiff> = new Map();

  constructor() {}

  /**
   * Applies an ephemeral proposal patch to the target component in the active Vite preview.
   * Modifies virtual entry code and triggers in-memory HMR without disk writes.
   */
  async applyProposal(
    harness: VitePreviewHarness,
    patch: ProposalPatch
  ): Promise<ApplyProposalResult> {
    const validatedPatch = validateProposalPatch(patch);

    const currentConfig = harness.getCurrentComponent();

    // Preserve baseline component configuration on first proposal application
    if (!this.baseConfig) {
      if (currentConfig) {
        this.baseConfig = {
          componentPath: currentConfig.componentPath,
          mockProps: { ...(currentConfig.mockProps || {}) },
        };
      } else {
        this.baseConfig = {
          componentPath: validatedPatch.targetFilePath,
          mockProps: {},
        };
      }
    }

    const targetPath =
      validatedPatch.targetFilePath ||
      currentConfig?.componentPath ||
      this.baseConfig.componentPath;
    const baseProps = currentConfig?.mockProps || this.baseConfig.mockProps || {};

    // Mark previous active proposal in history as inactive
    for (const entry of this.history) {
      if (entry.status === 'active') {
        entry.status = 'inactive';
      }
    }

    // In-memory virtual update via harness
    harness.setVirtualComponent(targetPath, baseProps, validatedPatch);

    // Track active state
    this.activeProposal = validatedPatch;
    this.aBState = 'proposal';

    // Compute diff
    const changedProps = Object.keys(validatedPatch.injectedProps || {});
    const diff: ProposalDiff = {
      proposalId: validatedPatch.id,
      targetFilePath: targetPath,
      hasJsxReplacement: Boolean(validatedPatch.jsxReplacement),
      hasCssDelta: Boolean(validatedPatch.cssDelta),
      propsChanged: changedProps,
      cssDelta: validatedPatch.cssDelta,
      jsxReplacement: validatedPatch.jsxReplacement,
      injectedProps: validatedPatch.injectedProps ? { ...validatedPatch.injectedProps } : undefined,
      timestamp: new Date().toISOString(),
    };
    this.diffs.set(validatedPatch.id, diff);

    // Record history
    const historyEntry: ProposalHistoryEntry = {
      id: validatedPatch.id,
      patch: { ...validatedPatch },
      appliedAt: new Date().toISOString(),
      aBState: 'proposal',
      status: 'active',
      previousConfig: currentConfig ? { ...currentConfig } : undefined,
    };
    this.history.push(historyEntry);

    return {
      activeProposalId: validatedPatch.id,
      aBState: 'proposal',
    };
  }

  /**
   * Toggles the preview between 'current' (base component without patch) and 'proposal' (with active patch).
   */
  async toggleAB(
    harness: VitePreviewHarness,
    state: 'current' | 'proposal'
  ): Promise<'current' | 'proposal'> {
    if (state !== 'current' && state !== 'proposal') {
      throw new Error(`Invalid A/B state: '${state}'. Expected 'current' or 'proposal'.`);
    }

    const currentConfig = harness.getCurrentComponent();
    const targetPath =
      this.baseConfig?.componentPath ||
      currentConfig?.componentPath ||
      this.activeProposal?.targetFilePath ||
      '';
    const baseProps = this.baseConfig?.mockProps || currentConfig?.mockProps || {};

    if (state === 'current') {
      // Revert virtual entry module to base without patch
      harness.setVirtualComponent(targetPath, baseProps, undefined);
      this.aBState = 'current';

      const latestEntry = this.getLatestHistoryEntry();
      if (latestEntry && latestEntry.status === 'active') {
        latestEntry.aBState = 'current';
      }

      return 'current';
    } else {
      // Toggle back to active proposal
      if (!this.activeProposal) {
        throw new Error('No active proposal to toggle to. Apply a proposal first.');
      }

      harness.setVirtualComponent(targetPath, baseProps, this.activeProposal);
      this.aBState = 'proposal';

      const latestEntry = this.getLatestHistoryEntry();
      if (latestEntry && latestEntry.status === 'active') {
        latestEntry.aBState = 'proposal';
      }

      return 'proposal';
    }
  }

  /**
   * Reverts the active proposal completely, returning the harness to baseline.
   */
  async revertProposal(harness: VitePreviewHarness): Promise<void> {
    const currentConfig = harness.getCurrentComponent();
    const targetPath =
      this.baseConfig?.componentPath ||
      currentConfig?.componentPath ||
      this.activeProposal?.targetFilePath ||
      '';
    const baseProps = this.baseConfig?.mockProps || currentConfig?.mockProps || {};

    if (targetPath) {
      harness.setVirtualComponent(targetPath, baseProps, undefined);
    }

    // Mark active proposal in history as reverted
    for (const entry of this.history) {
      if (entry.status === 'active') {
        entry.status = 'reverted';
        entry.aBState = 'current';
      }
    }

    this.activeProposal = null;
    this.aBState = 'current';
  }

  /**
   * Returns the currently active proposal patch, or null if none is active.
   */
  getActiveProposal(): ProposalPatch | null {
    return this.activeProposal ? { ...this.activeProposal } : null;
  }

  /**
   * Returns the current A/B state ('current' or 'proposal').
   */
  getABState(): 'current' | 'proposal' {
    return this.aBState;
  }

  /**
   * Returns the full history of applied proposals.
   */
  getHistory(): ProposalHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Returns diff details for a specific proposal, or for the active proposal if omitted.
   */
  getDiff(proposalId?: string): ProposalDiff | null {
    const id = proposalId || this.activeProposal?.id;
    if (!id) return null;
    const diff = this.diffs.get(id);
    return diff ? { ...diff } : null;
  }

  /**
   * Returns all diffs recorded across all proposals.
   */
  getAllDiffs(): ProposalDiff[] {
    return Array.from(this.diffs.values());
  }

  /**
   * Clears proposal history and diff tracking cache.
   */
  clearHistory(): void {
    this.history = [];
    this.diffs.clear();
  }

  private getLatestHistoryEntry(): ProposalHistoryEntry | undefined {
    return this.history[this.history.length - 1];
  }
}
