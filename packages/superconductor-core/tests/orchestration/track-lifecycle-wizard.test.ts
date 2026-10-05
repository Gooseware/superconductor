import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  TrackLifecycleWizard,
  FinalizationOptions,
} from '../../src/orchestration/track-lifecycle-wizard.js';

describe('TrackLifecycleWizard', () => {
  let tmpDir: string;
  let tracksRegistryPath: string;
  let archiveRegistryPath: string;
  let tracksDir: string;
  let archiveDir: string;
  let mockGitExec: any;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'track-lifecycle-test-'));
    const superconductorDir = path.join(tmpDir, 'superconductor');
    tracksDir = path.join(superconductorDir, 'tracks');
    archiveDir = path.join(superconductorDir, 'tracks', 'archive');
    fs.mkdirSync(tracksDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });

    tracksRegistryPath = path.join(superconductorDir, 'tracks.md');
    archiveRegistryPath = path.join(superconductorDir, 'archive.md');

    fs.writeFileSync(
      tracksRegistryPath,
      '# Tracks Registry\n\n- [x] `test_track_1` : Sample Test Track\n- [ ] `test_track_2` : Incomplete Track\n',
      'utf8'
    );

    fs.writeFileSync(
      archiveRegistryPath,
      '# Archived Tracks Registry\n\n## Index\n\n',
      'utf8'
    );

    mockGitExec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (args.includes('HEAD') && args.includes('--abbrev-ref')) {
        return 'track/test_track_1\n';
      }
      if (args.includes('HEAD') && args.includes('--short')) {
        return 'abc1234\n';
      }
      return '';
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Prompt Generation', () => {
    it('generates prompt definition for Execution Mode (Interactive vs Headless)', () => {
      const wizard = new TrackLifecycleWizard({ projectRoot: tmpDir });
      const prompt = wizard.buildExecutionModePrompt();

      expect(prompt.type).toBe('select');
      expect(prompt.name).toBe('executionMode');
      expect(prompt.choices.length).toBe(2);

      const values = prompt.choices.map((c: any) => c.value);
      expect(values).toContain('interactive');
      expect(values).toContain('headless');
    });

    it('generates prompt definition for Target Branch with default main', () => {
      const wizard = new TrackLifecycleWizard({ projectRoot: tmpDir });
      const prompt = wizard.buildTargetBranchPrompt('main');

      expect(prompt.type).toBe('select');
      expect(prompt.name).toBe('targetBranch');
      expect(prompt.choices.length).toBeGreaterThanOrEqual(2);

      const mainChoice = prompt.choices.find((c: any) => c.value === 'main');
      expect(mainChoice).toBeDefined();
      expect(mainChoice.title).toContain('default');
    });

    it('generates prompt definition for Finalization Actions (Merge, Archive, Delete, Skip)', () => {
      const wizard = new TrackLifecycleWizard({ projectRoot: tmpDir });
      const prompt = wizard.buildFinalizationPrompt('test_track_1', 'Sample Test Track');

      expect(prompt.type).toBe('select');
      expect(prompt.name).toBe('action');

      const actions = prompt.choices.map((c: any) => c.value);
      expect(actions).toContain('merge');
      expect(actions).toContain('archive');
      expect(actions).toContain('delete');
      expect(actions).toContain('skip');
    });
  });

  describe('Track Finalization & Oracle Sign-Off Gate', () => {
    it('blocks merge when Oracle sign-off is missing', async () => {
      const wizard = new TrackLifecycleWizard({
        projectRoot: tmpDir,
        tracksRegistryPath,
        archiveRegistryPath,
        tracksDir,
        archiveDir,
        gitExecFn: mockGitExec,
      });

      const result = await wizard.finalizeTrack({
        trackId: 'test_track_1',
        action: 'merge',
        oracleSignOff: false,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Oracle sign-off required');
      expect(mockGitExec).not.toHaveBeenCalledWith('git', expect.arrayContaining(['merge']));
    });

    it('executes git merge to target branch when Oracle sign-off is approved', async () => {
      const wizard = new TrackLifecycleWizard({
        projectRoot: tmpDir,
        tracksRegistryPath,
        archiveRegistryPath,
        tracksDir,
        archiveDir,
        gitExecFn: mockGitExec,
      });

      const result = await wizard.finalizeTrack({
        trackId: 'test_track_1',
        action: 'merge',
        targetBranch: 'main',
        oracleSignOff: true,
      });

      expect(result.success).toBe(true);
      expect(result.mergedCommitSha).toBe('abc1234');
      expect(mockGitExec).toHaveBeenCalledWith('git', ['checkout', 'main']);
      expect(mockGitExec).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['merge', '--no-ff', 'track/test_track_1'])
      );
    });

    it('archives completed track to superconductor/tracks/archive/<track_id> and updates registry', async () => {
      const trackFolderPath = path.join(tracksDir, 'test_track_1');
      fs.mkdirSync(trackFolderPath, { recursive: true });
      fs.writeFileSync(path.join(trackFolderPath, 'plan.md'), '# Plan', 'utf8');

      const wizard = new TrackLifecycleWizard({
        projectRoot: tmpDir,
        tracksRegistryPath,
        archiveRegistryPath,
        tracksDir,
        archiveDir,
        gitExecFn: mockGitExec,
      });

      const result = await wizard.finalizeTrack({
        trackId: 'test_track_1',
        action: 'archive',
        oracleSignOff: true,
      });

      expect(result.success).toBe(true);
      const archivedTrackPath = path.join(archiveDir, 'test_track_1');
      expect(fs.existsSync(archivedTrackPath)).toBe(true);
      expect(fs.existsSync(trackFolderPath)).toBe(false);

      // Verify tracks.md updated
      const updatedRegistry = fs.readFileSync(tracksRegistryPath, 'utf8');
      expect(updatedRegistry).not.toContain('test_track_1');
    });

    it('handles clean deletion of track in interactive mode with confirmation', async () => {
      const trackFolderPath = path.join(tracksDir, 'test_track_1');
      fs.mkdirSync(trackFolderPath, { recursive: true });
      fs.writeFileSync(path.join(trackFolderPath, 'spec.md'), '# Spec', 'utf8');

      const mockPromptFn = vi.fn().mockResolvedValue({ confirmDelete: true });

      const wizard = new TrackLifecycleWizard({
        projectRoot: tmpDir,
        tracksRegistryPath,
        archiveRegistryPath,
        tracksDir,
        archiveDir,
        promptFn: mockPromptFn,
      });

      const result = await wizard.finalizeTrack({
        trackId: 'test_track_1',
        action: 'delete',
        executionMode: 'interactive',
        oracleSignOff: true,
      });

      expect(result.success).toBe(true);
      expect(result.deleted).toBe(true);
      expect(fs.existsSync(trackFolderPath)).toBe(false);

      const updatedRegistry = fs.readFileSync(tracksRegistryPath, 'utf8');
      expect(updatedRegistry).not.toContain('test_track_1');
      expect(mockPromptFn).toHaveBeenCalled();
    });

    it('cancels deletion in interactive mode when user denies confirmation', async () => {
      const trackFolderPath = path.join(tracksDir, 'test_track_1');
      fs.mkdirSync(trackFolderPath, { recursive: true });

      const mockPromptFn = vi.fn().mockResolvedValue({ confirmDelete: false });

      const wizard = new TrackLifecycleWizard({
        projectRoot: tmpDir,
        tracksRegistryPath,
        archiveRegistryPath,
        tracksDir,
        archiveDir,
        promptFn: mockPromptFn,
      });

      const result = await wizard.finalizeTrack({
        trackId: 'test_track_1',
        action: 'delete',
        executionMode: 'interactive',
        oracleSignOff: true,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('cancelled by user');
      expect(fs.existsSync(trackFolderPath)).toBe(true);
    });

    it('handles clean deletion in headless mode without prompt', async () => {
      const trackFolderPath = path.join(tracksDir, 'test_track_1');
      fs.mkdirSync(trackFolderPath, { recursive: true });

      const mockPromptFn = vi.fn();

      const wizard = new TrackLifecycleWizard({
        projectRoot: tmpDir,
        tracksRegistryPath,
        archiveRegistryPath,
        tracksDir,
        archiveDir,
        promptFn: mockPromptFn,
      });

      const result = await wizard.finalizeTrack({
        trackId: 'test_track_1',
        action: 'delete',
        executionMode: 'headless',
        oracleSignOff: true,
      });

      expect(result.success).toBe(true);
      expect(result.deleted).toBe(true);
      expect(fs.existsSync(trackFolderPath)).toBe(false);
      expect(mockPromptFn).not.toHaveBeenCalled();
    });

    it('handles skip action leaving track files and registry intact', async () => {
      const trackFolderPath = path.join(tracksDir, 'test_track_1');
      fs.mkdirSync(trackFolderPath, { recursive: true });

      const wizard = new TrackLifecycleWizard({
        projectRoot: tmpDir,
        tracksRegistryPath,
        archiveRegistryPath,
        tracksDir,
        archiveDir,
      });

      const result = await wizard.finalizeTrack({
        trackId: 'test_track_1',
        action: 'skip',
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(trackFolderPath)).toBe(true);
      const registry = fs.readFileSync(tracksRegistryPath, 'utf8');
      expect(registry).toContain('test_track_1');
    });
  });

  describe('Blast Radius & Upgrade Opportunity Integration', () => {
    it('generates blast radius markdown section and report for planned track', async () => {
      const wizard = new TrackLifecycleWizard({ projectRoot: tmpDir });
      const result = await wizard.generateBlastRadiusSection({
        changedFiles: ['src/core/auth.ts'],
      });

      expect(result.markdown).toContain('## Impacted Downstream & Upgrade Opportunities');
      expect(result.markdown).toContain('### PROTECTED: Downstream Consumers');
      expect(result.markdown).toContain('### UPGRADES: Upgrade Candidates');
      expect(result.markdown).toContain('src/api/routes.ts');
      expect(result.markdown).toContain('src/legacy/old-auth.ts');
      expect(result.report.summary.totalDirect).toBe(1);
      expect(result.report.summary.totalDownstream).toBe(1);
      expect(result.report.summary.totalUpgradeCandidates).toBe(1);
    });

    it('extracts upgrade candidate tasks formatted with UPGRADES: and PROTECTED: tags', async () => {
      const wizard = new TrackLifecycleWizard({ projectRoot: tmpDir });
      const result = await wizard.generateBlastRadiusSection({
        changedFiles: ['src/core/auth.ts'],
      });

      expect(result.planTasks).toBeDefined();
      expect(result.planTasks.length).toBe(1);

      const task = result.planTasks[0];
      expect(task).toContain('- [ ] Task: Upgrade src/legacy/old-auth.ts');
      expect(task).toContain('UPGRADES: src/legacy/old-auth.ts');
      expect(task).toContain('PROTECTED:');
      expect(task).toContain('src/core/auth.ts');
      expect(task).toContain('src/api/routes.ts');
      expect(task).toContain('INVARIANT_AFTER:');
    });

    it('extractUpgradePlanTasks returns empty list when no upgrade candidates found', async () => {
      const wizard = new TrackLifecycleWizard({ projectRoot: tmpDir });
      const result = await wizard.generateBlastRadiusSection({
        changedFiles: ['src/unknown/file.ts'],
      });

      expect(result.planTasks).toEqual([]);
      expect(wizard.extractUpgradePlanTasks(result.report)).toEqual([]);
    });
  });
});

