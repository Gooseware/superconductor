import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TrackLifecycleOrchestrator } from '../../src/orchestration/track-lifecycle-orchestrator.js';
import { SignOffGate } from '../../src/orchestration/sign-off-gate.js';
import { ArchiveManager } from '../../src/track/archive-manager.js';

const mockExecFileSync = vi.fn();
const mockExecSync = vi.fn();

vi.mock('child_process', () => ({
  execFileSync: (...args: any[]) => mockExecFileSync(...args),
  execSync: (...args: any[]) => mockExecSync(...args),
  spawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: (...args: any[]) => mockExecFileSync(...args),
  execSync: (...args: any[]) => mockExecSync(...args),
  spawn: vi.fn(),
}));

describe('TrackLifecycleOrchestrator', () => {
  let tmpDir: string;
  const trackId = 'test-pipeline-track';
  const sessionId = 'test-session-pipe';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-orchestrator-test-'));
    const scDir = path.join(tmpDir, 'superconductor');
    fs.mkdirSync(path.join(scDir, 'tracks', trackId), { recursive: true });
    fs.mkdirSync(path.join(scDir, 'quorum'), { recursive: true });

    fs.writeFileSync(
      path.join(scDir, 'tech-stack.md'),
      '# Tech Stack\n\n## Development Preferences\n- **Target Branch:** `dev`\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(scDir, 'tracks.md'),
      `# Registry\n- [x] [${trackId}](tracks/${trackId}/spec.md)\n`,
      'utf8'
    );
    fs.writeFileSync(path.join(scDir, 'archive.md'), '# Archived Tracks Registry\n\n## Index\n\n', 'utf8');
    fs.writeFileSync(path.join(scDir, 'tracks', trackId, 'spec.md'), 'spec content', 'utf8');
    fs.writeFileSync(path.join(scDir, 'tracks', trackId, 'plan.md'), 'plan content', 'utf8');

    SignOffGate.clearInMemory();
    mockExecFileSync.mockReset();
    mockExecSync.mockReset();
  });

  afterEach(() => {
    SignOffGate.clearInMemory();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Autonomous HMAC Sign-Off Gate', () => {
    it('records and verifies autonomous sign-off in headless mode', async () => {
      const record = await SignOffGate.recordAutonomousSignOff(trackId, sessionId, 'secret-key-123');
      expect(record.approved_by).toBe('user');
      expect(record.sign_key).toBeDefined();

      const approved = await SignOffGate.isApproved(trackId, sessionId);
      expect(approved).toBe(true);
    });
  });

  describe('End-to-End Headless Lifecycle State Machine', () => {
    it('executes full pipeline: Preflight -> Tasks -> Checkpoint -> Quorum -> Oracle -> Dynamic Merge -> Canonical Archival', async () => {
      mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
        if (args && args.includes('status')) return '';
        if (args && args.includes('HEAD')) return 'abc9876';
        if (args && args.includes('git-dir')) return path.join(tmpDir, '.git');
        return '';
      });

      const tasksExecuted: string[] = [];
      const orchestrator = new TrackLifecycleOrchestrator({
        trackId,
        projectRoot: tmpDir,
        sessionId,
        executionMode: 'headless',
        autoSyncIntelligence: false,
        tasks: [
          { id: 'task-1', name: 'Write unit tests' },
          { id: 'task-2', name: 'Implement feature' },
        ],
        taskExecutor: async (task) => {
          tasksExecuted.push(task.id);
          return true;
        },
        quorumReviewer: async () => ({
          status: 'RESOLVED',
          reviewers: ['sec-rev', 'corr-rev', 'adv-rev', 'reg-rev'],
          findings: [],
        }),
        oracleVerifier: async () => ({
          ready: true,
          verdict: 'READY',
          oracleConvId: 'oracle-conv-999',
        }),
      });

      const result = await orchestrator.run();

      expect(result.stage).toBe('COMPLETED');
      expect(result.preflightPassed).toBe(true);
      expect(result.tasksCompleted).toBe(2);
      expect(tasksExecuted).toEqual(['task-1', 'task-2']);
      expect(result.quorumApproved).toBe(true);
      expect(result.oracleVerdict).toBe('READY');
      expect(result.targetBranch).toBe('dev');
      expect(result.mergedCommitSha).toBe('abc9876');
      expect(result.archived).toBe(true);

      // Verify canonical archive file structure
      const canonicalPath = path.join(tmpDir, 'superconductor', 'tracks', 'archive', trackId);
      expect(fs.existsSync(canonicalPath)).toBe(true);
      expect(fs.existsSync(path.join(canonicalPath, 'spec.md'))).toBe(true);

      // Verify tracks.md and archive.md updated
      const tracksMd = fs.readFileSync(path.join(tmpDir, 'superconductor', 'tracks.md'), 'utf8');
      expect(tracksMd).not.toContain(trackId);
      const archiveMd = fs.readFileSync(path.join(tmpDir, 'superconductor', 'archive.md'), 'utf8');
      expect(archiveMd).toContain(trackId);
    });

    it('halts and sets FAILED state if Quorum Review has critical findings', async () => {
      const orchestrator = new TrackLifecycleOrchestrator({
        trackId,
        projectRoot: tmpDir,
        sessionId,
        executionMode: 'headless',
        autoSyncIntelligence: false,
        quorumReviewer: async () => ({
          status: 'NEEDS_FIXES',
          reviewers: ['sec-rev'],
          findings: [
            { severity: 'CRITICAL', description: 'SQL Injection vulnerability', domain: 'security' },
          ],
        }),
      });

      const result = await orchestrator.run();

      expect(result.stage).toBe('FAILED');
      expect(result.error).toContain('Quorum review failed with 1 critical findings');
      expect(result.mergedCommitSha).toBeUndefined();
      expect(result.archived).toBe(false);
    });

    it('halts and sets FAILED state if Oracle returns NEEDS_FIXES', async () => {
      const orchestrator = new TrackLifecycleOrchestrator({
        trackId,
        projectRoot: tmpDir,
        sessionId,
        executionMode: 'headless',
        autoSyncIntelligence: false,
        quorumReviewer: async () => ({
          status: 'RESOLVED',
          reviewers: ['sec-rev'],
          findings: [],
        }),
        oracleVerifier: async () => ({
          ready: false,
          verdict: 'NEEDS_FIXES',
        }),
      });

      const result = await orchestrator.run();

      expect(result.stage).toBe('FAILED');
      expect(result.error).toContain('Oracle verification returned verdict: NEEDS_FIXES');
      expect(result.archived).toBe(false);
    });
  });
});
