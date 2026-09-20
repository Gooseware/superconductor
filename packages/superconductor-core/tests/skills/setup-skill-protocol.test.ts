import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Setup Skill & Protocol Invariants', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const setupSkillPath = path.join(repoRoot, 'skills/setup/SKILL.md');
  const setupProtocolPath = path.join(repoRoot, 'skills/setup/references/setup-protocol.md');

  const setupSkillContent = fs.readFileSync(setupSkillPath, 'utf-8');
  const setupProtocolContent = fs.readFileSync(setupProtocolPath, 'utf-8');

  describe('Eliminate hardcoded ~/.gemini/extensions/superconductor (FR-6 / AC-10)', () => {
    it('skills/setup/SKILL.md contains zero occurrences of ~/.gemini/extensions/superconductor', () => {
      expect(setupSkillContent).not.toContain('~/.gemini/extensions/superconductor');
    });

    it('skills/setup/references/setup-protocol.md contains zero occurrences of ~/.gemini/extensions/superconductor', () => {
      expect(setupProtocolContent).not.toContain('~/.gemini/extensions/superconductor');
    });

    it('skills/setup/SKILL.md uses dynamic SUPERCONDUCTOR_DIR derivation', () => {
      expect(setupSkillContent).toContain('SUPERCONDUCTOR_DIR="${SUPERCONDUCTOR_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd || echo "$HOME/.gemini/config/plugins/superconductor")}"');
    });

    it('skills/setup/references/setup-protocol.md uses dynamic SUPERCONDUCTOR_DIR derivation', () => {
      expect(setupProtocolContent).toContain('SUPERCONDUCTOR_DIR="${SUPERCONDUCTOR_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd || echo "$HOME/.gemini/config/plugins/superconductor")}"');
    });
  });

  describe('Section 2.7 Intelligence Baseline Scan & Verification Gate (FR-5 / AC-2)', () => {
    it('does not reference non-existent superconductor_run_intelligence MCP tool', () => {
      expect(setupSkillContent).not.toContain('superconductor_run_intelligence');
    });

    it('specifies kernel_intelligence_refresh and cli execution for baseline scan', () => {
      expect(setupSkillContent).toContain('kernel_intelligence_refresh({ force: true, outputDir: "<projectRoot>/superconductor" })');
      expect(setupSkillContent).toContain('node "${SUPERCONDUCTOR_DIR}/packages/superconductor-core/dist/cli/index.js" intelligence --full');
    });

    it('gates the success banner on kernel_intelligence_status status === "LIVE"', () => {
      expect(setupSkillContent).toContain("kernel_intelligence_status");
      expect(setupSkillContent).toContain("status === 'LIVE'");
      expect(setupSkillContent).toContain("Do **NOT** emit the success banner");
    });

    it('defines the required success banner format', () => {
      expect(setupSkillContent).toContain('✅ Intelligence baseline established for <projectRoot> (SHA: <sha>)');
    });
  });

  describe('Section 1.2 Audit Table & Intelligence Repair Mode (FR-14)', () => {
    it('includes superconductor/intelligence/00_manifest.json in the audit artifacts list and table', () => {
      expect(setupSkillContent).toContain('intelligence/00_manifest.json');
    });

    it('defines Intelligence Repair Mode allowing intelligence scan without re-scaffolding', () => {
      expect(setupSkillContent).toContain('Intelligence Repair Mode');
      expect(setupSkillContent).toContain('Section 2.7 (Intelligence Repair Mode)');
    });
  });
});
