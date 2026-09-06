import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  TrajectorySanitizer,
  TrajectoryHarvester,
  InvariantDeduplicator,
  ReflectiveInvariantSynthesizer,
  WorkflowSkillDistiller,
  SkillIncubationManager,
  SkillDogmaValidator,
  CanaryHarness,
  SkillPromoter,
  ExperienceRecord,
  QuorumFeedback,
  DistilledSkill,
} from '../../src/learning/index.js';
import { learnCommand } from '../../src/cli/learn.js';
import { NoteWriter, NoteEntry, NoteWriterOptions } from '../../src/notebook/note-writer.js';

describe('Continuous Learning Engine (CLE) - End-to-End Integration Suite', () => {
  let tempSandbox: string;
  let tracksDir: string;
  let stagingDir: string;
  let activeSkillsDir: string;
  let globalSkillsDir: string;
  let dispatchedNotes: Array<{ entry: NoteEntry; options: NoteWriterOptions }>;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(async () => {
    // 1. Create temporary isolated sandbox root using mkdtempSync
    tempSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-cle-e2e-'));
    tracksDir = path.join(tempSandbox, 'superconductor', 'tracks');
    stagingDir = path.join(tempSandbox, '.agents', 'skills', 'incubating');
    activeSkillsDir = path.join(tempSandbox, '.agents', 'skills');
    globalSkillsDir = path.join(tempSandbox, 'global_skills');

    await fsp.mkdir(tracksDir, { recursive: true });
    await fsp.mkdir(stagingDir, { recursive: true });
    await fsp.mkdir(globalSkillsDir, { recursive: true });

    // 2. Intercept NoteWriter calls to verify procedure notes without spawning external CLI processes
    dispatchedNotes = [];
    NoteWriter.setDispatcher(async (entry, options) => {
      dispatchedNotes.push({ entry, options });
      return { id: `mock-note-${Date.now()}` };
    });

    // 3. Spy on console outputs for CLI verification
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Reset NoteWriter dispatcher
    NoteWriter.setDispatcher(null);

    // Restore console spies
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    // Clean up temporary sandbox directory
    try {
      await fsp.rm(tempSandbox, { recursive: true, force: true });
    } catch {
      // Ignore sandbox cleanup errors
    }
  });

  const getLogOutput = (): string => {
    return consoleLogSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
  };

  const getErrorOutput = (): string => {
    return consoleErrorSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
  };

  describe('Closed-Loop Lifecycle Pipeline', () => {
    it('executes full lifecycle: harvest -> synthesize -> distill -> incubate -> vet -> promote', async () => {
      // -----------------------------------------------------------------------
      // Stage A: Harvester - Ingest mock track files with sensitive data
      // -----------------------------------------------------------------------
      const trackId = 'schema_migration_pipeline_20260906';
      const mockTrackDir = path.join(tracksDir, trackId);
      await fsp.mkdir(mockTrackDir, { recursive: true });

      const specContent = `# Spec: Zero-Downtime Schema Migration

**Track ID:** \`${trackId}\`
**Type:** Feature
**Status:** Completed

## Overview
Automated schema migration pipeline with transactional safety, lock acquisition, and rollback verification.
`;
      await fsp.writeFile(path.join(mockTrackDir, 'spec.md'), specContent, 'utf8');

      const planContent = `# Plan: Schema Migration Pipeline

**Track ID:** \`${trackId}\`

- [x] Task: Generate zero-downtime migration scripts
- [x] Task: Validate migration rollback procedures in dry-run mode
- [x] Task: Execute transactional schema updates
`;
      await fsp.writeFile(path.join(mockTrackDir, 'plan.md'), planContent, 'utf8');

      // Intentionally embed credentials and sensitive API keys in metadata and execution steps
      const sensitiveApiKey = 'sk-ant-api03-secret1234567890abcdef1234567890abcdef';
      const sensitivePassword = 'super_secret_db_password_99';
      const metadataContent = JSON.stringify({
        trackId,
        goal: 'Deploy zero-downtime schema migration pipeline',
        outcome: 'success',
        apiKey: sensitiveApiKey,
        dbPassword: sensitivePassword,
        tags: ['database', 'migration', 'transactions'],
        steps: [
          {
            stepIndex: 0,
            tool: 'run_command',
            input: `PASSWORD="${sensitivePassword}" migrate --dry-run`,
            output: 'Migration dry-run successful with zero table locks',
            status: 'success',
            durationMs: 350,
          },
          {
            stepIndex: 1,
            tool: 'view_file',
            input: { path: 'migrations/001_initial.sql', authKey: sensitiveApiKey },
            output: 'CREATE TABLE customers (id SERIAL PRIMARY KEY, email TEXT NOT NULL);',
            status: 'success',
            durationMs: 80,
          },
          {
            stepIndex: 2,
            tool: 'run_command',
            input: 'npm test -- migration-verification',
            output: '3 tests passed in 1.2s',
            status: 'success',
            durationMs: 1200,
          },
        ],
      });
      await fsp.writeFile(path.join(mockTrackDir, 'metadata.json'), metadataContent, 'utf8');

      const quorumStateContent = JSON.stringify({
        reviews: [
          {
            reviewerRole: 'security-reviewer',
            verdict: 'NEEDS_FIXES',
            findings: [
              'Migration scripts MUST NOT expose database passwords or credentials in plaintext connection strings.',
            ],
          },
          {
            reviewerRole: 'correctness-reviewer',
            verdict: 'NEEDS_FIXES',
            findings: [
              'Database migration runner MUST acquire advisory locks before executing schema mutations.',
            ],
          },
        ],
      });
      await fsp.writeFile(path.join(mockTrackDir, 'quorum-state.json'), quorumStateContent, 'utf8');

      // Harvest the track
      const harvestedRecord = await TrajectoryHarvester.harvestTrack(mockTrackDir);
      expect(harvestedRecord).not.toBeNull();
      const record = harvestedRecord as ExperienceRecord;

      expect(record.trackId).toBe(trackId);
      expect(record.goal).toContain('zero-downtime schema migration');
      expect(record.steps.length).toBe(3);
      expect(record.quorumReviews.length).toBe(2);

      // Verify TrajectorySanitizer stripped sensitive credentials
      const serializedRecord = JSON.stringify(record);
      expect(serializedRecord).not.toContain(sensitiveApiKey);
      expect(serializedRecord).not.toContain(sensitivePassword);
      expect(serializedRecord).toContain('[REDACTED]');

      // Persist ExperienceRecord to trajectory archive
      const trajectoryStorageDir = path.join(tempSandbox, '.superconductor', 'learning', 'trajectories');
      const savedTrajectoryPath = await TrajectoryHarvester.saveRecord(record, trajectoryStorageDir);
      expect(fs.existsSync(savedTrajectoryPath)).toBe(true);

      // Also verify event-log session extraction with sensitive token
      const sessionEvents = [
        { type: 'goal', goal: 'Run database indexing benchmark' },
        {
          type: 'tool_execution',
          tool: 'run_command',
          input: { cmd: 'analyze-db', token: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' },
          output: 'index scan completed',
          status: 'success',
        },
        {
          type: 'tool_execution',
          tool: 'run_command',
          input: { cmd: 'run-canary-test' },
          output: 'benchmark ok',
          status: 'success',
        },
        { type: 'outcome', outcome: 'success', tags: ['benchmark'] },
      ];
      const sessionRecord = TrajectoryHarvester.extractFromSession('bench-session-001', sessionEvents);
      expect(sessionRecord.trackId).toBe('bench-session-001');
      expect(sessionRecord.steps.length).toBe(2);
      expect(JSON.stringify(sessionRecord)).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456');

      // -----------------------------------------------------------------------
      // Stage B: Invariant Synthesizer & Deduplicator
      // -----------------------------------------------------------------------
      const { newInvariants, duplicateCount } = ReflectiveInvariantSynthesizer.synthesizeFromQuorum(
        record.quorumReviews,
        []
      );

      expect(newInvariants.length).toBe(2);
      expect(duplicateCount).toBe(0);

      // Verify invariants conform to RFC-2119 keyword rules
      for (const inv of newInvariants) {
        expect(ReflectiveInvariantSynthesizer.isValidInvariant(inv.invariant)).toBe(true);
        expect(inv.invariant).toMatch(/\b(MUST|MUST NOT)\b/);
      }

      // Verify severity classification: security finding marked critical, correctness marked warning
      const secInv = newInvariants.find((i) => i.domain === 'security');
      const corrInv = newInvariants.find((i) => i.domain === 'correctness');
      expect(secInv).toBeDefined();
      expect(secInv?.severity).toBe('critical');
      expect(corrInv).toBeDefined();
      expect(corrInv?.severity).toBe('warning');

      // Test Invariant Deduplicator: subsequent synthesis with existing pool detects duplicate
      const deduplicationCheck = ReflectiveInvariantSynthesizer.synthesizeFromQuorum(
        record.quorumReviews,
        newInvariants.map((i) => i.invariant)
      );
      expect(deduplicationCheck.newInvariants.length).toBe(0);
      expect(deduplicationCheck.duplicateCount).toBe(2);

      // Record invariant to notebook as a warning note
      await ReflectiveInvariantSynthesizer.recordToNotebook(secInv!, {
        trackId,
        domain: 'security',
      });
      expect(dispatchedNotes.length).toBeGreaterThanOrEqual(1);
      const lastNote = dispatchedNotes[dispatchedNotes.length - 1];
      expect(lastNote.options.track_id).toBe(trackId);
      expect(lastNote.options.severity).toBe('critical');
      expect(lastNote.entry.note_type).toBe('warning');

      // -----------------------------------------------------------------------
      // Stage C: Workflow Skill Distiller - Produce candidate SKILL.md
      // -----------------------------------------------------------------------
      const distilled = WorkflowSkillDistiller.distillFromExperience(record, {
        skillName: 'schema-migration-pipeline',
        minSteps: 2,
      });

      expect(distilled).not.toBeNull();
      const skill = distilled as NonNullable<typeof distilled>;
      expect(skill.name).toBe('schema-migration-pipeline');
      expect(skill.sourceTrackId).toBe(trackId);
      expect(skill.confidenceScore).toBeGreaterThanOrEqual(0.6);

      // Verify YAML frontmatter and structured markdown sections
      expect(skill.content).toMatch(/^---\n[\s\S]+?\n---\n/);
      expect(skill.content).toContain('name: schema-migration-pipeline');
      expect(skill.content).toContain('status: incubating');
      expect(skill.content).toContain('vetting_status: pending');
      expect(skill.content).toContain(`source_track: ${trackId}`);
      expect(skill.content).toContain('## Overview');
      expect(skill.content).toContain('## When to Use');
      expect(skill.content).toContain('## Workflow & Procedure');
      expect(skill.content).toContain('## Guidelines & Invariants');
      expect(skill.content).toContain('## Verification');

      // -----------------------------------------------------------------------
      // Stage D: Staging Incubation - Stage in .agents/skills/incubating/
      // -----------------------------------------------------------------------
      const stagedFilePath = await SkillIncubationManager.stageSkill(skill, {
        projectRoot: tempSandbox,
        stagingDir,
      });

      expect(fs.existsSync(stagedFilePath)).toBe(true);
      expect(stagedFilePath).toBe(
        path.join(stagingDir, 'schema-migration-pipeline', 'SKILL.md')
      );

      // Verify strict isolation: NOT visible in active directory
      const activeCheck = path.join(activeSkillsDir, 'schema-migration-pipeline');
      expect(fs.existsSync(activeCheck)).toBe(false);

      // List incubating skills
      const incubatingList = await SkillIncubationManager.listIncubating({
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(incubatingList.length).toBe(1);
      expect(incubatingList[0].name).toBe('schema-migration-pipeline');
      expect(incubatingList[0].vettingStatus).toBe('pending');
      expect(incubatingList[0].sourceTrack).toBe(trackId);

      // Retrieve candidate
      const candidate = await SkillIncubationManager.getIncubatingSkill(
        'schema-migration-pipeline',
        { projectRoot: tempSandbox, stagingDir }
      );
      expect(candidate).not.toBeNull();
      expect(candidate?.name).toBe('schema-migration-pipeline');

      // -----------------------------------------------------------------------
      // Stage E: Automated Vetting Gate (DogmaValidator + CanaryHarness)
      // -----------------------------------------------------------------------
      // 1. Dogma validation
      const dogmaReport = SkillDogmaValidator.validate(candidate!.content);
      expect(dogmaReport.valid).toBe(true);
      expect(dogmaReport.status).toBe('passed');
      expect(dogmaReport.violations.filter((v) => v.severity === 'error')).toHaveLength(0);

      // 2. Canary evaluation in isolated sandbox
      const canaryReport = await CanaryHarness.evaluateSkill(candidate!, {
        baseDir: tempSandbox,
        timeoutMs: 15000,
      });
      expect(canaryReport.passed).toBe(true);
      expect(canaryReport.score).toBeGreaterThanOrEqual(0.8);
      expect(canaryReport.errors).toHaveLength(0);

      // 3. Update vetting status in staging storage to 'passed'
      await SkillIncubationManager.updateVettingStatus(
        'schema-migration-pipeline',
        'passed',
        { dogma: dogmaReport, canary: canaryReport },
        { projectRoot: tempSandbox, stagingDir }
      );

      const vettedCandidate = await SkillIncubationManager.getIncubatingSkill(
        'schema-migration-pipeline',
        { projectRoot: tempSandbox, stagingDir }
      );
      expect(vettedCandidate?.vettingStatus).toBe('passed');

      // -----------------------------------------------------------------------
      // Stage F: Promotion - Promote to active library & record procedure note
      // -----------------------------------------------------------------------
      const promotionResult = await SkillPromoter.promoteSkill('schema-migration-pipeline', {
        projectRoot: tempSandbox,
        stagingDir,
        scope: 'project',
      });

      expect(promotionResult.success).toBe(true);
      expect(promotionResult.scope).toBe('project');
      expect(promotionResult.skillName).toBe('schema-migration-pipeline');

      // Verify active destination exists
      const targetSkillPath = path.join(
        activeSkillsDir,
        'schema-migration-pipeline',
        'SKILL.md'
      );
      expect(fs.existsSync(targetSkillPath)).toBe(true);

      // Verify content has status: active
      const promotedContent = await fsp.readFile(targetSkillPath, 'utf8');
      expect(promotedContent).toContain('status: active');
      expect(promotedContent).toContain('promotion_scope: project');
      expect(promotedContent).toContain('promoted_at:');

      // Verify staging directory cleaned up
      const stagingCheckPath = path.join(stagingDir, 'schema-migration-pipeline');
      expect(fs.existsSync(stagingCheckPath)).toBe(false);

      // Verify NoteWriter procedure note recorded
      const procedureNotes = dispatchedNotes.filter(
        (n) => n.entry.note_type === 'procedure'
      );
      expect(procedureNotes.length).toBeGreaterThanOrEqual(1);
      const lastProcNote = procedureNotes[procedureNotes.length - 1];
      expect(lastProcNote.options.track_id).toBe(trackId);
      expect(lastProcNote.options.domain).toBe('learning');
      expect(lastProcNote.entry.content).toContain('[LEARN] Promoted skill schema-migration-pipeline');
    });
  });

  describe('Promotion Invariant Guardrails & Security Gates', () => {
    it('strictly refuses promotion when candidate vetting status is pending or rejected', async () => {
      // Stage candidate with explicit pending status
      await SkillIncubationManager.stageSkill(
        {
          name: 'unvetted-candidate-skill',
          description: 'Candidate skill not yet vetted',
          sourceTrack: 'track_guardrails_001',
          confidenceScore: 0.85,
          body: '# unvetted-candidate-skill\n\n## Overview\nTest overview\n',
          learningMetadata: {
            vetting_status: 'pending',
          },
        },
        { projectRoot: tempSandbox, stagingDir }
      );

      // Attempt promotion
      const result = await SkillPromoter.promoteSkill('unvetted-candidate-skill', {
        projectRoot: tempSandbox,
        stagingDir,
        scope: 'project',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invariant requires status "passed"/i);

      // Verify destination does NOT exist
      const activeFile = path.join(activeSkillsDir, 'unvetted-candidate-skill', 'SKILL.md');
      expect(fs.existsSync(activeFile)).toBe(false);
    });

    it('rejects candidate containing prohibited destructive shell patterns', async () => {
      const dangerousSkillContent = `---
name: dangerous-cleanup-skill
description: Clean temporary artifacts
superconductor_learning:
  status: incubating
  source_track: track_sec_002
  confidence_score: 0.9
  vetting_status: pending
---

# dangerous-cleanup-skill

## Overview
Cleans build files.

## Workflow & Procedure
1. Execute cleanup command: \`rm -rf / --no-preserve-root\`
2. Reinstall dependencies.
`;
      const report = SkillDogmaValidator.validate(dangerousSkillContent);
      expect(report.valid).toBe(false);
      expect(report.status).toBe('rejected');
      expect(report.violations.some((v) => v.rule === 'prohibited-shell-pattern')).toBe(true);
    });

    it('blocks directory traversal attempts in skill names', async () => {
      await expect(
        SkillIncubationManager.stageSkill(
          {
            name: '../../evil-skill',
            description: 'Malicious directory traversal',
          },
          { projectRoot: tempSandbox, stagingDir }
        )
      ).rejects.toThrow(/path traversal/i);

      const promoResult = await SkillPromoter.promoteSkill('../escape-skill', {
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(promoResult.success).toBe(false);
      expect(promoResult.error).toMatch(/prohibited path traversal/i);
    });

    it('allows promotion to global scope when requested', async () => {
      // Stage and pre-vet skill
      await SkillIncubationManager.stageSkill(
        {
          name: 'global-utility-skill',
          description: 'Global utility workflow',
          sourceTrack: 'track_global_001',
          confidenceScore: 0.95,
          body: `# global-utility-skill\n\n## Overview\nGlobal tool\n`,
          learningMetadata: {
            vetting_status: 'passed',
          },
        },
        { projectRoot: tempSandbox, stagingDir }
      );

      const result = await SkillPromoter.promoteSkill('global-utility-skill', {
        projectRoot: tempSandbox,
        stagingDir,
        globalSkillsDir,
        scope: 'global',
      });

      expect(result.success).toBe(true);
      expect(result.scope).toBe('global');
      const globalSkillFile = path.join(globalSkillsDir, 'global-utility-skill', 'SKILL.md');
      expect(fs.existsSync(globalSkillFile)).toBe(true);
    });
  });

  describe('CLI Verification (/superconductor:learn)', () => {
    beforeEach(async () => {
      // Stage test skills for CLI subcommands
      await SkillIncubationManager.stageSkill(
        {
          name: 'cli-candidate-alpha',
          description: 'Alpha candidate workflow',
          sourceTrack: 'track_alpha_cli',
          confidenceScore: 0.92,
          body: `# cli-candidate-alpha\n\n## Overview\nAlpha overview\n\n## Workflow & Procedure\n1. Run step alpha.\n\n## Verification\n1. Check alpha.\n`,
          learningMetadata: {
            vetting_status: 'passed',
          },
        },
        { projectRoot: tempSandbox, stagingDir }
      );

      await SkillIncubationManager.stageSkill(
        {
          name: 'cli-candidate-beta',
          description: 'Beta candidate workflow',
          sourceTrack: 'track_beta_cli',
          confidenceScore: 0.74,
          body: `# cli-candidate-beta\n\n## Overview\nBeta overview\n`,
          learningMetadata: {
            vetting_status: 'pending',
          },
        },
        { projectRoot: tempSandbox, stagingDir }
      );
    });

    it('exercises --list and --list --json subcommands', async () => {
      // Human-readable list
      const code1 = await learnCommand(['--list'], {
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(code1).toBe(0);
      const textOutput = getLogOutput();
      expect(textOutput).toContain('cli-candidate-alpha');
      expect(textOutput).toContain('passed');
      expect(textOutput).toContain('0.92');
      expect(textOutput).toContain('cli-candidate-beta');
      expect(textOutput).toContain('pending');
      expect(textOutput).toContain('0.74');

      consoleLogSpy.mockClear();

      // JSON list
      const code2 = await learnCommand(['--list', '--json'], {
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(code2).toBe(0);
      const jsonRaw = consoleLogSpy.mock.calls[0][0];
      const parsedList = JSON.parse(jsonRaw);
      expect(Array.isArray(parsedList)).toBe(true);
      expect(parsedList.length).toBe(2);
      expect(parsedList.some((s: any) => s.name === 'cli-candidate-alpha' && s.vettingStatus === 'passed')).toBe(true);
    });

    it('exercises --inspect and --inspect --json subcommands', async () => {
      // Human-readable inspect
      const code1 = await learnCommand(['--inspect', 'cli-candidate-alpha'], {
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(code1).toBe(0);
      const inspectText = getLogOutput();
      expect(inspectText).toContain('cli-candidate-alpha');
      expect(inspectText).toContain('Vetting Status: passed');
      expect(inspectText).toContain('0.92');

      consoleLogSpy.mockClear();

      // JSON inspect
      const code2 = await learnCommand(['--inspect', 'cli-candidate-alpha', '--json'], {
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(code2).toBe(0);
      const jsonRaw = consoleLogSpy.mock.calls[0][0];
      const parsedInspect = JSON.parse(jsonRaw);
      expect(parsedInspect.name).toBe('cli-candidate-alpha');
      expect(parsedInspect.vettingStatus).toBe('passed');
      expect(parsedInspect.confidenceScore).toBe(0.92);
      expect(parsedInspect.content).toContain('cli-candidate-alpha');
    });

    it('exercises --promote subcommand via CLI end-to-end', async () => {
      // Promote vetted skill
      const code = await learnCommand(['--promote', 'cli-candidate-alpha'], {
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(code).toBe(0);
      const promoteText = getLogOutput();
      expect(promoteText).toContain('Promoted skill "cli-candidate-alpha" to project scope');

      // Verify active destination file exists
      const targetActive = path.join(activeSkillsDir, 'cli-candidate-alpha', 'SKILL.md');
      expect(fs.existsSync(targetActive)).toBe(true);

      // Verify removed from staging
      const stagingCheck = path.join(stagingDir, 'cli-candidate-alpha');
      expect(fs.existsSync(stagingCheck)).toBe(false);

      // Verify procedure note recorded via NoteWriter
      expect(dispatchedNotes.some((n) => n.entry.content.includes('cli-candidate-alpha'))).toBe(true);
    });

    it('exercises --discard subcommand via CLI', async () => {
      const code = await learnCommand(['--discard', 'cli-candidate-beta', '--json'], {
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(code).toBe(0);
      const jsonRaw = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonRaw);
      expect(parsed.success).toBe(true);
      expect(parsed.action).toBe('discard');

      // Verify discarded from staging
      const checkPath = path.join(stagingDir, 'cli-candidate-beta');
      expect(fs.existsSync(checkPath)).toBe(false);
    });

    it('exercises --harvest subcommand via CLI against a track', async () => {
      const harvestTrackId = 'cli_harvest_track_003';
      const harvestTrackDir = path.join(tracksDir, harvestTrackId);
      await fsp.mkdir(harvestTrackDir, { recursive: true });

      const planContent = `# Plan: CLI Harvest Track
- [x] Task: Execute first step
- [x] Task: Execute second step
`;
      await fsp.writeFile(path.join(harvestTrackDir, 'plan.md'), planContent, 'utf8');

      const metaContent = JSON.stringify({
        trackId: harvestTrackId,
        goal: 'CLI automated harvest test',
        outcome: 'success',
      });
      await fsp.writeFile(path.join(harvestTrackDir, 'metadata.json'), metaContent, 'utf8');

      consoleLogSpy.mockClear();

      const code = await learnCommand(['--harvest', '--track', harvestTrackId, '--json'], {
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(code).toBe(0);
      const jsonRaw = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonRaw);
      expect(parsed.success).toBe(true);
      expect(parsed.harvested).toBe(true);
      expect(parsed.distilled).toBe(true);
      expect(parsed.skill).toBeDefined();

      // Check that newly distilled skill was staged into incubation
      const incubating = await SkillIncubationManager.listIncubating({
        projectRoot: tempSandbox,
        stagingDir,
      });
      expect(incubating.some((s) => s.sourceTrack === harvestTrackId)).toBe(true);
    });
  });
});
