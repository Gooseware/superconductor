import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { learnCommand } from '../learn.js';
import { SkillIncubationManager } from '../../learning/incubation-manager.js';
import { CanaryHarness } from '../../learning/canary-harness.js';
import { SkillDogmaValidator } from '../../learning/dogma-validator.js';

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

    it('does not stage candidate skills with vetting_status "passed" when Canary evaluation fails (ADV-2)', async () => {
      const canarySpy = vi.spyOn(CanaryHarness, 'evaluateSkill').mockResolvedValueOnce({
        passed: false,
        score: 0.2,
        executionTimeMs: 15,
        stepsExecuted: 1,
        errors: ['Simulated sandbox execution error'],
        warnings: [],
      });

      const code = await learnCommand(['--harvest', '--track', 'track_sample_harvest'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(0);
      expect(canarySpy).toHaveBeenCalled();

      const incubating = await SkillIncubationManager.listIncubating({
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(incubating.length).toBe(1);
      // Canary failed, so vetting_status must NOT be 'passed'; it must be 'rejected'
      expect(incubating[0].vettingStatus).toBe('rejected');
      expect((incubating[0].vettingReport as any)?.canary).toBeDefined();
      expect((incubating[0].vettingReport as any)?.canary?.passed).toBe(false);

      canarySpy.mockRestore();
    });

    it('stages candidate skill with vetting_status "passed" when both Dogma and Canary pass without warnings (ADV-2)', async () => {
      const dogmaSpy = vi.spyOn(SkillDogmaValidator, 'validate').mockReturnValueOnce({
        valid: true,
        status: 'passed',
        violations: [],
        warnings: [],
      });
      const canarySpy = vi.spyOn(CanaryHarness, 'evaluateSkill').mockResolvedValueOnce({
        passed: true,
        score: 1.0,
        executionTimeMs: 10,
        stepsExecuted: 2,
        errors: [],
        warnings: [],
      });

      const code = await learnCommand(['--harvest', '--track', 'track_sample_harvest'], {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(code).toBe(0);
      expect(dogmaSpy).toHaveBeenCalled();
      expect(canarySpy).toHaveBeenCalled();

      const incubating = await SkillIncubationManager.listIncubating({
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(incubating.length).toBe(1);
      expect(incubating[0].vettingStatus).toBe('passed');
      expect((incubating[0].vettingReport as any)?.canary?.passed).toBe(true);
      expect((incubating[0].vettingReport as any)?.dogma?.valid).toBe(true);

      canarySpy.mockRestore();
      dogmaSpy.mockRestore();
    });

    describe('--remediations flag (micro-skill harvesting)', () => {
    const setupRemediationTrack = async (trackName = 'track_remediation_cycle') => {
      const trackDir = path.join(tempRoot, 'superconductor', 'tracks', trackName);
      await fs.mkdir(trackDir, { recursive: true });

      const metaContent = JSON.stringify({
        id: trackName,
        status: 'completed',
        goal: 'Track demonstrating remediation cycle',
      });
      await fs.writeFile(path.join(trackDir, 'metadata.json'), metaContent, 'utf8');

      const transcriptContent = [
        JSON.stringify({
          stepIndex: 0,
          tool: 'run_command',
          input: { CommandLine: 'npm test' },
          output: 'FAIL: Path traversal vulnerability detected in server.ts',
          status: 'error',
        }),
        JSON.stringify({
          stepIndex: 1,
          tool: 'replace_file_content',
          input: {
            TargetFile: 'src/server.ts',
            TargetContent: 'path.join(root, p)',
            ReplacementContent: 'path.resolve(root, p)',
          },
          output: 'Content replaced successfully',
          status: 'success',
        }),
        JSON.stringify({
          stepIndex: 2,
          tool: 'run_command',
          input: { CommandLine: 'npm test' },
          output: 'PASS: All assertions passed',
          status: 'success',
        }),
      ].join('\n');

      await fs.writeFile(path.join(trackDir, 'transcript.jsonl'), transcriptContent, 'utf8');
      return trackDir;
    };

    it('successfully harvests and stages micro-skills from mock track with remediation pairs', async () => {
      await setupRemediationTrack('track_with_remediation');

      const code = await learnCommand(
        ['--harvest', '--remediations', '--track', 'track_with_remediation'],
        {
          projectRoot: tempRoot,
          stagingDir,
        }
      );

      expect(code).toBe(0);
      const output = getOutput(logSpy);
      expect(output).toContain('Harvested micro-skill');
      expect(output).toContain('from remediation cycle');
      expect(output).toContain('status:');
      expect(output).toContain('confidence:');

      const incubating = await SkillIncubationManager.listIncubating({
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(incubating.length).toBeGreaterThanOrEqual(1);
      const skill = incubating[0];
      expect(skill.sourceTrack).toBe('track_with_remediation');
      expect(skill.vettingStatus).toBeDefined();

      const skillDetails = await SkillIncubationManager.getIncubatingSkill(skill.name, {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(skillDetails?.content).toContain('## Anti-Patterns & Common Traps');
      expect(skillDetails?.content).toContain('## Hardened Implementation Pattern');
      expect(skillDetails?.vettingReport).toBeDefined();
    });

    it('runs both Dogma and Canary gates on each micro-skill', async () => {
      await setupRemediationTrack('track_gates_test');

      const dogmaSpy = vi.spyOn(SkillDogmaValidator, 'validate');
      const canarySpy = vi.spyOn(CanaryHarness, 'evaluateSkill');

      const code = await learnCommand(
        ['--harvest', '--remediations', '--track', 'track_gates_test'],
        {
          projectRoot: tempRoot,
          stagingDir,
        }
      );

      expect(code).toBe(0);
      expect(dogmaSpy).toHaveBeenCalled();
      expect(canarySpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: expect.any(String) }),
        expect.objectContaining({ projectRoot: tempRoot })
      );

      dogmaSpy.mockRestore();
      canarySpy.mockRestore();
    });

    it('sets vettingStatus to rejected if Canary gate fails on micro-skill', async () => {
      await setupRemediationTrack('track_canary_fail');

      const canarySpy = vi.spyOn(CanaryHarness, 'evaluateSkill').mockResolvedValueOnce({
        passed: false,
        score: 0.1,
        executionTimeMs: 12,
        stepsExecuted: 1,
        errors: ['Canary sandbox assertion failure'],
        warnings: [],
      });

      const code = await learnCommand(
        ['--harvest', '--remediations', '--track', 'track_canary_fail'],
        {
          projectRoot: tempRoot,
          stagingDir,
        }
      );

      expect(code).toBe(0);
      const output = getOutput(logSpy);
      expect(output).toContain('status: rejected');

      const incubating = await SkillIncubationManager.listIncubating({
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(incubating.length).toBe(1);
      expect(incubating[0].vettingStatus).toBe('rejected');

      canarySpy.mockRestore();
    });

    it('supports --json flag output returning an array of staged skill summaries', async () => {
      await setupRemediationTrack('track_json_rem');

      const code = await learnCommand(
        ['--harvest', '--remediations', '--track', 'track_json_rem', '--json'],
        {
          projectRoot: tempRoot,
          stagingDir,
        }
      );

      expect(code).toBe(0);
      const rawJson = logSpy.mock.calls[0][0] as string;
      const summaries = JSON.parse(rawJson);
      expect(Array.isArray(summaries)).toBe(true);
      expect(summaries.length).toBeGreaterThanOrEqual(1);

      const summary = summaries[0];
      expect(summary.success).toBe(true);
      expect(summary.skill).toBeDefined();
      expect(summary.name).toBeDefined();
      expect(summary.path).toBeDefined();
      expect(summary.vettingStatus).toBeDefined();
      expect(typeof summary.confidenceScore).toBe('number');
      expect(summary.sourceTrack).toBe('track_json_rem');
      expect(summary.vettingReport).toBeDefined();
    });

    it('handles tracks without remediation pairs gracefully', async () => {
      // track_sample_harvest has no remediation pairs
      const code = await learnCommand(
        ['--harvest', '--remediations', '--track', 'track_sample_harvest'],
        {
          projectRoot: tempRoot,
          stagingDir,
        }
      );

      expect(code).toBe(0);
      const output = getOutput(logSpy);
      expect(output).toContain('No remediation micro-skills found or distilled');

      // Also verify --json output returns empty array gracefully
      logSpy.mockClear();
      const codeJson = await learnCommand(
        ['--harvest', '--remediations', '--track', 'track_sample_harvest', '--json'],
        {
          projectRoot: tempRoot,
          stagingDir,
        }
      );

      expect(codeJson).toBe(0);
      const rawJson = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(rawJson);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toEqual([]);
    });

    it('automatically distills micro-skills when remediation pairs exist even without explicit --remediations flag', async () => {
      await setupRemediationTrack('track_auto_rem');

      const code = await learnCommand(['--harvest', '--track', 'track_auto_rem'], {
        projectRoot: tempRoot,
        stagingDir,
      });

      expect(code).toBe(0);
      const output = getOutput(logSpy);
      expect(output).toContain('Harvested micro-skill');
      expect(output).toContain('from remediation cycle');
    });
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
