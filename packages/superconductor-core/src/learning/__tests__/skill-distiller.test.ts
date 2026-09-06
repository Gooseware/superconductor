import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import {
  WorkflowSkillDistiller,
  DistilledSkill,
  DistillationOptions,
} from '../skill-distiller.js';
import {
  SkillTemplateGenerator,
  generateSkillMarkdown,
  SkillTemplateData,
} from '../templates.js';
import { ExperienceRecord, ExecutionStep, QuorumFeedback } from '../types.js';

function assertDefined<T>(val: T | null | undefined): asserts val is T {
  expect(val).toBeDefined();
  expect(val).not.toBeNull();
  if (val === null || val === undefined) {
    throw new Error('Value must be defined');
  }
}

describe('WorkflowSkillDistiller & SkillTemplateGenerator', () => {
  const sampleSuccessRecord: ExperienceRecord = {
    id: 'exp-101',
    trackId: 'docker_fastmcp_integration_20260906',
    timestamp: 1725642000000,
    goal: 'Implement Docker FastMCP Integration',
    tags: ['docker', 'fastmcp', 'mcp'],
    outcome: 'success',
    steps: [
      {
        stepIndex: 1,
        tool: 'write_to_file',
        input: { TargetFile: '/app/docker-compose.yml', toolSummary: 'Write Docker compose config' },
        output: { success: true },
        status: 'success',
      },
      {
        stepIndex: 2,
        tool: 'run_command',
        input: { CommandLine: 'docker compose up -d', toolSummary: 'Launch containers' },
        output: { exitCode: 0 },
        status: 'success',
      },
      {
        stepIndex: 3,
        tool: 'run_command',
        input: { CommandLine: 'npm test -- --run', toolSummary: 'Run test suite' },
        output: { exitCode: 0 },
        status: 'success',
      },
    ],
    quorumReviews: [
      {
        reviewerRole: 'security-reviewer',
        verdict: 'RESOLVED',
        findings: [],
      },
      {
        reviewerRole: 'correctness-reviewer',
        verdict: 'RESOLVED',
        findings: [],
      },
    ],
  };

  describe('Invariant: YAML frontmatter with name and description', () => {
    it('produces valid SKILL.md document with parseable YAML frontmatter containing name and description', () => {
      const distilled = WorkflowSkillDistiller.distillFromExperience(sampleSuccessRecord);
      assertDefined(distilled);

      expect(distilled.name).toBe('docker-fastmcp-integration');
      expect(distilled.sourceTrackId).toBe('docker_fastmcp_integration_20260906');
      expect(typeof distilled.description).toBe('string');
      expect(distilled.description.length).toBeGreaterThan(0);

      // Invariant check: Document MUST have valid YAML frontmatter with name & description
      const content = distilled.content;
      expect(content.startsWith('---')).toBe(true);

      const parts = content.split(/^---$/m);
      expect(parts.length).toBeGreaterThanOrEqual(3);

      const rawYaml = parts[1];
      const parsed = yaml.load(rawYaml) as Record<string, any>;

      expect(parsed).toBeDefined();
      expect(parsed.name).toBe('docker-fastmcp-integration');
      expect(parsed.description).toBeDefined();
      expect(typeof parsed.description).toBe('string');
      expect(parsed.description.length).toBeGreaterThan(0);

      // Verify superconductor_learning metadata schema
      expect(parsed.superconductor_learning).toBeDefined();
      expect(parsed.superconductor_learning.status).toBe('incubating');
      expect(parsed.superconductor_learning.source_track).toBe('docker_fastmcp_integration_20260906');
      expect(parsed.superconductor_learning.vetting_status).toBe('pending');
      expect(typeof parsed.superconductor_learning.confidence_score).toBe('number');
      expect(typeof parsed.superconductor_learning.harvest_timestamp).toBe('string');
    });

    it('handles special characters and colons in descriptions without corrupting YAML syntax', () => {
      const customRecord: ExperienceRecord = {
        ...sampleSuccessRecord,
        goal: 'Fix: handle "special" characters & colons: in descriptions [critical]',
      };

      const distilled = WorkflowSkillDistiller.distillFromExperience(customRecord);
      assertDefined(distilled);

      const parts = distilled.content.split(/^---$/m);
      const parsed = yaml.load(parts[1]) as Record<string, any>;
      expect(parsed.description).toContain('special');
      expect(parsed.description).toContain('colons:');
    });
  });

  describe('Standard Markdown Sections', () => {
    it('formats all required sections: Title, Overview, When to Use, Workflow & Procedure, Guidelines & Invariants, Verification', () => {
      const distilled = WorkflowSkillDistiller.distillFromExperience(sampleSuccessRecord);
      assertDefined(distilled);
      const content = distilled.content;

      // Top-level skill heading
      expect(content).toMatch(/^# /m);
      expect(content).toContain(`# ${distilled.name}`);

      // All standard section headings
      expect(content).toContain('## Overview');
      expect(content).toContain('## When to Use');
      expect(content).toContain('## Workflow & Procedure');
      expect(content).toContain('## Guidelines & Invariants');
      expect(content).toContain('## Verification');
    });

    it('populates Workflow & Procedure from execution steps', () => {
      const distilled = WorkflowSkillDistiller.distillFromExperience(sampleSuccessRecord);
      assertDefined(distilled);
      const content = distilled.content;

      expect(content).toContain('write_to_file');
      expect(content).toContain('docker compose up -d');
      expect(content).toContain('docker-compose.yml');
    });

    it('populates Guidelines & Invariants from quorum feedback or repository dogma', () => {
      const recordWithFindings: ExperienceRecord = {
        ...sampleSuccessRecord,
        quorumReviews: [
          {
            reviewerRole: 'security-reviewer',
            verdict: 'RESOLVED',
            findings: ['MUST NOT expose raw docker socket to unprivileged containers'],
          },
        ],
      };

      const distilled = WorkflowSkillDistiller.distillFromExperience(recordWithFindings);
      assertDefined(distilled);
      const content = distilled.content;

      expect(content).toContain('MUST NOT expose raw docker socket');
    });

    it('populates Verification from test execution steps when available', () => {
      const distilled = WorkflowSkillDistiller.distillFromExperience(sampleSuccessRecord);
      assertDefined(distilled);
      const content = distilled.content;

      expect(content).toContain('npm test -- --run');
    });
  });

  describe('Discarding trivial or failed experience traces', () => {
    it('discards records with outcome === "failure" by default', () => {
      const failedRecord: ExperienceRecord = {
        ...sampleSuccessRecord,
        outcome: 'failure',
      };

      const result = WorkflowSkillDistiller.distillFromExperience(failedRecord);
      expect(result).toBeNull();
    });

    it('allows failed records when allowFailure or allowFailed option is enabled', () => {
      const failedRecord: ExperienceRecord = {
        ...sampleSuccessRecord,
        outcome: 'failure',
      };

      const result1 = WorkflowSkillDistiller.distillFromExperience(failedRecord, { allowFailure: true });
      expect(result1).not.toBeNull();

      const result2 = WorkflowSkillDistiller.distillFromExperience(failedRecord, { allowFailed: true });
      expect(result2).not.toBeNull();
    });

    it('discards trivial records with < 2 steps by default', () => {
      const emptyStepsRecord: ExperienceRecord = {
        ...sampleSuccessRecord,
        steps: [],
      };
      expect(WorkflowSkillDistiller.distillFromExperience(emptyStepsRecord)).toBeNull();

      const singleStepRecord: ExperienceRecord = {
        ...sampleSuccessRecord,
        steps: [sampleSuccessRecord.steps[0]],
      };
      expect(WorkflowSkillDistiller.distillFromExperience(singleStepRecord)).toBeNull();
    });

    it('allows trivial records when allowTrivial or minSteps option is specified', () => {
      const singleStepRecord: ExperienceRecord = {
        ...sampleSuccessRecord,
        steps: [sampleSuccessRecord.steps[0]],
      };

      const resultTrivial = WorkflowSkillDistiller.distillFromExperience(singleStepRecord, { allowTrivial: true });
      expect(resultTrivial).not.toBeNull();

      const resultMinSteps = WorkflowSkillDistiller.distillFromExperience(singleStepRecord, { minSteps: 1 });
      expect(resultMinSteps).not.toBeNull();
    });

    it('discards records below minConfidence threshold', () => {
      const result = WorkflowSkillDistiller.distillFromExperience(sampleSuccessRecord, { minConfidence: 0.99 });
      // If sample record confidence is around 0.85-0.95, threshold 0.99 will discard it
      expect(result).toBeNull();
    });

    it('returns null gracefully for invalid or empty input records', () => {
      expect(WorkflowSkillDistiller.distillFromExperience(null as any)).toBeNull();
      expect(WorkflowSkillDistiller.distillFromExperience(undefined as any)).toBeNull();
    });
  });

  describe('Formulating kebab-case skill names', () => {
    it('formulates kebab-case name from goal', () => {
      const record1: ExperienceRecord = {
        ...sampleSuccessRecord,
        goal: 'Service worker cache sync',
      };
      const result1 = WorkflowSkillDistiller.distillFromExperience(record1);
      expect(result1?.name).toBe('service-worker-cache-sync');

      const record2: ExperienceRecord = {
        ...sampleSuccessRecord,
        goal: 'Docker FastMCP Integration',
      };
      const result2 = WorkflowSkillDistiller.distillFromExperience(record2);
      expect(result2?.name).toBe('docker-fastmcp-integration');
    });

    it('strips common task prefixes like "Task: Implement ..."', () => {
      const record: ExperienceRecord = {
        ...sampleSuccessRecord,
        goal: 'Task: Implement service-worker-cache-sync',
      };
      const result = WorkflowSkillDistiller.distillFromExperience(record);
      expect(result?.name).toBe('service-worker-cache-sync');
    });

    it('falls back to trackId when goal is missing or generic', () => {
      const record: ExperienceRecord = {
        ...sampleSuccessRecord,
        goal: '',
        trackId: 'docker_fastmcp_integration_20260906',
      };
      const result = WorkflowSkillDistiller.distillFromExperience(record);
      expect(result?.name).toBe('docker-fastmcp-integration');
    });

    it('honors explicit skillName option', () => {
      const result = WorkflowSkillDistiller.distillFromExperience(sampleSuccessRecord, {
        skillName: 'custom-orchestration-workflow',
      });
      expect(result?.name).toBe('custom-orchestration-workflow');
    });
  });

  describe('Confidence Score Heuristics', () => {
    it('computes confidence score between 0.0 and 1.0', () => {
      const score = WorkflowSkillDistiller.computeConfidenceScore(sampleSuccessRecord);
      expect(score).toBeGreaterThanOrEqual(0.0);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('assigns higher confidence to records with successful quorum and multiple steps', () => {
      const cleanRecordScore = WorkflowSkillDistiller.computeConfidenceScore(sampleSuccessRecord);

      const flawedRecord: ExperienceRecord = {
        ...sampleSuccessRecord,
        steps: [
          sampleSuccessRecord.steps[0],
          {
            stepIndex: 2,
            tool: 'run_command',
            input: {},
            output: {},
            status: 'error',
          },
        ],
        quorumReviews: [
          {
            reviewerRole: 'correctness-reviewer',
            verdict: 'NEEDS_FIXES',
            findings: ['Logic error in parameter handling'],
          },
        ],
      };

      const flawedRecordScore = WorkflowSkillDistiller.computeConfidenceScore(flawedRecord);
      expect(cleanRecordScore).toBeGreaterThan(flawedRecordScore);
    });

    it('assigns lower confidence to failed outcomes even when allowed via options', () => {
      const failedRecord: ExperienceRecord = {
        ...sampleSuccessRecord,
        outcome: 'failure',
      };

      const failedScore = WorkflowSkillDistiller.computeConfidenceScore(failedRecord);
      const successScore = WorkflowSkillDistiller.computeConfidenceScore(sampleSuccessRecord);

      expect(failedScore).toBeLessThan(successScore);
      expect(failedScore).toBeLessThan(0.5);
    });
  });

  describe('SkillTemplateGenerator standalone usage', () => {
    it('generates markdown matching SkillTemplateData specifications', () => {
      const data: SkillTemplateData = {
        name: 'test-custom-skill',
        description: 'A custom standalone skill template test.',
        sourceTrackId: 'test_track_1',
        harvestTimestamp: '2026-09-06T12:00:00.000Z',
        confidenceScore: 0.92,
        title: 'Test Custom Skill',
        overview: 'Custom overview content.',
        whenToUse: ['Condition 1', 'Condition 2'],
        workflowProcedure: ['Step 1: Do A', 'Step 2: Do B'],
        guidelinesInvariants: ['Must obey rule X'],
        verification: ['Run verification Y'],
      };

      const markdown = SkillTemplateGenerator.render(data);

      expect(markdown).toContain('name: test-custom-skill');
      expect(markdown).toContain('confidence_score: 0.92');
      expect(markdown).toContain('# Test Custom Skill');
      expect(markdown).toContain('## Overview');
      expect(markdown).toContain('Custom overview content.');
      expect(markdown).toContain('## When to Use');
      expect(markdown).toContain('Condition 1');
      expect(markdown).toContain('## Workflow & Procedure');
      expect(markdown).toContain('Step 1: Do A');
      expect(markdown).toContain('## Guidelines & Invariants');
      expect(markdown).toContain('Must obey rule X');
      expect(markdown).toContain('## Verification');
      expect(markdown).toContain('Run verification Y');

      // Check helper export
      const markdown2 = generateSkillMarkdown(data);
      expect(markdown2).toBe(markdown);
    });
  });
});
