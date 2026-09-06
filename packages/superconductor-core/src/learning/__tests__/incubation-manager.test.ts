import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import { SkillIncubationManager } from '../incubation-manager.js';
import { DistilledSkill, IncubatingSkillInfo } from '../types.js';

describe('SkillIncubationManager', () => {
  let tempRoot: string;
  let stagingDir: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-incubation-test-'));
    stagingDir = path.join(tempRoot, '.agents', 'skills', 'incubating');
  });

  afterEach(async () => {
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('Invariant: Staging Isolation', () => {
    it('writes only to .agents/skills/incubating/<skill>/ and never top-level .agents/skills/', async () => {
      const skill: DistilledSkill = {
        name: 'test-isolated-skill',
        description: 'Test isolation invariant',
        sourceTrack: 'track_iso_1',
        confidenceScore: 0.95,
        body: '# Test Isolated Skill\n\nInstructions here.',
      };

      const stagedPath = await SkillIncubationManager.stageSkill(skill, {
        projectRoot: tempRoot,
      });

      // Confirm staged path is strictly within .agents/skills/incubating/
      expect(stagedPath).toBe(
        path.join(tempRoot, '.agents', 'skills', 'incubating', 'test-isolated-skill', 'SKILL.md')
      );

      // Verify file exists in incubating directory
      const stat = await fs.stat(stagedPath);
      expect(stat.isFile()).toBe(true);

      // Verify top-level .agents/skills/ does NOT have the skill or SKILL.md directly
      const topLevelSkillDir = path.join(tempRoot, '.agents', 'skills', 'test-isolated-skill');
      const topLevelDirectSkillMd = path.join(tempRoot, '.agents', 'skills', 'SKILL.md');

      let topLevelDirExists = true;
      try {
        await fs.stat(topLevelSkillDir);
      } catch {
        topLevelDirExists = false;
      }
      expect(topLevelDirExists).toBe(false);

      let topLevelFileExists = true;
      try {
        await fs.stat(topLevelDirectSkillMd);
      } catch {
        topLevelFileExists = false;
      }
      expect(topLevelFileExists).toBe(false);
    });

    it('rejects path traversal attempts in skill name', async () => {
      const traversalSkill: DistilledSkill = {
        name: '../../evil-skill',
        description: 'Attempt directory traversal',
      };

      await expect(
        SkillIncubationManager.stageSkill(traversalSkill, { stagingDir })
      ).rejects.toThrow(/traversal|invalid|security/i);

      await expect(
        SkillIncubationManager.discardSkill('../../evil-skill', { stagingDir })
      ).rejects.toThrow(/traversal|invalid|security/i);

      const result = await SkillIncubationManager.getIncubatingSkill('../../evil-skill', {
        stagingDir,
      });
      expect(result).toBeNull();
    });

    it('rejects "." in skill name to prevent root staging directory deletion', async () => {
      await fs.mkdir(stagingDir, { recursive: true });

      const dotSkill: DistilledSkill = {
        name: '.',
        description: 'Attempt staging root deletion via dot',
      };

      await expect(
        SkillIncubationManager.stageSkill(dotSkill, { stagingDir })
      ).rejects.toThrow(/traversal|invalid|security/i);

      await expect(
        SkillIncubationManager.discardSkill('.', { stagingDir })
      ).rejects.toThrow(/traversal|invalid|security/i);

      const result = await SkillIncubationManager.getIncubatingSkill('.', {
        stagingDir,
      });
      expect(result).toBeNull();

      // Ensure stagingDir was NOT removed
      const exists = await fs.stat(stagingDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('stageSkill', () => {
    it('creates skill folder, writes SKILL.md with frontmatter and body, and returns file path', async () => {
      const skill: DistilledSkill = {
        name: 'code-analyzer',
        description: 'Performs static analysis on codebases',
        sourceTrack: 'track_analytics_001',
        confidenceScore: 0.88,
        body: '# Code Analyzer\n\nRun static analysis checks.',
      };

      const resultPath = await SkillIncubationManager.stageSkill(skill, { stagingDir });

      expect(resultPath).toBe(path.join(stagingDir, 'code-analyzer', 'SKILL.md'));

      const rawContent = await fs.readFile(resultPath, 'utf8');
      expect(rawContent).toMatch(/^---\r?\n/);
      expect(rawContent).toContain('name: code-analyzer');
      expect(rawContent).toContain('description: Performs static analysis on codebases');
      expect(rawContent).toContain('status: incubating');
      expect(rawContent).toContain('source_track: track_analytics_001');
      expect(rawContent).toContain('confidence_score: 0.88');
      expect(rawContent).toContain('vetting_status: pending');
      expect(rawContent).toContain('# Code Analyzer');
      expect(rawContent).toContain('Run static analysis checks.');
    });

    it('handles skills where content already contains YAML frontmatter', async () => {
      const preformatted = [
        '---',
        'name: existing-skill',
        'description: Already formatted description',
        'custom_key: custom_value',
        '---',
        '',
        '# Existing Skill Body',
        'Steps for existing skill.',
      ].join('\n');

      const skill: DistilledSkill = {
        name: 'existing-skill',
        description: 'Fallback description',
        content: preformatted,
        sourceTrack: 'track_preformat',
        confidenceScore: 0.75,
      };

      const resultPath = await SkillIncubationManager.stageSkill(skill, { stagingDir });
      const rawContent = await fs.readFile(resultPath, 'utf8');

      // Verify custom_key was preserved and superconductor_learning was injected
      expect(rawContent).toContain('custom_key: custom_value');
      expect(rawContent).toContain('superconductor_learning:');
      expect(rawContent).toContain('source_track: track_preformat');
      expect(rawContent).toContain('confidence_score: 0.75');
      expect(rawContent).toContain('# Existing Skill Body');
    });

    it('defaults confidence_score to 0.8 and vetting_status to pending if not provided', async () => {
      const skill: DistilledSkill = {
        name: 'minimal-skill',
        description: 'Minimal skill description',
      };

      const resultPath = await SkillIncubationManager.stageSkill(skill, { stagingDir });
      const rawContent = await fs.readFile(resultPath, 'utf8');

      expect(rawContent).toContain('confidence_score: 0.8');
      expect(rawContent).toContain('vetting_status: pending');
    });
  });

  describe('listIncubating', () => {
    it('returns an empty array if staging directory does not exist', async () => {
      const nonExistentDir = path.join(tempRoot, 'does-not-exist');
      const list = await SkillIncubationManager.listIncubating({ stagingDir: nonExistentDir });
      expect(list).toEqual([]);
    });

    it('lists all incubating skills with parsed frontmatter and metadata', async () => {
      await SkillIncubationManager.stageSkill(
        {
          name: 'skill-alpha',
          description: 'Alpha skill description',
          sourceTrack: 'track_alpha',
          confidenceScore: 0.9,
          body: '# Alpha\nBody alpha.',
        },
        { stagingDir }
      );

      await SkillIncubationManager.stageSkill(
        {
          name: 'skill-beta',
          description: 'Beta skill description',
          sourceTrack: 'track_beta',
          confidenceScore: 0.82,
          body: '# Beta\nBody beta.',
        },
        { stagingDir }
      );

      const list = await SkillIncubationManager.listIncubating({ stagingDir });

      expect(list).toHaveLength(2);
      const names = list.map((s) => s.name).sort();
      expect(names).toEqual(['skill-alpha', 'skill-beta']);

      const alpha = list.find((s) => s.name === 'skill-alpha')!;
      expect(alpha.description).toBe('Alpha skill description');
      expect(alpha.vettingStatus).toBe('pending');
      expect(alpha.confidenceScore).toBe(0.9);
      expect(alpha.sourceTrack).toBe('track_alpha');
      expect(alpha.filePath).toBe(path.join(stagingDir, 'skill-alpha', 'SKILL.md'));
      expect(alpha.body).toContain('Body alpha.');
    });

    it('gracefully handles subdirectories missing SKILL.md without failing', async () => {
      // Create empty subdirectory without SKILL.md
      const emptySubdir = path.join(stagingDir, 'empty-folder');
      await fs.mkdir(emptySubdir, { recursive: true });

      // Stage a valid skill alongside it
      await SkillIncubationManager.stageSkill(
        {
          name: 'valid-skill',
          description: 'Valid skill',
        },
        { stagingDir }
      );

      const list = await SkillIncubationManager.listIncubating({ stagingDir });
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('valid-skill');
    });

    it('gracefully handles malformed frontmatter in SKILL.md without crashing', async () => {
      const badSkillDir = path.join(stagingDir, 'corrupt-skill');
      await fs.mkdir(badSkillDir, { recursive: true });
      const badSkillPath = path.join(badSkillDir, 'SKILL.md');
      await fs.writeFile(
        badSkillPath,
        '---\nname: [invalid yaml\n  unbalanced: : :\n---\n# Raw Text\nFallback',
        'utf8'
      );

      const list = await SkillIncubationManager.listIncubating({ stagingDir });
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('corrupt-skill');
      expect(list[0].vettingStatus).toBe('pending');
      expect(list[0].body).toContain('Fallback');
    });

    it('ignores plain files inside the staging directory', async () => {
      await fs.mkdir(stagingDir, { recursive: true });
      await fs.writeFile(path.join(stagingDir, '.DS_Store'), 'garbage', 'utf8');
      await fs.writeFile(path.join(stagingDir, 'README.txt'), 'readme info', 'utf8');

      const list = await SkillIncubationManager.listIncubating({ stagingDir });
      expect(list).toEqual([]);
    });
  });

  describe('getIncubatingSkill', () => {
    it('returns null if skill does not exist', async () => {
      const found = await SkillIncubationManager.getIncubatingSkill('non-existent', {
        stagingDir,
      });
      expect(found).toBeNull();
    });

    it('returns IncubatingSkillInfo when skill exists', async () => {
      await SkillIncubationManager.stageSkill(
        {
          name: 'targeted-skill',
          description: 'Targeted retrieval test',
          sourceTrack: 'track_target',
          confidenceScore: 0.91,
          body: '# Targeted Skill\nStep 1: Do something.',
        },
        { stagingDir }
      );

      const found = await SkillIncubationManager.getIncubatingSkill('targeted-skill', {
        stagingDir,
      });

      expect(found).not.toBeNull();
      expect(found!.name).toBe('targeted-skill');
      expect(found!.description).toBe('Targeted retrieval test');
      expect(found!.sourceTrack).toBe('track_target');
      expect(found!.confidenceScore).toBe(0.91);
      expect(found!.vettingStatus).toBe('pending');
      expect(found!.body).toContain('Step 1: Do something.');
    });

    it('retrieves skill even if frontmatter name differs slightly from directory name', async () => {
      const customDir = path.join(stagingDir, 'dir-name-skill');
      await fs.mkdir(customDir, { recursive: true });
      const skillMd = [
        '---',
        'name: frontmatter-named-skill',
        'description: Name inside frontmatter',
        'superconductor_learning:',
        '  status: incubating',
        '  vetting_status: pending',
        '---',
        '# Hello',
      ].join('\n');
      await fs.writeFile(path.join(customDir, 'SKILL.md'), skillMd, 'utf8');

      // Can find by frontmatter name
      const byFrontmatter = await SkillIncubationManager.getIncubatingSkill(
        'frontmatter-named-skill',
        { stagingDir }
      );
      expect(byFrontmatter).not.toBeNull();
      expect(byFrontmatter!.name).toBe('frontmatter-named-skill');

      // Can also find by directory name
      const byDir = await SkillIncubationManager.getIncubatingSkill('dir-name-skill', {
        stagingDir,
      });
      expect(byDir).not.toBeNull();
      expect(byDir!.name).toBe('frontmatter-named-skill');
    });
  });

  describe('updateVettingStatus', () => {
    it('updates vetting_status and report in SKILL.md frontmatter', async () => {
      await SkillIncubationManager.stageSkill(
        {
          name: 'audit-skill',
          description: 'Skill to be vetted',
          body: '# Audit\nContent to audit.',
        },
        { stagingDir }
      );

      const report = {
        passed: true,
        score: 98,
        dogmaChecks: ['no_eval', 'valid_frontmatter'],
      };

      const updated = await SkillIncubationManager.updateVettingStatus(
        'audit-skill',
        'passed',
        report,
        { stagingDir }
      );

      expect(updated).toBe(true);

      const refreshed = await SkillIncubationManager.getIncubatingSkill('audit-skill', {
        stagingDir,
      });

      expect(refreshed).not.toBeNull();
      expect(refreshed!.vettingStatus).toBe('passed');
      expect(refreshed!.vettingReport).toEqual(report);
      expect(refreshed!.body).toContain('Content to audit.');

      // Verify the written file contains the updated status
      const raw = await fs.readFile(refreshed!.filePath, 'utf8');
      const parsed = yaml.load(raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)![1]) as any;
      expect(parsed.superconductor_learning.vetting_status).toBe('passed');
      expect(parsed.superconductor_learning.vetting_report).toEqual(report);
    });

    it('supports flagged and rejected statuses', async () => {
      await SkillIncubationManager.stageSkill(
        {
          name: 'flagged-skill',
          description: 'Skill with potential issues',
        },
        { stagingDir }
      );

      const flagged = await SkillIncubationManager.updateVettingStatus(
        'flagged-skill',
        'flagged',
        { reason: 'Contains deprecated tool reference' },
        { stagingDir }
      );
      expect(flagged).toBe(true);

      let item = await SkillIncubationManager.getIncubatingSkill('flagged-skill', { stagingDir });
      expect(item?.vettingStatus).toBe('flagged');

      const rejected = await SkillIncubationManager.updateVettingStatus(
        'flagged-skill',
        'rejected',
        { reason: 'Failed safety policy' },
        { stagingDir }
      );
      expect(rejected).toBe(true);

      item = await SkillIncubationManager.getIncubatingSkill('flagged-skill', { stagingDir });
      expect(item?.vettingStatus).toBe('rejected');
    });

    it('returns false when trying to update a non-existent skill', async () => {
      const result = await SkillIncubationManager.updateVettingStatus(
        'ghost-skill',
        'passed',
        undefined,
        { stagingDir }
      );
      expect(result).toBe(false);
    });
  });

  describe('discardSkill', () => {
    it('deletes the skill directory and returns true', async () => {
      await SkillIncubationManager.stageSkill(
        {
          name: 'doomed-skill',
          description: 'Will be deleted',
          body: '# Doomed',
        },
        { stagingDir }
      );

      const skillPath = path.join(stagingDir, 'doomed-skill', 'SKILL.md');
      expect(await fs.stat(skillPath).then(() => true).catch(() => false)).toBe(true);

      const discarded = await SkillIncubationManager.discardSkill('doomed-skill', { stagingDir });
      expect(discarded).toBe(true);

      // Verify directory no longer exists
      const existsAfter = await fs
        .stat(path.join(stagingDir, 'doomed-skill'))
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);

      // Subsequent get should return null
      const found = await SkillIncubationManager.getIncubatingSkill('doomed-skill', {
        stagingDir,
      });
      expect(found).toBeNull();
    });

    it('returns false when attempting to discard a non-existent skill', async () => {
      const result = await SkillIncubationManager.discardSkill('not-there', { stagingDir });
      expect(result).toBe(false);
    });
  });
});
