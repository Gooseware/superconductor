import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Skills Intelligence Preflight Verification', () => {
  const codingAgentPath = path.resolve(__dirname, '../skills/coding-agent/SKILL.md');
  const standaloneReviewPath = path.resolve(__dirname, '../skills/standalone-review/SKILL.md');
  const newTrackPath = path.resolve(__dirname, '../skills/new-track/SKILL.md');

  const codingAgentContent = fs.readFileSync(codingAgentPath, 'utf8');
  const standaloneReviewContent = fs.readFileSync(standaloneReviewPath, 'utf8');
  const newTrackContent = fs.readFileSync(newTrackPath, 'utf8');

  it('Test 1: getSuperconductorHome eliminated from skills', () => {
    expect(codingAgentContent).not.toContain('getSuperconductorHome');
    expect(standaloneReviewContent).not.toContain('getSuperconductorHome');
    expect(newTrackContent).not.toContain('getSuperconductorHome');
  });

  it('Test 2: Hardcoded ~/.gemini/extensions/superconductor eliminated from skills', () => {
    expect(codingAgentContent).not.toContain('~/.gemini/extensions/superconductor');
    expect(standaloneReviewContent).not.toContain('~/.gemini/extensions/superconductor');
    expect(newTrackContent).not.toContain('~/.gemini/extensions/superconductor');
  });

  it('Test 3: Canonical PROJECT_ROOT and OUTPUT_DIR resolution present in skills', () => {
    expect(codingAgentContent).toContain('PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)');
    expect(codingAgentContent).toContain('OUTPUT_DIR="$PROJECT_ROOT/superconductor/intelligence"');
    expect(standaloneReviewContent).toContain('PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)');
    expect(standaloneReviewContent).toContain('OUTPUT_DIR="$PROJECT_ROOT/superconductor/intelligence"');
    expect(newTrackContent).toContain('PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)');
    expect(newTrackContent).toContain('OUTPUT_DIR="$PROJECT_ROOT/superconductor/intelligence"');
  });

  it('Test 4: Preflight check and snapshot reader loading pattern verified', () => {
    const hasCodingAgentCheck = codingAgentContent.includes('IntelligencePreflightCheck') ||
      codingAgentContent.includes('IntelligenceSnapshotReader.load(OUTPUT_DIR, PROJECT_ROOT)');
    expect(hasCodingAgentCheck).toBe(true);

    const hasStandaloneReviewCheck = standaloneReviewContent.includes('IntelligencePreflightCheck') ||
      standaloneReviewContent.includes('IntelligenceSnapshotReader.load(OUTPUT_DIR, PROJECT_ROOT)');
    expect(hasStandaloneReviewCheck).toBe(true);

    const hasNewTrackCheck = newTrackContent.includes('IntelligencePreflightCheck') ||
      newTrackContent.includes('IntelligenceSnapshotReader.load(OUTPUT_DIR, PROJECT_ROOT)');
    expect(hasNewTrackCheck).toBe(true);
  });

  it('Test 5: Mismatch detection warning present', () => {
    expect(standaloneReviewContent).toContain('[superconductor] Intelligence: MISMATCH | Indexed: <other_dir> | Current: <dir>');
    expect(newTrackContent).toContain('[superconductor] Intelligence: MISMATCH | Indexed: <context.manifest.projectRoot> | Current: <PROJECT_ROOT>');
  });

  it('Test 6: Null guard before driftBanner present', () => {
    expect(codingAgentContent).toContain('driftBanner');
    const codingAgentNullGuard = codingAgentContent.includes('context?.driftBanner') || codingAgentContent.includes('context && context.driftBanner');
    expect(codingAgentNullGuard).toBe(true);

    expect(standaloneReviewContent).toContain('driftBanner');
    const standaloneReviewNullGuard = standaloneReviewContent.includes('context?.driftBanner') || standaloneReviewContent.includes('context && context.driftBanner');
    expect(standaloneReviewNullGuard).toBe(true);

    expect(newTrackContent).toContain('driftBanner');
    const newTrackNullGuard = newTrackContent.includes('context?.driftBanner') || newTrackContent.includes('context && context.driftBanner') || newTrackContent.includes('Safe Null Guard');
    expect(newTrackNullGuard).toBe(true);
  });

  it('Test 7: UX-2 standard status lines present', () => {
    expect(newTrackContent).toContain('[superconductor] Intelligence: NONE | Run: /superconductor:setup to index this project');
    expect(newTrackContent).not.toContain('❌  Intelligence: NONE (keyword heuristics active');
  });

  it('Test 8: cli-blueprint.js wrapper reference present', () => {
    expect(newTrackContent).toContain('node "${SUPERCONDUCTOR_DIR}/packages/superconductor-core/dist/intelligence/cli-blueprint.js"');
  });
});
