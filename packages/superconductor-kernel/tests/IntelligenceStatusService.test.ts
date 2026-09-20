import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { IntelligenceStatusService } from '../src/services/IntelligenceStatusService.js';

describe('IntelligenceStatusService', () => {
  let tempDir: string;
  let service: IntelligenceStatusService;
  let originalProjectRoot: string | undefined;

  beforeEach(() => {
    originalProjectRoot = process.env.PROJECT_ROOT;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-intel-status-test-'));
    execSync('git init', { cwd: tempDir });
    execSync('git config user.name "Test"', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });
    execSync('git commit --allow-empty -m "Initial commit"', { cwd: tempDir });
    process.env.PROJECT_ROOT = tempDir;
    service = new IntelligenceStatusService();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    process.env.PROJECT_ROOT = originalProjectRoot;
  });

  it('returns NONE when no manifest file exists', async () => {
    const result = await service.getStatus(tempDir);
    expect(result.status).toBe('NONE');
    expect(result.project_root).toBe(fs.realpathSync(tempDir));
    expect(result.manifest_project_root).toBeNull();
    expect(result.age_days).toBe(0);
    expect(result.commits_behind).toBe(0);
    expect(result.phases_ok).toBe(false);
  });

  it('returns LIVE for a valid directory with recent manifest', async () => {
    const intelDir = path.join(tempDir, 'superconductor', 'intelligence');
    fs.mkdirSync(intelDir, { recursive: true });

    const headSha = execSync('git rev-parse HEAD', { cwd: tempDir, encoding: 'utf8' }).trim();
    const recentTimestamp = Date.now();
    fs.writeFileSync(
      path.join(intelDir, '00_manifest.json'),
      JSON.stringify({
        projectRoot: fs.realpathSync(tempDir),
        timestamp: recentTimestamp,
        lastCommitSha: headSha,
        phases: {
          '01_fingerprint': 'ok',
          '02_dependency_graph': 'ok',
        },
      })
    );

    const result = await service.getStatus(tempDir);
    expect(result.status).toBe('LIVE');
    expect(result.project_root).toBe(fs.realpathSync(tempDir));
    expect(result.manifest_project_root).toBe(fs.realpathSync(tempDir));
    expect(result.snapshot_path).toBe(path.join(fs.realpathSync(tempDir), 'superconductor', 'intelligence', '00_manifest.json'));
    expect(result.head_commit).toBe(headSha);
    expect(result.age_days).toBeLessThan(1);
    expect(result.commits_behind).toBe(0);
    expect(result.phases_ok).toBe(true);
    expect(result.phases).toBeDefined();
    expect(result.phases?.['01_fingerprint']).toBe('ok');
  });

  it('does NOT throw when given an external directory outside PROJECT_ROOT', async () => {
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-intel-external-'));
    try {
      // Previously, this threw: 'outputDir must be within the workspace root'
      const result = await service.getStatus(externalDir);
      expect(result).toBeDefined();
      expect(result.status).toBe('NONE');
      expect(result.manifest_project_root).toBeNull();
    } finally {
      if (fs.existsSync(externalDir)) {
        fs.rmSync(externalDir, { recursive: true, force: true });
      }
    }
  });

  it('returns MISMATCH when manifest projectRoot does not match current PROJECT_ROOT', async () => {
    const externalRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-intel-other-'));
    try {
      const intelDir = path.join(tempDir, 'superconductor', 'intelligence');
      fs.mkdirSync(intelDir, { recursive: true });

      fs.writeFileSync(
        path.join(intelDir, '00_manifest.json'),
        JSON.stringify({
          projectRoot: externalRepo,
          timestamp: Date.now(),
          lastCommitSha: 'a1b2c3d4e5f6',
        })
      );

      const result = await service.getStatus(tempDir);
      expect(result.status).toBe('MISMATCH');
      expect(result.project_root).toBe(fs.realpathSync(tempDir));
      expect(result.manifest_project_root).toBe(externalRepo);
      expect(result.head_commit).toBe('a1b2c3d4e5f6');
    } finally {
      if (fs.existsSync(externalRepo)) {
        fs.rmSync(externalRepo, { recursive: true, force: true });
      }
    }
  });

  it('returns STALE when age >= 1 day', async () => {
    const intelDir = path.join(tempDir, 'superconductor', 'intelligence');
    fs.mkdirSync(intelDir, { recursive: true });

    const headSha = execSync('git rev-parse HEAD', { cwd: tempDir, encoding: 'utf8' }).trim();
    const oldTimestamp = Date.now() - 2 * 86400 * 1000; // 2 days ago
    fs.writeFileSync(
      path.join(intelDir, '00_manifest.json'),
      JSON.stringify({
        projectRoot: fs.realpathSync(tempDir),
        timestamp: oldTimestamp,
        lastCommitSha: headSha,
        phases: {
          '01_fingerprint': 'ok',
          '02_dependency_graph': 'degraded',
        },
      })
    );

    const result = await service.getStatus(tempDir);
    expect(result.status).toBe('STALE');
    expect(result.age_days).toBeGreaterThanOrEqual(1);
    expect(result.phases_ok).toBe(false);
  });

  it('refresh invokes synchronization and returns updated status', async () => {
    const refreshRes = await service.refresh(tempDir);
    expect(refreshRes.success).toBe(true);
    expect(refreshRes.result).toBeDefined();
    expect(typeof refreshRes.result.status).toBe('string');
    expect(['LIVE', 'STALE', 'NONE', 'MISMATCH']).toContain(refreshRes.result.status);
    expect(refreshRes.result.project_root).toBeDefined();
  }, 60000);
});
