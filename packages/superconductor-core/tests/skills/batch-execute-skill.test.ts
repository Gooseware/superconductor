import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Batch-Execute Skill Invariants (track_phases_and_sliding_window_20260921)', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const skillPath = path.join(repoRoot, 'skills/batch-execute/SKILL.md');
  const content = fs.readFileSync(skillPath, 'utf-8');

  describe('500-Line Strict Enforcement', () => {
    it('skills/batch-execute/SKILL.md is strictly <= 500 lines', () => {
      const lineCount = content.split('\n').length;
      expect(lineCount).toBeLessThanOrEqual(500);
    });
  });

  describe('Section 1.1: Phase-Aware Queue Resolution', () => {
    it('targets active Phase 1 by default when --phase is omitted', () => {
      expect(content).toContain('Phase 1');
      expect(content).toContain('(Active)');
      expect(content).toMatch(/default to (?:the )?active Phase 1/i);
    });

    it('supports explicit --phase=<N|phase_id> flag', () => {
      expect(content).toContain('--phase=');
      expect(content).toMatch(/--phase=<\w+/);
    });

    it('enforces phase boundaries and ignores tracks in downstream/other phases', () => {
      expect(content).toContain('MUST IGNORE');
      expect(content).toMatch(/downstream/i);
    });

    it('filters only pending [ ] tracks in document order', () => {
      expect(content).toContain('[ ]');
      expect(content).toContain('document order');
    });
  });

  describe('Section 2.4: Continue-on-Failure Policy & Morning Presents', () => {
    it('defaults to --phase-policy=continue', () => {
      expect(content).toContain('--phase-policy=continue');
    });

    it('instructs DO NOT HALT on failures and avoids deadlocks', () => {
      expect(content).toContain('DO NOT HALT');
    });

    it('marks failed tracks as morning presents and reverts status to [ ] without looping', () => {
      expect(content).toContain('morning present');
      expect(content).toMatch(/revert.*\[ \]/i);
      expect(content).toContain('Do NOT retry the failed track in the current batch pass');
    });

    it('enforces clean worktree reversion on failure', () => {
      expect(content).toMatch(/worktree/i);
      expect(content).toMatch(/revert.*worktree/i);
    });

    it('proceeds immediately to next pending track in active phase', () => {
      expect(content).toMatch(/proceed to the next pending track/i);
    });
  });

  describe('Section 2.5: Sliding Window Progression', () => {
    it('handles sliding window progression when active phase completes', () => {
      expect(content).toContain('sliding window');
      expect(content).toMatch(/Sliding Window Advancement|Sliding window advanced/i);
    });

    it('supports --auto-advance flag to transition automatically to newly activated Phase 1', () => {
      expect(content).toContain('--auto-advance');
    });
  });

  describe('Section 3.0: Morning Briefing Report', () => {
    it('records phase metadata, sliding window status, and morning presents in briefing', () => {
      expect(content).toContain('Morning Briefing');
      expect(content).toContain('Presents for the Morning');
      expect(content).toContain('Sliding Window:');
    });
  });
});
