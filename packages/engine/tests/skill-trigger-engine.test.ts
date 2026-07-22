import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SkillTriggerEngine } from '../src/skills/skill-trigger-engine.js';
import { DagNode } from '../src/types/engine.types.js';

describe('SkillTriggerEngine', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-trigger-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should scan skill manifests and match keywords in prompt', () => {
    // Setup a dummy skill
    const skillDir = path.join(tempDir, 'skills', 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });

    const manifest = {
      version: '1.0',
      triggers: {
        keywords: ['implement', 'build']
      },
      metadata: {
        name: 'test-skill',
        marketplace: '1p',
        version: '1.0.0'
      }
    };
    fs.writeFileSync(path.join(skillDir, 'skill-rules.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test Skill\nInstructions here...');

    const engine = new SkillTriggerEngine(path.join(tempDir, 'skills'));
    const task: DagNode = {
      id: 'task-1',
      prompt: 'Please implement this feature',
      dependencies: []
    };

    const matches = engine.match(task);
    expect(matches.length).toBe(1);
    expect(matches[0].manifest.metadata.name).toBe('test-skill');
    expect(matches[0].matchedBy).toBe('keyword');

    const context = engine.buildSkillContext(matches);
    expect(context).toContain('--- Skill: test-skill ---');
    expect(context).toContain('# Test Skill');
  });

  it('should match file globs against contextFiles', () => {
    const skillDir = path.join(tempDir, 'skills', 'glob-skill');
    fs.mkdirSync(skillDir, { recursive: true });

    const manifest = {
      version: '1.0',
      triggers: {
        fileGlobs: ['superconductor/tracks/*/plan.md']
      },
      metadata: {
        name: 'glob-skill',
        marketplace: '1p',
        version: '1.0.0'
      }
    };
    fs.writeFileSync(path.join(skillDir, 'skill-rules.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Glob Skill');

    const engine = new SkillTriggerEngine(path.join(tempDir, 'skills'));
    const task: DagNode = {
      id: 'task-2',
      prompt: 'Do something',
      contextFiles: ['superconductor/tracks/foo/plan.md'],
      dependencies: []
    };

    const matches = engine.match(task);
    expect(matches.length).toBe(1);
    expect(matches[0].matchedBy).toBe('glob');
  });

  it('should handle missing skillsDir gracefully without throwing', () => {
    const engine = new SkillTriggerEngine(path.join(tempDir, 'non-existent-dir'));
    const task: DagNode = {
      id: 'task-3',
      prompt: 'implement something',
      dependencies: []
    };

    const matches = engine.match(task);
    expect(matches).toEqual([]);

    const context = engine.buildSkillContext(matches);
    expect(context).toBe('');
  });

  it('should skip malformed manifests gracefully', () => {
    const skillDir = path.join(tempDir, 'skills', 'bad-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'skill-rules.json'), '{ invalid json');

    const engine = new SkillTriggerEngine(path.join(tempDir, 'skills'));
    const task: DagNode = {
      id: 'task-4',
      prompt: 'test',
      dependencies: []
    };

    expect(() => engine.match(task)).not.toThrow();
  });

  it('should enforce an 8000 character context limit cap', () => {
    const skillDir = path.join(tempDir, 'skills', 'huge-skill');
    fs.mkdirSync(skillDir, { recursive: true });

    const manifest = {
      version: '1.0',
      triggers: { keywords: ['huge'] },
      metadata: { name: 'huge-skill', marketplace: '1p', version: '1.0.0' }
    };
    fs.writeFileSync(path.join(skillDir, 'skill-rules.json'), JSON.stringify(manifest));
    
    // Create a very long SKILL.md
    const longContent = Array(300).fill('Lots of text in a single line repeated over and over again.').join('\n');
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), longContent);

    const engine = new SkillTriggerEngine(path.join(tempDir, 'skills'));
    const matches = engine.match({ id: 't', prompt: 'huge task', dependencies: [] });
    const context = engine.buildSkillContext(matches, 500);

    expect(context.length).toBeLessThanOrEqual(8000);
  });
});
