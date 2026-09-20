import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as pipelineModule from './pipeline.js';
import * as updaterModule from './incremental-updater.js';
import * as projectRootModule from './utils/resolve-project-root.js';
import { runCliUpdate, main } from './cli-update.js';

describe('cli-update', () => {
  let tempDir: string;
  let fakeProjectRoot: string;
  let expectedOutputDir: string;
  let stderrOutput: string[];
  let stderrSpy: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-cli-update-test-'));
    fakeProjectRoot = path.join(tempDir, 'repo');
    expectedOutputDir = path.join(fakeProjectRoot, 'superconductor', 'intelligence');
    fs.mkdirSync(fakeProjectRoot, { recursive: true });

    stderrOutput = [];
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stderrOutput.push(chunk.toString());
      return true;
    });

    vi.spyOn(projectRootModule, 'resolveProjectRoot').mockReturnValue(fakeProjectRoot);
    vi.spyOn(pipelineModule, 'runPipeline').mockResolvedValue(undefined);
    vi.spyOn(updaterModule, 'update').mockResolvedValue({
      phasesRun: ['p3_complexity'],
      filesUpdated: 1,
      durationMs: 42,
      snapshotSha: 'deadbeef12345678',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Empty arguments (full scan fallback)', () => {
    it('triggers full scan via runPipeline([], projectRoot, outputDir) when no args provided', async () => {
      await runCliUpdate([]);

      expect(projectRootModule.resolveProjectRoot).toHaveBeenCalled();
      expect(pipelineModule.runPipeline).toHaveBeenCalledTimes(1);
      expect(pipelineModule.runPipeline).toHaveBeenCalledWith([], fakeProjectRoot, expectedOutputDir);
      expect(updaterModule.update).not.toHaveBeenCalled();
    });

    it('main() is an alias for runCliUpdate and triggers full scan on empty args', async () => {
      await main([]);

      expect(pipelineModule.runPipeline).toHaveBeenCalledWith([], fakeProjectRoot, expectedOutputDir);
      expect(updaterModule.update).not.toHaveBeenCalled();
    });
  });

  describe('Active directory surfacing', () => {
    it('emits active directory surfacing lines before indexing on full scan', async () => {
      await runCliUpdate([]);

      const combinedStderr = stderrOutput.join('');
      expect(combinedStderr).toContain(`[superconductor:intelligence] Indexing Project: ${fakeProjectRoot}\n`);
      expect(combinedStderr).toContain(`[superconductor:intelligence] Output Directory: ${expectedOutputDir}\n`);

      // Verify directory surfacing comes before any pipeline operations
      const indexingIndex = combinedStderr.indexOf(`[superconductor:intelligence] Indexing Project: ${fakeProjectRoot}`);
      const outputDirIndex = combinedStderr.indexOf(`[superconductor:intelligence] Output Directory: ${expectedOutputDir}`);
      expect(indexingIndex).toBeGreaterThanOrEqual(0);
      expect(outputDirIndex).toBeGreaterThan(indexingIndex);
    });

    it('emits active directory surfacing lines before indexing on incremental update', async () => {
      const changedFile = path.join(fakeProjectRoot, 'src', 'index.ts');
      fs.mkdirSync(path.dirname(changedFile), { recursive: true });
      fs.writeFileSync(changedFile, 'console.log("hello");');

      await runCliUpdate(['src/index.ts']);

      const combinedStderr = stderrOutput.join('');
      expect(combinedStderr).toContain(`[superconductor:intelligence] Indexing Project: ${fakeProjectRoot}\n`);
      expect(combinedStderr).toContain(`[superconductor:intelligence] Output Directory: ${expectedOutputDir}\n`);
      expect(updaterModule.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('--full flag handling', () => {
    it('triggers full scan when --full flag is provided with no other args', async () => {
      await runCliUpdate(['--full']);

      expect(pipelineModule.runPipeline).toHaveBeenCalledTimes(1);
      expect(pipelineModule.runPipeline).toHaveBeenCalledWith([], fakeProjectRoot, expectedOutputDir);
      expect(updaterModule.update).not.toHaveBeenCalled();
    });

    it('triggers full scan when --full flag is provided even if file args are present', async () => {
      await runCliUpdate(['--full', 'src/index.ts', 'src/utils.ts']);

      expect(pipelineModule.runPipeline).toHaveBeenCalledTimes(1);
      expect(pipelineModule.runPipeline).toHaveBeenCalledWith([], fakeProjectRoot, expectedOutputDir);
      expect(updaterModule.update).not.toHaveBeenCalled();
    });
  });

  describe('--changed-files flag handling', () => {
    it('triggers incremental update when --changed-files provides file paths', async () => {
      const file1 = path.join(fakeProjectRoot, 'src', 'a.ts');
      const file2 = path.join(fakeProjectRoot, 'src', 'b.ts');
      fs.mkdirSync(path.dirname(file1), { recursive: true });
      fs.writeFileSync(file1, '');
      fs.writeFileSync(file2, '');

      await runCliUpdate(['--changed-files', 'src/a.ts', 'src/b.ts']);

      expect(pipelineModule.runPipeline).not.toHaveBeenCalled();
      expect(updaterModule.update).toHaveBeenCalledTimes(1);
      expect(updaterModule.update).toHaveBeenCalledWith({
        projectRoot: fakeProjectRoot,
        changedFiles: ['src/a.ts', 'src/b.ts'],
        outputDir: expectedOutputDir,
      });
    });

    it('supports comma-separated --changed-files=file1,file2 format', async () => {
      await runCliUpdate(['--changed-files=src/a.ts,src/b.ts']);

      expect(updaterModule.update).toHaveBeenCalledWith({
        projectRoot: fakeProjectRoot,
        changedFiles: ['src/a.ts', 'src/b.ts'],
        outputDir: expectedOutputDir,
      });
    });

    it('falls back to full scan when --changed-files is provided with no files', async () => {
      await runCliUpdate(['--changed-files']);

      expect(pipelineModule.runPipeline).toHaveBeenCalledWith([], fakeProjectRoot, expectedOutputDir);
      expect(updaterModule.update).not.toHaveBeenCalled();
    });
  });

  describe('Subfolder commits safety', () => {
    it('resolves outputDir at git root and never writes packages/.../superconductor/intelligence when called from subfolder', async () => {
      const subfolder = path.join(fakeProjectRoot, 'packages', 'superconductor-core');
      fs.mkdirSync(subfolder, { recursive: true });

      // Simulate resolveProjectRoot returning fakeProjectRoot even when cwd is subfolder
      vi.spyOn(projectRootModule, 'resolveProjectRoot').mockImplementation((fromDir?: string) => {
        return fakeProjectRoot;
      });

      await runCliUpdate([], { cwd: subfolder });

      expect(pipelineModule.runPipeline).toHaveBeenCalledWith(
        [],
        fakeProjectRoot,
        path.join(fakeProjectRoot, 'superconductor', 'intelligence')
      );

      // Verify it NEVER used subfolder as outputDir prefix
      const outputDirArg = vi.mocked(pipelineModule.runPipeline).mock.calls[0][2];
      expect(outputDirArg).not.toContain('packages/superconductor-core/superconductor/intelligence');
      expect(outputDirArg).toBe(expectedOutputDir);
    });
  });

  describe('Path traversal prevention', () => {
    it('filters out files outside projectRoot and does not call update if no safe files remain', async () => {
      await runCliUpdate(['../../etc/passwd', '/etc/shadow']);

      expect(updaterModule.update).not.toHaveBeenCalled();
      expect(pipelineModule.runPipeline).not.toHaveBeenCalled();
    });

    it('only processes files within projectRoot when mixed with traversal paths', async () => {
      await runCliUpdate(['src/legit.ts', '../../etc/passwd']);

      expect(updaterModule.update).toHaveBeenCalledTimes(1);
      expect(updaterModule.update).toHaveBeenCalledWith({
        projectRoot: fakeProjectRoot,
        changedFiles: ['src/legit.ts'],
        outputDir: expectedOutputDir,
      });
    });
  });

  describe('Report logging', () => {
    it('writes report JSON to stderr when update succeeds', async () => {
      await runCliUpdate(['src/foo.ts']);

      const combinedStderr = stderrOutput.join('');
      expect(combinedStderr).toContain('[superconductor:intelligence] {"phasesRun":["p3_complexity"],"filesUpdated":1,"durationMs":42,"snapshotSha":"deadbeef12345678"}');
    });
  });

  describe('Default process.argv consumption', () => {
    let originalArgv: string[];

    beforeEach(() => {
      originalArgv = process.argv;
    });

    afterEach(() => {
      process.argv = originalArgv;
    });

    it('reads from process.argv when no arguments are passed to runCliUpdate()', async () => {
      process.argv = ['node', 'cli-update.js'];
      await runCliUpdate();

      expect(pipelineModule.runPipeline).toHaveBeenCalledWith([], fakeProjectRoot, expectedOutputDir);
    });

    it('reads files from process.argv when arguments exist', async () => {
      process.argv = ['node', 'cli-update.js', 'src/from-argv.ts'];
      await runCliUpdate();

      expect(updaterModule.update).toHaveBeenCalledWith({
        projectRoot: fakeProjectRoot,
        changedFiles: ['src/from-argv.ts'],
        outputDir: expectedOutputDir,
      });
    });

    it('reads --full from process.argv', async () => {
      process.argv = ['node', 'cli-update.js', '--full'];
      await runCliUpdate();

      expect(pipelineModule.runPipeline).toHaveBeenCalledWith([], fakeProjectRoot, expectedOutputDir);
    });
  });

  describe('Error propagation', () => {
    it('propagates error when pipeline fails so caller can handle or catch', async () => {
      vi.spyOn(pipelineModule, 'runPipeline').mockRejectedValueOnce(new Error('Pipeline exploded'));

      await expect(runCliUpdate([])).rejects.toThrow('Pipeline exploded');
    });

    it('propagates error when updater fails', async () => {
      vi.spyOn(updaterModule, 'update').mockRejectedValueOnce(new Error('Updater exploded'));

      await expect(runCliUpdate(['src/a.ts'])).rejects.toThrow('Updater exploded');
    });
  });
});

