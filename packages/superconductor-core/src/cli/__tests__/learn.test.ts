import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { learnCommand } from '../learn.js';
import { SkillIncubationManager } from '../../learning/incubation-manager.js';

describe('learnCommand CLI Handler', () => {
  let tempRoot: string;
  let stagingDir: string;
  let globalDir: string;
  let logSpy: any;
  let errorSpy: any;

  const getOutput = (spy: any): string => {
    return spy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
  };

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-learn-cli-test-'));
    stagingDir = path.join(tempRoot, '.agents', 'skills', 'incubating');
    globalDir = path.join(tempRoot, 'global_skills');
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.mkdir(globalDir, { recursive: true });

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const stageTestSkill = async (
    name: string,
    vettingStatus: 'passed' | 'pending' | 'flagged' | 'rejected' = 'pending',
    confidenceScore: number = 0.85,
    sourceTrack: string = 'track_test_123'
  ) => {
    return SkillIncubationManager.stageSkill(
      {
        name,
        description: `Test description for ${name}`,
        sourceTrack,
        confidenceScore,
        body: `# ${name}\n\nProcedure body content.`,
        learningMetadata: {
          vetting_status: vettingStatus,
        },
      },
      { projectRoot: tempRoot, stagingDir }
    );
  };

  describe('--help and usage', () => {
    it('returns 0 and prints usage when no arguments are provided', async () => {
      const code = await learnCommand([], { projectRoot: tempRoot, stagingDir });
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalled();
      const output = getOutput(logSpy);
      expect(output).toContain('Usage:');
      expect(output).toContain('--list');
      expect(output).toContain('--inspect');
      expect(output).toContain('--promote');
      expect(output).toContain('--discard');
      expect(output).toContain('--harvest');
    });

    it('returns 0 and prints usage when --help is passed', async () => {
      const code = await learnCommand(['--help'], { projectRoot: tempRoot, stagingDir });
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalled();
      const output = getOutput(logSpy);
      expect(output).toContain('Usage:');
    });

    it('returns 1 when an unknown subcommand or flag is passed', async () => {
      const code = await learnCommand(['--unknown-flag'], { projectRoot: tempRoot, stagingDir });
      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalled();
      const errorOutput = getOutput(errorSpy);
      expect(errorOutput).toContain('Unknown subcommand or flag');
    });
  });

  describe('--list subcommand', () => {
    it('returns 0 and notifies when no incubating skills are present', async () => {
      const code = await learnCommand(['--list'], { projectRoot: tempRoot, stagingDir });
      expect(code).toBe(0);
      const output = getOutput(logSpy);
      expect(output).toContain('No incubating skills found');
    });

    it('outputs table or list of incubating skills with confidence, status, and source', async () => {
      await stageTestSkill('skill-alpha', 'pending', 0.82, 'track_alpha');
      await stageTestSkill('skill-beta', 'passed', 0.95, 'track_beta');

      const code = await learnCommand(['--list'], { projectRoot: tempRoot, stagingDir });
      expect(code).toBe(0);
      const output = getOutput(logSpy);
      expect(output).toContain('skill-alpha');
      expect(output).toContain('pending');
      expect(output).toContain('0.82');
      expect(output).toContain('track_alpha');
      expect(output).toContain('skill-beta');
      expect(output).toContain('passed');
      expect(output).toContain('0.95');
      expect(output).toContain('track_beta');
    });

    it('supports --json flag to output JSON array of skills', async () => {
      await stageTestSkill('skill-json-1', 'passed', 0.91, 'track_json');

      const code = await learnCommand(['--list', '--json'], { projectRoot: tempRoot, stagingDir });
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0].name).toBe('skill-json-1');
      expect(parsed[0].vettingStatus).toBe('passed');
      expect(parsed[0].confidenceScore).toBe(0.91);
      expect(parsed[0].sourceTrack).toBe('track_json');
    });
  });

  describe('--inspect subcommand', () => {
    it('returns 1 if missing skill argument', async () => {
      const code = await learnCommand(['--inspect'], { projectRoot: tempRoot, stagingDir });
      expect(code).toBe(1);
      const output = getOutput(errorSpy);
      expect(output).toContain('Missing skill name');
    });

    it('returns 1 if skill does not exist', async () => {
      const code = await learnCommand(['--inspect', 'nonexistent-skill'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(1);
      const output = getOutput(errorSpy);
      expect(output).toContain('not found in incubation staging');
    });

    it('returns 1 if nonexistent skill inspected with --json', async () => {
      const code = await learnCommand(['--inspect', 'nonexistent-skill', '--json'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(1);
      const output = getOutput(errorSpy);
      const parsed = JSON.parse(output);
      expect(parsed.error).toContain('not found');
    });

    it('prints full SKILL.md and vetting report for existing skill', async () => {
      await stageTestSkill('skill-to-inspect', 'passed', 0.88, 'track_inspect');

      const code = await learnCommand(['--inspect', 'skill-to-inspect'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(0);
      const output = getOutput(logSpy);
      expect(output).toContain('skill-to-inspect');
      expect(output).toContain('Vetting Status: passed');
      expect(output).toContain('0.88');
      expect(output).toContain('Procedure body content');
      expect(output).toContain('Vetting Report');
    });

    it('supports --inspect=<skill> syntax and --json output', async () => {
      await stageTestSkill('skill-eq-inspect', 'flagged', 0.73, 'track_flagged');

      const code = await learnCommand(['--inspect=skill-eq-inspect', '--json'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(0);
      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.name).toBe('skill-eq-inspect');
      expect(parsed.vettingStatus).toBe('flagged');
      expect(parsed.confidenceScore).toBe(0.73);
      expect(parsed.content).toContain('skill-eq-inspect');
    });
  });

  describe('--promote subcommand', () => {
    it('returns 1 if missing skill argument', async () => {
      const code = await learnCommand(['--promote'], { projectRoot: tempRoot, stagingDir });
      expect(code).toBe(1);
      const output = getOutput(errorSpy);
      expect(output).toContain('Missing skill name');
    });

    it('returns 1 if skill does not exist', async () => {
      const code = await learnCommand(['--promote', 'nonexistent-skill'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(1);
      const output = getOutput(errorSpy);
      expect(output).toContain('not found in incubation staging');
    });

    it('refuses promotion if vetting status is not passed (invariant check)', async () => {
      await stageTestSkill('unvetted-skill', 'pending', 0.85);

      const code = await learnCommand(['--promote', 'unvetted-skill'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(1);
      const output = getOutput(errorSpy);
      expect(output).toContain('Invariant requires status "passed"');

      // Verify not moved to active project skills
      const targetPath = path.join(tempRoot, '.agents', 'skills', 'unvetted-skill', 'SKILL.md');
      await expect(fs.stat(targetPath)).rejects.toThrow();
    });

    it('promotes vetted skill to project scope by default and removes from staging', async () => {
      await stageTestSkill('vetted-skill', 'passed', 0.92, 'track_vetted');

      const code = await learnCommand(['--promote', 'vetted-skill'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(0);
      const output = getOutput(logSpy);
      expect(output).toContain('Promoted skill "vetted-skill" to project scope');

      // Verify active destination
      const targetPath = path.join(tempRoot, '.agents', 'skills', 'vetted-skill', 'SKILL.md');
      const stat = await fs.stat(targetPath);
      expect(stat.isFile()).toBe(true);

      // Verify status in target SKILL.md updated to active
      const content = await fs.readFile(targetPath, 'utf8');
      expect(content).toContain('status: active');

      // Verify removed from staging
      const stagingCheck = path.join(stagingDir, 'vetted-skill');
      await expect(fs.stat(stagingCheck)).rejects.toThrow();
    });

    it('promotes vetted skill to global scope when --scope global is specified', async () => {
      await stageTestSkill('global-candidate', 'passed', 0.96, 'track_global');

      const code = await learnCommand(['--promote', 'global-candidate', '--scope', 'global'], {
        projectRoot: tempRoot,
        stagingDir,
        globalSkillsDir: globalDir,
      });
      expect(code).toBe(0);
      const output = getOutput(logSpy);
      expect(output).toContain('Promoted skill "global-candidate" to global scope');

      const targetPath = path.join(globalDir, 'global-candidate', 'SKILL.md');
      const stat = await fs.stat(targetPath);
      expect(stat.isFile()).toBe(true);
    });

    it('rejects invalid scope argument', async () => {
      await stageTestSkill('skill-scope-test', 'passed', 0.95);

      const code = await learnCommand(['--promote', 'skill-scope-test', '--scope', 'invalid_scope'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(1);
      const output = getOutput(errorSpy);
      expect(output).toContain('Invalid scope');
    });

    it('supports --json flag on promotion', async () => {
      await stageTestSkill('json-promote-skill', 'passed', 0.94);

      const code = await learnCommand(['--promote=json-promote-skill', '--json'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(0);
      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.skillName).toBe('json-promote-skill');
      expect(parsed.scope).toBe('project');
    });
  });

  describe('--discard subcommand', () => {
    it('returns 1 if missing skill argument', async () => {
      const code = await learnCommand(['--discard'], { projectRoot: tempRoot, stagingDir });
      expect(code).toBe(1);
      const output = getOutput(errorSpy);
      expect(output).toContain('Missing skill name');
    });

    it('returns 1 if skill does not exist', async () => {
      const code = await learnCommand(['--discard', 'nonexistent-skill'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(1);
      const output = getOutput(errorSpy);
      expect(output).toContain('not found in incubation staging');
    });

    it('discards incubating skill from staging storage and returns 0', async () => {
      await stageTestSkill('skill-to-discard', 'pending', 0.7);

      const code = await learnCommand(['--discard', 'skill-to-discard'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(0);
      const output = getOutput(logSpy);
      expect(output).toContain('Discarded incubating skill "skill-to-discard"');

      // Verify removed from disk
      const checkPath = path.join(stagingDir, 'skill-to-discard');
      await expect(fs.stat(checkPath)).rejects.toThrow();
    });

    it('supports --discard=<skill> with --json', async () => {
      await stageTestSkill('skill-json-discard', 'flagged', 0.65);

      const code = await learnCommand(['--discard=skill-json-discard', '--json'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(0);
      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.skill).toBe('skill-json-discard');
      expect(parsed.action).toBe('discard');
    });
  });

  describe('--harvest subcommand', () => {
    let trackDir: string;

    beforeEach(async () => {
      trackDir = path.join(tempRoot, 'superconductor', 'tracks', 'track_sample_harvest');
      await fs.mkdir(trackDir, { recursive: true });

      const planContent = `# Plan for sample harvest
- [x] Task: Step 1 executed successfully
- [x] Task: Step 2 executed successfully
`;
      await fs.writeFile(path.join(trackDir, 'plan.md'), planContent, 'utf8');

      const metaContent = JSON.stringify({
        id: 'track_sample_harvest',
        status: 'completed',
        goal: 'Sample Harvest Track',
      });
      await fs.writeFile(path.join(trackDir, 'metadata.json'), metaContent, 'utf8');
    });

    it('harvests track, distills workflow, validates dogma, and stages new skill', async () => {
      const code = await learnCommand(['--harvest', '--track', 'track_sample_harvest'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(0);
      const output = getOutput(logSpy);
      expect(output).toContain('Harvested and distilled skill');

      const incubating = await SkillIncubationManager.listIncubating({
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(incubating.length).toBeGreaterThanOrEqual(1);
      expect(incubating[0].sourceTrack).toBe('track_sample_harvest');
    });

    it('supports --harvest with --json flag', async () => {
      const code = await learnCommand(['--harvest', '--track=track_sample_harvest', '--json'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(0);
      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.harvested).toBe(true);
      expect(parsed.distilled).toBe(true);
      expect(parsed.skill).toBeDefined();
    });

    it('returns 1 with informative message if specified track does not exist', async () => {
      const code = await learnCommand(['--harvest', '--track', 'nonexistent_track_xyz'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(1);
      const output = getOutput(errorSpy);
      expect(output).toContain('Track path not found');
    });
  });

  describe('CLI Dispatcher Wiring (runCli)', () => {
    it('dispatches to learnCommand through runCli', async () => {
      const { runCli } = await import('../index.js');
      // Pass --help through runCli to verify integration
      await runCli(['learn', '--help']);
      const output = getOutput(logSpy);
      expect(output).toContain('Superconductor Continuous Learning Engine');
      expect(output).toContain('Usage:');
    });
  });

  describe('Non-interactive graceful execution', () => {
    it('catches unexpected errors gracefully without unhandled exceptions', async () => {
      const code = await learnCommand(['--list'], {
        stagingDir: '\0invalid-path', // triggers fs error
      });
      expect(code).toBe(0); // listIncubating handles missing/invalid dir gracefully with []
    });
  });
});
