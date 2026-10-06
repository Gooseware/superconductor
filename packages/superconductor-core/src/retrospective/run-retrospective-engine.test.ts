import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  RunRetrospectiveEngine,
  type RunRetrospectiveInput,
} from './run-retrospective-engine.js';
import type { NoteLike } from './friction-classifier.js';

describe('RunRetrospectiveEngine', () => {
  let tmpDir: string;
  let suggestionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-retro-engine-test-'));
    suggestionsDir = path.join(tmpDir, 'superconductor', 'suggestions');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('queries notebook notes with ["quorum", "warning", "procedure"] and generates proposal when confidence >= 0.7', async () => {
    const mockNotes: NoteLike[] = [
      {
        note_type: 'quorum',
        content: 'Quorum review failed on step 3 due to prompt drift',
        severity: 'warning',
        track_id: 'track_alpha',
      },
      {
        note_type: 'warning',
        content: 'Reviewer reproduction timeout in ephemeral harness',
        severity: 'critical',
        track_id: 'track_alpha',
      },
    ];

    const notebookQueryFn = vi.fn().mockResolvedValue(mockNotes);

    const engine = new RunRetrospectiveEngine({
      projectRoot: tmpDir,
      notebookQueryFn,
      confidenceThreshold: 0.7,
    });

    const result = await engine.run({
      trackId: 'track_alpha',
      remediationCycles: 3,
      errorCount: 2,
    });

    expect(notebookQueryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        note_types: ['quorum', 'warning', 'procedure'],
        track_id: 'track_alpha',
      })
    );

    expect(result.skippedDueToLowConfidence).toBe(false);
    expect(result.proposalsGenerated.length).toBeGreaterThan(0);
    expect(result.savedProposalPaths.length).toBeGreaterThan(0);

    const savedFile = result.savedProposalPaths[0];
    expect(fs.existsSync(savedFile)).toBe(true);

    const fileContent = fs.readFileSync(savedFile, 'utf8');
    expect(fileContent).toContain('category: process');
    expect(fileContent).toContain('# Superconductor Track Proposal:');
  });

  it('scans touched files for incidental tech debt (empty catch, TODOs, missing tests)', async () => {
    // Create an untested source file with tech debt
    const srcDir = path.join(tmpDir, 'src', 'billing');
    fs.mkdirSync(srcDir, { recursive: true });
    const legacyFile = path.join(srcDir, 'payment-gateway.ts');
    fs.writeFileSync(
      legacyFile,
      `
      export function chargeCard() {
        // TODO: replace legacy synchronous call
        try {
          doCharge();
        } catch (err) {}
      }
      function doCharge() {}
      `,
      'utf8'
    );

    const engine = new RunRetrospectiveEngine({
      projectRoot: tmpDir,
      notebookQueryFn: vi.fn().mockResolvedValue([]),
      confidenceThreshold: 0.7,
    });

    const result = await engine.run({
      trackId: 'track_payment_fix',
      touchedFiles: ['src/billing/payment-gateway.ts'],
      errorCount: 1,
    });

    expect(result.touchedFilesScannedCount).toBe(1);
    expect(result.fileDebtFindings.length).toBeGreaterThanOrEqual(2);

    const types = result.fileDebtFindings.map((f) => f.type);
    expect(types).toContain('empty_catch');
    expect(types).toContain('missing_test');

    // Should generate codebase proposal because of multiple debt signals + errorCount
    expect(result.proposalsGenerated.length).toBeGreaterThan(0);
    const proposal = result.proposalsGenerated[0];
    expect(proposal.data.category).toBe('codebase');
  });

  it('does NOT generate proposal if confidence < 0.7 (prevents low-signal spam)', async () => {
    const mockNotes: NoteLike[] = [
      {
        note_type: 'procedure',
        content: 'Task step 1 executed normally',
        severity: 'info',
        track_id: 'track_clean',
      },
    ];

    const notebookQueryFn = vi.fn().mockResolvedValue(mockNotes);

    const engine = new RunRetrospectiveEngine({
      projectRoot: tmpDir,
      notebookQueryFn,
      confidenceThreshold: 0.7,
    });

    const result = await engine.run({
      trackId: 'track_clean',
      remediationCycles: 0,
      errorCount: 0,
    });

    expect(result.skippedDueToLowConfidence).toBe(true);
    expect(result.proposalsGenerated).toHaveLength(0);
    expect(result.savedProposalPaths).toHaveLength(0);

    // Verify suggestions directory was not populated with files
    if (fs.existsSync(suggestionsDir)) {
      const files = fs.readdirSync(suggestionsDir);
      expect(files).toHaveLength(0);
    }
  });

  it('handles empty notes and clean files gracefully without error', async () => {
    const engine = new RunRetrospectiveEngine({
      projectRoot: tmpDir,
      notebookQueryFn: vi.fn().mockResolvedValue([]),
    });

    const result = await engine.run({
      trackId: 'track_empty',
      touchedFiles: [],
    });

    expect(result.proposalsGenerated).toHaveLength(0);
    expect(result.confidence).toBe(0);
    expect(result.skippedDueToLowConfidence).toBe(true);
  });
});
