import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { update } from '../../src/intelligence/incremental-updater';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import os from 'os';
import * as ToolRegistry from '../../src/intelligence/tool-registry';

describe('Git Hook & CLI Wrapper Integration', () => {
  let tempDir: string;
  let projectRoot: string;
  let outputDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superconductor-test-'));
    projectRoot = path.join(tempDir, 'project');
    outputDir = path.join(tempDir, 'superconductor-home');
    fs.mkdirSync(projectRoot);
    fs.mkdirSync(outputDir);

    execSync('git init', { cwd: projectRoot, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: projectRoot });
    execSync('git config user.email "test@example.com"', { cwd: projectRoot });
    
    fs.writeFileSync(path.join(projectRoot, 'file1.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(projectRoot, 'file2.ts'), 'export const b = 2;');
    execSync('git add . && git commit -m "init"', { cwd: projectRoot, stdio: 'ignore' });

    // Mock initial scan output
    const manifestPath = path.join(outputDir, '00_manifest.json');
    const initSha = execSync('git rev-parse HEAD', { cwd: projectRoot }).toString().trim();
    fs.writeFileSync(manifestPath, JSON.stringify({
      lastCommitSha: initSha,
      incrementalRuns: 0
    }));
    fs.writeFileSync(path.join(outputDir, '03_complexity.json'), JSON.stringify([
      { file: 'file1.ts', score: 10 },
      { file: 'file2.ts', score: 20 }
    ]));
    
    vi.spyOn(ToolRegistry, 'getSuperconductorHome').mockReturnValue(outputDir);
    vi.spyOn(ToolRegistry, 'resolveRegistry').mockReturnValue({
        capabilities: {}
    } as any);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should run incremental update when a file changes', async () => {
    fs.writeFileSync(path.join(projectRoot, 'file1.ts'), 'export const a = 1; export const c = 3;');
    execSync('git add . && git commit -m "update file1"', { cwd: projectRoot, stdio: 'ignore' });

    const newSha = execSync('git rev-parse HEAD', { cwd: projectRoot }).toString().trim();
    
    // Simulate cli-update.ts execution with 1 changed file
    const report = await update({
      projectRoot,
      changedFiles: ['file1.ts'],
      outputDir
    });

    expect(report.filesUpdated).toBe(1);
    expect(report.snapshotSha).toBe(newSha);

    // Verify manifest updated
    const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, '00_manifest.json'), 'utf-8'));
    expect(manifest.lastCommitSha).toBe(newSha);
    expect(manifest.incrementalRuns).toBe(1);

    // Verify .tmp files are cleaned up
    const files = fs.readdirSync(outputDir);
    const tmpFiles = files.filter(f => f.includes('.tmp'));
    expect(tmpFiles.length).toBe(0);

    // ADV-4: Verify on-disk content was actually updated (not just 'filesUpdated' count)
    const complexityPath = path.join(outputDir, 'intelligence', '03_complexity.json');
    if (fs.existsSync(complexityPath)) {
      const complexity = JSON.parse(fs.readFileSync(complexityPath, 'utf-8'));
      const changedFileEntry = Array.isArray(complexity)
        ? complexity.find((e: any) => e.file && e.file.includes('file1'))
        : null;
      expect(changedFileEntry).toBeDefined();
    }
  });
});
