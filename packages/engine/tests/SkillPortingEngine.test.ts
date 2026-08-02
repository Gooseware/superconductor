import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillPortingEngine } from '../src/skills/SkillPortingEngine';

describe('SkillPortingEngine', () => {
  let tempDir: string;
  let inputDir: string;
  let outputDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-porting-engine-test-'));
    inputDir = path.join(tempDir, 'input', 'test-skill');
    outputDir = path.join(tempDir, 'output');
    fs.mkdirSync(inputDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should extract frontmatter successfully', () => {
    const skillContent = `---
name: my-cool-skill
description: A very cool skill indeed
---
Body content goes here.`;
    fs.writeFileSync(path.join(inputDir, 'SKILL.md'), skillContent);

    SkillPortingEngine.portSkill(inputDir, outputDir);

    const outputContent = fs.readFileSync(path.join(outputDir, 'SKILL.md'), 'utf-8');
    expect(outputContent).toContain('name: my-cool-skill');
    expect(outputContent).toContain('description: A very cool skill indeed');
    expect(outputContent).toContain('## 2.0 SKILL INSTRUCTIONS\nBody content goes here.');
  });

  it('should handle CRLF line endings properly', () => {
    const skillContent = `---\r\nname: crlf-skill\r\ndescription: A skill with CRLF\r\n---\r\nBody content goes here.`;
    fs.writeFileSync(path.join(inputDir, 'SKILL.md'), skillContent);

    SkillPortingEngine.portSkill(inputDir, outputDir);

    const outputContent = fs.readFileSync(path.join(outputDir, 'SKILL.md'), 'utf-8');
    expect(outputContent).toContain('name: crlf-skill');
    expect(outputContent).toContain('description: A skill with CRLF');
    expect(outputContent).toContain('## 2.0 SKILL INSTRUCTIONS\nBody content goes here.');
  });

  it('should use fallbacks when frontmatter is missing or invalid', () => {
    const skillContent = `No frontmatter here, just pure body!`;
    fs.writeFileSync(path.join(inputDir, 'SKILL.md'), skillContent);

    SkillPortingEngine.portSkill(inputDir, outputDir);

    const outputContent = fs.readFileSync(path.join(outputDir, 'SKILL.md'), 'utf-8');
    expect(outputContent).toContain('name: test-skill'); // Fallback from directory name
    expect(outputContent).toContain('description: Ported skill'); // Fallback description
    expect(outputContent).toContain('## 2.0 SKILL INSTRUCTIONS\nNo frontmatter here, just pure body!');
  });

  it('should map specific skill names (e.g. grill-with-docs to grill)', () => {
    const grillDir = path.join(tempDir, 'input', 'grill-with-docs');
    fs.mkdirSync(grillDir, { recursive: true });
    fs.writeFileSync(path.join(grillDir, 'SKILL.md'), 'Just some content');

    SkillPortingEngine.portSkill(grillDir, outputDir);

    const outputContent = fs.readFileSync(path.join(outputDir, 'SKILL.md'), 'utf-8');
    expect(outputContent).toContain('name: grill');
  });

  it('should map specific skill names (e.g. improve-codebase-architecture to improve-architecture)', () => {
    const improveDir = path.join(tempDir, 'input', 'improve-codebase-architecture');
    fs.mkdirSync(improveDir, { recursive: true });
    fs.writeFileSync(path.join(improveDir, 'SKILL.md'), 'Just some content');

    SkillPortingEngine.portSkill(improveDir, outputDir);

    const outputContent = fs.readFileSync(path.join(outputDir, 'SKILL.md'), 'utf-8');
    expect(outputContent).toContain('name: improve-architecture');
  });

  it('should copy other .md files in the directory', () => {
    fs.writeFileSync(path.join(inputDir, 'SKILL.md'), 'Content');
    fs.writeFileSync(path.join(inputDir, 'HTML-REPORT.md'), 'Report content');
    fs.writeFileSync(path.join(inputDir, 'ignore.txt'), 'Text file');

    SkillPortingEngine.portSkill(inputDir, outputDir);

    expect(fs.existsSync(path.join(outputDir, 'HTML-REPORT.md'))).toBe(true);
    expect(fs.readFileSync(path.join(outputDir, 'HTML-REPORT.md'), 'utf-8')).toBe('Report content');
    expect(fs.existsSync(path.join(outputDir, 'ignore.txt'))).toBe(false);
  });

  it('should throw an error if SKILL.md is missing', () => {
    expect(() => {
      SkillPortingEngine.portSkill(inputDir, outputDir);
    }).toThrowError(`SKILL.md not found in ${inputDir}`);
  });
});
