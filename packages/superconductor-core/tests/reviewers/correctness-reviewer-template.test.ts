import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Correctness Reviewer Template & Skill', () => {
  const repoRoot = path.resolve(__dirname, '../../../../');
  const templatePath = path.join(repoRoot, 'templates/reviewers/correctness-reviewer.md');
  const skillPath = path.join(repoRoot, 'skills/correctness-reviewer/SKILL.md');

  it('correctness-reviewer.md template contains 🔍 Intelligence: and 📓 Notebook: AC strings', () => {
    expect(fs.existsSync(templatePath)).toBe(true);
    const content = fs.readFileSync(templatePath, 'utf8');
    expect(content).toContain('🔍 Intelligence:');
    expect(content).toContain('📓 Notebook:');
    expect(content).toContain('Preflight Header Block Verification (MANDATORY AC)');
  });

  it('correctness-reviewer SKILL.md contains 🔍 Intelligence: and 📓 Notebook: AC strings', () => {
    expect(fs.existsSync(skillPath)).toBe(true);
    const content = fs.readFileSync(skillPath, 'utf8');
    expect(content).toContain('🔍 Intelligence:');
    expect(content).toContain('📓 Notebook:');
    expect(content).toContain('Preflight Header Block Verification (MANDATORY AC)');
  });
});
