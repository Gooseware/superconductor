import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Skill Frontmatter Metadata (LobeHub / SkillsMP standard)', () => {
  const skillsDir = path.join(process.cwd(), '../../skills');
  const coreSkills = ['implement', 'review', 'new-track', 'swarm-orchestrate', 'setup', 'revert', 'status'];

  it('should parse YAML frontmatter and validate name metadata for core skills', () => {
    for (const skillName of coreSkills) {
      const skillMdPath = path.join(skillsDir, skillName, 'SKILL.md');
      expect(fs.existsSync(skillMdPath)).toBe(true);

      const content = fs.readFileSync(skillMdPath, 'utf8');
      expect(content.startsWith('---')).toBe(true);

      const frontmatterEnd = content.indexOf('---', 3);
      expect(frontmatterEnd).toBeGreaterThan(3);

      const frontmatterText = content.substring(3, frontmatterEnd);
      expect(frontmatterText).toContain(`name: ${skillName}`);
      expect(frontmatterText).toContain('description:');
    }
  });

  it('should verify every core skill has a corresponding valid skill-rules.json file', () => {
    for (const skillName of coreSkills) {
      const skillRulesPath = path.join(skillsDir, skillName, 'skill-rules.json');
      expect(fs.existsSync(skillRulesPath)).toBe(true);

      const content = fs.readFileSync(skillRulesPath, 'utf8');
      const json = JSON.parse(content);

      expect(json.version).toBe('1.0');
      expect(json.metadata.name).toBe(skillName);
      expect(Array.isArray(json.triggers.keywords)).toBe(true);
      expect(Array.isArray(json.triggers.executionEvents)).toBe(true);
    }
  });
});
