import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Skill Line Count Verification (500-Line Rule)', () => {
  const skillsDir = path.join(process.cwd(), '../../skills');

  it('should enforce ≤ 500 lines for all SKILL.md files', () => {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const violations: { file: string; lines: number }[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillMdPath)) {
          const content = fs.readFileSync(skillMdPath, 'utf8');
          const lines = content.split('\n').length;
          if (lines > 500) {
            violations.push({ file: `skills/${entry.name}/SKILL.md`, lines });
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
