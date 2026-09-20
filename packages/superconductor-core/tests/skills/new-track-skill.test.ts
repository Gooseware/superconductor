import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('New-Track Skill Invariants (intelligence_setup_fix_20260920)', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const newTrackSkillPath = path.join(repoRoot, 'skills/new-track/SKILL.md');
  const newTrackContent = fs.readFileSync(newTrackSkillPath, 'utf-8');

  describe('Eliminate getSuperconductorHome & hardcoded paths (FR-2 / FR-6 / AC-10)', () => {
    it('skills/new-track/SKILL.md contains zero occurrences of getSuperconductorHome', () => {
      expect(newTrackContent).not.toContain('getSuperconductorHome');
    });

    it('skills/new-track/SKILL.md contains zero occurrences of ~/.gemini/extensions/superconductor', () => {
      expect(newTrackContent).not.toContain('~/.gemini/extensions/superconductor');
    });

    it('skills/new-track/SKILL.md uses dynamic SUPERCONDUCTOR_DIR derivation', () => {
      expect(newTrackContent).toContain(
        'SUPERCONDUCTOR_DIR="${SUPERCONDUCTOR_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd || echo "$HOME/.gemini/config/plugins/superconductor")}"'
      );
    });
  });

  describe('Snapshot Resolution & Null Guard (FR-2 / HIGH-1 / AC-3)', () => {
    it('resolves PROJECT_ROOT and OUTPUT_DIR via git rev-parse', () => {
      expect(newTrackContent).toContain('PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)');
      expect(newTrackContent).toContain('OUTPUT_DIR="$PROJECT_ROOT/superconductor/intelligence"');
    });

    it('loads snapshot via IntelligenceSnapshotReader.load or IntelligencePreflightCheck.run', () => {
      expect(newTrackContent).toContain('IntelligenceSnapshotReader.load(OUTPUT_DIR, PROJECT_ROOT)');
      expect(newTrackContent).toContain('IntelligencePreflightCheck.run(PROJECT_ROOT, OUTPUT_DIR)');
    });

    it('includes safe null guard before accessing context.driftBanner', () => {
      expect(newTrackContent).toContain('Safe Null Guard');
      expect(newTrackContent).toContain('context.driftBanner');
    });
  });

  describe('Mismatch Detection (FR-4 / AC-4)', () => {
    it('checks context.manifest against PROJECT_ROOT and emits UX-2 mismatch warning', () => {
      expect(newTrackContent).toContain('context.manifest?.projectRoot');
      expect(newTrackContent).toContain('[superconductor] Intelligence: MISMATCH | Indexed: <context.manifest.projectRoot> | Current: <PROJECT_ROOT>');
      expect(newTrackContent).toContain('re-scan');
    });
  });

  describe('Swarm Blueprint CLI Wrapper Reference (FR-7 / AC-6)', () => {
    it('references compiled cli-blueprint.js wrapper in Section 2.3a', () => {
      expect(newTrackContent).toContain(
        'node "${SUPERCONDUCTOR_DIR}/packages/superconductor-core/dist/intelligence/cli-blueprint.js" "<plan.md_path>"'
      );
    });
  });

  describe('UX-2 Preflight Status Output Standard (UX-2 / AC-11)', () => {
    it('conforms to UX-2 standard for intelligence status lines', () => {
      expect(newTrackContent).toContain('[superconductor] Intelligence: NONE | Run: /superconductor:setup to index this project');
      expect(newTrackContent).not.toContain('❌  Intelligence: NONE (keyword heuristics active');
    });
  });
});
