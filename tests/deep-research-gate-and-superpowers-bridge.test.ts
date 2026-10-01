import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Deep Research Gate and Superpowers Bridge Verification', () => {
  const newTrackSkillPath = path.resolve(__dirname, '../skills/new-track/SKILL.md');
  const workflowPath = path.resolve(__dirname, '../superconductor/workflow.md');

  const newTrackContent = fs.readFileSync(newTrackSkillPath, 'utf8');
  const workflowContent = fs.readFileSync(workflowPath, 'utf8');

  it('Test 1: skills/new-track/SKILL.md adheres to <= 500 line ceiling', () => {
    const lines = newTrackContent.split('\n');
    expect(lines.length).toBeLessThanOrEqual(500);
  });

  it('Test 2: superconductor/workflow.md adheres to <= 500 line ceiling', () => {
    const lines = workflowContent.split('\n');
    expect(lines.length).toBeLessThanOrEqual(500);
  });

  it('Test 3: skills/new-track/SKILL.md formalizes the Hunch to Roundhouse Punch Deep Research Gate', () => {
    // Check gate title / presence
    expect(newTrackContent).toMatch(/Hunch to Roundhouse Punch/i);

    // 1. The Hunch
    expect(newTrackContent).toMatch(/The Hunch/i);
    expect(newTrackContent).toMatch(/brainstorm/i);

    // 2. The Deep Dive
    expect(newTrackContent).toMatch(/The Deep Dive/i);
    expect(newTrackContent).toMatch(/gemini-deep-research/i);
    expect(newTrackContent).toMatch(/run_deep_research\.py/i);

    // 3. Obsidian Archival
    expect(newTrackContent).toMatch(/Obsidian Archival/i);
    expect(newTrackContent).toContain('gemini-obsidian');

    // 4. The Roundhouse Punch
    expect(newTrackContent).toMatch(/The Roundhouse Punch/i);
    expect(newTrackContent).toMatch(/spec\.md/i);
    expect(newTrackContent).toMatch(/ADR/i);
  });

  it('Test 4: superconductor/workflow.md documents the Hunch to Roundhouse Punch lifecycle', () => {
    expect(workflowContent).toMatch(/Hunch to Roundhouse Punch/i);
    expect(workflowContent).toMatch(/gemini-deep-research/i);
    expect(workflowContent).toMatch(/gemini-obsidian/i);
  });

  it('Test 5: superconductor/workflow.md formally bridges Superpowers process skills', () => {
    // Mandates
    expect(workflowContent).toContain('superpowers:brainstorming');
    expect(workflowContent).toContain('superpowers:writing-plans');
    expect(workflowContent).toContain('superpowers:test-driven-development');
    expect(workflowContent).toContain('superpowers:systematic-debugging');
    expect(workflowContent).toContain('superpowers:using-git-worktrees');
  });

  it('Test 6: skills/new-track/SKILL.md preserves critical intelligence preflight assertions', () => {
    expect(newTrackContent).toContain('PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)');
    expect(newTrackContent).toContain('OUTPUT_DIR="$PROJECT_ROOT/superconductor/intelligence"');
    expect(newTrackContent).toContain('[superconductor] Intelligence: MISMATCH | Indexed: <context.manifest.projectRoot> | Current: <PROJECT_ROOT>');
  });
});
