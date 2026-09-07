import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  TrajectoryHarvester,
  WorkflowSkillDistiller,
  SkillDogmaValidator,
  CanaryHarness,
  SkillIncubationManager,
  SkillPromoter,
  ExperienceRecord,
  RemediationPair,
} from '../../src/learning/index.js';
import { learnCommand } from '../../src/cli/learn.js';
import { NoteWriter, NoteEntry, NoteWriterOptions } from '../../src/notebook/note-writer.js';

describe('Contrastive Learning Engine - End-to-End Integration Test Suite', () => {
  let tempSandbox: string;
  let tracksDir: string;
  let stagingDir: string;
  let activeSkillsDir: string;
  let globalSkillsDir: string;
  let dispatchedNotes: Array<{ entry: NoteEntry; options: NoteWriterOptions }>;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(async () => {
    // Scaffold isolated temporary sandbox using mkdtempSync
    tempSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-contrastive-e2e-'));
    tracksDir = path.join(tempSandbox, 'superconductor', 'tracks');
    stagingDir = path.join(tempSandbox, '.agents', 'skills', 'incubating');
    activeSkillsDir = path.join(tempSandbox, '.agents', 'skills');
    globalSkillsDir = path.join(tempSandbox, 'global_skills');

    await fsp.mkdir(tracksDir, { recursive: true });
    await fsp.mkdir(stagingDir, { recursive: true });
    await fsp.mkdir(activeSkillsDir, { recursive: true });
    await fsp.mkdir(globalSkillsDir, { recursive: true });

    // Intercept NoteWriter to verify notes without external process side-effects
    dispatchedNotes = [];
    NoteWriter.setDispatcher(async (entry, options) => {
      dispatchedNotes.push({ entry, options });
      return { id: `mock-note-${Date.now()}` };
    });

    // Spy on console output for CLI learnCommand verification
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    NoteWriter.setDispatcher(null);
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    // Clean up temporary sandbox directory
    try {
      await fsp.rm(tempSandbox, { recursive: true, force: true });
    } catch {
      // Ignore temporary cleanup errors
    }
  });

  const getLogOutput = (): string => {
    return consoleLogSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
  };

  const getErrorOutput = (): string => {
    return consoleErrorSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
  };

  describe('End-to-End Contrastive Micro-Skill Lifecycle Pipeline', () => {
    it('executes full contrastive lifecycle: scaffold -> harvest -> distill -> validate -> evaluate -> stage -> CLI promote', async () => {
      // -----------------------------------------------------------------------
      // Step 1: Scaffold mock track directory with spec, plan, metadata, transcript
      // -----------------------------------------------------------------------
      const trackId = 'security_path_traversal_hardening_20260907';
      const mockTrackDir = path.join(tracksDir, trackId);
      await fsp.mkdir(mockTrackDir, { recursive: true });

      const specContent = `# Spec: Static File Server Path Traversal Containment

**Track ID:** \`${trackId}\`
**Type:** Bugfix
**Status:** Completed

## Overview
Harden static file serving endpoint against directory traversal attacks and arbitrary file access outside the sandbox root.
`;
      await fsp.writeFile(path.join(mockTrackDir, 'spec.md'), specContent, 'utf8');

      const planContent = `# Plan: Path Traversal Containment

**Track ID:** \`${trackId}\`

- [x] Task: Inspect existing static file server implementation
- [x] Task: Execute preflight test suite and detect path traversal defect
- [x] Task: Apply path containment boundary validation via replace_file_content
- [x] Task: Verify test suite passes with zero regressions
`;
      await fsp.writeFile(path.join(mockTrackDir, 'plan.md'), planContent, 'utf8');

      const metadataContent = JSON.stringify({
        trackId,
        goal: 'Contain static file server within root boundary and resolve path traversal vulnerability',
        outcome: 'success',
        tags: ['security', 'sandbox', 'path-traversal'],
      });
      await fsp.writeFile(path.join(mockTrackDir, 'metadata.json'), metadataContent, 'utf8');

      // Scaffold realistic transcript.jsonl with failure step and remediation sequence
      const transcriptEvents = [
        {
          stepIndex: 0,
          tool: 'view_file',
          input: {
            AbsolutePath: 'src/server.ts',
            toolSummary: 'Inspect static file handler',
          },
          output: 'function serveFile(p) { return fs.readFileSync(path.join(root, p)); }',
          status: 'success',
        },
        {
          stepIndex: 1,
          tool: 'run_command',
          input: {
            CommandLine: 'npm test -- --run tests/path-containment.test.ts',
            toolSummary: 'Run path containment test suite',
          },
          output:
            'FAIL tests/path-containment.test.ts\nAssertionError: Path traversal vulnerability: expected path /etc/passwd to be contained within sandbox root\n at testTraversal (tests/path-containment.test.ts:42)',
          status: 'error',
          exitCode: 1,
        },
        {
          stepIndex: 2,
          tool: 'replace_file_content',
          input: {
            TargetFile: 'src/server.ts',
            toolSummary: 'Apply path traversal containment boundary check',
            TargetContent: 'return fs.readFileSync(path.join(root, p));',
            ReplacementContent:
              'const safe = path.resolve(root, p);\nif (!safe.startsWith(root + path.sep)) {\n  throw new Error("Path traversal outside sandbox root");\n}\nreturn fs.readFileSync(safe);',
          },
          output: { success: true },
          status: 'success',
        },
        {
          stepIndex: 3,
          tool: 'run_command',
          input: {
            CommandLine: 'npm test -- --run tests/path-containment.test.ts',
            toolSummary: 'Re-run path containment verification test suite',
          },
          output: 'PASS tests/path-containment.test.ts\nAll 12 assertions passed (exit code 0)',
          status: 'success',
          exitCode: 0,
        },
      ];

      const transcriptJsonl = transcriptEvents.map((evt) => JSON.stringify(evt)).join('\n') + '\n';
      await fsp.writeFile(path.join(mockTrackDir, 'transcript.jsonl'), transcriptJsonl, 'utf8');

      // -----------------------------------------------------------------------
      // Step 2: Harvest the track via TrajectoryHarvester.harvestTrack
      // -----------------------------------------------------------------------
      const harvested = await TrajectoryHarvester.harvestTrack(mockTrackDir);
      expect(harvested).not.toBeNull();
      const record = harvested as ExperienceRecord;

      expect(record.trackId).toBe(trackId);
      expect(record.steps.length).toBe(4);
      expect(record.outcome).toBe('success');

      // Verify that record.remediationPairs is populated with errorSummary, failureStep, and resolutionSteps
      expect(record.remediationPairs).toBeDefined();
      expect(record.remediationPairs!.length).toBeGreaterThanOrEqual(1);

      const pair = record.remediationPairs![0];
      expect(pair.failureStep).toBeDefined();
      expect(pair.failureStep.tool).toBe('run_command');
      expect(pair.failureStep.status).toBe('error');

      expect(pair.errorSummary).toBeDefined();
      expect(pair.errorSummary.toLowerCase()).toContain('path traversal');

      expect(pair.resolutionSteps).toBeDefined();
      expect(pair.resolutionSteps.length).toBe(2);
      expect(pair.resolutionSteps[0].tool).toBe('replace_file_content');
      expect(pair.resolutionSteps[1].tool).toBe('run_command');
      expect(pair.resolutionSteps.every((s) => s.status === 'success')).toBe(true);

      // Verify diffHunk was automatically synthesized from replace_file_content step
      expect(pair.diffHunk).toBeDefined();
      expect(pair.diffHunk).toContain('--- a/src/server.ts');
      expect(pair.diffHunk).toContain('+++ b/src/server.ts');

      // -----------------------------------------------------------------------
      // Step 3: Distill micro-skills using WorkflowSkillDistiller.distillRemediationMicroSkills
      // -----------------------------------------------------------------------
      const microSkills = WorkflowSkillDistiller.distillRemediationMicroSkills(record);
      expect(microSkills).toHaveLength(1);

      const microSkill = microSkills[0];

      // Invariant: Crisp and kebab-case skill name
      expect(microSkill.name).toBe('path-traversal-containment');
      expect(microSkill.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(microSkill.sourceTrackId).toBe(trackId);
      expect(microSkill.confidenceScore).toBeGreaterThanOrEqual(0.8);

      // Invariant: Contrastive markdown section headers
      expect(microSkill.content).toContain(
        '## Anti-Patterns & Common Traps (Where Things Go Wrong)'
      );
      expect(microSkill.content).toContain(
        '## Hardened Implementation Pattern (Where Things Go Right)'
      );
      expect(microSkill.content).toContain('## Workflow & Procedure');
      expect(microSkill.content).toContain('## Invariants & Rules');
      expect(microSkill.content).toContain('## Verification Recipe');

      // Invariant: Procedural steps do NOT exceed 15 steps
      const procedureMatch = microSkill.content.match(
        /## Workflow & Procedure\s*\n([\s\S]*?)(?=\n##|$)/
      );
      expect(procedureMatch).not.toBeNull();
      const procedureSteps = procedureMatch![1]
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^\d+\.\s+/.test(l));
      expect(procedureSteps.length).toBeGreaterThan(0);
      expect(procedureSteps.length).toBeLessThanOrEqual(15);

      // -----------------------------------------------------------------------
      // Step 4: Validate with SkillDogmaValidator.validate
      // -----------------------------------------------------------------------
      const dogmaReport = SkillDogmaValidator.validate(microSkill.content);
      expect(dogmaReport.valid).toBe(true);
      expect(dogmaReport.status).toBe('passed');
      expect(dogmaReport.violations.filter((v) => v.severity === 'error')).toHaveLength(0);

      // -----------------------------------------------------------------------
      // Step 5: Evaluate with CanaryHarness.evaluateSkill
      // -----------------------------------------------------------------------
      const canaryReport = await CanaryHarness.evaluateSkill(microSkill, {
        baseDir: tempSandbox,
        timeoutMs: 15000,
      });

      expect(canaryReport.passed).toBe(true);
      expect(canaryReport.score).toBeGreaterThanOrEqual(0.8);
      expect(canaryReport.errors).toHaveLength(0);
      expect(canaryReport.stepsExecuted).toBeGreaterThanOrEqual(1);

      // -----------------------------------------------------------------------
      // Step 6: Stage the micro-skill & execute learnCommand CLI lifecycle
      // -----------------------------------------------------------------------
      const stagedFilePath = await SkillIncubationManager.stageSkill(microSkill, {
        projectRoot: tempSandbox,
        stagingDir,
      });

      expect(fs.existsSync(stagedFilePath)).toBe(true);
      expect(stagedFilePath).toBe(
        path.join(stagingDir, 'path-traversal-containment', 'SKILL.md')
      );

      // Sandbox isolation check: skill is NOT present in active library prior to promotion
      const activePreCheck = path.join(
        activeSkillsDir,
        'path-traversal-containment',
        'SKILL.md'
      );
      expect(fs.existsSync(activePreCheck)).toBe(false);

      // CLI: --list subcommand
      consoleLogSpy.mockClear();
      const listCode = await learnCommand(['--list'], {
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(listCode).toBe(0);
      const listText = getLogOutput();
      expect(listText).toContain('path-traversal-containment');
      expect(listText).toContain(trackId);

      // CLI: --inspect <skill> subcommand
      consoleLogSpy.mockClear();
      const inspectCode = await learnCommand(
        ['--inspect', 'path-traversal-containment'],
        {
          projectRoot: tempSandbox,
          stagingDir,
        }
      );
      expect(inspectCode).toBe(0);
      const inspectText = getLogOutput();
      expect(inspectText).toContain('path-traversal-containment');
      expect(inspectText).toContain('Anti-Patterns & Common Traps');
      expect(inspectText).toContain('Hardened Implementation Pattern');

      // CLI: --promote <skill> --scope project subcommand
      consoleLogSpy.mockClear();
      const promoteCode = await learnCommand(
        ['--promote', 'path-traversal-containment', '--scope', 'project'],
        {
          projectRoot: tempSandbox,
          stagingDir,
        }
      );
      expect(promoteCode).toBe(0);
      const promoteText = getLogOutput();
      expect(promoteText).toContain(
        'Promoted skill "path-traversal-containment" to project scope'
      );

      // Verify active destination exists and is active
      expect(fs.existsSync(activePreCheck)).toBe(true);
      const activeContent = await fsp.readFile(activePreCheck, 'utf8');
      expect(activeContent).toContain('status: active');
      expect(activeContent).toContain('promotion_scope: project');
      expect(activeContent).toContain('path-traversal-containment');

      // Verify staging directory was cleanly removed
      const stagedPostCheck = path.join(stagingDir, 'path-traversal-containment');
      expect(fs.existsSync(stagedPostCheck)).toBe(false);

      // Verify NoteWriter procedure note was recorded
      const procedureNotes = dispatchedNotes.filter(
        (n) => n.entry.note_type === 'procedure'
      );
      expect(procedureNotes.length).toBeGreaterThanOrEqual(1);
      const lastNote = procedureNotes[procedureNotes.length - 1];
      expect(lastNote.options.domain).toBe('learning');
      expect(lastNote.entry.content).toContain(
        '[LEARN] Promoted skill path-traversal-containment'
      );

      // -----------------------------------------------------------------------
      // Step 7: Verify sandbox isolation and cleanup
      // -----------------------------------------------------------------------
      // Temporary canary sandboxes were reliably removed
      const tempEntries = await fsp.readdir(tempSandbox);
      const leftoverCanaryDirs = tempEntries.filter((e) =>
        e.startsWith('canary-sandbox-')
      );
      expect(leftoverCanaryDirs).toHaveLength(0);
    });

    it('scaffolds shell pattern regex remediation and distills shell-pattern-regex-hardening micro-skill', async () => {
      const trackId = 'security_shell_regex_hardening_20260907';
      const mockTrackDir = path.join(tracksDir, trackId);
      await fsp.mkdir(mockTrackDir, { recursive: true });

      const specContent = `# Spec: Prohibited Shell Pattern Regex Hardening

**Track ID:** \`${trackId}\`
**Type:** Bugfix

## Overview
Harden shell pattern regex checks to prevent bypass of prohibited commands.
`;
      await fsp.writeFile(path.join(mockTrackDir, 'spec.md'), specContent, 'utf8');

      const metadataContent = JSON.stringify({
        trackId,
        goal: 'Harden prohibited shell pattern regex validation against bypass tricks',
        outcome: 'success',
        tags: ['security', 'shell-pattern', 'regex-hardening'],
      });
      await fsp.writeFile(path.join(mockTrackDir, 'metadata.json'), metadataContent, 'utf8');

      const transcriptEvents = [
        {
          stepIndex: 0,
          tool: 'run_command',
          input: {
            CommandLine: 'npm test -- --run tests/shell-patterns.test.ts',
            toolSummary: 'Run prohibited shell pattern validation tests',
          },
          output:
            'FAIL tests/shell-patterns.test.ts\nAssertionError: Prohibited shell pattern regex bypass detected for destructive rm invocation',
          status: 'error',
          exitCode: 1,
        },
        {
          stepIndex: 1,
          tool: 'replace_file_content',
          input: {
            TargetFile: 'src/validator.ts',
            toolSummary: 'Harden shell pattern regex with comprehensive flag matching',
            TargetContent: 'const pattern = /rm\\s+-rf/i;',
            ReplacementContent:
              'const pattern = /rm\\s+(-[a-zA-Z]*[rf][a-zA-Z]*|--recursive|--force)/i;',
          },
          output: { success: true },
          status: 'success',
        },
        {
          stepIndex: 2,
          tool: 'run_command',
          input: {
            CommandLine: 'npm test -- --run tests/shell-patterns.test.ts',
            toolSummary: 'Verify shell pattern regex hardening passes',
          },
          output: 'PASS tests/shell-patterns.test.ts\nAll tests passed',
          status: 'success',
          exitCode: 0,
        },
      ];

      const transcriptJsonl = transcriptEvents.map((evt) => JSON.stringify(evt)).join('\n') + '\n';
      await fsp.writeFile(path.join(mockTrackDir, 'transcript.jsonl'), transcriptJsonl, 'utf8');

      // Harvest track
      const record = (await TrajectoryHarvester.harvestTrack(mockTrackDir))!;
      expect(record).not.toBeNull();
      expect(record.remediationPairs).toHaveLength(1);

      // Distill remediation micro-skills
      const microSkills = WorkflowSkillDistiller.distillRemediationMicroSkills(record);
      expect(microSkills).toHaveLength(1);
      const skill = microSkills[0];

      expect(skill.name).toBe('shell-pattern-regex-hardening');
      expect(skill.content).toContain('## Anti-Patterns & Common Traps');
      expect(skill.content).toContain('## Hardened Implementation Pattern');

      // Vetting gate checks
      const dogma = SkillDogmaValidator.validate(skill.content);
      expect(dogma.valid).toBe(true);
      expect(dogma.status).toBe('passed');

      const canary = await CanaryHarness.evaluateSkill(skill, { baseDir: tempSandbox });
      expect(canary.passed).toBe(true);
      expect(canary.score).toBeGreaterThanOrEqual(0.8);

      // Stage and test JSON CLI outputs
      await SkillIncubationManager.stageSkill(skill, {
        projectRoot: tempSandbox,
        stagingDir,
      });

      consoleLogSpy.mockClear();
      const listCode = await learnCommand(['--list', '--json'], {
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(listCode).toBe(0);
      const listJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(listJson.some((s: any) => s.name === 'shell-pattern-regex-hardening')).toBe(true);

      consoleLogSpy.mockClear();
      const inspectCode = await learnCommand(
        ['--inspect', 'shell-pattern-regex-hardening', '--json'],
        {
          projectRoot: tempSandbox,
          stagingDir,
        }
      );
      expect(inspectCode).toBe(0);
      const inspectJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(inspectJson.name).toBe('shell-pattern-regex-hardening');
      expect(inspectJson.content).toContain('shell-pattern-regex-hardening');

      // CLI: discard subcommand
      consoleLogSpy.mockClear();
      const discardCode = await learnCommand(
        ['--discard', 'shell-pattern-regex-hardening', '--json'],
        {
          projectRoot: tempSandbox,
          stagingDir,
        }
      );
      expect(discardCode).toBe(0);
      const discardJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(discardJson.success).toBe(true);
      expect(discardJson.action).toBe('discard');

      const stagedCheck = path.join(stagingDir, 'shell-pattern-regex-hardening');
      expect(fs.existsSync(stagedCheck)).toBe(false);
    });
  });

  describe('Invariant Gate Guardrails & Sandbox Isolation', () => {
    it('blocks promotion of candidate containing prohibited shell commands', async () => {
      // Craft a dangerous candidate skill with rm -rf /
      const dangerousSkill = {
        name: 'destructive-cleanup-skill',
        description: 'Dangerous cleanup command',
        sourceTrack: 'track_sec_trap',
        confidenceScore: 0.9,
        content: `---
name: destructive-cleanup-skill
description: Dangerous cleanup command
superconductor_learning:
  status: incubating
  source_track: track_sec_trap
  confidence_score: 0.9
  vetting_status: pending
---

# destructive-cleanup-skill

## Overview
Dangerous cleanup script.

## Workflow & Procedure
1. Execute \`run_command\` - Clean root: \`rm -rf / --no-preserve-root\`

## Verification Recipe
1. Execute verification command: \`npm test\`
`,
      };

      await SkillIncubationManager.stageSkill(dangerousSkill as any, {
        projectRoot: tempSandbox,
        stagingDir,
      });

      // Attempt to promote via learnCommand
      consoleErrorSpy.mockClear();
      const code = await learnCommand(['--promote', 'destructive-cleanup-skill'], {
        projectRoot: tempSandbox,
        stagingDir,
      });

      expect(code).toBe(1);
      const errorText = getErrorOutput();
      expect(errorText).toMatch(/vetting status is "rejected"|Invariant requires status "passed"/i);

      // Destination in active library must NOT exist
      const activePath = path.join(activeSkillsDir, 'destructive-cleanup-skill');
      expect(fs.existsSync(activePath)).toBe(false);
    });

    it('enforces directory traversal containment during staging and promotion', async () => {
      await expect(
        SkillIncubationManager.stageSkill(
          {
            name: '../../../escape-candidate',
            description: 'Attempt directory traversal',
          } as any,
          { projectRoot: tempSandbox, stagingDir }
        )
      ).rejects.toThrow(/path traversal/i);

      const promoResult = await SkillPromoter.promoteSkill('../../escape-candidate', {
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(promoResult.success).toBe(false);
      expect(promoResult.error).toMatch(/path traversal/i);
    });
  });
});
