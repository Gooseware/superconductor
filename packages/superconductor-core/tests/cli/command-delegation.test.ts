import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'smol-toml';

describe('Command Delegation ("Thin Command" Architecture)', () => {
  const repoRoot = path.resolve(__dirname, '../../../../');
  const commandsDir = path.join(repoRoot, 'commands', 'superconductor');
  const skillsDir = path.join(repoRoot, 'skills');

  const expectedCommands = [
    { file: 'setup.toml', expectedSkill: 'skills/setup/SKILL.md' },
    { file: 'newTrack.toml', expectedSkill: 'skills/new-track/SKILL.md' },
    { file: 'implement.toml', expectedSkill: 'skills/implement/SKILL.md' },
    { file: 'review.toml', expectedSkillRegex: /skills\/(review|standalone-review)\/SKILL\.md/ },
    { file: 'revert.toml', expectedSkill: 'skills/revert/SKILL.md' },
    { file: 'status.toml', expectedSkill: 'skills/status/SKILL.md' },
    { file: 'triage.toml', expectedSkill: 'skills/triage/SKILL.md' },
    { file: 'models.toml', expectedSkill: 'skills/models/SKILL.md' },
    { file: 'yolo.toml', expectedSkill: 'skills/yolo/SKILL.md' },
  ];

  it('contains all 9 expected command TOML files', () => {
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.toml'));
    expect(files.sort()).toEqual(expectedCommands.map(c => c.file).sort());
  });

  for (const cmd of expectedCommands) {
    describe(`command: ${cmd.file}`, () => {
      const filePath = path.join(commandsDir, cmd.file);

      it('is a valid TOML file with description and prompt fields', () => {
        expect(fs.existsSync(filePath)).toBe(true);
        const rawContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = parse(rawContent) as Record<string, any>;

        expect(typeof parsed.description).toBe('string');
        expect(parsed.description.trim().length).toBeGreaterThan(0);

        expect(typeof parsed.prompt).toBe('string');
        expect(parsed.prompt.trim().length).toBeGreaterThan(0);
      });

      it('delegates to the appropriate skill markdown file', () => {
        const rawContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = parse(rawContent) as Record<string, any>;
        const prompt = parsed.prompt as string;

        if (cmd.expectedSkill) {
          expect(prompt).toContain(cmd.expectedSkill);
          const backingSkillPath = path.join(repoRoot, cmd.expectedSkill);
          expect(fs.existsSync(backingSkillPath)).toBe(true);
        } else if (cmd.expectedSkillRegex) {
          expect(prompt).toMatch(cmd.expectedSkillRegex);
          const match = prompt.match(cmd.expectedSkillRegex);
          expect(match).not.toBeNull();
          if (match) {
            const backingSkillPath = path.join(repoRoot, match[0]);
            expect(fs.existsSync(backingSkillPath)).toBe(true);
          }
        }
      });

      it('forwards user arguments via {{args}}', () => {
        const rawContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = parse(rawContent) as Record<string, any>;
        const prompt = parsed.prompt as string;

        expect(prompt).toContain('{{args}}');
      });

      it('contains zero occurrences of legacy ask_user and plan mode tools', () => {
        const rawContent = fs.readFileSync(filePath, 'utf-8');

        expect(rawContent).not.toContain('ask_user');
        expect(rawContent).not.toContain('enter_plan_mode');
        expect(rawContent).not.toContain('exit_plan_mode');
      });
    });
  }
});
