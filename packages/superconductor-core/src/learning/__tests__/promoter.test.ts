import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import { SkillPromoter } from '../promoter.js';
import { SkillIncubationManager } from '../incubation-manager.js';
import { DistilledSkill } from '../types.js';
import { NoteWriter, setNoteDispatcher, NoteEntry, NoteWriterOptions } from '../../notebook/note-writer.js';

describe('SkillPromoter', () => {
  let tempRoot: string;
  let stagingDir: string;
  let globalDir: string;
  let capturedNotes: Array<{ entry: NoteEntry; options: NoteWriterOptions }>;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-promoter-test-root-'));
    globalDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-promoter-test-global-'));
    stagingDir = path.join(tempRoot, '.agents', 'skills', 'incubating');

    capturedNotes = [];
    setNoteDispatcher(async (entry, options) => {
      capturedNotes.push({ entry, options });
      return { id: 'ack-' + entry.id };
    });
  });

  afterEach(async () => {
    setNoteDispatcher(null);
    vi.restoreAllMocks();
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
    try {
      await fs.rm(globalDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const createCleanCandidateSkill = (name: string, overrides?: Partial<DistilledSkill>): DistilledSkill => ({
    name,
    description: `A fully vetted skill named ${name}`,
    sourceTrack: 'track_test_123',
    confidenceScore: 0.92,
    body: `# ${name}

## Overview
Compliant procedure documentation.

## Workflow & Procedure
1. Step 1: Run inspection with \`view_file\`.
2. Step 2: Validate results with \`run_command\`.

## Verification
1. Run \`npm test\` to confirm operation.
`,
    ...overrides,
  });

  describe('Invariant Gate: Vetting Status Check', () => {
    it('MUST refuse promotion if vetting gate status is "rejected"', async () => {
      const skill = createCleanCandidateSkill('rejected-skill', {
        learningMetadata: {
          status: 'incubating',
          vetting_status: 'rejected',
        },
      });

      await SkillIncubationManager.stageSkill(skill, { projectRoot: tempRoot, stagingDir });

      const result = await SkillPromoter.promoteSkill('rejected-skill', {
        projectRoot: tempRoot,
        stagingDir,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Vetting gate status is rejected');
      expect(result.error).toContain('vetting status is "rejected"');

      // Candidate directory must NOT be removed from incubation
      const stagedSkill = await SkillIncubationManager.getIncubatingSkill('rejected-skill', {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(stagedSkill).not.toBeNull();

      // Active skill directory must NOT be created
      const activeSkillPath = path.join(tempRoot, '.agents', 'skills', 'rejected-skill', 'SKILL.md');
      let exists = true;
      try {
        await fs.stat(activeSkillPath);
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);

      // NoteWriter must NOT be called
      expect(capturedNotes).toHaveLength(0);
    });

    it('MUST refuse promotion if vetting gate status is "flagged" without allowWarnings', async () => {
      const skill = createCleanCandidateSkill('flagged-skill', {
        learningMetadata: {
          status: 'incubating',
          vetting_status: 'flagged',
        },
      });

      await SkillIncubationManager.stageSkill(skill, { projectRoot: tempRoot, stagingDir });

      const result = await SkillPromoter.promoteSkill('flagged-skill', {
        projectRoot: tempRoot,
        stagingDir,
        allowWarnings: false,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Vetting gate status is flagged');
      expect(result.error).toContain('vetting status is "flagged"');

      // Active skill path must not exist
      const activeSkillPath = path.join(tempRoot, '.agents', 'skills', 'flagged-skill', 'SKILL.md');
      let exists = true;
      try {
        await fs.stat(activeSkillPath);
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);
      expect(capturedNotes).toHaveLength(0);
    });

    it('allows promotion if vetting gate status is "flagged" when allowWarnings is true', async () => {
      const skill = createCleanCandidateSkill('flagged-allowed-skill', {
        learningMetadata: {
          status: 'incubating',
          vetting_status: 'flagged',
        },
      });

      await SkillIncubationManager.stageSkill(skill, { projectRoot: tempRoot, stagingDir });

      const result = await SkillPromoter.promoteSkill('flagged-allowed-skill', {
        projectRoot: tempRoot,
        stagingDir,
        allowWarnings: true,
      });

      expect(result.success).toBe(true);
      expect(result.destinationPath).toBe(
        path.join(tempRoot, '.agents', 'skills', 'flagged-allowed-skill', 'SKILL.md')
      );
    });

    it('automatically evaluates pending candidate and refuses promotion if dogma checks fail', async () => {
      // Candidate with dangerous shell command and pending status
      const skill: DistilledSkill = {
        name: 'dangerous-candidate',
        description: 'Contains dangerous destructive shell command',
        sourceTrack: 'track_sec_01',
        learningMetadata: {
          status: 'incubating',
          vetting_status: 'pending',
        },
        body: `# Dangerous Candidate
## Overview
Bad command.
## Workflow & Procedure
\`\`\`bash
rm -rf /
\`\`\`
## Verification
Done.
`,
      };

      await SkillIncubationManager.stageSkill(skill, { projectRoot: tempRoot, stagingDir });

      const result = await SkillPromoter.promoteSkill('dangerous-candidate', {
        projectRoot: tempRoot,
        stagingDir,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Vetting gate status is rejected');

      // Staging still exists
      const staged = await SkillIncubationManager.getIncubatingSkill('dangerous-candidate', {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(staged).not.toBeNull();
      // Vetting status in staging should now be updated to rejected
      expect(staged?.vettingStatus).toBe('rejected');
    });

    it('automatically evaluates pending candidate and promotes if clean', async () => {
      const skill = createCleanCandidateSkill('clean-pending-skill', {
        learningMetadata: {
          status: 'incubating',
          vetting_status: 'pending',
        },
      });

      await SkillIncubationManager.stageSkill(skill, { projectRoot: tempRoot, stagingDir });

      const result = await SkillPromoter.promoteSkill('clean-pending-skill', {
        projectRoot: tempRoot,
        stagingDir,
      });

      expect(result.success).toBe(true);
      expect(result.destinationPath).toBe(
        path.join(tempRoot, '.agents', 'skills', 'clean-pending-skill', 'SKILL.md')
      );
    });

    it('returns failure if candidate skill is not found in incubation', async () => {
      const result = await SkillPromoter.promoteSkill('non-existent-skill', {
        projectRoot: tempRoot,
        stagingDir,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/not found in incubation staging/i);
    });
  });

  describe('Scope Migration: Project Scope (Default)', () => {
    it('migrates vetted skill to .agents/skills/<skillName>/SKILL.md', async () => {
      const skill = createCleanCandidateSkill('project-scoped-skill', {
        learningMetadata: {
          status: 'incubating',
          vetting_status: 'passed',
        },
      });

      const stagedFile = await SkillIncubationManager.stageSkill(skill, {
        projectRoot: tempRoot,
        stagingDir,
      });

      // Add a supplementary script file in staging directory to verify multi-file transfer
      const scriptDir = path.join(path.dirname(stagedFile), 'scripts');
      await fs.mkdir(scriptDir, { recursive: true });
      await fs.writeFile(path.join(scriptDir, 'helper.sh'), '#!/bin/bash\necho helper\n', 'utf8');

      const result = await SkillPromoter.promoteSkill('project-scoped-skill', {
        projectRoot: tempRoot,
        stagingDir,
        scope: 'project',
      });

      expect(result.success).toBe(true);
      expect(result.scope).toBe('project');
      expect(result.skillName).toBe('project-scoped-skill');

      const expectedDest = path.join(
        tempRoot,
        '.agents',
        'skills',
        'project-scoped-skill',
        'SKILL.md'
      );
      expect(result.destinationPath).toBe(expectedDest);
      expect(result.targetPath).toBe(expectedDest);

      // Verify active SKILL.md file exists
      const fileStat = await fs.stat(expectedDest);
      expect(fileStat.isFile()).toBe(true);

      // Verify supplementary script file was also copied
      const copiedScript = path.join(
        tempRoot,
        '.agents',
        'skills',
        'project-scoped-skill',
        'scripts',
        'helper.sh'
      );
      const scriptStat = await fs.stat(copiedScript);
      expect(scriptStat.isFile()).toBe(true);

      // Verify incubating directory was removed
      const incubatingPath = path.join(stagingDir, 'project-scoped-skill');
      let incubatingExists = true;
      try {
        await fs.stat(incubatingPath);
      } catch {
        incubatingExists = false;
      }
      expect(incubatingExists).toBe(false);
    });

    it('defaults to project scope when scope option is omitted', async () => {
      const skill = createCleanCandidateSkill('default-scope-skill', {
        learningMetadata: {
          status: 'incubating',
          vetting_status: 'passed',
        },
      });

      await SkillIncubationManager.stageSkill(skill, { projectRoot: tempRoot, stagingDir });

      const result = await SkillPromoter.promoteSkill('default-scope-skill', {
        projectRoot: tempRoot,
        stagingDir,
      });

      expect(result.success).toBe(true);
      expect(result.scope).toBe('project');
      expect(result.destinationPath).toBe(
        path.join(tempRoot, '.agents', 'skills', 'default-scope-skill', 'SKILL.md')
      );
    });
  });

  describe('Scope Migration: Global Scope', () => {
    it('migrates vetted skill to global extension directory', async () => {
      const skill = createCleanCandidateSkill('global-scoped-skill', {
        learningMetadata: {
          status: 'incubating',
          vetting_status: 'passed',
        },
      });

      await SkillIncubationManager.stageSkill(skill, { projectRoot: tempRoot, stagingDir });

      const result = await SkillPromoter.promoteSkill('global-scoped-skill', {
        projectRoot: tempRoot,
        stagingDir,
        scope: 'global',
        globalDir,
      });

      expect(result.success).toBe(true);
      expect(result.scope).toBe('global');
      expect(result.skillName).toBe('global-scoped-skill');

      const expectedDest = path.join(globalDir, 'global-scoped-skill', 'SKILL.md');
      expect(result.destinationPath).toBe(expectedDest);
      expect(result.targetPath).toBe(expectedDest);

      const fileStat = await fs.stat(expectedDest);
      expect(fileStat.isFile()).toBe(true);

      // Incubating staging folder must be removed
      const staged = await SkillIncubationManager.getIncubatingSkill('global-scoped-skill', {
        projectRoot: tempRoot,
        stagingDir,
      });
      expect(staged).toBeNull();
    });
  });

  describe('Frontmatter & Metadata Updates', () => {
    it('updates frontmatter to superconductor_learning.status = "active" and adds promoted_at timestamp', async () => {
      const beforeTime = new Date().toISOString();

      const skill = createCleanCandidateSkill('metadata-test-skill', {
        sourceTrack: 'track_meta_456',
        confidenceScore: 0.88,
        learningMetadata: {
          status: 'incubating',
          vetting_status: 'passed',
        },
      });

      await SkillIncubationManager.stageSkill(skill, { projectRoot: tempRoot, stagingDir });

      const result = await SkillPromoter.promoteSkill('metadata-test-skill', {
        projectRoot: tempRoot,
        stagingDir,
      });

      expect(result.success).toBe(true);

      const content = await fs.readFile(result.destinationPath!, 'utf8');
      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      expect(match).not.toBeNull();

      const frontmatter = yaml.load(match![1]) as Record<string, any>;
      const body = match![2];

      expect(frontmatter.name).toBe('metadata-test-skill');
      expect(frontmatter.description).toMatch(/metadata-test-skill/);

      const learning = frontmatter.superconductor_learning;
      expect(learning).toBeDefined();
      expect(learning.status).toBe('active');
      expect(learning.promoted_at).toBeDefined();
      expect(new Date(learning.promoted_at).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTime).getTime() - 1000
      );
      expect(learning.source_track).toBe('track_meta_456');
      expect(learning.confidence_score).toBe(0.88);

      // Body markdown must be preserved
      expect(body).toContain('## Workflow & Procedure');
      expect(body).toContain('Run inspection with `view_file`.');
    });
  });

  describe('NoteWriter Procedure Note Instrumentation', () => {
    it('records procedure note with exact expected format and track_id', async () => {
      const skill = createCleanCandidateSkill('noted-skill', {
        sourceTrack: 'track_notes_999',
        learningMetadata: {
          status: 'incubating',
          vetting_status: 'passed',
        },
      });

      await SkillIncubationManager.stageSkill(skill, { projectRoot: tempRoot, stagingDir });

      const result = await SkillPromoter.promoteSkill('noted-skill', {
        projectRoot: tempRoot,
        stagingDir,
        scope: 'project',
      });

      expect(result.success).toBe(true);

      expect(capturedNotes).toHaveLength(1);
      const note = capturedNotes[0];
      expect(note.entry.note_type).toBe('procedure');
      expect(note.entry.content).toContain(
        '[LEARN] Promoted skill noted-skill to project scope from source track track_notes_999'
      );
      expect(note.options.track_id).toBe('track_notes_999');
    });

    it('respects trackId override from PromotionOptions in procedure note', async () => {
      const skill = createCleanCandidateSkill('override-track-skill', {
        sourceTrack: 'original_track',
        learningMetadata: {
          status: 'incubating',
          vetting_status: 'passed',
        },
      });

      await SkillIncubationManager.stageSkill(skill, { projectRoot: tempRoot, stagingDir });

      const result = await SkillPromoter.promoteSkill('override-track-skill', {
        projectRoot: tempRoot,
        stagingDir,
        scope: 'global',
        globalDir,
        trackId: 'override_track_abc',
      });

      expect(result.success).toBe(true);

      expect(capturedNotes).toHaveLength(1);
      const note = capturedNotes[0];
      expect(note.entry.content).toContain(
        '[LEARN] Promoted skill override-track-skill to global scope from source track override_track_abc'
      );
      expect(note.options.track_id).toBe('override_track_abc');
    });
  });

  describe('Security & Edge Cases', () => {
    it('rejects path traversal attempts in skillName', async () => {
      const result = await SkillPromoter.promoteSkill('../../../etc/passwd', {
        projectRoot: tempRoot,
        stagingDir,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('rejects empty or whitespace skillName', async () => {
      const result = await SkillPromoter.promoteSkill('   ', {
        projectRoot: tempRoot,
        stagingDir,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Invalid skill name');
    });
  });
});
