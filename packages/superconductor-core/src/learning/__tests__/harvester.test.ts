import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { TrajectoryHarvester } from '../harvester.js';
import { ExperienceRecord, ExecutionStep, QuorumFeedback } from '../types.js';

describe('TrajectoryHarvester', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harvester-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('harvestTrack', () => {
    it('returns null if the track directory does not exist', async () => {
      const nonexistentPath = path.join(tempDir, 'nonexistent_track_path');
      const result = await TrajectoryHarvester.harvestTrack(nonexistentPath);
      expect(result).toBeNull();
    });

    it('parses track directory artifacts (spec.md, plan.md, metadata.json, quorum-state.json) into ExperienceRecord', async () => {
      const trackPath = path.join(tempDir, 'track_test_1');
      await fs.mkdir(trackPath, { recursive: true });

      const specContent = `# Spec: Autonomous Task Planner

**Track ID:** \`autonomous_task_planner_20260906\`
**Type:** Feature
**Status:** Approved

## Overview
Build an autonomous task planning engine that decomposes high-level goals into DAG tasks.
`;
      await fs.writeFile(path.join(trackPath, 'spec.md'), specContent, 'utf8');

      const planContent = `# Plan: Autonomous Task Planner

- [x] Task: Implement TaskGraph data structure
- [x] Task: Add cycle detection
- [ ] Task: Integrate with task-store
`;
      await fs.writeFile(path.join(trackPath, 'plan.md'), planContent, 'utf8');

      const metadataContent = JSON.stringify({
        trackId: 'autonomous_task_planner_20260906',
        goal: 'Build an autonomous task planning engine',
        outcome: 'success',
        tags: ['planning', 'dag', 'core'],
        customData: 'arbitrary-metadata',
      });
      await fs.writeFile(path.join(trackPath, 'metadata.json'), metadataContent, 'utf8');

      const quorumStateContent = JSON.stringify({
        reviews: [
          {
            reviewerRole: 'security-reviewer',
            verdict: 'RESOLVED',
            findings: [],
          },
          {
            reviewerRole: 'correctness-reviewer',
            verdict: 'NEEDS_FIXES',
            findings: ['Cycle detection must handle self-referencing loops'],
          },
        ],
      });
      await fs.writeFile(path.join(trackPath, 'quorum-state.json'), quorumStateContent, 'utf8');

      const record = await TrajectoryHarvester.harvestTrack(trackPath);

      expect(record).not.toBeNull();
      expect(record?.trackId).toBe('autonomous_task_planner_20260906');
      expect(record?.goal).toContain('autonomous task planning');
      expect(record?.outcome).toBe('success');
      expect(record?.tags).toContain('planning');
      expect(record?.tags).toContain('dag');
      expect(record?.quorumReviews).toHaveLength(2);
      expect(record?.quorumReviews[0]).toEqual({
        reviewerRole: 'security-reviewer',
        verdict: 'RESOLVED',
        findings: [],
      });
      expect(record?.quorumReviews[1]).toEqual({
        reviewerRole: 'correctness-reviewer',
        verdict: 'NEEDS_FIXES',
        findings: ['Cycle detection must handle self-referencing loops'],
      });

      // Steps parsed from plan.md tasks
      expect(record?.steps.length).toBeGreaterThanOrEqual(3);
      expect(record?.steps[0].tool).toBe('plan_task');
      expect(record?.steps[0].input).toContain('TaskGraph');
      expect(record?.steps[0].status).toBe('success');
    });

    it('extracts trackId from directory name if not found in spec.md or plan.md', async () => {
      const trackFolder = path.join(tempDir, 'custom_inferred_track_id');
      await fs.mkdir(trackFolder, { recursive: true });

      await fs.writeFile(path.join(trackFolder, 'spec.md'), '# Simple Title\nSome content.', 'utf8');
      await fs.writeFile(path.join(trackFolder, 'plan.md'), '# Simple Plan\n- [x] Simple step', 'utf8');

      const record = await TrajectoryHarvester.harvestTrack(trackFolder);

      expect(record).not.toBeNull();
      expect(record?.trackId).toBe('custom_inferred_track_id');
      expect(record?.goal).toContain('Simple Title');
    });

    it('infers outcome as failure if quorum reviews contain NEEDS_FIXES and no metadata outcome is provided', async () => {
      const trackPath = path.join(tempDir, 'failing_track');
      await fs.mkdir(trackPath, { recursive: true });

      await fs.writeFile(path.join(trackPath, 'spec.md'), '# Spec: Failing Track\n**Track ID:** `failing_track`', 'utf8');
      await fs.writeFile(path.join(trackPath, 'plan.md'), '- [ ] Task: Incomplete task', 'utf8');
      await fs.writeFile(path.join(trackPath, 'quorum-state.json'), JSON.stringify({
        reviews: [
          {
            reviewerRole: 'adversarial-reviewer',
            verdict: 'NEEDS_FIXES',
            findings: ['Test coverage below threshold'],
          },
        ],
      }), 'utf8');

      const record = await TrajectoryHarvester.harvestTrack(trackPath);

      expect(record).not.toBeNull();
      expect(record?.outcome).toBe('failure');
      expect(record?.quorumReviews[0].verdict).toBe('NEEDS_FIXES');
    });

    it('sanitizes sensitive data during harvest by default (API keys, passwords, tokens)', async () => {
      const trackPath = path.join(tempDir, 'sensitive_track');
      await fs.mkdir(trackPath, { recursive: true });

      const specContent = `# Spec: Secure Track
**Track ID:** \`sensitive_track\`
Using API key sk-proj-1234567890abcdefghijklmnopqrstuvwxyz and password: SuperSecretAdminPassword! in tests.
`;
      await fs.writeFile(path.join(trackPath, 'spec.md'), specContent, 'utf8');

      const planContent = `# Plan: Secure Track
- [x] Task: Connect with token dfp_secureToken123456789 to DeerFlow
`;
      await fs.writeFile(path.join(trackPath, 'plan.md'), planContent, 'utf8');

      const quorumContent = JSON.stringify({
        reviews: [
          {
            reviewerRole: 'security-reviewer',
            verdict: 'RESOLVED',
            findings: ['Checked Bearer mySecretTokenValue123 header handling'],
          },
        ],
      });
      await fs.writeFile(path.join(trackPath, 'quorum-state.json'), quorumContent, 'utf8');

      const record = await TrajectoryHarvester.harvestTrack(trackPath);

      expect(record).not.toBeNull();
      // Verify sensitive tokens redacted
      expect(record?.goal).not.toContain('sk-proj-1234567890');
      expect(record?.goal).not.toContain('SuperSecretAdminPassword!');
      expect(record?.goal).toContain('[REDACTED]');

      expect(JSON.stringify(record?.steps)).not.toContain('dfp_secureToken123456789');
      expect(JSON.stringify(record?.steps)).toContain('[REDACTED]');

      expect(record?.quorumReviews[0].findings[0]).not.toContain('mySecretTokenValue123');
      expect(record?.quorumReviews[0].findings[0]).toContain('[REDACTED]');
    });

    it('preserves raw tokens when redactSensitive is explicitly set to false', async () => {
      const trackPath = path.join(tempDir, 'raw_track');
      await fs.mkdir(trackPath, { recursive: true });

      const specContent = `# Spec: Raw Track\n**Track ID:** \`raw_track\`\nKey sk-plainkey1234567890`;
      await fs.writeFile(path.join(trackPath, 'spec.md'), specContent, 'utf8');
      await fs.writeFile(path.join(trackPath, 'plan.md'), '- [x] Task: Test step', 'utf8');

      const record = await TrajectoryHarvester.harvestTrack(trackPath, { redactSensitive: false });

      expect(record).not.toBeNull();
      expect(record?.goal).toContain('sk-plainkey1234567890');
    });

    it('respects maxSteps option to limit number of harvested steps', async () => {
      const trackPath = path.join(tempDir, 'many_steps_track');
      await fs.mkdir(trackPath, { recursive: true });

      await fs.writeFile(path.join(trackPath, 'spec.md'), '# Spec: Many Steps\n**Track ID:** `many_steps`', 'utf8');

      let plan = '# Plan\n';
      for (let i = 0; i < 20; i++) {
        plan += `- [x] Task: Step number ${i + 1}\n`;
      }
      await fs.writeFile(path.join(trackPath, 'plan.md'), plan, 'utf8');

      const record = await TrajectoryHarvester.harvestTrack(trackPath, { maxSteps: 5 });

      expect(record).not.toBeNull();
      expect(record?.steps).toHaveLength(5);
    });
  });

  describe('extractFromSession', () => {
    it('extracts ExperienceRecord from simulated event array', () => {
      const sessionId = 'session-xyz-123';
      const events = [
        {
          type: 'goal',
          goal: 'Implement user authentication with JWT',
        },
        {
          stepIndex: 0,
          tool: 'run_command',
          input: { CommandLine: 'npm install jsonwebtoken' },
          output: 'added 1 package in 0.5s',
          status: 'success',
          durationMs: 520,
        },
        {
          stepIndex: 1,
          tool: 'write_to_file',
          input: { TargetFile: 'auth.ts' },
          output: 'Created file auth.ts',
          status: 'success',
          durationMs: 140,
        },
        {
          type: 'quorum_feedback',
          reviewerRole: 'security-reviewer',
          verdict: 'RESOLVED',
          findings: [],
        },
        {
          type: 'outcome',
          outcome: 'success',
          tags: ['auth', 'jwt', 'security'],
        },
      ];

      const record = TrajectoryHarvester.extractFromSession(sessionId, events);

      expect(record.id).toBeDefined();
      expect(record.trackId).toBe(sessionId);
      expect(record.goal).toBe('Implement user authentication with JWT');
      expect(record.outcome).toBe('success');
      expect(record.tags).toEqual(['auth', 'jwt', 'security']);
      expect(record.steps).toHaveLength(2);
      expect(record.steps[0]).toEqual({
        stepIndex: 0,
        tool: 'run_command',
        input: { CommandLine: 'npm install jsonwebtoken' },
        output: 'added 1 package in 0.5s',
        status: 'success',
        durationMs: 520,
      });
      expect(record.quorumReviews).toHaveLength(1);
      expect(record.quorumReviews[0].reviewerRole).toBe('security-reviewer');
      expect(record.quorumReviews[0].verdict).toBe('RESOLVED');
    });

    it('sanitizes sensitive data in session events by default', () => {
      const sessionId = 'session-secrets';
      const events = [
        {
          stepIndex: 0,
          tool: 'run_command',
          input: { CommandLine: 'export OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyz' },
          output: 'password: PlainSecretPassword123!',
          status: 'success',
        },
      ];

      const record = TrajectoryHarvester.extractFromSession(sessionId, events);

      expect(record.steps[0].input).toEqual({
        CommandLine: 'export OPENAI_API_KEY=[REDACTED]',
      });
      expect(record.steps[0].output).toBe('password: [REDACTED]');
    });

    it('handles alternative event schema formats (e.g. tool_call, toolName, args, result)', () => {
      const sessionId = 'session-alt-schema';
      const events = [
        {
          type: 'tool_call',
          name: 'grep_search',
          args: { Query: 'search-term', SearchPath: '/src' },
          result: 'found 2 matches',
          status: 'success',
        },
        {
          toolName: 'view_file',
          parameters: { AbsolutePath: '/src/file.ts' },
          response: 'file content',
          status: 'success',
        },
      ];

      const record = TrajectoryHarvester.extractFromSession(sessionId, events);

      expect(record.steps).toHaveLength(2);
      expect(record.steps[0].tool).toBe('grep_search');
      expect(record.steps[0].stepIndex).toBe(0);
      expect(record.steps[1].tool).toBe('view_file');
      expect(record.steps[1].stepIndex).toBe(1);
    });

    it('truncates steps when maxSteps option is provided in extractFromSession', () => {
      const sessionId = 'session-max-steps';
      const events = Array.from({ length: 15 }, (_, i) => ({
        tool: 'test_tool',
        input: { i },
        output: { result: i },
        status: 'success',
      }));

      const record = TrajectoryHarvester.extractFromSession(sessionId, events, { maxSteps: 3 });

      expect(record.steps).toHaveLength(3);
      expect(record.steps[2].stepIndex).toBe(2);
    });
  });

  describe('saveRecord', () => {
    it('writes JSON record to disk and creates directories if missing', async () => {
      const record: ExperienceRecord = {
        id: 'rec-123',
        trackId: 'test_track',
        timestamp: 1725624000000,
        goal: 'Verify saveRecord',
        steps: [
          {
            stepIndex: 0,
            tool: 'echo',
            input: 'hello',
            output: 'world',
            status: 'success',
          },
        ],
        quorumReviews: [],
        outcome: 'success',
        tags: ['test'],
      };

      const storageDir = path.join(tempDir, 'nested', 'learning', 'trajectories');
      const savedPath = await TrajectoryHarvester.saveRecord(record, storageDir);

      expect(savedPath).toBe(path.join(storageDir, 'test_track-1725624000000.json'));

      const fileContent = await fs.readFile(savedPath, 'utf8');
      const parsed = JSON.parse(fileContent);

      expect(parsed.id).toBe('rec-123');
      expect(parsed.trackId).toBe('test_track');
      expect(parsed.steps[0].tool).toBe('echo');
    });

    it('defaults to .superconductor/learning/trajectories/<trackId>-<timestamp>.json when no storageDir is provided', async () => {
      const record: ExperienceRecord = {
        id: 'rec-default',
        trackId: 'default_track',
        timestamp: 1725624999999,
        goal: 'Default storage test',
        steps: [],
        quorumReviews: [],
        outcome: 'success',
        tags: [],
      };

      const savedPath = await TrajectoryHarvester.saveRecord(record);

      expect(savedPath).toContain('.superconductor/learning/trajectories/default_track-1725624999999.json');
      const exists = await fs.stat(savedPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Clean up the created test file from the default location
      await fs.rm(savedPath, { force: true });
    });

    it('executes asynchronously without blocking execution loop', async () => {
      const record: ExperienceRecord = {
        id: 'rec-async',
        trackId: 'async_track',
        timestamp: Date.now(),
        goal: 'Async test',
        steps: [],
        quorumReviews: [],
        outcome: 'success',
        tags: [],
      };

      const savePromise = TrajectoryHarvester.saveRecord(record, tempDir);
      expect(savePromise).toBeInstanceOf(Promise);
      const savedPath = await savePromise;
      expect(savedPath).toBeDefined();
    });

    it('sanitizes unsafe characters in trackId when generating file name', async () => {
      const record: ExperienceRecord = {
        id: 'rec-unsafe',
        trackId: 'track/with/slashes:and*stars',
        timestamp: 1725624000111,
        goal: 'Safe filename test',
        steps: [],
        quorumReviews: [],
        outcome: 'success',
        tags: [],
      };

      const savedPath = await TrajectoryHarvester.saveRecord(record, tempDir);
      expect(path.basename(savedPath)).toBe('track_with_slashes_and_stars-1725624000111.json');
      const content = await fs.readFile(savedPath, 'utf8');
      expect(JSON.parse(content).trackId).toBe('track/with/slashes:and*stars');
    });
  });

  describe('Edge cases and resilience', () => {
    it('handles malformed metadata.json and quorum-state.json gracefully without crashing', async () => {
      const trackPath = path.join(tempDir, 'malformed_track');
      await fs.mkdir(trackPath, { recursive: true });

      await fs.writeFile(path.join(trackPath, 'spec.md'), '# Spec: Resilient\n**Track ID:** `resilient_track`', 'utf8');
      await fs.writeFile(path.join(trackPath, 'plan.md'), '- [x] Step 1', 'utf8');
      await fs.writeFile(path.join(trackPath, 'metadata.json'), '{ not valid json', 'utf8');
      await fs.writeFile(path.join(trackPath, 'quorum-state.json'), '{ also not json', 'utf8');

      const record = await TrajectoryHarvester.harvestTrack(trackPath);

      expect(record).not.toBeNull();
      expect(record?.trackId).toBe('resilient_track');
      expect(record?.steps).toHaveLength(1);
      expect(record?.quorumReviews).toHaveLength(0);
    });

    it('loads quorum reviews from nested quorum/state.json', async () => {
      const trackPath = path.join(tempDir, 'nested_quorum_track');
      const quorumDir = path.join(trackPath, 'quorum');
      await fs.mkdir(quorumDir, { recursive: true });

      await fs.writeFile(path.join(trackPath, 'spec.md'), '# Spec: Nested Quorum', 'utf8');
      await fs.writeFile(path.join(quorumDir, 'state.json'), JSON.stringify({
        reviews: [
          {
            reviewer: 'regression-reviewer',
            verdict: 'APPROVED',
            findings: [{ message: 'No regressions observed' }],
          },
        ],
      }), 'utf8');

      const record = await TrajectoryHarvester.harvestTrack(trackPath);

      expect(record).not.toBeNull();
      expect(record?.quorumReviews).toHaveLength(1);
      expect(record?.quorumReviews[0].reviewerRole).toBe('regression-reviewer');
      expect(record?.quorumReviews[0].verdict).toBe('RESOLVED');
      expect(record?.quorumReviews[0].findings[0]).toBe('No regressions observed');
    });

    it('handles error status and error objects in session events', () => {
      const sessionId = 'session-errors';
      const events = [
        {
          tool: 'bash',
          input: 'exit 1',
          error: new Error('Process exited with code 1'),
          status: 'error',
        },
      ];

      const record = TrajectoryHarvester.extractFromSession(sessionId, events);

      expect(record.steps[0].status).toBe('error');
    });

    it('handles null, undefined, or empty events array in extractFromSession', () => {
      const record1 = TrajectoryHarvester.extractFromSession('empty-session', []);
      expect(record1.trackId).toBe('empty-session');
      expect(record1.steps).toHaveLength(0);

      const record2 = TrajectoryHarvester.extractFromSession('null-session', null as any);
      expect(record2.trackId).toBe('null-session');
      expect(record2.steps).toHaveLength(0);
    });
  });
});
